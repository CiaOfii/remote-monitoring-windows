$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$AgentDir = Join-Path $Root "agent"
$PythonExe = Join-Path $AgentDir ".venv\Scripts\python.exe"
$AgentScript = Join-Path $AgentDir "main.py"
$LogDir = Join-Path $Root "logs"

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

$OutLog = Join-Path $LogDir "agent-output.log"
$ErrLog = Join-Path $LogDir "agent-error.log"
$EventLog = Join-Path $LogDir "agent-launch.log"

$alreadyRunning = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
        $_.Name -in @("python.exe", "pythonw.exe") -and
        $_.CommandLine -and
        $_.CommandLine.IndexOf($AgentScript, [StringComparison]::OrdinalIgnoreCase) -ge 0
    }

if ($alreadyRunning) {
    Add-Content $EventLog "$(Get-Date -Format s) Agent sudah berjalan; peluncur tidak membuat proses kedua."
    exit 0
}

while ($true) {
    $p = Start-Process `
        -FilePath $PythonExe `
        -ArgumentList ('"' + $AgentScript + '"') `
        -WorkingDirectory $AgentDir `
        -WindowStyle Hidden `
        -PassThru `
        -RedirectStandardOutput $OutLog `
        -RedirectStandardError $ErrLog

    $p.WaitForExit()

    Add-Content $EventLog "$(Get-Date -Format s) Agent berhenti dengan kode $($p.ExitCode). Mencoba ulang dalam 5 detik."
    Start-Sleep -Seconds 5
}
