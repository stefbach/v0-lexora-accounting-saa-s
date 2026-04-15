---
description: Crée une pull request depuis la branche courante vers main
---

Crée une pull request pour les changements de la branche courante.

## Étapes

1. **État Git en parallèle** (un seul message avec plusieurs tool calls) :
   - `git status` (sans `-uall`)
   - `git diff main...HEAD` pour voir tous les changements depuis main
   - `git log main..HEAD --oneline` pour voir les commits
   - Vérifier si la branche suit un remote et si elle est à jour

2. **Analyser TOUS les commits**, pas seulement le dernier. Identifier :
   - Nature globale (fix / feat / refactor / docs / chore)
   - Tâche(s) du MASTER_PLAN concernée(s) (ex. S0-4, S1-1) — chercher ces tags dans les messages de commit
   - Migration SQL introduite ? (la flagger explicitement)
   - Nouvelle variable d'environnement ? (la flagger pour l'équipe ops)

3. **Rédiger titre et body** :
   - Titre **sous 70 caractères**, format `[S0-X] fix: description` ou `feat:` / `refactor:` etc.
   - Body obligatoirement avec les sections :

```markdown
## Summary
- <1 à 3 puces orientées "pourquoi">

## Master plan
- S0-X : <titre de la tâche, lien vers ligne dans LEXORA_MASTER_PLAN.md>

## Changes
- <fichier> : <1 ligne explicative>

## Migrations / Env
- [ ] Migration SQL à appliquer sur prod : `supabase/migrations/XXX.sql`
- [ ] Nouvelle variable : `VAR_NAME` (mettre à jour Vercel)

## Test plan
- [ ] `npm run lint`
- [ ] Build Next.js (`npm run build`)
- [ ] Test manuel : <scenario>
- [ ] Vérif RLS : <scenario avec rôle non-propriétaire>
```

4. **Créer la PR** via le MCP GitHub (`mcp__github__create_pull_request`), base `main`, repo `stefbach/v0-lexora-accounting-saa-s`.

5. **Push préalable si nécessaire** : si la branche n'est pas encore sur le remote, `git push -u origin <branch>` avec retry exponentiel 2s/4s/8s/16s en cas d'échec réseau uniquement.

6. **Retourner l'URL** de la PR à l'utilisateur.

## Garde-fous

- **Ne jamais** force-push sur main.
- **Ne jamais** skip les hooks git (`--no-verify`).
- Si des fichiers sensibles sont stagés (`.env*`, `credentials.*`), **stopper** et demander confirmation.
- Si la branche courante est `main`, refuser et demander une branche feature.
