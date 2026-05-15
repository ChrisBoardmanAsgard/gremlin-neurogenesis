$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $AppDir

$nodeExe = "node"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $bundledNode = Join-Path $env:LOCALAPPDATA "OpenAI\Codex\bin\node.exe"
  if (Test-Path -LiteralPath $bundledNode) {
    $nodeExe = $bundledNode
  } else {
    Write-Host "Node was not found."
    Write-Host "Install Node.js or run this from inside Codex where the bundled Node exists."
    Read-Host "Press Enter to close"
    exit 1
  }
}

$env:AUTO_EVOLVE = "1"
Start-Process "http://localhost:4173"
& $nodeExe "server.js" "4173"
