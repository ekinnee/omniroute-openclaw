import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
type SpeechProvider = Parameters<OpenClawPluginApi["registerSpeechProvider"]>[0];
type AsyncSpeechProvider = SpeechProvider & {
    isConfiguredAsync: (ctx: Parameters<SpeechProvider["isConfigured"]>[0]) => Promise<boolean>;
};
export declare function buildOmniRouteSpeechProvider(): AsyncSpeechProvider;
export {};
//# sourceMappingURL=speech-provider.d.ts.map