// OmniRoute batch audio transcription adapter.
import {
  transcribeOpenAiCompatibleAudio,
  type AudioTranscriptionRequest,
  type AudioTranscriptionResult,
  type MediaUnderstandingProvider,
} from "openclaw/plugin-sdk/media-understanding";
import { resolveOmniRouteBaseUrl } from "./base-url.js";
import {
  OMNIROUTE_DEFAULT_BASE_URL,
  OMNIROUTE_PROVIDER_ID,
} from "./models.js";

function requireExplicitModel(model: string | undefined): string {
  const normalized = model?.trim();
  if (!normalized) {
    throw new Error(
      "OmniRoute audio transcription requires an explicitly selected model",
    );
  }
  return normalized;
}

function resolveAudioBaseUrl(baseUrl: string | undefined): string {
  const normalized = baseUrl?.trim().replace(/\/+$/, "");
  return resolveOmniRouteBaseUrl({
    // OpenClaw may pass the public localhost default from provider config. Treat
    // that value as the plugin default so OMNIROUTE_BASE_URL still applies.
    overrideBaseUrl:
      normalized && normalized !== OMNIROUTE_DEFAULT_BASE_URL ? normalized : undefined,
  });
}

async function transcribeOmniRouteAudio(
  params: AudioTranscriptionRequest,
): Promise<AudioTranscriptionResult> {
  const model = requireExplicitModel(params.model);
  return await transcribeOpenAiCompatibleAudio({
    ...params,
    model,
    baseUrl: resolveAudioBaseUrl(params.baseUrl),
    defaultBaseUrl: OMNIROUTE_DEFAULT_BASE_URL,
    // The model is validated above; passing it as the fallback keeps the
    // OpenClaw helper's multipart behavior while preventing a synthetic model.
    defaultModel: model,
    provider: OMNIROUTE_PROVIDER_ID,
  });
}

export const omniRouteMediaUnderstandingProvider: MediaUnderstandingProvider = {
  id: OMNIROUTE_PROVIDER_ID,
  capabilities: ["audio"],
  transcribeAudio: transcribeOmniRouteAudio,
};
