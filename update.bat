@echo off
title Finance Tracker — Update
color 0B

echo.
echo  ============================================
echo   Finance Tracker — Update Tool
echo  ============================================
echo.

:: ── Check git is available ──────────────────────────────────────────
where git >nul 2>&1
if %errorlevel% neq 0 (
  color 0C
  echo  [ERROR] Git is not installed or not in your PATH.
  echo  Download it from https://git-scm.com and re-run this script.
  goto :fail
)

:: ── Check npm is available ───────────────────────────────────────────
where npm >nul 2>&1
if %errorlevel% neq 0 (
  color 0C
  echo  [ERROR] Node.js / npm is not installed or not in your PATH.
  echo  Download it from https://nodejs.org and re-run this script.
  goto :fail
)

:: ── Close Finance Tracker if it is running ───────────────────────────
tasklist /FI "IMAGENAME eq Finance Tracker.exe" 2>nul | find /I "Finance Tracker.exe" >nul
if %errorlevel% equ 0 (
  echo  Finance Tracker is running — closing it now...
  taskkill /IM "Finance Tracker.exe" /F >nul 2>&1
  timeout /t 2 /nobreak >nul
)

:: ── Move to the repo root (same folder as this script) ───────────────
cd /d "%~dp0"

echo  [1/3] Pulling latest updates from GitHub...
echo.
git pull origin claude/admiring-mayer-5l437o
if %errorlevel% neq 0 (
  color 0C
  echo.
  echo  [ERROR] Git pull failed. Check your internet connection or
  echo  that you have access to the repository.
  goto :fail
)

echo.
echo  [2/3] Building new installer...
echo.
cd finance-tracker
npm run build:win
if %errorlevel% neq 0 (
  color 0C
  echo.
  echo  [ERROR] Build failed. Check the output above for details.
  goto :fail
)

echo.
echo  [3/3] Done! Opening the dist folder...
echo.
echo  ============================================
echo   Update complete. Run the new .exe to install.
echo  ============================================
echo.
explorer "%~dp0finance-tracker\dist"
goto :end

:fail
echo.
echo  Update did not complete. Press any key to close.
pause >nul
exit /b 1

:end
echo  Press any key to close.
pause >nul
exit /b 0
