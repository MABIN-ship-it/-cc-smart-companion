@echo off
echo === 更新CC应用 ===

:: 先关闭正在运行的CC
taskkill /f /im "CC智能伙伴.exe" >nul 2>&1

:: 构建前端
call npx vite build
if %errorlevel% neq 0 (
  echo 构建失败!
  pause
  exit /b 1
)

:: 复制到发布目录
xcopy /Y /E dist\* "..\release\win-unpacked\resources\app\dist\" >nul
copy /Y electron\main.js "..\release\win-unpacked\resources\app\electron\main.js" >nul
copy /Y electron\preload.js "..\release\win-unpacked\resources\app\electron\preload.js" >nul
copy /Y package.json "..\release\win-unpacked\resources\app\package.json" >nul

echo 更新完成，启动CC...
start "" "..\release\win-unpacked\CC智能伙伴.exe"
exit /b 0
