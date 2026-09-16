param(
    [ValidateRange(1, 8)]
    [int]$WorkerProcesses = 1
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

$env:WORKER_PROCESSES = $WorkerProcesses
$env:DB_POOL_SIZE = 3
$env:DB_MAX_OVERFLOW = 2
$env:SYNC_LOCK_SCOPE = "account"

& ".\.venv\Scripts\python.exe" -m scripts.dev_local_system
exit $LASTEXITCODE
