# CC App 开发规范与项目知识库

> 最后更新：2026-06-21 | 测试：237 单元 + 7 E2E

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
D:\cc安装包\汇总\CC-App\           ← 源码+开发目录（在这里改代码）
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

D:\cc安装包\1cc最终版\              ← 运行版（用户双击 electron.exe）
  electron.exe                        ← 独立 Electron 运行时
  resources/app/
    electron/                         ← ← ← 部署目标！main.js/preload.js/feishu-ws.js
    dist/                             ← ← ← 部署目标！前端构建产物
    node_modules/                     ← 含 @larksuiteoapi/node-sdk
  cc-debug.bat                        ← 调试模式启动（端口9223）
```

**⚠️ 最常犯的错误**：改了 `汇总/CC-App/electron/` 的代码但忘记同步到 `1cc最终版/resources/app/electron/`。

---

## 三、连接运行版 CC 做真实测试

### 启动调试模式
```
双击 D:\cc安装包\1cc最终版\cc-debug.bat
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
D:\cc安装包\汇总\CC-App\deploy.bat
```

### 手动部署步骤
```bash
cd D:\cc安装包\汇总\CC-App
npm test                   # 237 测试
npm run build              # 前端构建
# 部署到运行版
cp -r dist/* "D:\cc安装包\1cc最终版\resources\app\dist\"
cp electron/main.js "D:\cc安装包\1cc最终版\resources\app\electron\main.js"
cp electron/preload.js "D:\cc安装包\1cc最终版\resources\app\electron\preload.js"
cp electron/feishu-ws.js "D:\cc安装包\1cc最终版\resources\app\electron\feishu-ws.js"
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

### 2026-06-04（Excel→多维表格全线修复）

> **关键教训**：之前所有"加prompt指令"的修复方向是错的——提示词再强硬也架不住AI工具能力有缺口。真正的方法是：①让工具能力覆盖全链路 ②修复数据层的硬bug。

| # | 问题 | 根因 | 修复文件 | 修复方式 |
|---|------|------|---------|---------|
| 11 | `feishu_excel_to_bitable` 表头取错行（合并标题变字段名） | excelParser 固定取 Row 0 为表头，但 ExcelJS 合并单元格每个格都返回同值 → `count0<=2` 不触发 | excelParser.js L56-77 | `findHeaderRowIndex` 3 策略：xlsx库合并(`count0<=2`)、ExcelJS合并(`unique0.size===1`)、richText全同 |
| 12 | `feishu_excel_to_bitable` 数据全是 0 条 | ExcelJS 返回公式对象 `{formula, result}` 和富文本 `{richText: [...]}`，`String()` 全变 `[object Object]` | excelParser.js L7-29 | `normalizeCellValue`：公式取 `result`、富文本拼 `text`、共享公式取 `result` |
| 13 | `feishu_excel_to_bitable` 建表"创建失败"（实际表已建好） | `tableResult?.table?.table_id` 没 fallback 到 `tableResult?.table_id`；飞书API有两种返回格式 | feishuTools.js L813 | 加 `\|\| tableResult?.table_id` fallback |
| 14 | 字段名含 `/` 被飞书API拒绝 | 商品品质的"内容/标准"、便民服务的"属性/点位" | excelParser.js L142-147 | `cleanHeader` 加字符清洗：`/`→`-`，去 `<>:"|?*` |
| 15 | 汇总表前导空列（列1） | Excel 合并区域是 B:I 不是 A:I，A列全空 | excelParser.js L103-108 | 去前导空列：header 为 `列N` 且所有data行为空则 shift |
| 16 | `/` 字符写入数字字段导致 `TextFieldConvFail` | 便民/员工关爱行用 `/` 表示N/A，值清洗把它当字符串往数字字段写 | feishuTools.js L842-869 | 数字/货币/评分/进度字段遇到 NaN 直接跳过（不写），日期字段解析失败也跳过 |
| 17 | CC 输出裸 `<tool_calls>` XML | `renderMarkdown` 只做 HTML 转义不剥离 XML 标签 | ChatBubbleLayer.jsx L4-10 | 渲染前正则剥离 `<tool_calls>`、`<invoke>`、`<system-reminder>` 等标签 |
| 18 | API Key 图标不亮 | `AppContext` 读 `cc_api_key`，但 modelAdapter 写到 `cc_api_key_${modelId}` | AppContext.jsx L33 | 初始化扫描全部 `cc_api_key_*` 键 |
| 19 | 飞书通知静默失败 | `sendCreationNotification` 全部 `.catch(()=>{})` 无日志 | feishu.js L812-819 | 加 `console.warn/log`，标记 target 为空/发送失败 |
| 20 | 部署后旧 `dist/` 文件堆积（曾有57个旧JS） | `deploy.bat` 用 xcopy 不清理 | deploy.bat L30-33 | 拷贝前 `del /Q /S` 清旧：两个 `dist/` 都要清 |
| 21 | CC 不用 `feishu_excel_to_bitable` 而用 cli+write_records 一步步来 | 工具名叫 `feishu_create_bitable`，AI 看到名字联想不出 Excel 转换 | feishuTools.js L1383 | 新增独立工具 `feishu_excel_to_bitable`，名字=用途，一个调用完成全部 |
| 22 | Excel→多维表格后留空表"数据表" | 飞书建Base自动生成默认表，`feishuConvertExcelToBitable` 没删 | feishuTools.js L888-896 | 建完全部表后扫一遍，删"数据表"/"Sheet1"/"Table1" |
| 23 | 7表连续创建触发限频 | 无表间延迟 | feishuTools.js L886 | 每个表后 `await setTimeout(150ms)` |

### 修复后测试验证方法

不再靠 CC 自己测——**直接用飞书API跑通整条链路**：

```bash
# CC 项目目录下
node --input-type=module -e "
import ExcelJSModule from 'exceljs';
// 1. getTenantAccessToken（从 cc_feishu_config.json 取 appId/appSecret）
// 2. createBase → 拿到 appToken
// 3. excelParser 解析 → 拿到 fields + records
// 4. 逐个 addTable → batchAddBaseRecords
// 5. 验证：打开链接检查所有表数据
"
```

如果 Node.js 能跑通但 CC 不行 → 对比两边的 API 调用参数和返回值解析路径。

### 2026-05-29
24. **计划模式转执行后反复要求审批** — 添加了计划模式与执行模式铁律
25. **思考过程输出全英文** — promptBuilder 添加了中文思考指令
26. **文件生成工具返回成功但文件不存在** — 添加了文件存在性验证
27. **用户画像垃圾数据** — userProfile.js 添加了校验

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
`npm test → npm run build → npm run test:e2e → git commit → git push → 部署到1cc最终版`

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

---

## 十四、开源发布与打包

> 最后更新：2026-06-07

### 仓库配置

| 平台 | 仓库 | 类型 |
|------|------|------|
| Gitee | `mabin-cici/cc-smart-companion-public` | **公开**（开源主仓） |
| Gitee | `mabin-cici/cc-smart-companion` | 私有（开发用，勿动） |
| GitHub | `MABIN-ship-it/-cc-smart-companion` | 公开（海外镜像） |

> ⚠️ **重要**：`mabin-cici/cc-smart-companion` 是私有仓库，存放开发代码。公开仓库是 `cc-smart-companion-public`。

### 本地 git remote 配置

```
origin  → git@gitee.com:mabin-cici/cc-smart-companion-public.git (公开仓)
github  → https://github.com/MABIN-ship-it/-cc-smart-companion.git (海外镜像)
```

### 构建 NSIS 一键安装包

**环境要求：npm ≤ v10**（v11 与 electron-builder 不兼容）

```bash
# 如果 npm --version 显示 v11+，先降级：
npm install -g npm@10

# 编码问题修复：Windows 中文系统需先设置 UTF-8
chcp 65001

# 构建（vite build + electron-builder NSIS）
npm run dist

# 输出位置
D:\cc安装包\汇总\release\CC你的终身好友 Setup x.x.x.exe
```

> LZMA 固实压缩，安装包约 133MB。安装时支持自定义路径、桌面快捷方式。
> 
> **已知问题：** Node v24 的 `[DEP0190]` 警告会污染 electron-builder 26.x 的 npm 输出解析。如遇 `No JSON content found in output` 错误，确保 npm ≤ v10。

### 发布流程（全链路）

**一键发布**：双击 `deploy-release.bat` —— 自动完成：测试 → 构建 → NSIS打包 → 上传exe+latest.yml到CDN → 预热

**本地部署**：双击 `deploy.bat` —— 部署到运行版 `D:\cc安装包\1cc最终版\`

**⚠️ 发布后必须同时做两件事**：
1. `deploy-release.bat`：上传安装包 + latest.yml（用户自动更新靠这个文件）
2. `deploy.bat`：同步到本地运行版（开发调试用）

### GitHub API 上传（国内网络）

```python
# GitHub DNS 被污染，需使用真实 IP
# api.github.com → 140.82.113.5
# uploads.github.com → 199.59.148.9
# 连接时跳过 SSL hostname 校验，手动设置 Host header
```

### Gitee API Token

- 永久 Token：参见 `C:\Users\lenovo\.claude\settings.json` 或历史会话记录
- GitHub Token：同上

> ⚠️ **严禁将 token 写入代码仓库！** GitHub push protection 会拦截并吊销 token。

### 联系人信息

- 作者：Mabincici (马斌)
- 邮箱：1357502777@qq.com
- License：MIT © 2026 Mabincici (马斌)

---

## 十五、MiniAI市场网站（miniaimarket.cn）

> 最后更新：2026-06-11

### 基本信息

| 项目 | 值 |
|------|-----|
| 域名 | https://miniaimarket.cn |
| IP | 1.14.67.28 |
| 定位 | AI工具交易平台（中国版 Lemon Squeezy） |
| 源码位置 | `C:\Users\lenovo\Desktop\AI工具交易市场\` |
| 主应用文件 | `website\_current.html`（本地）/ `page-miniai.php`（服务器） |

### 服务器信息

| 项目 | 值 |
|------|-----|
| OS | OpenCloudOS 9.4 |
| Web 服务 | Nginx 1.28.0 + PHP 8.3.22 |
| 网站根目录 | `/usr/local/lighthouse/softwares/wordpress/` |
| 核心文件 | `/usr/local/lighthouse/softwares/wordpress/wp-content/themes/astra/page-miniai.php` |
| 密钥文件 | `C:\Users\lenovo\Desktop\MABIN (1).pem` |
| SSH 用户 | `root` |
| SSH 端口 | `22` |

### SSH 连接方法

```bash
# 使用 Git for Windows 的 ssh（Windows OpenSSH 会因密钥权限问题失败）
"D:/GIt/Git/usr/bin/ssh.exe" -o ConnectTimeout=10 -o StrictHostKeyChecking=no -i "C:/Users/lenovo/Desktop/MABIN (1).pem" root@1.14.67.28
```

### 技术架构

```
Nginx (miniaimarket.cn, HTTPS 443)
  └── PHP 8.3 (php-fpm)
      └── WordPress (Astra 主题)
          └── page-miniai.php ← 自定义模板页面，完全绕过 Astra 包装层
              ├── 工具市场（28+工具，免费/付费/智能体/工作流）
              ├── 万能许愿箱（悬赏+接单）
              ├── 学习中心（视频+文档教程）
              ├── 发布者论坛（帖子+附件+回复）
              ├── 排行榜（工具/学习/作者排行）
              ├── 发布系统（视频/文章/工具/资源包/智能体）
              ├── 个人中心（收藏/历史/购买/余额/私聊）
              └── 私聊系统（站内实时聊天）
```

### 数据存储

所有数据存储在 WordPress `options` 表中，以 JSON 格式保存：

| Option Key | 内容 |
|------------|------|
| `mini_tools_data` | 工具列表 |
| `mini_forum_data` | 论坛帖子 |
| `mini_ratings` | 评分数据 |
| `mini_tool_comments` | 评论数据 |

用户数据通过 WordPress user meta 存储（`mini_favorites`, `mini_history`, `mini_purchases`, `mini_balance`, `level_score`, `creator_verified` 等）。

### 常用运维操作

```bash
# 查看 page-miniai.php 状态
ls -la /usr/local/lighthouse/softwares/wordpress/wp-content/themes/astra/page-miniai.php*

# 查看 Nginx 配置
cat /www/server/panel/vhost/nginx/miniaimarket.cn.conf

# 查看站点日志
tail -100 /www/wwwlogs/miniaimarket.cn.log
tail -100 /www/wwwlogs/miniaimarket.cn.error.log

# 重启 Nginx
systemctl restart nginx

# 测试本地站点
curl -sk https://miniaimarket.cn/ 2>&1 | head -20
```

### 设备用文件

- `page-miniai.php` 有多个备份：`page-miniai.php.bak.*`
- Nginx 配置有备份：`miniaimarket.cn.conf.backup1781146995`
- 本地修复和部署脚本：`website\_deploy_fix.ps1`（PowerShell SCP 部署）
- 自动化测试脚本：`website\check_page.py`、`website\screenshot_test.py`（Playwright）

### 注意事项

1. Nginx 只配置了 HTTPS (443)，没有 HTTP (80) 的 miniaimarket.cn 服务块，所以 `http://1.14.67.28/` 无法访问网站
2. Windows OpenSSH 客户端因 CodexSandboxUsers 权限问题无法使用密钥，必须用 Git for Windows 自带的 ssh
3. 部署 page-miniai.php 时需先在服务器上备份原文件

---

## 十六、MiniAI市场网站 — 稳定版备份

> 最后更新：2026-06-20 17:03

### 服务器备份路径

```
/usr/local/lighthouse/softwares/wordpress/wp-content/themes/astra/page-miniai.php.bak-20260620_*
/usr/local/lighthouse/softwares/wordpress/download-proxy.php.bak-20260620_*
```

### 恢复命令

```bash
ssh root@1.14.67.28 "ls /usr/local/lighthouse/softwares/wordpress/wp-content/themes/astra/page-miniai.php.bak-*"
# 选最新的备份文件恢复
ssh root@1.14.67.28 "cp /usr/local/lighthouse/softwares/wordpress/wp-content/themes/astra/page-miniai.php.bak-YYYYMMDD_HHMMSS /usr/local/lighthouse/softwares/wordpress/wp-content/themes/astra/page-miniai.php"
```

### CC 版本历史

| 版本 | 日期 | 改动 |
|------|------|------|
| 1.0.8 | 06-22 | 本地模型标签改名+自定义模型名输入框+扫描自动刷新+deploy-release.bat全链路发布 |
| 1.0.7 | 06-21 | Ollama内置供应商+本地模型一键扫描（11434+8080双端口） |
| 1.0.6 | 06-20 | 未知（待补充） |
| 1.0.5 | 06-18 | Python自动下载+静默安装、pip清华镜像、CDN预热脚本 |
| 1.0.4 | 06-18 | 自动更新（后台下载+弹窗重启）、CDN发布地址 |
| 1.0.3 | 06-18 | Python缺失TTS静默跳过、更新检查URL修复 |
| 1.0.2 | 06-11 | 初始发布版 |

### CDN 加速

| 域名 | 用途 |
|------|------|
| `dl.miniaimarket.cn` | 腾讯云CDN，加速 `/download/` 目录 |
| `miniaimarket.cn` | 主站，不走CDN |

上传新版本后预热：`bash /usr/local/lighthouse/softwares/wordpress/warmup.sh "文件名"`

### 最新功能（2026-06-17）

| 功能 | 说明 |
|------|------|
| Python自动安装 | CC检测到无Python → 后台下载25MB → 静默安装 |
| CDN加速下载 | CC安装包/更新包/插件/Python安装包全走CDN |
| 自动更新升级 | 后台自动下载新版 → 弹窗"立即重启" → 自动替换旧版 |
| pip国内镜像 | TTS和STT依赖走清华PyPI镜像，模型走hf-mirror |
| 密码重置 | 登录弹窗 → "忘记密码？" → 邮箱验证码 → 设新密码 |
| download-proxy 学习内容 | 付费教程下载走 proxy 验权，中文文件名 URL 适配 |
| 手机端适配 | 弹窗全宽、横向子标签栏、翻页修复、个人中心标签滚动 |
| 抖音群 + 共创社区 | 联系我们弹窗+抖音群号、CC首页技术栈区加社群入口 |
| UI-TARS 引导 | 热门工具第一位，四步安装教程+Node.js下载 |
| download-proxy 友好文件名 | 恢复旧版逻辑：本服文件 readfile + 工具中文名 + rawurlencode |
| 按钮统一缩小 | 弹窗五按钮全 13px 紧凑间距 |
| 通知删除 | 铃铛通知逐条可删 |

### CC 下载通知

CC 首页仅保留一个下载按钮（hero 区），点击下载时自动邮件通知管理员（`notify_download` PHP handler），包含文件名、用户名、手机号、邮箱、IP。底部 CTA 重复按钮已删除。

### 平台积分闭环（2026-06-14 部署）

#### 资金流
```
用户自助充值 → 管理员审批 → 余额+
    ↓
用户购买工具 → 余额扣款 → 平台30% / 创作者70%
    ↓
创作者提现 → 管理员审批打款 → 余额扣减
```

#### 新增功能

| 功能 | 说明 |
|------|------|
| 自助充值 | 普通用户余额面板 → "💳 自助充值" → 扫码+金额 → 提交审批 |
| 充值审批 | 管理员余额面板/导航栏 → "📋 审批充值" → 通过/拒绝 |
| 购买按钮 | 付费工具详情 → "立即购买 ¥xx" → 确认 → 余额扣款 |
| 下载鉴权 | download-proxy.php 检查已购/管理员/作者才提供下载 |
| 创作者提现 | 个人中心 → "💸 我的收益" → 输入金额+支付宝号 → 提交 |
| 提现审批 | 管理员 → "💸 审批提现" → 通过(扣余额) / 拒绝 |
| 邮件通知 | 充值/提现/发布/更新均发送 1357502777@qq.com |
| 站内通知 | 充值/提现/购买推送铃铛通知，支持单条删除 |
| 通知删除 | 🔔铃铛通知新增 × 按钮，可逐条删除 |
| isPaid 修复 | 发布付费内容自动设 isPaid=true，旧数据加载时补全 |
| 发布验证 | 付费工具价格必须>0，免费工具强制price=0 |
| 价格按钮 | 修复发布表单"付费"点击无反应（radio.checked + display:block） |
| 学习中心付费 | 付费教程/视频显示锁+购买按钮，已购买才显示文件 |
| 发布更新 | "我的发布"新增"更新"按钮，可编辑标题/价格/文件，保留互动数据 |
| 作者购买 | 作者也可购买自己的内容，不限购 |
| nonce 修复 | 充值审批JS函数补上 _nonce 参数，修复安全验证失败 |

#### 测试账号

| 账号 | 密码 | 角色 |
|------|------|------|
| 13179803576 | Mabinhh.1975 | 管理员 (得意个屁呦) |
| 13900000001 | Test@123456 | 普通用户 |
| MABIN | Mabinhh.1975 | 管理员 (主账号) |

> ⚠️ 密码不能太简单（如123456），Wordfence 的 breached password 检测会拦截。

#### download-proxy.php

位于 `/usr/local/lighthouse/softwares/wordpress/download-proxy.php`，require `wp-load.php` 拿登录态。
- 免费工具 → 直接提供文件
- 付费工具 → 检查已登录 → 检查已购买（管理员/作者免检）
- 支持本地 `readfile()` 和远程 URL 302

### 独立文件

| 文件 | 用途 |
|------|------|
| `download-proxy.php` | 下载鉴权代理（新建，已部署） |
| `cover-inject.js` | 封面UI注入（发布表单） |

### 当前功能状态

| 功能 | 状态 |
|------|------|
| 注册（邮箱验证码） | ✅ QQ SMTP 正常 |
| 登录 | ✅ 手机号+密码（弱密码会被Wordfence拦截） |
| CC 首页展示 | ✅ 功能卡片+画廊+教程+下载 |
| 下载（需登录） | ✅ download-proxy.php 鉴权 |
| 分享链接 | ✅ `#tool=ID` 格式 |
| 弹窗 | ✅ 点击空白关闭 |
| 自助充值 | ✅ 用户提交→管理员审批 |
| 购买扣款 | ✅ purchase_tool PHP + 前端按钮 |
| 创作者分成 | ✅ 买家的70%打入作者余额 |
| 提现申请 | ✅ 创作者提交→管理员审批打款 |
| 发布付费工具 | ✅ isPaid 自动映射，价格验证 |
| 发布/更新邮件 | ✅ 发布和更新通知发到 1357502777@qq.com |
| 通知管理 | ✅ 铃铛通知可逐条删除 |

### 其他服务器备份

| 文件 | 路径 |
|------|------|
| Nginx 配置 | `/www/server/panel/vhost/nginx/miniaimarket.cn.conf.backup1781146995` |
| 历史 page-miniai 备份 | `/usr/local/lighthouse/softwares/wordpress/wp-content/themes/astra/page-miniai.php.bak-*` |

### SSH 连接

```bash
"D:/GIt/Git/usr/bin/ssh.exe" -o ConnectTimeout=10 -o StrictHostKeyChecking=no -i "C:/Users/lenovo/Desktop/MABIN (1).pem" root@1.14.67.28
```

---

## 十七、Odysseus 一键安装包 — 踩坑全记录

> 最后更新：2026-06-20 | 耗时：6小时 | 教训密度：极高

### 项目总结

给 PewDiePie 的 Odysseus（60K星 AI 工作台）做一键安装包。最初走了 Docker 路线，折腾了 5 个版本全失败，最后发现项目自带 `launch-windows.ps1` 原生 Python 部署，完全不需要 Docker。最终 v6 版：73MB NSIS 安装包，Python 原生运行，无需 WSL2/Docker/虚拟化。

### 关键教训

| # | 教训 | 详情 |
|---|------|------|
| 1 | **先读懂源码再动手** | 花了 4 小时搞 Docker 自动化，最后发现 `launch-windows.ps1` 已经解决了原生部署。先研究项目自带的部署方案，不要自己瞎造 |
| 2 | **Docker Desktop 不适合推给普通用户** | WSL2 三层依赖（功能+内核+发行版）、630MB下载、必须重启、中文乱码、`wsl --install` 国内超时。链路过长，任何一环断了都是死胡同 |
| 3 | **Python venv 可预打包** | 335MB venv 压缩后 73MB，LZMA 对 Python packages 压缩率意外好 |
| 4 | **NSIS FileWrite 路径变量陷阱** | `$$INSTDIR` 写入的是 PS 变量 `$INSTDIR`（空值），不是真实路径。要用 NSIS 的 `$INSTDIR`（单$）才能在 FileWrite 中展开为实际安装路径 |

### 网站修改铁律（永久遵守）

| 规则 | 原因 |
|------|------|
| **禁止用 sed 改 PHP 文件** | 双引号/单引号/`\'` 转义在 shell 中层层嵌套，必出错。曾因 sed 破坏 JS 语法导致全站按钮失效 |
| **必须用 PHP 脚本 scp 上传执行** | 写一个 .php 文件，scp 到 `/tmp/`，php 执行，立即删除。安全可靠 |
| **改前先备份** | `cp page-miniai.php page-miniai.php.bak-$(date +%Y%m%d_%H%M%S)` |
| **改后验证** | `curl -sk https://miniaimarket.cn/ | grep -c '关键词'` 确认改动生效 |
| **改后清三层缓存** | ① WP Super Cache: `rm -rf cache/supercache/*` ② OPcache: `php -r "opcache_reset()"` ③ CDN: `bash warmup.sh 文件名` |

### guide 类型工具的下载登录问题

**根因**：`openToolModal` 中对 `type==='guide'` 的工具，下载按钮是纯 `<a href=URL>`，不走 `downloadTool(event)` 函数，没有登录检查。非 guide 类型走 `downloadTool()` 有 `showAuthModal('login')`。

**修复方式**：改 page-miniai.php 行5942，给 guide 按钮加 onclick 登录检查：
```javascript
// 改前：
stepsHtml+='<a href='+s.btn_url+' ...>'+s.btn_text+'</a>';
// 改后：
stepsHtml+='<a href="' + s.btn_url + '" onclick="if(!USER||!USER.loggedIn){event.preventDefault();showAuthModal(\'login\');return false;}" ...>'+s.btn_text+'</a>';
```

**教训**：所有新增的 guide 类型工具，下载按钮默认不检查登录。必须确认这一行生效。

### CDN 更新流程

1. 上传文件到服务器：`scp 文件 root@1.14.67.28:/usr/local/lighthouse/softwares/wordpress/download/`
2. **用新文件名**：CDN 不认 `Odysseus-Setup.exe` 是否更新，换名字 `Odysseus-Setup-v6.exe` 强制刷新
3. CDN 预热：`bash warmup.sh 新文件名`
4. 等待 5-10 分钟各节点同步

### 数据记录（2026-06-20 17:00）

| 指标 | 数值 |
|------|------|
| 真实注册用户 | 4 人（不含你自己） |
| Odysseus v6 下载 | ~29 次 |
| 累计页面访问 | 16,712 |
| 今日独立访客 | 105 |

### v7.3 踩坑追加（2026-06-21）

| # | 问题 | 根因 | 教训 |
|---|------|------|------|
| 28 | **auth.json 打包泄露** | `cp -r odysseus-source staging/source` 把 data/auth.json、sessions.json、settings.json 全部打进安装包 | 编译前必须检查 `staging/source/data/` 目录为空。这是安全问题 |
| 29 | **venv 路径绑定** | `pyvenv.cfg` 写死 `home = C:\Users\lenovo\...`，换了电脑 python.exe 找不到库 | 用 Python Embedded，`._pth` 用相对路径，真正可搬迁 |
| 30 | **setup.py 首次启动卡死** | setup.py 是交互式命令（等 stdin），但 launcher 把它 pipe 到 null | 首次管理员创建走 Web UI 即可，不需要 setup.py |
| 31 | **同一电脑多账户不是真测试** | `C:\Program Files` 是全机共享的，新建 Windows 账户能看到开发机装的东西 | 必须在另一台物理电脑上测试 |
| 32 | **NSIS 快捷方式掉公桌** | `RequestExecutionLevel admin` 后 `$DESKTOP` 指向管理员桌面而非用户桌面 | 改 `SetShellVarContext all` + PS 脚本开机重建快捷方式双重保险 |

### NSIS 打包前检查清单（每次编译前执行）

```
1. ls staging/source/data/ → 必须为空（或只有 app.db）
2. ls staging/source/logs/ → 必须为空
3. cat staging/source/.env → 确认没有真实 API Key
4. python/python.exe -c "import fastapi" → 确认依赖完整
```

---

## 十八、学习中心开源教程制作流程

### 7 篇已完成的教程

| # | 标题 | 作者 | 许可证 | 分类 |
|---|------|------|--------|------|
| 1 | Karpathy 教你从零理解神经网络：反向传播和梯度下降 | Andrej Karpathy | MIT | 新手入门 |
| 2 | Karpathy 教你从零构建语言模型：Bigram → MLP → CNN | Andrej Karpathy | MIT | 新手入门 |
| 3 | fast.ai 深度学习实战：无需博士也能训练AI模型 | Jeremy Howard | Apache 2.0 | 新手入门 |
| 4 | HuggingFace Transformers 官方教程：NLP 从入门到精通 | HuggingFace | Apache 2.0 | 新手入门 |
| 5 | Microsoft AI For Beginners：12周系统学习AI核心知识 | Microsoft | MIT | 新手入门 |
| 6 | Chip Huyen：机器学习系统设计——从Jupyter到生产 | Chip Huyen | CC BY 4.0 | 工具开发 |
| 7 | LangChain：LLM应用开发从入门到实战 | LangChain | MIT | 工具开发 |

### 制作流程

1. **选仓库** — 找 MIT/Apache 2.0 许可证的开源教程仓库
2. **下源码** — GitHub 下不动时用 `ghproxy.net` 镜像：
   ```bash
   curl -sL --max-time 120 "https://ghproxy.net/https://github.com/用户/仓库/archive/refs/heads/main.zip" -o /tmp/repo.zip
   ```
3. **解压 .ipynb** — 用 Python zipfile 或 unzip
4. **写中文 HTML 教程** — 用 `C:\Users\lenovo\Desktop\AI工具交易市场\学习中心\build.py` 参考格式：`<style>` 块 + `<h1>`标题 + `<h2>`章节 + `<pre><code>`代码块 + `.note`引用框
5. **转 PDF** — Edge 无头模式：
   ```bash
   "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless --disable-gpu --print-to-pdf="输出.pdf" "输入.html"
   ```
6. **手动上传** — 到 MiniAI 网站后台 → 学习中心 → 上传 PDF + 填写元数据

### 上传元数据模板

每个教程上传时填写：标题、类型（文档）、分类（新手入门/工具开发）、标签（AI开发）、作者、预计阅读、许可证、外链、简介、PDF 文件。

### 本地文件位置

```
C:\Users\lenovo\Desktop\AI工具交易市场\学习中心\
  ├── *.html         （源码，可二次修改）
  ├── *.pdf          （最终上传用）
  ├── build.py       （自动转换脚本）
  └── nn-zero-to-hero\  （Karpathy 原始 notebook）
```
