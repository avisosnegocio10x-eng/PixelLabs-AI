$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

function Stop-Setup([string]$Message) {
    Write-Host ""
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

function Wait-ForN8n {
    for ($attempt = 1; $attempt -le 60; $attempt += 1) {
        try {
            $response = Invoke-WebRequest `
                -Uri "http://127.0.0.1:5678/healthz" `
                -UseBasicParsing `
                -TimeoutSec 5
            if ($response.StatusCode -eq 200) { return }
        } catch {
            Start-Sleep -Seconds 3
        }
    }
    Stop-Setup "n8n no respondio en http://127.0.0.1:5678/healthz."
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Stop-Setup "Docker Desktop no esta instalado o no aparece en PATH."
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Stop-Setup "Abre Docker Desktop, espera a que termine de iniciar y vuelve a ejecutar este archivo."
}

$configPath = Join-Path $PSScriptRoot "config.env"
if (-not (Test-Path -LiteralPath $configPath)) {
    Write-Host "Pega N8N_WEBHOOK_SECRET de Render. No se mostrara en pantalla."
    $secureToken = Read-Host "N8N_WEBHOOK_SECRET" -AsSecureString
    $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    try {
        $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
        if ([string]::IsNullOrWhiteSpace($token) -or $token.Length -lt 32) {
            Stop-Setup "El secreto de n8n debe tener al menos 32 caracteres."
        }
        if ($token -ne $token.Trim()) {
            Stop-Setup "El secreto no puede comenzar ni terminar con espacios."
        }
        if ($token.Contains("`r") -or $token.Contains("`n")) {
            Stop-Setup "El secreto no puede contener saltos de linea."
        }

        $randomBytes = New-Object byte[] 32
        $randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
        try {
            $randomGenerator.GetBytes($randomBytes)
        } finally {
            $randomGenerator.Dispose()
        }
        $encryptionKey = [Convert]::ToBase64String($randomBytes)
        $content = @(
            "N8N_ENCRYPTION_KEY=$encryptionKey"
            "PIXELLABS_API_URL=https://pixellabs-content-engine-free.onrender.com"
            "PIXELLABS_N8N_API_TOKEN=$token"
        ) -join "`n"
        $utf8NoBom = New-Object Text.UTF8Encoding($false)
        [IO.File]::WriteAllText($configPath, "$content`n", $utf8NoBom)
    } finally {
        if ($tokenPointer -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
        }
        $token = $null
        $secureToken = $null
    }
    Write-Host "Configuracion local protegida creada." -ForegroundColor Green
} else {
    $configText = Get-Content -LiteralPath $configPath -Raw
    if (
        $configText.Contains("REEMPLAZAR_") -or
        $configText -notmatch "(?m)^N8N_ENCRYPTION_KEY=.{32,}$" -or
        $configText -notmatch "(?m)^PIXELLABS_N8N_API_TOKEN=.{32,}$" -or
        $configText -notmatch "(?m)^PIXELLABS_API_URL=https://"
    ) {
        Stop-Setup "config.env existe, pero esta incompleto. Eliminelo y vuelva a ejecutar el instalador."
    }
    Write-Host "Se reutilizara la configuracion local existente."
}

Write-Host "Descargando n8n Community 2.33.7..."
docker compose pull n8n
if ($LASTEXITCODE -ne 0) { Stop-Setup "No se pudo descargar n8n." }

docker compose up -d
if ($LASTEXITCODE -ne 0) { Stop-Setup "No se pudo iniciar n8n." }
Wait-ForN8n

docker compose exec -T n8n sh -c "test -f /home/node/.n8n/pixellabs-workflows-v1" *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Importando los 12 workflows..."
    docker compose exec -T n8n n8n import:workflow --separate --input=/workflows
    if ($LASTEXITCODE -ne 0) { Stop-Setup "La importacion de workflows fallo." }
    docker compose exec -T n8n sh -c "touch /home/node/.n8n/pixellabs-workflows-v1"
    if ($LASTEXITCODE -ne 0) { Stop-Setup "No se pudo guardar el marcador de importacion." }
    docker compose restart n8n
    if ($LASTEXITCODE -ne 0) { Stop-Setup "No se pudo reiniciar n8n despues de importar." }
    Wait-ForN8n
} else {
    Write-Host "Los workflows ya estaban importados; no se duplicaran."
}

docker compose exec -T n8n sh -c "rm -rf /tmp/pixellabs-workflows && mkdir -p /tmp/pixellabs-workflows"
if ($LASTEXITCODE -ne 0) { Stop-Setup "No se pudo preparar la verificacion temporal." }
docker compose exec -T n8n n8n export:workflow --all --separate --output=/tmp/pixellabs-workflows
if ($LASTEXITCODE -ne 0) { Stop-Setup "No se pudieron reexportar los workflows." }
docker compose exec -T n8n node /opt/pixellabs/verifyImportedWorkflows.js /tmp/pixellabs-workflows
if ($LASTEXITCODE -ne 0) { Stop-Setup "Los 12 workflows no quedaron inactivos y unicos." }

Write-Host "Comprobando n8n -> Render -> Supabase..."
docker compose exec -T n8n node /opt/pixellabs/verifyConnection.js
if ($LASTEXITCODE -ne 0) { Stop-Setup "La conexion segura con el backend desplegado fallo." }

Write-Host ""
Write-Host "N8N LOCAL LISTO" -ForegroundColor Green
Write-Host "- 12 workflows importados"
Write-Host "- 12 workflows Inactive"
Write-Host "- Conexion HTTPS autenticada con Render aprobada"
Write-Host "- Supabase, Storage y 9 recursos verificados"
Write-Host "- Publicacion automatica apagada"
Write-Host "- Aprobacion humana obligatoria"
Write-Host ""
Write-Host "Se abrira n8n solo en este PC: http://127.0.0.1:5678"
Start-Process "http://127.0.0.1:5678"
