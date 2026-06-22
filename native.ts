import { IpcMainInvokeEvent } from "electron";

export async function basGeminiFetch(_: IpcMainInvokeEvent, model: string, apiKey: string, prompt: string) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });
        const data = await res.json();
        return { ok: res.ok, status: res.status, data };
    } catch (e: any) {
        return { ok: false, status: 500, error: e.message };
    }
}

export async function basWebhookFetch(_: IpcMainInvokeEvent, url: string, payload: any) {
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
        return { ok: res.ok, status: res.status };
    } catch (e: any) {
        return { ok: false, status: 500, error: e.message };
    }
}
