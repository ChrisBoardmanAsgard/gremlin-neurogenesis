@echo off
cd /d "%~dp0"
set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 (
  if exist "%LOCALAPPDATA%\OpenAI\Codex\bin\node.exe" (
    set "NODE_EXE=%LOCALAPPDATA%\OpenAI\Codex\bin\node.exe"
  ) else (
    echo Node was not found.
    echo Install Node.js or run this from inside Codex where the bundled Node exists.
    pause
    exit /b 1
  )
)

set "AUTO_EVOLVE=1"
start "" http://localhost:4173
"%NODE_EXE%" server.js 4173
pause
