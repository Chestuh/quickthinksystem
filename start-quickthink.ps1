$ErrorActionPreference = 'Stop'

$projectRoot = $PSScriptRoot
$backendPath = Join-Path $projectRoot 'backend'
$backendEnvPath = Join-Path $backendPath '.env'
$databasePath = Join-Path $backendPath 'database\database.sqlite'
$frontendEnvPath = Join-Path $projectRoot '.env.local'
$apiUrl = 'http://127.0.0.1:8001'
$frontendUrl = 'http://localhost:5173'
$apiHealthUrl = "$apiUrl/up"
$frontendApiUrl = "$apiUrl/api"

$phpCommand = Get-Command php -ErrorAction SilentlyContinue
if ($phpCommand) {
    $phpPath = $phpCommand.Source
} else {
    $phpPackages = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
    $phpPackage = Get-ChildItem $phpPackages -Directory -Filter 'PHP.PHP.8.3_*' -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($phpPackage) {
        $phpPath = Join-Path $phpPackage.FullName 'php.exe'
    }
}

if (-not $phpPath -or -not (Test-Path $phpPath)) {
    throw 'PHP 8.2+ was not found. Install PHP, reopen PowerShell, and run this file again.'
}
if (-not (Test-Path (Join-Path $backendPath 'vendor\autoload.php'))) {
    throw 'Laravel dependencies are missing. Run "composer install" from the backend folder first.'
}
if (-not (Test-Path (Join-Path $projectRoot 'node_modules\.bin\vite.cmd'))) {
    throw 'Frontend dependencies are missing. Run "npm install" from the project folder first.'
}

if (-not (Test-Path $backendEnvPath)) {
    Copy-Item (Join-Path $backendPath '.env.example') $backendEnvPath
    Write-Warning 'Created backend\.env. Set ADMIN_EMAIL and ADMIN_PASSWORD before creating the admin account.'
}

$backendEnv = Get-Content $backendEnvPath
if (-not ($backendEnv | Where-Object { $_ -match '^APP_KEY=.+$' })) {
    Push-Location $backendPath
    try {
        & $phpPath artisan key:generate
        if ($LASTEXITCODE -ne 0) {
            throw 'Could not generate the Laravel application key.'
        }
    } finally {
        Pop-Location
    }
}

New-Item -ItemType Directory -Force -Path (Split-Path $databasePath) | Out-Null
if (-not (Test-Path $databasePath)) {
    New-Item -ItemType File -Path $databasePath | Out-Null
}

if (-not (Test-Path $frontendEnvPath)) {
    Copy-Item (Join-Path $projectRoot '.env.example') $frontendEnvPath
}
$frontendEnv = [System.Collections.Generic.List[string]]::new()
$frontendEnv.AddRange([string[]](Get-Content $frontendEnvPath))
$apiSetting = -1
for ($index = 0; $index -lt $frontendEnv.Count; $index++) {
    if ($frontendEnv[$index] -match '^VITE_API_URL=') {
        $apiSetting = $index
        break
    }
}
if ($apiSetting -ge 0) {
    $frontendEnv[$apiSetting] = "VITE_API_URL=$frontendApiUrl"
} else {
    $frontendEnv.Add("VITE_API_URL=$frontendApiUrl")
}
[System.IO.File]::WriteAllLines($frontendEnvPath, $frontendEnv, [System.Text.UTF8Encoding]::new($false))

Push-Location $backendPath
try {
    & $phpPath artisan migrate --force
    if ($LASTEXITCODE -ne 0) {
        throw 'Laravel migrations failed; check the backend terminal output.'
    }
    & $phpPath artisan db:seed --class=DemoAccountsSeeder --force
    if ($LASTEXITCODE -ne 0) {
        throw 'Local test accounts could not be seeded. Confirm backend\.env uses APP_ENV=local and DB_CONNECTION=sqlite.'
    }
} finally {
    Pop-Location
}

function Test-ServiceResponse {
    param([string]$Url)
    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec 3 -UseBasicParsing
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Get-PortListener {
    param([int]$Port)
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
}

function Start-ApiServer {
    $listener = Get-PortListener -Port 8001
    if ($listener) {
        if (Test-ServiceResponse -Url $apiHealthUrl) {
            Write-Output 'Laravel API is already responding on port 8001.'
            return
        }
        throw "Port 8001 is occupied by process $($listener.OwningProcess), but it is not the QuickThink API."
    }

    $apiCommand = "Set-Location -LiteralPath '$backendPath'; & '$phpPath' artisan serve --host=127.0.0.1 --port=8001"
    Start-Process -FilePath 'powershell.exe' `
        -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $apiCommand) `
        -WorkingDirectory $backendPath | Out-Null

    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Test-ServiceResponse -Url $apiHealthUrl) {
            Write-Output 'Laravel API started on http://127.0.0.1:8001.'
            return
        }
        Start-Sleep -Seconds 1
    }
    throw 'Laravel did not start. Check the Laravel API terminal for an error.'
}

function Test-FrontendApiConfiguration {
    try {
        $module = Invoke-WebRequest -Uri "$frontendUrl/src/services/api.js" -TimeoutSec 3 -UseBasicParsing
        return $module.Content.Contains($frontendApiUrl)
    } catch {
        return $false
    }
}

function Start-FrontendServer {
    $listener = Get-PortListener -Port 5173
    if ($listener) {
        if ((Test-ServiceResponse -Url $frontendUrl) -and (Test-FrontendApiConfiguration)) {
            Write-Output 'QuickThink frontend is already responding on port 5173.'
            return
        }

        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
        $viteEntry = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
        if (-not $process -or $process.CommandLine -notlike "*$viteEntry*") {
            throw "Port 5173 is occupied by another application (process $($listener.OwningProcess)). It was not stopped."
        }
        Stop-Process -Id ([int]$listener.OwningProcess) -Force
        Start-Sleep -Seconds 2
    }

    $nodeCommand = Get-Command node.exe -ErrorAction Stop
    $viteEntry = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
    $frontendCommand = "Set-Location -LiteralPath '$projectRoot'; & '$($nodeCommand.Source)' '$viteEntry' --strictPort"
    Start-Process -FilePath 'powershell.exe' `
        -ArgumentList @('-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $frontendCommand) `
        -WorkingDirectory $projectRoot | Out-Null

    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if ((Test-ServiceResponse -Url $frontendUrl) -and (Test-FrontendApiConfiguration)) {
            Write-Output 'QuickThink frontend started on http://localhost:5173.'
            return
        }
        Start-Sleep -Seconds 1
    }
    throw 'The frontend did not start with the expected API URL. Check the frontend terminal for an error.'
}

Start-ApiServer
Start-FrontendServer
Start-Process $frontendUrl
Write-Output 'QuickThink is ready at http://localhost:5173.'
