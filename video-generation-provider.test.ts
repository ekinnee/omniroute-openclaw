// OmniRoute video generation tests.
import { afterEach, describe, expect, it, vi } from "vitest";

describe("OmniRoute video generation provider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("uses OMNIROUTE_BASE_URL for video generation when provider config has the default URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        data: [{ url: "https://cdn.example/video.mp4" }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubEnv("OMNIROUTE_BASE_URL", "https://env-omniroute.example/v1/");
    const { buildOmniRouteVideoGenerationProvider } = await import(
      "./video-generation-provider.js"
    );

    await buildOmniRouteVideoGenerationProvider().generateVideo({
      provider: "omniroute",
      model: "video-model",
      prompt: "a city at night",
      cfg: {
        models: {
          providers: {
            omniroute: {
              apiKey: "secret-key",
              baseUrl: "http://localhost:20128/v1",
            },
          },
        },
      } as never,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://env-omniroute.example/v1/videos/generations",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("generates OmniRoute inline video artifacts", async () => {
    const video = Buffer.from("generated video");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        data: [{ b64_json: video.toString("base64"), format: "webp" }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const { buildOmniRouteVideoGenerationProvider } = await import(
      "./video-generation-provider.js"
    );

    const result = await buildOmniRouteVideoGenerationProvider().generateVideo({
      provider: "omniroute",
      model: "video-model",
      prompt: "a city at night",
      cfg: {
        models: {
          providers: {
            omniroute: {
              apiKey: "secret-key",
              baseUrl: "http://localhost:20128/v1",
              request: { allowPrivateNetwork: true },
            },
          },
        },
      } as never,
    });

    expect(result).toEqual({
      model: "video-model",
      videos: [{ buffer: video, mimeType: "image/webp" }],
    });
  });

  it("reserves enough JSON capacity for default-size inline videos", async () => {
    const { OMNIROUTE_JSON_READ_OPTIONS } = await import("./http.js");

    expect(OMNIROUTE_JSON_READ_OPTIONS.videoGeneration.maxBytes).toBe(24 * 1024 * 1024);
  });
});
