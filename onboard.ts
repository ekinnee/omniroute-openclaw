// OmniRoute setup helpers for API-key onboarding.
import type { OpenClawConfig } from "openclaw/plugin-sdk/plugin-entry";
import {
  buildOmniRouteDefaultModel,
  OMNIROUTE_DEFAULT_BASE_URL,
  OMNIROUTE_DEFAULT_MODEL_REF,
  OMNIROUTE_PROVIDER_ID,
} from "./models.js";

export function applyOmniRouteProviderConfig(cfg: OpenClawConfig): OpenClawConfig {
  const existingProvider = cfg.models?.providers?.[OMNIROUTE_PROVIDER_ID];
  const existingModels = Array.isArray(existingProvider?.models)
    ? existingProvider.models
    : [];
  const defaultModel = buildOmniRouteDefaultModel();
  const models = existingModels.some((model) => model.id === defaultModel.id)
    ? existingModels
    : [...existingModels, defaultModel];
  const agentModels = {
    ...cfg.agents?.defaults?.models,
    [OMNIROUTE_DEFAULT_MODEL_REF]: {
      ...cfg.agents?.defaults?.models?.[OMNIROUTE_DEFAULT_MODEL_REF],
      alias:
        cfg.agents?.defaults?.models?.[OMNIROUTE_DEFAULT_MODEL_REF]?.alias ?? "OmniRoute",
    },
  };

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models: agentModels,
      },
    },
    models: {
      ...cfg.models,
      mode: cfg.models?.mode ?? "merge",
      providers: {
        ...cfg.models?.providers,
        [OMNIROUTE_PROVIDER_ID]: {
          ...existingProvider,
          api: "openai-completions",
          baseUrl: OMNIROUTE_DEFAULT_BASE_URL,
          models,
        },
      },
    },
  };
}

export function applyOmniRouteConfig(cfg: OpenClawConfig): OpenClawConfig {
  const next = applyOmniRouteProviderConfig(cfg);
  const currentModel = next.agents?.defaults?.model;
  const fallbacks =
    currentModel && typeof currentModel === "object" && "fallbacks" in currentModel
      ? currentModel.fallbacks
      : undefined;
  return {
    ...next,
    agents: {
      ...next.agents,
      defaults: {
        ...next.agents?.defaults,
        model: {
          ...(Array.isArray(fallbacks) ? { fallbacks } : {}),
          primary: OMNIROUTE_DEFAULT_MODEL_REF,
        },
      },
    },
  };
}
