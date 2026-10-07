param([Parameter(Mandatory = $true)][ValidateSet('Install', 'Update')][string]$Action)
$ErrorActionPreference = 'Stop'
try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Se requieren permisos de administrador solamente para WSL2.' }
    if ($Action -eq 'Install') {
        & "$env:SystemRoot/System32/wsl.exe" --install --no-distribution
        if ($LASTEXITCODE -notin @(0, 3010)) { throw 'Windows no pudo habilitar WSL2.' }
        Write-Host 'REBOOT REQUIRED: reinicia Windows y vuelve a ejecutar INSTALAR-PIXELLABS.bat.'
        exit 3010
    }
    & "$env:SystemRoot/System32/wsl.exe" --update
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo actualizar WSL2.' }
    exit 0
} catch { Write-Host 'No se pudo preparar WSL2. Revisa el mensaje de Windows.'; exit 1 }
