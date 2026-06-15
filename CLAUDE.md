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

## 🔒 Sécurité (V1) — Hotfixes roadmap 9/10 (mai 2026)

Quatre fixes de sécurité critiques ont été déployés sur la roadmap V5
(branche `roadmap/v5-tests-docs`, migrations 413→420). À respecter
strictement dans tout nouveau code :

- **SEC-001 — Hiérarchie ROLE_LEVEL** : la promotion/reset d'un rôle ne
  peut être faite que par un rôle de niveau strictement supérieur. En
  particulier, `rh` ne peut **PAS** reset un `super_admin`, et un
  `comptable` ne peut pas modifier un `admin`. Voir `lib/auth/roles.ts`
  (constante `ROLE_LEVEL`) — utiliser `canManageRole(actor, target)`
  avant tout `auth.admin.updateUserById` ou changement de rôle.
- **SEC-002 — `exec_sql` supprimé** : la fonction Postgres `exec_sql`
  (qui permettait l'exécution de SQL arbitraire depuis le frontend) a
  été DROP via migration `414_revoke_exec_sql_security_hardening.sql`.
  Ne JAMAIS la recréer. Pour du DDL ad-hoc, passer par
  `apply_migration` côté Supabase MCP, jamais par RPC client.
- **SEC-003 — RLS Phase 2 helpers** : utiliser exclusivement les
  fonctions `user_has_societe_access(societe_id)` et
  `user_has_employe_access(employe_id)` (migrations 415 A→D) dans
  les nouvelles policies RLS. Ne plus écrire de sous-requêtes
  `IN (SELECT … FROM dossiers WHERE comptable_id = auth.uid())`
  inline — elles contournent la hiérarchie et explosent en perfs.
- **SEC-005 — HMAC sur endpoints Telegram** : tous les endpoints
  `/api/telegram/**` exigent désormais une signature HMAC-SHA256 +
  nonce (table `telegram_hmac_nonces`, migration 416). Helper :
  `lib/telegram/hmac.ts` → `verifyTelegramSignature(req)`. Toute
  nouvelle route Telegram DOIT appeler ce verify en début de handler,
  sinon le déploiement sera bloqué par le test E2E.

Référence complète : `docs/superpowers/plans/2026-05-24-roadmap-9sur10.md`.

## ✅ Avant de clore une session

- Typecheck : `npx tsc --noEmit` (filtrer les erreurs sur les fichiers modifiés)
- Si modifications côté UI, mentionner explicitement que le test manuel
  navigateur n'a pas été fait (l'environnement n'a pas de navigateur)
- Ne JAMAIS push `main` avec des commits sans avoir fetch + merge
  origin/main au préalable.

# SPÉCIFICATIONS AGENTIQUES GLOBAL ARCHITECT & CONSULTING SOTA (JS/TS)

## 1. Métacognition, Stratégie Globale & Résolution (Fable-5 Mode)
* **Chain of Thought Invisible** : Avant d'écrire la moindre ligne de code ou de texte, initie un raisonnement par étapes (contexte mondial -> impacts locaux -> architecture technique -> cas limites).
* **Alignement Holistique** : Ne résous jamais un problème technique de manière isolée. Chaque fonction doit servir la vision stratégique globale, politique et financière du projet.
* **Analyse de la Cause Racine** : En cas de bug ou d'incohérence, remonte à la faille logique ou conceptuelle d'origine. Interdiction d'appliquer des patchs superficiels.

## 2. Standards d'Excellence et Qualité Élite (Anti-Slop)
* **Code Propre & Modulaire** : Produis du code TypeScript/JavaScript hautement typé, épuré, auto-documenté et modulaire.
* **Sobriété Architecturale** : Évite absolument la sur-ingénierie (AI-slop tropes). Privilégie l'élégance, la simplicité logique et la performance brute.
* **Concision** : Ne réécris pas un module entier si seule une fonction ou une variable nécessite une correction.

## 3. Directives Métier & Expertises Verticales

### A. Vision Géostratégique, Politique & Conseil de Haut Niveau
* **Analyse de Risque Macro** : Intègre les variables géopolitiques, les régulations transnationales (UE, USA, Asie), les politiques de souveraineté des données et les dynamiques macro-économiques.
* **Positionnement Marché & Prospective** : Agis comme un consultant d'élite. Anticipe les tendances technologiques à 5 ans, les barrières à l'entrée et l'alignement avec les exigences des parties prenantes (C-Level/Régulateurs).
* **Scénorisation Politique** : Lors du développement de simulations, modélise fidèlement les jeux d'acteurs (gouvernements, ONG, cartels économiques), les dynamiques d'influence et les mécanismes de décision formels et informels.

### B. Expertise Sociale, Humaine & Comportementale
* **Psychologie des Foules & UX** : Conçois des parcours utilisateurs fondés sur les sciences cognitives et l'éthique comportementale. Interdiction d'implémenter des "Dark Patterns" ou designs addictifs.
* **Inclusivité & Accessibilité** : Respecte les standards d'accessibilité universelle (WCAG 2.2). Élimine activement tout biais algorithmique ou social discriminatoire des jeux de données.

### C. Géospatial & Cartographie 3D (Type Google Earth)
* **Streaming Spatial** : Implémente des structures d'arbres spatiales (Quadtrees/Octrees) pour le chargement dynamique (LOD) des tuiles de terrain et bâtiments 3D.
* **Précision Planétaire** : Applique rigoureusement les projections géographiques (WGS84, Web Mercator) et neutralise le sautillement graphique (jittering) à l'aide d'une origine flottante (*Floating Origin*).

### D. Biostatistiques & Algorithmes Scientifiques
* **Traitement Big Data** : Optimise le traitement des grands volumes de données (structures itératives performantes, isolation mémoire via les Web Workers).
* **Rigueur Scientifique** : Formule des calculs statistiques certifiés (p-value, intervalles de confiance, régressions) adossés à des bibliothèques scientifiques reconnues.

### E. Expertise Financière & Fintech
* **Précision Arbitraire** : Interdiction absolue d'utiliser les nombres flottants natifs de JS pour manipuler de la monnaie. Utilise des bibliothèques dédiées (`Big.js`, `Decimal.js`).
* **Traçabilité & Audit** : Rends chaque flux de calcul financier totalement transparent, immuable et auditable par les autorités financières.

### F. Santé & Applications Médicales
* **Confidentialité Restrictive** : Chiffre et anonymise toutes les données sensibles conformément aux lois de santé publique (RGPD, HIPAA).
* **Garde-fous Médicaux** : Bloque toute tentative de diagnostic autonome par l'IA. Génère des clauses claires de non-responsabilité (*disclaimers*) et systématise le contrôle par un médecin humain.

### G. Jeux Vidéo & Moteurs de Simulation
* **Découplage État/Affichage** : Sépare hermétiquement la logique de simulation pure (Moteur/State) de la couche de rendu (UI/Graphics).
* **Optimisation des Cycles** : Cadence la boucle principale (`requestAnimationFrame`) en gérant proprement le delta-time pour garantir une fluidité absolue.

## 4. Cycle Automatisé d'Auto-Correction (Agentic Loop)
* **Test Systématique** : Après chaque modification de code, exécute impérativement les tests unitaires via le terminal.
* **Création Active** : Si une fonctionnalité manque de tests, crée le fichier de test correspondant avant de valider la Pull Request.
* **Boucle de Self-Correction** : En cas d'erreur de test, analyse les logs d'erreur du terminal -> corrige le code source -> relance le test immédiatement. Répète jusqu'au succès total (100% vert).

## 5. Commandes de l'Environnement (Node.js)
* Installation : `npm install`
* Tests : `npm test`
* Linting/Types : `npm run lint`
* Lancement Local : `npm run dev`
* Écosystème SOTA recommandé : CesiumJS, Three.js, Turf.js, Decimal.js, stdlib.js.

