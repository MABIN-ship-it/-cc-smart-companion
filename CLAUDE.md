# CC App 开发规范

## 全自动工作流 — Claude Code 必须自主执行

### 用户消息中包含 (1) 时 → 全链路部署

每当你编辑源文件后，且用户消息中有 (1)，你必须完整执行：

1. `cd D:/cc安装包/CC-App && npm test`
2. `cd D:/cc安装包/CC-App && npm run build`
3. `cd D:/cc安装包/CC-App && npm run test:e2e`
4. `cd D:/cc安装包/CC-App && git add <修改的文件> && git commit -m "描述改动"`
5. `cd D:/cc安装包/CC-App && git push`
6. 部署到 D:\cc安装包\1\：
   ```
   rm -rf D:/cc安装包/1/resources/app/dist/assets
   cp -r dist/* D:/cc安装包/1/resources/app/dist/
   cp electron/main.js D:/cc安装包/1/resources/app/electron/main.js
   cp electron/preload.js D:/cc安装包/1/resources/app/electron/preload.js
   ```
7. 告诉用户：部署完成，请重启应用。

**任何一步失败，停止并报告错误。禁止跳过。**

### 用户消息中无 (1) 时 → 仅备份，不部署

每当你编辑源文件后，但用户消息中没有 (1)，只执行：

1. `cd D:/cc安装包/CC-App && npm test`
2. `cd D:/cc安装包/CC-App && npm run build`
3. `cd D:/cc安装包/CC-App && git add <修改的文件> && git commit -m "描述改动"`
4. `cd D:/cc安装包/CC-App && git push`

不跑 E2E，不部署。只保证代码通过测试、已备份。

### 绝对不能做的事

- **禁止在测试/构建完成之前说"搞定了"**
- **禁止修改代码后不提交就回复用户**

---

## 铁律：文件生成必须验证落盘

**所有文件生成类工具**（create_excel、generate_ppt、generate_website、及未来新增的任何产出型工具），在返回成功消息前，**必须**使用 `window.electronAPI.fileExists(outputPath)` 验证目标文件真实存在。

禁止仅凭 `exit code === 0` 或 `writeFile` 返回值就判定成功。

原因：Python脚本可能exit code=0但文件未写出。

示例正确写法：
```javascript
const fileExists = await window.electronAPI.fileExists(outputPath);
if (!fileExists) {
    return `文件生成失败！${outputPath} 未被创建。`;
}
return `文件已生成：${outputPath}`;
```

## 工具开发规范

- JS生成Python脚本时，Python变量必须用f-string：`f"A{header_row}"` 而非普通字符串 `"A{header_row}"`
- `shellExecute` 命令中的路径必须用双引号包裹
- 工具返回的错误信息必须包含具体错误详情（stdout/stderr）
