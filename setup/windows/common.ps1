# Shared by install, verify, start, stop and repair. Compatible with Windows PowerShell 5.1.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:SetupRoot = $PSScriptRoot
$script:RepoRoot = [IO.Path]::GetFullPath((Join-Path $script:SetupRoot '../..'))
$script:StateRoot = Join-Path $script:SetupRoot 'state'
$script:LogPath = $null
$script:RedactionValues = @()
$script:NonInteractiveMode = $false
$script:SafeFlags = @{
    AUTO_PUBLICATION = 'false'; CONTENT_ENGINE_AUTO_PUBLISH = 'false'; SOCIAL_PUBLISH_MODE = 'draft'
    SOCIAL_EXTERNAL_REQUESTS_ENABLED = 'false'; SOCIAL_OAUTH_ENABLED = 'false'; CONTENT_ENGINE_AI_ENABLED = 'false'
}

function Read-EnvFile([string]$Path) {
    $values = @{}
    if (-not (Test-Path -LiteralPath $Path)) { return $values }
    foreach ($line in [IO.File]::ReadAllLines($Path)) {
        if ($line -match '^\s*(?:#.*)?$') { continue }
        if ($line -notmatch '^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$') {
            throw 'El archivo de configuracion contiene una linea invalida. Revisalo localmente sin compartir sus valores.'
        }
        $key = $Matches[1]; $value = $Matches[2].Trim()
        if ($values.ContainsKey($key)) { throw "Variable duplicada: $key. Revisala localmente." }
        if ($value.StartsWith('"') -or $value.StartsWith("'")) {
            $quote = $value.Substring(0, 1)
            if ($value.Length -lt 2 -or -not $value.EndsWith($quote)) { throw "Valor entre comillas invalido: $key." }
            $value = $value.Substring(1, $value.Length - 2)
        } else { $value = ($value -split '#', 2)[0].Trim() }
        $values[$key] = $value
        if ($key -match 'TOKEN|SECRET|PASSWORD|PASS$|API_KEY|ENCRYPTION_KEY|SERVICE_ROLE|DB_URL' -and $value.Length -ge 4) {
            $script:RedactionValues += $value
        }
    }
    return $values
}

function Protect-LocalPath([string]$Path, [switch]$Directory) {
    if (-not (Test-Path -LiteralPath $Path)) { throw 'No se puede proteger una ruta inexistente.' }
    $item = Get-Item -LiteralPath $Path -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Una ruta privada es un enlace. No se modificara.' }
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    if ($Directory) {
        $acl = New-Object Security.AccessControl.DirectorySecurity
        $inheritance = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
    } else {
        $acl = New-Object Security.AccessControl.FileSecurity
        $inheritance = [Security.AccessControl.InheritanceFlags]::None
    }
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($identity in @($sid, (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')),
        (New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', $inheritance,
            [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
        $acl.AddAccessRule($rule)
    }
    $acl.SetOwner($sid)
    Set-Acl -LiteralPath $Path -AclObject $acl
}

function Ensure-PrivateDirectory([string]$Path) {
    Assert-UnlinkedLocalPath $Path
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
    Protect-LocalPath $Path -Directory
}

function Write-PrivateText([string]$Path, [string]$Content) {
    Assert-UnlinkedLocalPath $Path
    # Temp file ACL is restricted BEFORE secret bytes are written.
    $temporary = "$Path.$([Guid]::NewGuid().ToString('N')).tmp"
    try {
        New-Item -ItemType File -Path $temporary | Out-Null
        Protect-LocalPath $temporary
        [IO.File]::WriteAllText($temporary, $Content, (New-Object Text.UTF8Encoding($false)))
        if (Test-Path -LiteralPath $Path) {
            Protect-LocalPath $Path
            [IO.File]::Replace($temporary, $Path, [NullString]::Value)
        } else { [IO.File]::Move($temporary, $Path) }
        Protect-LocalPath $Path
    } finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force } }
}

function Assert-UnlinkedLocalPath([string]$Path) {
    $current = [IO.Path]::GetFullPath($Path)
    $boundary = $script:RepoRoot.TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
    if ($current -ne $script:RepoRoot -and -not $current.StartsWith($boundary, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'La ruta de instalacion debe permanecer dentro de este repositorio.'
    }
    while ($current -and ($current -eq $script:RepoRoot -or $current.StartsWith($boundary, [StringComparison]::OrdinalIgnoreCase))) {
        if (Test-Path -LiteralPath $current) {
            if (((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw 'Una ruta de instalacion o sus carpetas es un enlace. Extrae el repositorio en una carpeta normal antes de continuar.'
            }
        }
        $parent = [IO.Directory]::GetParent($current)
        $current = if ($parent) { $parent.FullName } else { $null }
    }
}

function Write-EnvFile([string]$Path, [hashtable]$Values) {
    $lines = @('# Configuracion local privada. Nunca compartir ni guardar en Git.')
    foreach ($key in ($Values.Keys | Sort-Object)) {
        $value = [string]$Values[$key]
        if ($value -match '[\r\n]' -or $value.Contains("'") -or $value.Contains('"')) { throw "Formato no admitido para $key; usa una sola linea." }
        if ($value.Contains('#') -or $value -ne $value.Trim()) { $value = "'$value'" }
        $lines += "$key=$value"
    }
    Write-PrivateText $Path (($lines -join "`n") + "`n")
    Read-EnvFile $Path | Out-Null
}

function Hide-Secrets([string]$Text) {
    foreach ($value in $script:RedactionValues) { $Text = $Text.Replace($value, '[REDACTED]') }
    $Text = [regex]::Replace($Text, '(?i)(Bearer\s+)\S+', '$1[REDACTED]')
    $Text = [regex]::Replace($Text, '(?i)((?:token|secret|password|api[_-]?key|service[_-]?role[_-]?key)\s*[=:]\s*)\S+', '$1[REDACTED]')
    return [regex]::Replace($Text, '(?i)postgres(?:ql)?://\S+', '[REDACTED_DB_URL]')
}

function Write-SetupMessage([string]$Text) {
    $safe = Hide-Secrets $Text
    Write-Host $safe
    if ($script:LogPath) { [IO.File]::AppendAllText($script:LogPath, "$safe`r`n") }
}

function Write-SetupLog([string]$Text) {
    if ($script:LogPath) { [IO.File]::AppendAllText($script:LogPath, ((Hide-Secrets $Text) + "`r`n")) }
}

function Initialize-Setup([string]$Operation, [switch]$NonInteractive) {
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Este instalador requiere Windows 10/11 x64.' }
    $script:NonInteractiveMode = $NonInteractive.IsPresent
    Set-Location -LiteralPath $script:RepoRoot
    # No process-wide transcript: native tools and prompts can contain credentials.
    Assert-SafeConfiguration
    Ensure-PrivateDirectory $script:StateRoot
    Ensure-PrivateDirectory (Join-Path $script:RepoRoot 'logs')
    $script:LogPath = Join-Path $script:RepoRoot ("logs/setup-{0}-{1}.txt" -f (Get-Date -Format 'yyyy-MM-dd-HHmmss'), $Operation)
    New-Item -ItemType File -Path $script:LogPath -Force | Out-Null
    Protect-LocalPath $script:LogPath
    Write-SetupMessage "PixelLabs - $Operation. Publicacion desactivada. Costo previsto: 0 USD."
}

function Assert-SafeValues([hashtable]$Values, [string]$Label, [switch]$RequireAll) {
    foreach ($key in $script:SafeFlags.Keys) {
        if (($RequireAll -or $Values.ContainsKey($key)) -and $Values[$key] -cne $script:SafeFlags[$key]) {
            throw "Configuracion insegura en $Label`: $key debe ser $($script:SafeFlags[$key]). No se iniciara PixelLabs."
        }
    }
}

function Assert-SafeConfiguration([switch]$RequireProfile) {
    $inherited = @{}
    Get-ChildItem Env: | ForEach-Object {
        $inherited[$_.Name] = $_.Value
        if ($_.Name -match 'TOKEN|SECRET|PASSWORD|PASS$|API_KEY|ENCRYPTION_KEY|SERVICE_ROLE|DB_URL' -and $_.Value.Length -ge 4) {
            $script:RedactionValues += $_.Value
        }
    }
    Assert-SafeValues $inherited 'el entorno de Windows'
    foreach ($relative in @('.env', 'local-worker/.env', 'n8n/local/config.env', 'setup/windows/local.env',
        'setup/windows/worker.env', 'setup/windows/n8n.env')) {
        Assert-SafeValues (Read-EnvFile (Join-Path $script:RepoRoot $relative)) $relative
    }
    if ($RequireProfile) { Assert-SafeValues (Read-EnvFile (Join-Path $script:SetupRoot 'local.env')) 'perfil local' -RequireAll }
}

function Refresh-SetupPath {
    $paths = @([Environment]::GetEnvironmentVariable('Path', 'Machine'), [Environment]::GetEnvironmentVariable('Path', 'User'), $env:Path)
    foreach ($relative in @('nodejs', 'Git/cmd', 'Docker/Docker/resources/bin')) {
        $paths += Join-Path $env:ProgramFiles $relative
    }
    foreach ($relative in @('Microsoft/WindowsApps', 'Microsoft/WinGet/Links', 'Programs/DockerDesktop/resources/bin')) {
        $paths += Join-Path $env:LOCALAPPDATA $relative
    }
    $packages = Join-Path $env:LOCALAPPDATA 'Microsoft/WinGet/Packages'
    if (Test-Path -LiteralPath $packages) {
        Get-ChildItem -Path (Join-Path $packages 'Gyan.FFmpeg*') -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            Get-ChildItem -LiteralPath $_.FullName -Filter ffmpeg.exe -Recurse -ErrorAction SilentlyContinue |
                ForEach-Object { $paths += $_.DirectoryName }
        }
    }
    $env:Path = (($paths -join ';') -split ';' | Where-Object { $_ } | Select-Object -Unique) -join ';'
}

function Invoke-NativeCapture([string]$Command, [string[]]$Arguments) {
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) { return @{ Code = 127; Output = 'Comando no disponible.' } }
    $previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = @(& $Command @Arguments 2>&1 | ForEach-Object { $_.ToString() })
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    return @{ Code = $code; Output = ($output -join "`n") }
}

function Invoke-SetupCommand([string]$Command, [string[]]$Arguments, [string]$Failure) {
    $result = Invoke-NativeCapture $Command $Arguments
    if ($result.Output) { Write-SetupLog $result.Output }
    if ($result.Code -ne 0) { throw $Failure }
    return $result.Output
}

function Get-RebootRequired {
    foreach ($key in @('HKLM:/SOFTWARE/Microsoft/Windows/CurrentVersion/Component Based Servicing/RebootPending',
        'HKLM:/SOFTWARE/Microsoft/Windows/CurrentVersion/WindowsUpdate/Auto Update/RebootRequired')) {
        if (Test-Path -LiteralPath $key) { return $true }
    }
    $progress = Join-Path $script:StateRoot 'progress.json'
    if (Test-Path -LiteralPath $progress) {
        $state = Get-Content -LiteralPath $progress -Raw | ConvertFrom-Json
        $boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o')
        if ($state.rebootBoot -and $state.rebootBoot -eq $boot) { return $true }
    }
    return $false
}

function Save-SetupProgress([string]$Step, [switch]$Restart) {
    $boot = if ($Restart) { (Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o') } else { $null }
    Write-PrivateText (Join-Path $script:StateRoot 'progress.json') (@{
        step = $Step; updatedAt = (Get-Date).ToUniversalTime().ToString('o'); rebootBoot = $boot
    } | ConvertTo-Json)
}

function Stop-ForRestart([string]$Reason) {
    Save-SetupProgress $Reason -Restart
    Write-SetupMessage "NEEDS_RESTART - REBOOT REQUIRED: $Reason"
    Write-SetupMessage 'Reinicia Windows y vuelve a ejecutar INSTALAR-PIXELLABS.bat. El progreso y los datos se conservan.'
    throw (New-Object InvalidOperationException('PIXELLABS_REBOOT_REQUIRED'))
}

function Dependency-Row([string]$Name, [string]$Status, [string]$Detail) {
    return [pscustomobject]@{ Name = $Name; Status = $Status; Detail = $Detail }
}

function Get-DependencyStatus {
    Refresh-SetupPath
    $os = Get-CimInstance Win32_OperatingSystem
    $build = [int]$os.BuildNumber
    $supported = $os.ProductType -eq 1 -and (($build -ge 22631) -or ($build -eq 19045))
    Dependency-Row 'Windows' $(if ($supported) { 'OK' } else { 'NEEDS_UPDATE' }) "Build $build. Windows 10 requiere soporte ESU vigente."
    $arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    Dependency-Row 'x64' $(if ($arch -eq 'AMD64' -and [Environment]::Is64BitProcess) { 'OK' } else { 'NEEDS_UPDATE' }) 'Se requiere Windows x64 y PowerShell de 64 bits.'
    Dependency-Row 'PowerShell' $(if ($PSVersionTable.PSVersion -ge [version]'5.1') { 'OK' } else { 'NEEDS_UPDATE' }) $PSVersionTable.PSVersion.ToString()
    foreach ($pair in @(@('winget', 'winget.exe'), @('Git', 'git.exe'), @('npm', 'npm.cmd'), @('FFmpeg', 'ffmpeg.exe'), @('ffprobe', 'ffprobe.exe'))) {
        $command = Get-Command $pair[1] -ErrorAction SilentlyContinue
        if (-not $command) { Dependency-Row $pair[0] 'MISSING' 'No disponible en PATH.'; continue }
        $argument = if ($pair[0] -in @('FFmpeg', 'ffprobe')) { '-version' } else { '--version' }
        $result = Invoke-NativeCapture $command.Source @($argument)
        $firstLine = ($result.Output -split "`n")[0]
        Dependency-Row $pair[0] $(if ($result.Code -eq 0) { 'OK' } else { 'NEEDS_UPDATE' }) $firstLine
    }
    if (Get-Command node.exe -ErrorAction SilentlyContinue) {
        $result = Invoke-NativeCapture 'node.exe' @('--version')
        $valid = $result.Code -eq 0 -and $result.Output.Trim() -match '^v22\.'
        if ($valid) { $valid = [version]$result.Output.Trim().TrimStart('v') -ge [version]'22.22.0' }
        Dependency-Row 'Node.js' $(if ($valid) { 'OK' } else { 'NEEDS_UPDATE' }) 'Se requiere Node.js 22 LTS, minimo 22.22.0 (n8n 2.33.7).'
    } else { Dependency-Row 'Node.js' 'MISSING' 'Node.js 22 LTS.' }
    if (Get-Command docker.exe -ErrorAction SilentlyContinue) {
        $engine = Invoke-NativeCapture 'docker.exe' @('info', '--format', '{{.OSType}}')
        Dependency-Row 'Docker' $(if ($engine.Code -eq 0 -and $engine.Output.Trim() -eq 'linux') { 'OK' } else { 'MISSING' }) 'Abre Docker Desktop y usa contenedores Linux.'
        $compose = Invoke-NativeCapture 'docker.exe' @('compose', 'version', '--short')
        Dependency-Row 'Docker Compose' $(if ($compose.Code -eq 0 -and $compose.Output.Trim() -match '^v?2\.') { 'OK' } else { 'NEEDS_UPDATE' }) 'Se requiere Docker Compose v2.'
    } else {
        Dependency-Row 'Docker' 'MISSING' 'Instalar Docker Desktop.'
        Dependency-Row 'Docker Compose' 'MISSING' 'Incluido con Docker Desktop.'
    }
    $system = Get-CimInstance Win32_ComputerSystem
    $processor = @(Get-CimInstance Win32_Processor)[0]
    Dependency-Row 'Virtualizacion' $(if ($system.HypervisorPresent -or ($processor.VirtualizationFirmwareEnabled -and $processor.SecondLevelAddressTranslationExtensions)) { 'OK' } else { 'ACTION REQUIRED' }) 'Activar virtualizacion en BIOS/UEFI si esta desactivada.'
    Dependency-Row 'RAM' $(if ($system.TotalPhysicalMemory -ge 7.5GB) { 'OK' } else { 'NEEDS_UPDATE' }) 'Docker Desktop requiere al menos 8 GB.'
    $wsl = Invoke-NativeCapture 'wsl.exe' @('--version')
    $text = $wsl.Output.Replace([string][char]0, '')
    $ready = $wsl.Code -eq 0 -and $text -match '(\d+\.\d+\.\d+)'
    if ($ready) { $ready = [version]$Matches[1] -ge [version]'2.1.5' }
    $features = @(Get-CimInstance Win32_OptionalFeature | Where-Object { $_.Name -in @('Microsoft-Windows-Subsystem-Linux', 'VirtualMachinePlatform') })
    if ($features.Count -ne 2 -or @($features | Where-Object InstallState -ne 1).Count -gt 0) { $ready = $false; $wsl.Code = 127 }
    Dependency-Row 'WSL2' $(if ($ready) { 'OK' } elseif ($wsl.Code -eq 0) { 'NEEDS_UPDATE' } else { 'MISSING' }) 'WSL 2.1.5 o posterior; se comprueba tambien el motor Docker.'
    Dependency-Row 'Reinicio' $(if (Get-RebootRequired) { 'NEEDS_RESTART' } else { 'OK' }) 'Estado de Windows y del instalador.'
}

function Show-Dependencies($Rows) {
    foreach ($row in $Rows) { Write-SetupMessage ("{0}: {1} - {2}" -f $row.Name, $row.Status, $row.Detail) }
}

function Confirm-DependencyInstall([string]$Description, [switch]$Accept) {
    Write-SetupMessage $Description
    if ($Accept) { return }
    if ($script:NonInteractiveMode) { throw 'ACTION REQUIRED: ejecutar interactivamente para autorizar las dependencias faltantes.' }
    $answer = Read-Host 'Instalar o preparar esta dependencia gratuita? [S/N]'
    if ($answer.Trim() -notmatch '^(?i:s|si|y|yes)$') { throw 'Instalacion pausada: no se autorizo la dependencia.' }
}

function Install-WingetPackage([string]$Id, [switch]$Accept) {
    if (-not (Get-Command winget.exe -ErrorAction SilentlyContinue)) {
        Write-SetupMessage 'ACTION REQUIRED: instala App Installer de Microsoft desde https://aka.ms/getwinget y vuelve a ejecutar el instalador.'
        throw 'Falta winget. No se descargaran instaladores alternativos.'
    }
    Confirm-DependencyInstall "Se usara winget oficial: $Id. El instalador del proveedor puede solicitar UAC solo para esa dependencia." -Accept:$Accept
    $result = Invoke-NativeCapture 'winget.exe' @('install', '--id', $Id, '--exact', '--source', 'winget',
        '--accept-source-agreements', '--accept-package-agreements', '--disable-interactivity')
    Write-SetupMessage $result.Output
    # Windows Installer / WinGet successful installation with reboot requested/initiated.
    if ($result.Code -in @(3010, 1641, -1978334967, -1978334966, -1978334965)) { Stop-ForRestart 'Una dependencia requiere reiniciar Windows.' }
    if ($result.Code -ne 0) { throw "No se pudo instalar $Id. No se declarara completada la instalacion." }
    Refresh-SetupPath
    Save-SetupProgress "dependencia:$Id"
    if (Get-RebootRequired) { Stop-ForRestart "Instalacion de $Id." }
}

function Enable-WSL([string]$Action, [switch]$Accept) {
    Confirm-DependencyInstall 'WSL2 necesita habilitar componentes de Windows. UAC ejecutara solamente enable-wsl.ps1; no elevara npm, el backend ni tus archivos.' -Accept:$Accept
    $helper = Join-Path $script:SetupRoot 'enable-wsl.ps1'
    $process = Start-Process -FilePath "$env:SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe" -Verb RunAs -Wait -PassThru `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $helper), '-Action', $Action)
    if ($process.ExitCode -eq 3010 -or $Action -eq 'Install') { Stop-ForRestart 'Se prepararon los componentes WSL2.' }
    if ($process.ExitCode -ne 0) { throw 'No se pudo preparar WSL2. Revisa la ventana de Windows.' }
}

function Ensure-Dependencies([switch]$Accept) {
    $rows = @(Get-DependencyStatus); Show-Dependencies $rows
    foreach ($name in @('Windows', 'x64', 'PowerShell', 'Virtualizacion', 'RAM')) {
        if (($rows | Where-Object Name -eq $name).Status -ne 'OK') { throw "ACTION REQUIRED: resuelve $name antes de continuar." }
    }
    if (Get-RebootRequired) { Stop-ForRestart 'Windows tiene un reinicio pendiente.' }
    foreach ($package in @(@('Git', 'Git.Git'), @('Node.js', 'OpenJS.NodeJS.22'), @('FFmpeg', 'Gyan.FFmpeg'))) {
        if (($rows | Where-Object Name -eq $package[0]).Status -ne 'OK' -or ($package[0] -eq 'FFmpeg' -and ($rows | Where-Object Name -eq 'ffprobe').Status -ne 'OK')) {
            Install-WingetPackage $package[1] -Accept:$Accept
        }
    }
    if (-not (Get-Command docker.exe -ErrorAction SilentlyContinue)) { Install-WingetPackage 'Docker.DockerDesktop' -Accept:$Accept }
    elseif (($rows | Where-Object Name -eq 'Docker Compose').Status -ne 'OK') { Install-WingetPackage 'Docker.DockerDesktop' -Accept:$Accept }
    if (($rows | Where-Object Name -eq 'WSL2').Status -ne 'OK' -and ($rows | Where-Object Name -eq 'Docker').Status -ne 'OK') {
        $action = if (($rows | Where-Object Name -eq 'WSL2').Status -eq 'MISSING') { 'Install' } else { 'Update' }
        Enable-WSL $action -Accept:$Accept
    }
    Ensure-DockerEngine
    $rows = @(Get-DependencyStatus)
    foreach ($name in @('Git', 'Node.js', 'npm', 'Docker', 'Docker Compose', 'FFmpeg', 'ffprobe')) {
        if (($rows | Where-Object Name -eq $name).Status -ne 'OK') { throw "ACTION REQUIRED: $name sigue sin funcionar. Vuelve a abrir el instalador tras corregirlo." }
    }
}

function Ensure-DockerEngine {
    Assert-LocalDocker
    $result = Invoke-NativeCapture 'docker.exe' @('info', '--format', '{{.OSType}}')
    if ($result.Code -eq 0 -and $result.Output.Trim() -eq 'linux') { return }
    foreach ($candidate in @((Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/Docker Desktop.exe'),
        (Join-Path $env:ProgramFiles 'Docker/Docker/Docker Desktop.exe'))) {
        if (Test-Path -LiteralPath $candidate) { Start-Process -FilePath $candidate; break }
    }
    Write-SetupMessage 'ACTION REQUIRED / ACCION NECESARIA: abre Docker Desktop, acepta sus condiciones gratuitas aplicables y espera a que indique Engine running.'
    if ($script:NonInteractiveMode) { throw 'Docker Engine no esta disponible.' }
    Read-Host 'Cuando Docker este listo, pulsa ENTER' | Out-Null
    $result = Invoke-NativeCapture 'docker.exe' @('info', '--format', '{{.OSType}}')
    if ($result.Code -ne 0 -or $result.Output.Trim() -ne 'linux') { throw 'Docker aun no funciona en modo Linux. Revisa WSL2, virtualizacion o reinicio.' }
}

function New-LocalSecret {
    $bytes = New-Object byte[] 32
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes); return [Convert]::ToBase64String($bytes) } finally { $random.Dispose() }
}

function Assert-LocalDocker {
    if ($env:DOCKER_HOST -and $env:DOCKER_HOST -notmatch '^npipe://') { throw 'Docker apunta a un host remoto o TCP. Selecciona Docker Desktop local antes de continuar.' }
    $context = Invoke-NativeCapture 'docker.exe' @('context', 'inspect', '--format', '{{.Endpoints.docker.Host}}')
    if ($context.Code -ne 0 -or $context.Output.Trim() -notmatch '^npipe://') { throw 'Se requiere el contexto local de Docker Desktop, no un servidor Docker remoto.' }
}

function Ensure-LocalConfiguration {
    Assert-SafeConfiguration
    $path = Join-Path $script:SetupRoot 'local.env'
    $local = Read-EnvFile $path
    $existingN8n = Read-EnvFile (Join-Path $script:RepoRoot 'n8n/local/config.env')
    $defaults = Read-EnvFile (Join-Path $script:RepoRoot '.env.example')
    foreach ($key in $defaults.Keys) { if (-not $local.ContainsKey($key)) { $local[$key] = $defaults[$key] } }
    foreach ($key in $script:SafeFlags.Keys) { $local[$key] = $script:SafeFlags[$key] }
    foreach ($key in @('ADMIN_API_TOKEN', 'LOCAL_WORKER_API_TOKEN', 'N8N_WEBHOOK_SECRET', 'SOCIAL_TOKEN_ENCRYPTION_KEY', 'N8N_ENCRYPTION_KEY')) {
        if (-not $local.ContainsKey($key) -or -not $local[$key] -or $local[$key] -match 'replace-with|REEMPLAZAR') {
            if ($key -eq 'N8N_ENCRYPTION_KEY' -and $existingN8n.ContainsKey($key) -and $existingN8n[$key] -notmatch 'REEMPLAZAR' -and $existingN8n[$key].Length -ge 32) {
                $local[$key] = $existingN8n[$key]
            } else {
                if ($key -eq 'N8N_ENCRYPTION_KEY') {
                    $volume = Invoke-NativeCapture 'docker.exe' @('volume', 'inspect', 'pixellabs_n8n_data')
                    if ($volume.Code -eq 0) { throw 'ACTION REQUIRED: existe un volumen n8n sin su clave local. Restaura N8N_ENCRYPTION_KEY; no se generara otra ni se borraran datos.' }
                }
                $local[$key] = New-LocalSecret
            }
        }
    }
    if ($existingN8n.ContainsKey('N8N_ENCRYPTION_KEY') -and $existingN8n.N8N_ENCRYPTION_KEY -notmatch 'REEMPLAZAR' -and $existingN8n.N8N_ENCRYPTION_KEY -ne $local.N8N_ENCRYPTION_KEY) {
        throw 'ACTION REQUIRED: las claves de n8n no coinciden. No se cambiara una clave que puede cifrar credenciales existentes.'
    }
    $local.NODE_ENV = 'development'; $local.CONTENT_ENGINE_VIDEO_MODE = 'local'; $local.N8N_REQUIRE_HTTPS = 'false'
    $local.CONTENT_ENGINE_UPLOAD_DIR = './storage/uploads'; $local.CONTENT_ENGINE_WORK_DIR = './storage/work'
    if (-not $local.PORT -or $local.PORT -notmatch '^\d+$' -or [int]$local.PORT -lt 1024 -or [int]$local.PORT -gt 65535) { throw 'PORT debe ser un puerto entre 1024 y 65535.' }
    $local.APP_BASE_URL = "http://127.0.0.1:$($local.PORT)"
    foreach ($key in @('META_REDIRECT_URI', 'TIKTOK_REDIRECT_URI')) {
        if (-not $local[$key]) { $provider = if ($key -eq 'META_REDIRECT_URI') { 'meta' } else { 'tiktok' }; $local[$key] = "$($local.APP_BASE_URL)/social/oauth/$provider/callback" }
    }
    Write-EnvFile $path $local
    $workerPath = Join-Path $script:SetupRoot 'worker.env'
    $worker = Read-EnvFile $workerPath
    if ($worker.ContainsKey('LOCAL_WORKER_MODE') -and $worker.LOCAL_WORKER_MODE -ne 'offline') { throw 'El worker del instalador debe seguir offline.' }
    if ($worker.ContainsKey('LOCAL_WORKER_API_TOKEN') -and $worker.LOCAL_WORKER_API_TOKEN -and $worker.LOCAL_WORKER_API_TOKEN -ne $local.LOCAL_WORKER_API_TOKEN) { throw 'Los tokens del worker y backend no coinciden; revisar localmente.' }
    $worker.LOCAL_WORKER_MODE = 'offline'; $worker.LOCAL_WORKER_API_URL = $local.APP_BASE_URL
    $worker.LOCAL_WORKER_API_TOKEN = $local.LOCAL_WORKER_API_TOKEN
    foreach ($pair in @(@('LOCAL_WORKER_ID', 'pixellabs-pc-principal'), @('LOCAL_WORKER_INBOX_DIR', './local-worker/inbox'),
        @('LOCAL_WORKER_WORK_DIR', './local-worker/work'), @('LOCAL_WORKER_POLL_MS', '5000'), @('LOCAL_WORKER_CLIP_STYLE', 'process-real'))) {
        if (-not $worker.ContainsKey($pair[0])) { $worker[$pair[0]] = $pair[1] }
    }
    Write-EnvFile $workerPath $worker
    foreach ($key in @('LOCAL_WORKER_INBOX_DIR', 'LOCAL_WORKER_WORK_DIR')) {
        $resolved = [IO.Path]::GetFullPath((Join-Path $script:RepoRoot $worker[$key]))
        if (-not $resolved.StartsWith($script:RepoRoot.TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Las carpetas del perfil offline deben estar dentro de este repositorio; no se modificaran rutas externas.'
        }
        Assert-UnlinkedLocalPath $resolved
        New-Item -ItemType Directory -Path $resolved -Force | Out-Null
        if (((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'La carpeta del worker es un enlace. Revisar localmente.' }
        $probe = Join-Path $resolved ('.permission-' + [Guid]::NewGuid().ToString('N'))
        try { [IO.File]::WriteAllText($probe, 'local write check') } finally { if (Test-Path -LiteralPath $probe) { Remove-Item -LiteralPath $probe -Force } }
    }
    $n8nPath = Join-Path $script:SetupRoot 'n8n.env'
    $n8n = Read-EnvFile $n8nPath
    if ($n8n.ContainsKey('N8N_ENCRYPTION_KEY') -and $n8n.N8N_ENCRYPTION_KEY -ne $local.N8N_ENCRYPTION_KEY) { throw 'La clave n8n del perfil no coincide; no se rotara.' }
    $n8n.N8N_ENCRYPTION_KEY = $local.N8N_ENCRYPTION_KEY
    $n8n.PIXELLABS_API_URL = 'http://backend:3000'; $n8n.PIXELLABS_N8N_API_TOKEN = $local.N8N_WEBHOOK_SECRET
    foreach ($key in $script:SafeFlags.Keys) { $n8n[$key] = $script:SafeFlags[$key] }
    Write-EnvFile $n8nPath $n8n
    if (-not (Test-Path -LiteralPath (Join-Path $script:RepoRoot 'n8n/local/config.env'))) {
        Write-EnvFile (Join-Path $script:RepoRoot 'n8n/local/config.env') $n8n
    }
    foreach ($relative in @('local-worker/inbox', 'local-worker/work', 'storage/uploads', 'storage/work')) {
        $directory = Join-Path $script:RepoRoot $relative
        Assert-UnlinkedLocalPath $directory
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
        if (((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Una carpeta de datos es un enlace. Revisar antes de continuar.' }
        $probe = Join-Path $directory ('.permission-' + [Guid]::NewGuid().ToString('N'))
        try { [IO.File]::WriteAllText($probe, 'local write check') } finally { if (Test-Path -LiteralPath $probe) { Remove-Item -LiteralPath $probe -Force } }
    }
    Invoke-SetupCommand 'node.exe' @('-e', "require('./setup/windows/safety').loadLocalEnvironment(process.cwd()); console.log('Secretos y barreras locales: OK');") 'Configuracion local invalida.' | Out-Null
    Save-SetupProgress 'configuracion local'
}

function Set-ComposeEnvironment {
    Assert-SafeConfiguration -RequireProfile
    $local = Read-EnvFile (Join-Path $script:SetupRoot 'local.env')
    $instancePath = Join-Path $script:StateRoot 'backend-instance.txt'
    if (-not (Test-Path -LiteralPath $instancePath)) { Write-PrivateText $instancePath ([Guid]::NewGuid().ToString()) }
    $instance = (Get-Content -LiteralPath $instancePath -Raw).Trim()
    if ($instance -notmatch '^[a-f0-9-]{36}$') { throw 'Identificador de servicio invalido.' }
    $env:PIXELLABS_REPO_PATH = $script:RepoRoot.Replace('\', '/')
    $env:PIXELLABS_LOCAL_ENV_FILE = (Join-Path $script:SetupRoot 'local.env').Replace('\', '/')
    $env:PIXELLABS_N8N_CONFIG_FILE = (Join-Path $script:SetupRoot 'n8n.env').Replace('\', '/')
    $env:PIXELLABS_BACKEND_PORT = $local.PORT
    $env:PIXELLABS_BACKEND_INSTANCE = $instance
}

function Invoke-LocalCompose([string[]]$Arguments, [switch]$Quiet, [switch]$AllowEmptyExport) {
    Assert-LocalDocker
    Set-ComposeEnvironment
    $base = @('compose', '--project-directory', (Join-Path $script:RepoRoot 'n8n/local'), '-f',
        (Join-Path $script:RepoRoot 'n8n/local/docker-compose.yml'), '-f', (Join-Path $script:SetupRoot 'docker-compose.local.yml'))
    $result = Invoke-NativeCapture 'docker.exe' ($base + $Arguments)
    if ($result.Output) { Write-SetupLog $result.Output }
    if ($result.Code -ne 0) {
        $empty = $AllowEmptyExport -and $Arguments -contains 'export:workflow' -and $result.Code -eq 1 -and
            $result.Output -match '(?m)^No workflows found with specified filters\s*$'
        if (-not $empty) { throw 'Docker Compose no completo la operacion. Revisa Docker Desktop y el log local.' }
        Write-SetupMessage 'Base n8n nueva: todavia no hay workflows importados.'
    }
    return $result.Output
}

function Wait-LocalUrl([string]$Url) {
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        try { $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -eq 200) { return } } catch { }
        Start-Sleep -Seconds 2
    }
    throw "El servicio no respondio: $Url"
}

function Invoke-N8nSetupCli([string[]]$Arguments, [switch]$Quiet, [switch]$AllowEmptyExport) {
    $binary = $Arguments[0]
    $remaining = @(); if ($Arguments.Length -gt 1) { $remaining = $Arguments[1..($Arguments.Length - 1)] }
    return Invoke-LocalCompose (@('run', '--rm', '--no-deps', '-T', '--entrypoint', $binary, 'n8n') + $remaining) -Quiet:$Quiet -AllowEmptyExport:$AllowEmptyExport
}

function Sync-LocalWorkflows {
    # A unique empty directory prevents stale exports/imports and never touches persistent data.
    $identifier = [Guid]::NewGuid().ToString('N')
    $hostDirectory = Join-Path $script:StateRoot "n8n-staging/$identifier"
    Ensure-PrivateDirectory $hostDirectory
    $temporary = '/setup/' + $identifier
    Invoke-N8nSetupCli @('mkdir', '-p', "$temporary/export", "$temporary/missing") -Quiet | Out-Null
    try {
        Invoke-N8nSetupCli @('n8n', 'export:workflow', '--all', '--separate', "--output=$temporary/export") -AllowEmptyExport | Out-Null
        $result = Invoke-N8nSetupCli @('node', '/opt/pixellabs/prepareMissingWorkflows.js', "$temporary/export", '/workflows', "$temporary/missing") -Quiet
        $jsonLines = @($result -split "`n" | Where-Object { $_.Trim() -match '^\{"missing":\d+,"active":0\}$' })
        if ($jsonLines.Count -ne 1) { throw 'No se pudo comprobar la importacion segura.' }
        $summary = ($jsonLines[0] | ConvertFrom-Json)
        if ($summary.missing -gt 0) {
            Write-SetupMessage "Importando $($summary.missing) workflows faltantes, sin duplicar los existentes..."
            Invoke-N8nSetupCli @('n8n', 'import:workflow', '--separate', "--input=$temporary/missing") | Out-Null
        }
        $verify = "$temporary/verified"
        Invoke-N8nSetupCli @('mkdir', '-p', $verify) -Quiet | Out-Null
        Invoke-N8nSetupCli @('n8n', 'export:workflow', '--all', '--separate', "--output=$verify") | Out-Null
        Invoke-N8nSetupCli @('node', '/opt/pixellabs/verifyImportedWorkflows.js', $verify) | Out-Null
        Invoke-N8nSetupCli @('touch', '/home/node/.n8n/pixellabs-workflows-v1') -Quiet | Out-Null
        Write-SetupMessage 'n8n: 12/12 workflows, todos INACTIVE.'
    } finally { if (Test-Path -LiteralPath $hostDirectory) { Remove-Item -LiteralPath $hostDirectory -Recurse -Force } }
}

function Get-ManagedWorker {
    $path = Join-Path $script:StateRoot 'worker-process.json'
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    $state = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$state.pid)" -ErrorAction SilentlyContinue
    if (-not $process) { return $null }
    $hostPath = Join-Path $script:SetupRoot 'service-host.js'
    if (-not $process.CommandLine -or -not $process.CommandLine.Contains($hostPath) -or
        -not $process.CommandLine.Contains($state.instance) -or $process.CreationDate.ToUniversalTime().ToString('o') -ne $state.createdAt) {
        throw 'El PID guardado pertenece a otro proceso. No se detendra ni reutilizara.'
    }
    return $state
}

function Stop-ManagedWorker {
    $worker = Get-ManagedWorker
    if (-not $worker) { return }
    Write-PrivateText (Join-Path $script:StateRoot "stop-$($worker.instance)") 'stop'
    for ($attempt = 0; $attempt -lt 10; $attempt++) { if (-not (Get-ManagedWorker)) { break }; Start-Sleep -Seconds 1 }
    if (Get-ManagedWorker) {
        # Only this verified process and its FFmpeg children; never all Node processes.
        Invoke-SetupCommand 'taskkill.exe' @('/PID', [string]$worker.pid, '/T', '/F') 'No se pudo detener el worker propio.' | Out-Null
    }
    Remove-Item -LiteralPath (Join-Path $script:StateRoot 'worker-process.json') -ErrorAction SilentlyContinue
}

function Start-ManagedWorker([switch]$Paused) {
    $worker = Get-ManagedWorker
    if ($worker) {
        $healthPath = Join-Path $script:StateRoot 'worker-health.json'
        $current = Invoke-NativeCapture 'node.exe' @('-e', "const s=require('./setup/windows/safety'); console.log(s.fingerprint(s.loadWorkerEnvironment(process.cwd())));")
        $valid = $false
        if ($current.Code -eq 0 -and (Test-Path -LiteralPath $healthPath)) {
            $health = Get-Content -LiteralPath $healthPath -Raw | ConvertFrom-Json
            $valid = $health.instance -eq $worker.instance -and $health.configuration -eq $current.Output.Trim() -and
                $health.status -eq 'ready' -and ((Get-Date).ToUniversalTime() - [datetime]$health.updatedAt).TotalSeconds -lt 15
        }
        if (-not $valid) { Stop-ManagedWorker; $worker = $null }
    }
    if ($worker -and $worker.paused -ne $Paused.IsPresent) { Stop-ManagedWorker; $worker = $null }
    if (-not $worker) {
        $instance = [Guid]::NewGuid().ToString()
        $hostPath = Join-Path $script:SetupRoot 'service-host.js'
        $arguments = @(('"{0}"' -f $hostPath), 'worker', $instance)
        if ($Paused) { $arguments += '--paused' }
        $process = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList $arguments -WorkingDirectory $script:RepoRoot -PassThru -WindowStyle Hidden
        $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)"
        if (-not $cim) { throw 'El worker termino antes de iniciar.' }
        $worker = [pscustomobject]@{ pid = $process.Id; instance = $instance; paused = $Paused.IsPresent;
            createdAt = $cim.CreationDate.ToUniversalTime().ToString('o') }
        Write-PrivateText (Join-Path $script:StateRoot 'worker-process.json') ($worker | ConvertTo-Json)
    }
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        $health = Join-Path $script:StateRoot 'worker-health.json'
        if (Test-Path -LiteralPath $health) {
            $value = Get-Content -LiteralPath $health -Raw | ConvertFrom-Json
            if ($value.instance -eq $worker.instance -and $value.status -eq 'ready') { return }
        }
        Start-Sleep -Seconds 1
    }
    throw 'El worker no confirmo su inicio. Ejecuta REPARAR-PIXELLABS.bat.'
}

function Show-CredentialActions {
    $local = Read-EnvFile (Join-Path $script:SetupRoot 'local.env')
    foreach ($group in @(
        @(@('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'), 'Supabase: proyecto Free existente > Settings > API. Para indices/RLS/migraciones, agrega SUPABASE_DB_URL desde Connect.'),
        @(@('GEMINI_API_KEY'), 'Gemini: https://aistudio.google.com/api-keys, proyecto sin billing. La IA editorial continuara apagada.'),
        @(@('META_APP_ID', 'META_APP_SECRET', 'FACEBOOK_PAGE_ID'), 'Meta: https://developers.facebook.com/apps y la Pagina propia. OAuth se realizara despues.'),
        @(@('TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'), 'TikTok: https://developers.tiktok.com/ > Manage apps. OAuth se realizara despues.')
    )) {
        $missing = @($group[0] | Where-Object { -not $local.ContainsKey($_) -or -not $local[$_] })
        if ($missing.Count) { Write-SetupMessage ("ACTION REQUIRED: faltan {0}. {1}" -f ($missing -join ', '), $group[1]) }
    }
    Write-SetupMessage 'Completa credenciales solo en setup/windows/local.env, protegido e ignorado por Git. No pegarlas en un chat.'
    if ($local.SUPABASE_URL -and $local.SUPABASE_SERVICE_ROLE_KEY -and (-not $local.ContainsKey('SUPABASE_DB_URL') -or -not $local.SUPABASE_DB_URL)) {
        Write-SetupMessage 'ACTION REQUIRED: falta la conexion PostgreSQL de Supabase > Connect para comprobar migraciones, indices y RLS.'
    }
    Write-SetupMessage 'Los callbacks locales estan preparados; Meta/TikTok pueden exigir HTTPS registrado para la fase OAuth posterior.'
}

function Show-LocalStatus {
    Write-SetupMessage 'PixelLabs Local Environment'
    $failures = 0
    foreach ($component in @('Backend', 'n8n', 'Worker', 'FFmpeg', 'Docker')) {
        $ok = $false
        try {
            switch ($component) {
                'Backend' {
                    $envFile = Read-EnvFile (Join-Path $script:SetupRoot 'local.env')
                    $value = Invoke-RestMethod -Uri "$($envFile.APP_BASE_URL)/healthz" -TimeoutSec 5
                    $ok = $value.ok -eq $true -and $value.autoPublish -eq $false
                }
                'n8n' { $value = Invoke-WebRequest -Uri 'http://127.0.0.1:5678/healthz' -UseBasicParsing -TimeoutSec 5; $ok = $value.StatusCode -eq 200 }
                'Worker' {
                    $worker = Get-ManagedWorker
                    $health = Get-Content -LiteralPath (Join-Path $script:StateRoot 'worker-health.json') -Raw | ConvertFrom-Json
                    $ok = $worker -and $health.instance -eq $worker.instance -and $health.status -eq 'ready' -and
                        ((Get-Date).ToUniversalTime() - [datetime]$health.updatedAt).TotalSeconds -lt 15 -and -not $health.lastError
                }
                'FFmpeg' { $a = Invoke-NativeCapture 'ffmpeg.exe' @('-version'); $b = Invoke-NativeCapture 'ffprobe.exe' @('-version'); $ok = $a.Code -eq 0 -and $b.Code -eq 0 }
                'Docker' { $value = Invoke-NativeCapture 'docker.exe' @('info', '--format', '{{.OSType}}'); $ok = $value.Code -eq 0 -and $value.Output.Trim() -eq 'linux' }
            }
        } catch { $ok = $false }
        if (-not $ok) { $failures++ }
        Write-SetupMessage ("{0}: {1}" -f $component, $(if ($ok) { 'OK' } else { 'FAIL' }))
    }
    $profile = Read-EnvFile (Join-Path $script:SetupRoot 'local.env')
    Write-SetupMessage "Panel: $($profile.APP_BASE_URL)/admin"
    Write-SetupMessage 'n8n: http://127.0.0.1:5678'
    Write-SetupMessage 'Worker: modo offline, sin subidas; borradores en local-worker/work.'
    return $failures
}
