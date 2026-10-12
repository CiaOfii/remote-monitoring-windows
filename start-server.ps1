$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$ServerDir = Join-Path $Root "server"
$NodeExe = "C:\Program Files\nodejs\node.exe"
$LogDir = Join-Path $Root "logs"

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

$OutLog = Join-Path $LogDir "server-output.log"
$ErrLog = Join-Path $LogDir "server-error.log"
$EventLog = Join-Path $LogDir "server-launch.log"

while ($true) {
    $listener = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue

    if ($listener) {
        Add-Content $EventLog "$(Get-Date -Format s) Port 8080 sudah digunakan; peluncur berhenti agar tidak membuat server ganda."
        exit 0
    }

    $p = Start-Process `
        -FilePath $NodeExe `
        -ArgumentList "index.js" `
        -WorkingDirectory $ServerDir `
        -WindowStyle Hidden `
        -PassThru `
        -RedirectStandardOutput $OutLog `
        -RedirectStandardError $ErrLog

    $p.WaitForExit()

    Add-Content $EventLog "$(Get-Date -Format s) Server berhenti dengan kode $($p.ExitCode). Mencoba ulang dalam 5 detik."
    Start-Sleep -Seconds 5
}
