# CC App 开发规范与项目知识库

> 最后更新：2026-05-30 | 测试：237 单元 + 7 E2E

---

## 一、项目概述

**CC智能伙伴** 是一款 Windows 桌面 AI 伴侣应用。

- **技术栈**：Electron 42 + React 18 + Three.js 0.184 + Vite 5
- **AI 后端**：兼容 OpenAI API 格式的 LLM（16 家供应商）
- **飞书集成**：WebSocket 实时消息 + 多维表格 + 云文档 + 消息收发
- **测试**：Vitest 237 单元测试 + Playwright 7 E2E 测试

---

## 二、目录结构（极其重要！）

```
汇总\CC-App\           ← 源码+开发目录（在这里改代码）
  electron/                          ← Electron 主进程
    main.js                           ← IPC handlers + 飞书集成 + 文件操作
    preload.js                        ← contextBridge API 桥接
    feishu-ws.js                      ← 飞书 WebSocket 客户端
  src/
    services/                         ← 业务逻辑（40个模块）
      feishu.js                       ← 飞书 API 封装（70+函数）
      feishuTools.js                  ← 飞书工具定义+执行器（15个工具）
      sessionManager.js               ← 聊天会话管理（cc_sessions）
      knowledgeBase.js                ← 知识库（TF-IDF 搜索+RAG）
      fileReader.js                   ← 统一文件读取引擎
      excelParser.js                  ← Excel→多维表格解析器
      bitableTemplates.js             ← 业务场景模板库
    components/                       ← React UI 组件
      ChatInterface.jsx               ← 主交互界面 ⚠️核心保护
      ChatBubbleLayer.jsx             ← 聊天气泡+思考面板 ⚠️核心保护
      ToolCallCard.jsx                ← 工具调用卡片 ⚠️核心保护
      InputBar.jsx                    ← 底部输入栏（<input>，非<textarea>）
      OnboardingWizard.jsx            ← 引导向导（5步）
      StageBackground.jsx             ← 2D全息舞台背景（Canvas）
      CharacterScene.jsx              ← 3D角色场景（Three.js）
    store/AppContext.jsx              ← 全局状态管理
  e2e/                                ← E2E 测试
    helpers/
      electron.js                     ← Playwright 开发版启动工具
      running-app.js                  ← Playwright 运行版启动工具
    mocks/feishu-mock.js              ← 飞书 API Mock（30+端点）
  deploy.bat                          ← 一键部署脚本

release/\              ← 运行版（用户双击 electron.exe）
  electron.exe                        ← 独立 Electron 运行时
  resources/app/
    electron/                         ← ← ← 部署目标！main.js/preload.js/feishu-ws.js
    dist/                             ← ← ← 部署目标！前端构建产物
    node_modules/                     ← 含 @larksuiteoapi/node-sdk
  cc-debug.bat                        ← 调试模式启动（端口9223）
```

**⚠️ 最常犯的错误**：改了 `汇总/CC-App/electron/` 的代码但忘记同步到 `release//resources/app/electron/`。

---

## 三、连接运行版 CC 做真实测试

### 启动调试模式
```
双击 release/\cc-debug.bat
```
这会以 `--remote-debugging-port=9223` 启动 CC，Claude 可以通过 CDP 直接操作。

### Claude 连接代码
```javascript
const { chromium } = require('playwright');
const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
const page = browser.contexts()[0].pages()[0];

// 绕过 Three.js Canvas 遮挡的点击
await page.evaluate((text) => {
  const els = document.querySelectorAll('*');
  for (const el of els) {
    if (el.textContent && el.textContent.trim() === text) { el.click(); return; }
  }
}, '记忆');

// 在输入框输入文字
const input = page.locator('input:not([type]), textarea').first();
await input.click({ force: true });
await input.fill('你好');
await page.keyboard.press('Enter');
```

### ⚠️ Three.js Canvas 遮挡问题
3D 角色场景的 `<canvas data-engine="three.js r184">` 覆盖在 UI 上方，拦截所有点击。必须用 `page.evaluate()` 执行 JavaScript 点击，或使用 `{ force: true }`。

### ⚠️ 输入框是 `<input>` 不是 `<textarea>`
CC 的输入框在 [InputBar.jsx](src/components/InputBar.jsx) 中是 `<input>` 元素，选择器用 `input:not([type])` 匹配。

---

## 四、引导界面跳过

App.jsx 根据 `localStorage.getItem('cc_onboarding_done') === '1'` 判断是否显示引导。测试时直接设置：
```javascript
await page.evaluate(() => { localStorage.setItem('cc_onboarding_done', '1'); });
await page.reload();
```

---

## 五、部署流程

### 一键部署
```bash
# 双击或运行
汇总\CC-App\deploy.bat
```

### 手动部署步骤
```bash
cd 汇总\CC-App
npm test                   # 237 测试
npm run build              # 前端构建
# 部署到运行版
cp -r dist/* "release/\resources\app\dist\"
cp electron/main.js "release/\resources\app\electron\main.js"
cp electron/preload.js "release/\resources\app\electron\preload.js"
cp electron/feishu-ws.js "release/\resources\app\electron\feishu-ws.js"
```

### 用户数据位置
- 飞书配置：`%APPDATA%/cc-smart-companion/cc_feishu_config.json`
- 飞书会话：`%APPDATA%/cc-smart-companion/cc_feishu_session.json`
- 前端 localStorage 在渲染进程的 LevelDB 中

---

## 六、测试体系

### 单元测试（237 个，13 文件）
```bash
npm test                    # Vitest run，~20s
```

### E2E 测试（7 个）
```bash
npm run test:e2e            # Playwright，~40s，单 worker
```

### Pre-commit 自动执行
```
单元测试(237) → E2E测试(7) → 全部通过才允许提交
失败跳过：git commit --no-verify
```

### 连接真实 CC 的验证流程
1. 用户用 `cc-debug.bat` 启动 CC
2. Claude 连接 `http://127.0.0.1:9223`
3. 依次验证：记忆面板 → 知识图谱 → 人格面板 → 工具箱 → 聊天记录 → AI对话
4. 飞书验证：检查 "来自飞书" 消息数 → 发送消息到飞书 → 检查飞书是否收到

---

## 七、核心功能保护（严禁修改内部逻辑）

| 文件 | 保护内容 |
|------|---------|
| ChatBubbleLayer.jsx | 流式思考输出、折叠/展开、与正文分离 |
| ChatInterface.jsx | 消息气泡、流式输出、代码高亮、文件显示 |
| ToolCallCard.jsx | 工具调用状态更新、参数格式化、折叠/展开 |

---

## 八、飞书架构

```
飞书服务器
  ↕ WebSocket
feishu-ws.js (主进程, @larksuiteoapi/node-sdk WSClient)
  ↕ IPC feishu:message
main.js → preload.js → 渲染进程
  ↕ dispatchFeishuMessage
ChatInterface.jsx → AI处理链
  ↕ 工具调用
feishuTools.js → feishu.js → feishuApi() → 飞书开放平台 API
```

关键 IPC handlers：`feishu:configure`, `feishu:status`, `feishu:uploadImage`, `feishu:uploadImageBase64`, `feishu:downloadResource`, `feishu:getSession`, `feishu:refreshSession`

---

## 九、字段类型映射（25+种）

飞书多维表格支持的全部字段类型定义在 [feishuTools.js](src/services/feishuTools.js) 的 `FIELD_TYPE_MAP` 中。`inferFieldType(fieldName, sampleValues)` 自动推断类型。

---

## 十、已知问题和修复

### 2026-05-30（多维表格全链路修复）

| # | 问题 | 根因 | 修复文件 | 修复方式 |
|---|------|------|---------|---------|
| 1 | 飞书消息收不到 | 运行版 electron/ 未同步 | deploy.bat | 同步 main.js/preload.js/feishu-ws.js |
| 2 | 飞书文件消息被丢弃 | `extractTextFromEvent` 对文件返回空字符串 → ChatInterface `if(!text)return` 跳过 | feishu.js L651-655 | 对 file/image 类型返回 `[文件: xxx]` |
| 3 | 退出重进飞书消息开新话题 | `initialState` 的 `activeSessionId` 和 `messages` 都是空 | AppContext.jsx | 启动时预加载会话+消息到 initialState |
| 4 | 多维表格建了但数据写不进去 | ① `data.table.table_id` 路径错误（应为 `data.table_id`）② 日期字符串飞书拒收（需毫秒时间戳）③ `wroteCount` 用 `records?.length` 判断，records 是字符串时永远>0 | feishuTools.js L1054, feishu.js L407 | 修正路径+日期自动转时间戳+wroteCount 用实际返回数 |
| 5 | CC 建完表后瞎试写数据 | 没有可靠的批量写工具，CLI的`+record-batch-create`在Windows下有JSON引号转义问题 | feishuTools.js | 新增 `feishu_write_records` 工具，走 `batchAddBaseRecords` |
| 6 | CLI 的 `+record-batch-create` 永远写不进去 | Windows命令行JSON引号转义无解 | main.js L1201 | 拦截此命令走原生API `feishuApiRaw` |
| 7 | CC 建表时展示一堵墙的工具调用 | 工具粒度太细（下载→解析→建库→建表→加字段→写数据→建视图），每步一个卡片 | promptBuilder.js + feishuTools.js | 禁用 `feishu_base_operation` 写操作，强制走 `feishu_create_bitable` 一步到位 |
| 8 | CC 写Python/PowerShell解析老xls | AI 固有行为模式，提示词难以约束 | promptBuilder.js L387 | execute prompt 加"老xls走导入云文档，严禁写脚本" |
| 9 | CC 数据没写进去就停了 | 没有"不达目标不许停"约束 | promptBuilder.js L388 | execute prompt 加"不达目标不许停"规则 |
| 10 | `feishu_cli` 命令前缀缺失 | AI 写 `table +xxx` 而非 `base +xxx` | main.js L1206 | 自动纠正：`/^(table|record|field)\s/ → 'base ' + cmd` |

### 2026-05-29
11. **计划模式转执行后反复要求审批** — 添加了计划模式与执行模式铁律
12. **思考过程输出全英文** — promptBuilder 添加了中文思考指令
13. **文件生成工具返回成功但文件不存在** — 添加了文件存在性验证
14. **用户画像垃圾数据** — userProfile.js 添加了校验

---

## 十一、提交规范

格式：`<type>: 中文描述`

| type | 含义 |
|------|------|
| feat | 新功能 |
| fix | 修复 bug |
| docs | 文档修改 |
| test | 测试相关 |
| chore | 构建/工具 |

---

## 十二、自动化工作流

### 有 `1` 标志 → 全链路部署
`npm test → npm run build → npm run test:e2e → git commit → git push → 部署到release/`

### 无 `1` 标志 → 仅提交
`npm test → npm run build → git commit → git push`

### 每次 commit 自动执行
`237 单元测试 → 7 E2E 测试 → 全部通过才允许提交`

---

## 十三、测试验证清单（Claude 每次改动后必须执行）

当用户用 `cc-debug.bat` 启动 CC 后，连接端口 9223 逐项验证：

1. **记忆面板** — 点击"记忆"，检查内容是否正常、无乱码
2. **知识图谱看板** — 点击"知识图谱"，检查节点/关系是否正确
3. **人格面板** — 点击"人格"，检查用户画像字段是否正确
4. **工具箱** — 点击"工具箱"，检查飞书卡片是否显示
5. **聊天记录** — 点击"聊天记录"，检查历史会话是否存在
6. **AI 对话** — 发送"你好"，验证思考面板出现 + AI 回复正常
7. **飞书消息** — 检查聊天记录中是否有"来自飞书"的历史消息
8. **飞书收发** — 从飞书 APP 给 CC 发消息 → 检查 CC 是否收到 → CC 回复到飞书 → 检查飞书是否收到
9. **Excel→多维表格** — 从飞书给 CC 发 Excel → 说"转为多维表格" → 打开链接截图验证
