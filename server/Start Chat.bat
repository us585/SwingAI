@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js from https://nodejs.org/ then try again.
  pause
  exit /b 1
)
echo Starting Swing Chat. Keep this window open while chatting.
echo Open the local URL printed below in your browser.
node server.mjs
pause

