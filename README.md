# ChatSummaries

A powerful and intelligent message summarization plugin for Vencord, powered by Google's Gemini AI.

## ✨ Features
* **Smart Summarization:** Automatically collects and summarizes hundreds of Discord channel messages using Gemini AI.
* **Anti-Drop Fetching:** Bypasses Discord's memory virtualization to ensure no messages are missed during bulk collection.
* **Export & Forwarding:** Export collected chat logs as a `.txt` file, or automatically forward the AI summary to a specific Discord channel via Webhook.
* **Per-channel Configuration:** Set unique custom prompts and instructions for specific channels.

---

## 📥 Installation

1. **Prerequisites:** Make sure you have [Git](https://git-scm.com/) and [Node.js / pnpm](https://pnpm.io/installation) installed.
2. Open your terminal and navigate to your Vencord user plugins directory. (If Vencord is in your home folder):
   ```bash
   cd %USERPROFILE%/Vencord/src/userplugins
   ```
3. Clone this repository:
   ```bash
   git clone https://github.com/komi-juru/ChatSummaries.git ChatSummaries
   ```
4. Navigate back to the Vencord root directory and build the client:
   ```bash
   cd ../..
   pnpm install
   pnpm build
   ```
5. **Completely restart Discord** (Right-click the Discord icon in your system tray -> "Quit Discord", then reopen).
6. Go to **User Settings > Plugins**, search for **ChatSummaries**, and enable it!

---

## 🔄 Updating

If you already have the plugin installed and want to fetch the latest updates, open your terminal and run:

```bash
cd %USERPROFILE%/Vencord/src/userplugins/ChatSummaries && git pull && cd ../.. && pnpm build
```

After the build finishes, **completely restart Discord** to apply the changes.

---

## ⚠️ Important Notes
* **Gemini API Key:** You must obtain a free Gemini API key from [Google AI Studio](https://aistudio.google.com/) to use this plugin. Enter the API key in the plugin settings to enable the summarize button.
* **AdBlock Users:** If you are using an adblocker like AdGuard, API requests to Google might be blocked. **You must add Discord to your AdGuard exception/allow list** for the plugin to work correctly.
