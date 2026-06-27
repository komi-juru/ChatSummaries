import { Modal, React, Forms, TextInput, TextArea, Button, MessageStore, MessageActions, showToast, Toasts, ChannelStore, GuildStore, GuildMemberStore, UserStore, Slider, openModal, closeModal, ChannelRouter } from "@webpack/common";
import { FormSwitch } from "@components/FormSwitch";
import { Summarizer } from "../core/Summarizer";
import { settings } from "../index";
import { PluginNative } from "@utils/types";
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
    autoSaveTxt: false,
    oneTimePrompt: "",
    keepFormat: true,
    showAdvanced: false,
    targetUserIds: new Set<string>(),
    filterInputValue: "",
    recoveryMessagesMap: new Map<string, any[]>()
};

export function SummaryDashboardModal(props: SummaryDashboardModalProps) {
    const [limit, _setLimit] = React.useState(persistedState.limit);
    const setLimit = (val: number) => { persistedState.limit = val; _setLimit(val); };

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
                    if (style.overflowY === 'scroll' || style.overflowY === 'auto' || style.overflowY === 'overlay') {
                        return el;
                    }
                } catch (e) {
                    break;
                }
                el = el.parentElement;
            }
        }

        // Fallback to searching inside main
        const main = document.querySelector('main');
        if (main) {
            const scrollers = Array.from(main.querySelectorAll('[class*="scroller_"]')) as HTMLElement[];
            for (const s of scrollers) {
                const style = window.getComputedStyle(s);
                if (style.overflowY === 'scroll' || style.overflowY === 'auto' || style.overflowY === 'overlay') {
                    return s;
                }
            }
        }
        return null;
    };

    const handleCollect = () => {
        let parsed = limit;
        if (isNaN(parsed) || parsed < 1) parsed = 100;

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

            // Reached our target or hit the top
            if (totalCollected >= parsed || unchangedTicks >= 10) {
                clearInterval(intervalRef.current!);
                intervalRef.current = null;
                
                // Sort all accumulated messages by timestamp
                const allSorted = Array.from(messageMap.values()).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                const finalSet = allSorted.slice(-parsed);
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
        const text = msgs.map((m: any) => `[${new Date(m.timestamp).toLocaleString()}] ${formatAuthorName(m.author)}: ${m.content || ""}`).join("\n");
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
        if (collectedMessages.length > 0 && !isCollecting) {
            // Use recovered or already collected messages
            if (autoSaveTxt) saveTxtLog(collectedMessages);
            performSummarize(collectedMessages);
            return;
        }

        const currentMsgs = MessageStore.getMessages(props.channelId).toArray();
        if (currentMsgs.length >= limit) {
            // We have enough in cache already
            const rawSet = currentMsgs.slice(-limit);
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

        const apiKey = settings.store.apiKey;
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
                    const btn = bar.querySelector('button');
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
            const LOW_VALUE_PATTERN = /^([ㅋㅎㅠㅜw\?\!\~\.\s]+)$/i;

            const chatText = sorted.map((m: any) => {
                let text = m.content || "";

                // 지능형 잡담 필터링: 의미 없는 자음/모음/기호 도배는 텍스트에서 삭제
                if (LOW_VALUE_PATTERN.test(text)) {
                    text = "";
                }

                if (m.attachments && m.attachments.length > 0) text += " [첨부파일]";
                if (m.embeds && m.embeds.length > 0 && !text.includes("http")) text += " [링크/임베드]";
                if (m.sticker_items || m.stickerItems) text += " [스티커]";
                text = text.trim();
                if (!text) return null;
                return `${formatAuthorName(m.author)}: ${text}`;
            }).filter(Boolean).join("\n");

            let prompt = "";
            const defaultStructure = `[출력 포맷 및 규칙]
절대 인사말이나 불필요한 제목을 넣지 마세요. 반드시 아래의 구조를 그대로 지켜서 출력하세요.

[한 줄 요약]
전체 흐름을 파악할 수 있는 핵심 한 줄 요약 작성.

■ [주제 키워드 직접 생성]
- 세부 요약 내용 1 (**중요 키워드/수치**는 볼드 처리)
- 세부 요약 내용 2

■ [다음 주제 키워드]
- 세부 요약 내용 1...

[요약 지침]
1. 이미지/링크만 있는 대화는 유저 반응 보고 유추할 것.
2. 길게 늘어지지 않게 팩트만 간결하게 압축할 것.
3. 자잘한 잡담은 버리고 핵심 떡밥 3~4개 위주로 요약할 것.

`;

            const hasOneTime = oneTimePrompt.trim().length > 0;
            const hasCustom = props.customPrompt.trim().length > 0;

            if (hasOneTime && !keepFormat) {
                prompt = `[지시사항]\n${oneTimePrompt.trim()}\n\n`;
            } else {
                prompt = defaultStructure;
                if (hasOneTime) {
                    prompt = `[긴급 추가 지시사항: ${oneTimePrompt.trim()}]\n\n` + prompt;
                } else if (hasCustom) {
                    prompt = `[Custom Instruction: ${props.customPrompt.trim()}]\n\n` + prompt;
                }
            }

            prompt += `대화 내용:\n${chatText}`;

            SummaryState.isSummarizing = true;
            
            try {
                let result = await Summarizer.generateSummary(model, apiKey, prompt);

                // API Success! Clear recovery state so it doesn't linger forever.
                persistedState.recoveryMessagesMap.delete(props.channelId);
                setCollectedMessages([]);

                // For webhook: format headers with ANSI blocks
                const webhookResult = result.replace(/^■\s*\[(.*?)\]/gm, "```ansi\n\x1b[2;34m■ [$1]\x1b[0m\n```");
                
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
                        if (!msg || !msg.timestamp) return "??:??";
                        const d = new Date(msg.timestamp);
                        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
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
                showToast("Summary failed: " + (error.message || "Unknown error"), Toasts.Type.FAILURE);
            } finally {
                SummaryState.isSummarizing = false;
            }
        } catch (error: any) {
            console.error("Gathering Error:", error);
            showToast("Summary prep failed: " + (error.message || "Unknown error"), Toasts.Type.FAILURE);
        }
    };

    return (
        <Modal
            {...props}
            title="Summary Dashboard"
        >
            {/* Slider Section */}
            <Forms.FormTitle tag="h5" style={{ marginTop: 0 }}>Message Count</Forms.FormTitle>
            <Forms.FormText type="description" style={{ marginBottom: "12px" }}>
                Select the number of messages to fetch.
            </Forms.FormText>
            <div style={{ padding: "0 8px", marginBottom: "20px" }}>
                <Slider
                    initialValue={limit}
                    onValueChange={(val: number) => setLimit(Math.round(val))}
                    asValueChanges={(val: number) => setLimit(Math.round(val))}
                    markers={[50, 100, 300, 500, 1000, 2500, 5000]}
                    onMarkerRender={(m: number) => m >= 1000 ? `${m/1000}k` : m.toString()}
                    equidistant={true}
                    stickToMarkers={true}
                    disabled={isCollecting || isSummarizing}
                />
            </div>

            {/* Manual Input Row */}
            <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", marginBottom: "20px" }}>
                <div style={{ width: "100%" }}>
                    <Forms.FormTitle tag="h5">Manual Input</Forms.FormTitle>
                    <TextInput
                        type="number"
                        value={limit.toString()}
                        onChange={(val: string) => {
                            const num = parseInt(val, 10);
                            if (!isNaN(num) && num > 0) setLimit(Math.min(num, 10000));
                        }}
                        disabled={isCollecting || isSummarizing}
                    />
                </div>
            </div>

            <Forms.FormDivider style={{ marginBottom: "16px" }} />

            {/* Collected Status */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <Forms.FormTitle tag="h5" style={{ margin: 0 }}>Collected Messages</Forms.FormTitle>
                <span style={{ fontSize: "16px", fontWeight: 600, color: collectedMessages.length > 0 ? "var(--text-normal)" : "var(--text-muted)" }}>
                    {collectedMessages.length > 0 || isCollecting ? `${collectedMessages.length} / ${limit}` : "0"}
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
                        <Forms.FormTitle tag="h5">Prompt Override</Forms.FormTitle>
                        <Forms.FormText type="description" style={{ marginBottom: "8px" }}>
                            Enter instructions to be applied only for this specific summary.
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

    const renderBold = (text: string) => {
        const parts = text.split(/(\*\*.*?\*\*)/g);
        return parts.map((part, index) => {
            if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
                return <strong key={index} style={{ color: "var(--text-brand)" }}>{part.slice(2, -2)}</strong>;
            }
            return <span key={index}>{part}</span>;
        });
    };

    // Parse summary text into React elements
    const renderSummary = (text: string) => {
        const lines = text.split("\n");
        const elements: React.ReactNode[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Section header: ■ [Topic]
            const sectionMatch = line.match(/^■\s*\[(.+?)\]/);
            if (sectionMatch) {
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
                        ■ {sectionMatch[1]}
                    </div>
                );
                continue;
            }

            // One-line summary header
            if (line.startsWith("[한 줄 요약]") || line.startsWith("[One-line")) {
                elements.push(
                    <div key={i} style={{
                        fontSize: "13px",
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        marginBottom: "4px",
                        textTransform: "uppercase" as const,
                        letterSpacing: "0.5px"
                    }}>
                        Summary
                    </div>
                );
                continue;
            }

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
                        <div>{renderBold(content)}</div>
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
                    {renderBold(line)}
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
