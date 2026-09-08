import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchOmniRouteUsage,
  omniRouteUsageUrl,
  resolveOmniRouteUsageAuth,
} from "./usage.js";

describe("OmniRoute usage reporting", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("uses the key-scoped usage endpoint beside the configured OpenAI API root", () => {
    expect(omniRouteUsageUrl("https://omniroute.example/v1/")).toBe(
      "https://omniroute.example/api/usage/om-usage",
    );
    expect(omniRouteUsageUrl("http://localhost:20128/v1")).toBe(
      "http://localhost:20128/api/usage/om-usage",
    );
  });

  it("uses OMNIROUTE_BASE_URL when provider config only has the public default", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response("Provider quota", { status: 200 }));

    await fetchOmniRouteUsage({
      config: {
        models: { providers: { omniroute: { baseUrl: "http://localhost:20128/v1" } } },
      },
      env: { OMNIROUTE_BASE_URL: "https://environment.example/v1/" },
      token: "usage-key",
      timeoutMs: 5_000,
      fetchFn,
    } as never);

    expect(fetchFn).toHaveBeenCalledWith("https://environment.example/api/usage/om-usage", {
      headers: {
        Accept: "text/plain",
        Authorization: "Bearer usage-key",
      },
      signal: expect.any(AbortSignal),
    });
  });

  it("resolves only the configured OmniRoute API key for usage", () => {
    const resolveApiKeyFromConfigAndStore = vi.fn(() => "omniroute-key");

    expect(
      resolveOmniRouteUsageAuth({
        env: { OMNIROUTE_API_KEY: "env-key" },
        resolveApiKeyFromConfigAndStore,
      } as never),
    ).toEqual({ token: "omniroute-key" });
    expect(resolveApiKeyFromConfigAndStore).toHaveBeenCalledWith({
      providerIds: ["omniroute"],
      envDirect: ["env-key"],
    });
  });

  it("normalizes only provider-scoped cached Session and Weekly quota windows", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        [
          "Personal quota",
          "Daily",
          "90% left",
          "",
          "Provider quota",
          "Session",
          "26% left",
          "⏱ reset in 2h 0m",
          "",
          "Weekly",
          "75% left",
          "⏱ reset in 6d 0h 0m",
        ].join("\n"),
      ),
    );

    const snapshot = await fetchOmniRouteUsage({
      config: {
        models: { providers: { omniroute: { baseUrl: "https://omniroute.example/v1" } } },
      },
      env: {},
      token: "usage-key",
      timeoutMs: 5_000,
      fetchFn,
    } as never);

    expect(fetchFn).toHaveBeenCalledWith("https://omniroute.example/api/usage/om-usage", {
      headers: {
        Accept: "text/plain",
        Authorization: "Bearer usage-key",
      },
      signal: expect.any(AbortSignal),
    });
    expect(snapshot).toMatchObject({
      provider: "omniroute",
      displayName: "OmniRoute",
      windows: [
        { label: "Session", usedPercent: 74 },
        { label: "Weekly", usedPercent: 25 },
      ],
    });
    expect(snapshot.summary).toContain("Provider quota");
  });

  it("reports disabled key usage as an explicit provider error", async () => {
    const snapshot = await fetchOmniRouteUsage({
      config: {},
      env: {},
      token: "usage-key",
      timeoutMs: 5_000,
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(new Response("denied", { status: 403 })),
    } as never);

    expect(snapshot).toEqual({
      provider: "omniroute",
      displayName: "OmniRoute",
      windows: [],
      error: "Usage visibility is disabled for this OmniRoute API key",
    });
  });

  it("cancels an oversized usage body instead of buffering it first", async () => {
    let cancelled = false;
    let pulls = 0;
    const chunk = new TextEncoder().encode("x".repeat(16_384));
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(chunk);
        if (pulls === 8) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });

    const snapshot = await fetchOmniRouteUsage({
      config: {},
      env: {},
      token: "usage-key",
      timeoutMs: 5_000,
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 200 })),
    } as never);

    expect(snapshot).toEqual({
      provider: "omniroute",
      displayName: "OmniRoute",
      windows: [],
      error: "OmniRoute usage response is too large",
    });
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThan(8);
  });

  it("cancels a stalled usage body and returns the unavailable snapshot", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const snapshotPromise = fetchOmniRouteUsage({
      config: {},
      env: {},
      token: "usage-key",
      timeoutMs: 50,
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(new Response(body)),
    } as never);

    await vi.advanceTimersByTimeAsync(50);

    expect(await snapshotPromise).toEqual({
      provider: "omniroute",
      displayName: "OmniRoute",
      windows: [],
      error: "OmniRoute usage endpoint is unavailable",
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([
    { suffix: "", oversized: false },
    { suffix: "x", oversized: true },
  ])("enforces the UTF-8 byte limit (oversized: $oversized)", async ({ suffix, oversized }) => {
    const text = "é".repeat(16_384) + suffix;
    const snapshot = await fetchOmniRouteUsage({
      config: {},
      env: {},
      token: "usage-key",
      timeoutMs: 5_000,
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(new Response(text)),
    } as never);

    expect(snapshot).toEqual({
      provider: "omniroute",
      displayName: "OmniRoute",
      windows: [],
      ...(oversized
        ? { error: "OmniRoute usage response is too large" }
        : { summary: text }),
    });
  });

  it("converts usage body-read failures into the unavailable snapshot", async () => {
    const body = new ReadableStream<Uint8Array>({
      pull() {
        return Promise.reject(new Error("body read failed"));
      },
    });

    const snapshot = await fetchOmniRouteUsage({
      config: {},
      env: {},
      token: "usage-key",
      timeoutMs: 5_000,
      fetchFn: vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 200 })),
    } as never);

    expect(snapshot).toEqual({
      provider: "omniroute",
      displayName: "OmniRoute",
      windows: [],
      error: "OmniRoute usage endpoint is unavailable",
    });
  });
});
