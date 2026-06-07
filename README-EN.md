# CC - Your Desktop AI Companion

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.1-blue)]()
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2B-lightgrey)]()
[![Electron](https://img.shields.io/badge/electron-42-blue)]()

> An open-source AI companion that lives on your Windows desktop — with a 3D character,
> long-term memory, knowledge graph, and deep Feishu/WeChat integration.

![CC Screenshot](./assets/cc演示界面.png)

---

## 🎬 Demo

![CC Demo](./assets/demo.gif)

![AI Task Execution](./assets/execution.gif)

📹 [Download Demo Video](./assets/飞书消息excel表格转换飞书表格演示.mp4) (Feishu Excel → Bitable full flow)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎭 **3D Character** | Mixamo model, expression engine, custom GLB upload |
| 🧠 **Long-term Memory** | 500+ node knowledge graph, TF-IDF semantic search, hot/warm/cold tiered storage |
| 👤 **User Profile** | Auto-extracts preferences, rules, work habits from conversations |
| 🤖 **22 LLM Providers** | OpenAI-compatible API — DeepSeek, Qwen, GLM, Kimi, and more |
| 📨 **Feishu** | WebSocket real-time messaging, file/image, Bitable, Excel→Bitable one-click |
| 💬 **WeChat Plugin** | wxhelper integration for message reading |
| 🔌 **Plugin System** | Drag-and-drop `.cc-plugin.js`, extensible to any platform |
| 🛠 **Tool Use** | File ops, web search, PPT generation, Python execution |
| 🤖 **Auto Tasks** | Auto-scans Feishu for pending tasks, generates reports |
| ⏰ **Scheduled** | Auto-execution at 9/11/15/17/19/24 daily |
| 🎤 **TTS / STT** | Edge TTS + local faster-whisper voice recognition |

## 📸 Screenshots

|<img src="./assets/cc记忆面板.png" width="260"/>|<img src="./assets/cc可视化知识图谱.png" width="260"/>|<img src="./assets/cc知识库.png" width="260"/>|
|:---:|:---:|:---:|
| Memory Panel | Knowledge Graph | Knowledge Base |

|<img src="./assets/cc经验教训面板.png" width="260"/>|<img src="./assets/cc支持22种大模型api.png" width="260"/>|<img src="./assets/飞书微信插件面板.png" width="260"/>|
| Lessons Learned | 22 LLM Providers | Plugin System |

## 🚀 Quick Start

### Download Installer

| Mirror | Download |
|--------|----------|
| 🇨🇳 **Gitee** (China) | [Releases](https://gitee.com/mabin-cici/cc-smart-companion-public/releases) |
| 🌍 **GitHub** (Global) | [Releases](https://github.com/MABIN-ship-it/-cc-smart-companion/releases) |

Download `CC你的终身好友 Setup 1.0.1.exe` and double-click to install.

Requires: **Windows 10/11 x64**

### Build from Source

```bash
# China
git clone https://gitee.com/mabin-cici/cc-smart-companion-public.git
# Global
git clone https://github.com/MABIN-ship-it/-cc-smart-companion.git

cd cc-smart-companion
npm install
npm run build
npx electron .
```

Configure your LLM API Key on first launch.

## 🧱 Tech Stack

`Electron 42` `React 18` `Three.js 0.184` `Vite 5` `Vitest` `Playwright`

## 📁 Structure

```
src/
  components/    React UI (chat, panels, toolbar, onboarding)
  services/      Business logic (feishu, memory, AI orchestration, plugins)
  knowledge/     Knowledge graph (storage, extraction, graph model)
  store/         Global state (useReducer + Context)
electron/        Main process + IPC handlers + WebSocket
e2e/             Playwright E2E tests (7 suites, 40s)
```

## 🔌 Plugin Development

CC uses `.cc-plugin.js` files. Drag and drop to install:

```javascript
module.exports = {
  id: 'my-platform',
  name: 'My Platform',
  icon: '🔧',
  subtitle: 'Messaging & Contacts',
  tools: [{ name: 'do_something', description: 'What it does', input_schema: {} }],
  executors: { do_something: async (input) => { /* logic */ } },
};
```

See the in-app developer guide in the Toolbox for full details.

## 🧪 Tests

```bash
npm test           # 237 unit tests (~20s)
npm run test:e2e   # 7 E2E tests (~40s)
```

## 🤝 Contributing

Issues and PRs welcome.

## 📄 License

MIT © 2026 Mabincici (马斌)

---

📧 Contact: Mabincici <1357502777@qq.com>
