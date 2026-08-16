$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot
$env:PORT = "3001"
$p = Start-Process -FilePath "node" -ArgumentList "server/index.js" -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput "$PSScriptRoot\srv-local.log" -RedirectStandardError "$PSScriptRoot\srv-local-err.log" -PassThru
Write-Output ("STARTED_PID=" + $p.Id)
