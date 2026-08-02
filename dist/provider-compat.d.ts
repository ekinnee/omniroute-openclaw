import type { ProviderReplayPolicy, ProviderReplayPolicyContext } from "openclaw/plugin-sdk/plugin-entry";
/**
 * Preserve the OpenAI-compatible transcript policy that the legacy SDK helper
 * supplied, without importing that private helper into the external plugin.
 */
export declare function buildOmniRouteReplayPolicy(ctx: ProviderReplayPolicyContext): ProviderReplayPolicy | undefined;
//# sourceMappingURL=provider-compat.d.ts.map