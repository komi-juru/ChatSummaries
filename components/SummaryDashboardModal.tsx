/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FormSwitch } from "@components/FormSwitch";
import { PluginNative } from "@utils/types";
import { Button, ChannelStore, Forms, GuildMemberStore, GuildStore, MessageStore, Modal, openModal, Parser,React, showToast, Slider, TextArea, TextInput, Toasts, UserStore } from "@webpack/common";

import { Summarizer } from "../core/Summarizer";
import { settings } from "../index";
import { SummaryState } from "../store";

const Native = VencordNative.pluginHelpers.ChatSummaries as PluginNative<typeof import("../native")>;

interface SummaryDashboardModalProps {
    channelId: string;
    customPrompt: string;
    transitionState?: any;
    onClose?: () => void;
}

const persistedState = {
    limit: 500,
    timeRange: 24,
    autoSaveTxt: false,
    oneTimePrompt: "",
    keepFormat: true,
    showAdvanced: false,
    targetUserIds: new Set<string>(),
    filterInputValue: "",
    recoveryMessagesMap: new Map<string, any[]>()
};

const getMsgTime = (msg: any) => {
    if (!msg || !msg.timestamp) return 0;
    if (typeof msg.timestamp === "number") return msg.timestamp;
    if (typeof msg.timestamp.toDate === "function") return msg.timestamp.toDate().getTime();
    if (typeof msg.timestamp.valueOf === "function") return msg.timestamp.valueOf();
    return new Date(msg.timestamp).getTime() || 0;
};

export function SummaryDashboardModal(props: SummaryDashboardModalProps) {
    const [limit, _setLimit] = React.useState(persistedState.limit);
    const setLimit = (val: number) => { persistedState.limit = val; _setLimit(val); };

    const [timeRange, _setTimeRange] = React.useState(persistedState.timeRange);
    const setTimeRange = (val: number) => { persistedState.timeRange = val; _setTimeRange(val); };

    const [autoSaveTxt, _setAutoSaveTxt] = React.useState(persistedState.autoSaveTxt);
    const setAutoSaveTxt = (val: boolean) => { persistedState.autoSaveTxt = val; _setAutoSaveTxt(val); };

    const [oneTimePrompt, _setOneTimePrompt] = React.useState(persistedState.oneTimePrompt);
    const setOneTimePrompt = (val: string) => { persistedState.oneTimePrompt = val; _setOneTimePrompt(val); };

    const [keepFormat, _setKeepFormat] = React.useState(persistedState.keepFormat);
    const setKeepFormat = (val: boolean) => { persistedState.keepFormat = val; _setKeepFormat(val); };

    const [showAdvanced, _setShowAdvanced] = React.useState(persistedState.showAdvanced);
    const setShowAdvanced = (val: boolean) => { persistedState.showAdvanced = val; _setShowAdvanced(val); };

    const [targetUserIds, _setTargetUserIds] = React.useState<Set<string>>(persistedState.targetUserIds);
    const setTargetUserIds = (val: Set<string>) => { persistedState.targetUserIds = val; _setTargetUserIds(val); };

    const [filterInputValue, _setFilterInputValue] = React.useState(persistedState.filterInputValue);
    const setFilterInputValue = (val: string) => { persistedState.filterInputValue = val; _setFilterInputValue(val); };

    const [isCollecting, setIsCollecting] = React.useState(false);
    const [isSummarizing, setIsSummarizing] = React.useState(SummaryState.isSummarizing);

    const [collectedMessages, setCollectedMessages] = React.useState<any[]>(() => {
        return persistedState.recoveryMessagesMap.get(props.channelId) || [];
    });

    const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

    const applyUserFilter = React.useCallback((msgs: any[]) => {
        if (targetUserIds.size === 0) return msgs;
        return msgs.filter(m => m.author && targetUserIds.has(m.author.id));
    }, [targetUserIds]);

    const resolveUserDisplay = React.useCallback((userId: string) => {
        try {
            const channel = ChannelStore.getChannel(props.channelId);
            if (channel && channel.guild_id) {
                const member = GuildMemberStore.getMember(channel.guild_id, userId);
                if (member && member.nick) return member.nick;
            }
            const globalUser = UserStore.getUser(userId);
            if (globalUser) {
                return globalUser.globalName || globalUser.username;
            }
        } catch (e) {}
        return userId;
    }, [props.channelId]);

    // Cleanup interval on unmount
    React.useEffect(() => {
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    const getChatScroller = () => {
        // Try the virtualized list wrapper
        const list = document.querySelector('[data-list-id="chat-messages"]');
        if (list) {
            let el: HTMLElement | null = list as HTMLElement;
            while (el && el !== document.body) {
                try {
                    const style = window.getComputedStyle(el);
                    if (style.overflowY === "scroll" || style.overflowY === "auto" || style.overflowY === "overlay") {
                        return el;
                    }
                } catch (e) {
                    break;
                }
                el = el.parentElement;
            }
        }

        // Fallback to searching inside main
        const main = document.querySelector("main");
        if (main) {
            const scrollers = Array.from(main.querySelectorAll('[class*="scroller_"]')) as HTMLElement[];
            for (const s of scrollers) {
                const style = window.getComputedStyle(s);
                if (style.overflowY === "scroll" || style.overflowY === "auto" || style.overflowY === "overlay") {
                    return s;
                }
            }
        }
        return null;
    };

    const handleCollect = () => {
        const cutoffTime = timeRange > 0 ? Date.now() - (timeRange * 60 * 60 * 1000) : 0;

        setIsCollecting(true);
        setCollectedMessages([]);

        let unchangedTicks = 0;
        const messageMap = new Map();

        intervalRef.current = setInterval(() => {
            const currentMsgs = MessageStore.getMessages(props.channelId).toArray();
            let addedNew = false;

            for (const msg of currentMsgs) {
                if (!messageMap.has(msg.id)) {
                    messageMap.set(msg.id, msg);
                    addedNew = true;
                }
            }

            const totalCollected = messageMap.size;

            let timeLimitReached = false;
            if (cutoffTime > 0 && currentMsgs.length > 0) {
                const oldestMsg = currentMsgs[0];
                if (getMsgTime(oldestMsg) < cutoffTime) {
                    timeLimitReached = true;
                }
            }

            // Hit the top or reached the time limit
            if (unchangedTicks >= 10 || timeLimitReached) {
                clearInterval(intervalRef.current!);
                intervalRef.current = null;

                // Sort all accumulated messages by timestamp
                let allSorted = Array.from(messageMap.values()).sort((a, b) => getMsgTime(a) - getMsgTime(b));
                if (cutoffTime > 0) {
                    allSorted = allSorted.filter(m => getMsgTime(m) >= cutoffTime);
                }
                const finalSet = allSorted;
                const filteredSet = applyUserFilter(finalSet);

                setCollectedMessages(filteredSet);
                setIsCollecting(false);

                if (autoSaveTxt) {
                    saveTxtLog(filteredSet);
                }
                performSummarize(filteredSet);
            } else {
                if (!addedNew) {
                    unchangedTicks++;
                } else {
                    unchangedTicks = 0;
                    setCollectedMessages(applyUserFilter(Array.from(messageMap.values())));
                }

                const scroller = getChatScroller();
                if (scroller) {
                    scroller.scrollTop = 0;
                } else {
                    console.error("ChatSummaries: Could not find chat scroller element.");
                }
            }
        }, 500);
    };

    const formatAuthorName = (author: any) => {
        if (!author) return "?";

        try {
            const channel = ChannelStore.getChannel(props.channelId);
            if (channel && channel.guild_id && author.id) {
                const member = GuildMemberStore.getMember(channel.guild_id, author.id);
                if (member && member.nick) {
                    return member.nick;
                }
            }
        } catch (e) {}

        return author.globalName || author.username || "?";
    };

    const saveTxtLog = (msgs: any[]) => {
        if (msgs.length === 0) return;
        const text = msgs.map((m: any) => `[${new Date(getMsgTime(m)).toLocaleString()}] ${formatAuthorName(m.author)}: ${m.content || ""}`).join("\n");
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `channel-${props.channelId}-log.txt`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("Log saved!", Toasts.Type.SUCCESS);
    };

    const handleSummarize = () => {
        const cutoffTime = timeRange > 0 ? Date.now() - (timeRange * 60 * 60 * 1000) : 0;

        if (collectedMessages.length > 0 && !isCollecting) {
            // Use recovered or already collected messages
            let finalMsgs = collectedMessages;
            if (cutoffTime > 0) {
                finalMsgs = finalMsgs.filter(m => getMsgTime(m) >= cutoffTime);
            }
            if (autoSaveTxt) saveTxtLog(finalMsgs);
            performSummarize(finalMsgs);
            return;
        }

        const currentMsgs = MessageStore.getMessages(props.channelId).toArray();
        let timeLimitReachedLocally = false;
        if (cutoffTime > 0 && currentMsgs.length > 0) {
            if (getMsgTime(currentMsgs[0]) < cutoffTime) {
                timeLimitReachedLocally = true;
            }
        }

        if (timeLimitReachedLocally) {
            // We have enough in cache already
            let rawSet = currentMsgs;
            if (cutoffTime > 0) {
                rawSet = rawSet.filter(m => getMsgTime(m) >= cutoffTime);
            }
            const filteredSet = applyUserFilter(rawSet);
            setCollectedMessages(filteredSet);
            if (autoSaveTxt) saveTxtLog(filteredSet);
            performSummarize(filteredSet);
        } else {
            handleCollect();
        }
    };

    const performSummarize = async (msgsToSummarize: any[]) => {
        if (msgsToSummarize.length === 0) return;
        setIsSummarizing(true);
        persistedState.recoveryMessagesMap.set(props.channelId, msgsToSummarize);

        const { apiKey } = settings.store;
        const model = settings.store.apiModel || "gemini-3.1-flash-lite";

        if (!apiKey) {
            showToast("Gemini API Key is missing!", Toasts.Type.FAILURE);
            setIsSummarizing(false);
            return;
        }

        // --- BACKGROUND WORKFLOW UX ---
        // 1. Close Dashboard immediately after collection finishes
        props.onClose?.();

        // 2. Safely jump to the most recent message after modal closes.
        setTimeout(() => {
            try {
                // "Jump To Present" 버튼 강제 클릭 (사용자 요청)
                let clicked = false;
                const jumpBars = document.querySelectorAll('[class*="jumpToPresentBar"]');
                jumpBars.forEach(bar => {
                    const btn = bar.querySelector("button");
                    if (btn) {
                        btn.click();
                        clicked = true;
                    }
                });

                // 버튼이 없었을 경우 (조금만 위로 올린 경우) 기본 스크롤 다운
                if (!clicked) {
                    const scroller = getChatScroller();
                    if (scroller) {
                        scroller.scrollTop = scroller.scrollHeight;
                        setTimeout(() => { if (scroller) scroller.scrollTop = scroller.scrollHeight; }, 100);
                        setTimeout(() => { if (scroller) scroller.scrollTop = scroller.scrollHeight; }, 300);
                    }
                }
            } catch (e) {}
        }, 150);

        try {
            // Keep chronological order (oldest first) for natural conversation context
            const sorted = [...msgsToSummarize];
            const LOW_VALUE_PATTERN = /^([ㅋㅎㅠㅜw?!~.\s]+)$/i;

            const chatText = sorted.map((m: any) => {
                let text = m.content || "";

                // 지능형 잡담 필터링: 의미 없는 자음/모음/기호 도배는 텍스트에서 삭제
                if (LOW_VALUE_PATTERN.test(text)) {
                    text = "";
                }

                if (m.attachments && m.attachments.length > 0) text += " [Attachment]";
                if (m.embeds && m.embeds.length > 0 && !text.includes("http")) text += " [Link/Embed]";
                if (m.sticker_items || m.stickerItems) text += " [Sticker]";
                text = text.trim();
                if (!text) return null;
                return `${formatAuthorName(m.author)}: ${text}`;
            }).filter(Boolean).join("\n");

            let discordLanguage = "en-US";
            try {
                const { findByProps } = require("@webpack");
                const localeStore = findByProps("getLocale");
                if (localeStore && localeStore.getLocale) {
                    discordLanguage = localeStore.getLocale();
                }
            } catch (e) {}

            let prompt = "";
            const defaultStructure = `[Output Format and Rules]
Default Language Locale: ${discordLanguage} (Use this language unless instructed otherwise).
Never include greetings or unnecessary titles. You must strictly follow the structure below.
Write a core one-line summary here to grasp the overall flow. Do not use a header or title for it.

■ [Topic Keyword (Generate yourself)]
- Detailed summary 1 (Bold important keywords/numbers)
- Detailed summary 2

■ [Next Topic Keyword]
- Detailed summary 1...

[Summary Guidelines]
1. For conversations with only images/links, infer from user reactions.
2. Compress facts concisely without dragging on.
3. Discard trivial chat and summarize mainly around 3~4 core topics.

`;

            const hasOneTime = oneTimePrompt.trim().length > 0;
            const hasCustom = props.customPrompt.trim().length > 0;

            if (hasOneTime && !keepFormat) {
                prompt = `[Instruction]\nOutput Language Locale: ${discordLanguage}\n\n`;
                if (hasCustom) prompt += `[Base Custom Instruction: ${props.customPrompt.trim()}]\n\n`;
                prompt += `[Urgent Additional Instruction: ${oneTimePrompt.trim()}]\n\n`;
            } else {
                prompt = defaultStructure;
                const toneOverride = `[CRITICAL RULE]\nYou must STRICTLY maintain the output structural format (One-line summary at the top, ■ Topic Keyword, bullet points) exactly as shown below.\nHOWEVER, you must COMPLETELY adapt the TONE, STYLE, PERSONALITY, and LANGUAGE of the entire summary content to match the Custom Instruction below, ignoring any conflicting tone or language guidelines (such as the default language locale).\n\n`;
                
                let combinedCustom = "";
                if (hasCustom) combinedCustom += `[Base Custom Instruction: ${props.customPrompt.trim()}]\n\n`;
                if (hasOneTime) combinedCustom += `[Urgent Additional Instruction (Highest Priority): ${oneTimePrompt.trim()}]\n\n`;
                
                if (combinedCustom) {
                    prompt = toneOverride + combinedCustom + prompt;
                }
            }

            prompt += `Chat Log:\n${chatText}`;

            SummaryState.isSummarizing = true;

            try {
                const result = await Summarizer.generateSummary(model, apiKey, prompt);

                // API Success! Clear recovery state so it doesn't linger forever.
                persistedState.recoveryMessagesMap.delete(props.channelId);
                setCollectedMessages([]);

                // For webhook: format headers with ANSI blocks
                const webhookResult = result.replace(/^■\s*(.*)$/gm, (match, topic) => {
                    const cleanTopic = topic.replace(/^[\s\[\]*]+|[\s\[\]*]+$/g, "");
                    return "```ansi\n\x1b[2;34m■ [" + cleanTopic + "]\x1b[0m\n```";
                });

                // 4. Automatically open result modal when done
                openModal(modalProps => (
                    <SummaryResultModal {...modalProps} result={result} messageCount={msgsToSummarize.length} />
                ));

                // Check webhook
                if (settings.store.webhookUrl) {
                    const channel = ChannelStore.getChannel(props.channelId);
                    const guild = channel ? GuildStore.getGuild(channel.guild_id) : null;
                    const guildName = guild ? guild.name : "Unknown Guild";
                    const channelName = channel ? channel.name : "Unknown Channel";
                    const embedTitle = `📋 # 📊 ${guildName}: ${channelName} Summary`;

                    const formatTime = (msg: any) => {
                        if (!msg) return "??:??";
                        const d = new Date(getMsgTime(msg));
                        return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
                    };
                    const timeRange = `${formatTime(sorted[0])} ~ ${formatTime(sorted[sorted.length - 1])}`;

                    Native.basWebhookFetch(settings.store.webhookUrl, {
                        embeds: [{
                            title: embedTitle,
                            description: webhookResult.substring(0, 4096),
                            color: 0x2b2d31,
                            footer: { text: `Summary Log • 🔮 Collected: ${timeRange} (${sorted.length} msgs)` },
                            timestamp: new Date().toISOString()
                        }]
                    }).then((r: any) => {
                        if (r.ok) showToast("Sent to webhook!", Toasts.Type.SUCCESS);
                        else showToast(`Webhook Error: ${r.status}`, Toasts.Type.FAILURE);
                    }).catch((e: any) => showToast(`Webhook Failed: ${e.message}`, Toasts.Type.FAILURE));
                }

            } catch (error: any) {
                console.error("Summarize Error:", error);
                const errorMsg = error?.message || "Request failed";
                showToast(`Gemini: ${errorMsg.length > 80 ? errorMsg.substring(0, 80) + "..." : errorMsg}`, Toasts.Type.FAILURE);
            } finally {
                SummaryState.isSummarizing = false;
            }
        } catch (error: any) {
            console.error("Gathering Error:", error);
        }
    };

    return (
        <Modal
            {...props}
            title="Summary Dashboard"
        >
            {/* Time Range Section */}
            <div style={{ marginBottom: "20px" }}>
                <Forms.FormTitle tag="h5" style={{ marginTop: 0 }}>Time Range</Forms.FormTitle>
                <Forms.FormText type="description" style={{ marginBottom: "12px" }}>
                    Automatically collect all messages within this time range.
                </Forms.FormText>
                <div style={{ padding: "0 8px" }}>
                    <Slider
                        initialValue={timeRange}
                        onValueChange={(val: number) => setTimeRange(Math.round(val))}
                        asValueChanges={(val: number) => setTimeRange(Math.round(val))}
                        markers={[1, 3, 6, 12, 24]}
                        onMarkerRender={(m: number) => {
                            return `${m}h`;
                        }}
                        equidistant={true}
                        stickToMarkers={true}
                        disabled={isCollecting || isSummarizing}
                    />
                </div>
            </div>

            {/* Message Count Limit removed */}

            <Forms.FormDivider style={{ marginBottom: "16px" }} />

            {/* Collected Status */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <Forms.FormTitle tag="h5" style={{ margin: 0 }}>Collected Messages</Forms.FormTitle>
                <span style={{ fontSize: "16px", fontWeight: 600, color: collectedMessages.length > 0 ? "var(--text-normal)" : "var(--text-muted)" }}>
                    {collectedMessages.length > 0 || isCollecting ? `${collectedMessages.length}` : "0"}
                </span>
            </div>

            {/* Advanced / One-time Prompt Section */}
            <Forms.FormDivider style={{ marginBottom: "16px" }} />
            <div style={{ marginBottom: "20px" }}>
                <div
                    style={{
                        cursor: "pointer",
                        color: "var(--text-muted)",
                        fontSize: "14px",
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        userSelect: "none",
                        marginBottom: showAdvanced ? "12px" : "0"
                    }}
                    onClick={() => setShowAdvanced(!showAdvanced)}
                >
                    {showAdvanced ? "▼" : "▶"} Advanced Options
                </div>

                {showAdvanced && (
                    <div style={{ paddingLeft: "4px", marginTop: "8px" }}>
                        <Forms.FormTitle tag="h5">Additional Prompt</Forms.FormTitle>
                        <Forms.FormText type="description" style={{ marginBottom: "8px" }}>
                            Enter one-time instructions. This will be combined with your Custom Prompt.
                        </Forms.FormText>
                        <TextArea
                            placeholder="e.g. Translate everything into English"
                            value={oneTimePrompt}
                            onChange={(val: string) => setOneTimePrompt(val)}
                            rows={2}
                            autosize={true}
                            disabled={isCollecting || isSummarizing}
                        />
                        <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
                            <FormSwitch
                                title="Keep Original Formatting (Recommended)"
                                note="If disabled, the AI will ignore the standard summary structure and strictly follow your prompt above."
                                value={keepFormat}
                                onChange={(v: boolean) => setKeepFormat(v)}
                                disabled={isCollecting || isSummarizing}
                                hideBorder={true}
                            />
                            <FormSwitch
                                title="Save fetched messages as TXT"
                                note="Automatically downloads a text file of the collected messages before summarizing."
                                value={autoSaveTxt}
                                onChange={(v: boolean) => setAutoSaveTxt(v)}
                                disabled={isCollecting || isSummarizing}
                                hideBorder={true}
                            />
                        </div>

                        <div style={{ marginTop: "24px" }}>
                            <Forms.FormTitle tag="h5">Filter by User</Forms.FormTitle>
                            <Forms.FormText type="description" style={{ marginBottom: "8px" }}>
                                Enter User IDs to exclusively summarize their messages. Press Add or Enter.
                            </Forms.FormText>
                            <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                                <div style={{ flex: 1 }}>
                                    <TextInput
                                        placeholder="Paste User ID here..."
                                        value={filterInputValue}
                                        onChange={(v: string) => setFilterInputValue(v)}
                                        onKeyDown={(e: React.KeyboardEvent) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                const id = filterInputValue.trim();
                                                if (/^\d{17,20}$/.test(id)) {
                                                    const newSet = new Set(targetUserIds);
                                                    newSet.add(id);
                                                    setTargetUserIds(newSet);
                                                    setFilterInputValue("");
                                                } else if (id.length > 0) {
                                                    showToast("Invalid User ID format.", Toasts.Type.FAILURE);
                                                }
                                            }
                                        }}
                                        disabled={isCollecting || isSummarizing}
                                    />
                                </div>
                                <Button
                                    size={Button.Sizes.MEDIUM}
                                    disabled={isCollecting || isSummarizing || !/^\d{17,20}$/.test(filterInputValue.trim())}
                                    onClick={() => {
                                        const id = filterInputValue.trim();
                                        if (/^\d{17,20}$/.test(id)) {
                                            const newSet = new Set(targetUserIds);
                                            newSet.add(id);
                                            setTargetUserIds(newSet);
                                            setFilterInputValue("");
                                        }
                                    }}
                                >
                                    Add
                                </Button>
                            </div>

                            {targetUserIds.size > 0 && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", padding: "4px 0" }}>
                                    {Array.from(targetUserIds).map(userId => (
                                        <div
                                            key={userId}
                                            onClick={() => {
                                                if (isCollecting || isSummarizing) return;
                                                const newSet = new Set(targetUserIds);
                                                newSet.delete(userId);
                                                setTargetUserIds(newSet);
                                            }}
                                            style={{
                                                padding: "4px 10px",
                                                borderRadius: "16px",
                                                backgroundColor: "var(--brand-500)",
                                                color: "#fff",
                                                cursor: (isCollecting || isSummarizing) ? "not-allowed" : "pointer",
                                                fontSize: "13px",
                                                fontWeight: 500,
                                                userSelect: "none",
                                                opacity: (isCollecting || isSummarizing) ? 0.5 : 1,
                                                transition: "all 0.2s ease",
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "4px"
                                            }}
                                        >
                                            {resolveUserDisplay(userId)}
                                            <span style={{ opacity: 0.7, fontSize: "11px", marginLeft: "2px" }}>✕</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <Forms.FormDivider style={{ marginBottom: "16px" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
                <Button
                    onClick={handleSummarize}
                    disabled={isCollecting || isSummarizing || !settings.store.apiKey}
                    color={Button.Colors.BRAND}
                    size={Button.Sizes.MEDIUM}
                >
                    {!settings.store.apiKey ? "API Key Required" : (isSummarizing || isCollecting ? "Processing..." : (collectedMessages.length > 0 ? "Retry Failed Summary" : "Summarize"))}
                </Button>
            </div>

        </Modal>
    );
}


interface SummaryResultModalProps {
    result: string;
    messageCount: number;
    transitionState?: any;
    onClose?: () => void;
}

function SummaryResultModal(props: SummaryResultModalProps) {
    const handleCopy = () => {
        navigator.clipboard.writeText(props.result);
        showToast("Copied to clipboard!", Toasts.Type.SUCCESS);
    };

    // Parse summary text into React elements
    const renderSummary = (text: string) => {
        const lines = text.split("\n");
        const elements: React.ReactNode[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Section header: ■ [Topic]
            const sectionMatch = line.match(/^■\s*(.*)$/);
            if (sectionMatch) {
                const cleanTopic = sectionMatch[1].replace(/^[\s\[\]*]+|[\s\[\]*]+$/g, "");
                elements.push(
                    <div key={i} style={{
                        marginTop: elements.length > 0 ? "16px" : "0",
                        marginBottom: "8px",
                        padding: "6px 10px",
                        backgroundColor: "var(--brand-500)",
                        borderRadius: "4px",
                        color: "#fff",
                        fontSize: "13px",
                        fontWeight: 700
                    }}>
                        ■ {cleanTopic}
                    </div>
                );
                continue;
            }

            // One-line summary header parsing removed

            // Bullet point
            if (line.startsWith("- ")) {
                const content = line.slice(2);
                elements.push(
                    <div key={i} style={{
                        display: "flex",
                        gap: "8px",
                        marginBottom: "4px",
                        fontSize: "14px",
                        lineHeight: "1.5",
                        color: "var(--text-normal)"
                    }}>
                        <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>•</span>
                        <div>{Parser.parse(content)}</div>
                    </div>
                );
                continue;
            }

            // Regular text line (like the one-line summary content)
            elements.push(
                <div key={i} style={{
                    fontSize: "14px",
                    lineHeight: "1.5",
                    color: "var(--text-normal)",
                    marginBottom: "6px"
                }}>
                    {Parser.parse(line)}
                </div>
            );
        }
        return elements;
    };

    return (
        <Modal
            {...props}
            title="Summary Result"
        >
            <Forms.FormText type="description" style={{ marginBottom: "12px" }}>
                Summarized from {props.messageCount} messages.
            </Forms.FormText>
            <div style={{
                padding: "16px",
                backgroundColor: "var(--background-secondary)",
                borderRadius: "8px",
                maxHeight: "450px",
                overflowY: "auto",
                marginBottom: "16px"
            }}>
                {renderSummary(props.result)}
            </div>
            <Button
                onClick={handleCopy}
                color={Button.Colors.PRIMARY}
                look={Button.Looks.OUTLINED}
                size={Button.Sizes.MEDIUM}
            >
                Copy to Clipboard
            </Button>
        </Modal>
    );
}
