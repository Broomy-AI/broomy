# windows-e2e-test.ps1
# Pulls the latest code from GitHub and runs E2E tests on Windows.
#
# Usage:
#   .\scripts\windows-e2e-test.ps1                  # test main branch
#   .\scripts\windows-e2e-test.ps1 -Branch my-pr    # test a specific branch
#   .\scripts\windows-e2e-test.ps1 -Headed          # show the Electron window
#
# Prerequisites (one-time):
#   - Git:   https://git-scm.com/download/win
#   - Node:  https://nodejs.org (LTS)
#   - pnpm:  corepack enable && corepack prepare pnpm@latest --activate
#   - Build tools for node-pty:
#       npm install -g windows-build-tools
#     OR install "Desktop development with C++" workload via Visual Studio Installer

param(
    [string]$Branch = "main",
    [string]$RepoUrl = "https://github.com/Broomy-AI/broomy.git",
    [string]$WorkDir = "$env:USERPROFILE\broomy-e2e",
    [switch]$Headed,
    [switch]$SkipPull,
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

# --- helpers ----------------------------------------------------------------

function Write-Step($msg) {
    Write-Host "`n==> $msg" -ForegroundColor Cyan
}

function Assert-Command($cmd) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Host "ERROR: '$cmd' not found. Please install it first." -ForegroundColor Red
        exit 1
    }
}

# --- preflight --------------------------------------------------------------

Write-Step "Checking prerequisites"
Assert-Command git
Assert-Command node
Assert-Command pnpm

Write-Host "  node $(node --version)"
Write-Host "  pnpm $(pnpm --version)"

# --- clone / pull -----------------------------------------------------------

if (-not (Test-Path $WorkDir)) {
    Write-Step "Cloning repo into $WorkDir"
    git clone $RepoUrl $WorkDir
}

Set-Location $WorkDir

if (-not $SkipPull) {
    Write-Step "Fetching latest and checking out $Branch"
    git fetch origin
    git checkout $Branch
    git pull origin $Branch
}

# --- install ----------------------------------------------------------------

if ($Clean) {
    Write-Step "Clean install (removing node_modules)"
    if (Test-Path node_modules) { Remove-Item -Recurse -Force node_modules }
}

Write-Step "Installing dependencies"
pnpm install

# --- build ------------------------------------------------------------------

Write-Step "Building app for Windows"
pnpm build

# --- run E2E tests ----------------------------------------------------------

Write-Step "Running E2E tests"

$env:E2E_TEST = "true"
if ($Headed) {
    $env:E2E_HEADLESS = "false"
} else {
    $env:E2E_HEADLESS = "true"
}

# Install Playwright browsers if needed
npx playwright install --with-deps chromium

# Run the built-app E2E tests
pnpm test:e2e:built

$exitCode = $LASTEXITCODE

# --- results ----------------------------------------------------------------

Write-Host ""
if ($exitCode -eq 0) {
    Write-Host "ALL TESTS PASSED" -ForegroundColor Green
} else {
    Write-Host "SOME TESTS FAILED (exit code: $exitCode)" -ForegroundColor Red
    Write-Host "View the HTML report:  npx playwright show-report" -ForegroundColor Yellow
}

exit $exitCode
