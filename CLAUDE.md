# CC App 开发规范

## 自动化工作流（Claude Code 必须遵守）

### 每次修改代码后
1. **立即运行测试**: `npm test` — 237 个测试必须全部通过
2. **构建验证**: `npm run build` — 确保 Vite 构建成功
3. **Git 提交**: 每完成一个功能/bug修复，立即提交：
   ```bash
   git add <修改的文件>
   git commit -m "描述: 简短说明改了什么"
   ```
4. **禁止不提交就继续**: 一次成功的修改 = 一次提交。不累积、不拖延。

### 部署前（执行 cp -r dist/*）必须
```bash
npm run predeploy        # 测试 + 构建，任何失败 = 拒绝部署
npm run test:e2e         # 端到端烟雾测试，确保应用能启动
```

### 声称"修好了"之前必须
1. `npm test` 全部通过
2. `npm run build` 构建成功
3. `npm run test:e2e` 端到端测试通过（应用启动不崩溃）

**三者缺一不可。** 禁止未经以上三步就说"已修复"。

---

## 铁律：文件生成必须验证落盘

**所有文件生成类工具**（create_excel、generate_ppt、generate_website、及未来新增的任何产出型工具），在返回成功消息前，**必须**使用 `window.electronAPI.fileExists(outputPath)` 验证目标文件真实存在。

禁止仅凭 `exit code === 0` 或 `writeFile` 返回值就判定成功。违者与假成功消息同罪。

原因：Python脚本可能exit code=0但文件未写出；`_out.txt` 可能不存在导致fallback假消息。

示例正确写法：
```javascript
// Python执行后
const fileExists = await window.electronAPI.fileExists(outputPath);
if (!fileExists) {
    return `文件生成失败！${outputPath} 未被创建。\nstdout: ${stdout}\nstderr: ${stderr}`;
}
return `文件已生成：${outputPath}`;
```

## 工具开发规范

- JS生成Python脚本时，Python变量必须用f-string：`f"A{header_row}"` 而非普通字符串 `"A{header_row}"`
- `shellExecute` 命令中的路径必须用双引号包裹
- 工具返回的错误信息必须包含具体错误详情（stdout/stderr），便于定位问题
