param([switch]$NonInteractive)
. (Join-Path $PSScriptRoot 'common.ps1')
try {
    # Stop remains available if someone accidentally enabled an unsafe flag.
    $script:NonInteractiveMode = $NonInteractive.IsPresent
    Set-Location -LiteralPath $script:RepoRoot
    Refresh-SetupPath
    Stop-ManagedWorker
    Assert-LocalDocker
    # Setting only non-secret Compose paths allows a safety shutdown of an unsafe profile.
    $env:PIXELLABS_REPO_PATH = $script:RepoRoot.Replace('\', '/')
    $env:PIXELLABS_LOCAL_ENV_FILE = (Join-Path $PSScriptRoot 'local.env').Replace('\', '/')
    $env:PIXELLABS_N8N_CONFIG_FILE = (Join-Path $PSScriptRoot 'n8n.env').Replace('\', '/')
    $env:PIXELLABS_BACKEND_INSTANCE = '00000000-0000-0000-0000-000000000000'
    $env:PIXELLABS_BACKEND_PORT = '3000'
    $arguments = @('compose', '--project-directory', (Join-Path $script:RepoRoot 'n8n/local'), '-f',
        (Join-Path $script:RepoRoot 'n8n/local/docker-compose.yml'), '-f', (Join-Path $PSScriptRoot 'docker-compose.local.yml'), 'stop', 'n8n', 'backend')
    $result = Invoke-NativeCapture 'docker.exe' $arguments
    if ($result.Code -ne 0) { throw 'No se pudo confirmar la parada de Docker. Revisa Docker Desktop.' }
    Write-Host 'PixelLabs detenido. Los videos, la configuracion y el volumen n8n se conservan.'
    exit 0
} catch { Write-Host 'PARADA: FAIL. Revisa Docker Desktop o la identidad del worker; no se detuvieron procesos ajenos.'; exit 1 }
