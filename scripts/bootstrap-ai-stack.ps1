$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$GStackDir = Join-Path $HOME ".claude\skills\gstack"

Write-Host "== Shia Factory AI stack bootstrap =="
Write-Host "Repo: $RepoRoot"

function Require-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found."
    }
}

Require-Command git
Require-Command bash
Require-Command bun

$GStackParent = Split-Path $GStackDir -Parent
New-Item -ItemType Directory -Force -Path $GStackParent | Out-Null

if (Test-Path (Join-Path $GStackDir ".git")) {
    Write-Host "Updating GStack..."
    git -C $GStackDir pull --ff-only
} elseif (Test-Path $GStackDir) {
    throw "$GStackDir exists but is not a git checkout. Move it aside and retry."
} else {
    Write-Host "Installing GStack from garrytan/gstack..."
    git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git $GStackDir
}

Write-Host "Enabling GStack team mode..."
Push-Location $GStackDir
try {
    bash ./setup --team
} finally {
    Pop-Location
}

function Install-GStackHost([string]$HostName) {
    if (Get-Command $HostName -ErrorAction SilentlyContinue) {
        Write-Host "Installing/updating GStack host profile: $HostName"
        Push-Location $GStackDir
        try {
            bash ./setup --host $HostName
        } finally {
            Pop-Location
        }
        return $true
    }
    Write-Host "$HostName CLI not detected; skipping its explicit GStack profile."
    return $false
}

$AnyHost = $false
$AnyHost = (Install-GStackHost "claude") -or $AnyHost
$AnyHost = (Install-GStackHost "codex") -or $AnyHost
$AnyHost = (Install-GStackHost "hermes") -or $AnyHost

if (-not $AnyHost) {
    Write-Warning "No supported AI host CLI was detected. Team-mode GStack is installed; rerun after installing a host."
}

Write-Host "Installing/updating GBrain from garrytan/gbrain..."
bun install -g github:garrytan/gbrain

$BunBin = Join-Path $HOME ".bun\bin"
if (-not (Get-Command gbrain -ErrorAction SilentlyContinue)) {
    $env:Path = "$BunBin;$env:Path"
}
if (-not (Get-Command gbrain -ErrorAction SilentlyContinue)) {
    throw "gbrain was installed but is not on PATH. Add $BunBin to PATH and retry."
}

$BrainHome = if ($env:GBRAIN_HOME) { $env:GBRAIN_HOME } else { $HOME }
$GBrainConfig = Join-Path $BrainHome ".gbrain\config.json"

if (-not (Test-Path $GBrainConfig)) {
    Write-Host "Initializing local PGLite GBrain..."
    gbrain init --pglite
} else {
    Write-Host "Existing GBrain config detected; leaving its engine unchanged."
}

$SourcesJson = ""
try {
    $SourcesJson = (& gbrain sources list --json 2>$null | Out-String)
} catch {
    $SourcesJson = ""
}
if ($SourcesJson -match '"id"\s*:\s*"shia-factory"') {
    Write-Host "GBrain source 'shia-factory' already exists."
} else {
    Write-Host "Registering this repository as GBrain source 'shia-factory'..."
    & gbrain sources add shia-factory --path $RepoRoot --federated
}

function Register-GBrainMcp([string]$HostName) {
    if (-not (Get-Command $HostName -ErrorAction SilentlyContinue)) {
        return
    }

    $AlreadyRegistered = $false
    try {
        $ListOutput = (& $HostName mcp list 2>$null | Out-String)
        $AlreadyRegistered = $ListOutput -match '(?im)(^|\s)gbrain(\s|$)'
    } catch {
        $AlreadyRegistered = $false
    }

    if ($AlreadyRegistered) {
        Write-Host "GBrain MCP already registered for $HostName."
        return
    }

    Write-Host "Registering GBrain MEMORY_VERBS surface for $HostName..."
    try {
        & $HostName mcp add gbrain -- gbrain serve --surface verbs
    } catch {
        Write-Warning "MCP registration for $HostName did not complete. Register manually with: $HostName mcp add gbrain -- gbrain serve --surface verbs"
    }
}

Register-GBrainMcp "claude"
Register-GBrainMcp "codex"

Write-Host "Running GBrain health check..."
try {
    gbrain doctor
} catch {
    Write-Warning "gbrain doctor reported issues. Review the output before using persistent memory."
}

Write-Host ""
Write-Host "Bootstrap complete."
Write-Host "This repo is pinned to GBrain source: shia-factory"
Write-Host "Next: read docs/AI_STACK.md, then verify a remember -> fresh-session recall round trip."
