// OmniRoute speech provider using the public OpenClaw speech contract.
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { normalizeResolvedSecretInputString } from "openclaw/plugin-sdk/secret-input-runtime";
import { isOmniRouteConfigured, resolveOmniRouteApiKey } from "./auth.js";
import {
  assertOmniRouteOk,
  OMNIROUTE_JSON_READ_OPTIONS,
  postOmniRouteJson,
  readOmniRouteBytes,
  resolveOmniRouteHttpRequestConfig,
} from "./http.js";
import { resolveOmniRouteBaseUrl } from "./base-url.js";
import {
  OMNIROUTE_DEFAULT_BASE_URL,
  OMNIROUTE_LABEL,
  OMNIROUTE_PROVIDER_ID,
} from "./models.js";

type SpeechProvider = Parameters<OpenClawPluginApi["registerSpeechProvider"]>[0];
type SpeechRequest = Parameters<SpeechProvider["synthesize"]>[0];

const DEFAULT_SPEECH_TIMEOUT_MS = 120_000;
const DEFAULT_VOICE = "coral";
const SUPPORTED_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "cedar",
  "coral",
  "echo",
  "fable",
  "juniper",
  "marin",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
] as const;
const SUPPORTED_RESPONSE_FORMATS = ["mp3", "opus", "wav"] as const;

type SpeechResponseFormat = (typeof SUPPORTED_RESPONSE_FORMATS)[number];

function readString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readSpeechProviderConfig(rawConfig: Record<string, unknown>): Record<string, unknown> {
  const nestedProviders = readRecord(rawConfig.providers);
  return readRecord(nestedProviders?.[OMNIROUTE_PROVIDER_ID])
    ?? readRecord(rawConfig[OMNIROUTE_PROVIDER_ID])
    ?? rawConfig;
}

function normalizeSpeechProviderConfig(rawConfig: Record<string, unknown>): Record<string, unknown> {
  const raw = readSpeechProviderConfig(rawConfig);
  const apiKey = normalizeResolvedSecretInputString({
    value: raw.apiKey,
    path: "messages.tts.providers.omniroute.apiKey",
  });
  const baseUrl = readString(raw.baseUrl);
  const model = readString(raw.model, raw.modelId);
  const voice = readString(raw.voice, raw.voiceId);
  const responseFormat = readString(raw.responseFormat, raw.response_format);
  return {
    ...raw,
    ...(apiKey ? { apiKey } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(model ? { model } : {}),
    ...(voice ? { voice } : {}),
    ...(responseFormat ? { responseFormat } : {}),
  };
}

function requireSpeechModel(req: SpeechRequest): string {
  const model = readString(
    req.providerOverrides?.model,
    req.providerOverrides?.modelId,
    req.providerConfig.model,
    req.providerConfig.modelId,
  );
  if (!model) {
    throw new Error(
      "OmniRoute speech requires an explicit model. Configure messages.tts.providers.omniroute.model with a model advertised by OmniRoute's /v1/models endpoint.",
    );
  }
  return model;
}

function resolveSpeechVoice(req: SpeechRequest): string {
  const voice = (readString(
    req.providerOverrides?.voice,
    req.providerOverrides?.voiceId,
    req.providerConfig.voice,
    req.providerConfig.voiceId,
    DEFAULT_VOICE,
  ) ?? DEFAULT_VOICE).toLowerCase();
  if (!(SUPPORTED_VOICES as readonly string[]).includes(voice)) {
    throw new Error(
      `OmniRoute speech does not support voice "${voice}"; choose one of ${SUPPORTED_VOICES.join(", ")}`,
    );
  }
  return voice;
}

function resolveSpeechResponseFormat(req: SpeechRequest): SpeechResponseFormat {
  const requested = readString(
    req.providerOverrides?.responseFormat,
    req.providerOverrides?.response_format,
    req.providerConfig.responseFormat,
    req.providerConfig.response_format,
  )?.toLowerCase() ?? (req.target === "voice-note" ? "opus" : "mp3");
  if (!(SUPPORTED_RESPONSE_FORMATS as readonly string[]).includes(requested)) {
    throw new Error(
      `OmniRoute speech does not support response format "${requested}"; choose mp3, opus, or wav`,
    );
  }
  return requested as SpeechResponseFormat;
}

function responseContentType(response: Response): string | undefined {
  const value = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  return value || undefined;
}

function isOpusOgg(bytes: Buffer): boolean {
  if (bytes.length < 36 || bytes.subarray(0, 4).toString("ascii") !== "OggS") {
    return false;
  }
  const segmentCount = bytes[26];
  if (segmentCount === undefined || bytes.length < 27 + segmentCount + 8) {
    return false;
  }
  const payloadOffset = 27 + segmentCount;
  return bytes.subarray(payloadOffset, payloadOffset + 8).toString("ascii") === "OpusHead";
}

function assertAudioResponse(bytes: Buffer, format: SpeechResponseFormat, contentType: string | undefined): void {
  const allowedContentTypes: Record<SpeechResponseFormat, readonly string[]> = {
    mp3: ["audio/mpeg", "audio/mp3"],
    opus: ["audio/opus", "audio/ogg"],
    wav: ["audio/wav", "audio/x-wav"],
  };
  if (contentType && !allowedContentTypes[format].includes(contentType)) {
    throw new Error(`OmniRoute speech response returned unexpected MIME type: ${contentType}`);
  }

  const isMp3 = bytes.length >= 3 && (
    bytes.subarray(0, 3).toString("ascii") === "ID3" ||
    (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
  );
  const isOpus = isOpusOgg(bytes);
  const isWav = bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WAVE";
  const valid = format === "mp3" ? isMp3 : format === "opus" ? isOpus : isWav;
  if (!valid) {
    throw new Error(`OmniRoute speech response bytes do not match ${format}`);
  }
}

function fileExtension(format: SpeechResponseFormat): string {
  return `.${format}`;
}

export function buildOmniRouteSpeechProvider(): SpeechProvider {
  return {
    id: OMNIROUTE_PROVIDER_ID,
    label: OMNIROUTE_LABEL,
    defaultTimeoutMs: DEFAULT_SPEECH_TIMEOUT_MS,
    voices: SUPPORTED_VOICES,
    listVoices: async () => SUPPORTED_VOICES.map((voice) => ({ id: voice, name: voice })),
    resolveConfig: ({ rawConfig }) => normalizeSpeechProviderConfig(rawConfig),
    resolveTalkOverrides: ({ params }) => {
      const overrides: Record<string, string> = {};
      const model = readString(params.modelId);
      const voice = readString(params.voiceId);
      if (model) overrides.model = model;
      if (voice) overrides.voice = voice;
      return Object.keys(overrides).length > 0 ? overrides : undefined;
    },
    isConfigured: ({ cfg, providerConfig }) => {
      const configuredSpeech = normalizeSpeechProviderConfig(providerConfig);
      return Boolean(
        readString(configuredSpeech.model, configuredSpeech.modelId) &&
          (readString(configuredSpeech.apiKey) || isOmniRouteConfigured({ cfg })),
      );
    },
    async synthesize(req) {
      if (!req.text.trim()) {
        throw new Error("OmniRoute speech requires non-empty text");
      }
      const configuredSpeech = normalizeSpeechProviderConfig(req.providerConfig);
      const configuredApiKey = readString(configuredSpeech.apiKey);
      const apiKey = configuredApiKey ?? await resolveOmniRouteApiKey({ cfg: req.cfg });
      if (!apiKey) {
        throw new Error("OmniRoute API key missing");
      }
      const model = requireSpeechModel(req);
      const voice = resolveSpeechVoice(req);
      const responseFormat = resolveSpeechResponseFormat(req);
      const providerConfig = req.cfg.models?.providers?.[OMNIROUTE_PROVIDER_ID];
      const http = resolveOmniRouteHttpRequestConfig({
        baseUrl: resolveOmniRouteBaseUrl({
          config: req.cfg,
          overrideBaseUrl: configuredSpeech.baseUrl,
        }),
        defaultBaseUrl: OMNIROUTE_DEFAULT_BASE_URL,
        request: providerConfig?.request,
        defaultHeaders: {
          Accept: "audio/mpeg, audio/ogg, audio/wav",
          Authorization: `Bearer ${apiKey}`,
        },
      });
      const request = await postOmniRouteJson({
        url: `${http.baseUrl}/audio/speech`,
        headers: http.headers,
        body: {
          model,
          input: req.text,
          voice,
          response_format: responseFormat,
        },
        timeoutMs: req.timeoutMs || DEFAULT_SPEECH_TIMEOUT_MS,
        ssrfPolicy: http.ssrfPolicy,
        dispatcherPolicy: http.dispatcherPolicy,
      });
      try {
        await assertOmniRouteOk(request.response, "OmniRoute speech failed");
        const bytes = Buffer.from(
          await readOmniRouteBytes(
            request.response,
            "omniroute.speech",
            OMNIROUTE_JSON_READ_OPTIONS.speech,
          ),
        );
        if (bytes.length === 0) {
          throw new Error("OmniRoute speech response contained no audio data");
        }
        assertAudioResponse(bytes, responseFormat, responseContentType(request.response));
        return {
          audioBuffer: bytes,
          outputFormat: responseFormat,
          fileExtension: fileExtension(responseFormat),
          voiceCompatible: req.target === "voice-note" && responseFormat === "opus",
        };
      } finally {
        await request.release();
      }
    },
  };
}
