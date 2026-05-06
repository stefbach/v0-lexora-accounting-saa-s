# n8n workflows — Lexora

Workflows n8n versionnés, déployés via l'API n8n.

## Setup

1. Renseigner dans `.env.local` :
   - `N8N_BASE_URL` (ex: `https://n8n.srv808674.hstgr.cloud`)
   - `N8N_API_KEY` (Settings → n8n API)
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. Créer la credential Supabase dans n8n (une seule fois) :
   ```bash
   node scripts/setup-n8n-creds.mjs
   ```
   Cela crée une credential **Header Auth** nommée `Lexora Supabase (service_role)`
   réutilisable par tous les workflows.

3. Déployer les workflows :
   ```bash
   # Lister
   node scripts/sync-n8n.mjs list

   # Pousser un workflow (création ou update si même nom)
   node scripts/sync-n8n.mjs push n8n-workflows/00-test-supabase-connection.json

   # Pousser tous les workflows du dossier
   node scripts/sync-n8n.mjs push-all

   # Activer / désactiver
   node scripts/sync-n8n.mjs activate <id>
   node scripts/sync-n8n.mjs deactivate <id>

   # Exécuter manuellement (workflow avec Manual Trigger)
   node scripts/sync-n8n.mjs run <id>
   ```

## Workflows

| Fichier | Description | Trigger |
|---|---|---|
| `00-test-supabase-connection.json` | Ping : vérifie que n8n peut lire la table `clients` Supabase via service_role | Manuel |
| `01-occ-rapprochement-bancaire.json` | **Agent rapprochement bancaire intelligent pour Obesity Care Clinic Ltd** : audit pré → matching engine (`runIntelligentRapprochement`) → audit post → rapport FR généré par Claude Sonnet 4.6 | Manuel |

### Workflow 01 — Agent rapprochement OCC

Pipeline en 7 étapes :

1. **Paramètres OCC** (Set) — `societe_id`, `min_confidence`, `dry_run`
2. **Audit pré** (HTTP → `POST /api/agent/audit`) — état initial : tx, factures, comptes, PCM
3. **Rapprocher** (HTTP → `POST /api/agent/rapprochement`) — exécute le moteur intelligent (8 stratégies cascadées + classifications auto), persiste les suggestions dans `releves_bancaires.transactions_json`
4. **Audit post** — re-mesure pour comparer
5. **Construire brief** (Code) — agrège les 3 audits en un payload JSON < 8 KB
6. **Claude** (HTTP → `POST /v1/messages`) — génère un rapport markdown FR (résumé exécutif, écarts, actions priorisées)
7. **Sortie finale** (Set) — `report_markdown`, `stats`, `diff`, `writes`

Pour pointer sur une autre société, change uniquement `societe_id` + `societe_nom` dans le node "Paramètres OCC".

---

## Routes Lexora utilisées (sécurisées par bearer)

| Route | Méthode | Body | Effet |
|---|---|---|---|
| `/api/agent/audit` | POST | `{ societe_id, date_debut?, date_fin? }` | **Read-only**. Renvoie comptes, relevés, tx (matched/orphelines), factures (par statut), top 30 comptes PCM. |
| `/api/agent/rapprochement` | POST | `{ societe_id, date_debut?, date_fin?, releve_ids?, dry_run?, min_confidence? }` | Lance `runIntelligentRapprochement` (matching pur). Persiste les matches ≥ confiance dans `transactions_json[i]` avec `statut="suggested"`. **Ne crée pas encore d'écritures BNQ** — le comptable confirme dans le front Lexora. |

Auth : `Authorization: Bearer ${LEXORA_AGENT_SECRET}`. Le secret doit être configuré côté Vercel (env var) **ET** dans `.env.local` côté repo.

## Conventions

- Préfixer le nom du fichier par `NN-` pour ordonner.
- Le `name` du workflow dans le JSON est utilisé comme **clé d'unicité** lors du push : si un workflow du même nom existe déjà sur l'instance, il est mis à jour ; sinon il est créé.
- Référencer la credential Supabase par son **nom** (`Lexora Supabase (service_role)`) — `sync-n8n.mjs` résout l'ID au déploiement.
- Ne JAMAIS hardcoder de clé API ou de service_role dans le JSON d'un workflow. Toujours passer par une credential n8n.
