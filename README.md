# ChatSummaries

AI chat summarization for vencord

<img width="654" height="772" alt="image" src="https://github.com/user-attachments/assets/b6719b69-e10c-4cf7-9d4d-f0a79304bf64" />

## Features

- **Smart Summarization** – Automatically collects Discord channel messages and summarizes them using Gemini AI.
- **Export & Forwarding** – Export collected chat logs as a `.txt` file, or automatically forward the AI summary to a specific Discord channel via Webhook.
- **Per-Channel Settings** – Set unique custom prompts and instructions for specific channels.

---

## Install

Building Vencord from source is required.

### 1. Install prerequisites

Install [**Git**](https://git-scm.com/) and [**Node.js**](https://nodejs.org/), then install `pnpm`:

```bash
npm install -g pnpm
```

### 2. Clone Vencord

```bash
git clone https://github.com/Vendicated/Vencord
```

### 3. Install ChatSummaries
Create the userplugins folder if it doesn't exist.
```bash
cd Vencord/src/userplugins
git clone https://github.com/komi-juru/AlwaysTranslate.git alwaysTranslate
pnpm build
```

---

## Update

```bash
cd Vencord/src/userplugins/ChatSummaries
pnpm build
```

---

## API Keys

Configure your API key in the plugin settings.

- **Gemini** – https://aistudio.google.com/api-keys

---

## Privacy

This plugin does not collect personal data. However, messages are sent to your chosen AI API; please use caution in channels with sensitive information.
> **Disclaimer:** This plugin is not officially supported by Vencord.
