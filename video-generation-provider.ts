// OmniRoute video generation provider using public SDK registration contracts.
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { isOmniRouteConfigured, resolveOmniRouteApiKey } from "./auth.js";
import {
  assertOmniRouteOk,
  postOmniRouteJson,
  readOmniRouteJson,
  resolveOmniRouteHttpRequestConfig,
} from "./http.js";
import {
  OMNIROUTE_DEFAULT_BASE_URL,
  OMNIROUTE_LABEL,
  OMNIROUTE_PROVIDER_ID,
} from "./models.js";

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
  const configured = req.cfg.models?.providers?.[OMNIROUTE_PROVIDER_ID]?.baseUrl;
  return typeof configured === "string" && configured.trim()
    ? configured.trim().replace(/\/+$/, "")
    : OMNIROUTE_DEFAULT_BASE_URL;
}

function parseVideoResponse(payload: unknown): GeneratedVideoAsset[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) {
    throw new Error("OmniRoute video generation response missing video data");
  }
  return (payload as { data: unknown[] }).data.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new Error("OmniRoute video generation response malformed");
    }
    const item = entry as { url?: unknown; mime_type?: unknown; file_name?: unknown };
    if (typeof item.url !== "string" || !item.url.trim()) {
      throw new Error("OmniRoute video generation response missing video URL");
    }
    return {
      url: item.url,
      mimeType: typeof item.mime_type === "string" && item.mime_type.trim()
        ? item.mime_type
        : "video/mp4",
      ...(typeof item.file_name === "string" && item.file_name.trim()
        ? { fileName: item.file_name }
        : {}),
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
      const apiKey = await resolveOmniRouteApiKey({ cfg: req.cfg, agentDir: req.agentDir });
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
      });
      try {
        await assertOmniRouteOk(request.response, "OmniRoute video generation failed");
        const videos = parseVideoResponse(
          await readOmniRouteJson(request.response, "omniroute.video-generation"),
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
