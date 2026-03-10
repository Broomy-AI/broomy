# Build and package Broomy for Windows.
# Run from the project root: .\scripts\dist-win.ps1

$ErrorActionPreference = "Stop"

$projectRoot = "$PSScriptRoot\.."
Set-Location $projectRoot

Write-Host "Checking prerequisites..." -ForegroundColor Cyan

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js is not installed. Install from https://nodejs.org/" -ForegroundColor Red
    exit 1
}
$nodeVersion = (node --version)
Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green

# Check pnpm
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "  pnpm not found, installing..." -ForegroundColor Yellow
    npm install -g pnpm
}
$pnpmVersion = (pnpm --version)
Write-Host "  pnpm: $pnpmVersion" -ForegroundColor Green

Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Cyan
pnpm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Building application..." -ForegroundColor Cyan
pnpm build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Fix symlinks that break electron-builder on Windows.
# AGENTS.md -> CLAUDE.md is a Unix symlink; replace with a copy for packaging.
$symlinkFixed = $false
if (Test-Path "AGENTS.md") {
    $item = Get-Item "AGENTS.md" -Force
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        Write-Host "  Replacing AGENTS.md symlink with file copy for packaging..." -ForegroundColor Yellow
        Remove-Item "AGENTS.md" -Force
        Copy-Item "CLAUDE.md" "AGENTS.md"
        $symlinkFixed = $true
    }
}

Write-Host ""
Write-Host "Packaging for Windows (NSIS installer + portable)..." -ForegroundColor Cyan
try {
    npx electron-builder --win --x64
    if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }
} finally {
    # Restore the original symlink if we replaced it
    if ($symlinkFixed) {
        Remove-Item "AGENTS.md" -Force -ErrorAction SilentlyContinue
        git checkout -- AGENTS.md 2>$null
    }
}

Write-Host ""
Write-Host "Build complete! Artifacts in dist/:" -ForegroundColor Green
Get-ChildItem dist\*.exe | ForEach-Object { Write-Host "  $($_.Name) ($([math]::Round($_.Length / 1MB, 1)) MB)" -ForegroundColor Green }

# Return to scripts directory
Set-Location "$projectRoot\scripts"
