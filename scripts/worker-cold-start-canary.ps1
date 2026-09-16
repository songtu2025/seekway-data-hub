param(
    [ValidateRange(1, 50)]
    [int]$Rounds = 10,

    [ValidateRange(5, 120)]
    [int]$StageTimeoutSeconds = 60,

    [ValidateSet("canary", "burst")]
    [string]$Mode = "canary"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $projectRoot ".venv\Scripts\python.exe"
$envPath = Join-Path $projectRoot ".env.localtest"
$apiHealthUrl = "http://127.0.0.1:8004/health/worker"
$logRoot = Join-Path `
    ([System.IO.Path]::GetTempPath()) `
    ("jijia-worker-canary-" + [guid]::NewGuid().ToString("N"))

function Import-LocalTestEnvironment {
    Get-Content -LiteralPath $envPath | ForEach-Object {
        if ($_ -match "^\s*([^#=]+)=(.*)$") {
            [Environment]::SetEnvironmentVariable(
                $Matches[1].Trim(),
                $Matches[2],
                "Process"
            )
        }
    }
    $env:WORKER_PROCESSES = "4"
    $env:DB_POOL_SIZE = "3"
    $env:DB_MAX_OVERFLOW = "2"
    $env:SYNC_LOCK_SCOPE = "account"
    $env:WORKER_HEARTBEAT_SECONDS = "2"
    $env:WORKER_POLL_SECONDS = "1"
}

function Assert-LocalCanaryReady {
    & $pythonPath -m scripts.local_test_runtime check | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "LOCAL_RUNTIME_NOT_READY"
    }

    $queueCount = & $pythonPath -m dotenv -f $envPath run --override -- `
        $pythonPath -c `
        "from sqlalchemy import func, select; from backend.app.core.database import SessionLocal; from backend.app.models.sync_job import SyncJob; db = SessionLocal(); print(int(db.scalar(select(func.count(SyncJob.id)).where(SyncJob.status == 'queued', SyncJob.attempt_count < SyncJob.max_attempts)) or 0)); db.close()"
    if ($LASTEXITCODE -ne 0 -or $queueCount -ne "0") {
        throw "LOCAL_QUEUE_NOT_EMPTY"
    }
}

function Get-WorkerHealthData {
    try {
        $response = Invoke-WebRequest `
            -Uri $apiHealthUrl `
            -TimeoutSec 3 `
            -SkipHttpErrorCheck
        $payload = $response.Content | ConvertFrom-Json
        if ($payload.error.code -eq "WORKER_NOT_READY") {
            return [pscustomobject]@{ onlineWorkerCount = 0 }
        }
        return $payload.data
    }
    catch {
        throw "LOCAL_API_NOT_READY"
    }
}

function Wait-OnlineWorkerCount {
    param(
        [int]$Expected,
        [int]$TimeoutSeconds = $StageTimeoutSeconds
    )

    $stopwatch = [Diagnostics.Stopwatch]::StartNew()
    do {
        $data = Get-WorkerHealthData
        if ([int]$data.onlineWorkerCount -eq $Expected) {
            return [math]::Round($stopwatch.Elapsed.TotalSeconds, 3)
        }
        Start-Sleep -Milliseconds 250
    } while ($stopwatch.Elapsed.TotalSeconds -lt $TimeoutSeconds)
    return $null
}

function Start-CanaryWorker {
    param(
        [int]$Index,
        [int]$Round
    )

    $env:WORKER_NAME = "canary-worker-$Index"
    $stdoutPath = Join-Path $logRoot "round-$Round-worker-$Index.stdout.log"
    $stderrPath = Join-Path $logRoot "round-$Round-worker-$Index.stderr.log"
    return Start-Process `
        -FilePath $pythonPath `
        -ArgumentList @("-m", "backend.app.worker") `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -PassThru
}

function Stop-CanaryProcessTrees {
    param([System.Collections.ArrayList]$Roots)

    $allProcesses = Get-CimInstance Win32_Process
    $targetIds = [System.Collections.Generic.HashSet[int]]::new()

    function Add-ChildProcesses {
        param([int]$ParentId)

        foreach ($child in $allProcesses | Where-Object ParentProcessId -eq $ParentId) {
            Add-ChildProcesses -ParentId ([int]$child.ProcessId)
            [void]$targetIds.Add([int]$child.ProcessId)
        }
    }

    foreach ($root in $Roots) {
        Add-ChildProcesses -ParentId ([int]$root.Id)
        [void]$targetIds.Add([int]$root.Id)
    }
    foreach ($targetId in $targetIds) {
        Stop-Process -Id $targetId -Force -ErrorAction SilentlyContinue
    }
}

function Get-MaximumDuration {
    param(
        [object[]]$Results,
        [string]$Property
    )

    $values = @($Results | ForEach-Object { $_.$Property } | Where-Object { $null -ne $_ })
    if ($values.Count -eq 0) {
        return $null
    }
    return [math]::Round(($values | Measure-Object -Maximum).Maximum, 3)
}

function Remove-CanaryWorkerRuntime {
    & $pythonPath -m dotenv -f $envPath run --override -- `
        $pythonPath -c `
        "from sqlalchemy import delete; from backend.app.core.database import SessionLocal; from backend.app.models.worker_runtime import WorkerRuntime; db = SessionLocal(); db.execute(delete(WorkerRuntime).where(WorkerRuntime.worker_name.like('canary-worker-%'))); db.commit(); db.close()"
    if ($LASTEXITCODE -ne 0) {
        throw "CANARY_RUNTIME_CLEANUP_FAILED"
    }
}

Set-Location -LiteralPath $projectRoot
New-Item -ItemType Directory -Path $logRoot | Out-Null
Import-LocalTestEnvironment
Assert-LocalCanaryReady

$initialOfflineSeconds = Wait-OnlineWorkerCount -Expected 0 -TimeoutSeconds 15
if ($null -eq $initialOfflineSeconds) {
    throw "EXISTING_WORKERS_STILL_ONLINE"
}

$results = @()
for ($round = 1; $round -le $Rounds; $round++) {
    $processes = [System.Collections.ArrayList]::new()
    $roundResult = [ordered]@{
        round = $round
        one = $null
        two = $null
        four = $null
        failedProcesses = 0
        operationalErrors = 0
        passed = $false
    }
    try {
        if ($Mode -eq "canary") {
            [void]$processes.Add((Start-CanaryWorker -Index 1 -Round $round))
            $roundResult.one = Wait-OnlineWorkerCount -Expected 1
            if ($null -eq $roundResult.one) {
                throw "ONE_WORKER_TIMEOUT"
            }

            [void]$processes.Add((Start-CanaryWorker -Index 2 -Round $round))
            $roundResult.two = Wait-OnlineWorkerCount -Expected 2
            if ($null -eq $roundResult.two) {
                throw "TWO_WORKER_TIMEOUT"
            }

            [void]$processes.Add((Start-CanaryWorker -Index 3 -Round $round))
            [void]$processes.Add((Start-CanaryWorker -Index 4 -Round $round))
        }
        else {
            foreach ($index in 1..4) {
                [void]$processes.Add((Start-CanaryWorker -Index $index -Round $round))
            }
        }
        $roundResult.four = Wait-OnlineWorkerCount -Expected 4
        if ($null -eq $roundResult.four) {
            throw "FOUR_WORKER_TIMEOUT"
        }

        Start-Sleep -Seconds 2
        foreach ($process in $processes) {
            if ($process.HasExited) {
                $roundResult.failedProcesses++
            }
        }
        $roundResult.passed = $roundResult.failedProcesses -eq 0
    }
    catch {
        $roundResult.failure = $_.Exception.Message
    }
    finally {
        foreach ($log in Get-ChildItem -LiteralPath $logRoot -Filter "round-$round-*.stderr.log") {
            $logText = Get-Content -Raw -LiteralPath $log.FullName -ErrorAction SilentlyContinue
            if ($logText -match "OperationalError") {
                $roundResult.operationalErrors++
            }
        }
        Stop-CanaryProcessTrees -Roots $processes
        [void](Wait-OnlineWorkerCount -Expected 0 -TimeoutSeconds 15)
        $results += [pscustomobject]$roundResult
    }
}
Remove-CanaryWorkerRuntime

$summary = [ordered]@{
    mode = $Mode
    rounds = $Rounds
    passedRounds = @($results | Where-Object passed).Count
    operationalErrors = ($results | Measure-Object operationalErrors -Sum).Sum
    failedProcesses = ($results | Measure-Object failedProcesses -Sum).Sum
    maxSecondsToOne = Get-MaximumDuration -Results $results -Property "one"
    maxSecondsToTwo = Get-MaximumDuration -Results $results -Property "two"
    maxSecondsToFour = Get-MaximumDuration -Results $results -Property "four"
    failures = @(
        $results |
            Where-Object { -not $_.passed } |
            Select-Object round, failure, failedProcesses, operationalErrors
    )
    logDirectory = $logRoot
}
$summary | ConvertTo-Json -Depth 5 -Compress
if ($summary.passedRounds -ne $Rounds) {
    exit 1
}
