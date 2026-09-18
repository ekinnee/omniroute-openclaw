import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const baseRequest = {
  provider: "omniroute",
  model: "music-model",
  prompt: "an instrumental ambient loop",
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
};

describe("OmniRoute music generation provider", () => {
  beforeAll(async () => {
    await import("./music-generation-provider.js");
  }, 30_000);

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("generates inline base64 music with the prompt-only request contract", async () => {
    const audio = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        data: [{ b64_json: audio.toString("base64"), format: "mp3" }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const { buildOmniRouteMusicGenerationProvider } = await import(
      "./music-generation-provider.js"
    );

    const result = await buildOmniRouteMusicGenerationProvider().generateMusic(baseRequest);

    expect(result).toEqual({
      model: "music-model",
      tracks: [{
        buffer: audio,
        mimeType: "audio/mpeg",
        fileName: "omniroute-music-1.mp3",
      }],
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://localhost:20128/v1/music/generations");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "music-model",
      prompt: "an instrumental ambient loop",
      n: 1,
    });
  });

  it("materializes hosted audio through the guarded downloader", async () => {
    const audio = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ url: "https://cdn.example/music.mp3", format: "mp3" }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(audio, {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      }));
    const { buildOmniRouteMusicGenerationProvider } = await import(
      "./music-generation-provider.js"
    );

    const result = await buildOmniRouteMusicGenerationProvider().generateMusic(baseRequest);

    expect(result.tracks).toEqual([{
      buffer: audio,
      mimeType: "audio/mpeg",
      fileName: "omniroute-music-1.mp3",
      metadata: { url: "https://cdn.example/music.mp3" },
    }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "GET" });
  });

  it("rejects unsupported input images and non-audio downloads", async () => {
    const { buildOmniRouteMusicGenerationProvider } = await import(
      "./music-generation-provider.js"
    );
    const provider = buildOmniRouteMusicGenerationProvider();
    await expect(provider.generateMusic({
      ...baseRequest,
      inputImages: [{ buffer: Buffer.from("image"), mimeType: "image/png" }],
    } as never)).rejects.toThrow("does not support input images");

    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ url: "https://cdn.example/music.mp3", format: "mp3" }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response("not audio", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }));
    await expect(provider.generateMusic(baseRequest)).rejects.toThrow("non-audio MIME type");

    fetchMock.mockReset()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ url: "https://cdn.example/music.mp3", format: "mp3" }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response("not mp3", {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      }));
    await expect(provider.generateMusic(baseRequest)).rejects.toThrow("bytes do not match audio/mpeg");
  });

  it("reserves enough JSON capacity for inline audio", async () => {
    const { OMNIROUTE_JSON_READ_OPTIONS } = await import("./http.js");
    expect(OMNIROUTE_JSON_READ_OPTIONS.musicGeneration.maxBytes).toBe(24 * 1024 * 1024);
  });
});
