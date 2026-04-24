# 05 — Dépendances `/salarie` ↔ `/rh`

> Snapshot 2026-04-17. Le hotfix `hotfix/salarie-navigation`
> (commit `ae2fa1a`) est déjà mergé en main ; ces dépendances
> ne sont pas affectées par le fix de navigation.

## Vue d'ensemble

L'espace salarié **n'a pas d'API propre** : aucun `app/api/salarie/*`
n'existe. Les 10 onglets du portail consomment exclusivement les
routes `/api/rh/*`. La séparation est donc **logique**
(whitelist de champs, pattern `isSelf` côté serveur, contrôle de rôle
dans `middleware.ts`) et **non physique**. Toute évolution côté RH
qui change une route, un format de réponse ou un schéma de table peut
casser l'espace salarié sans avertissement.

## Matrice par onglet

Pour chaque onglet : APIs consommées, tables lues (indirectement via
les APIs RH), composants partagés, impact d'une évolution RH.

---

### Onglet : Dashboard (`#dashboard`)

- **APIs /api/rh/\* consommées**
  - `GET /api/rh/employes/me` — résolution de l'employé.
  - `GET /api/rh/pointage?date=YYYY-MM-DD&employe_id=X`
  - `POST /api/rh/pointage` (action de pointage entrée/pause/sortie).
  - `GET /api/rh/paie?action=list&employe_id=X` (dernier bulletin).
  - `GET /api/rh/primes?type=saisie&employe_id=X`
  - `GET /api/rh/conges?action=balances&employe_id=X`
  - `GET /api/rh/planning?periode=YYYY-MM&societe_id=X&employe_id=X`
  - `GET /api/rh/conges?employe_id=X`
  - `GET /api/rh/annonces`
- **Tables DB lues** : `employes`, `profiles`, `pointages`,
  `bulletins_paie`, `primes_saisies`, `conges`, `planning_entries`,
  `annonces`.
- **Composants partagés** : aucun composant `/rh` réutilisé ; le
  dashboard est rendu inline.
- **Types partagés** : aucun — tout est `any`.
- **Impact si /rh évolue**
  - Rename d'une action (`action=list`, `action=balances`) → casse.
  - Changement du format `bulletins[]`, `pointages[]`, `primes[]` → casse.
  - Suppression de `/api/rh/annonces` → dashboard perd les communications.

---

### Onglet : Ma fiche (`#profil`)

- **APIs consommées**
  - `GET /api/rh/employes/me` (via `load()` du parent).
  - `PATCH /api/rh/employes/me` — whitelist serveur 16 champs
    (`EMPLOYEE_EDITABLE_FIELDS`, cf. `03-auth-model` §4).
- **Tables DB lues** : `employes` (limité au propre enregistrement),
  `profiles` (pour le lien `employe_id`).
- **Composants partagés** : `@/components/ui/*` seulement.
- **Types partagés** : aucun.
- **Impact si /rh évolue**
  - Ajout d'une colonne obligatoire (`NOT NULL`) sans valeur par
    défaut → le PATCH self-service échoue.
  - Modification de `EMPLOYEE_EDITABLE_FIELDS` côté RH → portée de
    modification employee change silencieusement.

---

### Onglet : Bulletins (`#bulletins`)

- **APIs consommées**
  - `GET /api/rh/paie?action=list&employe_id=X` (via `load()`).
  - `GET /api/rh/paie/pdf?employe_id=X&periode=YYYY-MM&bulletin_id=Y[&view=1]`.
  - `POST /api/rh/paie?action=mark_read&bulletin_id=Y`.
- **Tables DB lues** : `bulletins_paie`.
- **Composants partagés** : aucun. Le générateur PDF est côté serveur.
- **Impact si /rh évolue**
  - Rename de `action=mark_read` → bulletins restent « Nouveau » indéfiniment.
  - Changement du format PDF (signature, filigrane) → ouvert/téléchargé
    tel quel, côté salarié rien à adapter.
  - Ajout de champs (`heures_sup_montant`, `special_allowance_1`,
    `total_deductions`) : si renommés, les chips du listing disparaissent.

---

### Onglet : Planning (`#planning`)

- **APIs consommées**
  - `GET /api/rh/planning?periode=YYYY-MM&societe_id=X&employe_id=X` (via `load()`).
  - `GET /api/rh/conges?employe_id=X` (re-utilisé pour fusion
    planning/congés côté client).
- **Tables DB lues** : `planning_entries`, `conges`.
- **Composants partagés** : aucun.
- **Impact si /rh évolue**
  - Si `/api/rh/planning` filtre un jour par `employe_id` côté serveur
    (aujourd'hui pas garanti — on sur-filtre client), on garde la
    robustesse. Si le serveur RENOMME `jour`/`heure_debut`/`shift`,
    le rendu casse silencieusement.
  - Changement des statuts congé (`approuve` / `approved`) → la fusion
    mélange AL/SL/MAT dans le planning.

---

### Onglet : Primes (`#primes`)

- **APIs consommées** : aucun fetch propre. Réutilise `bulletins[]` et
  `primes[]` chargés par le dashboard (`/api/rh/paie?action=list` et
  `/api/rh/primes?type=saisie`).
- **Tables DB lues** : `bulletins_paie`, `primes_saisies`.
- **Composants partagés** : aucun.
- **Impact si /rh évolue**
  - Rename `heures_sup_montant` / `special_allowance_1` → les 3 cartes
    deviennent vides.
  - Modification de `primes.prime.libelle` (structure emboîtée) → labels
    perdus côté salarié.

---

### Onglet : Congés (`#conges`)

- **APIs consommées**
  - `GET /api/rh/conges?action=balances&employe_id=X`
  - `GET /api/rh/conges?employe_id=X`
  - `POST /api/rh/conges` `{ action: "creer", … }`
  - `POST /api/rh/conges` `{ action: "annuler", id }`
- **Tables DB lues** : `conges`, `conges_balances` (ou champ JSON
  équivalent dans `employes` selon migrations).
- **Composants partagés** : aucun. La logique "demi-journée" (enum
  `DEMI_JOURNEE_ALLOWED`) est dupliquée côté `/rh/conges`.
- **Impact si /rh évolue**
  - Ajout d'un nouveau type de congé (ex: `COMPENSATOIRE`) non reconnu
    par la pill selector côté salarié → option invisible.
  - Changement de la logique serveur `action=annuler` (extension à
    `approuve` par exemple) → divergence avec la règle UI
    `statut === "en_attente"`.
  - **Certificat médical** (`SL > 3j`) : l'UI l'affiche, ne l'envoie
    jamais au serveur (cf. 04b §6 — risque P1 non dépendant de RH
    mais à coordonner).

---

### Onglet : Documents (`#documents`)

- **APIs consommées** : **aucune** (placeholder « Fonctionnalité à venir 🚧 »).
- **Tables DB lues** : aucune.
- **Composants partagés** : aucun.
- **Impact si /rh évolue** : nul — mais si `/api/rh/documents` ou
  équivalent est créé, ce sera le moment d'activer l'onglet.

---

### Onglet : Trajets km (`#trajets`)

- **APIs consommées**
  - `GET /api/rh/trajets-km?employe_id=X`
  - `POST /api/rh/trajets-km` `{ action: "demarrer", … }`
  - `POST /api/rh/trajets-km` `{ action: "checkpoint", … }`
  - `POST /api/rh/trajets-km` `{ action: "terminer", … }`
- **Tables DB lues** : `trajets_km` + `trajets_km_checkpoints` (ou
  structure équivalente).
- **Composants partagés** : aucun. Le calcul d'indemnité
  (`montant_indemnite`) est côté serveur.
- **Impact si /rh évolue**
  - Changement du schéma `statut` (`en_cours`/`valide`/`rejete`) → les
    filtres stats/historique côté salarié doivent être mis à jour.
  - Ajout d'une validation RH côté serveur (anti-fraude GPS) → transparent
    côté salarié, sauf message d'erreur éventuel à relayer.

---

### Onglet : Ma santé (TIBOK) (`#sante`)

- **APIs consommées** : **aucune**. Tout le contenu est statique
  (process-flows), plus `window.open("https://tibok.mu")`.
- **Tables DB lues** : aucune.
- **Composants partagés** : aucun.
- **Impact si /rh évolue** : **nul**. Cet onglet vit en dehors de
  l'écosystème Lexora RH — périmètre externe TIBOK.

---

### Onglet : Mes contrats (`#contrats`)

- **APIs consommées**
  - `GET /api/rh/contrats?employe_id=X`
  - `GET /api/rh/contrats/[id]/pdf` (lien direct).
  - `POST /api/rh/contrats/[id]/signer` `{ action: "signer_self" }`.
- **Tables DB lues** : `contrats_employes`.
- **Composants partagés** : les statuts (`brouillon`, `signe_employe`,
  `signe`, `expire`, `resilie`) sont les **mêmes** que ceux utilisés
  dans `/rh/contrats` et `/juridique/contrats`. Ils sont définis en
  DB et non dans un type partagé.
- **Types partagés** : aucun `type Contrat` explicite — contrats
  manipulés en `any`.
- **Impact si /rh évolue**
  - Ajout d'un nouveau statut (ex: `en_revision`) → le mapping
    `STATUT_LABELS`/`STATUT_COLORS` côté salarié affiche le code brut.
  - Modification des champs `html_content[_modified]` → rendu direct
    via `dangerouslySetInnerHTML` → **couplage fort à verrouiller**
    (voir 06, P0 XSS).

---

## Modèle d'authentification (rappel)

Résumé en 5 points (détails → `03-auth-model.md`) :

1. `middleware.ts` vérifie le rôle + présence de `profiles.employe_id`
   avant d'autoriser `/salarie/*`.
2. `/api/rh/employes/me` fait le lien `auth_user_id` ↔ `employes.id`
   (3 stratégies : direct, via `profiles.employe_id`, via email).
3. Le périmètre société est résolu par `lib/rh/access.ts :
   getUserSocieteIds(userId)` (⚠️ fallback « toutes les sociétés »
   documenté comme faille P0 dans 08).
4. Chaque route RH doit implémenter le pattern `isSelf` quand un
   `employe_id` est passé en query (ex. `conges/route.ts`, `signer_self`).
5. Les écritures côté salarié sont limitées à 5 endpoints
   (voir § suivant).

## Composants et utilitaires partagés

| Fichier | Usage commun |
|---|---|
| `@/components/ui/*` (shadcn) | UI primitives utilisées partout. |
| `@/components/layout/ClientPageShell` | Wrapper visuel partagé `/client`, `/salarie`, `/rh`. |
| `@/lib/supabase/{client,server,middleware}` | Clients Supabase SSR. |
| `@/lib/rh/access.ts` | `getUserSocieteIds`, `userHasAccessToEmploye` — utilisé par presque toutes les routes `/api/rh/*`. |
| `@/lib/rh/paie.ts`, `calculateWorkingDays.ts`, `period.ts` | Non importés par `/salarie` ; seulement par `/rh` et les APIs. |
| `@/components/LanguageSwitcher` | Sidebar salarié + autres sidebars. |

La sidebar salarié (`components/layout/SalarieSidebar.tsx`) **n'est
utilisée que par `/salarie`** — pas de partage avec `/rh`.

## Règle de séparation respectée

Côté **lecture** : `/salarie` peut lire paie, planning, congés,
bulletins, primes, contrats, trajets — mais toujours filtré sur
`employe_id = self` au niveau de l'API.

Côté **écriture**, seuls ces 5 endpoints sont invoqués depuis
`/salarie` :

1. `POST /api/rh/pointage` — pointage du jour (entrée/pause/sortie).
2. `POST /api/rh/conges` `action ∈ {creer, annuler}` — sa propre
   demande, statut `en_attente` uniquement pour `annuler`.
3. `POST /api/rh/trajets-km` `action ∈ {demarrer, checkpoint, terminer}`
   — son propre trajet.
4. `PATCH /api/rh/employes/me` — sa propre fiche, 16 champs whitelistés.
5. `POST /api/rh/contrats/[id]/signer` `action: signer_self` — son
   propre contrat, impossible si déjà signé ou contresigné.

**Aucune écriture sur** : bulletins de paie, primes saisies, planning,
annonces, jours fériés, groupes, contrats (création), employés (autres
que soi). Si une régression côté `/rh` levait accidentellement ces
barrières, un salarié pourrait écrire sur des données paie → **risque
P0**. Audit de chaque route à prévoir — voir `08-prerequis-p0-rh.md`.
