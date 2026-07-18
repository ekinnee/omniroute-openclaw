// OmniRoute image generation provider registration.
import type {
  ImageGenerationProvider,
  ImageGenerationRequest,
} from "openclaw/plugin-sdk/image-generation";
import { parseOpenAiCompatibleImageResponse } from "openclaw/plugin-sdk/image-generation";
import { isProviderApiKeyConfigured } from "openclaw/plugin-sdk/provider-auth";
import { resolveApiKeyForProvider } from "openclaw/plugin-sdk/provider-auth-runtime";
import {
  assertOkOrThrowHttpError,
  postJsonRequest,
  readProviderJsonResponse,
  resolveProviderHttpRequestConfig,
  sanitizeConfiguredModelProviderRequest,
} from "openclaw/plugin-sdk/provider-http";
import {
  OMNIROUTE_DEFAULT_BASE_URL,
  OMNIROUTE_LABEL,
  OMNIROUTE_PROVIDER_ID,
} from "./models.js";

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
  const configured = req.cfg.models?.providers?.[OMNIROUTE_PROVIDER_ID]?.baseUrl;
  return typeof configured === "string" && configured.trim()
    ? configured.trim().replace(/\/+$/, "")
    : OMNIROUTE_DEFAULT_BASE_URL;
}

export function buildOmniRouteImageGenerationProvider(): ImageGenerationProvider {
  return {
    id: OMNIROUTE_PROVIDER_ID,
    label: OMNIROUTE_LABEL,
    isConfigured: ({ agentDir }) =>
      isProviderApiKeyConfigured({
        provider: OMNIROUTE_PROVIDER_ID,
        agentDir,
      }),
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

      const auth = await resolveApiKeyForProvider({
        provider: OMNIROUTE_PROVIDER_ID,
        cfg: req.cfg,
        agentDir: req.agentDir,
        store: req.authStore,
      });
      if (!auth.apiKey) {
        throw new Error("OmniRoute API key missing");
      }

      const providerConfig = req.cfg.models?.providers?.[OMNIROUTE_PROVIDER_ID];
      const { baseUrl, allowPrivateNetwork, headers, dispatcherPolicy } =
        resolveProviderHttpRequestConfig({
          baseUrl: resolveConfiguredBaseUrl(req),
          defaultBaseUrl: OMNIROUTE_DEFAULT_BASE_URL,
          request: sanitizeConfiguredModelProviderRequest(providerConfig?.request),
          defaultHeaders: {
            Authorization: `Bearer ${auth.apiKey}`,
          },
          provider: OMNIROUTE_PROVIDER_ID,
          capability: "image",
          transport: "http",
        });
      const requestHeaders = new Headers(headers);
      if (!requestHeaders.has("Content-Type")) {
        requestHeaders.set("Content-Type", "application/json");
      }

      const request = await postJsonRequest({
        url: `${baseUrl.replace(/\/+$/, "")}/images/generations`,
        headers: requestHeaders,
        body: {
          model,
          prompt: req.prompt,
          n: resolveImageCount(req.count),
          size: req.size ?? DEFAULT_IMAGE_SIZE,
          response_format: "b64_json",
        },
        timeoutMs: req.timeoutMs,
        fetchFn: fetch,
        allowPrivateNetwork,
        ssrfPolicy: req.ssrfPolicy,
        dispatcherPolicy,
      });

      const { response, release } = request;
      try {
        await assertOkOrThrowHttpError(response, "OmniRoute image generation failed");
        const payload = await readProviderJsonResponse(
          response,
          "omniroute.image-generation",
        );
        const images = parseOpenAiCompatibleImageResponse(payload, {
          malformedResponseError: "OmniRoute image generation response malformed",
          fileNamePrefix: "omniroute-image",
          sniffMimeType: true,
        });
        if (images.length === 0) {
          throw new Error("OmniRoute image generation response missing image data");
        }
        return {
          images,
          model,
        };
      } finally {
        await release();
      }
    },
  };
}
