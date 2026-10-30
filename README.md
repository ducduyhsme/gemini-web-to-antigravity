<p align="center">
  <img src="assets/gemini.png" width="400" alt="Gemini Logo">
</p>

<p align="center">
  <a href="https://github.com/ducduyhsme/gemini-web-to-api/stargazers"><img src="https://img.shields.io/github/stars/ducduyhsme/gemini-web-to-api?style=flat-square&color=gold&label=stars" alt="Stars"></a>
  <a href="https://golang.org/"><img src="https://img.shields.io/badge/Go-1.21+-00ADD8?style=flat-square&logo=go" alt="Go Version"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js" alt="Node Version"></a>
  <a href="https://www.docker.com/"><img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker" alt="Docker"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-orange?style=flat-square" alt="License"></a>
  <img src="https://img.shields.io/badge/GUI-Desktop%20App-blueviolet?style=flat-square" alt="Desktop GUI">
  <img src="https://img.shields.io/badge/Antigravity-Custom%20Provider-success?style=flat-square" alt="Antigravity Custom Provider">
</p>

<h1 align="center">Gemini Web To API & Antigravity Suite 🚀</h1>

<p align="center">
  <b>Universal AI Gateway & Desktop Control Center</b><br/>
  An enhanced, full-featured suite transforming Google Gemini web interface into standardized REST APIs (OpenAI, Claude, Gemini) with zero required API keys.<br/>
  Featuring a <b>Zero-CLI Desktop GUI Dashboard</b>, <b>Antigravity Custom Provider Bridge</b>, <b>Multi-Account Isolation</b>, and a <b>1-Click Chrome Cookie Sync Extension</b>.
</p>

<p align="center">
  <b>Maintained & Developed by <a href="https://github.com/ducduyhsme">Tạ Đức Duy (@ducduyhsme)</a></b><br/>
  <i>Based on the original reverse-engineering foundation by <a href="https://github.com/ntthanh2603">Nguyễn Tuấn Thành (@ntthanh2603)</a>.</i>
</p>

> [!NOTE]
> This project is intended for **research, educational, and developer workflow enhancement purposes only**. Please use responsibly.
> This software is not affiliated with Google. It uses web session cookies and is distributed under the [MIT License](LICENSE).

---

## 🌟 What Makes This Suite Special?

While the core reverse-engineering engine converts Gemini web sessions into REST APIs, this **Suite Edition** introduces major architectural enhancements to provide a production-grade, seamless developer experience:

- 🖥️ **Zero-CLI Desktop GUI Dashboard**: Eliminates multiple command prompt / black terminal windows. Everything is controlled from a single modern desktop app (Windows Native App Mode) with **zero CLI popups**.
- 🪐 **Antigravity Custom Provider Bridge**: Google Antigravity (Antigravity IDE & CLI `agy`) officially only supports stock Gemini. This bridge enables you to **use any external AI provider** (OpenAI, Claude, DeepSeek, OpenRouter, Groq, Ollama) directly inside Antigravity! Custom models are dynamically injected into the IDE's model picker with full 2-way protocol and tool-call translation.
- 👥 **Multi-Account Concurrent Isolation**: Run multiple Google accounts simultaneously on dedicated ports (e.g., `4981`, `4982`, `4983`...) with isolated cookie jars (`instances/acc_xxx/`) and zero account crossover.
- 🧩 **Chrome Extension (1-Click Sync)**: Included in [`chrome-extension/`](chrome-extension/). Extract and push fresh Google cookies directly into any running instance without restarting the server.
- 📜 **Unified Real-Time Log Hub**: All daemon stdout and stderr logs stream live into a single console via Server-Sent Events (SSE) with source filtering, search, and auto-scroll.
- 🌉 **Universal AI Bridge**: One engine exposes native **OpenAI** (`/openai/v1`), **Claude** (`/claude/v1`), and **Gemini** (`/gemini/v1beta`) endpoints.
- 🎨 **Multimodal & Advanced Features**: Text-to-image with `b64_json`, reference image inputs, text-to-video (`.mp4`), Canvas documents, music generation, and reasoning/thinking level control.

---

## 🏛️ Architecture & Flow

```text
┌────────────────────────────────────────────────────────┐
│                   Antigravity IDE                      │
│        (Model Selection: Stock & Custom Models)        │
└───────────────────────────┬────────────────────────────┘
                            │ jetski.cloudCodeUrl: http://127.0.0.1:50998
                            ▼
┌────────────────────────────────────────────────────────┐
│         Antigravity Custom Provider Bridge             │
│            (Port 50998 - Bidirectional Proxy)          │
└───────┬───────────────────────────────┬────────────────┘
        │ OpenAI-Compatible             │ Anthropic Claude
        ▼                               ▼
┌───────────────┐ ┌───────────────┐ ┌────────────────────┐
│ DeepSeek /    │ │ Gemini Web-   │ │ Anthropic Claude   │
│ OpenRouter /  │ │ to-API Local  │ │ Claude 3.7 /       │
│ Groq / Ollama │ │ (Port 4981+)  │ │ Claude 3.5 Sonnet  │
└───────────────┘ └───────┬───────┘ └────────────────────┘
                          │
                          ▼
            ┌───────────────────────────┐
            │    Google Gemini Web      │
            │  (Cookie Authentication)  │
            └───────────────────────────┘
```

---

## ⚡ Quick Start

### 🪟 Method 1 — Windows Desktop GUI (Recommended)

1. Clone this repository:
   ```bash
   git clone https://github.com/ducduyhsme/gemini-web-to-api.git
   cd gemini-web-to-api
   ```
2. Double-click **`start.bat`**.
3. The Desktop GUI opens immediately:
   - **No terminal windows pop up** (all processes run hidden in the background).
   - Manage Google accounts, Antigravity models, and real-time logs from one clean interface.

---

### 🐳 Method 2 — Docker Run (Standalone Engine)

```bash
docker run -d -p 4981:4981 \
  -e GEMINI_COOKIES="your_complete_cookie_header" \
  -e GEMINI_REFRESH_INTERVAL=1440 \
  -e GEMINI_MAX_RETRIES=3 \
  -e GEMINI_TEMPORARY=false \
  -e APP_ENV=production \
  -v ./cookies:/home/appuser/.cookies \
  --name gemini-web-to-api \
  --restart unless-stopped \
  ghcr.io/ntthanh2603/gemini-web-to-api:latest
```

---

### 🐹 Method 3 — Build from Source (Go + Node.js)

```bash
# 1. Build the Go engine binary
go build -o gemini-web-to-api.exe ./cmd/server

# 2. Launch the GUI management server
node gui/server.js
# Access the web interface at http://127.0.0.1:49000
```

---

## 🖥️ Desktop GUI Breakdown

The GUI is designed with a modern dark theme and divided into 4 dedicated tabs:

| Tab | Features |
| :--- | :--- |
| **Dashboard** | Live system health cards, 1-click Antigravity IDE connection toggle, 1-click Bridge server start/stop, and quick account action buttons. |
| **Google Accounts** | Add and manage Google accounts. Each account runs on its own dedicated port (4981, 4982...) with independent cookie caching and real-time status indicators. |
| **Antigravity Custom Provider & Models** | Add external providers (OpenAI-compatible or Claude), save reusable Model IDs, perform live API latency tests, and inject custom models into Antigravity IDE. |
| **Unified Real-time Logs** | Live stream of all stdout and stderr logs from the Bridge proxy, Google account instances, and background processes via Server-Sent Events (SSE). |

---

## 🪐 Using External AI Providers with Antigravity

Google Antigravity is a powerful AI coding harness, but it only offers Google Gemini models by default. This suite bridges Antigravity with any external AI provider:

1. In the Desktop GUI, navigate to the **Antigravity Provider & Models** tab.
2. Click **+ Add Custom Model**:
   - **Protocol**: Select `OpenAI-Compatible` or `Claude`.
   - **Base URL**: e.g., `https://api.deepseek.com/v1`, `https://openrouter.ai/api/v1`, `http://localhost:11434/v1` (Ollama), or local Gemini Web-to-API instance (`http://127.0.0.1:4982/openai/v1/chat/completions`).
   - **API Key**: Enter your external provider's API key.
   - **Model ID**: Enter your model ID (e.g. `deepseek-chat`, `claude-3-7-sonnet-20250219`, `gpt-4o`). The ID is automatically saved to your history for quick 1-click reuse.
3. Click **Test Connection** to verify latency and connectivity.
4. Click **Connect Antigravity IDE** (or toggle on the Dashboard).
5. Reload or open Antigravity IDE: your custom model appears right in the chat model selection menu!

### Configuration Presets

| Provider | Protocol | Base URL | Sample Model ID |
| :--- | :---: | :--- | :--- |
| **Anthropic Claude** | `Claude` | `https://api.anthropic.com/v1` | `claude-3-7-sonnet-20250219`<br>`claude-3-5-sonnet-20241022` |
| **OpenAI Official** | `OpenAI` | `https://api.openai.com/v1` | `gpt-4o`<br>`o3-mini` |
| **DeepSeek** | `OpenAI` | `https://api.deepseek.com/v1` | `deepseek-chat`<br>`deepseek-reasoner` |
| **OpenRouter** | `OpenAI` | `https://openrouter.ai/api/v1` | `anthropic/claude-3.7-sonnet`<br>`deepseek/deepseek-r1` |
| **Ollama (Local)** | `OpenAI` | `http://localhost:11434/v1` | `qwen2.5-coder:32b`<br>`deepseek-r1:14b` |
| **Groq Cloud** | `OpenAI` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |

---

## 🧩 Chrome Extension (1-Click Cookie Sync)

Located in [`chrome-extension/`](chrome-extension/):

1. Open Chrome or Edge and go to `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `chrome-extension/` directory.
4. Open the extension popup, enter the target port (e.g., `4981`), and click **Sync Cookie Now**.
5. The local instance hot-reloads the session instantly without restarting.

---

## 🧪 API Usage Examples

### 1. OpenAI SDK (Python)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:4981/openai/v1",
    api_key="not-needed"
)

response = client.chat.completions.create(
    model="gemini-auto",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)
```

### 2. Claude SDK (Python)

```python
from langchain_anthropic import ChatAnthropic

llm = ChatAnthropic(
    base_url="http://localhost:4981/claude",
    model="gemini-auto",
    api_key="not-needed"
)

response = llm.invoke("Explain quantum computing in simple terms.")
print(response.content)
```

### 3. Google GenAI Native SDK (Python)

```python
from google import genai

client = genai.Client(
    api_key="not-needed",
    http_options={
        "base_url": "http://localhost:4981/gemini",
        "api_version": "v1beta",
    },
)

response = client.models.generate_content(
    model="gemini-auto",
    contents="Write a poem about open source software.",
)
print(response.text)
```

### 4. cURL

```bash
curl -X POST http://localhost:4981/openai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-auto",
    "messages": [{"role": "user", "content": "What is AI?"}],
    "stream": false
  }'
```

---

## 🛠️ Configuration & Environment Variables

| Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `GEMINI_COOKIES` | ✅ Yes | — | Complete Cookie request header copied from Gemini Web |
| `GEMINI_AUTH_USER` | ❌ No | — | Account slot from Gemini URL, e.g. `1` for `/u/1/app` |
| `GEMINI_REFRESH_INTERVAL` | ❌ No | `1440` | Cookie rotation interval in minutes (min `10`) |
| `GEMINI_MAX_RETRIES` | ❌ No | `3` | Max retry attempts upon upstream API failures |
| `GEMINI_TEMPORARY` | ❌ No | `false` | Enable stateless/incognito mode for all requests |
| `GEMINI_COOKIE_API_KEY` | ❌ No | `gemini-cookie-sync` | Bearer token for `POST /admin/cookies` hot sync |
| `PORT` | ❌ No | `4981` | Server listening port |
| `RATE_LIMIT_ENABLED` | ❌ No | `false` | Enable or disable rate limiting |

---

## 🔒 Security & Privacy

- **Zero Credential Leaks**: `.gitignore` is strictly pre-configured to ignore all `.env` files, `accounts/*.env`, `accounts/accounts.json`, `instances/`, `.cookies/`, and log files. Your Google credentials and API keys will never be accidentally committed to git.
- **Local Isolation**: All Bridge proxies and GUI services bind strictly to `127.0.0.1` by default, preventing unintended network exposure.

---

## 📘 Interactive API Documentation

Visit **`http://localhost:4981/docs`** while the engine is running for interactive OpenAPI documentation powered by [Scalar](https://scalar.com).

![Scalar UI](assets/swagger.png)

---

## 🙏 Credits & Acknowledgments

This project is built upon the excellent foundation created by the open-source community:

- **Original Engine Foundation**: Created by **[Nguyễn Tuấn Thành (@ntthanh2603)](https://github.com/ntthanh2603)** — [gemini-web-to-api](https://github.com/ntthanh2603/gemini-web-to-api). We express our sincere appreciation for the foundational reverse-engineering work and Go server architecture.
- **Desktop GUI & Antigravity Suite Enhancements**: Developed and maintained by **[Tạ Đức Duy (@ducduyhsme)](https://github.com/ducduyhsme)**.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
