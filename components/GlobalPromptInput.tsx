/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Forms, React,TextArea } from "@webpack/common";

import { settings } from "../index";

export function GlobalPromptInput() {
    const { customPrompt } = settings.use(["customPrompt"]);

    return (
        <Forms.FormSection>
            <div style={{ marginBottom: "20px" }}>
                <Forms.FormTitle>Global Custom Prompt</Forms.FormTitle>
                <Forms.FormText type="description">
                    Enter a default prompt to be used across all channels unless overridden.
                </Forms.FormText>

                <div style={{ marginTop: "8px" }}>
                    <TextArea
                        placeholder="e.g. All outputs must be written in natural English"
                        value={customPrompt}
                        onChange={(val: string) => {
                            settings.store.customPrompt = val;
                        }}
                        rows={4}
                        autosize={true}
                    />
                </div>
            </div>
        </Forms.FormSection>
    );
}
