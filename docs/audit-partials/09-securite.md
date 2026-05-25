# AUDIT 9 — SÉCURITÉ TRANSVERSAL

**Auditeur** : AGENT 9 — Security Engineer
**Date** : 2026-05-24
**Périmètre** : Lexora SaaS — Next.js 15 App Router, Supabase, Vercel
**Méthodologie** : Threat modeling STRIDE + revue de code transverse (408 routes API, middleware, RLS, secrets management, OWASP Top 10 2021)

---

## Synthèse

| Indicateur | Valeur |
|---|---|
| **Note globale sécurité** | **4.0 / 10** |
| Vulnérabilités CRITIQUES | **5** |
| Vulnérabilités HAUTES | **8** |
| Vulnérabilités MOYENNES | **7** |
| Vulnérabilités FAIBLES / Info | **6** |
| Routes API auditées | 408 (échantillon ciblé ~50) |
| Routes utilisant Zod / validation forte | **1 / 408** (~0,25 %) |
| Tables avec RLS faible reconnue | **39** (cf. migration 404) |
| Encryption AES-256-GCM (CRYPT_KEY) | Présente ✅ |

**Verdict général** : la base architecturale est saine (séparation client / server Supabase, helper `assertSocieteAccess`, chiffrement AES-256-GCM pour credentials MRA/bank, audit log `telegram_actions`). Mais l'**exécution opérationnelle laisse passer des défauts critiques** : escalade de privilèges via reset password sans contrôle de cible, RLS "théâtre" sur 39 tables reconnu en interne mais Phase 2 non livrée, endpoint admin `exec_sql` permettant SQLi DDL arbitraire, comparaisons de tokens non-timing-safe, absence totale de rate limiting sur 408 routes. Un attaquant authentifié avec un rôle bas (`client_user`, `rh`) peut escalader en `super_admin` en moins de 5 minutes via le bug SEC-001.

---

## Vulnérabilités détectées (par criticité)

### CRITIQUE

#### [SEC-001] Escalade de privilèges via reset password — n'importe quel `rh`/`client_admin` peut prendre le compte super_admin
- **Fichier** : `/home/user/v0-lexora-accounting-saa-s/app/api/admin/users/[id]/password/route.ts:24-72`
- **Note risque** : **10/10**
- **Description** : `requireAdmin()` autorise `['admin', 'super_admin', 'client_admin', 'rh', 'rh_manager']` à PATCHer le mot de passe de **n'importe quel `user_id`** passé en URL. Aucune vérification :
  - que la cible appartient à la même société que le caller
  - que le rôle de la cible est inférieur ou égal au caller
  - qu'on n'est pas en train de PATCH le mdp d'un `super_admin` depuis un compte `rh`
- **Exploit** : un `rh` quelconque (ex. employé promu RH d'une PME cliente) fait
  ```bash
  curl -X PATCH https://lexora.finance/api/admin/users/<super_admin_id>/password \
    -H 'Cookie: <session rh>' -H 'Content-Type: application/json' \
    -d '{"password":"hacked!1234"}'
  ```
  → réponse `{"success":true}` → l'attaquant se connecte en super_admin.
- **Remédiation immédiate** :
  ```typescript
  // 1. Ne laisser que admin/super_admin par défaut. client_admin/rh peuvent reset
  //    UNIQUEMENT des users dans LEUR société et avec rôle ≤ employe/manager.
  // 2. Vérifier le rôle cible et la société :
  const allowed = ['admin', 'super_admin']
  if (callerRole === 'client_admin' || callerRole.startsWith('rh')) {
    // accessible que si target.societe_id ∈ user_societes(caller)
    //   ET target.role ∈ ['employe','salarie','manager','team_leader','client_user']
    //   ET target.role NOT IN ['admin','super_admin','client_admin','direction']
  }
  // 3. Bloquer le reset du mdp d'un super_admin par tout ce qui n'est pas super_admin
  // 4. Auditer dans une table `password_reset_audit` (qui / quand / cible / IP)
  ```

---

#### [SEC-002] Endpoint admin `exec_sql` ouvert — SQLi DDL arbitraire
- **Fichiers** :
  - `/home/user/v0-lexora-accounting-saa-s/app/api/admin/fix-db/route.ts:26,61,72`
  - `/home/user/v0-lexora-accounting-saa-s/app/api/admin/diag-team-leader/route.ts:114,136`
  - `/home/user/v0-lexora-accounting-saa-s/app/api/admin/users/route.ts:28`
  - `/home/user/v0-lexora-accounting-saa-s/app/api/client/users/route.ts:20`
  - `/home/user/v0-lexora-accounting-saa-s/app/api/admin/diagnostic/route.ts:71`
- **Note risque** : **9/10**
- **Description** : la fonction RPC `exec_sql(sql text)` exposée côté Postgres exécute du SQL arbitraire en SECURITY DEFINER (service-role). Elle est appelée depuis plusieurs routes API avec des chaînes SQL hardcodées — c'est OK pour les chaînes en clair, mais **le fait que la fonction existe et soit appelable via PostgREST RPC ouvre un boulevard**. Si un user a la clé service_role (cf. SEC-003), il peut DROP TABLE, créer un super_admin, ajouter une policy passe-partout.
- **Remédiation** :
  1. Faire `REVOKE EXECUTE ON FUNCTION public.exec_sql FROM PUBLIC, authenticated, anon;`
  2. Migrer toutes les routes vers `apply_migration` ou supprimer purement `exec_sql` (les routes admin doivent appeler du SQL contrôlé hors REST).
  3. Auditer le log Postgres : `SELECT * FROM pg_stat_statements WHERE query ILIKE '%exec_sql%';`

---

#### [SEC-003] RLS "théâtre" reconnue sur 39 tables — Phase 2 jamais livrée
- **Fichier** : `/home/user/v0-lexora-accounting-saa-s/supabase/migrations/404_fix_rls_policies_phase1.sql:6-58`
- **Note risque** : **9/10**
- **Description** : la migration 331/404 admet explicitement *« VULNERABILITY: 39 tables with RLS "théâtre" allow ANY authenticated user to read/write ALL data. Pattern: `USING (auth.uid() IS NOT NULL)` without tenant scoping via societe_id »*. La Phase 1 ne corrige que **7 tables** (ecritures_comptables_v2, factures, employes, bulletins_paie, documents, comptes_bancaires, rapprochements). La Phase 2 (32 tables restantes dont `factures_contacts`, `pointages`, `demandes_conges`, `bulletins_paie_lignes`, `chat_conversations`, `documents_juridiques`, `parametres_paie_mra`, `mouvements_compte_courant`, …) n'a **jamais été poussée** : aucune migration > 404 ne complète l'effort.
- **Exploit** : un `client_user` de la société A peut SELECT directement les `pointages` ou `demandes_conges` de la société B via le client supabase-js (RLS bypass quasi-total sur 32 tables sensibles RH/compta).
- **Remédiation** : compléter la Phase 2 immédiatement. Template :
  ```sql
  DROP POLICY IF EXISTS "<old>" ON public.<table>;
  ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "<table>_tenant_select" ON public.<table>
    FOR SELECT USING (public.user_has_societe_access(societe_id));
  CREATE POLICY "<table>_tenant_write" ON public.<table>
    FOR ALL USING (public.user_has_societe_access(societe_id))
    WITH CHECK (public.user_has_societe_access(societe_id));
  ```
  Tester : connecté en `client_user(soc A)`, `SELECT * FROM pointages WHERE societe_id='<soc B>'` doit renvoyer 0 ligne.

---

#### [SEC-004] Comparaisons de tokens non timing-safe (timing attack)
- **Fichiers** :
  - `/home/user/v0-lexora-accounting-saa-s/lib/lexora-internal-auth.ts:38`  → `token !== expected`
  - `/home/user/v0-lexora-accounting-saa-s/lib/telegram/auth.ts:8` → `headerSecret !== SECRET`
  - `/home/user/v0-lexora-accounting-saa-s/lib/claude.ts:64` → `authHeader === \`Bearer ${secret}\``
  - `/home/user/v0-lexora-accounting-saa-s/lib/telegram/internal-auth.ts:57` → `internalToken !== process.env.INTERNAL_API_TOKEN`
  - 10+ routes Telegram dupliquent le même pattern non-safe
- **Note risque** : **8/10**
- **Description** : seul `lib/agent-auth.ts:29-33` (`verifyAgentSecret`) utilise une comparaison en temps constant. Tous les autres secrets (INTERNAL_API_TOKEN, TELEGRAM_WEBHOOK_SECRET, CRON_SECRET) sont comparés avec `===` ou `!==`. Un attaquant qui peut mesurer la latence réseau (cas réaliste sur Vercel via timing distributions) peut extraire byte-par-byte le secret en 256 × 32 = 8192 requêtes par caractère.
- **Remédiation** : centraliser dans un helper :
  ```typescript
  import { timingSafeEqual } from 'node:crypto'
  export function safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    return timingSafeEqual(Buffer.from(a), Buffer.from(b))
  }
  ```
  Refactor toutes les comparaisons de secrets.

---

#### [SEC-005] Endpoints `/api/telegram/internal/*` accessibles à tout détenteur de `INTERNAL_API_TOKEN` — fuite = compromission totale multi-société
- **Fichier** : `/home/user/v0-lexora-accounting-saa-s/lib/telegram/internal-auth.ts:55-154`
- **Note risque** : **8/10**
- **Description** : le token interne `INTERNAL_API_TOKEN` est un secret partagé statique qui permet à n'importe quel appelant qui le possède de **se faire passer pour n'importe quel chat_id** (donc n'importe quel `user_id`). 56 endpoints `/api/telegram/internal/*` (`payroll-approve`, `leave-decide`, `expense-create`, `bank-scrape`, `email-send`, `payroll-mra-submit`, ...) sont protégés par ce **seul** token. Si le token fuit (logs Vercel, n8n, env vars exposés, dump d'un workflow n8n importé), l'attaquant peut :
  - valider la paie de toutes les sociétés
  - approuver les congés au nom de n'importe qui
  - exporter MRA / soumettre des déclarations fiscales
  - envoyer des emails au nom d'un utilisateur
  - lancer un scrape bancaire (et obtenir les balances)
- Pas de rotation, pas de signature HMAC du payload, pas de timestamp anti-replay.
- **Remédiation** :
  1. Migrer vers HMAC-signé par requête : `X-Lexora-Signature: sha256=<hmac(body+timestamp, secret)>` + `X-Lexora-Timestamp: <unix>` rejeté si > 5 min.
  2. Auditer chaque appel dans `telegram_actions` (déjà fait) + ajouter un index/alerte sur volume anormal.
  3. Rotation programmée du secret (mensuelle).
  4. Restreindre par IP (whitelist du worker n8n).

---

### HAUTE

#### [SEC-006] Cookie `active_societe_id` JS-accessible, non-HttpOnly, non-Secure
- **Fichier** : `/home/user/v0-lexora-accounting-saa-s/components/client/SocieteActiveProvider.tsx:75-78`
- **Note risque** : **7/10**
- **Description** : le cookie est posé par `document.cookie = ... samesite=lax` côté client. Manque `Secure` (cookie envoyé en HTTP en dev / si fuite TLS) et `HttpOnly` (lisible par JS → vol via XSS). En soi l'effet sur l'autorisation est limité car les routes critiques re-vérifient via `user_societes` (cf. `/api/rh/paie/ot/preview/route.ts`), mais certaines routes utilisent `getActiveSocieteIdFromCookies()` en fallback sans re-check d'accès — à auditer une-par-une.
- **Remédiation** : poser le cookie côté serveur via une route `/api/client/set-active-societe` qui valide l'accès et set `httpOnly; secure; samesite=strict; path=/`.

#### [SEC-007] Route `/api/contact` sans rate limiting + persistance brute des inputs
- **Fichier** : `/home/user/v0-lexora-accounting-saa-s/app/api/contact/route.ts`
- **Note risque** : **6/10**
- **Description** : endpoint public, aucune validation longueur, aucun anti-spam (captcha, rate limiting, honeypot). Stocke message, email, téléphone bruts dans `contact_messages` puis push WhatsApp via WATI sans filtrage. Vecteur de spam + injection si la table est rendue ailleurs sans escape.
- **Remédiation** : Zod schema strict (longueur, regex email/téléphone), Cloudflare Turnstile, rate limit IP 5/h.

#### [SEC-008] Route `/api/inscription` — anti-doublon trivial, pas de captcha
- **Fichier** : `/home/user/v0-lexora-accounting-saa-s/app/api/inscription/route.ts:114-124`
- **Note risque** : **6/10**
- **Description** : un attaquant peut spammer `demandes_inscription` avec des milliers d'emails jetables. Le check anti-doublon ne sert à rien (change d'email → bypass). Mail vers `LEXORA_ADMIN_EMAIL` envoyé pour chaque ligne → DoS opérationnel.
- **Remédiation** : Turnstile, rate limit IP + email-domain, Zod schema, queue avec dédup côté admin.

#### [SEC-009] Routes admin `/api/admin/*` valident `profile.role` mais pas la cohérence avec `user_societes` — risque sur clients multi-cabinets
- **Fichier** : `/home/user/v0-lexora-accounting-saa-s/app/api/admin/users/route.ts:11-18,100-206` (POST/PATCH/DELETE)
- **Note risque** : **7/10**
- **Description** : `requireAdmin()` ne vérifie que `profile.role IN ('admin','super_admin')`. Un admin Lexora peut, via POST/PATCH, créer/éditer un utilisateur dans **n'importe quelle société** sans audit log structuré (juste `console.log`). Un compromis du compte admin → reset cascade trivial.
- **Remédiation** : audit log immuable (`admin_actions_log` avec WORM constraint), MFA obligatoire pour les rôles `admin`/`super_admin`, validation rôle cible.

#### [SEC-010] `cascade-delete` et `reset-complet` — guard rôle mais pas de MFA, pas de 4-eyes
- **Fichiers** :
  - `/home/user/v0-lexora-accounting-saa-s/app/api/admin/cascade-delete/route.ts`
  - `/home/user/v0-lexora-accounting-saa-s/app/api/comptable/reset-complet/route.ts`
- **Note risque** : **7/10**
- **Description** : Bien protégés par `confirm="DELETE_HARD"` + `confirm_nom_societe`, mais un seul utilisateur compromis peut faire `confirm` lui-même. Pas d'approbation 4-eyes, pas de MFA step-up, pas de retention/undo. La perte d'un compte cabinet = wipe possible de toute la compta cliente en quelques secondes (max 500 ids/req mais répétable).
- **Remédiation** :
  1. Soft delete avec retention 30 jours par défaut (table `_deleted` shadow).
  2. Step-up MFA (code TOTP envoyé sur Telegram lié).
  3. 4-eyes : un deuxième admin doit cliquer "Confirmer" depuis un autre compte dans les 15 min.

#### [SEC-011] Endpoint `/api/admin/fix-db` et `/api/admin/diag-team-leader` — DDL en libre service
- **Fichier** : `/home/user/v0-lexora-accounting-saa-s/app/api/admin/fix-db/route.ts:13-130`
- **Note risque** : **6/10**
- **Description** : exposent des DDL `ALTER TABLE … DROP CONSTRAINT … ADD CONSTRAINT` via RPC `exec_sql`. Un admin compromis peut élargir `profiles_role_check` à `'root'` puis créer un user `root` sans tracage.
- **Remédiation** : ne plus avoir de DDL accessible via UI. Toutes les migrations doivent passer par `supabase/migrations/*.sql` via CI uniquement.

#### [SEC-012] Pas de rate limiting global (0 occurrence dans le repo)
- **Fichier** : `app/api/**` (408 routes), aucun middleware de rate limit
- **Note risque** : **7/10**
- **Description** : aucun usage de `@upstash/ratelimit`, `next-rate-limit`, `slowapi`, ni équivalent. Endpoints `/api/auth/login`, `/api/inscription`, `/api/contact`, `/api/telegram/webhook`, `/api/agent/*` sont brute-forceables et DoS-ables.
- **Remédiation** : middleware Vercel KV/Upstash :
  ```ts
  // middleware.ts — exemple
  import { Ratelimit } from "@upstash/ratelimit"
  import { Redis } from "@upstash/redis"
  const limiter = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(20, "1 m") })
  // Apply per IP for /api/auth/*, /api/inscription, /api/contact, /api/agent/*
  ```

#### [SEC-013] `assertWebhookSecret` lève si `SECRET` absent (fail-open masqué)
- **Fichier** : `/home/user/v0-lexora-accounting-saa-s/lib/telegram/auth.ts:6-11`
- **Note risque** : **6/10**
- **Description** : si `TELEGRAM_WEBHOOK_SECRET` n'est pas configuré en prod, le webhook crashe avec "TELEGRAM_WEBHOOK_SECRET not configured" — fail-closed OK. Mais ce qui peut arriver : un déploiement preview Vercel avec env vars partielles → webhook désactivé silencieusement, alertes non envoyées, sans alerte serveur. C'est plus un bug ops qu'une vuln, mais il faut un healthcheck.

---

### MOYENNE

#### [SEC-014] Une seule route sur 408 utilise Zod
- **Fichier** : global — `grep "import { z" app/api/ → 1 résultat`
- **Note risque** : **5/10**
- **Description** : la validation se fait par checks manuels `typeof body?.x === 'string'` ou regex inline, inconsistant et lacunaire. Beaucoup de routes acceptent des objets nested sans schema (ex. `societe_data`, `cabinet_data` dans `/api/inscription`). Risque SQL injection nul (Supabase paramétré) mais mass assignment et payload bombs possibles.
- **Remédiation** : adopter Zod systématiquement, lib partagée `lib/validation/*` par domaine.

#### [SEC-015] Endpoint `/api/admin/repair-orphan-documents` — auth INTERNAL fallback session, comparaison non-safe
- **Fichier** : `/home/user/v0-lexora-accounting-saa-s/app/api/admin/repair-orphan-documents/route.ts:31-41`
- **Note risque** : **5/10**
- **Description** : double mode auth, mais la comparaison `internalToken === process.env.INTERNAL_API_TOKEN` n'est pas safe (cf. SEC-004), et la route fait du DELETE en masse sur `ecritures_comptables_v2`. Combine SEC-004 + opération destructive.

#### [SEC-016] `assertSocieteAccess` : 8 chemins d'accès — surface importante, audit complexe
- **Fichier** : `/home/user/v0-lexora-accounting-saa-s/lib/supabase/assert-societe-access.ts:38-78`
- **Note risque** : **5/10**
- **Description** : 8 queries pour déterminer si un user a accès à une société (user_societes, dossiers.client_id, societes.created_by, dossiers.comptable_id, comptable_societes, societes.comptable_id, cabinet_collaborateurs_acces, profiles.comptable_id). Chaque chemin est correct individuellement mais la matrice est difficilement testable et un seul faux positif suffit. Aucun test d'intégration trouvé.
- **Remédiation** : créer une vue SQL `user_accessible_societes(user_id, societe_id, via)` et l'utiliser à la fois côté RLS et côté `assertSocieteAccess`. Tester avec ≥ 20 scénarios.

#### [SEC-017] CRYPT_KEY env — pas de versioning ni rotation
- **Fichier** : `/home/user/v0-lexora-accounting-saa-s/lib/crypto/symmetric.ts:14-20`
- **Note risque** : **5/10**
- **Description** : AES-256-GCM correctement implémenté (IV random 12 bytes, auth tag séparé). Mais une seule clé statique sans versioning : impossible de tourner sans réencrypter toute la table. Si CRYPT_KEY est compromise, tous les credentials bank/MRA sont en clair.
- **Remédiation** : format `v1:<iv>:<tag>:<ct>` + table `crypto_keys(version, key, active, rotated_at)` + script de rotation.

#### [SEC-018] Soft delete par défaut — données utilisateur conservées indéfiniment (RGPD)
- **Fichier** : `/home/user/v0-lexora-accounting-saa-s/app/api/admin/users/route.ts:280-336`
- **Note risque** : **5/10**
- **Description** : DELETE par défaut = `is_active=false` sans expiration. RGPD/protection des données : droit à l'effacement non automatisé. La page `/protection-donnees` promet l'effacement mais le système ne le fait pas réellement.
- **Remédiation** : cron `purge_soft_deleted_users` après 90j, ou flow d'anonymisation (replace email/nom par hash).

#### [SEC-019] Stack traces et messages d'erreur DB renvoyés au client sur 50+ routes
- **Fichier** : multiples — pattern `return NextResponse.json({ error: e.message }, ...)`
- **Note risque** : **4/10**
- **Description** : ex. `/api/admin/users/route.ts:163` renvoie `Erreur profil: <message Postgres>` → fuite des noms de tables, constraints, colonnes. Aide un attaquant à mapper le schéma sans avoir d'accès direct.
- **Remédiation** : helper `mapDbErrorToPublicMessage()` qui renvoie un code générique, log full côté serveur.

#### [SEC-020] Page admin `/admin/purge` charge `societes` directement via `supabase` côté client
- **Fichier** : `/home/user/v0-lexora-accounting-saa-s/app/admin/purge/page.tsx:38-43`
- **Note risque** : **4/10**
- **Description** : la page client appelle `supabase.from("societes").select("id, nom")` directement avec la clé anon. Si la RLS sur `societes` est mal scopée (cf. SEC-003 Phase 2), un utilisateur non-admin qui accède à cette URL (le middleware bloque, mais en cas de bypass) pourrait lister toutes les sociétés.

---

### FAIBLE / INFO

- **[SEC-021]** `dangerouslySetInnerHTML` employé uniquement pour i18n statique (`lib/help/content.ts`, pages CGU/CGV) — pas de XSS exploitable car le contenu n'est pas user-controlled. **Info / Note 2/10** — à monitorer, ne pas étendre l'usage.
- **[SEC-022]** `console.error/log` ne contient pas de secrets (vérifié sur `lib/credentials/*`, `lib/supabase/*`). **Note 2/10** — bonne hygiène.
- **[SEC-023]** Aucun `eval()` dans le code applicatif. ✅ **Note 0/10**.
- **[SEC-024]** Aucun secret hardcodé détecté dans le repo (vérif `grep -rn "sk-[A-Za-z0-9]" `, `grep -rn "lex_[A-Za-z0-9]{32}"`). ✅
- **[SEC-025]** `NEXT_PUBLIC_*` ne contient ni clé Anthropic ni clé OpenAI ni service_role — bonne séparation. ✅
- **[SEC-026]** `.env.local.example` propre, pas de secrets committés (`git log --all -p .env*` à confirmer en CI).

---

## Domaines audités (note /10 par domaine)

| Domaine | Note | Détail |
|---|---|---|
| **Authentification** | 6/10 | Supabase SSR correct, cookies HTTP-only par défaut côté Supabase ✅. Mais `active_societe_id` posé côté client en JS (SEC-006), pas de MFA, pas de rate limit sur login. Token API personnel `lex_*` bien fait (SHA-256 hashé, révocable). |
| **Authorization / RBAC** | 3/10 | Middleware filtre par rôle ✅ mais SEC-001 (password reset escalation) casse tout. `requireAdmin()` dupliqué dans 30+ routes au lieu d'un helper centralisé. |
| **Multi-tenant (RLS)** | 3/10 | `assertSocieteAccess` correct mais 32 tables encore en RLS "théâtre" (SEC-003). Defense-in-depth = 1 couche au lieu de 2. |
| **Secrets management** | 6/10 | AES-256-GCM ✅, helper `encryptSecret/decryptSecret` propre, MRA vault propre. Manque rotation (SEC-017), `exec_sql` ouvert (SEC-002), tokens partagés non-rotatables (SEC-005). |
| **API security** | 3/10 | 1 route sur 408 utilise Zod (SEC-014), 0 rate limiting (SEC-012), comparaisons non-safe (SEC-004), DDL ouvert (SEC-011). |
| **Telegram security** | 5/10 | Webhook protégé par secret (SEC-013 fail-closed OK), mais comparaison non-safe + 56 endpoints internes derrière un seul token statique (SEC-005). Bons points : audit log `telegram_actions`, vérif scope société sur chaque endpoint (`ctx.societe_id`), capabilities par rôle. |
| **OWASP Top 10** | 4/10 | A01 (Broken Access Control) = critique [SEC-001, 003, 010]. A03 (Injection) = bon (Supabase paramétré) sauf SEC-002. A04 (Insecure Design) = SEC-009/010 (pas de 4-eyes, pas de MFA admin). A05 (Security Misconfig) = SEC-006, 011, 013. A07 (Auth Failures) = SEC-004, 012. A08 (Software & Data Integrity) = pas de SBOM, pas de signature releases. A09 (Logging) = audit log partiel. |
| **Données sensibles / logs** | 7/10 | ✅ pas de secrets dans console. Stack traces fuitent (SEC-019). Audit log `telegram_actions` propre. |

---

## Top 10 actions de remédiation prioritaires

1. **PATCH SEC-001 EN HOTFIX SOUS 24H** — restreindre `/api/admin/users/[id]/password` aux `admin`/`super_admin` uniquement OU ajouter checks `target.societe_id ∈ user_societes(caller)` + `target.role NOT IN ('admin','super_admin','client_admin','direction')`. Sortir un audit log de tous les resets des 30 derniers jours pour vérifier qu'aucun n'est suspect.

2. **REVOKE `exec_sql` (SEC-002)** — exécuter immédiatement `REVOKE EXECUTE ON FUNCTION public.exec_sql FROM PUBLIC, authenticated, anon, service_role;` et migrer les 5 callers vers `supabase/migrations/*.sql`.

3. **Compléter migration RLS Phase 2 (SEC-003)** — créer `supabase/migrations/410_rls_phase2_remaining_tables.sql` qui durcit les 32 tables identifiées. Tester avec ≥ 5 utilisateurs de sociétés différentes. Sprint dédié 2 semaines.

4. **Centraliser comparaisons de secrets (SEC-004)** — créer `lib/security/safe-equal.ts` avec `timingSafeEqual`, refactor toutes les comparaisons (~15 endroits). PR mécanique, 1 jour.

5. **HMAC-signer les appels internes Telegram (SEC-005)** — schéma `X-Lexora-Signature` + `X-Lexora-Timestamp`, rejection > 5 min. Rotation mensuelle du secret. Sprint dédié 1 semaine.

6. **Rate limiting global (SEC-012)** — adopter `@upstash/ratelimit` + Vercel KV ou Upstash Redis. Tarifs par route :
   - `/api/auth/*`, `/api/inscription`, `/api/contact` : 5/min/IP
   - `/api/agent/*` : 60/min/secret
   - `/api/telegram/webhook` : 1000/min global
   - autres `/api/*` : 120/min/user

7. **MFA obligatoire pour rôles admin/super_admin/direction/comptable** (SEC-009, 010) — TOTP via Supabase MFA ou Telegram OTP. Step-up obligatoire pour `cascade-delete`, `reset-complet`, password reset.

8. **Zod systématique sur 408 routes (SEC-014)** — démarrer par les 50 routes les plus critiques (admin/*, comptable/*, client/direction/*, telegram/webhook). Lib `lib/validation/` par domaine.

9. **Cookie `active_societe_id` côté serveur (SEC-006)** — route `POST /api/client/set-active-societe { societe_id }` qui valide via `assertSocieteAccess` puis pose le cookie en `httpOnly; secure; samesite=strict`.

10. **Anonymisation utilisateur RGPD (SEC-018)** — cron mensuel `purge_anonymize_inactive_users(90d)` qui remplace email/nom par hash, conserve l'audit trail mais respecte le droit à l'effacement promis dans `/protection-donnees`.

---

## Recommandations transversales

- **Audit log immuable** : créer `admin_actions_log(actor_id, action, target_id, ip, ua, payload_hash, ts)` avec WORM constraint (PostgreSQL `ALTER TABLE … ADD CONSTRAINT no_update CHECK (false)` sur UPDATE/DELETE via trigger).
- **SBOM CI** : `npm audit --audit-level=high` bloquant sur PR, `trivy fs .` sur Docker (si applicable).
- **Secret scanning** : `gitleaks` en pre-commit + hook GitHub Actions.
- **Pentest externe** : engager un cabinet (CERT-FR / Synacktiv / Lexfo) sur 5 jours dans les 60 jours après corrections critiques (SEC-001 à 005).
- **Politique de divulgation** : `SECURITY.md` à la racine du repo, `security@lexora.finance` qui répond < 48h.

---

**Conclusion** : la sécurité Lexora a de bonnes fondations (séparation clients Supabase, chiffrement AES-256-GCM, helper `assertSocieteAccess`, audit log Telegram) mais souffre de **3 défauts opérationnels majeurs** :
1. une route d'escalade de privilèges grand-ouverte (SEC-001),
2. une migration de sécurité (RLS Phase 2) reconnue en interne mais jamais livrée (SEC-003),
3. l'absence totale de rate limiting et de Zod sur 408 endpoints.

Avec les 10 actions prioritaires ci-dessus, la note remontera de **4.0/10 à ~7.5/10**. Sans ces corrections, un attaquant avec un compte `rh` ou `client_admin` peut compromettre la plateforme entière en moins de 10 minutes.
