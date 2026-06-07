# CC - Your Desktop AI Companion | 你的桌面 AI 伙伴

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.1-blue)]()
[![Platform](https://img.shields.io/badge/platform-Windows%2010%2B-lightgrey)]()
[![Electron](https://img.shields.io/badge/electron-42-blue)]()

> An open-source AI companion that lives on your Windows desktop — with a 3D character,
> long-term memory, knowledge graph, and deep Feishu/WeChat integration.
>
> 一个运行在 Windows 桌面的开源 AI 伴侣——有 3D 角色、有长期记忆、
> 有自己的知识图谱、能连接飞书和微信帮你干活。

![CC Screenshot](./assets/cc演示界面.png)

---

## 🎬 Demo | 演示

![CC Demo](./assets/demo.gif)

![AI Task Execution](./assets/execution.gif)

📹 [下载演示视频](./assets/飞书消息excel表格转换飞书表格演示.mp4)（飞书 Excel → 多维表格 全流程）

---

## ✨ Features | 功能

| English | 中文 |
|---------|------|
| 🎭 **3D Character** — Mixamo model, expression engine, custom GLB upload | 🎭 **3D 角色** — Mixamo 模型、表情引擎、支持上传自定义角色 |
| 🧠 **Long-term Memory** — 500+ node knowledge graph, TF-IDF semantic search, hot/warm/cold tiered storage | 🧠 **长期记忆** — 500+ 节点知识图谱、TF-IDF 语义检索、热/温/冷三级存储 |
| 👤 **User Profile** — Auto-extracts preferences, rules, work habits from conversations | 👤 **用户画像** — 对话中自动提取偏好、规则、工作习惯 |
| 🤖 **22 LLM Providers** — OpenAI-compatible API, switch between DeepSeek / Qwen / GLM / Kimi & more | 🤖 **22 种大模型** — 兼容 OpenAI API 格式，自由切换 DeepSeek / Qwen / GLM / Kimi 等 |
| 📨 **Feishu** — WebSocket real-time messaging, file/image transfer, Bitable creation, Excel→Bitable one-click | 📨 **飞书** — WebSocket 实时消息、文件/图片收发、多维表格创建、Excel一键转多维表格 |
| 💬 **WeChat Plugin** — wxhelper integration for message reading | 💬 **微信插件** — wxhelper 接入，读取微信消息 |
| 🔌 **Plugin System** — Drag-and-drop `.cc-plugin.js`, extensible to any platform | 🔌 **插件系统** — 拖拽 `.cc-plugin.js` 一键安装，可扩展任意平台 |
| 🛠 **Tool Use** — File ops, web search, PPT generation, Python execution | 🛠 **工具调用** — 文件操作、网页搜索、PPT 生成、Python 执行 |
| 🤖 **Auto Tasks** — Scans Feishu for pending tasks, generates reports, processes approvals | 🤖 **主动接任务** — 自动扫描飞书待办、生成日报周报、处理审批 |
| ⏰ **Scheduled** — Auto-execution at 9/11/15/17/19/24 daily | ⏰ **定时执行** — 每日 9/11/15/17/19/24 点自动扫描 |
| 🎤 **TTS / STT** — Edge TTS + local faster-whisper voice recognition | 🎤 **语音交互** — Edge TTS 语音合成 + 本地语音识别 |

## 📸 Screenshots | 截图

|<img src="./assets/cc记忆面板.png" width="260"/>|<img src="./assets/cc可视化知识图谱.png" width="260"/>|<img src="./assets/cc知识库.png" width="260"/>|
|:---:|:---:|:---:|
| Memory Panel | Knowledge Graph | Knowledge Base |

|<img src="./assets/cc经验教训面板.png" width="260"/>|<img src="./assets/cc支持22种大模型api.png" width="260"/>|<img src="./assets/飞书微信插件面板.png" width="260"/>|
| Lessons Learned | 22 LLM Providers | Plugin System |

|<img src="./assets/cc项目面板.png" width="260"/>|<img src="./assets/cc可视化遗忘设置面板.png" width="260"/>|
| Project Panel | Memory Settings |

## 🚀 Quick Start | 快速开始

### 下载安装包（推荐）

| 平台 | 下载 |
|------|------|
| 🇨🇳 **Gitee**（国内用户） | [Releases](https://gitee.com/mabin-cici/cc-smart-companion-public/releases) |
| 🌍 **GitHub**（海外用户） | [Releases](https://github.com/MABIN-ship-it/-cc-smart-companion/releases) |

下载 `CC你的终身好友 Setup 1.0.1.exe`，双击一键安装。

系统要求：**Windows 10/11 x64**

### 源码运行

```bash
# 国内
git clone https://gitee.com/mabin-cici/cc-smart-companion-public.git
# 海外
git clone https://github.com/MABIN-ship-it/-cc-smart-companion.git

cd cc-smart-companion
npm install
npm run build
npx electron .
```

首次启动配置 API Key 后即可使用（支持 22 家大模型）。

## 🧱 Tech Stack | 技术栈

`Electron 42` `React 18` `Three.js 0.184` `Vite 5` `Vitest` `Playwright`

## 📁 Structure | 项目结构

```
src/
  components/    React UI (chat, panels, toolbar, onboarding)
  services/      Business logic (feishu, memory, AI orchestration, plugins)
  knowledge/     Knowledge graph (storage, extraction, graph model)
  store/         Global state (useReducer + Context)
electron/        Main process + IPC handlers + WebSocket
e2e/             Playwright E2E tests (7 suites, 40s)
```

## 🔌 Plugin Development | 插件开发

CC uses `.cc-plugin.js` files. Drag and drop to install.

CC 使用 `.cc-plugin.js` 插件，拖拽安装：

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

详见工具箱内的开发指南。

## 🧪 Tests | 测试

```bash
npm test           # 237 unit tests (~20s)
npm run test:e2e   # 7 E2E tests (~40s)
```

## 🤝 Contributing | 贡献

Issues and PRs welcome. | 欢迎提交 Issue 和 PR。

## 📄 License | 许可证

MIT © 2026 Mabincici (马斌)

---

📧 Contact | 联系：Mabincici <1357502777@qq.com>　|　🎵 抖音交流群：253968290900
