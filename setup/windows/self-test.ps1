# Pure/isolated installer tests. No winget, WSL, containers, OAuth or provider calls.
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ('pixellabs-ps-test-' + [Guid]::NewGuid().ToString('N'))
$passed = 0
function Assert-Test([bool]$Condition, [string]$Description) {
    if (-not $Condition) { throw "FAIL: $Description" }
    $script:passed++
    Write-Host "OK: $Description"
}
try {
    $parseErrors = @()
    Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1' | ForEach-Object {
        $tokens = $null; $errors = $null
        [Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$tokens, [ref]$errors) | Out-Null
        $parseErrors += $errors
    }
    Assert-Test ($parseErrors.Count -eq 0) 'Todos los scripts PowerShell tienen sintaxis valida.'
    New-Item -ItemType Directory -Path (Join-Path $temporaryRoot 'setup/windows/state') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $temporaryRoot 'n8n/local') -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $sourceRoot '.env.example') -Destination (Join-Path $temporaryRoot '.env.example')
    . (Join-Path $PSScriptRoot 'common.ps1')
    $script:RepoRoot = $temporaryRoot
    $script:SetupRoot = Join-Path $temporaryRoot 'setup/windows'
    $script:StateRoot = Join-Path $script:SetupRoot 'state'
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
        function Protect-LocalPath { param([string]$Path, [switch]$Directory) }
        Write-Host 'ACL de Windows simuladas en este host; no equivale a instalar en Windows.'
    }
    function Invoke-NativeCapture { param([string]$Command, [string[]]$Arguments)
        if ($Command -eq 'docker.exe' -and $Arguments[0] -eq 'volume') { return @{Code=1;Output=''} }
        return @{Code=0;Output=''}
    }
    Ensure-LocalConfiguration
    $first = Read-EnvFile (Join-Path $script:SetupRoot 'local.env')
    $names = @('ADMIN_API_TOKEN','LOCAL_WORKER_API_TOKEN','N8N_WEBHOOK_SECRET','N8N_ENCRYPTION_KEY','SOCIAL_TOKEN_ENCRYPTION_KEY')
    $secrets = @($names | ForEach-Object { $first[$_] })
    Assert-Test (@($secrets | Select-Object -Unique).Count -eq 5) 'Cinco secretos aleatorios diferentes.'
    Assert-Test ([Convert]::FromBase64String($first.SOCIAL_TOKEN_ENCRYPTION_KEY).Length -eq 32) 'Clave social de exactamente 32 bytes base64.'
    Ensure-LocalConfiguration
    $second = Read-EnvFile (Join-Path $script:SetupRoot 'local.env')
    Assert-Test (@($names | Where-Object { $first[$_] -ne $second[$_] }).Count -eq 0) 'Reinstalar conserva todos los secretos.'
    $n8n = Read-EnvFile (Join-Path $script:SetupRoot 'n8n.env')
    $worker = Read-EnvFile (Join-Path $script:SetupRoot 'worker.env')
    Assert-Test ($n8n.PIXELLABS_N8N_API_TOKEN -eq $second.N8N_WEBHOOK_SECRET -and $worker.LOCAL_WORKER_API_TOKEN -eq $second.LOCAL_WORKER_API_TOKEN) 'Tokens dedicados coinciden solo con su servicio.'
    $remote = Join-Path $temporaryRoot 'n8n/local/config.env'
    $remoteValues = Read-EnvFile $remote
    $remoteValues.PIXELLABS_API_URL = 'https://existing-backend.example'
    Write-EnvFile $remote $remoteValues
    $before = [IO.File]::ReadAllText($remote)
    Ensure-LocalConfiguration
    Assert-Test ([IO.File]::ReadAllText($remote) -ceq $before) 'Se conserva la configuracion legacy de n8n.'
    $sourceVideo = Join-Path $temporaryRoot 'local-worker/inbox/keep.mp4'
    [IO.File]::WriteAllText($sourceVideo, 'keep existing video')
    Ensure-LocalConfiguration
    Assert-Test ([IO.File]::ReadAllText($sourceVideo) -ceq 'keep existing video') 'Reparar no elimina videos existentes.'
    $unsafe = Join-Path $temporaryRoot '.env'
    [IO.File]::WriteAllText($unsafe, "AUTO_PUBLICATION=true`n")
    $failed = $false
    try { Ensure-LocalConfiguration } catch { $failed = $true }
    Assert-Test $failed 'Publicacion activada aborta antes de escribir configuracion.'
    Assert-Test ([IO.File]::ReadAllText($unsafe) -ceq "AUTO_PUBLICATION=true`n") 'No se corrige silenciosamente un perfil inseguro.'
    Remove-Item -LiteralPath $unsafe -Force
    $redacted = Hide-Secrets ("Bearer test-auth password=test-password " + $second.ADMIN_API_TOKEN)
    Assert-Test (-not $redacted.Contains('test-auth') -and -not $redacted.Contains('test-password') -and -not $redacted.Contains($second.ADMIN_API_TOKEN)) 'Logs redactan secretos y Authorization.'
    $malformed = Join-Path $script:StateRoot 'malformed.env'
    [IO.File]::WriteAllText($malformed, "ADMIN_API_TOKEN=a`nADMIN_API_TOKEN=b`n")
    $failed = $false; try { Read-EnvFile $malformed | Out-Null } catch { $failed = $true }
    Assert-Test $failed 'Variables duplicadas se rechazan.'
    $processState = @{pid=12345;instance=[Guid]::NewGuid().ToString();createdAt=(Get-Date).ToUniversalTime().ToString('o');paused=$false}
    Write-PrivateText (Join-Path $script:StateRoot 'worker-process.json') ($processState | ConvertTo-Json)
    function Get-CimInstance { param([string]$ClassName, [string]$Filter)
        return [pscustomobject]@{CommandLine='another application';CreationDate=Get-Date}
    }
    $failed = $false; try { Get-ManagedWorker | Out-Null } catch { $failed = $true }
    Assert-Test $failed 'Un PID reutilizado por otra aplicacion nunca se detiene.'
    # Simulate a persisted n8n volume whose decryption key was lost.
    Remove-Item -LiteralPath (Join-Path $script:SetupRoot 'local.env'), (Join-Path $script:SetupRoot 'n8n.env'), $remote
    function Invoke-NativeCapture { param([string]$Command, [string[]]$Arguments) return @{Code=0;Output=''} }
    $failed = $false; try { Ensure-LocalConfiguration } catch { $failed = $true }
    Assert-Test $failed 'Un volumen existente sin clave no recibe una clave nueva.'
    # Mock OS/tool metadata to exercise detection without installing anything.
    $script:QaNodeVersion = 'v22.23.3'; $script:QaBuild = '22631'; $script:QaDockerType = 'linux'
    $script:QaFeatures = 1; $script:QaRestart = $false; $script:QaWinget = $true
    $env:PROCESSOR_ARCHITECTURE = 'AMD64'
    function Refresh-SetupPath { }
    function Get-RebootRequired { return $script:QaRestart }
    function Get-Command { [CmdletBinding()] param([string]$Name)
        if ($Name -eq 'winget.exe' -and -not $script:QaWinget) { return $null }
        return [pscustomobject]@{Source=$Name}
    }
    function Get-CimInstance { [CmdletBinding()] param([string]$ClassName, [string]$Filter)
        switch ($ClassName) {
            'Win32_OperatingSystem' { return [pscustomobject]@{BuildNumber=$script:QaBuild;ProductType=1;LastBootUpTime=Get-Date} }
            'Win32_ComputerSystem' { return [pscustomobject]@{HypervisorPresent=$true;TotalPhysicalMemory=8GB} }
            'Win32_Processor' { return [pscustomobject]@{VirtualizationFirmwareEnabled=$true;SecondLevelAddressTranslationExtensions=$true} }
            'Win32_OptionalFeature' { return @([pscustomobject]@{Name='Microsoft-Windows-Subsystem-Linux';InstallState=$script:QaFeatures},
                [pscustomobject]@{Name='VirtualMachinePlatform';InstallState=$script:QaFeatures}) }
            default { return $null }
        }
    }
    function Invoke-NativeCapture { param([string]$Command, [string[]]$Arguments)
        $text = '2.0.0'
        if ($Command -eq 'node.exe') { $text = $script:QaNodeVersion }
        if ($Command -eq 'wsl.exe') { $text = 'WSL version: 2.6.0' }
        if ($Command -eq 'docker.exe') { $text = if ($Arguments[0] -eq 'compose') { 'v2.39.0' } else { $script:QaDockerType } }
        return @{Code=0;Output=$text}
    }
    $rows = @(Get-DependencyStatus)
    Assert-Test (($rows | Where-Object Name -eq 'Node.js').Status -eq 'OK') 'Node 22 LTS compatible se acepta.'
    $script:QaNodeVersion = 'v24.19.0'
    Assert-Test ((@(Get-DependencyStatus) | Where-Object Name -eq 'Node.js').Status -eq 'NEEDS_UPDATE') 'Otra rama Node se detecta sin cambiar dependencias.'
    $script:QaNodeVersion = 'v22.21.0'
    Assert-Test ((@(Get-DependencyStatus) | Where-Object Name -eq 'Node.js').Status -eq 'NEEDS_UPDATE') 'Node 22 antiguo no satisface n8n 2.33.7.'
    $script:QaBuild = '17763'
    Assert-Test ((@(Get-DependencyStatus) | Where-Object Name -eq 'Windows').Status -eq 'NEEDS_UPDATE') 'Windows no soportado se detecta.'
    $script:QaDockerType = 'windows'
    Assert-Test ((@(Get-DependencyStatus) | Where-Object Name -eq 'Docker').Status -eq 'MISSING') 'Un motor Windows containers no se acepta.'
    $script:QaFeatures = 2
    Assert-Test ((@(Get-DependencyStatus) | Where-Object Name -eq 'WSL2').Status -eq 'MISSING') 'WSL instalado pero componentes desactivados se detecta.'
    $script:QaRestart = $true
    Assert-Test ((@(Get-DependencyStatus) | Where-Object Name -eq 'Reinicio').Status -eq 'NEEDS_RESTART') 'Reinicio pendiente se informa explicitamente.'
    $script:QaWinget = $false
    $failed = $false; try { Install-WingetPackage 'Git.Git' -Accept } catch { $failed = $true }
    Assert-Test $failed 'Sin winget no se descargan ejecutables alternativos.'
    function Assert-LocalDocker { }
    function Set-ComposeEnvironment { }
    function Invoke-NativeCapture { param([string]$Command, [string[]]$Arguments)
        return @{Code=1;Output="Error exporting workflows.`nNo workflows found with specified filters"}
    }
    $failed = $false
    try { Invoke-N8nSetupCli @('n8n','export:workflow','--all','--separate','--output=/tmp/test') -AllowEmptyExport | Out-Null } catch { $failed = $true }
    Assert-Test (-not $failed) 'Una base n8n nueva sin workflows puede continuar a la importacion.'
    $failed = $false
    try { Invoke-N8nSetupCli @('n8n','export:workflow','--all','--separate','--output=/tmp/test') | Out-Null } catch { $failed = $true }
    Assert-Test $failed 'Una verificacion final con base n8n vacia sigue fallando.'
    function Invoke-NativeCapture { param([string]$Command, [string[]]$Arguments) return @{Code=1;Output='Database connection failed'} }
    $failed = $false
    try { Invoke-N8nSetupCli @('n8n','export:workflow','--all','--separate','--output=/tmp/test') -AllowEmptyExport | Out-Null } catch { $failed = $true }
    Assert-Test $failed 'Los demas errores de n8n no se silencian como base vacia.'
    Write-Host "PowerShell installer tests: $passed/$passed"
    exit 0
} catch { Write-Host $_.Exception.Message; Write-Host $_.ScriptStackTrace; exit 1 }
finally { if (Test-Path -LiteralPath $temporaryRoot) { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force } }
