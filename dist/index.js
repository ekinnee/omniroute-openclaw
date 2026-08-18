// OmniRoute plugin entrypoint registers its OpenClaw integration.
import { createProviderApiKeyAuthMethod } from "openclaw/plugin-sdk/provider-auth";
import { definePluginEntry, } from "openclaw/plugin-sdk/plugin-entry";
import { applyOmniRouteConfig } from "./onboard.js";
import { OMNIROUTE_API_KEY_ENV_VAR, OMNIROUTE_BASE_URL_ENV_VAR, OMNIROUTE_LABEL, OMNIROUTE_PROVIDER_ID, } from "./models.js";
import { omniRouteEmbeddingProviderAdapter } from "./embedding-provider.js";
import { buildOmniRouteImageGenerationProvider } from "./image-generation-provider.js";
import { buildOmniRouteCatalog, } from "./provider-catalog.js";
import { createOmniRouteWebSearchProvider } from "./web-search-provider.js";
import { buildOmniRouteVideoGenerationProvider } from "./video-generation-provider.js";
import { buildOmniRouteReplayPolicy, buildOmniRouteThinkingProfile, } from "./provider-compat.js";
const plugin = definePluginEntry({
    id: OMNIROUTE_PROVIDER_ID,
    name: "OmniRoute Provider",
    description: "Bundled OmniRoute provider plugin",
    register: (api) => {
        api.registerProvider({
            id: OMNIROUTE_PROVIDER_ID,
            label: OMNIROUTE_LABEL,
            docsPath: "/providers/omniroute",
            envVars: [OMNIROUTE_API_KEY_ENV_VAR, OMNIROUTE_BASE_URL_ENV_VAR],
            auth: [
                createProviderApiKeyAuthMethod({
                    providerId: OMNIROUTE_PROVIDER_ID,
                    methodId: "api-key",
                    label: "OmniRoute API key",
                    hint: "OpenAI-compatible OmniRoute gateway",
                    optionKey: "omnirouteApiKey",
                    flagName: "--omniroute-api-key",
                    envVar: OMNIROUTE_API_KEY_ENV_VAR,
                    promptMessage: "Enter OmniRoute API key",
                    applyConfig: (cfg) => applyOmniRouteConfig(cfg),
                    noteTitle: "OmniRoute",
                    noteMessage: [
                        "OmniRoute exposes an OpenAI-compatible /v1/chat/completions endpoint.",
                        "By default this plugin targets http://localhost:20128/v1 and lets OmniRoute route downstream providers.",
                    ].join("\n"),
                    wizard: {
                        choiceId: "omniroute-api-key",
                        choiceLabel: "OmniRoute API key",
                        choiceHint: "OpenAI-compatible OmniRoute gateway",
                        groupId: OMNIROUTE_PROVIDER_ID,
                        groupLabel: OMNIROUTE_LABEL,
                        groupHint: "OpenAI-compatible OmniRoute gateway",
                    },
                }),
            ],
            catalog: {
                order: "simple",
                run: (ctx) => buildOmniRouteCatalog(ctx),
            },
            buildReplayPolicy: buildOmniRouteReplayPolicy,
            resolveThinkingProfile: buildOmniRouteThinkingProfile,
            isModernModelRef: () => true,
        });
        api.registerEmbeddingProvider(omniRouteEmbeddingProviderAdapter);
        api.registerImageGenerationProvider(buildOmniRouteImageGenerationProvider());
        api.registerWebSearchProvider(createOmniRouteWebSearchProvider());
        api.registerVideoGenerationProvider(buildOmniRouteVideoGenerationProvider());
    },
});
export default plugin;
//# sourceMappingURL=index.js.map