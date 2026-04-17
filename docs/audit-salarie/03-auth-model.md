# 03 — Modèle d'authentification & d'autorisation

> Snapshot au 2026-04-17. Lecture seule.

## 1. Pile

- **Supabase SSR** (package `@supabase/ssr`) via `lib/supabase/{client,server,middleware}.ts`.
- **Middleware global** `middleware.ts` → `updateSession()`
  (`lib/supabase/middleware.ts`), matcher sur toutes les routes hors
  statiques/public.
- **Client "admin"** (service role) utilisé côté API pour contourner la
  RLS quand le contrôle d'accès est fait en code. Cf.
  `app/api/rh/employes/me/route.ts:7-13`, `lib/rh/access.ts:7-13`.

## 2. Identités utilisées

Trois entités-clés pour savoir "qui est ce salarié" :

| Entité | Clé | Rôle |
|---|---|---|
| `auth.users` | `id` (uuid) | identité Supabase Auth. |
| `profiles` | `id = auth.users.id`, `role`, `employe_id`, `societe_id`, `client_id` | couche applicative. |
| `employes` | `id`, `auth_user_id`, `email`, `societe_id`, `date_depart` | fiche RH. |

Un compte Supabase est considéré "salarié" dès lors qu'**au moins l'un**
de ces liens existe :

1. `employes.auth_user_id = user.id` *(lien direct, le plus fiable)*,
2. `profiles.employe_id IS NOT NULL` pour ce `user.id`,
3. `employes.email == user.email` *(fallback actif uniquement quand
   l'employé n'est pas encore lié — voir §4)*.

Voir `app/api/rh/employes/me/route.ts:30-87` pour l'ordre de résolution.

## 3. Rôles reconnus

### Rôles "salarié" (accès à `/salarie` autorisé)
`employe`, `salarie`, + tout rôle RH/admin en mode "view as employee"
(`rh`, `rh_manager`, `manager`, `admin`, `super_admin`, `direction`,
`client_admin`, `client_assistant`).

Source cohérente : `middleware.ts:150-155` ≡ `app/salarie/layout.tsx:23-38`.

### Fallback "rôle vide + `employe_id`"
Si `profile.role == ""` mais `profile.employe_id` est renseigné, l'accès
à `/salarie` est accordé. Migration 108/109 citée dans le commentaire du
layout — `role` n'a pas été estampillé sur tous les comptes.

### Rôles d'autres zones
- `/rh`, `/direction`, `/juridique`, `/client`, `/admin` : voir
  `middleware.ts:115-143`.
- `client_assistant` est admis à la fois sur `/client` et sur `/salarie`
  (cas Daril — assistant d'un client qui est aussi employé).

## 4. Auto-linking (`employes/me` GET)

La route `GET /api/rh/employes/me` implémente trois étapes de résolution
*(cf. `employes/me/route.ts:24-94`)* :

1. **Étape 1 — direct** : `employes.auth_user_id == user.id` + actif
   (`date_depart IS NULL`).
2. **Étape 2 — via `profiles.employe_id`** : on suit la FK et si la ligne
   trouvée n'a pas d'`auth_user_id`, on l'écrit (auto-link).
3. **Étape 3 — via email case-insensitive** : parmi les employés actifs
   **non liés**, un match unique lie à la fois `employes.auth_user_id` et
   `profiles.employe_id`, puis renvoie l'employé.
4. Sinon → `{ employe: null, message: "Compte non lié…" }`.

### Implications sécurité

- L'auto-link par email **n'est effectué que pour des employés dont
  `auth_user_id IS NULL`** : une bonne garantie contre la prise de contrôle,
  mais à re-vérifier si une route permet à un tiers de wipe
  `auth_user_id`.
- PATCH n'utilise pas `profiles.employe_id` ni la query : il appelle
  GET interne pour résoudre l'employé courant, puis filtre par whitelist
  (`EMPLOYEE_EDITABLE_FIELDS`, `employes/me/route.ts:16-22`). Un salarié
  ne peut pas modifier `salaire_base`, `poste`, `societe_id`, etc.

## 5. Scoping multi-société — `lib/rh/access.ts`

`getUserSocieteIds(userId)` agrège plusieurs sources :

| Source | Rôle concerné | Effet |
|---|---|---|
| `admin`/`super_admin` | — | **toutes** les sociétés. |
| `profiles.societe_id` direct | tous | 1 société. |
| `profiles.client_id` → `societes.client_id` | client_* | toutes les sociétés du client. |
| `dossiers.client_id == userId` | client | sociétés des dossiers possédés. |
| `user_societes` | tous | mapping multi-société. |
| `societes.created_by == userId` | tous | sociétés créées. |
| `comptable_societes` | `comptable*` | liste explicite. |
| fallback "clients.user_id" | `client_admin`/`client_user`/`rh`/`rh_manager` | tente de remonter via table `clients`. |
| fallback ultime | `client_*`, `rh*`, `comptable*` | **toutes** les sociétés (!). |

### 🚨 Signal fort
Le fallback `ids.size === 0 && role ∈ {client_admin, client_user, rh,
rh_manager, comptable, comptable_dedie}` renvoie **toutes les sociétés**
de la base. Ce chemin est probablement la racine de certains 200 sur
données cross-client. À lister dans `06-risques-conflits.md` et
`08-prerequis-p0-rh.md`.

## 6. Schéma "self" côté API (`/api/rh/conges`, pattern)

Lorsque le client appelle `/api/rh/conges?employe_id=X`
(`conges/route.ts:370-377`) :

1. Charger l'employé X, puis comparer `auth_user_id`/`email` à l'utilisateur
   courant → flag `isSelf`.
2. Si `isSelf` → on scope sur la société de cet employé.
3. Sinon → `getUserSocieteIds(user.id)` et on filtre les données par IN.

C'est le **seul pattern "self" explicite** observé. Il doit être
dupliqué dans chaque route consommée par l'espace salarié. Voir 06.

## 7. Injection client → serveur

Le client (`app/salarie/page.tsx`) envoie presque toujours
`employe_id=X` en query. Le backend doit donc :

- résister à des `employe_id` arbitraires,
- refuser de servir un autre employé si l'appelant est un simple salarié,
- ne pas reposer sur les cookies de session seuls pour l'autorisation
  (le cookie établit l'identité, pas le périmètre).

## 8. Observations sécuritaires à tracer

1. Fallback "role ∈ RH/client vide + 0 société trouvée → toutes les
   sociétés" (access.ts:100-106). **P0**.
2. Absence d'un helper `isSelfOrAuthorized(employeId)` partagé : chaque
   route redéveloppe (ou oublie) la vérification — source probable de
   divergences entre endpoints.
3. Route `employes/me` PATCH fait un GET interne qui peut passer par
   l'étape "match email" et **lier automatiquement** un compte : OK pour
   l'onboarding, à documenter et limiter à `auth_user_id IS NULL`
   (déjà le cas — ne pas régresser).
4. Cookie/RLS : la grande majorité des routes utilise `createAdminClient`
   (service role) et fait l'autorisation en TypeScript. Conséquence : la
   RLS côté Postgres n'est pas un filet de sécurité effectif — tout repose
   sur le code. Chaque endpoint doit donc être revu.
