// OmniRoute image generation provider using public SDK registration contracts.
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import {
  isOmniRouteConfigured,
  resolveOmniRouteApiKey,
} from "./auth.js";
import {
  assertOmniRouteOk,
  OMNIROUTE_JSON_READ_OPTIONS,
  postOmniRouteJson,
  readOmniRouteJson,
  resolveOmniRouteHttpRequestConfig,
} from "./http.js";
import {
  OMNIROUTE_DEFAULT_BASE_URL,
  OMNIROUTE_LABEL,
  OMNIROUTE_PROVIDER_ID,
} from "./models.js";
import { resolveOmniRouteBaseUrl } from "./base-url.js";

type ImageGenerationProvider = Parameters<OpenClawPluginApi["registerImageGenerationProvider"]>[0];
type ImageGenerationRequest = Parameters<ImageGenerationProvider["generateImage"]>[0];
type ImageGenerationResult = Awaited<ReturnType<ImageGenerationProvider["generateImage"]>>;
type GeneratedImageAsset = ImageGenerationResult["images"][number];

const DEFAULT_IMAGE_SIZE = "1024x1024";
const MAX_IMAGE_COUNT = 4;

function requireImageModel(model: string): string {
  const normalized = model.trim();
  if (!normalized) {
    throw new Error(
      "OmniRoute image generation requires an explicit image model. Set the image generation model to a model advertised by OmniRoute's /v1/models endpoint.",
    );
  }
  return normalized;
}

function resolveImageCount(count: number | undefined): number {
  if (typeof count !== "number" || !Number.isFinite(count)) {
    return 1;
  }
  return Math.max(1, Math.min(MAX_IMAGE_COUNT, Math.trunc(count)));
}

function resolveConfiguredBaseUrl(req: ImageGenerationRequest): string {
  return resolveOmniRouteBaseUrl({ config: req.cfg });
}

function sniffMimeType(buffer: Buffer): { mimeType: string; extension: string } {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { mimeType: "image/png", extension: "png" };
  }
  if (buffer.subarray(0, 2).equals(Buffer.from([255, 216]))) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  if (buffer.subarray(0, 4).toString("ascii") === "GIF8") {
    return { mimeType: "image/gif", extension: "gif" };
  }
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { mimeType: "image/webp", extension: "webp" };
  }
  return { mimeType: "image/png", extension: "png" };
}

function parseImageResponse(payload: unknown): GeneratedImageAsset[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) {
    throw new Error("OmniRoute image generation response malformed");
  }
  return (payload as { data: unknown[] }).data.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error("OmniRoute image generation response malformed");
    }
    const item = entry as { b64_json?: unknown; mime_type?: unknown; revised_prompt?: unknown };
    if (typeof item.b64_json !== "string" || !item.b64_json.trim()) {
      throw new Error("OmniRoute image generation response missing image data");
    }
    const buffer = Buffer.from(item.b64_json, "base64");
    if (buffer.length === 0) {
      throw new Error("OmniRoute image generation response missing image data");
    }
    const detected = sniffMimeType(buffer);
    const mimeType = typeof item.mime_type === "string" && item.mime_type.trim()
      ? item.mime_type.trim()
      : detected.mimeType;
    const image: GeneratedImageAsset = {
      buffer,
      mimeType,
      fileName: `omniroute-image-${index + 1}.${detected.extension}`,
    };
    if (typeof item.revised_prompt === "string" && item.revised_prompt.trim()) {
      image.revisedPrompt = item.revised_prompt;
    }
    return image;
  });
}

export function buildOmniRouteImageGenerationProvider(): ImageGenerationProvider {
  return {
    id: OMNIROUTE_PROVIDER_ID,
    label: OMNIROUTE_LABEL,
    isConfigured: ({ cfg, agentDir }) => isOmniRouteConfigured({ cfg, agentDir }),
    capabilities: {
      generate: {
        maxCount: MAX_IMAGE_COUNT,
        supportsSize: true,
        supportsAspectRatio: false,
        supportsResolution: false,
      },
      edit: {
        enabled: false,
        maxCount: 1,
        maxInputImages: 0,
        supportsSize: false,
        supportsAspectRatio: false,
        supportsResolution: false,
      },
    },
    async generateImage(req) {
      if ((req.inputImages?.length ?? 0) > 0) {
        throw new Error("OmniRoute image edits and reference images are not supported yet.");
      }
      const model = requireImageModel(req.model);
      const apiKey = await resolveOmniRouteApiKey({
        cfg: req.cfg,
        agentDir: req.agentDir,
        store: req.authStore,
      });
      if (!apiKey) {
        throw new Error("OmniRoute API key missing");
      }

      const providerConfig = req.cfg.models?.providers?.[OMNIROUTE_PROVIDER_ID];
      const http = resolveOmniRouteHttpRequestConfig({
        baseUrl: resolveConfiguredBaseUrl(req),
        defaultBaseUrl: OMNIROUTE_DEFAULT_BASE_URL,
        request: providerConfig?.request,
        defaultHeaders: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        ssrfPolicy: req.ssrfPolicy,
      });
      const headers = new Headers(http.headers);
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      const request = await postOmniRouteJson({
        url: `${http.baseUrl}/images/generations`,
        headers,
        body: {
          model,
          prompt: req.prompt,
          n: resolveImageCount(req.count),
          size: req.size ?? DEFAULT_IMAGE_SIZE,
          response_format: "b64_json",
        },
        timeoutMs: req.timeoutMs,
        ssrfPolicy: http.ssrfPolicy,
        dispatcherPolicy: http.dispatcherPolicy,
      });
      try {
        await assertOmniRouteOk(request.response, "OmniRoute image generation failed");
        const images = parseImageResponse(
          await readOmniRouteJson(
            request.response,
            "omniroute.image-generation",
            OMNIROUTE_JSON_READ_OPTIONS.imageGeneration,
          ),
        );
        if (images.length === 0) {
          throw new Error("OmniRoute image generation response missing image data");
        }
        return { images, model };
      } finally {
        await request.release();
      }
    },
  };
}
