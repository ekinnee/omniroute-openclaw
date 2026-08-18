// OmniRoute setup helpers for API-key onboarding.
import type { OpenClawConfig } from "openclaw/plugin-sdk/plugin-entry";
import {
  OMNIROUTE_DEFAULT_BASE_URL,
  OMNIROUTE_PROVIDER_ID,
} from "./models.js";

export function applyOmniRouteProviderConfig(cfg: OpenClawConfig): OpenClawConfig {
  const existingProvider = cfg.models?.providers?.[OMNIROUTE_PROVIDER_ID];

  return {
    ...cfg,
    models: {
      ...cfg.models,
      mode: cfg.models?.mode ?? "merge",
      providers: {
        ...cfg.models?.providers,
        [OMNIROUTE_PROVIDER_ID]: {
          ...existingProvider,
          api: existingProvider?.api ?? "openai-completions",
          baseUrl: existingProvider?.baseUrl ?? OMNIROUTE_DEFAULT_BASE_URL,
          models: existingProvider?.models ?? [],
        },
      },
    },
  };
}

export function applyOmniRouteConfig(cfg: OpenClawConfig): OpenClawConfig {
  return applyOmniRouteProviderConfig(cfg);
}
