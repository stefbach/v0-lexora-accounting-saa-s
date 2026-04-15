---
description: Corrige une entrée du LEXORA_MASTER_PLAN.md (ex. /fix-issue S0-4)
argument-hint: <SPRINT-NUMERO> (ex. S0-4, S1-1)
---

L'utilisateur te donne l'identifiant d'une tâche du master plan : **$ARGUMENTS**.

## Ta mission

1. **Lire** `LEXORA_MASTER_PLAN.md` et localiser l'entrée `$ARGUMENTS`. Extraire :
   - Le problème décrit
   - La section **Fix** (liste des changements attendus)
   - Les fichiers mentionnés

2. **Lire chaque fichier mentionné** avant de proposer le moindre changement. Si la tâche implique une migration SQL, lire aussi la dernière migration existante sous `supabase/migrations/` pour respecter la numérotation.

3. **Respecter les garde-fous** de `CLAUDE.md` :
   - Pas de `USING (true)` sur les policies RLS
   - Toujours `SUPABASE_SERVICE_ROLE_KEY` (jamais `SUPABASE_SECRET_KEY`)
   - Écrire sur `ecritures_comptables_v2` (+ v1 en transition)
   - Jamais croiser les préfixes `admin/comptable/client`
   - Prompts IA importés depuis `lib/ai/prompts.ts`, pas inlinés

4. **Implémenter** les changements en suivant littéralement la section Fix. Ne pas étendre le scope :
   - Pas de refactor "tant qu'on y est"
   - Pas d'ajout de commentaires/types sur du code non modifié
   - Pas de nouveaux helpers pour une opération unique

5. **Vérifier** :
   - `npm run lint` passe sur les fichiers touchés
   - Les RLS sont testables (décrire comment dans le commit si c'est une migration)
   - La variable d'environnement nécessaire est dans `.env.local.example`

6. **Rapporter** :
   - Liste des fichiers modifiés avec `path:line` pour les changements clés
   - Ce qui reste à faire manuellement (ex. appliquer la migration sur Supabase prod)
   - Les risques résiduels (ex. backfill nécessaire sur données existantes)

**Ne commit PAS automatiquement.** L'utilisateur reviewera et invoquera `/create-pr` ensuite.
