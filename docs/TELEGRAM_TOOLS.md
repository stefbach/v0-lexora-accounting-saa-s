# Telegram Bot Tools — Catalogue complet (67 outils)

Mise à jour : 2026-05-26 — branche `feat/telegram-full-capabilities`

Ce document liste **tous** les outils que le LLM (Claude via n8n) peut appeler
depuis le bot Telegram Lexora. Il y en a deux familles :

1. **47 endpoints natifs** `/api/telegram/internal/<verb>` — un endpoint par
   opération métier, schéma stable, audit log automatique
   (`telegram_actions`).
2. **20 outils MCP** exposés via un endpoint pont `mcp_call` — accès à la
   comptabilité fine (grand livre, écritures, lettrage, etc.) initialement
   réservée à Claude Desktop via le serveur MCP `mcp-lexora`.

Total : **67 outils** opérationnels depuis Telegram.

---

## 1. Endpoints natifs `/api/telegram/internal/*` (47)

Chacun est appelé en POST avec headers HMAC SHA-256 (`X-Lex-Timestamp`,
`X-Lex-Nonce`, `X-Lex-Signature`) ou fallback legacy `X-Internal-Token`.

### Identité / profil
- `me` — Profil + capabilities effectives
- `memory_recall`, `memory_set` — Mémoire conversationnelle

### Sociétés
- `societes_list` — Sociétés accessibles
- `societes_debug` — Diag accès tenant

### KPIs / rapports
- `kpis` — KPIs financiers du mois
- `report_get` — Rapports (pl, balance, tresorerie, top_clients/fournisseurs,
  aging, paye_summary)

### Factures (vente + achat)
- `factures_search` — Filtre factures (type, statut, période, contact)
- `facture_detail` — Détail facture (numéro ou ID)
- `factures_diag` — Diagnostic factures société
- `invoice_create` — Crée facture one-shot depuis prompt naturel
- `send_invoice` — Envoie le PDF d'une facture en PJ Telegram
- `recurring_invoice_list` / `recurring_invoice_create` /
  `recurring_invoice_toggle` — Factures récurrentes

### Contacts
- `contacts_search` — Recherche multi-tables (factures_contacts + profiles + employes)

### Banque
- `bank` — Soldes + relevés synthétisés
- `bank_scrape` — Scrape Internet Banking (Playwright, direction)

### Dépenses
- `expense_create`, `expenses_list` — Notes de frais (avec OCR optionnel)

### RH — Employés & paie
- `employes_list` — Liste employés (scope rôle)
- `payslip_latest` — Dernier bulletin
- `payroll_compute` — Calcule la paie d'une période (RH)
- `payroll_approve` — Verrouille les bulletins (direction)
- `payroll_lock` — Verrouille + auto-compta
- `payroll_bank_file` — Génère + envoie fichiers virement bancaire
- `payroll_mra_export` — Génère fichiers MRA (paye/csg/prgf/vat)
- `payroll_mra_submit` — Soumission auto MRA via robot Playwright
- `ot_add` — Heures supplémentaires (RH)
- `bonus_add` — Prime variable (RH)

### RH — Congés & pointages
- `leave_balance`, `leave_create`, `leave_decide`, `leave_pending`
  — Workflow congés complet
- `pointage_create` — Pointage in/out
- `attendance_list` — Listing pointages

### Recherche universelle
- `db_search` — Recherche multi-tables (factures, contacts, employes,
  documents, transactions, écritures, **ecritures_v2, bulletins_paie,
  comptes_bancaires, releves_bancaires** ajoutés 2026-05-26)

### Email
- `email_accounts_list` — Comptes email configurés
- `email_send` — Envoi email (whitelist contacts)

### Calendrier Google
- `calendar_accounts_list`, `calendar_list_events`, `calendar_create_event`,
  `calendar_update_event`, `calendar_delete_event`, `calendar_find_slot`,
  `calendar_diag` — Workflow agenda conversationnel

### Fiscalité Maurice
- `tax_calendar` — Échéances MRA (VAT, PAYE, CIT, CSG, TDS)

---

## 2. Pont `mcp_call` — 20 outils MCP exposés (NOUVEAU 2026-05-26)

Endpoint unique : `POST /api/telegram/internal/mcp-call`

Body :
```json
{
  "tool": "<nom_du_tool>",
  "params": { "...": "..." }
}
```

- Le `societe_id` est **auto-injecté** depuis le contexte Telegram s'il est
  absent des params (sauf pour `list_societes` et `get_taux_change`).
- L'appel interne se fait via `callLexoraHeaders(ctx.user_id)` → spoof l'auth
  de l'utilisateur Telegram sur le endpoint cible, ce qui propage l'isolation
  tenant (RLS + `assertSocieteAccess`).
- Réponse : `{ status: 'success', result: { tool, endpoint, data } }` ou
  `{ status: 'error', error_msg, result: {...} }` (HTTP 200 toujours pour
  que le LLM voie le payload).

### Tools disponibles

| Tool | Endpoint sous-jacent | Params utiles |
|------|---------------------|---------------|
| `list_societes` | `GET /api/client/societes` | — |
| `get_financial_summary` | `GET /api/client/financial` | `exercice?` |
| `list_factures` | `GET /api/client/factures` | `statut?, date_debut?, date_fin?` |
| `list_factures_clients` | `GET /api/client/factures?type_facture=client` | `statut?, periode?` |
| `list_factures_fournisseurs` | `GET /api/client/factures?type_facture=fournisseur` | `statut?, periode?` |
| `list_devis` | `GET /api/client/factures?type_document=devis` | `periode?` |
| `list_avoirs` | `GET /api/client/factures?type_document=avoir` | `periode?` |
| `list_alertes` | `GET /api/client/alertes` | — |
| `list_releves_bancaires` | `GET /api/client/releves-bancaires` | `periode?` |
| `get_taux_change` | `GET /api/taux-change` (public BOM) | — |
| `list_comptes_bancaires` | `GET /api/client/comptes-bancaires` | — |
| `list_ecritures` | `GET /api/client/ecritures` | `date_debut, date_fin, journal?` |
| `get_grand_livre` | `GET /api/comptable/grand-livre` | `compte_numero, date_debut, date_fin` |
| `get_rapprochement_status` | `GET /api/comptable/rapprochement/kpis` | `periode?` |
| `list_tiers` | `GET /api/client/factures-contacts` | — |
| `list_documents` | `GET /api/client/documents` | `type?` |
| `list_employes` | `GET /api/rh/employes` | — |
| `list_bulletins_paie` | `GET /api/rh/paie` | `periode?` |
| `get_plan_comptable` | `GET /api/client/plan-comptable` | — |
| `list_lettrage_non_lettrees` | `GET /api/comptable/lettrage` | `compte?` |

### Discovery

`GET /api/telegram/internal/mcp-call` (signé HMAC) retourne la liste des
tools, la signature attendue, et l'usage — pratique pour le dev / debug n8n.

---

## 3. Workflow n8n attendu

Côté n8n, deux configurations possibles pour exposer `mcp_call` à l'AI Agent :

### Option A — Un tool générique `mcp_call`

Créer un seul `toolHttpRequest` paramétrique :

- Méthode : `POST`
- URL : `https://lexora.finance/api/telegram/internal/mcp-call`
- Headers : HMAC (timestamp/nonce/signature) — déjà géré par la fonction
  d'aide n8n existante
- Body :
  ```json
  {
    "chat_id": "{{ $json.body.chat_id }}",
    "tool": "{{ $fromAI('tool') }}",
    "params": {{ $fromAI('params', '{}', 'json') }}
  }
  ```
- Description AI : copier la section "Tools mcp_call disponibles" du system
  prompt (déjà injecté dans la KB).

Avantage : un seul nœud n8n, scalable. Inconvénient : le LLM doit deviner le
schéma de `params` pour chaque tool.

### Option B — 20 tools individuels (recommandé pour fiabilité)

Créer 20 `toolHttpRequest` nommés `mcp_list_factures_fournisseurs`,
`mcp_get_grand_livre`, etc. — chacun pointant vers le même endpoint
`mcp-call`, avec le `tool` figé dans le body et les `params` exposés via
`$fromAI` typés.

Avantage : auto-complétion type-safe côté Claude. Inconvénient : 20 nœuds à
maintenir.

**Recommandé** : Option B pour les tools critiques (grand_livre, ecritures,
lettrage, plan_comptable) + Option A pour le reste.

---

## 4. Sécurité & isolation tenant

- Tous les endpoints `mcp_call` re-vérifient `societe_id` via
  `assertSocieteAccess(user_id, societe_id)` ou les helpers RLS
  `user_has_societe_access` (SEC-003).
- L'identité spoofée par `callLexoraHeaders` est celle du `ctx.user_id`
  résolu par `withTelegramAuth` depuis le `chat_id` Telegram — un utilisateur
  ne peut PAS lire les données d'une société à laquelle il n'a pas accès,
  même via mcp_call.
- Audit : chaque appel est loggé dans `telegram_actions` avec
  `intent='mcp.call'`, `payload={tool, params}`, `result`, `duration_ms`.
- HMAC anti-replay : nonce inséré dans `telegram_hmac_nonces` (SEC-005).

---

## 5. Évolutions futures

- Ajouter `mcp_write` pour les tools MCP de mutation (create_facture,
  create_ecriture) — pour l'instant `mcp_call` est read-only.
- Étendre db_search aux tables `immobilisations`, `leases`, `tva_declarations`
  une fois les RLS validées.
