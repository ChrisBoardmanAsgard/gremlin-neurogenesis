$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $AppDir

$nodeExe = "node"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  $bundledNode = Join-Path $env:LOCALAPPDATA "OpenAI\Codex\bin\node.exe"
  if (Test-Path -LiteralPath $bundledNode) {
    $nodeExe = $bundledNode
  } else {
    Write-Host "Node was not found. Opening the app directly without the local server."
    Write-Host "Wikipedia import and LAN workers need the server, but core local training still loads."
    Start-Process (Join-Path $AppDir "index.html")
    Read-Host "Press Enter to close"
    exit 1
  }
}

Start-Process "http://localhost:4173"
& $nodeExe "server.js" "4173"
