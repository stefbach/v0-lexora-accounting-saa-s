#!/usr/bin/env bash
# Lexora MCP installer — Mac / Linux / Git Bash (Windows)
#
# Usage : curl -fsSL https://ton-lexora.vercel.app/install-mcp.sh | bash
#
# Pré-requis : génère une clé API Lexora dans
#   /client/direction/mcp-setup → "Créer une nouvelle clé"
# (copie le token "lex_..." qui apparaît une seule fois)

set -euo pipefail

INSTALL_DIR="${LEXORA_MCP_DIR:-$HOME/.lexora-mcp}"
REPO_URL="${LEXORA_MCP_REPO:-https://github.com/stefbach/v0-lexora-accounting-saa-s.git}"
BRANCH="${LEXORA_MCP_BRANCH:-claude/lexora-ifrs-realtime-editable-mcp}"

if [[ -t 1 ]]; then
  C_OK=$'\033[0;32m'; C_WARN=$'\033[1;33m'; C_ERR=$'\033[0;31m'
  C_INFO=$'\033[0;36m'; C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'
else
  C_OK=''; C_WARN=''; C_ERR=''; C_INFO=''; C_RESET=''; C_BOLD=''
fi
info()  { printf "${C_INFO}▸${C_RESET} %s\n" "$*"; }
ok()    { printf "${C_OK}✓${C_RESET} %s\n" "$*"; }
warn()  { printf "${C_WARN}!${C_RESET} %s\n" "$*"; }
err()   { printf "${C_ERR}✗${C_RESET} %s\n" "$*" >&2; }

# ── 1. Pré-requis ─────────────────────────────────────────────────────
info "Vérification des pré-requis..."
for cmd in node npm git; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    err "$cmd n'est pas installé. Installe Node.js (avec npm) et Git, puis relance."
    err "Node : https://nodejs.org/  |  Git : https://git-scm.com/"
    exit 1
  fi
done
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  err "Node.js v18+ requis (tu as $(node -v))."
  exit 1
fi
ok "Node.js $(node -v), npm $(npm -v)"

# ── 2. Détection chemin Claude Desktop ────────────────────────────────
case "$(uname -s)" in
  Darwin*)
    CONFIG_PATH="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
    PLATFORM="macOS" ;;
  Linux*)
    CONFIG_PATH="$HOME/.config/Claude/claude_desktop_config.json"
    PLATFORM="Linux" ;;
  MINGW*|MSYS*|CYGWIN*)
    CONFIG_PATH="${APPDATA:-$HOME/AppData/Roaming}/Claude/claude_desktop_config.json"
    PLATFORM="Windows (Git Bash)" ;;
  *)
    err "OS non supporté : $(uname -s)."; exit 1 ;;
esac
ok "$PLATFORM — config Claude Desktop : $CONFIG_PATH"

# ── 3. Saisie minimale : URL + clé API ─────────────────────────────────
printf "\n${C_BOLD}Paramètres Lexora${C_RESET} (2 champs)\n\n"
if [[ -t 0 ]]; then PROMPT_IN="/dev/stdin"; else PROMPT_IN="/dev/tty"; fi

read -p "URL de ton instance Lexora (ex: https://lexora.vercel.app) : " LEXORA_URL < "$PROMPT_IN"
read -p "Ta clé API Lexora (format lex_...)                          : " LEXORA_KEY < "$PROMPT_IN"

[[ -z "$LEXORA_URL" || -z "$LEXORA_KEY" ]] && { err "URL et clé requises."; exit 1; }
[[ "$LEXORA_KEY" != lex_* ]] && { err "La clé doit commencer par 'lex_'. Génère-en une depuis ton Lexora → Direction → Connecter à Claude Desktop."; exit 1; }
LEXORA_URL="${LEXORA_URL%/}"

# ── 4. Clone / update ─────────────────────────────────────────────────
printf "\n"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "MAJ Lexora MCP dans $INSTALL_DIR..."
  git -C "$INSTALL_DIR" fetch --quiet
  git -C "$INSTALL_DIR" checkout --quiet "$BRANCH"
  git -C "$INSTALL_DIR" pull --quiet
else
  info "Clone Lexora MCP dans $INSTALL_DIR (peut prendre 30s)..."
  git clone --quiet --branch "$BRANCH" --single-branch "$REPO_URL" "$INSTALL_DIR"
fi
ok "Repo prêt"

# ── 5. Build ──────────────────────────────────────────────────────────
info "Installation deps MCP server..."
cd "$INSTALL_DIR/mcp-server"
npm install --silent --no-audit --no-fund
info "Compilation..."
npm run build --silent
DIST="$INSTALL_DIR/mcp-server/dist/index.js"
[[ -f "$DIST" ]] || { err "Build raté"; exit 1; }
ok "Compilé : $DIST"

# ── 6. Merge config Claude Desktop ────────────────────────────────────
info "Mise à jour de $CONFIG_PATH..."
mkdir -p "$(dirname "$CONFIG_PATH")"
[[ -f "$CONFIG_PATH" ]] && cp "$CONFIG_PATH" "$CONFIG_PATH.bak" && ok "Backup : $CONFIG_PATH.bak"

CONFIG_PATH="$CONFIG_PATH" DIST="$DIST" \
  LEXORA_URL="$LEXORA_URL" LEXORA_KEY="$LEXORA_KEY" \
  node -e '
const fs = require("fs");
const p = process.env.CONFIG_PATH;
let cfg = {};
if (fs.existsSync(p)) { try { cfg = JSON.parse(fs.readFileSync(p, "utf8")); } catch {} }
cfg.mcpServers = cfg.mcpServers || {};
cfg.mcpServers.lexora = {
  command: "node",
  args: [process.env.DIST],
  env: {
    LEXORA_API_URL: process.env.LEXORA_URL,
    LEXORA_API_KEY: process.env.LEXORA_KEY,
  },
};
fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n");
'
ok "Config Claude Desktop mise à jour"

printf "\n${C_OK}${C_BOLD}✅ Installation terminée !${C_RESET}\n\n"
printf "${C_BOLD}À faire maintenant :${C_RESET}\n"
printf "  1. Quitte complètement Claude Desktop\n"
case "$PLATFORM" in
  macOS*)   printf "     → Cmd+Q\n" ;;
  Windows*) printf "     → Clic droit dans systray → Quit\n" ;;
  Linux*)   printf "     → pkill -f Claude\n" ;;
esac
printf "  2. Relance Claude Desktop\n"
printf "  3. Tape : ${C_INFO}«Liste mes sociétés Lexora.»${C_RESET}\n\n"
