import { Button, Forms, TextInput, TextArea, React, ChannelStore, GuildStore, SearchableSelect, useStateFromStores } from "@webpack/common";
import { settings } from "../index";

interface ChannelConfig {
    id: string;
    prompt: string;
}

export function ChannelSettings() {
    const channelConfigs: ChannelConfig[] = settings.use(["channelConfigs"]).channelConfigs || [];
    
    const [newId, setNewId] = React.useState("");
    const [newPrompt, setNewPrompt] = React.useState("");
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [showAdvanced, setShowAdvanced] = React.useState(false);

    // Dynamic channel options using store subscription (Deduplicated, Text Channels Only)
    const channelOptions = useStateFromStores([ChannelStore, GuildStore], () => {
        const opts: { label: string, value: string }[] = [];
        const seen = new Set<string>();

        try {
            const guilds = GuildStore?.getGuilds?.() ?? {};
            for (const guildId in guilds) {
                const guild = guilds[guildId];
                const guildChannels = ChannelStore.getMutableGuildChannelsForGuild?.(guildId) ?? {};
                for (const cId in guildChannels) {
                    const ch = guildChannels[cId];
                    const isHiddenPlugin = typeof ch.isHidden === "function" ? ch.isHidden() : false;
                    const isHiddenName = ch.name?.includes("___hidden___");
                    
                    // 0: Text, 5: Announcement, 11: Public Thread, 12: Private Thread
                    if ([0, 5, 11, 12].includes(ch.type) && !seen.has(ch.id) && !isHiddenPlugin && !isHiddenName) {
                        seen.add(ch.id);
                        opts.push({ label: `${ch.name} (${guild.name})`, value: ch.id });
                    }
                }
            }
            const dms = ChannelStore.getPrivateChannels?.() ?? {};
            for (const cId in dms) {
                const ch = dms[cId];
                if (!seen.has(ch.id)) {
                    seen.add(ch.id);
                    opts.push({ label: `${ch.name || "Unknown DM"} (Direct Message)`, value: ch.id });
                }
            }
        } catch (e) {
            console.error("[AutoSummary] Channel map error:", e);
        }
        
        // Sort alphabetically by label
        return opts.sort((a, b) => a.label.localeCompare(b.label));
    });

    const getChannelName = (id: string): string => {
        try {
            const ch = ChannelStore.getChannel?.(id);
            if (ch) return ch.guild_id ? `#${ch.name}` : (ch.name || "Unknown DM");
        } catch { /* noop */ }
        return id;
    };

    const handleSetNewId = (val: string) => {
        setNewId(val);
        // Edit mode safety: Abort edit mode if selecting/typing a different channel ID
        if (editingId !== null && val !== editingId) {
            setEditingId(null);
            setNewPrompt("");
        }
    };

    const startEditing = (c: ChannelConfig) => {
        setEditingId(c.id);
        setNewId(c.id);
        setNewPrompt(c.prompt || "");
    };

    const cancelEdit = () => {
        setEditingId(null);
        setNewId("");
        setNewPrompt("");
    };

    const addOrUpdateChannel = () => {
        const trimmedId = newId.trim();
        if (!trimmedId) return;

        const list = settings.store.channelConfigs as ChannelConfig[];
        
        // If we are actively editing, update that specific config
        if (editingId) {
            const existing = list.find(c => c.id === editingId);
            if (existing) {
                Object.assign(existing, { id: trimmedId, prompt: newPrompt });
            }
        } else {
            // Add mode
            const existing = list.find(c => c.id === trimmedId);
            if (existing) {
                existing.prompt = newPrompt;
            } else {
                list.push({ id: trimmedId, prompt: newPrompt });
            }
        }
        
        cancelEdit();
    };

    const removeChannel = (id: string) => {
        const list = settings.store.channelConfigs as ChannelConfig[];
        const index = list.findIndex(c => c.id === id);
        if (index !== -1) {
            list.splice(index, 1);
        }
        if (id === editingId || id === newId) {
            cancelEdit();
        }
    };

    return (
        <Forms.FormSection>
            <Forms.FormTitle>Channel Management (Auto-Summary)</Forms.FormTitle>
            <Forms.FormText type="description">
                Search and add channels here, and set a custom summary prompt for each.<br />
                If you leave the prompt empty, the global prompt will be used.
            </Forms.FormText>
            
            <Forms.FormDivider style={{ marginTop: "16px", marginBottom: "16px" }} />

            <div>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 200px" }}>
                            <SearchableSelect
                                options={channelOptions}
                                value={newId || undefined}
                                onChange={handleSetNewId}
                                placeholder="Search channel name to add..."
                                closeOnSelect={true}
                                maxVisibleItems={8}
                            />
                        </div>
                        <Button 
                            onClick={addOrUpdateChannel} 
                            disabled={!newId.trim()}
                            color={editingId !== null ? Button.Colors.BRAND : Button.Colors.GREEN}
                        >
                            {editingId !== null ? "Update" : "Add"}
                        </Button>
                        {editingId !== null && (
                            <Button 
                                onClick={cancelEdit} 
                                color={Button.Colors.PRIMARY} 
                                look={Button.Looks.OUTLINED}
                            >
                                Cancel
                            </Button>
                        )}
                    </div>

                    <div 
                        style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "4px", width: "fit-content", userSelect: "none" }}
                        onClick={() => setShowAdvanced(!showAdvanced)}
                    >
                        {showAdvanced ? "▼" : "▶"} Add by Channel ID
                    </div>

                    {showAdvanced && (
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                            <div style={{ flex: "1 1 200px", maxWidth: "300px" }}>
                                <TextInput
                                    placeholder="Enter raw Channel ID..."
                                    value={newId}
                                    onChange={handleSetNewId}
                                />
                            </div>
                        </div>
                    )}

                    <div>
                        {editingId !== null && (
                            <div style={{ marginBottom: "8px", color: "var(--text-brand)", fontSize: "14px", fontWeight: 600 }}>
                                ✏️ Editing configuration for {getChannelName(editingId)}
                            </div>
                        )}
                        <TextArea
                            placeholder="Custom Prompt (Optional, uses global if empty)"
                            value={newPrompt}
                            onChange={setNewPrompt}
                            rows={4}
                            autosize={true}
                        />
                    </div>
                </div>
            </div>

            <Forms.FormDivider style={{ marginTop: "16px", marginBottom: "16px" }} />

            <div>
                {channelConfigs.length === 0 ? (
                    <Forms.FormText type="description">
                        No channels added. Auto-summary is currently using the global prompt for all channels.
                    </Forms.FormText>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" }}>
                        {channelConfigs.map((c) => (
                            <div key={c.id} style={{ padding: "12px", backgroundColor: "var(--background-secondary)", borderRadius: "8px" }}>
                                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "1 1 auto", minWidth: "200px" }}>
                                        <strong style={{ color: "var(--header-primary)", fontSize: "16px" }}>{getChannelName(c.id)}</strong>
                                        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                                            <span style={{ 
                                                fontFamily: "var(--font-code)", 
                                                fontSize: "12px", 
                                                color: "var(--text-muted)", 
                                                backgroundColor: "var(--background-tertiary)", 
                                                padding: "2px 6px", 
                                                borderRadius: "4px",
                                                wordBreak: "break-all"
                                            }}>
                                                {c.id}
                                            </span>
                                            {c.prompt && (
                                                <span style={{ 
                                                    fontSize: "11px", 
                                                    color: "var(--text-positive)", 
                                                    backgroundColor: "rgba(35, 165, 89, 0.15)",
                                                    padding: "2px 6px",
                                                    borderRadius: "4px",
                                                    fontWeight: 600,
                                                    whiteSpace: "nowrap"
                                                }}>
                                                    CUSTOM PROMPT
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", gap: "8px", flex: "0 0 auto" }}>
                                        <Button 
                                            color={Button.Colors.PRIMARY} 
                                            onClick={() => startEditing(c)} 
                                            size={Button.Sizes.SMALL} 
                                            look={Button.Looks.OUTLINED}
                                        >
                                            Edit
                                        </Button>
                                        <Button color={Button.Colors.RED} onClick={() => removeChannel(c.id)} size={Button.Sizes.SMALL} look={Button.Looks.OUTLINED}>
                                            Remove
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Forms.FormSection>
    );
}
