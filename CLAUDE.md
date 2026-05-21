# CLAUDE.md — Consignes pour les sessions Claude sur ce repo

Ce fichier est lu automatiquement au démarrage de chaque session Claude.
**Respecter strictement les règles ci-dessous avant tout push ou
déploiement.**

## ⚠️ Règle production / déploiement Vercel

`main` est la seule branche promue en production sur Vercel. Toute autre
branche est de la pré-prod uniquement.

**NE JAMAIS** promouvoir manuellement une branche autre que `main` en
production via l'UI Vercel (action « Promote to Production »). Cela
écrase main et peut réintroduire des bugs déjà corrigés sur d'autres
branches actives (cas observé : la boucle de login `team_leader`,
corrigée sur main, a été réintroduite en prod en promouvant une vieille
branche qui ne contenait pas le fix).

Workflow correct :
1. Merger la branche dans `main` (via PR).
2. Laisser Vercel auto-déployer `main` en production.

## 🔄 Avant tout `git push` sur une branche de travail

Plusieurs sessions Claude travaillent en parallèle sur ce repo (RH/paie,
comptable/PCM, banque, etc.). Avant de pousser une branche, **mettre à
jour avec main** pour éviter les régressions silencieuses :

```bash
git fetch origin
git merge origin/main           # ou rebase si la branche n'a pas de commits partagés
# résoudre les conflits éventuels
git push origin <branche>
```

Si la branche est très en retard (> 3 jours ou > 20 commits derrière
main), prévenir l'utilisateur avant le merge — les fichiers peuvent avoir
beaucoup changé.

## 🤝 Coordination multi-sessions

Domaines actifs en parallèle (mai 2026) — éviter de modifier ces zones
sans s'être synchronisé avec main d'abord :

- **RH / paie / planning / congés / trajets-km / exports MRA**
  (`app/rh/**`, `app/api/rh/**`, `app/salarie/**`, `lib/rh/**`,
  `app/redirect/page.tsx`, `lib/supabase/middleware.ts`)
- **Comptable / PCM / rapprochement / migrations SQL**
  (`app/comptable/**`, `app/api/comptable/**`, `app/api/agent/rapprochement/**`,
  `lib/accounting/**`, `supabase/migrations/**`, `lib/ai/bank-statement-extraction.ts`)
- **Telegram / calendar / cron / sidebar / client/societes**
  (`app/api/telegram/**`, `components/layout/**`, `components/client/SocieteActiveProvider.tsx`)

## 🔐 Données / migrations Supabase

Le projet Supabase de prod est `dqepdoimpqhmuhkklxva` (Lexora). Tout
changement de schéma ou de données via `apply_migration` / `execute_sql`
impacte directement la prod — pas de staging. Confirmer avec
l'utilisateur avant tout DDL ou UPDATE/DELETE de masse.

## 📦 Stack rapide

- Next.js (App Router) + TypeScript + Tailwind + Radix UI
- Supabase (auth + Postgres + storage)
- Vercel (déploiements, branche prod = `main`)
- React PDF (`@react-pdf/renderer`) pour les documents RH/comptables
- N8N pour les workflows Telegram

## ✅ Avant de clore une session

- Typecheck : `npx tsc --noEmit` (filtrer les erreurs sur les fichiers modifiés)
- Si modifications côté UI, mentionner explicitement que le test manuel
  navigateur n'a pas été fait (l'environnement n'a pas de navigateur)
- Ne JAMAIS push `main` avec des commits sans avoir fetch + merge
  origin/main au préalable.
