# Lexora MCP Server

Serveur **Model Context Protocol** qui expose ton instance Lexora à Claude
(Desktop ou autre client MCP) et à n8n / scripts ops.

## Outils disponibles (v0.5.0 — 20 outils)

### Base (v0.4.0)

| Outil | Description | Endpoint Lexora |
|---|---|---|
| `list_societes` | Liste les sociétés du user | `GET /api/client/societes` |
| `get_financial_summary` | Dashboard + P&L d'une société sur une période | `GET /api/client/financial` |
| `list_factures` | Liste factures (filtre type optionnel) | `GET /api/client/factures` |
| `list_alertes` | Alertes conformité + financières actives | `GET /api/client/alertes` |
| `list_releves_bancaires` | Relevés bancaires + transactions | `GET /api/client/releves-bancaires` |
| `get_taux_change` | Taux MUR (BOM officiels + fallback) | `GET /api/taux-change` |

### Comptabilité (v0.5.0)

| Outil | Description | Endpoint Lexora |
|---|---|---|
| `list_comptes_bancaires` | Comptes bancaires d'une société (IBAN, devise, solde) | `GET /api/client/comptes-bancaires` |
| `list_factures_clients` | Factures clients (ventes) | `GET /api/client/factures?type_facture=client` |
| `list_factures_fournisseurs` | Factures fournisseurs (achats) | `GET /api/client/factures?type_facture=fournisseur` |
| `list_devis` | Devis (quotations) | `GET /api/client/factures?type_document=devis` |
| `list_avoirs` | Avoirs (notes de crédit) | `GET /api/client/factures?type_document=avoir` |
| `list_ecritures` | Écritures comptables V2 avec filtres période/journal/compte | `GET /api/client/ecritures` |
| `get_grand_livre` | Grand livre avec soldes progressifs + ouvertures | `GET /api/comptable/grand-livre` |
| `get_rapprochement_status` | KPIs rapprochement bancaire (taux auto, transit, alertes) | `GET /api/comptable/rapprochement/kpis` |
| `list_tiers` | Annuaire des contacts/tiers (clients + fournisseurs) | `GET /api/client/factures-contacts` |
| `list_documents` | Documents PDF stockés (factures, justificatifs) | `GET /api/client/documents` |
| `get_plan_comptable` | Plan comptable mauricien (PCM) | `GET /api/client/plan-comptable` |
| `list_lettrage_non_lettrees` | Écritures non lettrées (clients/fournisseurs à apurer) | `GET /api/comptable/lettrage` |

### RH / Paie (v0.5.0)

| Outil | Description | Endpoint Lexora |
|---|---|---|
| `list_employes` | Employés d'une société (actifs / sortis / tous) | `GET /api/rh/employes` |
| `list_bulletins_paie` | Bulletins de paie pour une période (NSF/CSG/PAYE) | `GET /api/rh/paie` |

Tous les outils sont **read-only** dans cette version. L'écriture (création
de factures, écritures, paie) reste pilotée par l'UI Lexora avec workflow
d'approbation humain.

## Architecture

```
Claude Desktop  ──stdio──▶  mcp-server (Node, ce package)
                                │
                                │  HTTP avec header :
                                │    X-Lexora-Api-Key: lex_...
                                ▼
                         Lexora API (Next.js sur Vercel)
                                │
                                └─▶ Supabase (PostgreSQL)
```

La clé personnelle est résolue côté Lexora par `lib/supabase/auth-resolver.ts`
(via `lib/supabase/api-keys.ts`) : elle identifie l'utilisateur et ses droits.

## Installation

Le plus simple : `curl -fsSL https://<ton-instance>/install-mcp.sh | bash`
(2 champs : URL de l'instance, puis clé API). Installation manuelle :

### 1. Générer une clé API

Dans Lexora → Direction → Connecter à Claude Desktop. La clé commence par
`lex_`.

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
        "LEXORA_API_KEY": "lex_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

⚠️ Ne pas inverser les deux valeurs : `LEXORA_API_URL` est une adresse
`https://...`, `LEXORA_API_KEY` est la clé `lex_...`. Le serveur refuse de
démarrer si la config est incohérente et affiche la correction à faire dans
les logs MCP de Claude Desktop.

### 4. Redémarrer Claude Desktop

**Quit complet** (Cmd+Q sur Mac, systray Quit sur Windows). Puis relancer.

### 5. Vérifier

Dans une nouvelle conversation Claude Desktop, taper :
> *Liste mes sociétés Lexora.*

Claude doit appeler `list_societes` et te retourner DDS, OCC, etc.

## Variables d'environnement

| Variable | Requis | Description |
|---|---|---|
| `LEXORA_API_URL` | oui | URL http(s) de l'instance Lexora (ex: `https://lexora.vercel.app`) |
| `LEXORA_API_KEY` | oui | Clé personnelle générée dans Lexora (format `lex_...`) |

## Sécurité

- **La clé API donne accès à toutes les données de ton compte Lexora**.
  Ne pas la partager. La stocker uniquement dans le fichier
  `claude_desktop_config.json`, qui est local à ta machine.
- **Rotation** : révoque la clé dans Lexora et génère-en une nouvelle en cas
  de doute.

## Développement

```bash
npm run dev    # tsx en mode watch
npm run build  # tsc → dist/
```
