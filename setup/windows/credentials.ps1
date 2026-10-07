. (Join-Path $PSScriptRoot 'common.ps1')
function Read-PrivateValue([string]$Label) {
    $secure = Read-Host $Label -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secure = $null }
}
try {
    Initialize-Setup 'credenciales'
    Assert-SafeConfiguration -RequireProfile
    $path = Join-Path $PSScriptRoot 'local.env'
    $values = Read-EnvFile $path
    Write-Host 'Elige la conexion a preparar. No se hara OAuth, no se publicara y no se habilitara billing.'
    Write-Host '1. Supabase existente Free   2. Gemini sin billing   3. Meta   4. TikTok   0. Salir'
    $choice = Read-Host 'Numero'
    $fields = @()
    switch ($choice) {
        '1' {
            Write-Host 'Abre Supabase > Settings > API. Para PostgreSQL, abre Connect y usa su URL con tu contrasena codificada como URL.'
            $fields = @(@('SUPABASE_URL', 'URL del proyecto Supabase'), @('SUPABASE_SERVICE_ROLE_KEY', 'Clave service-role, solo backend'),
                @('SUPABASE_DB_URL', 'URL PostgreSQL (opcional, necesaria para verificar y aplicar migraciones)'))
        }
        '2' {
            Write-Host 'Obten la clave en https://aistudio.google.com/api-keys de un proyecto SIN billing. La IA seguira apagada.'
            $fields = @(,@('GEMINI_API_KEY', 'Clave de Gemini'))
        }
        '3' {
            Write-Host 'Abre https://developers.facebook.com/apps y tu Pagina. No sustituyas la app ni el token del chatbot.'
            $fields = @(@('META_APP_ID', 'ID de la app Meta'), @('META_APP_SECRET', 'Secreto de la app Meta'),
                @('FACEBOOK_PAGE_ID', 'ID de tu Pagina Facebook'), @('META_GRAPH_API_VERSION', 'Version Graph API elegida en Meta'))
        }
        '4' {
            Write-Host 'Abre https://developers.tiktok.com/ > Manage apps. OAuth sera una fase posterior.'
            $fields = @(@('TIKTOK_CLIENT_KEY', 'Client key TikTok'), @('TIKTOK_CLIENT_SECRET', 'Client secret TikTok'))
        }
        '0' { exit 0 }
        default { throw 'Seleccion no valida.' }
    }
    foreach ($field in $fields) {
        Write-Host 'ENTER conserva el valor actual o deja el campo pendiente. El valor escrito no se mostrara.'
        $value = Read-PrivateValue $field[1]
        if ($value) { $values[$field[0]] = $value }
        $value = $null
    }
    Write-EnvFile $path $values
    Write-SetupMessage 'Configuracion privada guardada. Ejecuta REPARAR-PIXELLABS.bat para comprobar la conexion. Publicacion e IA siguen apagadas.'
    exit 0
} catch { Write-SetupMessage 'No se pudieron guardar las credenciales. Ejecuta el instalador primero y revisa el archivo solo en este PC.'; exit 1 }
