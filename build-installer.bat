@echo off
chcp 65001 > nul
title NightVault Installer Builder
cd /d "%~dp0"

echo ===============================
echo   NightVault Installer Builder
echo ===============================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js не найден. Пробую установить Node.js LTS через winget...
  winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  echo.
  echo Если node всё ещё не найден, закрой это окно и открой build-installer.bat заново.
  pause
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm не найден. Закрой терминал, открой заново и повтори запуск.
  pause
  exit /b 1
)

echo Установка зависимостей...
call npm install
if errorlevel 1 (
  echo Ошибка npm install
  pause
  exit /b 1
)

echo Сборка установщика Windows...
call npm run build:installer
if errorlevel 1 (
  echo Ошибка сборки установщика
  pause
  exit /b 1
)

echo.
echo Готово! Установщик лежит в папке dist:
echo dist\NightVault-Setup-0.9.4.exe
echo.
pause
