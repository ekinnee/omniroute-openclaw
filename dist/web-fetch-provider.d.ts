import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
type WebFetchProviderPlugin = Parameters<OpenClawPluginApi["registerWebFetchProvider"]>[0];
export declare function createOmniRouteWebFetchProvider(): WebFetchProviderPlugin;
export {};
//# sourceMappingURL=web-fetch-provider.d.ts.map