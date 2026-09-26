<#
.SYNOPSIS
    Start the local development stack with one command.

.DESCRIPTION
    1. Starts Postgres (docker compose, service `db`) and waits until it is healthy.
    2. Runs Alembic migrations as the owner role.
    3. Opens two new PowerShell windows: the API (uvicorn --reload, :8000) and the
       client (Vite, :5173). Close a window or press Ctrl+C in it to stop that process.

    Postgres keeps running after the windows close; stop it with `docker compose stop db`.

.PARAMETER SkipMigrate
    Do not run `alembic upgrade head`.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\dev.ps1
#>
param(
    [switch]$SkipMigrate
)

# Not "Stop": Windows PowerShell 5.1 turns any stderr line from a native command into a
# terminating error, and docker, compose and alembic all log to stderr. Each native call
# is checked through $LASTEXITCODE instead.
$ErrorActionPreference = "Continue"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$python = Join-Path $backend ".venv\Scripts\python.exe"

function Fail($message) {
    Write-Host "error: $message" -ForegroundColor Red
    exit 1
}

function Test-PortInUse($port) {
    $null -ne (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

# --- Preflight -------------------------------------------------------------------------------
if (-not (Test-Path (Join-Path $root ".env"))) {
    Fail ".env not found. Copy .env.example to .env and fill it in."
}
if (-not (Test-Path $python)) {
    Fail "backend venv missing. Run: cd backend; python -m venv .venv; .\.venv\Scripts\python.exe -m pip install -e "".[dev]"""
}
if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
    Fail "frontend/node_modules missing. Run: cd frontend; npm install"
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Fail "Docker is not running. Start Docker Desktop and try again."
}
foreach ($port in 8000, 5173) {
    if (Test-PortInUse $port) {
        Fail "port $port is already in use (a stale dev server?). Stop it first."
    }
}

# --- Database --------------------------------------------------------------------------------
Write-Host "Starting Postgres..." -ForegroundColor Cyan
Push-Location $root
try {
    docker compose up -d --wait db
    if ($LASTEXITCODE -ne 0) { Fail "Postgres did not become healthy." }
} finally {
    Pop-Location
}

# --- Migrations ------------------------------------------------------------------------------
if (-not $SkipMigrate) {
    Write-Host "Running migrations..." -ForegroundColor Cyan
    Push-Location $backend
    try {
        & $python -m alembic upgrade head
        if ($LASTEXITCODE -ne 0) { Fail "alembic upgrade head failed." }
    } finally {
        Pop-Location
    }
}

# --- API and client --------------------------------------------------------------------------
Write-Host "Starting API and client in new windows..." -ForegroundColor Cyan
$apiCommand = "`$host.UI.RawUI.WindowTitle = 'EE api :8000'; & '$python' -m uvicorn app.main:app --reload --port 8000"
$webCommand = "`$host.UI.RawUI.WindowTitle = 'EE web :5173'; npm run dev"
Start-Process powershell -WorkingDirectory $backend -ArgumentList "-NoExit", "-Command", $apiCommand
Start-Process powershell -WorkingDirectory $frontend -ArgumentList "-NoExit", "-Command", $webCommand

Write-Host ""
Write-Host "API:    http://localhost:8000" -ForegroundColor Green
Write-Host "Client: http://localhost:5173" -ForegroundColor Green
Write-Host "Stop Postgres later with: docker compose stop db"
