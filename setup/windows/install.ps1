param([switch]$AcceptDependencyInstall, [switch]$NonInteractive, [switch]$Repair)
. (Join-Path $PSScriptRoot 'common.ps1')
try {
    Initialize-Setup $(if ($Repair) { 'reparacion' } else { 'instalacion' }) -NonInteractive:$NonInteractive
    Write-SetupMessage '[1/8] Comprobando Windows y dependencias...'
    Ensure-Dependencies -Accept:$AcceptDependencyInstall
    Write-SetupMessage '[2/8] Preparando configuracion privada y carpetas...'
    Ensure-LocalConfiguration
    Write-SetupMessage '[3/8] Instalando las versiones del lockfile...'
    Invoke-SetupCommand 'npm.cmd' @('ci', '--no-audit', '--no-fund') 'npm ci fallo; no se actualizaron versiones del proyecto.' | Out-Null
    Write-SetupMessage '[4/8] Comprobando conexiones disponibles, sin OAuth ni publicaciones...'
    Invoke-SetupCommand 'node.exe' @('setup/windows/verify-connections.js') 'Una conexion configurada requiere correccion.' | Out-Null
    Show-CredentialActions
    Write-SetupMessage '[5/8] Preparando n8n Community y backend local...'
    Invoke-LocalCompose @('pull', 'backend', 'n8n') | Out-Null
    Sync-LocalWorkflows # CLI only; active or duplicate workflows fail BEFORE starting the server.
    Invoke-LocalCompose @('up', '-d', '--force-recreate', 'backend', 'n8n') | Out-Null
    $profile = Read-EnvFile (Join-Path $PSScriptRoot 'local.env')
    Wait-LocalUrl "$($profile.APP_BASE_URL)/healthz"
    Wait-LocalUrl 'http://127.0.0.1:5678/healthz'
    Write-SetupMessage '[6/8] Preparando worker local en pausa durante la instalacion...'
    Start-ManagedWorker -Paused
    Write-SetupMessage '[7/8] Ejecutando tests, FFmpeg y los 12 workflows en aislamiento...'
    Invoke-SetupCommand 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'self-test.ps1')) 'Los tests PowerShell del instalador fallaron.' | Out-Null
    $qa = Invoke-SetupCommand 'node.exe' @('setup/windows/qa.js', '--n8n') 'Las pruebas fallaron. INSTALACION NO COMPLETADA.'
    $qaSummary = @($qa -split "`n" | Where-Object { $_.Trim().StartsWith('{"tests":') })[-1] | ConvertFrom-Json
    if (-not $qaSummary.tests -or $qaSummary.tests -ne $qaSummary.passed -or $qaSummary.n8nWorkflows -ne 12) { throw 'No se obtuvo un reporte de pruebas completo.' }
    Write-SetupMessage "Tests Node: $($qaSummary.passed)/$($qaSummary.tests). FFmpeg: OK. n8n QA: 12/12. Solicitudes sociales: 0."
    & (Join-Path $PSScriptRoot 'verify.ps1') -NonInteractive:$NonInteractive -FromInstaller
    if ($LASTEXITCODE -ne 0) { throw 'La verificacion final fallo. INSTALACION NO COMPLETADA.' }
    Save-SetupProgress 'complete'
    Write-SetupMessage '[8/8] INSTALACION LOCAL TERMINADA.'
    Write-SetupMessage 'Doble clic en INICIAR-PIXELLABS.bat para iniciar el worker. n8n permanece INACTIVE, IA y publicacion apagadas.'
    Write-SetupMessage 'Las conexiones que indiquen ACTION REQUIRED quedan pendientes; no impiden usar el perfil offline.'
    exit 0
} catch {
    Write-SetupMessage ('INSTALACION NO COMPLETADA: ' + $_.Exception.Message)
    if ($_.Exception.Message -eq 'PIXELLABS_REBOOT_REQUIRED') { exit 3010 }
    # Keep persistent volumes/configuration. Stop only the installer-owned worker.
    try { $worker = Get-ManagedWorker; if ($worker -and $worker.paused) { Stop-ManagedWorker } } catch { }
    exit 1
}
