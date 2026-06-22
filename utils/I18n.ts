import { findByProps } from "@webpack";

const i18nDict = {
    modal_summary_title:    { en: "📋 Current Channel Summary", ko: "📋 현재 채널 요약" },
    collected:              { en: "Collected", ko: "수집 범위" },
    msgs:                   { en: "msgs", ko: "개" },
    err_no_key:             { en: "Gemini API Key is not set.", ko: "Gemini API 키가 설정되지 않았습니다." },
    err_no_channel:         { en: "Channel not found.", ko: "채널을 찾을 수 없습니다." },
    err_fetch:              { en: "Failed to load messages.", ko: "메시지를 불러오지 못했습니다." },
    err_gemini:             { en: "Failed to connect to Gemini API.", ko: "Gemini API에 연결하지 못했습니다." },
    notice_no_msgs:         { en: "No recent messages found.", ko: "최근 메시지가 없습니다." },
    toast_collecting:       { en: "Collecting and summarizing messages...", ko: "메시지 수집 및 요약 중..." },
    summary_btn_label:      { en: "Summarize", ko: "Summarize" },
};

export const I18n = {
    getLocale(): "ko" | "en" {
        try {
            const localeStore = findByProps("getLocale") as any;
            if (localeStore?.getLocale && localeStore.getLocale().startsWith("ko")) return "ko";
        } catch {}
        return "en";
    },
    t(key: keyof typeof i18nDict): string {
        const entry = i18nDict[key];
        if (!entry) return key;
        return this.getLocale() === "ko" ? entry.ko : entry.en;
    }
};
