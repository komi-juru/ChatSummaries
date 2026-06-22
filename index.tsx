import definePlugin, { OptionType } from "@utils/types";
import { findComponentByCodeLazy } from "@webpack";
import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import { I18n } from "./utils/I18n";
import { Summarizer } from "./core/Summarizer";
import { openModal, showToast, Toasts, SelectedChannelStore, useStateFromStores, Forms } from "@webpack/common";
import { ChannelSettings } from "./components/ChannelSettings";
import { SummaryDashboardModal } from "./components/SummaryDashboardModal";
import { ApiKeyInput, GeminiModelInput } from "./components/ApiKeyInput";
import { GlobalPromptInput } from "./components/GlobalPromptInput";

export const settings = definePluginSettings({
    apiKey: {
        type: OptionType.COMPONENT,
        description: "Gemini API Key",
        default: "",
        component: () => null
    },
    apiModel: {
        type: OptionType.COMPONENT,
        default: "gemini-3.1-flash-lite",
        component: () => null
    },
    webhookUrl: {
        type: OptionType.STRING,
        description: "Discord Webhook URL (Optional: Automatically forwards summary results to this webhook)",
        default: ""
    },
    customPrompt: {
        type: OptionType.COMPONENT,
        component: () => null
    },
    channelConfigs: {
        type: OptionType.CUSTOM,
        default: [] as { id: string, prompt: string }[]
    },
    channelManager: {
        type: OptionType.COMPONENT,
        component: () => null
    }
});

settings.def.apiKey.component = ApiKeyInput;
settings.def.apiModel.component = GeminiModelInput;
settings.def.customPrompt.component = GlobalPromptInput;
settings.def.channelManager.component = ChannelSettings;

const HeaderBarIconNative = findComponentByCodeLazy(
    ".HEADER_BAR_BADGE_BOTTOM,",
    'position:"bottom"'
);

import { useIsSummarizing } from "./store";

function SummaryIcon(props: any) {
    return (
        <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor" {...props}>
            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
        </svg>
    );
}

function HourglassIcon(props: any) {
    return (
        <div style={{ animation: "vencord-hourglass-spin 2s ease-in-out infinite", transformOrigin: "center center", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor" {...props}>
                <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize="16">⏳</text>
            </svg>
            <style>
                {`
                @keyframes vencord-hourglass-spin {
                    0% { transform: rotate(0deg); }
                    40% { transform: rotate(180deg); }
                    50% { transform: rotate(180deg); }
                    90% { transform: rotate(360deg); }
                    100% { transform: rotate(360deg); }
                }
                `}
            </style>
        </div>
    );
}

const startSummarize = (channelId: string) => {
    let customPrompt = settings.store.customPrompt || "";
    const channelConfigs = settings.store.channelConfigs;
    const channelConf = channelConfigs.find((c: any) => c.id === channelId);
    if (channelConf && channelConf.prompt) {
        customPrompt = channelConf.prompt;
    }

    openModal(props => (
        <SummaryDashboardModal
            {...props}
            channelId={channelId}
            customPrompt={customPrompt}
        />
    ));
};

export function SummaryHeaderButton() {
    const channelId = useStateFromStores([SelectedChannelStore], () => SelectedChannelStore.getChannelId());
    const isSummarizing = useIsSummarizing();

    return (
        <HeaderBarIconNative
            onClick={() => {
                if (isSummarizing) {
                    showToast("Currently generating a summary. Please wait...", Toasts.Type.MESSAGE);
                    return;
                }
                startSummarize(channelId);
            }}
            tooltip={isSummarizing ? "Generating summary..." : (I18n.t("summary_btn_label") || "Summarize")}
            icon={isSummarizing ? HourglassIcon : SummaryIcon}
        />
    );
}

export default definePlugin({
    name: "ChatSummaries",
    description: "Automatically collects and summarizes Discord channel messages using Gemini AI.",
    authors: [
        {
            name: "komi-juru",
            id: 123456789n
        }
    ],

    settings,

    patches: [
        {
            find: '?"BACK_FORWARD_NAVIGATION":',
            replacement: {
                match: /(trailing:.{0,150}?\{children:\[)/,
                replace: "$1$self.renderSummaryButton(),",
            },
        },
    ],

    renderSummaryButton() {
        return <SummaryHeaderButton />;
    },

    start() {
    },

    stop() {
    }
});
