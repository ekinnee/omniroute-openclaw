import { describe, expect, it } from "vitest";
import plugin from "./index.js";

describe("OmniRoute route failure classification", () => {
  async function classifier() {
    let provider: { classifyFailoverReason?: (ctx: Record<string, unknown>) => unknown } = {};
    await plugin.register!(new Proxy({}, { get: (_, key) => key === "registerProvider"
      ? (value: typeof provider) => { provider = value; } : () => undefined }) as never);
    return provider.classifyFailoverReason;
  }
  const missing = { provider: "omniroute", status: 401, code: "provider_not_configured",
    errorType: "authentication_error", errorMessage: "401 No active credentials for provider: fixture." };
  it("surfaces an unconfigured selected route without credential cooldown or retry classification", async () => {
    const classify = await classifier();
    expect(classify).toBeTypeOf("function");
    expect(classify!(missing)).toBe("format");
  });
  it.each([
    { code: "invalid_api_key" }, { code: "authentication_expired" }, { code: undefined },
    { status: 403 }, { status: 404 }, { status: 503 }, { status: undefined },
    { provider: "openai" }, { provider: undefined },
    { code: undefined, errorMessage: '401 {"error":{"code":"provider_not_configured"}}' },
  ])("defers genuine auth and insufficient/unrelated descriptors: %j", async (override) => {
    const classify = await classifier();
    expect(classify?.({ ...missing, ...override })).toBeUndefined();
  });
});
