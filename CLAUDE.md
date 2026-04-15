# CLAUDE.md — LEXORA

Guide pour Claude Code travaillant sur ce dépôt. Lire avant toute modification.

## Contexte produit

LEXORA est un SaaS comptable IA pour entreprises mauriciennes, **MRA compliant**.
- Stack : Next.js 16 (App Router) · React 19 · TypeScript 5.7 · Tailwind v4
- Backend : Supabase Postgres (RLS obligatoire) · Vercel (hébergement + crons)
- IA : Anthropic SDK (`@anthropic-ai/sdk`), modèle par défaut `claude-sonnet-4-6`
- Intégrations : WATI (WhatsApp), Resend (email), ExchangeRate API

Plan de route détaillé : voir `LEXORA_MASTER_PLAN.md` (Sprint 0 = bugs bloquants).

## Architecture des rôles (CRITIQUE)

Trois portails coexistent, chacun avec son propre layout et ses propres routes API :

| Rôle | UI | API | Audience |
|---|---|---|---|
| Admin | `app/admin/` | `app/api/admin/` | Équipe LEXORA |
| Comptable | `app/comptable/` | `app/api/comptable/` | Cabinet comptable |
| Client | `app/client/` | `app/api/client/` | Entreprises clientes |

**Règle absolue** : ne jamais croiser les préfixes. Une route `/api/client/*` ne doit JAMAIS être appelée depuis `app/comptable/` et inversement. Les permissions RLS partent du principe que chaque rôle reste dans son silo.

**Obsolète** : `app/dashboard/` est un prototype v0 à supprimer (S0-10). Ne pas y ajouter de code.

## Conventions non négociables

### Variables d'environnement
- **Clé service role Supabase** : toujours `SUPABASE_SERVICE_ROLE_KEY`. Ne **jamais** réintroduire `SUPABASE_SECRET_KEY` (patterns `SUPABASE_SECRET_KEY || SUPABASE_SERVICE_ROLE_KEY` à nettoyer — S0-2).
- Liste complète dans `.env.local.example`. Toute nouvelle variable doit y apparaître.

### Base de données
- **Écritures comptables** : la table canonique est `ecritures_comptables_v2` (liée à `societe_id`). `ecritures_comptables` (v1, liée à `dossier_id`) est en cours de dépréciation. Pendant la transition, écrire dans les deux (S0-1). Toute nouvelle feature écrit **uniquement** sur v2.
- **RLS obligatoire** sur chaque table. Jamais de `CREATE POLICY ... USING (true)` (S0-7). Toujours filtrer par `destinataire_id`, `cree_par_id`, ou via la jointure `societes.client_id`.
- **Triggers** insérant dans `dossiers` : toujours passer `client_id` (NOT NULL) depuis `societes.client_id` (S0-3).
- Migrations numérotées sous `supabase/migrations/` — ne jamais modifier une migration déjà mergée sur `main`, créer la suivante.

### Middleware / auth
- Routes publiques définies dans `lib/supabase/middleware.ts`. **Ne jamais** ajouter `/dashboard`, `/admin`, `/comptable`, ou `/client` comme route publique (S0-6).

### Prompts IA
- Tous les prompts système sont dans `lib/ai/prompts.ts`. Ne pas inliner de prompts dans les routes API — importer depuis `prompts.ts` (S1-1).
- Pour les documents volumineux (relevés bancaires, grand livre), utiliser `max_tokens: 16384` minimum.
- Le modèle par défaut vient de `process.env.ANTHROPIC_MODEL` (ne pas hardcoder).

### Exports
- Excel/FEC : utiliser `xlsx@0.18.5` (dépendance existante). Voir `skills/xlsx` pour les patterns de formules et formatage MUR.
- PDF factures : `@react-pdf/renderer`. Voir `skills/pdf` pour la génération déterministe.

## Workflow Claude Code

### Skills installés (`.claude/skills/`)
- `xlsx` — génération/lecture Excel (FEC, balances, grand livre)
- `pdf` — formulaires et factures PDF
- `claude-api` — bonnes pratiques Anthropic SDK + prompt caching
- `webapp-testing` — tests E2E Playwright
- `skill-creator` — pour créer des skills LEXORA-spécifiques
- `mcp-builder` — si on expose Supabase en MCP

### Slash-commands (`.claude/commands/`)
- `/fix-issue <SXX-Y>` — corrige une entrée du MASTER_PLAN (ex. `/fix-issue S0-4`)
- `/create-pr` — crée une PR depuis la branche courante

### Hooks
- `.claude/settings.json` lance `eslint --fix` après chaque édition TS/TSX.

## Anti-patterns à refuser

- Hardcoder des chaînes monétaires (`" MUR"`, `" Rs"`) — utiliser les helpers de formatage locale `fr-MU`.
- Ajouter une route API sans vérifier le rôle côté serveur (ne jamais se reposer uniquement sur le middleware).
- Lancer un cron sans garde `CRON_SECRET`.
- Introduire un client Supabase anonyme dans un handler server-side qui fait des writes — utiliser le client service role.
- Créer un fichier d'analyse (`*_ANALYSIS.md`, `EXPLORATION_*.md`, etc.) : ils sont tous dans `.gitignore` pour une raison.

## Commandes utiles

```bash
npm run dev     # dev server (port 3000)
npm run build   # build production
npm run lint    # ESLint (pas de test runner en place — voir skills/webapp-testing pour l'ajouter)
```
