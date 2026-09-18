import { afterEach, describe, expect, it, vi } from "vitest";
import { omniRouteMediaUnderstandingProvider } from "./audio-transcription-provider.js";

const transcribeAudio = omniRouteMediaUnderstandingProvider.transcribeAudio;
if (!transcribeAudio) {
  throw new Error("expected OmniRoute audio transcription provider");
}

describe("OmniRoute media-understanding provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uploads a multipart audio request with the selected model and metadata", async () => {
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(JSON.stringify({ text: "hello world" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchFn);

    const result = await transcribeAudio({
      buffer: Buffer.from("audio-bytes"),
      fileName: "voice.wav",
      mime: "audio/wav",
      apiKey: "legacy-key",
      auth: { kind: "api-key", apiKey: "resolved-key", source: "test" },
      baseUrl: "https://example.com/v1",
      model: "groq/whisper-large-v3-turbo",
      language: " en ",
      prompt: " punctuation matters ",
      timeoutMs: 5_000,
    });

    expect(result).toEqual({
      text: "hello world",
      model: "groq/whisper-large-v3-turbo",
    });
    expect(requestUrl).toBe("https://example.com/v1/audio/transcriptions");
    expect(requestInit?.method).toBe("POST");
    expect(new Headers(requestInit?.headers).get("authorization")).toBe(
      "Bearer resolved-key",
    );

    const form = requestInit?.body;
    expect(form).toBeInstanceOf(FormData);
    if (!(form instanceof FormData)) {
      throw new Error("expected a multipart FormData body");
    }
    expect(form.get("model")).toBe("groq/whisper-large-v3-turbo");
    expect(form.get("language")).toBe("en");
    expect(form.get("prompt")).toBe("punctuation matters");
    const file = form.get("file");
    expect(file).toBeInstanceOf(Blob);
    expect((file as File).name).toBe("voice.wav");
    expect((file as Blob).type).toBe("audio/wav");
    expect(Buffer.from(await (file as Blob).arrayBuffer())).toEqual(
      Buffer.from("audio-bytes"),
    );
  });

  it("uses the plugin environment base URL when OpenClaw does not provide one", async () => {
    vi.stubEnv("OMNIROUTE_BASE_URL", "https://example.com/v1");
    let requestUrl = "";
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      requestUrl = String(input);
      return new Response(JSON.stringify({ text: "from env" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchFn);

    await transcribeAudio({
      buffer: Buffer.from("audio"),
      fileName: "voice.mp3",
      mime: "audio/mpeg",
      apiKey: "key",
      baseUrl: "http://localhost:20128/v1",
      model: "openai/whisper-1",
      timeoutMs: 5_000,
    });

    expect(requestUrl).toBe("https://example.com/v1/audio/transcriptions");
  });

  it("requires an explicitly selected model", async () => {
    await expect(
      transcribeAudio({
        buffer: Buffer.from("audio"),
        fileName: "voice.mp3",
        apiKey: "key",
        baseUrl: "https://example.com/v1",
        timeoutMs: 5_000,
      }),
    ).rejects.toThrow("requires an explicitly selected model");
  });

  it("rejects a successful response without transcript text", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ text: "   " }), { status: 200 }));
    vi.stubGlobal("fetch", fetchFn);

    await expect(
      transcribeAudio({
        buffer: Buffer.from("audio"),
        fileName: "voice.mp3",
        apiKey: "key",
        baseUrl: "https://example.com/v1",
        model: "openai/whisper-1",
        timeoutMs: 5_000,
      }),
    ).rejects.toThrow("response missing text");
  });

  it("surfaces bounded upstream errors", async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "upstream rejected audio" } }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchFn);

    await expect(
      transcribeAudio({
        buffer: Buffer.from("audio"),
        fileName: "voice.mp3",
        apiKey: "key",
        baseUrl: "https://example.com/v1",
        model: "openai/whisper-1",
        timeoutMs: 5_000,
      }),
    ).rejects.toThrow(/400|upstream rejected audio/);
  });
});
