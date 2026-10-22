import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { isOmniRouteConfiguredAsync } from "./auth.js";
type VideoGenerationProvider = Parameters<OpenClawPluginApi["registerVideoGenerationProvider"]>[0] & {
    isConfiguredAsync: typeof isOmniRouteConfiguredAsync;
};
export declare function buildOmniRouteVideoGenerationProvider(): VideoGenerationProvider;
export {};
//# sourceMappingURL=video-generation-provider.d.ts.map