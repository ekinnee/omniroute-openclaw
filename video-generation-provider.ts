// OmniRoute video generation provider using public SDK registration contracts.
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { isOmniRouteConfigured, resolveOmniRouteApiKey } from "./auth.js";
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

type VideoGenerationProvider = Parameters<OpenClawPluginApi["registerVideoGenerationProvider"]>[0];
type VideoGenerationRequest = Parameters<VideoGenerationProvider["generateVideo"]>[0];
type VideoGenerationResult = Awaited<ReturnType<VideoGenerationProvider["generateVideo"]>>;
type GeneratedVideoAsset = VideoGenerationResult["videos"][number];

const MAX_VIDEO_COUNT = 1;
const DEFAULT_TIMEOUT_MS = 300_000;

function requireVideoModel(model: string): string {
  const normalized = model.trim();
  if (!normalized) {
    throw new Error(
      "OmniRoute video generation requires an explicit video model. Set the video generation model to a model advertised by OmniRoute's /v1/models endpoint.",
    );
  }
  return normalized;
}

function resolveConfiguredBaseUrl(req: VideoGenerationRequest): string {
  return resolveOmniRouteBaseUrl({ config: req.cfg });
}

function resolveVideoMimeType(item: { mime_type?: unknown; format?: unknown }): string {
  if (typeof item.mime_type === "string" && item.mime_type.trim()) {
    return item.mime_type.trim();
  }
  return typeof item.format === "string" && item.format.trim().toLowerCase() === "webp"
    ? "image/webp"
    : "video/mp4";
}

function parseVideoResponse(payload: unknown): GeneratedVideoAsset[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) {
    throw new Error("OmniRoute video generation response missing video data");
  }
  return (payload as { data: unknown[] }).data.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new Error("OmniRoute video generation response malformed");
    }
    const item = entry as {
      url?: unknown;
      b64_json?: unknown;
      mime_type?: unknown;
      format?: unknown;
      file_name?: unknown;
    };
    const mimeType = resolveVideoMimeType(item);
    const fileName = typeof item.file_name === "string" && item.file_name.trim()
      ? { fileName: item.file_name }
      : {};
    if (typeof item.url === "string" && item.url.trim()) {
      return {
        url: item.url,
        mimeType,
        ...fileName,
      };
    }
    if (typeof item.b64_json !== "string" || !item.b64_json.trim()) {
      throw new Error("OmniRoute video generation response missing video data");
    }
    const buffer = Buffer.from(item.b64_json, "base64");
    if (buffer.length === 0) {
      throw new Error("OmniRoute video generation response missing video data");
    }
    return {
      buffer,
      mimeType,
      ...fileName,
    };
  });
}

export function buildOmniRouteVideoGenerationProvider(): VideoGenerationProvider {
  return {
    id: OMNIROUTE_PROVIDER_ID,
    label: OMNIROUTE_LABEL,
    capabilities: {
      generate: {
        maxVideos: MAX_VIDEO_COUNT,
        maxInputImages: 0,
        maxInputVideos: 0,
        maxInputAudios: 0,
      },
      imageToVideo: {
        enabled: false,
        maxVideos: 0,
        maxInputImages: 0,
        maxInputVideos: 0,
        maxInputAudios: 0,
      },
      videoToVideo: {
        enabled: false,
        maxVideos: 0,
        maxInputImages: 0,
        maxInputVideos: 0,
        maxInputAudios: 0,
      },
    },
    isConfigured: ({ cfg, agentDir }) => isOmniRouteConfigured({ cfg, agentDir }),
    async generateVideo(req) {
      const model = requireVideoModel(req.model);
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
      });
      const headers = new Headers(http.headers);
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      const request = await postOmniRouteJson({
        url: `${http.baseUrl}/videos/generations`,
        headers,
        body: {
          model,
          prompt: req.prompt,
          n: MAX_VIDEO_COUNT,
        },
        timeoutMs: req.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        ssrfPolicy: http.ssrfPolicy,
        dispatcherPolicy: http.dispatcherPolicy,
      });
      try {
        await assertOmniRouteOk(request.response, "OmniRoute video generation failed");
        const videos = parseVideoResponse(
          await readOmniRouteJson(
            request.response,
            "omniroute.video-generation",
            OMNIROUTE_JSON_READ_OPTIONS.videoGeneration,
          ),
        );
        if (videos.length === 0) {
          throw new Error("OmniRoute video generation response missing video data");
        }
        return { videos, model };
      } finally {
        await request.release();
      }
    },
  };
}
