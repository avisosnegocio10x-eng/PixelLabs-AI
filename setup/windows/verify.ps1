param([switch]$NonInteractive, [switch]$RunTests, [switch]$FromInstaller)
. (Join-Path $PSScriptRoot 'common.ps1')
try {
    Initialize-Setup 'verificacion' -NonInteractive:$NonInteractive
    Assert-SafeConfiguration -RequireProfile
    $rows = @(Get-DependencyStatus); Show-Dependencies $rows
    foreach ($name in @('Windows', 'x64', 'PowerShell', 'Node.js', 'npm', 'Docker', 'Docker Compose', 'FFmpeg', 'ffprobe', 'Reinicio')) {
        if (($rows | Where-Object Name -eq $name).Status -ne 'OK') { throw "Fallo de dependencia: $name." }
    }
    Invoke-SetupCommand 'node.exe' @('-e', "require('./setup/windows/safety').loadLocalEnvironment(process.cwd()); console.log('Configuracion: OK');") 'Perfil local inseguro.' | Out-Null
    Invoke-SetupCommand 'node.exe' @('scripts/validateN8nWorkflows.js') 'JSON de n8n invalido.' | Out-Null
    # Read-only export from the running instance; no activation or reimport in verify.
    $temporary = '/tmp/pixellabs-verify-' + [Guid]::NewGuid().ToString('N')
    try {
        Invoke-LocalCompose @('exec', '-T', 'n8n', 'mkdir', '-p', $temporary) -Quiet | Out-Null
        Invoke-LocalCompose @('exec', '-T', 'n8n', 'n8n', 'export:workflow', '--all', '--separate', "--output=$temporary") | Out-Null
        Invoke-LocalCompose @('exec', '-T', 'n8n', 'node', '/opt/pixellabs/verifyImportedWorkflows.js', $temporary) | Out-Null
    } finally { Invoke-LocalCompose @('exec', '-T', 'n8n', 'rm', '-rf', $temporary) -Quiet | Out-Null }
    # The private bridge resolves backend; the host-facing ports remain loopback-only.
    Invoke-LocalCompose @('exec', '-T', 'n8n', 'node', '-e',
        "fetch(process.env.PIXELLABS_API_URL+'/healthz').then(async r=>{const b=await r.json();if(!r.ok||b.ok!==true||b.autoPublish!==false)process.exit(1);console.log('n8n -> backend local: OK')}).catch(()=>process.exit(1))") | Out-Null
    Invoke-SetupCommand 'node.exe' @('setup/windows/qa.js', '--ffmpeg-only') 'FFmpeg no puede generar/probar H.264.' | Out-Null
    if ($RunTests -and -not $FromInstaller) { Invoke-SetupCommand 'node.exe' @('setup/windows/qa.js', '--n8n') 'Las pruebas fallaron.' | Out-Null }
    $failures = Show-LocalStatus
    if ($failures -ne 0) { throw 'Hay componentes con FAIL.' }
    Write-SetupMessage 'VERIFICACION LOCAL: OK. 12/12 INACTIVE. Publicacion desactivada.'
    exit 0
} catch { Write-SetupMessage ('VERIFICACION: FAIL - ' + $_.Exception.Message); exit 1 }
