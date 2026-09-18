import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

function speechRequest(
  providerOverrides: Record<string, unknown> = {},
  requestOverrides: Record<string, unknown> = {},
) {
  return {
    text: "Hello from OmniRoute",
    target: "audio-file",
    providerConfig: {
      model: "provider/tts-model",
      voice: "coral",
      responseFormat: "mp3",
      ...providerOverrides,
    },
    cfg: {
      models: {
        providers: {
          omniroute: {
            apiKey: "shared-key",
            baseUrl: "http://localhost:20128/v1",
            request: { allowPrivateNetwork: true },
          },
        },
      },
    },
    timeoutMs: 10_000,
    ...requestOverrides,
  } as never;
}

function response(body: Uint8Array, contentType: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": contentType },
  });
}

describe("OmniRoute speech provider", () => {
  beforeAll(async () => {
    // Cold SDK loading belongs to setup, not the first behavior test's deadline.
    await import("./speech-provider.js");
  }, 30_000);

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("maps configured speech options to the OpenAI-compatible request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00]), "audio/mpeg"),
    );
    const { buildOmniRouteSpeechProvider } = await import("./speech-provider.js");

    const result = await buildOmniRouteSpeechProvider().synthesize(speechRequest());

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:20128/v1/audio/speech",
      expect.objectContaining({ method: "POST" }),
    );
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(requestInit.headers).get("Authorization")).toBe("Bearer shared-key");
    expect(JSON.parse(String(requestInit.body))).toEqual({
      model: "provider/tts-model",
      input: "Hello from OmniRoute",
      voice: "coral",
      response_format: "mp3",
    });
    expect(result).toEqual({
      audioBuffer: expect.any(Buffer),
      outputFormat: "mp3",
      fileExtension: ".mp3",
      voiceCompatible: false,
    });
  });

  it("uses opus for voice notes when no format is configured", async () => {
    const opus = new Uint8Array(36);
    opus.set(new TextEncoder().encode("OggS"), 0);
    opus[26] = 1;
    opus[27] = 8;
    opus.set(new TextEncoder().encode("OpusHead"), 28);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(opus, "audio/ogg"),
    );
    const { buildOmniRouteSpeechProvider } = await import("./speech-provider.js");

    const result = await buildOmniRouteSpeechProvider().synthesize(
      speechRequest({ responseFormat: undefined }, { target: "voice-note" }),
    );

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(requestInit.body))).toMatchObject({ response_format: "opus" });
    expect(result).toMatchObject({
      outputFormat: "opus",
      fileExtension: ".opus",
      voiceCompatible: true,
    });
  });

  it("allows speech config to override the shared credential and base URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]), "audio/wav"),
    );
    const { buildOmniRouteSpeechProvider } = await import("./speech-provider.js");

    await buildOmniRouteSpeechProvider().synthesize({
      ...speechRequest({
        apiKey: "speech-key",
        baseUrl: "https://speech.example/v1",
        responseFormat: "wav",
      }),
      cfg: {} as never,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://speech.example/v1/audio/speech",
      expect.objectContaining({ method: "POST" }),
    );
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(requestInit.headers).get("Authorization")).toBe("Bearer speech-key");
  });

  it.each([
    ["voice", "not-a-voice", /does not support voice/],
    ["response format", "flac", /does not support response format/],
  ])("rejects an unsupported %s explicitly", async (_label, value, error) => {
    const { buildOmniRouteSpeechProvider } = await import("./speech-provider.js");
    const provider = buildOmniRouteSpeechProvider();
    const configKey = _label === "voice" ? "voice" : "responseFormat";

    await expect(
      provider.synthesize(speechRequest({ [configKey]: value })),
    ).rejects.toThrow(error);
  });

  it("requires an explicit model", async () => {
    const { buildOmniRouteSpeechProvider } = await import("./speech-provider.js");

    await expect(
      buildOmniRouteSpeechProvider().synthesize(speechRequest({ model: undefined })),
    ).rejects.toThrow(/requires an explicit model/);
  });

  it("reports the provider as configured only when a model and credential exist", async () => {
    const { buildOmniRouteSpeechProvider } = await import("./speech-provider.js");
    const provider = buildOmniRouteSpeechProvider();

    expect(provider.isConfigured({
      cfg: speechRequest().cfg,
      providerConfig: {},
      timeoutMs: 10_000,
    })).toBe(false);
    expect(provider.isConfigured({
      cfg: speechRequest().cfg,
      providerConfig: { model: "provider/tts-model" },
      timeoutMs: 10_000,
    })).toBe(true);
  });

  it("rejects bytes that do not match the requested audio format", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response(
      new TextEncoder().encode("not audio"),
      "audio/mpeg",
    ));
    const { buildOmniRouteSpeechProvider } = await import("./speech-provider.js");

    await expect(
      buildOmniRouteSpeechProvider().synthesize(speechRequest()),
    ).rejects.toThrow(/bytes do not match mp3/);
  });

  it("uses a dedicated bounded response limit", async () => {
    const { OMNIROUTE_JSON_READ_OPTIONS } = await import("./http.js");
    expect(OMNIROUTE_JSON_READ_OPTIONS.speech).toEqual({
      maxBytes: 16 * 1024 * 1024,
      chunkTimeoutMs: 30_000,
    });
  });
});
