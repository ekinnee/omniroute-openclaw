import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { isOmniRouteConfiguredAsync } from "./auth.js";
type MusicGenerationProvider = Parameters<OpenClawPluginApi["registerMusicGenerationProvider"]>[0] & {
    isConfiguredAsync: typeof isOmniRouteConfiguredAsync;
};
export declare function buildOmniRouteMusicGenerationProvider(): MusicGenerationProvider;
export {};
//# sourceMappingURL=music-generation-provider.d.ts.map