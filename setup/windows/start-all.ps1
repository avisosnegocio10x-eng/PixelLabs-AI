param([switch]$NonInteractive)
. (Join-Path $PSScriptRoot 'common.ps1')
try {
    Initialize-Setup 'inicio' -NonInteractive:$NonInteractive
    Refresh-SetupPath
    Assert-SafeConfiguration -RequireProfile
    Invoke-SetupCommand 'node.exe' @('-e', "require('./setup/windows/safety').loadLocalEnvironment(process.cwd())") 'Configuracion insegura o incompleta. Ejecuta el instalador.' | Out-Null
    Ensure-DockerEngine
    Sync-LocalWorkflows
    Invoke-LocalCompose @('up', '-d', 'backend', 'n8n') | Out-Null
    $profile = Read-EnvFile (Join-Path $PSScriptRoot 'local.env')
    Wait-LocalUrl "$($profile.APP_BASE_URL)/healthz"
    Wait-LocalUrl 'http://127.0.0.1:5678/healthz'
    Start-ManagedWorker
    & (Join-Path $PSScriptRoot 'verify.ps1') -NonInteractive:$NonInteractive
    if ($LASTEXITCODE -ne 0) { throw 'Algun componente no aprobo la verificacion.' }
    Show-CredentialActions
    Write-SetupMessage 'En el panel, usa ADMIN_API_TOKEN desde el archivo privado local. No aparece en URLs ni logs.'
    exit 0
} catch { Write-SetupMessage ('INICIO: FAIL - ' + $_.Exception.Message); exit 1 }
