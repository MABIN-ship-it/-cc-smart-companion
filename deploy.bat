@echo off
chcp 65001 >nul
set TARGET=D:\cc安装包\1cc最终版

echo ============================================
echo   CC App 一键部署
echo ============================================
echo.

echo [1/4] 运行单元测试...
call npm test
if %errorlevel% neq 0 (
    echo ❌ 测试失败！中止部署。
    pause
    exit /b 1
)

echo.
echo [2/4] 构建前端...
call npm run build
if %errorlevel% neq 0 (
    echo ❌ 构建失败！中止部署。
    pause
    exit /b 1
)

echo.
echo [3/4] 部署到运行目录...

:: 前端 dist
xcopy /E /Y /Q "dist\*" "%TARGET%\resources\app\dist\"
xcopy /E /Y /Q "dist\*" "%TARGET%\dist\"

:: 后端 electron 文件
copy /Y "electron\main.js" "%TARGET%\resources\app\electron\main.js"
copy /Y "electron\preload.js" "%TARGET%\resources\app\electron\preload.js"
copy /Y "electron\feishu-ws.js" "%TARGET%\resources\app\electron\feishu-ws.js"
copy /Y "electron\main.js" "%TARGET%\main.js"
copy /Y "electron\preload.js" "%TARGET%\preload.js"
copy /Y "electron\feishu-ws.js" "%TARGET%\feishu-ws.js"

:: package.json
copy /Y "package.json" "%TARGET%\resources\app\package.json"

echo.
echo [4/4] E2E 烟雾测试...
call npx playwright test
if %errorlevel% neq 0 (
    echo ⚠️ E2E测试未通过，但部署已完成。请检查 test-results/
)

echo.
echo ============================================
echo   ✅ 部署完成！
echo   启动: %TARGET%\electron.exe
echo ============================================
pause
