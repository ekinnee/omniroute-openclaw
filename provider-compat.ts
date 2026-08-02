// OmniRoute's provider-local compatibility hooks.
import type {
  ProviderReplayPolicy,
  ProviderReplayPolicyContext,
} from "openclaw/plugin-sdk/plugin-entry";

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
