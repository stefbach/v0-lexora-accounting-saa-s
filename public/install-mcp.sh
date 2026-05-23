#!/usr/bin/env bash
# Lexora MCP installer — Mac / Linux / Git Bash (Windows)
#
# Usage : curl -fsSL https://ton-lexora.vercel.app/install-mcp.sh | bash
#
# Étapes :
#   1. Vérifie Node.js / npm / git
#   2. Détecte le chemin de config Claude Desktop selon l'OS
#   3. Demande à l'utilisateur ses paramètres Lexora (URL, token, UUID)
#   4. Clone le repo Lexora dans ~/.lexora-mcp (ou met à jour)
#   5. Build le sous-package mcp-server
#   6. Fusionne (ou crée) le fichier claude_desktop_config.json
#   7. Affiche les étapes suivantes

set -euo pipefail

INSTALL_DIR="${LEXORA_MCP_DIR:-$HOME/.lexora-mcp}"
REPO_URL="${LEXORA_MCP_REPO:-https://github.com/stefbach/v0-lexora-accounting-saa-s.git}"
BRANCH="${LEXORA_MCP_BRANCH:-claude/lexora-ifrs-realtime-editable-mcp}"

# ── Couleurs (désactivées si stdout n'est pas un TTY) ──────────────────
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

# ── 1. Pré-requis ──────────────────────────────────────────────────────
info "Vérification des pré-requis..."
for cmd in node npm git; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    err "$cmd n'est pas installé. Installe Node.js (qui inclut npm) et Git, puis relance ce script."
    err "Node : https://nodejs.org/  |  Git : https://git-scm.com/"
    exit 1
  fi
done

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  err "Node.js v18 ou supérieur requis (tu as v$(node -v))."
  exit 1
fi
ok "Node.js $(node -v), npm $(npm -v), git $(git --version | awk '{print $3}')"

# ── 2. Détection chemin Claude Desktop ─────────────────────────────────
case "$(uname -s)" in
  Darwin*)
    CONFIG_PATH="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
    PLATFORM="macOS"
    ;;
  Linux*)
    CONFIG_PATH="$HOME/.config/Claude/claude_desktop_config.json"
    PLATFORM="Linux"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    CONFIG_PATH="${APPDATA:-$HOME/AppData/Roaming}/Claude/claude_desktop_config.json"
    PLATFORM="Windows (Git Bash)"
    ;;
  *)
    err "OS non supporté : $(uname -s). Édite ce script pour ajouter ton OS."
    exit 1
    ;;
esac
ok "$PLATFORM détecté — config Claude Desktop : $CONFIG_PATH"

# ── 3. Saisie des paramètres ──────────────────────────────────────────
printf "\n${C_BOLD}Paramètres Lexora${C_RESET} (3 champs requis, 1 optionnel)\n\n"

# stdin peut être un pipe (curl | bash) ; on lit alors /dev/tty
if [[ -t 0 ]]; then PROMPT_IN="/dev/stdin"; else PROMPT_IN="/dev/tty"; fi

read -p "URL de ton instance Lexora (ex: https://lexora.vercel.app) : " LEXORA_URL < "$PROMPT_IN"
read -p "Token interne (variable INTERNAL_API_TOKEN côté Vercel)     : " LEXORA_TOKEN < "$PROMPT_IN"
read -p "Ton UUID utilisateur (cf. Supabase auth.users.id)             : " LEXORA_UID < "$PROMPT_IN"
read -p "Ton email (optionnel, pour les logs côté Lexora)              : " LEXORA_EMAIL < "$PROMPT_IN"

# Validation basique
[[ -z "$LEXORA_URL" || -z "$LEXORA_TOKEN" || -z "$LEXORA_UID" ]] && {
  err "Les 3 premiers champs sont obligatoires. Abandon."
  exit 1
}

# Nettoyage URL (retire le slash final)
LEXORA_URL="${LEXORA_URL%/}"

# ── 4. Clone / mise à jour du repo ────────────────────────────────────
printf "\n"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Mise à jour du repo Lexora MCP dans $INSTALL_DIR..."
  git -C "$INSTALL_DIR" fetch --quiet
  git -C "$INSTALL_DIR" checkout --quiet "$BRANCH"
  git -C "$INSTALL_DIR" pull --quiet
else
  info "Clone du repo Lexora MCP dans $INSTALL_DIR (peut prendre 30s)..."
  git clone --quiet --branch "$BRANCH" --single-branch "$REPO_URL" "$INSTALL_DIR"
fi
ok "Repo prêt"

# ── 5. Build du sous-package mcp-server ───────────────────────────────
info "Installation des dépendances Node.js du MCP server..."
cd "$INSTALL_DIR/mcp-server"
npm install --silent --no-audit --no-fund
ok "Dépendances installées"

info "Compilation du MCP server (TypeScript → JavaScript)..."
npm run build --silent
DIST="$INSTALL_DIR/mcp-server/dist/index.js"
[[ -f "$DIST" ]] || { err "Build raté — dist/index.js absent."; exit 1; }
ok "Compilé : $DIST"

# ── 6. Écriture / fusion de la config Claude Desktop ──────────────────
info "Mise à jour de $CONFIG_PATH..."
mkdir -p "$(dirname "$CONFIG_PATH")"

if [[ -f "$CONFIG_PATH" ]]; then
  cp "$CONFIG_PATH" "$CONFIG_PATH.bak"
  ok "Backup créé : $CONFIG_PATH.bak"
fi

# Utilise Node pour fusionner JSON proprement (gère le cas où le fichier
# contient déjà d'autres MCP servers — on n'écrase pas le reste).
CONFIG_PATH="$CONFIG_PATH" DIST="$DIST" \
  LEXORA_URL="$LEXORA_URL" LEXORA_TOKEN="$LEXORA_TOKEN" \
  LEXORA_UID="$LEXORA_UID" LEXORA_EMAIL="$LEXORA_EMAIL" \
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
    LEXORA_INTERNAL_TOKEN: process.env.LEXORA_TOKEN,
    LEXORA_USER_ID: process.env.LEXORA_UID,
    LEXORA_USER_EMAIL: process.env.LEXORA_EMAIL,
  },
};
fs.writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n");
'

ok "Config Claude Desktop mise à jour"

# ── 7. Étapes suivantes ───────────────────────────────────────────────
printf "\n${C_OK}${C_BOLD}✅ Installation terminée !${C_RESET}\n\n"
printf "${C_BOLD}À faire maintenant :${C_RESET}\n"
printf "  1. ${C_BOLD}Quitte complètement Claude Desktop${C_RESET}\n"
case "$PLATFORM" in
  macOS*)   printf "     → Cmd+Q (pas juste fermer la fenêtre)\n" ;;
  Windows*) printf "     → Clic droit sur l'icône Claude dans la systray → Quit\n" ;;
  Linux*)   printf "     → pkill -f Claude  (puis relance depuis le menu)\n" ;;
esac
printf "  2. ${C_BOLD}Relance Claude Desktop${C_RESET}\n"
printf "  3. Dans une nouvelle conversation, tape :\n"
printf "     ${C_INFO}«Liste mes sociétés Lexora.»${C_RESET}\n"
printf "\n"
printf "Si ça ne marche pas, vérifie le log Claude Desktop :\n"
case "$PLATFORM" in
  macOS*)   printf "  ~/Library/Logs/Claude/mcp-server-lexora.log\n" ;;
  Windows*) printf "  %%LOCALAPPDATA%%/Claude/logs/mcp-server-lexora.log\n" ;;
  Linux*)   printf "  ~/.config/Claude/logs/mcp-server-lexora.log\n" ;;
esac
printf "\n"
