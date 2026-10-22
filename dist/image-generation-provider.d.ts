import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { isOmniRouteConfiguredAsync } from "./auth.js";
type ImageGenerationProvider = Parameters<OpenClawPluginApi["registerImageGenerationProvider"]>[0] & {
    isConfiguredAsync: typeof isOmniRouteConfiguredAsync;
};
export declare function buildOmniRouteImageGenerationProvider(): ImageGenerationProvider;
export {};
//# sourceMappingURL=image-generation-provider.d.ts.map