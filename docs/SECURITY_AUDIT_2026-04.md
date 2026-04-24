# Audit de sécurité — Lexora SaaS multi-tenant

**Date** : avril 2026
**Scope** : isolation multi-tenant, RLS, admin client, secrets applicatifs
**Méthode** : audit statique du repo (migrations SQL, routes API, middleware)

## ⚠️ Résumé exécutif

L'audit a identifié **4 findings CRITIQUES** et **3 HIGH** qui permettent à tout utilisateur
authentifié (via le client anon ou via certaines routes API) de lire/écrire les données
d'autres sociétés. Le pattern de bypass est systémique (144 routes consomment le service
role, seules 12 appellent un check d'accès).

À corriger en priorité **avant toute mise en prod multi-clients**.

---

## Top 10 Findings

### 1. [CRITIQUE] Middleware marque `/api/*` entièrement public
**Fichier** : `lib/supabase/middleware.ts:63`
**Détail** : `pathname.startsWith('/api/')` marque **TOUTES** les routes `/api/*` comme
publiques. Aucune vérification de session au niveau middleware — l'auth repose entièrement
sur chaque handler.
**Impact** : toute route oubliée = exposition totale.
**Fix** : retirer `|| pathname.startsWith('/api/')` et whitelister uniquement
`/api/public/*`, `/api/cron/*`, `/api/contact`.

### 2. [CRITIQUE] RLS policies "théâtre" sur 39 tables
**Fichiers** :
- `factures` : `034_create_factures_table.sql:37-38`, `012_critical_fixes.sql:80`
- `employes` / `bulletins_paie` : `015_rh_paie_juridique.sql:306-307`,
  `099_complete_setup.sql:240-246`, `016_paie_tibok_complet.sql:507-511`
- `factures_contacts` : `099:184`
- `factures_catalogue` : `099:201`
- `conges_employes`, `factures_interco_paie` : idem

**Détail** : policies du type `USING (auth.uid() IS NOT NULL)`. N'importe quel user
connecté peut lire/écrire TOUTES les sociétés via le client anon.
**Fix** : remplacer par filtre `societe_id IN (user_societes…)`.

### 3. [CRITIQUE] `/api/calculer-tresorerie` sans check d'accès
**Fichier** : `app/api/calculer-tresorerie/route.ts:24-37`
**Détail** : accepte `societe_id` depuis `searchParams`, utilise `getAdminClient()` (bypass
RLS), aucun `assertSocieteAccess`. Fuite des soldes bancaires de toute société.
**Fix** : appeler `assertSocieteAccess(admin, user.id, societe_id)` avant toute requête.

### 4. [CRITIQUE] `/api/comptable/ecritures` sans check d'accès
**Fichier** : `app/api/comptable/ecritures/route.ts:32-77`
**Détail** : même pattern — `societe_id` utilisateur, admin client, zéro check d'accès
avant lecture `ecritures_comptables_v2`. Dump complet du grand livre.
**Fix** : `assertSocieteAccess` avant la requête.

### 5. [HIGH] `/api/juridique` accepte n'importe quel `societe_id`
**Fichier** : `app/api/juridique/route.ts:20-46`
**Détail** : POST accepte `body.societe_id` arbitraire, utilise admin client, lit
`societes.contacts/brn/adresse` + génère contrats sans check. Permet d'exfiltrer les infos
légales de toute société.
**Fix** : `assertSocieteAccess(admin, user.id, body.societe_id)` avant toute requête.

### 6. [HIGH] Ratio admin-client / check = 144 / 12
**Détail** : 144 routes sous `app/api/` consomment `SUPABASE_SERVICE_ROLE_KEY`, seules 12
appellent `assertSocieteAccess*`. L'injection de `societe_id` est systémique.
**Fix** : imposer un wrapper `withSocieteAccess()` et lint-rule qui interdit
`getAdminClient()` sans helper.

### 7. [HIGH] Clé API MRA stockée en clair
**Fichier** : `supabase/migrations/102_mra_einvoicing.sql:11`
**Détail** : `societes.mra_api_key TEXT` stocké en clair (aussi `mra_ebs_id`,
`mra_environment`). Combiné avec l'issue #2 (policies RLS faibles), la clé est
accessible.
**Fix** : chiffrement `pgcrypto` + vault, ou Supabase Vault.

### 8. [HIGH] Passwords et tokens QR en clair
**Fichiers** :
- `supabase/migrations/047_employe_fiche_complete.sql:46` : `employes.payslip_password TEXT`
- `supabase/migrations/100_rh_cdc_v2.sql:53` : `bulletins_paie.qr_code_token TEXT UNIQUE`

**Détail** : password en clair, token QR non signé. Un token accessible via la table donne
accès au bulletin sans auth supplémentaire.
**Fix** : hash bcrypt du password, signer les tokens QR (HMAC).

### 9. [MEDIUM] `factures_contacts` / `factures_catalogue` cross-tenant
**Fichiers** :
- `supabase/migrations/042_invoicing_module.sql:42,64`
- `supabase/migrations/099_complete_setup.sql:184,201`

**Détail** : contiennent des données clients (emails, adresses, VAT number) avec policy
`auth.uid() IS NOT NULL` → fuite carnet d'adresses cross-tenant.
**Fix** : filtrer par `societe_id` dans les policies.

### 10. [MEDIUM] `/api/rh/employes` bypass check dans la branche avec param
**Fichier** : `app/api/rh/employes/route.ts:25-40`
**Détail** : GET accepte `societe_id` arbitraire et filtre dessus sans vérifier l'accès.
Le fallback sans param est correct, mais le chemin avec param bypasse.
**Fix** : `userHasAccessToSociete(user.id, societe_id)` avant
`query.eq('societe_id', societe_id)`.

---

## Points forts observés

1. **Helper d'autorisation centralisé et correct** — `lib/supabase/assert-societe-access.ts:54-73`
   implémente proprement la résolution multi-chemins (`user_societes` + `dossiers.client_id` +
   `societes.created_by`) et est utilisé sur les routes phares (`/api/client/factures`,
   `/api/comptable/banque:37-38`).

2. **RBAC middleware robuste pour les pages** — `lib/supabase/middleware.ts:105-181`
   applique des allow-lists de rôles explicites par préfixe (`/admin`, `/direction`, `/rh`,
   `/juridique`, `/client`, `/salarie`), avec contrainte mono-société cookie-based pour les
   clients.

3. **Cron endpoints protégés** — `app/api/cron/*` utilisent `verifyCronSecret(request)`
   (`lib/claude.ts:60`) qui bloque tout accès non authentifié par header dédié avant
   d'invoquer le service role.

---

## Plan d'action recommandé

### Semaine 1 — Critiques bloquantes avant multi-clients
- [ ] Retirer le bypass `/api/*` dans le middleware + whitelister explicitement
- [ ] Ajouter `assertSocieteAccess` sur `/api/calculer-tresorerie`, `/api/comptable/ecritures`,
      `/api/juridique`
- [ ] Durcir les policies RLS sur `factures`, `employes`, `bulletins_paie`,
      `factures_contacts`, `factures_catalogue` (remplacer `auth.uid() IS NOT NULL` par filtre
      `societe_id`)

### Semaine 2 — Durcissement systémique
- [ ] Créer helper `withSocieteAccess()` et migrer les 144 routes admin-client vers lui
- [ ] Lint-rule ESLint custom : interdire `getAdminClient()` sans appel préalable à un helper
      d'autorisation
- [ ] Chiffrer `mra_api_key` + `payslip_password` + `qr_code_token` (pgcrypto ou vault)

### Semaine 3 — Couverture et tests
- [ ] Tests d'intégration : user A tente d'accéder aux données de société B → 403 attendu
- [ ] Scan automatique CI : grep des patterns `societe_id = searchParams.get` sans
      `assertSocieteAccess` dans les 50 lignes suivantes

---

## Notes

Ce document est un **snapshot** à la date d'avril 2026. Il doit être re-exécuté après
chaque refactor majeur du middleware ou des routes API.

Les 3 points forts listés montrent que l'architecture sait faire — il faut juste l'étendre
systématiquement aux 144 routes qui ne suivent pas encore le pattern.
