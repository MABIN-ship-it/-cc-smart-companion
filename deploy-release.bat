@echo off
chcp 65001 >nul
set RELEASE=D:\cc安装包\汇总\release
set PEM=C:\Users\lenovo\Desktop\MABIN (1).pem
set SSH="D:\GIt\Git\usr\bin\ssh.exe"
set SCP="D:\GIt\Git\usr\bin\scp.exe"
set HOST=root@1.14.67.28
set DL_DIR=/usr/local/lighthouse/softwares/wordpress/download

echo ============================================
echo   CC App 全链路发布（NSIS + CDN + Website）
echo ============================================
echo.

echo [1/5] 运行单元测试...
call npm test
if %errorlevel% neq 0 ( echo 测试失败 & pause & exit /b 1 )

echo [2/5] 构建前端...
call npm run build
if %errorlevel% neq 0 ( echo 构建失败 & pause & exit /b 1 )

echo [3/5] 构建 NSIS 安装包...
call npm run dist
if %errorlevel% neq 0 ( echo 打包失败 & pause & exit /b 1 )

echo [4/5] 上传到 CDN...
for %%f in ("%RELEASE%\CC*.exe" "%RELEASE%\latest.yml") do (
    %SCP% -o ConnectTimeout=10 -o StrictHostKeyChecking=no -i "%PEM%" "%%f" %HOST%:%DL_DIR%/
    if %errorlevel% neq 0 ( echo 上传失败: %%f & pause & exit /b 1 )
)

echo [5/5] CDN 预热...
for /f "tokens=*" %%i in ('dir /b "%RELEASE%\CC*.exe" 2^>nul') do (
    set EXE=%%i
)
%SSH% -o ConnectTimeout=10 -o StrictHostKeyChecking=no -i "%PEM%" %HOST% "bash /usr/local/lighthouse/softwares/wordpress/warmup.sh '%EXE%'"

echo.
echo ============================================
echo   发布完成！用户自动更新已生效。
echo ============================================
echo   安装包: https://dl.miniaimarket.cn/download/%EXE%
echo   latest.yml 已更新
echo.
echo   然后执行 deploy.bat 部署本地运行版。
pause
