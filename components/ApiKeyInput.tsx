import { Button, TextInput, useState, Forms, Select } from "@webpack/common";
import { settings } from "../index";

export const GEMINI_MODELS = [
    { label: "Gemini 2.5 Flash", value: "gemini-2.5-flash" },
    { label: "Gemini 3.5 Flash", value: "gemini-3.5-flash" },
    { label: "Gemini 3.1 Flash Lite (Recommended)", value: "gemini-3.1-flash-lite" },
];

export function GeminiModelInput({ setValue }: { setValue: (val: string) => void }) {
    const { apiModel } = settings.use(["apiModel"]);

    return (
        <Forms.FormSection style={{ marginBottom: "20px" }}>
            <Forms.FormTitle>Gemini Model</Forms.FormTitle>
            <Forms.FormText style={{ marginBottom: "8px" }}>
                Select the specific Gemini model to use for summarization.
            </Forms.FormText>
            <Select
                options={[...GEMINI_MODELS]}
                select={(val: string) => {
                    settings.store.apiModel = val;
                    if (setValue) setValue(val);
                }}
                isSelected={(val: string) => val === apiModel}
                serialize={(val: string) => String(val)}
                placeholder="Select Gemini Model"
                popoutPosition="bottom"
            />
        </Forms.FormSection>
    );
}

import { Summarizer } from "../core/Summarizer";

export function ApiKeyInput({ setValue }: { setValue: (val: string) => void }) {
    const { apiKey, apiModel } = settings.use(["apiKey", "apiModel"]);
    const [show, setShow] = useState(false);
    const [validating, setValidating] = useState(false);
    const [status, setStatus] = useState<"idle"|"success"|"error">("idle");
    const [errorMsg, setErrorMsg] = useState("");

    const handleValidate = async () => {
        if (!apiKey) return;
        setValidating(true);
        setStatus("idle");
        try {
            await Summarizer.generateSummary(apiModel || "gemini-3.1-flash-lite", apiKey, "test");
            setStatus("success");
            setErrorMsg("");
        } catch (e: any) {
            setStatus("error");
            setErrorMsg(e.message || "Invalid API Key");
        }
        setValidating(false);
    };

    return (
        <Forms.FormSection>
            <div style={{ marginBottom: "20px" }}>
                <Forms.FormTitle>Gemini API Key</Forms.FormTitle>
                <Forms.FormText>
                    Your Gemini API Key
                </Forms.FormText>
                
                <div style={{ marginTop: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ flex: 1 }}>
                            <TextInput
                                type={show ? "text" : "password"}
                                value={apiKey}
                                onChange={(val: string) => {
                                    settings.store.apiKey = val;
                                    if (setValue) setValue(val);
                                    setStatus("idle");
                                }}
                                placeholder="Enter API Key..."
                            />
                        </div>
                        <Button
                            size={Button.Sizes?.ICON ?? "small"}
                            color={Button.Colors?.PRIMARY ?? "primary"}
                            look={Button.Looks?.FILLED ?? "filled"}
                            onClick={() => setShow(!show)}
                            style={{ height: "40px", minWidth: "80px", padding: "0 16px" }}
                        >
                            {show ? "Hide" : "Show"}
                        </Button>
                        <Button
                            size={Button.Sizes?.ICON ?? "small"}
                            color={status === "success" ? Button.Colors?.GREEN ?? "green" : (status === "error" ? Button.Colors?.RED ?? "red" : Button.Colors?.BRAND ?? "brand")}
                            look={Button.Looks?.FILLED ?? "filled"}
                            onClick={handleValidate}
                            disabled={validating || !apiKey}
                            style={{ height: "40px", minWidth: "80px", padding: "0 16px" }}
                        >
                            {validating ? "Testing..." : (status === "success" ? "Valid!" : (status === "error" ? "Failed" : "Test Key"))}
                        </Button>
                    </div>
                    {status === "error" && (
                        <div style={{ marginTop: "8px", color: "var(--text-danger)" }}>
                            {errorMsg}
                        </div>
                    )}
                    {status === "success" && (
                        <div style={{ marginTop: "8px", color: "var(--text-positive)" }}>
                            API Key is valid and working!
                        </div>
                    )}
                </div>
            </div>
        </Forms.FormSection>
    );
}
