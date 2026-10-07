param([switch]$AcceptDependencyInstall, [switch]$NonInteractive)
& (Join-Path $PSScriptRoot 'install.ps1') -Repair -AcceptDependencyInstall:$AcceptDependencyInstall -NonInteractive:$NonInteractive
exit $LASTEXITCODE
