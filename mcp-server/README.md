# Lexora MCP Server

Serveur **Model Context Protocol** qui expose ton instance Lexora à Claude
(Desktop ou autre client MCP) et à n8n / scripts ops.

## Outils disponibles (v0.2.0)

| Outil | Description | Endpoint Lexora |
|---|---|---|
| `list_societes` | Liste les sociétés du user | `GET /api/client/societes` |
| `get_financial_summary` | Dashboard + P&L d'une société sur une période | `GET /api/client/financial` |
| `list_factures` | Liste factures clients/fournisseurs avec filtres | `GET /api/client/factures` |
| `list_alertes` | Alertes conformité + financières actives | `GET /api/client/alertes` |
| `get_taux_change` | Taux MUR (BOM officiels + fallback) | `GET /api/taux-change` |

Tous les outils sont **read-only** dans cette version. L'écriture (création
de factures, écritures, paie) reste pilotée par l'UI Lexora avec workflow
d'approbation humain.

## Architecture

```
Claude Desktop  ──stdio──▶  mcp-server (Node, ce package)
                                │
                                │  HTTP avec headers :
                                │    X-Internal-Token: <secret partagé>
                                │    X-Internal-User-Id: <UUID utilisateur>
                                ▼
                         Lexora API (Next.js sur Vercel)
                                │
                                └─▶ Supabase (PostgreSQL)
```

Le token interne est validé côté Lexora dans `lib/lexora-internal-auth.ts`
contre la variable d'environnement `INTERNAL_API_TOKEN`. La résolution
d'utilisateur (session OR token) se fait via `lib/supabase/auth-resolver.ts`.

## Installation

### 1. Pré-requis côté Lexora

Sur ton déploiement Vercel, ajouter la variable d'env :

```
INTERNAL_API_TOKEN=<un secret long aléatoire — 32+ caractères>
```

Récupérer l'UUID de ton utilisateur Lexora (visible dans Supabase Studio
ou via `SELECT id FROM auth.users WHERE email = 'toi@x.mu'`).

### 2. Build du MCP en local

```bash
cd v0-lexora-accounting-saa-s/mcp-server
npm install
npm run build
```

Vérifier que `dist/index.js` existe.

### 3. Configurer Claude Desktop

Éditer `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS), `%APPDATA%\Claude\claude_desktop_config.json` (Windows), ou
`~/.config/Claude/claude_desktop_config.json` (Linux) :

```json
{
  "mcpServers": {
    "lexora": {
      "command": "node",
      "args": [
        "/chemin/absolu/v0-lexora-accounting-saa-s/mcp-server/dist/index.js"
      ],
      "env": {
        "LEXORA_API_URL": "https://ton-lexora.vercel.app",
        "LEXORA_INTERNAL_TOKEN": "<le même secret que côté Lexora>",
        "LEXORA_USER_ID": "<ton UUID Supabase auth.users>",
        "LEXORA_USER_EMAIL": "toi@ton-domaine.mu"
      }
    }
  }
}
```

### 4. Redémarrer Claude Desktop

**Quit complet** (Cmd+Q sur Mac, systray Quit sur Windows). Puis relancer.

### 5. Vérifier

Dans une nouvelle conversation Claude Desktop, taper :
> *Liste mes sociétés Lexora.*

Claude doit appeler `list_societes` et te retourner DDS, OCC, etc.

## Variables d'environnement

| Variable | Requis | Description |
|---|---|---|
| `LEXORA_API_URL` | oui | URL de l'instance Lexora |
| `LEXORA_INTERNAL_TOKEN` | oui | Secret partagé avec `INTERNAL_API_TOKEN` côté Lexora |
| `LEXORA_USER_ID` | oui | UUID utilisateur Lexora à usurper (tenant isolation) |
| `LEXORA_USER_EMAIL` | non | Email pour logs/audit côté Lexora |

## Sécurité

- **Le token interne donne accès à TOUTES les données de l'utilisateur usurpé**.
  Ne pas le partager. Le stocker uniquement dans le fichier `claude_desktop_config.json`
  qui est local à ta machine.
- **Tenant isolation** : `LEXORA_USER_ID` détermine quelles sociétés sont
  accessibles. Si tu mets l'UUID d'un autre user, tu vois ses sociétés.
- **Rotation** : change le token Vercel + ton config local en cas de doute.

## Développement

```bash
npm run dev    # tsx en mode watch
npm run build  # tsc → dist/
```
