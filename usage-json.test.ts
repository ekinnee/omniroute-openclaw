import { describe, expect, it, vi } from "vitest";
import { fetchOmniRouteUsage } from "./usage.js";

function fetchSnapshot(response: Response) {
  const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(response);
  return { fetchFn, result: fetchOmniRouteUsage({ config: {}, env: {}, token: "fixture-key", timeoutMs: 50, fetchFn } as never) };
}
function json(provider: unknown, extra = {}) { return Response.json({ allowed: true, provider, ...extra }); }

describe("structured usage", () => {
  it("reports raw selected quota60 rather than cutoff-adjusted text80 and never aggregates connections", async () => {
    const { fetchFn, result } = fetchSnapshot(json({ quotas: { session: { usedPercentage: 60 } }, quotaWindowThresholds: { session: 25 } },
      { personal: { daily: 99 }, providers: [{ quotas: { session: { usedPercentage: 99 } } }] }));
    expect((await result).windows).toEqual([{ label: "session", usedPercent: 60 }]);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn).toHaveBeenCalledWith("http://localhost:20128/api/usage/om-usage?format=json", expect.objectContaining({ headers: { Accept: "application/json", Authorization: "Bearer fixture-key" } }));
    const legacy = await fetchSnapshot(new Response("Provider quota\nSession\n20% left")).result;
    expect(legacy.windows).toEqual([{ label: "Session", usedPercent: 80 }]);
  });
  it("keeps raw labels and valid rows, interprets normalized quota fields, and omits invalid resets", async () => {
    const response = json({ quotas: {
      "monthly credits": { used: "30", total: "100", resetAt: "2026-12-01T00:00:00Z" },
      weekly: { remainingPercentage: 75, resetAt: "invalid" },
      legacy: { used: 12 }, remaining: { remaining: 10 },
      over: { usedPercentage: 120 }, invalid: { used: -2, total: -4 },
      blank: { usedPercentage: " " }, boolean: { usedPercentage: true },
      absent: null, unlimited: { unlimited: true, usedPercentage: 50 },
    } });
    expect((await fetchSnapshot(response).result).windows).toEqual([
      { label: "monthly credits", usedPercent: 30, resetAt: Date.parse("2026-12-01T00:00:00Z") },
      { label: "weekly", usedPercent: 25 }, { label: "legacy", usedPercent: 12 },
      { label: "remaining", usedPercent: 90 }, { label: "over", usedPercent: 100 },
    ]);
  });
  it.each([null, undefined, {}, { quotas: {} }, { quotas: { bad: { used: 1, total: 0 } } }])("does not invent selected usage from %j", async (provider) => {
    const result = await fetchSnapshot(json(provider, { providers: [{ quotas: { session: { usedPercentage: 50 } } }] })).result;
    expect(result.windows).toEqual([]);
    expect(result.error).toBe("OmniRoute returned no usage data");
  });
  it("accepts structured JSON from a legacy media type without issuing a second request", async () => {
    const { result, fetchFn } = fetchSnapshot(new Response(JSON.stringify({
      allowed: true, provider: { quotas: { weekly: { usedPercentage: 0 } } },
    })));
    expect((await result).windows).toEqual([{ label: "weekly", usedPercent: 0 }]);
    expect(fetchFn).toHaveBeenCalledOnce();
  });
  it.each([
    new Response('{"allowed":true', { headers: { "content-type": "application/json" } }),
    Response.json({ allowed: false, error: { message: "private backend diagnostic" } }),
    Response.json({ allowed: "true", provider: { quotas: {} } }),
    new Response("Provider quota\nSession\n20% left", { headers: { "content-type": "application/json" } }),
    new Response("invalid-json"),
    new Response('{"broken":"\nProvider quota\nSession\n20% left'),
    ...[400,401,403,404,406,415,500,503].map(status => new Response("Provider quota\nSession\n20% left", { status })),
  ])("never masks malformed/refused/auth/error data as legacy success ($status)", async response => {
    const { fetchFn, result } = fetchSnapshot(response);
    const snapshot = await result;
    expect(snapshot.windows).toEqual([]);expect(snapshot.error).toBeTruthy();
    expect(snapshot.summary).toBeUndefined();expect(JSON.stringify(snapshot)).not.toContain("private backend diagnostic");
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});
