import type { ProviderDefaultThinkingPolicyContext, ProviderReplayPolicy, ProviderReplayPolicyContext, ProviderThinkingProfile } from "openclaw/plugin-sdk/plugin-entry";
/** Limit OpenClaw's selector to the exact effort levels advertised by OmniRoute. */
export declare function buildOmniRouteThinkingProfile(ctx: ProviderDefaultThinkingPolicyContext): ProviderThinkingProfile;
/**
 * Preserve the OpenAI-compatible transcript policy that the legacy SDK helper
 * supplied, without importing that private helper into the external plugin.
 */
export declare function buildOmniRouteReplayPolicy(ctx: ProviderReplayPolicyContext): ProviderReplayPolicy | undefined;
//# sourceMappingURL=provider-compat.d.ts.map