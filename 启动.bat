@echo off
cd /d "%~dp0"
chcp 65001 >nul
title FridayBite
where node >nul 2>&1
if errorlevel 1 (
  echo 这台电脑还没有安装 Node.js，双击启动目前用不了。
  echo 先去 https://nodejs.org 安装 LTS 版，装完再打开这个文件。
  pause
  exit /b 1
)
if not exist "node_modules\next" (
  echo 正在安装依赖，只需要这一次...
  call npm install
  if errorlevel 1 (
    echo 依赖没装上。
    pause
    exit /b 1
  )
)
echo 正在打开 FridayBite...
start "" http://localhost:3000
call npm run dev
pause
