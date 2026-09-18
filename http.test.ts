import { afterEach, describe, expect, it, vi } from "vitest";
import { postOmniRouteJson } from "./http.js";

describe("OmniRoute JSON POST transport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds an application/json content type when callers omit one", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );

    const request = await postOmniRouteJson({
      url: "https://gateway.example/v1/test",
      headers: new Headers({ Accept: "application/json" }),
      body: { model: "test-model", prompt: "hello" },
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(requestInit.headers).get("Content-Type")).toBe("application/json");
    expect(requestInit.body).toBe(JSON.stringify({ model: "test-model", prompt: "hello" }));
    await request.release();
  });

  it("preserves an explicitly supplied content type", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );

    const request = await postOmniRouteJson({
      url: "https://gateway.example/v1/test",
      headers: new Headers({ "Content-Type": "application/vnd.api+json" }),
      body: { model: "test-model" },
    });

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(requestInit.headers).get("Content-Type")).toBe("application/vnd.api+json");
    await request.release();
  });
});
