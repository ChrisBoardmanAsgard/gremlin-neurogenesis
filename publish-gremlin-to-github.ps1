$ErrorActionPreference = "Stop"

$RepoName = "gremlin-neurogenesis"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Git = "C:\Program Files\Git\bin\git.exe"
$Gh = "C:\Program Files\GitHub CLI\gh.exe"

if (!(Test-Path $Git)) {
  throw "Git was not found at $Git. Install Git for Windows first."
}

if (!(Test-Path $Gh)) {
  throw "GitHub CLI was not found at $Gh. Install GitHub CLI first."
}

Set-Location $ProjectDir

Write-Host "Checking GitHub authentication..."
& $Gh auth status
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "GitHub CLI is not authenticated. Run this, finish the browser login, then rerun this script:"
  Write-Host "`"$Gh`" auth login -h github.com"
  exit 1
}

if (!(Test-Path ".git")) {
  & $Git init -b main
}

& $Git config --global --add safe.directory $ProjectDir | Out-Null
& $Git config user.name "ChrisBoardmanAsgard"
& $Git config user.email "ChrisBoardmanAsgard@users.noreply.github.com"

& $Git add .gitignore README.md app.js engine.js index.html launch-evolve-24-7.bat launch-evolve-24-7.ps1 launch-genesis-lab.bat launch-genesis-lab.ps1 local-evolve-worker.js package.json render.yaml server.js styles.css worker.html worker.js publish-gremlin-to-github.ps1

$status = & $Git status --porcelain
if ($status) {
  & $Git commit -m "Prepare Gremlin NeuroGenesis for Render deploy"
} else {
  Write-Host "No local changes to commit."
}

$remoteExists = $false
try {
  & $Git remote get-url origin | Out-Null
  $remoteExists = $true
} catch {
  $remoteExists = $false
}

if (!$remoteExists) {
  Write-Host "Creating GitHub repository $RepoName..."
  & $Gh repo create $RepoName --private --source . --remote origin --push
} else {
  Write-Host "Pushing to existing origin..."
  & $Git push -u origin main
}

Write-Host ""
Write-Host "Done. Repository:"
& $Gh repo view --web
