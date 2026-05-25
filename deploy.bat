@echo off
chcp 65001 >nul
echo ============================================
echo   CC App 自动化部署流水线
echo ============================================
echo.

echo [1/4] 运行单元测试...
call npm test
if %errorlevel% neq 0 (
    echo ❌ 测试失败！部署已中止。
    pause
    exit /b 1
)

echo.
echo [2/4] 构建前端...
call npm run build
if %errorlevel% neq 0 (
    echo ❌ 构建失败！部署已中止。
    pause
    exit /b 1
)

echo.
echo [3/4] 端到端烟雾测试...
call npx playwright test
if %errorlevel% neq 0 (
    echo ❌ E2E测试失败！应用可能无法启动。部署已中止。
    pause
    exit /b 1
)

echo.
echo [4/4] 部署到运行目录...
rm -rf "D:\cc安装包\1\resources\app\dist\assets"
xcopy /E /Y /Q "dist\*" "D:\cc安装包\1\resources\app\dist\"
xcopy /Y /Q "electron\main.js" "D:\cc安装包\1\resources\app\electron\main.js"
xcopy /Y /Q "electron\preload.js" "D:\cc安装包\1\resources\app\electron\preload.js"

echo.
echo ============================================
echo   ✅ 部署完成！请重启应用。
echo ============================================
pause
