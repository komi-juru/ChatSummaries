import { PluginNative } from "@utils/types";

const Native = VencordNative.pluginHelpers.ChatSummaries as PluginNative<typeof import("../native")>;

export class Summarizer {
    // fetchMessages removed in favor of DOM MessageStore auto-scrolling

    public static async generateSummary(model: string, apiKey: string, prompt: string): Promise<string> {
        const res = await Native.basGeminiFetch(model, apiKey, prompt);

        if (!res.ok) {
            if (res.data?.error?.message) {
                throw new Error(res.data.error.message);
            }
            throw new Error(res.error || `Gemini HTTP ${res.status}`);
        }

        const summary = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!summary) {
            throw new Error("No summary generated");
        }

        return summary;
    }
}
