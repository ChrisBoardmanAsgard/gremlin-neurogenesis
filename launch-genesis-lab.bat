@echo off
cd /d "%~dp0"
set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 (
  if exist "%LOCALAPPDATA%\OpenAI\Codex\bin\node.exe" (
    set "NODE_EXE=%LOCALAPPDATA%\OpenAI\Codex\bin\node.exe"
  ) else (
    echo Node was not found. Opening the app directly without the local server.
    echo Wikipedia import and LAN workers need the server, but core local training still loads.
    start "" "%~dp0index.html"
    pause
    exit /b 1
  )
)

start "" http://localhost:4173
"%NODE_EXE%" server.js 4173
pause
