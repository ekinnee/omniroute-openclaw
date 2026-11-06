// OmniRoute's provider-local compatibility hooks.
import type {
  ProviderDefaultThinkingPolicyContext,
  ProviderReplayPolicy,
  ProviderReplayPolicyContext,
  ProviderThinkingProfile,
} from "openclaw/plugin-sdk/plugin-entry";

/** An unconfigured upstream route does not invalidate the shared gateway key. */
export function classifyOmniRouteFailoverReason(ctx: {
  provider?: string;
  status?: number;
  code?: string;
}): "format" | undefined {
  // A terminal request/configuration failure avoids retrying this route or
  // cooling healthy sibling routes. Genuine auth errors retain host handling.
  return ctx.provider === "omniroute" && ctx.status === 401 && ctx.code === "provider_not_configured"
    ? "format"
    : undefined;
}

const OMNIROUTE_PROFILE_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

/** Limit OpenClaw's selector to the exact effort levels advertised by OmniRoute. */
export function buildOmniRouteThinkingProfile(
  ctx: ProviderDefaultThinkingPolicyContext,
): ProviderThinkingProfile {
  const advertised = new Set(
    (ctx.compat?.supportedReasoningEfforts ?? [])
      .filter((effort): effort is string => typeof effort === "string")
      .map((effort) => effort.trim().toLowerCase())
      .map((effort) => (effort === "none" ? "off" : effort)),
  );
  const levels = OMNIROUTE_PROFILE_LEVELS.filter((level) => advertised.has(level)).map(
    (id) => ({ id }),
  );
  if (levels.length === 0) {
    return { levels: [{ id: "off" }], defaultLevel: "off" };
  }
  return { levels };
}

/**
 * Preserve the OpenAI-compatible transcript policy that the legacy SDK helper
 * supplied, without importing that private helper into the external plugin.
 */
export function buildOmniRouteReplayPolicy(
  ctx: ProviderReplayPolicyContext,
): ProviderReplayPolicy | undefined {
  const api = ctx.modelApi;
  if (
    api !== "openai-completions" &&
    api !== "openai-responses" &&
    api !== "openai-chatgpt-responses" &&
    api !== "azure-openai-responses"
  ) {
    return undefined;
  }

  const responsesFamily =
    api === "openai-responses" ||
    api === "openai-chatgpt-responses" ||
    api === "azure-openai-responses";
  return {
    sanitizeToolCallIds: true,
    toolCallIdMode: "strict",
    ...(responsesFamily ? { allowSyntheticToolResults: true } : {}),
    ...(api === "openai-completions"
      ? {
          applyAssistantFirstOrderingFix: true,
          validateGeminiTurns: true,
          validateAnthropicTurns: true,
        }
      : {
          applyAssistantFirstOrderingFix: false,
          validateGeminiTurns: false,
          validateAnthropicTurns: false,
        }),
  };
}
