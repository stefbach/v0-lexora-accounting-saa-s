# Robot bancaire agentique auto-réparant — conception

> **Statut : conception, pré-développement.** Ce document décrit l'architecture
> cible. Aucun code n'est développé tant que l'approche et les points de
> conformité (§7) ne sont pas validés. Chantier distinct du reste (retour
> client PR #483).

## 0. Problème à résoudre

Le connecteur bancaire actuel (`lib/banks/scraper.ts`, `lib/banks/adapters/mcb.ts`,
migration `274_bank_scraper.sql`) fonctionne mais souffre de deux limites
structurelles :

1. **Fragilité / « pas à pas »** : l'adaptateur MCB est un script Playwright à
   sélecteurs CSS codés en dur, avec des contournements spécifiques au routeur
   Angular de MCB (clic par coordonnées de souris en dernier recours). Toute
   déviation — page OTP, captcha, changement d'UI de la banque — fait tomber le
   robot en `manual_needed` : il envoie un screenshot par Telegram et **attend
   une intervention humaine**. Le flow OTP est un `TODO v2`.
2. **Non scalable** : chaque banque exige un adaptateur écrit et maintenu à la
   main (« Banques actives : MCB. Pour les autres, upload manuel »). Ajouter la
   SBM, la MauBank, etc. = autant de scripts à écrire et à re-maintenir à chaque
   refonte d'interface bancaire.

**Objectif** : une récupération **intelligente et autonome**, qui se répare
seule quand l'UI change et devient activable sur une nouvelle banque **sans
développement dédié**.

## 1. Principe directeur : recette d'abord, IA en secours

Le cœur de l'architecture est une bascule à deux vitesses :

```
run de récupération
   │
   ├─▶ une RECETTE existe et est valide ?  ──oui──▶ REJEU DÉTERMINISTE
   │        (séquence d'actions apprise)            (rapide, coût ~0, pas d'IA)
   │                                                     │
   │                                              étape casse ?
   │                                                     │ oui
   └─────────────────── non ────────────────────▶ NAVIGATION AGENTIQUE (IA)
                                                   observe → décide → agit
                                                         │
                                                   objectif atteint ?
                                                         │ oui
                                                   enregistre / met à jour
                                                   la RECETTE (versionnée)
```

- **Cas nominal** (UI stable) : la recette est rejouée sans appel IA — rapide et
  économe, comportement déterministe et auditable.
- **UI changée / nouvelle banque** : la navigation agentique (Claude vision)
  retrouve le chemin vers l'objectif et **réécrit la recette**. L'intervention
  humaine n'est plus le mode de récupération par défaut, mais l'exception.

C'est ce qui rend le système à la fois **auto-réparant** (l'IA répare la recette
cassée) et **scalable** (une banque sans recette démarre directement en mode
agentique au lieu de `manual_needed`).

## 2. Composants

### 2.1 `lib/banks/agentic/navigator.ts` — navigation guidée par objectif

Boucle **observation → décision → action** :

1. **Observation** : screenshot de la page + arbre d'accessibilité / DOM
   simplifié (rôles, libellés, champs — pas le HTML brut, trop volumineux et
   bruité).
2. **Décision** : un appel Claude (modèle vision, via le client Anthropic déjà
   utilisé dans `lib/documents/process-document.ts` — même pattern, pas de
   nouvelle dépendance) reçoit l'**objectif** (« atteindre les transactions du
   compte X et récupérer le relevé de la période P ») + l'observation, et
   retourne **une action structurée** :
   `{ type: 'click' | 'fill' | 'press' | 'scroll' | 'done' | 'need_otp' | 'abort',
      target, value?, raison }`.
3. **Action** : exécutée par Playwright, puis re-observation.

**Bornes dures** (anti-emballement, anti-coût) : nombre max d'étapes par run,
timeout global, budget de tokens/coût par run. Dépassement → `abort` propre +
alerte.

### 2.2 `lib/banks/agentic/guardrails.ts` — sécurité non négociable

Code **déterministe** (jamais l'IA ne s'auto-autorise) qui filtre chaque action
avant exécution :

- **Liste blanche lecture seule** : seules les actions de consultation
  (navigation vers comptes/relevés/historique, recherche, export de relevé)
  sont permises.
- **Liste noire absolue** : toute URL ou tout libellé cliqué contenant
  virement / transfer / payment / beneficiary / bénéficiaire / carte / card /
  standing order / paramètres de sécurité → **abort immédiat + alerte**. Double
  filtre : motif d'URL **et** texte de l'élément visé.
- **Saisie restreinte** : `fill` autorisé uniquement dans les champs
  login / OTP / recherche de compte. Jamais dans un champ montant ou
  bénéficiaire.
- **Journal d'audit** de **chaque** action (table dédiée, §3) : horodatage,
  objectif, observation résumée, décision brute du modèle, action exécutée,
  résultat, screenshot. Traçabilité complète pour audit a posteriori.

Ces garde-fous s'appliquent **aussi bien au rejeu de recette qu'au mode
agentique**.

### 2.3 `lib/banks/agentic/recipes.ts` — apprentissage et auto-réparation

- Un parcours agentique réussi est **sérialisé en recette** : séquence d'actions
  robustes (sélecteurs stables préférés aux coordonnées, avec sélecteurs de
  repli), objectif couvert, banque, version.
- Les runs suivants **rejouent** la recette sans IA.
- Si une étape casse (sélecteur introuvable, page inattendue), bascule
  automatique en mode agentique qui **répare** et enregistre une **nouvelle
  version** de la recette (l'ancienne est conservée pour rollback / diagnostic).
- Recettes **versionnées** et rattachées à `(banque, objectif)`.

### 2.4 Flow OTP autonome

L'OTP bancaire ne peut pas — et ne doit pas — être contourné : c'est la sécurité
de la banque. Il devient un **échange asynchrone**, pas un blocage :

1. Le navigateur détecte la page OTP → statut `awaiting_otp`, la session
   Playwright est **suspendue** (page maintenue vivante côté serveur ou état
   sérialisé).
2. Une demande est envoyée au client via le **canal Telegram existant**
   (« Saisis le code reçu par SMS de ta banque »).
3. Le code renvoyé arrive sur un endpoint `/api/telegram/**` — **obligatoirement
   protégé par `verifyTelegramSignature` / `verifyHmac` (SEC-005)** — qui
   **reprend** la session en attente et poursuit la navigation.
4. **Persistance de session** (`storageState` Playwright) chiffrée avec le
   pattern AES-256-GCM existant (`lib/crypto/symmetric.ts`) pour réduire la
   fréquence des OTP ; expiration propre et révocable.

Machine à états : `idle → running → (awaiting_otp ⇄ running) → done | aborted | failed`.

## 3. Modèle de données (migration ≥ 494)

> Numéros 481–493 réservés au chantier modules stock/POS. Le robot démarre à 494.

- **`bank_scrape_recipes`** : `(id, banque, objectif, version, actions JSONB,
  actif, created_at)`, unicité sur `(banque, objectif, version)`, versions
  antérieures conservées.
- **`bank_scrape_action_log`** : journal d'audit — `(id, run_id, societe_id,
  step_index, mode 'recipe'|'agentic', observation_resumee, decision_modele
  JSONB, action JSONB, resultat, screenshot_url, created_at)`.
- **`bank_scrape_sessions`** : état de session/OTP — `(id, societe_id,
  compte_bancaire_id, statut, storage_state_enc, otp_demande_at,
  expire_at, ...)`.

**RLS stricte SEC-003** sur les trois tables : `user_has_societe_access(societe_id)`,
jamais de policy `auth.uid() IS NOT NULL`, écriture réservée au `service_role`
(le robot tourne côté serveur). Le journal d'audit n'est jamais modifiable.

## 4. Intégration avec l'existant

- `scraper.ts` route désormais : **recette → agentique en secours**, au lieu de
  `adapter → manual_needed`.
- L'adaptateur MCB actuel devient la **recette initiale de référence** pour MCB
  (pas jeté : il encode un parcours qui marche).
- Toute banque **sans** adaptateur devient **éligible au mode agentique** au lieu
  de tomber en `manual_needed`.
- L'API publique de `scraper.ts` (ses appelants : cron, Telegram, manuel) reste
  inchangée.

## 5. Activer une nouvelle banque

**Cible : rien d'autre que l'inscrire en base** (libellé, URL de login, comptes).
Au premier run, pas de recette → mode agentique → l'IA découvre le parcours
sous garde-fous lecture seule → recette enregistrée → les runs suivants sont
déterministes. Aucun code par banque.

## 6. Tests (couverture CI ≥ 80 % à maintenir)

Le navigateur Playwright est **mocké** ; toute la logique pure est testée en
vitest :

- **`guardrails`** : cas d'interdiction exhaustifs (c'est le plus critique — un
  faux négatif ici = risque de mouvement d'argent). Chaque motif de liste noire,
  chaque champ de saisie non autorisé.
- **`recipes`** : enregistrement, rejeu, invalidation sur étape cassée,
  réparation + nouvelle version, rollback.
- **`navigator`** : parsing des décisions du modèle (JSON malformé, action
  inconnue → abort), respect des bornes (étapes max, timeout, budget).
- **Machine à états OTP** : transitions, expiration, reprise après code reçu.

## 7. Risques et points de conformité à trancher AVANT développement

1. **CGU bancaires** : le login automatisé et le stockage d'identifiants
   e-banking violent généralement les CGU de MCB/SBM. **Question de
   responsabilité en cas de fraude** — à valider juridiquement. L'alternative
   propre est l'**open banking / API de relevés officielle** si/quand la banque
   la propose ; le robot agentique reste une solution de transition.
2. **Stockage des identifiants** (déjà signalé par l'audit sécurité) : chiffrement
   correct (AES-256-GCM) mais clé colocalisée dans l'environnement Vercel avec le
   reste des secrets. Recommandation : **clé dédiée hors environnement applicatif
   (KMS), rotation**, avant tout passage à l'échelle.
3. **Détection anti-bot** : les banques peuvent détecter et bloquer
   l'automatisation (empreinte navigateur, comportement). Le mode agentique, plus
   « humain » dans sa navigation, aide, mais le risque de blocage de compte
   existe.
4. **Coût IA** : borné par run (§2.1), et amorti par les recettes (l'IA n'est
   sollicitée qu'à la découverte ou à la réparation, pas à chaque run).
5. **Garde-fou lecture seule** : la liste noire (§2.2) est la ligne de défense
   critique. Elle doit être testée de façon adversariale et revue avant toute
   activation en production.

## 8. Séquencement proposé

1. Validation de ce document (approche + points §7, notamment CGU).
2. Garde-fous + modèle de données + tests des garde-fous (la sécurité d'abord).
3. Navigateur agentique + machine à états OTP.
4. Moteur de recettes + auto-réparation.
5. Migration de MCB en recette de référence, bascule du routage de `scraper.ts`.
6. Pilote sur un compte de test avant tout déploiement.
