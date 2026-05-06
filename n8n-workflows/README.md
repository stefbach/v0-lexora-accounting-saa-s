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
| `00-test-supabase-connection.json` | Vérifie que n8n peut lire la table `clients` Supabase | Manuel |

## Conventions

- Préfixer le nom du fichier par `NN-` pour ordonner.
- Le `name` du workflow dans le JSON est utilisé comme **clé d'unicité** lors du push : si un workflow du même nom existe déjà sur l'instance, il est mis à jour ; sinon il est créé.
- Référencer la credential Supabase par son **nom** (`Lexora Supabase (service_role)`) — `sync-n8n.mjs` résout l'ID au déploiement.
- Ne JAMAIS hardcoder de clé API ou de service_role dans le JSON d'un workflow. Toujours passer par une credential n8n.
