# Lexora MCP installer — Windows PowerShell
#
# Usage :
#   iwr -useb https://ton-lexora.vercel.app/install-mcp.ps1 | iex
#
# OU télécharge + lance :
#   powershell -ExecutionPolicy Bypass -File install-mcp.ps1

$ErrorActionPreference = 'Stop'

$InstallDir = if ($env:LEXORA_MCP_DIR) { $env:LEXORA_MCP_DIR } else { "$env:USERPROFILE\.lexora-mcp" }
$RepoUrl    = if ($env:LEXORA_MCP_REPO) { $env:LEXORA_MCP_REPO } else { 'https://github.com/stefbach/v0-lexora-accounting-saa-s.git' }
$Branch     = if ($env:LEXORA_MCP_BRANCH) { $env:LEXORA_MCP_BRANCH } else { 'claude/lexora-ifrs-realtime-editable-mcp' }
$ConfigPath = "$env:APPDATA\Claude\claude_desktop_config.json"

function Info($msg)  { Write-Host "▸ $msg" -ForegroundColor Cyan }
function Ok($msg)    { Write-Host "✓ $msg" -ForegroundColor Green }
function Warn($msg)  { Write-Host "! $msg" -ForegroundColor Yellow }
function Err($msg)   { Write-Host "✗ $msg" -ForegroundColor Red }

# ── 1. Pré-requis ──────────────────────────────────────────────────────
Info "Vérification des pré-requis..."
foreach ($cmd in @('node', 'npm', 'git')) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Err "$cmd n'est pas installé."
    Err "Node : https://nodejs.org/  |  Git : https://git-scm.com/"
    exit 1
  }
}

$nodeVersion = (node -v).TrimStart('v').Split('.')[0]
if ([int]$nodeVersion -lt 18) {
  Err "Node.js v18 ou supérieur requis (tu as $(node -v))."
  exit 1
}
Ok "Node.js $(node -v), npm $(npm -v)"

# ── 2. Saisie des paramètres ──────────────────────────────────────────
Write-Host ""
Write-Host "Paramètres Lexora (3 champs requis, 1 optionnel)" -ForegroundColor White -BackgroundColor DarkBlue
Write-Host ""

$LexoraUrl   = Read-Host "URL de ton instance Lexora (ex: https://lexora.vercel.app)"
$LexoraToken = Read-Host "Token interne (variable INTERNAL_API_TOKEN côté Vercel)"
$LexoraUid   = Read-Host "Ton UUID utilisateur Lexora"
$LexoraEmail = Read-Host "Ton email (optionnel)"

if (-not $LexoraUrl -or -not $LexoraToken -or -not $LexoraUid) {
  Err "Les 3 premiers champs sont obligatoires. Abandon."
  exit 1
}

# Retire le slash final
$LexoraUrl = $LexoraUrl.TrimEnd('/')

# ── 3. Clone / update repo ────────────────────────────────────────────
Write-Host ""
if (Test-Path "$InstallDir\.git") {
  Info "Mise à jour du repo Lexora MCP dans $InstallDir..."
  git -C $InstallDir fetch --quiet
  git -C $InstallDir checkout --quiet $Branch
  git -C $InstallDir pull --quiet
} else {
  Info "Clone du repo Lexora MCP dans $InstallDir (peut prendre 30s)..."
  git clone --quiet --branch $Branch --single-branch $RepoUrl $InstallDir
}
Ok "Repo prêt"

# ── 4. Build du sous-package ──────────────────────────────────────────
Info "Installation des dépendances Node.js du MCP server..."
Push-Location "$InstallDir\mcp-server"
try {
  npm install --silent --no-audit --no-fund | Out-Null
  Ok "Dépendances installées"

  Info "Compilation TypeScript → JavaScript..."
  npm run build --silent | Out-Null
} finally {
  Pop-Location
}

$Dist = "$InstallDir\mcp-server\dist\index.js"
if (-not (Test-Path $Dist)) {
  Err "Build raté — dist/index.js absent."
  exit 1
}
Ok "Compilé : $Dist"

# ── 5. Fusion de la config Claude Desktop ─────────────────────────────
Info "Mise à jour de $ConfigPath..."
$ConfigDir = Split-Path -Parent $ConfigPath
if (-not (Test-Path $ConfigDir)) { New-Item -ItemType Directory -Path $ConfigDir | Out-Null }

if (Test-Path $ConfigPath) {
  Copy-Item $ConfigPath "$ConfigPath.bak" -Force
  Ok "Backup créé : $ConfigPath.bak"
  $cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json
} else {
  $cfg = [pscustomobject]@{ }
}

# PowerShell ConvertFrom-Json renvoie PSCustomObject — on convertit en hashtable
# pour pouvoir ajouter/modifier des propriétés facilement.
function ConvertTo-Hashtable {
  param([Parameter(ValueFromPipeline=$true)] $InputObject)
  if ($null -eq $InputObject) { return @{} }
  if ($InputObject -is [hashtable]) { return $InputObject }
  $hash = @{}
  foreach ($prop in $InputObject.PSObject.Properties) {
    $hash[$prop.Name] = $prop.Value
  }
  return $hash
}
$cfgHash = $cfg | ConvertTo-Hashtable
if (-not $cfgHash.ContainsKey('mcpServers')) { $cfgHash['mcpServers'] = @{} }
$mcpServers = $cfgHash['mcpServers'] | ConvertTo-Hashtable

$mcpServers['lexora'] = @{
  command = 'node'
  args    = @($Dist)
  env     = @{
    LEXORA_API_URL        = $LexoraUrl
    LEXORA_INTERNAL_TOKEN = $LexoraToken
    LEXORA_USER_ID        = $LexoraUid
    LEXORA_USER_EMAIL     = $LexoraEmail
  }
}
$cfgHash['mcpServers'] = $mcpServers

$cfgHash | ConvertTo-Json -Depth 10 | Out-File -FilePath $ConfigPath -Encoding utf8
Ok "Config Claude Desktop mise à jour"

# ── 6. Étapes suivantes ───────────────────────────────────────────────
Write-Host ""
Write-Host "✅ Installation terminée !" -ForegroundColor Green
Write-Host ""
Write-Host "À faire maintenant :" -ForegroundColor White
Write-Host "  1. Quitte complètement Claude Desktop"
Write-Host "     → Clic droit sur l'icône Claude dans la systray → Quit"
Write-Host "  2. Relance Claude Desktop"
Write-Host "  3. Dans une nouvelle conversation, tape :"
Write-Host "     « Liste mes sociétés Lexora. »" -ForegroundColor Cyan
Write-Host ""
Write-Host "En cas de problème, log Claude Desktop :"
Write-Host "  $env:LOCALAPPDATA\Claude\logs\mcp-server-lexora.log"
Write-Host ""
