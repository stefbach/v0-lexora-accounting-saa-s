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
# CONFIGURATION REPO & DIRECTIVES AGENTIQUES CRITIQUES (JS/TS MULTI-DOMAINS)

## 1. Raisonnement et Résolution de Problèmes
* Avant de modifier ou d'écrire du code, lance une réflexion invisible étape par étape (Chain of Thought).
* Identifie explicitement les dépendances, les cas limites (edge cases) et les impacts architecturaux globaux.
* Ne suppose jamais qu'une fonction externe ou une API marche sans vérifier sa signature ou son implémentation.
* Si une erreur survient, analyse la cause racine avant de proposer un correctif ; évite les patchs temporaires.

## 2. Standards de Code et Qualité (Anti-Slop)
* Produis un code modulaire, typé (TypeScript privilégié), propre et documenté selon les standards de l'industrie.
* Évite la sur-ingénierie : ne crée pas d'abstractions complexes si une solution simple existe.
* Reste concis : ne réécris pas un fichier entier si seule une fonction a besoin d'être modifiée.
* Assure-toi que chaque nouvelle fonctionnalité intègre une gestion des erreurs robuste (try/catch explicites).

## 3. Directives Métier Spécifiques

### A. Santé & Applications Médicales
* **Sécurité & Confidentialité** : Assure une traçabilité totale des flux de données et le strict respect du secret médical (normes type RGPD / HIPAA). Anonymise obligatoirement les données de santé.
* **Garde-fous Cliniques** : Ne permets jamais à l'application de poser un diagnostic définitif autonome. Formule systématiquement des clauses de non-responsabilité (disclaimers) et prévois une validation par un professionnel humain.

### B. Expertise Financière & Fintech
* **Précision Absolue** : Interdiction d'utiliser les nombres flottants natifs de JS pour les transactions. Utilise obligatoirement des bibliothèques de calcul à précision arbitraire (ex: `Big.js`, `Decimal.js`) pour éviter les erreurs d'arrondi boursières.
* **Conformité & Audit** : Tout calcul de taux, d'intérêt, de score de risque ou de flux monétaire doit être modulaire, explicite et auditable pour répondre aux exigences des régulateurs.

### C. Jeux Vidéo & Moteurs de Jeu
* **Séparation des Préoccupations** : Maintiens une étanchéité stricte entre la logique des données du jeu (State/Core) et la logique d'affichage ou d'interface (UI/Render).
* **Game Loop & Cycles** : Optimise la boucle de jeu (`requestAnimationFrame`). Prévois une gestion propre de l'état du jeu (pause, sauvegarde, gestion du delta-time pour la fluidité).

### D. Géospatial & Cartographie 3D (Type Google Earth)
* **Systèmes de Coordonnées** : Gère rigoureusement les projections géographiques (WGS84, Web Mercator EPSG:3857, coordonnées cartésiennes ECEF). Assure des conversions sans perte.
* **Streaming & Performance** : Implémente des structures d'arbres spatiales (Quadtrees / Octrees) pour le chargement dynamique des tuiles de terrain et des bâtiments 3D (LOD).
* **Anti-Jittering** : Utilise des techniques de "Floating Origin" ou double précision simulée en shader (WebGL/WebGPU) pour éviter les tremblements graphiques lors des zooms profonds.

### E. Biostatistiques & Algorithmes Lourds
* **Big Data** : Optimise le traitement des grands volumes de données cliniques ou démographiques (structures itératives performantes et parallélisation via les Web Workers).
* **Rigueur Scientifique** : Intègre des calculs statistiques certifiés (p-value, intervalles de confiance, régressions) en t'appuyant sur des bibliothèques scientifiques robustes.

## 4. Cycle de Test Automatisé et Validation (Self-Correction)
* Après chaque modification de code, exécute impérativement les tests unitaires via le terminal.
* Si aucun test n'existe pour la nouvelle fonctionnalité, crée le fichier de test correspondant avant de valider.
* En cas d'échec d'un test, applique la méthode "Analyse-Correction-Vérification" (Analyse des logs -> Correction -> Relance immédiate).
* Ne considère une tâche comme "Terminée" que lorsque 100% des tests du module passent avec succès.

## 5. Commandes et Écosystème du Projet
* Commande pour installer les dépendances : `npm install`
* Commande pour lancer les tests : `npm test`
* Commande pour vérifier les types / linting : `npm run lint`
* Commande pour lancer le projet en local : `npm run dev`
* **Technologies recommandées par domaine** : CesiumJS / Three.js (3D & Géo), Turf.js / simple-statistics (Stats), Big.js (Finance).
