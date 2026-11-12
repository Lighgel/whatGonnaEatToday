@echo off
cd /d "%~dp0"
chcp 65001 >nul
title FridayBite 桌面
where node >nul 2>&1
if errorlevel 1 (
  echo 这台电脑还没有安装 Node.js。
  pause
  exit /b 1
)
if not exist "node_modules\electron" (
  echo 正在安装桌面运行库，第一次会比较久...
  call npm install
)
call npm run desktop
pause
