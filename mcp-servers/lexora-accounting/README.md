# Lexora Accounting — MCP Server

Serveur Model Context Protocol exposant les opérations comptables Lexora
comme outils typés pour Claude (Claude Desktop, Claude Code, agents internes).

L'objectif : remplacer le SQL brut généré par les agents Claude par des
outils typés (Zod), auditables et invariants-checked côté serveur (équilibre
débit/crédit, anti-doublon, RLS Supabase).

## Outils exposés

| Outil | Description |
|---|---|
| `get_grand_livre` | Lecture écritures V2 avec filtres date/compte (read-only) |
| `compute_ifrs9_ecl` | ECL IFRS 9 avec Stages 1/2/3 + macro forward-looking |
| `lettrer_ecritures` | Lettrage groupé avec contrôle équilibre Σdébit=Σcrédit |
| `list_unpaid_invoices` | Aging des factures non payées (client/fournisseur) |
| `compute_balance` | Balance comptable agrégée avec contrôle équilibre |

## Installation

```bash
cd mcp-servers/lexora-accounting
npm install
npm run build
```

## Configuration Claude Desktop

Ajouter à `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) ou équivalent :

```json
{
  "mcpServers": {
    "lexora-accounting": {
      "command": "node",
      "args": ["/absolute/path/to/v0-lexora-accounting-saa-s/mcp-servers/lexora-accounting/dist/index.js"],
      "env": {
        "SUPABASE_URL": "https://YOUR_PROJECT.supabase.co",
        "SUPABASE_SERVICE_KEY": "eyJh..."
      }
    }
  }
}
```

## Sécurité

- Le serveur utilise la **service key** Supabase : il bypasse la RLS.
  À déployer uniquement dans un environnement contrôlé (poste admin, agent
  serveur autorisé). Pour un usage end-user, basculer sur `SUPABASE_ANON_KEY`
  + JWT du caller.
- Toutes les opérations d'écriture (`lettrer_ecritures`) vérifient :
  - Toutes les écritures appartiennent à la même société
  - Σdébit = Σcrédit (tolérance 0.01 MUR)
  - Aucune écriture déjà lettrée
- Les opérations de lecture sont scopées par `societe_id` (jamais d'agrégat
  multi-tenant).

## Roadmap

- [ ] `creer_ecriture` — création BNQ contrôlée (delegate à `createEcrituresForPayment`)
- [ ] `generer_declaration_mra` — bordereau PAYE/NSF/CSG
- [ ] `auto_rapprocher` — exposé R1-R7 de l'agent déterministe
- [ ] Tests Vitest sur les handlers
- [ ] Mode end-user avec JWT (au lieu de service key)

## Référence

Voir aussi les skills `.claude/skills/lexora-*/SKILL.md` qui documentent les
règles métier que ces outils respectent.
