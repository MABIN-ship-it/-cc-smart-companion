# CC App 开发规范

## 全自动工作流 — Claude Code 必须自主执行，用户不需要手动指导

### 修改代码后（自动执行，不问用户）

每当你编辑了一个或多个源文件，在回复用户之前，你必须：

1. `cd D:/cc安装包/CC-App && npm test`
2. `cd D:/cc安装包/CC-App && npm run build`
3. `cd D:/cc安装包/CC-App && git add <修改的文件> && git commit -m "描述改动"`
4. `cd D:/cc安装包/CC-App && git push`

**任何一步失败，必须向用户报告具体错误，不继续下一步。**

### 部署到 D:\cc安装包\1\ 前（自动执行，不问用户）

当用户要求部署或你认为需要部署时：
1. `cd D:/cc安装包/CC-App && npm run predeploy`
2. `cd D:/cc安装包/CC-App && npm run test:e2e`
3. 如果以上两步都通过，执行部署命令
4. 如果任何一步失败，拒绝部署并报告失败原因

### 绝对不能做的事

- **禁止说"已修复"但没有跑过 npm test + npm run build + npm run test:e2e**
- **禁止修改代码后不提交就继续下一个任务**
- **禁止跳过测试直接部署**
- **禁止部署测试失败或构建失败的代码**

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
