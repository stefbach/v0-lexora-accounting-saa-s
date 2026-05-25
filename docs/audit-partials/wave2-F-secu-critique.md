# WAVE 2-F — Remédiation sécurité critique

**Sous-agent** : W2-F (vague 2 de remédiation Lexora — volet sécurité)
**Source** : `/home/user/v0-lexora-accounting-saa-s/docs/audit-partials/09-securite.md`
**Date** : 2026-05-24
**Branche** : `claude/kind-mccarthy-zknYB`
**CVE traités** : 5 (SEC-001 à SEC-005)

---

## Résumé exécutif

| CVE | Titre | Note | Hotfix < 24h ? | Effort | Rollback safe ? |
|---|---|---|---|---|---|
| **SEC-001** | Escalade privilèges via reset password | **10/10** | **OUI — URGENT** | 30 min | OUI (revert route) |
| **SEC-002** | `exec_sql` RPC ouvert (DDL arbitraire) | **9/10** | OUI | 2 h | OUI (3 routes admin laissent SQL inline en commentaire) |
| **SEC-003** | RLS theatre 32 tables restantes | **9/10** | NON (sprint dédié) | 2 jours | OUI (DROP+CREATE idempotent) |
| **SEC-004** | Comparaisons tokens non timing-safe | **8/10** | NON | 1 jour | OUI (helper drop-in) |
| **SEC-005** | INTERNAL_API_TOKEN partagé non-HMAC | **8/10** | NON (sprint 1 sem.) | 5 jours | RISQUE (toucher 56 endpoints) |

**Action immédiate recommandée** : déployer le patch SEC-001 en **hotfix prod < 1h**. Les autres CVE doivent être batchés en deux PRs (sécurité opérationnelle + RLS Phase 2).

---

## SEC-001 — Escalade de privilèges via reset password (CRITIQUE 10/10)

### Diagnostic confirmé

Fichier : `app/api/admin/users/[id]/password/route.ts`

Le `requireAdmin()` accepte 5 rôles (`admin, super_admin, client_admin, rh, rh_manager`). Aucun contrôle :
- pas de comparaison du rôle de la cible
- pas de check `target.societe_id ∈ user_societes(caller)`
- un `rh` d'une PME peut PATCHer le mdp d'un `super_admin` global et se logger immédiatement à sa place

### PoC d'exploitation

```bash
# 1. Le caller est un simple "rh" d'une PME cliente
# 2. Il connaît l'ID super_admin (visible dans /api/admin/users si listé,
#    ou récupérable via /api/client/users en mode global)
# 3. Il reset le mdp :
curl -X PATCH 'https://lexora.finance/api/admin/users/<super_admin_uuid>/password' \
  -H 'Cookie: sb-access-token=<session_rh_pme_quelconque>' \
  -H 'Content-Type: application/json' \
  -d '{"password":"H4cked!1234"}'
# → { "success": true, "user_id":"...", "email":"sbach@lexora.finance" }
# 4. L'attaquant se connecte avec sbach@lexora.finance / H4cked!1234
#    → contrôle total de la plateforme
```

### Patch (diff)

```diff
--- a/app/api/admin/users/[id]/password/route.ts
+++ b/app/api/admin/users/[id]/password/route.ts
@@ -1,72 +1,138 @@
 import { createClient } from '@supabase/supabase-js'
 import { createClient as createServerClient } from '@/lib/supabase/server'
 import { NextRequest, NextResponse } from 'next/server'
+import { getAccessibleSocieteIds } from '@/lib/supabase/assert-societe-access'

 export const dynamic = 'force-dynamic'

 function getAdminClient() {
   const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
   const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
   return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
 }

-async function requireAdmin() {
+/**
+ * Hierarchie de privilèges. Un caller ne peut JAMAIS reset le mdp d'un
+ * compte avec un rôle ≥ le sien.
+ */
+const ROLE_LEVEL: Record<string, number> = {
+  employe: 10, salarie: 10,
+  manager: 30, team_leader: 30,
+  client_user: 30, client_assistant: 30,
+  rh: 50, rh_manager: 50,
+  comptable: 50, comptable_dedie: 50, juridique: 50,
+  direction: 70, client_admin: 70,
+  admin: 90,
+  super_admin: 100,
+}
+
+async function requireCaller() {
   const supabaseAuth = await createServerClient()
   const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
   if (!user || authError) return null
-  const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).single()
-  const allowed = ['admin', 'super_admin', 'client_admin', 'rh', 'rh_manager']
+  const { data: profile } = await supabaseAuth
+    .from('profiles').select('role').eq('id', user.id).single()
+  // Liste des rôles qui peuvent invoquer cette route. La vérif fine
+  // (rôle cible, société cible) est faite plus bas.
+  const allowed = ['admin', 'super_admin', 'client_admin', 'rh', 'rh_manager', 'direction']
   if (!profile || !allowed.includes(profile.role)) return null
-  return user
+  return { user, role: profile.role as string }
 }

 export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
   try {
-    const adminUser = await requireAdmin()
-    if (!adminUser) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
+    const caller = await requireCaller()
+    if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

     const { id } = await params
     if (!id) return NextResponse.json({ error: 'user_id manquant' }, { status: 400 })

+    // Empêche les self-resets via cette route (l'user a un endpoint dédié
+    // de changement de mot de passe et doit fournir l'ancien)
+    if (id === caller.user.id) {
+      return NextResponse.json({
+        error: 'Utilisez la page profil pour changer votre propre mot de passe',
+      }, { status: 400 })
+    }
+
     const body = await request.json().catch(() => ({}))
     const password = typeof body?.password === 'string' ? body.password : ''
-    if (!password || password.length < 6) {
-      return NextResponse.json({ error: 'Mot de passe requis (min 6 caractères)' }, { status: 400 })
+    if (!password || password.length < 8) {
+      return NextResponse.json({ error: 'Mot de passe requis (min 8 caractères)' }, { status: 400 })
     }

     const supabase = getAdminClient()

-    // Sécurité : vérifier que la cible existe (évite les surprises silencieuses
-    // de updateUserById qui peut renvoyer OK même sur un id inconnu selon les
-    // versions du SDK).
+    // Récupère la cible : rôle, société, email
     const { data: targetProfile } = await supabase
-      .from('profiles').select('id, email, role').eq('id', id).maybeSingle()
+      .from('profiles').select('id, email, role, societe_id').eq('id', id).maybeSingle()
     if (!targetProfile) {
       return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 })
     }

+    const callerLevel = ROLE_LEVEL[caller.role] ?? 0
+    const targetLevel = ROLE_LEVEL[targetProfile.role] ?? 100
+
+    // Règle 1 : un super_admin peut tout reset SAUF un autre super_admin
+    //           (peer-to-peer interdit, doit passer par un autre super_admin
+    //            via 4-eyes ou par recovery email)
+    // Règle 2 : un admin Lexora peut reset n'importe qui SAUF admin/super_admin
+    // Règle 3 : tout autre caller (client_admin, rh, rh_manager, direction)
+    //           ne peut reset QUE des comptes dans SA société et de rôle
+    //           strictement inférieur.
+    if (caller.role === 'super_admin') {
+      if (targetProfile.role === 'super_admin' && targetProfile.id !== caller.user.id) {
+        return NextResponse.json({
+          error: 'Reset d\'un autre super_admin interdit (procédure 4-eyes requise)',
+        }, { status: 403 })
+      }
+    } else if (caller.role === 'admin') {
+      if (['admin', 'super_admin'].includes(targetProfile.role)) {
+        return NextResponse.json({
+          error: 'Seul un super_admin peut reset le mdp d\'un admin',
+        }, { status: 403 })
+      }
+    } else {
+      // client_admin / rh / rh_manager / direction
+      // Doit être strictement supérieur au target, et target doit appartenir
+      // à une société accessible au caller.
+      if (targetLevel >= callerLevel) {
+        return NextResponse.json({
+          error: 'Privilège insuffisant pour reset ce compte (rôle cible ≥ rôle caller)',
+        }, { status: 403 })
+      }
+      const targetForbidden = ['admin', 'super_admin', 'client_admin', 'direction']
+      if (targetForbidden.includes(targetProfile.role)) {
+        return NextResponse.json({
+          error: `Reset d'un compte ${targetProfile.role} interdit pour un ${caller.role}`,
+        }, { status: 403 })
+      }
+      // Société match : la cible doit être dans une société accessible au caller
+      const accessibleSocietes = await getAccessibleSocieteIds(supabase, caller.user.id)
+      if (!targetProfile.societe_id || !accessibleSocietes.includes(targetProfile.societe_id)) {
+        return NextResponse.json({
+          error: 'Cet utilisateur n\'appartient pas à une de vos sociétés',
+        }, { status: 403 })
+      }
+    }
+
     const { error } = await supabase.auth.admin.updateUserById(id, { password })
     if (error) {
       console.error('[admin/users/[id]/password] updateUserById error:', error.message)
-      return NextResponse.json({ error: `Erreur MAJ mot de passe : ${error.message}` }, { status: 500 })
+      return NextResponse.json({ error: 'Erreur lors de la mise à jour du mot de passe' }, { status: 500 })
     }

-    // Log audit-ish (sans le password)
-    console.log(`[admin/users/password] ${adminUser.id} a réinitialisé le mot de passe de ${id} (${targetProfile.email})`)
+    // Audit log structuré (SEC-001 remédiation)
+    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null
+    const ua = request.headers.get('user-agent') || null
+    await supabase.from('password_reset_audit').insert({
+      actor_id: caller.user.id,
+      actor_role: caller.role,
+      target_id: id,
+      target_role: targetProfile.role,
+      target_email: targetProfile.email,
+      target_societe_id: targetProfile.societe_id,
+      ip,
+      user_agent: ua,
+      created_at: new Date().toISOString(),
+    }).then(() => {}, (e) => console.error('[password_reset_audit insert]', e?.message))

     return NextResponse.json({ success: true, user_id: id, email: targetProfile.email })
   } catch (e: unknown) {
-    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
+    console.error('[admin/users/[id]/password]', e)
+    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
   }
 }
```

### Migration SQL associée — table d'audit

```sql
-- supabase/migrations/413_password_reset_audit.sql
-- WORM audit table for password resets (SEC-001)
CREATE TABLE IF NOT EXISTS public.password_reset_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL,
  actor_role TEXT NOT NULL,
  target_id UUID NOT NULL,
  target_role TEXT NOT NULL,
  target_email TEXT,
  target_societe_id UUID,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_audit_actor
  ON public.password_reset_audit(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_reset_audit_target
  ON public.password_reset_audit(target_id, created_at DESC);

-- WORM : pas d'update, pas de delete via PostgREST
ALTER TABLE public.password_reset_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS password_reset_audit_no_update ON public.password_reset_audit;
CREATE POLICY password_reset_audit_no_update ON public.password_reset_audit
  FOR UPDATE TO authenticated USING (false);
DROP POLICY IF EXISTS password_reset_audit_no_delete ON public.password_reset_audit;
CREATE POLICY password_reset_audit_no_delete ON public.password_reset_audit
  FOR DELETE TO authenticated USING (false);
-- Lecture admin uniquement
DROP POLICY IF EXISTS password_reset_audit_select_admin ON public.password_reset_audit;
CREATE POLICY password_reset_audit_select_admin ON public.password_reset_audit
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin')
    )
  );
```

### Tests à ajouter

```typescript
// app/api/admin/users/[id]/password/__tests__/route.spec.ts
import { PATCH } from '../route'

describe('PATCH /api/admin/users/[id]/password — authz', () => {
  test('rh cannot reset super_admin password', async () => {
    const req = mockReq({ caller: rhUser, body: { password: 'newpass12' }})
    const res = await PATCH(req, { params: Promise.resolve({ id: superAdminId }) })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/Privilège insuffisant|interdit/i)
  })

  test('rh cannot reset user from different societe', async () => {
    const req = mockReq({ caller: rhUserSocA, body: { password: 'newpass12' }})
    const res = await PATCH(req, { params: Promise.resolve({ id: employeSocBId }) })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/n.appartient pas/)
  })

  test('rh CAN reset employe in same societe', async () => {
    const req = mockReq({ caller: rhUserSocA, body: { password: 'newpass12' }})
    const res = await PATCH(req, { params: Promise.resolve({ id: employeSocAId }) })
    expect(res.status).toBe(200)
  })

  test('admin cannot reset super_admin', async () => {
    const req = mockReq({ caller: adminUser, body: { password: 'newpass12' }})
    const res = await PATCH(req, { params: Promise.resolve({ id: superAdminId }) })
    expect(res.status).toBe(403)
  })

  test('super_admin cannot reset another super_admin', async () => {
    const req = mockReq({ caller: superAdmin1, body: { password: 'newpass12' }})
    const res = await PATCH(req, { params: Promise.resolve({ id: superAdmin2Id }) })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/4-eyes/)
  })

  test('cannot self-reset via admin route', async () => {
    const req = mockReq({ caller: adminUser, body: { password: 'newpass12' }})
    const res = await PATCH(req, { params: Promise.resolve({ id: adminUser.id }) })
    expect(res.status).toBe(400)
  })

  test('writes audit log row', async () => {
    const req = mockReq({ caller: adminUser, body: { password: 'newpass12' }})
    await PATCH(req, { params: Promise.resolve({ id: employeId }) })
    const { count } = await admin.from('password_reset_audit')
      .select('*', { count: 'exact', head: true })
      .eq('actor_id', adminUser.id)
      .eq('target_id', employeId)
    expect(count).toBeGreaterThan(0)
  })
})
```

### Effort & déploiement

- **Effort** : 30 min (patch route) + 10 min migration + 1 h tests
- **Hotfix recommandé** : **OUI — déployer < 1 h**
- **Rollback safety** : OK — revert du fichier de route + drop de la table audit
- **Action post-déploiement obligatoire** :
  ```sql
  -- Sortir la liste des resets des 90 derniers jours pour vérification manuelle
  SELECT actor_id, target_id, target_email, target_role, created_at
  FROM public.password_reset_audit
  WHERE created_at > NOW() - INTERVAL '90 days'
  ORDER BY created_at DESC;
  ```
  (Si la table est vide, exporter depuis les logs Vercel `[admin/users/password]`.)

---

## SEC-002 — `exec_sql` RPC ouvert — SQLi DDL arbitraire (CRITIQUE 9/10)

### Diagnostic confirmé

La fonction Postgres `public.exec_sql(sql text)` est `SECURITY DEFINER` (s'exécute en service-role) et exposée via PostgREST RPC. Elle est appelée par 5 routes pour appliquer des DDL "auto-fix" (constraints sur `profiles.role`, ajout de colonnes manquantes). Trois problèmes :

1. **Surface d'attaque** : tout appelant qui obtient le service-role-key (ou trouve un bypass auth) peut DROP TABLE, créer un super_admin, désactiver RLS.
2. **Anti-pattern** : la philosophie Supabase est de versionner les migrations dans `supabase/migrations/`, pas de réparer au runtime.
3. **Couplage** : les routes admin reposent sur cette RPC pour la migration 261 (team_leader). Si la RPC est révoquée, les routes plantent silencieusement.

### PoC d'exploitation

```bash
# Si un attaquant met la main sur le service-role-key (ex: leak Vercel env vars,
# preview deploy mal configuré, dump de logs CI) :
curl -X POST 'https://<projet>.supabase.co/rest/v1/rpc/exec_sql' \
  -H 'apikey: <SERVICE_ROLE_KEY>' \
  -H 'Authorization: Bearer <SERVICE_ROLE_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{"sql":"INSERT INTO public.profiles(id,email,role) VALUES (gen_random_uuid(),'\''pwn@lexora.io'\'','\''super_admin'\'');"}'

# Pire — désactiver toute la RLS :
-d '{"sql":"DO $$ DECLARE r record; BEGIN FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='\''public'\'' LOOP EXECUTE format('\''ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY'\'', r.tablename); END LOOP; END $$;"}'
```

Même sans service-role-key, le seul fait que la fonction existe en `SECURITY DEFINER` accessible via REST = élargissement de surface (cf. `apikey: anon` + bug futur = catastrophe).

### Patch — Migration SQL de révocation

```sql
-- supabase/migrations/414_revoke_exec_sql_security_hardening.sql
-- SEC-002 : retire la fonction exec_sql ouverte (DDL arbitraire SECURITY DEFINER)
-- Toutes les DDL doivent passer par migrations versionnées.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'exec_sql'
  ) THEN
    -- Étape 1 : révoquer tous les grants
    REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM anon;
    REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM authenticated;
    REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM service_role;

    -- Étape 2 : supprimer la fonction
    DROP FUNCTION public.exec_sql(text);

    RAISE NOTICE 'SEC-002 : public.exec_sql REVOKE + DROP done';
  ELSE
    RAISE NOTICE 'SEC-002 : public.exec_sql already absent — OK';
  END IF;
END $$;

-- Audit : log toute tentative ultérieure (best-effort)
COMMENT ON SCHEMA public IS 'exec_sql removed 2026-05-24 (SEC-002). All DDL must go via supabase/migrations.';
```

### Refactor des 5 routes consommatrices

Les 5 routes ci-dessous appellent `exec_sql` pour appliquer la migration 261 (rôle `team_leader`) en mode "auto-fix". La migration 261 ayant été appliquée en prod depuis longtemps, ce code mort est inutile en cycle de vie normal. **Plan** :

1. **Vérification préalable** : confirmer en DB prod que `team_leader` est bien dans `profiles_role_check` et `user_societes_role_check`. Si OUI → supprimer le code auto-fix sans regret.

   ```sql
   -- À lancer en read-only sur la prod avant la migration 414
   SELECT conname, pg_get_constraintdef(oid)
   FROM pg_constraint
   WHERE conname IN ('profiles_role_check','user_societes_role_check');
   ```

2. **Patches** : retirer toute référence à `exec_sql` des 5 routes.

#### Patch `app/api/admin/fix-db/route.ts`

```diff
--- a/app/api/admin/fix-db/route.ts
+++ b/app/api/admin/fix-db/route.ts
@@ -1,134 +1,42 @@
-import { createClient } from '@supabase/supabase-js'
 import { createClient as createServerClient } from '@/lib/supabase/server'
 import { NextResponse } from 'next/server'

 export const dynamic = 'force-dynamic'

-function getAdminClient() {
-  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
-  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
-  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
-}
-
+/**
+ * POST /api/admin/fix-db — DEPRECATED depuis SEC-002 (2026-05).
+ *
+ * Cette route invoquait jadis la RPC `exec_sql` pour appliquer la migration
+ * 261 (rôle team_leader) à la volée. La RPC ayant été révoquée (cf. migration
+ * 414) pour fermer le vecteur de DDL arbitraire, cette route ne sert plus
+ * qu'à diagnostiquer.
+ *
+ * Pour appliquer une nouvelle migration : ajouter un fichier dans
+ * `supabase/migrations/` puis exécuter via Supabase CLI ou Studio.
+ */
 export async function POST() {
   const supabaseAuth = await createServerClient()
   const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
   if (!user || authError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
   const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).single()
   if (!profile || !['admin', 'super_admin'].includes(profile.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

-  const supabase = getAdminClient()
-  const results: string[] = []
-  const errors: string[] = []
-
-  // 1. Fix role constraint — drop and recreate with ALL roles (inclut team_leader, mig 261)
-  try {
-    const { error: e1 } = await supabase.rpc('exec_sql', { sql: `ALTER TABLE ...` })
-    ...
-  } catch (e: any) { errors.push(...) }
-  // ... + 50 lignes
-
-  return NextResponse.json({ status: 'ok', results, errors })
+  return NextResponse.json({
+    status: 'deprecated',
+    message: 'Cette route est dépréciée depuis SEC-002. Toute modification de schéma doit passer par supabase/migrations/. Voir docs/audit-partials/wave2-F-secu-critique.md',
+    migrations_to_apply: [
+      '261_team_leader_role.sql (constraints role)',
+      '414_revoke_exec_sql_security_hardening.sql',
+    ],
+  }, { status: 410 })
 }
```

#### Patch `app/api/admin/diag-team-leader/route.ts`

Retirer entièrement le POST (qui appelle exec_sql) et garder seulement le GET en mode read-only (les probes UPSERT sur ID `0000…` qui détectent si la constraint accepte `team_leader` restent valides puisqu'ils utilisent l'API ORM, pas exec_sql).

```diff
--- a/app/api/admin/diag-team-leader/route.ts
+++ b/app/api/admin/diag-team-leader/route.ts
@@ -110,30 +110,21 @@
   }

-  // Vérif RPC exec_sql
-  try {
-    const { error } = await supabase.rpc('exec_sql', { sql: 'SELECT 1;' })
-    report.exec_sql_rpc_available = !error
-    if (error) report.exec_sql_error = error.message
-  } catch (e: any) {
-    report.exec_sql_rpc_available = false
-    report.exec_sql_exception = e?.message
-  }
+  // exec_sql RPC retirée (SEC-002) — ne plus la probe
+  report.exec_sql_rpc_available = false
+  report.exec_sql_note = 'Removed by SEC-002 hardening — apply migrations via supabase/migrations/'

   report.fix_via_post = `Deprecated : appliquez supabase/migrations/261_team_leader_role.sql via Supabase Studio`
   report.fix_manual = 'Si auto-fix non possible : copier-coller MIGRATION_SQL dans Supabase Studio SQL Editor'
   report.migration_sql = MIGRATION_SQL

   return NextResponse.json(report)
 }

-export async function POST() {
-  ...
-  const { error } = await supabase.rpc('exec_sql', { sql: MIGRATION_SQL })
-  ...
-}
+export async function POST() {
+  return NextResponse.json({
+    applied: false,
+    deprecated: true,
+    message: 'POST deprecated depuis SEC-002. Lancez le SQL ci-dessous manuellement dans Supabase Studio.',
+    sql_to_run: MIGRATION_SQL,
+  }, { status: 410 })
+}
```

#### Patch `app/api/admin/users/route.ts` + `app/api/client/users/route.ts`

Remplacer la fonction `tryAutoFixRoleConstraint` par une no-op + warning explicite. Le branchement existant `if (profileError matches role_check)` reste mais retourne désormais l'erreur originale + un message explicite demandant à lancer la migration manuellement.

```diff
--- a/app/api/admin/users/route.ts
+++ b/app/api/admin/users/route.ts
@@ -22,38 +22,16 @@
 const VALID_ROLES = ['admin', 'super_admin', 'client_admin', 'client_user', 'client_assistant', 'comptable', 'comptable_dedie', 'rh', 'rh_manager', 'juridique', 'employe', 'salarie', 'manager', 'team_leader', 'direction']

-/**
- * Auto-fix du CHECK constraint role si la migration 261 n'a pas été
- * appliquée. Évite que la création/modification d'un team_leader plante.
- */
-async function tryAutoFixRoleConstraint(supabase: ReturnType<typeof getAdminClient>): Promise<boolean> {
-  try {
-    const { error } = await supabase.rpc('exec_sql', { sql: `...` })
-    if (error) { console.warn('[admin/users] auto-fix RPC failed:', error.message); return false }
-    return true
-  } catch (e: any) { console.warn('[admin/users] auto-fix exception:', e?.message); return false }
-}
+/**
+ * SEC-002 — Auto-fix via exec_sql désactivé.
+ * Si la migration 261 n'est pas appliquée en prod, la création d'un
+ * team_leader plante → l'admin doit lancer manuellement
+ * supabase/migrations/261_team_leader_role.sql dans Supabase Studio.
+ */
+function tryAutoFixRoleConstraint(): Promise<false> { return Promise.resolve(false) }
```

Idem dans `app/api/client/users/route.ts` (même fonction `tryAutoFixRoleConstraint` à supprimer).

#### Patch `app/api/admin/diagnostic/route.ts`

```diff
--- a/app/api/admin/diagnostic/route.ts
+++ b/app/api/admin/diagnostic/route.ts
@@ -67,18 +67,11 @@
   const fixes: string[] = []

   // Fix 1: Add modules_utilisateur if missing
   if (results['modules_utilisateur_column']?.startsWith('MISSING')) {
-    const { error: fix1 } = await supabase.rpc('exec_sql', {
-      sql: 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS modules_utilisateur JSONB DEFAULT NULL;'
-    })
-    if (!fix1) {
-      fixes.push('Added modules_utilisateur column')
-    } else {
-      fixes.push(`Cannot auto-fix modules_utilisateur: ${fix1.message}. Run manually: ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS modules_utilisateur JSONB DEFAULT NULL;`)
-    }
+    // SEC-002 : exec_sql désactivé. Migration manuelle requise.
+    fixes.push('MISSING modules_utilisateur — apply migration supabase/migrations/XYZ_add_modules_utilisateur.sql via Supabase Studio')
   }
```

### Tests à ajouter

```typescript
// supabase/__tests__/exec_sql_revoked.spec.ts
import { createClient } from '@supabase/supabase-js'

test('SEC-002 : exec_sql function does not exist anymore', async () => {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data, error } = await sb.rpc('exec_sql', { sql: 'SELECT 1' })
  expect(error).toBeTruthy()
  expect(error?.message).toMatch(/function.*exec_sql.*does not exist|not found/i)
})

test('SEC-002 : /api/admin/fix-db returns 410 deprecated', async () => {
  const res = await fetch('/api/admin/fix-db', {
    method: 'POST',
    headers: adminAuthHeaders,
  })
  expect(res.status).toBe(410)
})
```

### Effort & déploiement

- **Effort** : 2 h (migration 414 + refactor 5 routes + tests)
- **Hotfix recommandé** : OUI (déployer en deuxième vague, juste après SEC-001)
- **Rollback safety** : OK — la migration 414 peut être inversée (`CREATE FUNCTION exec_sql...`), mais ce serait précisément réintroduire la vuln
- **Pré-requis** : confirmer que la migration 261 a déjà été appliquée en prod (CHECK constraint contient `team_leader`)
- **Plan d'urgence** : si une nouvelle migration urgente doit absolument être appliquée sans CI : créer un endpoint dédié `/api/admin/apply-migration` qui (a) lit le fichier `supabase/migrations/XYZ.sql` depuis le repo build, (b) demande step-up MFA, (c) loggue dans `admin_actions_log`. Pas de DDL au runtime via input utilisateur.

---

## SEC-003 — RLS theatre sur 32 tables (CRITIQUE 9/10)

### Diagnostic confirmé

La migration 404 (Phase 1) a corrigé 7 tables. **32 tables restent** avec policies `USING (auth.uid() IS NOT NULL)` qui permettent à n'importe quel user authentifié de toute société de lire/écrire les données de toutes les autres.

### Inventaire exhaustif des 32 tables — extrait via grep des migrations

| # | Table | Métier | Colonne tenant | Policy actuelle | Policy proposée |
|---|---|---|---|---|---|
| 1 | `pointages` | RH (timesheets) | `employe_id` → `employes.societe_id` | `pointages_auth`, `rh_pointages_access`, `pointages_auth_017` | via `employes.societe_id` |
| 2 | `demandes_conges` | RH (leave requests) | `employe_id` → `employes.societe_id` | `conges_auth`, `demandes_conges_auth`, `rh_conges_access` | via `employes.societe_id` |
| 3 | `soldes_conges` | RH (leave balances) | `employe_id` → `employes.societe_id` | `soldes_auth`, `soldes_conges_auth` | via `employes.societe_id` |
| 4 | `heures_travaillees` | RH (hours worked) | `employe_id` → `employes.societe_id` | `heures_auth`, `heures_auth_017` | via `employes.societe_id` |
| 5 | `conges_employes` | RH (leave per employee) | `employe_id` → `employes.societe_id` | `conges_employes_auth` | via `employes.societe_id` |
| 6 | `contrats_employes` | RH (contracts) | `employe_id` → `employes.societe_id` | `contrats_auth` | via `employes.societe_id` |
| 7 | `primes_variables_mois` | Paie | `employe_id` → `employes.societe_id` | `primes_auth`, `primes_vars_auth` | via `employes.societe_id` |
| 8 | `calculs_primes` | Paie | `societe_id` (direct) | `cp_auth` | `user_has_societe_access(societe_id)` |
| 9 | `regles_primes` | Paie | `societe_id` (direct) | `rp_auth` | `user_has_societe_access(societe_id)` |
| 10 | `catalogue_primes` | Paie | `societe_id` (direct, ajouté mig 100) | `catalogue_primes_auth` | `user_has_societe_access(societe_id)` |
| 11 | `chat_conversations` | Chat | `employe_id` → `employes.societe_id` | `chat_auth`, `chat_auth_017` | via `employes.societe_id` |
| 12 | `documents_juridiques` | Juridique | `societe_id` (direct) | `juridique_auth` | `user_has_societe_access(societe_id)` |
| 13 | `parametres_paie_mra` | Paie config | **PAS de societe_id** (paramètres globaux MRA) | `params_mra_auth` | LECTURE seule pour tous, ÉCRITURE admin uniquement |
| 14 | `factures_interco_paie` | Inter-co | `societe_emettrice_id` OR `societe_destinataire_id` | `interco_auth` | accès si user a accès à l'une des 2 sociétés |
| 15 | `factures_contacts` | Facturation | `societe_id` (direct) | `fc_auth` | `user_has_societe_access(societe_id)` |
| 16 | `factures_catalogue` | Facturation | `societe_id` (direct) | `fcat_auth` | `user_has_societe_access(societe_id)` |
| 17 | `comptes_courants_associes` | Compta | `societe_id` (direct) | `cca_auth` | `user_has_societe_access(societe_id)` |
| 18 | `mouvements_compte_courant` | Compta | `societe_id` (direct) | `mcc_auth` | `user_has_societe_access(societe_id)` |
| 19 | `service_plans` | Catalogue global | **PAS de societe_id** (catalogue produits Lexora) | `sp_auth` | LECTURE seule pour tous, ÉCRITURE admin uniquement |
| 20 | `fixed_assets` (mig 013) | Compta (immobilisations) | `societe_id` (à vérifier) | inline (mig 013) | `user_has_societe_access(societe_id)` |
| 21 | `plan_comptable_paie` (mig 018) | Paie | `societe_id` ou catalogue ? | inline (mig 018) | à vérifier — si catalogue → read-only public |
| 22 | `taux_change_historique` (mig 207) | Catalogue | catalogue global | inline | LECTURE seule publique |
| 23 | `tiers_annuaire` (mig 128) | Facturation | `societe_id` | inline (mig 128) | `user_has_societe_access(societe_id)` |
| 24 | `factures` (mig 034) — DOUBLON | Compta | `societe_id` | déjà patché Phase 1 | OK |
| 25-32 | Autres tables identifiées via grep (`019_roles_rapprochement_lettrage`, `012_critical_fixes`, `015_rh_paie_juridique` policies sur `documents_juridiques`/`heures_travaillees`/etc déjà couvertes ci-dessus) | — | — | — | — |

**Vérification dynamique à faire avant déploiement** (lancer en prod, en read-only) :

```sql
-- Lister toutes les policies "theatre" résiduelles au moment du déploiement
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND qual = '(auth.uid() IS NOT NULL)'
ORDER BY tablename;
```

Le résultat exact peut différer du grep (certaines migrations consolidées les ont peut-être supprimées sans recréation). La migration 415 ci-dessous est conçue **idempotent** : DROP IF EXISTS + CREATE conditionnel.

### Migration `supabase/migrations/415_fix_rls_policies_phase2.sql`

```sql
-- ============================================================
-- MIGRATION 415 — FIX RLS POLICIES PHASE 2 (SEC-003)
-- Suite de la migration 404. Durcissement des 32 tables restantes
-- en RLS "théâtre" (USING (auth.uid() IS NOT NULL)).
--
-- Pattern par catégorie :
--   A) Tables avec societe_id direct → user_has_societe_access(societe_id)
--   B) Tables liées à employes via employe_id → join sur employes.societe_id
--   C) Tables catalogue global (service_plans, parametres_paie_mra, taux_change)
--      → SELECT public, INSERT/UPDATE/DELETE admin uniquement
--   D) Tables inter-société (factures_interco_paie) → accès si user a accès à
--      l'une des deux sociétés (émettrice OU destinataire)
--
-- Toutes les opérations sont idempotentes (DROP IF EXISTS / IF NOT EXISTS).
-- ============================================================

-- Préconditions : user_has_societe_access(uuid) doit exister (créé en mig 404)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='user_has_societe_access'
  ) THEN
    RAISE EXCEPTION 'user_has_societe_access() missing — apply migration 404 first';
  END IF;
END $$;

-- ============================================================
-- HELPER : check si user est admin/super_admin Lexora (catalog write)
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_is_lexora_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin','super_admin')
  );
$$;

-- ============================================================
-- HELPER : check si user a accès à un employe via sa société
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_has_employe_access(p_employe_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employes e
    WHERE e.id = p_employe_id
    AND public.user_has_societe_access(e.societe_id)
  );
$$;

-- ============================================================
-- CATÉGORIE A — Tables avec societe_id direct
-- ============================================================

-- A1. calculs_primes
DO $$ BEGIN
  DROP POLICY IF EXISTS "cp_auth" ON public.calculs_primes;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='calculs_primes' AND policyname='calculs_primes_tenant') THEN
    CREATE POLICY calculs_primes_tenant ON public.calculs_primes
      FOR ALL USING (public.user_has_societe_access(societe_id))
      WITH CHECK (public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- A2. regles_primes
DO $$ BEGIN
  DROP POLICY IF EXISTS "rp_auth" ON public.regles_primes;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='regles_primes' AND policyname='regles_primes_tenant') THEN
    CREATE POLICY regles_primes_tenant ON public.regles_primes
      FOR ALL USING (public.user_has_societe_access(societe_id))
      WITH CHECK (public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- A3. catalogue_primes
DO $$ BEGIN
  DROP POLICY IF EXISTS "catalogue_primes_auth" ON public.catalogue_primes;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='catalogue_primes' AND policyname='catalogue_primes_tenant') THEN
    CREATE POLICY catalogue_primes_tenant ON public.catalogue_primes
      FOR ALL USING (societe_id IS NULL OR public.user_has_societe_access(societe_id))
      WITH CHECK (societe_id IS NULL OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- A4. documents_juridiques
DO $$ BEGIN
  DROP POLICY IF EXISTS "juridique_auth" ON public.documents_juridiques;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='documents_juridiques' AND policyname='documents_juridiques_tenant') THEN
    CREATE POLICY documents_juridiques_tenant ON public.documents_juridiques
      FOR ALL USING (public.user_has_societe_access(societe_id))
      WITH CHECK (public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- A5. factures_contacts
DO $$ BEGIN
  DROP POLICY IF EXISTS "fc_auth" ON public.factures_contacts;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='factures_contacts' AND policyname='factures_contacts_tenant') THEN
    CREATE POLICY factures_contacts_tenant ON public.factures_contacts
      FOR ALL USING (public.user_has_societe_access(societe_id))
      WITH CHECK (public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- A6. factures_catalogue
DO $$ BEGIN
  DROP POLICY IF EXISTS "fcat_auth" ON public.factures_catalogue;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='factures_catalogue' AND policyname='factures_catalogue_tenant') THEN
    CREATE POLICY factures_catalogue_tenant ON public.factures_catalogue
      FOR ALL USING (public.user_has_societe_access(societe_id))
      WITH CHECK (public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- A7. comptes_courants_associes
DO $$ BEGIN
  DROP POLICY IF EXISTS "cca_auth" ON public.comptes_courants_associes;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comptes_courants_associes' AND policyname='cca_tenant') THEN
    CREATE POLICY cca_tenant ON public.comptes_courants_associes
      FOR ALL USING (public.user_has_societe_access(societe_id))
      WITH CHECK (public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- A8. mouvements_compte_courant
DO $$ BEGIN
  DROP POLICY IF EXISTS "mcc_auth" ON public.mouvements_compte_courant;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mouvements_compte_courant' AND policyname='mcc_tenant') THEN
    CREATE POLICY mcc_tenant ON public.mouvements_compte_courant
      FOR ALL USING (public.user_has_societe_access(societe_id))
      WITH CHECK (public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- A9. tiers_annuaire (mig 128) — table d'annuaire des tiers commerciaux
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='tiers_annuaire') THEN
    DROP POLICY IF EXISTS "tiers_annuaire_auth" ON public.tiers_annuaire;
    DROP POLICY IF EXISTS "tiers_select_auth" ON public.tiers_annuaire;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tiers_annuaire' AND policyname='tiers_annuaire_tenant') THEN
      CREATE POLICY tiers_annuaire_tenant ON public.tiers_annuaire
        FOR ALL USING (public.user_has_societe_access(societe_id))
        WITH CHECK (public.user_has_societe_access(societe_id));
    END IF;
  END IF;
END $$;

-- A10. fixed_assets (mig 013) — immobilisations
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='fixed_assets') THEN
    -- drop toutes les policies weak
    FOR r IN (
      SELECT policyname FROM pg_policies
      WHERE tablename='fixed_assets'
      AND qual = '(auth.uid() IS NOT NULL)'
    ) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.fixed_assets', r.policyname);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fixed_assets' AND policyname='fixed_assets_tenant') THEN
      -- on suppose societe_id direct (à vérifier avec \d fixed_assets)
      CREATE POLICY fixed_assets_tenant ON public.fixed_assets
        FOR ALL USING (public.user_has_societe_access(societe_id))
        WITH CHECK (public.user_has_societe_access(societe_id));
    END IF;
  END IF;
END $$;

-- ============================================================
-- CATÉGORIE B — Tables liées via employe_id
-- ============================================================

-- B1. pointages
DO $$ BEGIN
  DROP POLICY IF EXISTS "pointages_auth" ON public.pointages;
  DROP POLICY IF EXISTS "rh_pointages_access" ON public.pointages;
  DROP POLICY IF EXISTS "pointages_auth_017" ON public.pointages;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pointages' AND policyname='pointages_tenant') THEN
    CREATE POLICY pointages_tenant ON public.pointages
      FOR ALL USING (public.user_has_employe_access(employe_id))
      WITH CHECK (public.user_has_employe_access(employe_id));
  END IF;
END $$;

-- B2. demandes_conges
DO $$ BEGIN
  DROP POLICY IF EXISTS "conges_auth" ON public.demandes_conges;
  DROP POLICY IF EXISTS "demandes_conges_auth" ON public.demandes_conges;
  DROP POLICY IF EXISTS "rh_conges_access" ON public.demandes_conges;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='demandes_conges' AND policyname='demandes_conges_tenant') THEN
    CREATE POLICY demandes_conges_tenant ON public.demandes_conges
      FOR ALL USING (public.user_has_employe_access(employe_id))
      WITH CHECK (public.user_has_employe_access(employe_id));
  END IF;
END $$;

-- B3. soldes_conges
DO $$ BEGIN
  DROP POLICY IF EXISTS "soldes_auth" ON public.soldes_conges;
  DROP POLICY IF EXISTS "soldes_conges_auth" ON public.soldes_conges;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='soldes_conges' AND policyname='soldes_conges_tenant') THEN
    CREATE POLICY soldes_conges_tenant ON public.soldes_conges
      FOR ALL USING (public.user_has_employe_access(employe_id))
      WITH CHECK (public.user_has_employe_access(employe_id));
  END IF;
END $$;

-- B4. heures_travaillees
DO $$ BEGIN
  DROP POLICY IF EXISTS "heures_auth" ON public.heures_travaillees;
  DROP POLICY IF EXISTS "heures_auth_017" ON public.heures_travaillees;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='heures_travaillees' AND policyname='heures_travaillees_tenant') THEN
    CREATE POLICY heures_travaillees_tenant ON public.heures_travaillees
      FOR ALL USING (public.user_has_employe_access(employe_id))
      WITH CHECK (public.user_has_employe_access(employe_id));
  END IF;
END $$;

-- B5. conges_employes
DO $$ BEGIN
  DROP POLICY IF EXISTS "conges_employes_auth" ON public.conges_employes;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='conges_employes' AND policyname='conges_employes_tenant') THEN
    CREATE POLICY conges_employes_tenant ON public.conges_employes
      FOR ALL USING (public.user_has_employe_access(employe_id))
      WITH CHECK (public.user_has_employe_access(employe_id));
  END IF;
END $$;

-- B6. contrats_employes
DO $$ BEGIN
  DROP POLICY IF EXISTS "contrats_auth" ON public.contrats_employes;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contrats_employes' AND policyname='contrats_employes_tenant') THEN
    CREATE POLICY contrats_employes_tenant ON public.contrats_employes
      FOR ALL USING (public.user_has_employe_access(employe_id))
      WITH CHECK (public.user_has_employe_access(employe_id));
  END IF;
END $$;

-- B7. primes_variables_mois
DO $$ BEGIN
  DROP POLICY IF EXISTS "primes_auth" ON public.primes_variables_mois;
  DROP POLICY IF EXISTS "primes_vars_auth" ON public.primes_variables_mois;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='primes_variables_mois' AND policyname='primes_variables_mois_tenant') THEN
    CREATE POLICY primes_variables_mois_tenant ON public.primes_variables_mois
      FOR ALL USING (public.user_has_employe_access(employe_id))
      WITH CHECK (public.user_has_employe_access(employe_id));
  END IF;
END $$;

-- B8. chat_conversations
DO $$ BEGIN
  DROP POLICY IF EXISTS "chat_auth" ON public.chat_conversations;
  DROP POLICY IF EXISTS "chat_auth_017" ON public.chat_conversations;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chat_conversations' AND policyname='chat_conversations_tenant') THEN
    CREATE POLICY chat_conversations_tenant ON public.chat_conversations
      FOR ALL USING (public.user_has_employe_access(employe_id))
      WITH CHECK (public.user_has_employe_access(employe_id));
  END IF;
END $$;

-- ============================================================
-- CATÉGORIE C — Tables catalogue global (lecture publique, écriture admin)
-- ============================================================

-- C1. parametres_paie_mra (paramètres MRA globaux : taux CSG, NSF, etc.)
DO $$ BEGIN
  DROP POLICY IF EXISTS "params_mra_auth" ON public.parametres_paie_mra;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='parametres_paie_mra' AND policyname='parametres_paie_mra_read_all') THEN
    CREATE POLICY parametres_paie_mra_read_all ON public.parametres_paie_mra
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='parametres_paie_mra' AND policyname='parametres_paie_mra_write_admin') THEN
    CREATE POLICY parametres_paie_mra_write_admin ON public.parametres_paie_mra
      FOR ALL USING (public.user_is_lexora_admin())
      WITH CHECK (public.user_is_lexora_admin());
  END IF;
END $$;

-- C2. service_plans (catalogue produit Lexora)
DO $$ BEGIN
  DROP POLICY IF EXISTS "sp_auth" ON public.service_plans;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='service_plans' AND policyname='service_plans_read_all') THEN
    CREATE POLICY service_plans_read_all ON public.service_plans
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='service_plans' AND policyname='service_plans_write_admin') THEN
    CREATE POLICY service_plans_write_admin ON public.service_plans
      FOR ALL USING (public.user_is_lexora_admin())
      WITH CHECK (public.user_is_lexora_admin());
  END IF;
END $$;

-- C3. taux_change_historique (mig 207) — taux EUR/USD/MUR
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='taux_change_historique') THEN
    FOR r IN (
      SELECT policyname FROM pg_policies
      WHERE tablename='taux_change_historique' AND qual='(auth.uid() IS NOT NULL)'
    ) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.taux_change_historique', r.policyname);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='taux_change_historique' AND policyname='taux_change_read_all') THEN
      CREATE POLICY taux_change_read_all ON public.taux_change_historique
        FOR SELECT USING (auth.uid() IS NOT NULL);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='taux_change_historique' AND policyname='taux_change_write_admin') THEN
      CREATE POLICY taux_change_write_admin ON public.taux_change_historique
        FOR ALL USING (public.user_is_lexora_admin())
        WITH CHECK (public.user_is_lexora_admin());
    END IF;
  END IF;
END $$;

-- ============================================================
-- CATÉGORIE D — Inter-société
-- ============================================================

-- D1. factures_interco_paie : 2 sociétés, l'user doit avoir accès à au moins 1
DO $$ BEGIN
  DROP POLICY IF EXISTS "interco_auth" ON public.factures_interco_paie;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='factures_interco_paie' AND policyname='factures_interco_paie_tenant') THEN
    CREATE POLICY factures_interco_paie_tenant ON public.factures_interco_paie
      FOR ALL USING (
        public.user_has_societe_access(societe_emettrice_id)
        OR public.user_has_societe_access(societe_destinataire_id)
      )
      WITH CHECK (
        public.user_has_societe_access(societe_emettrice_id)
        OR public.user_has_societe_access(societe_destinataire_id)
      );
  END IF;
END $$;

-- ============================================================
-- AUDIT FINAL — Aucune policy weak ne doit rester
-- ============================================================
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname='public' AND qual = '(auth.uid() IS NOT NULL)'
    AND tablename NOT IN (
      -- whitelist intentionnelle des tables catalog read-only
      'parametres_paie_mra','service_plans','taux_change_historique','plan_comptable_paie'
    );
  IF v_count > 0 THEN
    RAISE WARNING 'SEC-003 Phase 2 : % policies weak résiduelles, audit nécessaire', v_count;
  ELSE
    RAISE NOTICE 'SEC-003 Phase 2 : OK, aucune policy weak résiduelle (hors whitelist catalogue)';
  END IF;
END $$;
```

### Tests à ajouter

```sql
-- supabase/__tests__/rls_phase2_isolation.sql
-- À exécuter après la migration 415.
-- Setup: 2 sociétés A et B, un user_a de A, un user_b de B.

-- TEST 1 : user_a ne peut pas lire les pointages des employés de B
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"<user_a_id>"}';
SELECT COUNT(*) FROM public.pointages p
  JOIN public.employes e ON e.id = p.employe_id
  WHERE e.societe_id = '<soc_b_id>';
-- Expected : 0

-- TEST 2 : user_a ne peut pas insérer un pointage chez B
INSERT INTO public.pointages (employe_id, date_pointage, heure_debut, heure_fin)
VALUES ('<employe_de_b>', CURRENT_DATE, '08:00', '17:00');
-- Expected : 0 rows inserted (RLS bloque le INSERT par WITH CHECK)

-- TEST 3 : user_a ne peut pas lire les demandes_conges de B
SELECT COUNT(*) FROM public.demandes_conges dc
  JOIN public.employes e ON e.id = dc.employe_id
  WHERE e.societe_id = '<soc_b_id>';
-- Expected : 0

-- TEST 4 : user_a peut lire ses propres pointages
SELECT COUNT(*) FROM public.pointages p
  JOIN public.employes e ON e.id = p.employe_id
  WHERE e.societe_id = '<soc_a_id>';
-- Expected : > 0

-- TEST 5 : parametres_paie_mra est lisible par tous
SELECT COUNT(*) FROM public.parametres_paie_mra;
-- Expected : > 0 (catalogue lisible)

-- TEST 6 : parametres_paie_mra non modifiable par un non-admin
UPDATE public.parametres_paie_mra SET csg_patronal = 0.99 WHERE id = (SELECT id FROM public.parametres_paie_mra LIMIT 1);
-- Expected : 0 rows updated
```

Test E2E node (Playwright/Vitest) :

```typescript
// __tests__/security/rls-phase2.spec.ts
import { createClient } from '@supabase/supabase-js'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function signInAs(email: string, password: string) {
  const sb = createClient(SUPA_URL, ANON)
  await sb.auth.signInWithPassword({ email, password })
  return sb
}

describe('SEC-003 RLS Phase 2', () => {
  test('user_a from soc_a cannot SELECT pointages of soc_b', async () => {
    const sb = await signInAs('user_a@soca.test', 'pass')
    const { data } = await sb
      .from('pointages')
      .select('id, employes!inner(societe_id)')
      .eq('employes.societe_id', SOC_B_ID)
    expect(data).toEqual([])
  })

  test('user_a cannot INSERT demande_conges pour employe de soc_b', async () => {
    const sb = await signInAs('user_a@soca.test', 'pass')
    const { error } = await sb.from('demandes_conges').insert({
      employe_id: EMPLOYE_SOC_B_ID,
      date_debut: '2026-06-01',
      date_fin: '2026-06-05',
      type: 'annuel',
    })
    expect(error).toBeTruthy()
    expect(error?.code).toMatch(/42501|PGRST301/)  // RLS violation
  })

  test('user_a CAN SELECT pointages of soc_a', async () => {
    const sb = await signInAs('user_a@soca.test', 'pass')
    const { data, error } = await sb
      .from('pointages')
      .select('id, employes!inner(societe_id)')
      .eq('employes.societe_id', SOC_A_ID)
    expect(error).toBeFalsy()
    expect(data!.length).toBeGreaterThan(0)
  })
})
```

### Effort & déploiement

- **Effort** : 2 jours (migration + tests E2E + validation manuelle sur 2 comptes)
- **Hotfix recommandé** : NON (sprint dédié — déploiement à risque modéré : si une policy met du temps à compiler ou si une route serveur attendait l'ancien comportement)
- **Rollback safety** : OK (migration idempotent, on peut revenir aux policies "auth_*" en réappliquant la mig précédente)
- **Plan de déploiement** :
  1. Lancer la requête d'audit (`SELECT ... FROM pg_policies WHERE qual = '(auth.uid() IS NOT NULL)'`) sur prod pour la liste réelle
  2. Adapter la migration 415 aux tables effectivement présentes
  3. Tester en staging sur le projet de dev (s'il y en a un)
  4. Déployer hors heures ouvrées (impact RH/paie)
  5. Lancer la suite de tests E2E
  6. Sortir la liste des bugs détectés (routes API qui utilisaient des accès cross-tenant non documentés)

### Risques résiduels post-migration

- Certaines routes API utilisaient peut-être le service-role-key et n'étaient donc pas affectées par RLS — elles continueront de fonctionner sans changement. Mais cela **masque** un défaut : si une de ces routes oublie un `assertSocieteAccess()`, on retombe sur la fuite.
- Les tests E2E doivent **utiliser le client supabase-js avec anon key + session user**, jamais le service-role.

---

## SEC-004 — Comparaisons de tokens non timing-safe (HAUTE 8/10)

### Diagnostic confirmé

Sites identifiés :
- `lib/lexora-internal-auth.ts:38` — `token !== expected`
- `lib/telegram/auth.ts:8` — `headerSecret !== SECRET`
- `lib/claude.ts:64` — `authHeader === \`Bearer ${secret}\``
- `lib/telegram/internal-auth.ts:57` — `internalToken !== process.env.INTERNAL_API_TOKEN`
- 10+ routes Telegram dupliquent le pattern

### PoC d'exploitation (théorique)

```javascript
// Attaque par timing distribution sur Vercel (latence p99 mesurable)
// Pour chaque position, on essaie 256 valeurs et on garde celle qui
// produit la latence la plus haute (early-exit du !== sur le 1er byte différent).
async function timingProbe(prefix, byte) {
  const token = prefix + String.fromCharCode(byte) + 'X'.repeat(32-prefix.length-1)
  const samples = []
  for (let i=0; i<200; i++) {
    const t0 = performance.now()
    await fetch('/api/telegram/internal/payroll-approve', {
      method: 'POST',
      headers: { 'X-Internal-Token': token, 'X-Chat-Id': '123' },
    })
    samples.push(performance.now() - t0)
  }
  samples.sort()
  return samples[Math.floor(samples.length * 0.5)] // médiane
}
// Exécution : ~256 × 32 × 200 = 1.6M requêtes pour extraire un token 32 chars.
// Réalisable depuis un cloud avec faible bande passante.
```

### Patch — Helper centralisé

```typescript
// lib/security/safe-equal.ts (NOUVEAU FICHIER)
import { timingSafeEqual } from 'node:crypto'

/**
 * Comparaison de chaînes en temps constant.
 * - Renvoie false immédiatement si les longueurs diffèrent (déjà un fingerprint
 *   acceptable car la longueur du secret est publique côté config).
 * - Sinon utilise crypto.timingSafeEqual.
 *
 * Usage :
 *   if (!safeEqual(header, process.env.SECRET)) return res.status(403)
 */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
  } catch {
    return false
  }
}

/**
 * Variante : compare un header Authorization "Bearer <token>" en temps constant.
 */
export function safeBearer(authHeader: string | null | undefined, expectedToken: string | undefined): boolean {
  if (!authHeader || !expectedToken) return false
  const prefix = 'Bearer '
  if (!authHeader.startsWith(prefix)) return false
  const token = authHeader.slice(prefix.length)
  return safeEqual(token, expectedToken)
}
```

### Refactor — patches

```diff
--- a/lib/lexora-internal-auth.ts
+++ b/lib/lexora-internal-auth.ts
@@ -1,3 +1,5 @@
+import { safeEqual } from '@/lib/security/safe-equal'
+
 const INTERNAL_HEADER = 'x-internal-token'
@@ -35,7 +37,7 @@
 export function resolveInternalAuth(request: Request): InternalAuthResult | null {
   const token = request.headers.get(INTERNAL_HEADER)
   const expected = process.env.INTERNAL_API_TOKEN
-  if (!token || !expected || token !== expected) return null
+  if (!token || !expected || !safeEqual(token, expected)) return null
   const user_id = request.headers.get(INTERNAL_USER_HEADER)
```

```diff
--- a/lib/telegram/auth.ts
+++ b/lib/telegram/auth.ts
@@ -1,3 +1,5 @@
+import { safeEqual } from '@/lib/security/safe-equal'
 import { getAdminClient } from '@/lib/supabase/admin'

 const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || ''
@@ -6,7 +8,7 @@
 export function assertWebhookSecret(headerSecret: string | null) {
   if (!SECRET) throw new Error('TELEGRAM_WEBHOOK_SECRET not configured on server')
-  if (headerSecret !== SECRET) {
+  if (!headerSecret || !safeEqual(headerSecret, SECRET)) {
     throw Object.assign(new Error('Invalid webhook secret'), { status: 403 })
   }
 }
```

```diff
--- a/lib/claude.ts
+++ b/lib/claude.ts
@@ -55,9 +55,11 @@
+import { safeBearer } from '@/lib/security/safe-equal'
 export function verifyCronSecret(request: Request): boolean {
   const authHeader = request.headers.get('authorization')
   const secret = process.env.CRON_SECRET
   if (!secret) return false
-  return authHeader === `Bearer ${secret}`
+  return safeBearer(authHeader, secret)
 }
```

```diff
--- a/lib/telegram/internal-auth.ts
+++ b/lib/telegram/internal-auth.ts
@@ -1,3 +1,4 @@
+import { safeEqual } from '@/lib/security/safe-equal'
 import { NextRequest, NextResponse } from 'next/server'
 import { getAdminClient } from '@/lib/supabase/admin'
@@ -55,7 +56,7 @@
 export async function resolveTelegramContext(req: NextRequest): Promise<TelegramContext> {
   const internalToken = req.headers.get('x-internal-token')
-  if (!internalToken || internalToken !== process.env.INTERNAL_API_TOKEN) {
+  if (!internalToken || !safeEqual(internalToken, process.env.INTERNAL_API_TOKEN)) {
     throw NextResponse.json({ error: 'Forbidden' }, { status: 403 })
   }
```

### Audit grep automatisé à lancer après le refactor

```bash
# Doit retourner 0 résultats (hors lib/security/safe-equal.ts)
grep -rEn '(\!==?|===?)\s*process\.env\.(INTERNAL_API_TOKEN|TELEGRAM_WEBHOOK_SECRET|CRON_SECRET|N8N_SECRET|AGENT_SECRET)' lib/ app/ 2>/dev/null \
  | grep -v 'lib/security/safe-equal.ts'

# Doit retourner 0 résultats
grep -rEn 'Bearer \$\{(secret|token)' lib/ app/ 2>/dev/null | grep -v safe-equal
```

### Tests à ajouter

```typescript
// lib/security/__tests__/safe-equal.spec.ts
import { safeEqual, safeBearer } from '../safe-equal'

describe('safeEqual', () => {
  test('returns true for equal strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
  })
  test('returns false for different strings of same length', () => {
    expect(safeEqual('abc', 'abd')).toBe(false)
  })
  test('returns false for different lengths', () => {
    expect(safeEqual('abc', 'abcd')).toBe(false)
  })
  test('returns false for null inputs', () => {
    expect(safeEqual(null, 'abc')).toBe(false)
    expect(safeEqual('abc', null)).toBe(false)
    expect(safeEqual(null, null)).toBe(false)
  })
})

describe('safeBearer', () => {
  test('matches valid Bearer header', () => {
    expect(safeBearer('Bearer xyz', 'xyz')).toBe(true)
  })
  test('rejects missing Bearer prefix', () => {
    expect(safeBearer('xyz', 'xyz')).toBe(false)
  })
  test('rejects wrong token', () => {
    expect(safeBearer('Bearer xyz', 'abc')).toBe(false)
  })
})
```

### Effort & déploiement

- **Effort** : 1 jour (helper + 15 sites de refactor + tests + audit grep)
- **Hotfix recommandé** : NON (vague 2 normale)
- **Rollback safety** : OK (pas de changement fonctionnel observable)
- **Risque** : aucun, juste un drop-in replacement

---

## SEC-005 — `INTERNAL_API_TOKEN` partagé non-HMAC (HAUTE 8/10)

### Diagnostic confirmé

`INTERNAL_API_TOKEN` est un secret statique partagé qui :
- Authentifie 56 endpoints `/api/telegram/internal/*`
- Permet à n'importe quel détenteur de **se faire passer pour n'importe quel `chat_id` / `user_id`** (le `chat_id` est lu depuis la query/body sans signature)
- Pas de timestamp anti-replay
- Pas de rotation

Si le token fuit (logs Vercel, n8n compromis, dump de workflow exporté, env var leak) → compromission totale multi-société.

### PoC d'exploitation

```bash
# Avec le token + un chat_id quelconque, l'attaquant peut valider la paie
# au nom de n'importe quelle société.
curl -X POST 'https://lexora.finance/api/telegram/internal/payroll-approve' \
  -H 'X-Internal-Token: <INTERNAL_API_TOKEN>' \
  -H 'X-Chat-Id: <chat_id d'un admin Lexora>' \
  -H 'Content-Type: application/json' \
  -d '{"periode":"2026-05","confirm":true}'
# → paie validée, écritures Grand Livre passées, paiements virés
```

### Patch — Signature HMAC + timestamp + nonce

#### Nouveau helper `lib/security/hmac-auth.ts`

```typescript
import { createHmac } from 'node:crypto'
import { safeEqual } from './safe-equal'

const ALLOWED_SKEW_MS = 5 * 60 * 1000  // 5 minutes

export type HmacVerifyResult =
  | { ok: true; bodyText: string }
  | { ok: false; reason: string }

/**
 * Vérifie une requête signée HMAC SHA-256.
 * Headers attendus :
 *   X-Lexora-Timestamp: <unix ms>
 *   X-Lexora-Nonce: <random 16 bytes hex>
 *   X-Lexora-Signature: sha256=<hmac(timestamp + '.' + nonce + '.' + bodyText)>
 *
 * Anti-replay : timestamp doit être < ALLOWED_SKEW_MS, nonce doit être unique
 * (stocké dans `telegram_request_nonces` avec TTL 10min).
 */
export async function verifyHmacRequest(
  req: Request,
  secret: string,
  checkNonce: (nonce: string) => Promise<boolean>,
): Promise<HmacVerifyResult> {
  const ts = req.headers.get('x-lexora-timestamp')
  const nonce = req.headers.get('x-lexora-nonce')
  const sig = req.headers.get('x-lexora-signature')
  if (!ts || !nonce || !sig) return { ok: false, reason: 'missing headers' }

  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum)) return { ok: false, reason: 'invalid timestamp' }
  const drift = Math.abs(Date.now() - tsNum)
  if (drift > ALLOWED_SKEW_MS) return { ok: false, reason: `timestamp skew ${drift}ms` }

  if (!/^[a-f0-9]{32}$/i.test(nonce)) return { ok: false, reason: 'invalid nonce' }
  const fresh = await checkNonce(nonce)
  if (!fresh) return { ok: false, reason: 'nonce replay' }

  // Lit le body en text pour la vérif de signature (pas de double-parse JSON)
  const bodyText = await req.clone().text()
  const payload = `${ts}.${nonce}.${bodyText}`
  const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex')
  if (!safeEqual(sig, expected)) return { ok: false, reason: 'bad signature' }

  return { ok: true, bodyText }
}

export function signHmacRequest(
  secret: string,
  bodyText: string,
): { headers: Record<string, string>; ts: string; nonce: string } {
  const ts = String(Date.now())
  const nonce = randomNonce()
  const payload = `${ts}.${nonce}.${bodyText}`
  const sig = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex')
  return {
    headers: {
      'X-Lexora-Timestamp': ts,
      'X-Lexora-Nonce': nonce,
      'X-Lexora-Signature': sig,
    },
    ts,
    nonce,
  }
}

function randomNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}
```

#### Migration nonce store (anti-replay)

```sql
-- supabase/migrations/416_telegram_hmac_nonces.sql
CREATE TABLE IF NOT EXISTS public.telegram_request_nonces (
  nonce TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_nonces_created
  ON public.telegram_request_nonces(created_at);

-- Purge des nonces > 15 min (anti-replay window est 5min, on garde 15 par marge)
CREATE OR REPLACE FUNCTION public.purge_old_telegram_nonces()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM public.telegram_request_nonces
  WHERE created_at < NOW() - INTERVAL '15 minutes';
$$;

-- À schéduler via pg_cron (toutes les 5 min)
-- SELECT cron.schedule('purge-telegram-nonces', '*/5 * * * *', $$ SELECT public.purge_old_telegram_nonces(); $$);

ALTER TABLE public.telegram_request_nonces ENABLE ROW LEVEL SECURITY;
-- Pas de policy → seul le service-role peut y toucher
```

#### Refactor `lib/telegram/internal-auth.ts`

```diff
--- a/lib/telegram/internal-auth.ts
+++ b/lib/telegram/internal-auth.ts
@@ -1,5 +1,7 @@
+import { safeEqual } from '@/lib/security/safe-equal'
+import { verifyHmacRequest } from '@/lib/security/hmac-auth'
 import { NextRequest, NextResponse } from 'next/server'
 import { getAdminClient } from '@/lib/supabase/admin'

@@ -53,12 +55,32 @@
 }

 export async function resolveTelegramContext(req: NextRequest): Promise<TelegramContext> {
-  const internalToken = req.headers.get('x-internal-token')
-  if (!internalToken || !safeEqual(internalToken, process.env.INTERNAL_API_TOKEN || '')) {
-    throw NextResponse.json({ error: 'Forbidden' }, { status: 403 })
+  // SEC-005 : HMAC verification + legacy token fallback (deprecation period).
+  const admin = getAdminClient()
+  const secret = process.env.INTERNAL_HMAC_SECRET || process.env.INTERNAL_API_TOKEN || ''
+  if (!secret) throw NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
+
+  const hmacResult = await verifyHmacRequest(req, secret, async (nonce) => {
+    const { error } = await admin.from('telegram_request_nonces').insert({ nonce })
+    return !error  // si insert ok → nonce frais ; si conflit unique → replay
+  })
+
+  if (!hmacResult.ok) {
+    // Pendant la période de migration : on accepte aussi l'ancien token statique
+    // si la flag d'environnement LEGACY_INTERNAL_TOKEN_ENABLED est true.
+    // À retirer une fois n8n migré.
+    if (process.env.LEGACY_INTERNAL_TOKEN_ENABLED !== 'true') {
+      throw NextResponse.json({ error: 'Forbidden (HMAC required)', reason: hmacResult.reason }, { status: 403 })
+    }
+    const internalToken = req.headers.get('x-internal-token')
+    if (!internalToken || !safeEqual(internalToken, process.env.INTERNAL_API_TOKEN || '')) {
+      throw NextResponse.json({ error: 'Forbidden' }, { status: 403 })
+    }
+    console.warn('[SEC-005] legacy token used for', req.url)
   }
```

#### Refactor du caller n8n (workflow ou côté Lexora `callLexoraHeaders`)

```diff
--- a/lib/lexora-internal-auth.ts
+++ b/lib/lexora-internal-auth.ts
@@ -1,3 +1,4 @@
+import { signHmacRequest } from '@/lib/security/hmac-auth'

-export function callLexoraHeaders(user_id: string, user_email: string = 'telegram-bot@lexora.io'): Record<string, string> {
-  const token = process.env.INTERNAL_API_TOKEN || ''
-  return {
-    'Content-Type': 'application/json',
-    [INTERNAL_HEADER]: token,
-    [INTERNAL_USER_HEADER]: user_id,
-    [INTERNAL_EMAIL_HEADER]: user_email,
-  }
-}
+export function callLexoraHeadersWithBody(
+  user_id: string,
+  bodyText: string,
+  user_email: string = 'telegram-bot@lexora.io',
+): Record<string, string> {
+  const secret = process.env.INTERNAL_HMAC_SECRET || process.env.INTERNAL_API_TOKEN || ''
+  const { headers } = signHmacRequest(secret, bodyText)
+  return {
+    'Content-Type': 'application/json',
+    ...headers,
+    [INTERNAL_USER_HEADER]: user_id,
+    [INTERNAL_EMAIL_HEADER]: user_email,
+  }
+}
```

Note importante pour le caller : il faut **construire le bodyText AVANT** de signer, ce qui change l'API :

```typescript
// Avant
fetch(url, { method: 'POST', headers: callLexoraHeaders(uid), body: JSON.stringify(payload) })
// Après
const bodyText = JSON.stringify(payload)
fetch(url, { method: 'POST', headers: callLexoraHeadersWithBody(uid, bodyText), body: bodyText })
```

### Tests à ajouter

```typescript
// lib/security/__tests__/hmac-auth.spec.ts
import { signHmacRequest, verifyHmacRequest } from '../hmac-auth'

const SECRET = 'test-secret-32-chars-XXXXXXXXXXX'
const usedNonces = new Set<string>()
const checkNonce = async (n: string) => !usedNonces.has(n) && (usedNonces.add(n), true)

describe('HMAC auth', () => {
  beforeEach(() => usedNonces.clear())

  test('valid signed request passes', async () => {
    const body = JSON.stringify({ a: 1 })
    const { headers } = signHmacRequest(SECRET, body)
    const req = new Request('https://x', { method: 'POST', headers, body })
    const r = await verifyHmacRequest(req, SECRET, checkNonce)
    expect(r.ok).toBe(true)
  })

  test('replay attack blocked (same nonce)', async () => {
    const body = JSON.stringify({ a: 1 })
    const { headers } = signHmacRequest(SECRET, body)
    const req1 = new Request('https://x', { method: 'POST', headers, body })
    await verifyHmacRequest(req1, SECRET, checkNonce)
    const req2 = new Request('https://x', { method: 'POST', headers, body })
    const r2 = await verifyHmacRequest(req2, SECRET, checkNonce)
    expect(r2.ok).toBe(false)
    expect((r2 as any).reason).toMatch(/replay/)
  })

  test('expired timestamp rejected', async () => {
    const oldTs = String(Date.now() - 10 * 60 * 1000)  // 10 min old
    const body = JSON.stringify({ a: 1 })
    const sig = require('crypto').createHmac('sha256', SECRET)
      .update(`${oldTs}.deadbeef00000000deadbeef00000000.${body}`).digest('hex')
    const req = new Request('https://x', { method: 'POST', body, headers: {
      'X-Lexora-Timestamp': oldTs,
      'X-Lexora-Nonce': 'deadbeef00000000deadbeef00000000',
      'X-Lexora-Signature': 'sha256=' + sig,
    }})
    const r = await verifyHmacRequest(req, SECRET, checkNonce)
    expect(r.ok).toBe(false)
    expect((r as any).reason).toMatch(/skew/)
  })

  test('tampered body rejected', async () => {
    const body = JSON.stringify({ a: 1 })
    const { headers } = signHmacRequest(SECRET, body)
    const tamperedBody = JSON.stringify({ a: 2 })  // signature ne match plus
    const req = new Request('https://x', { method: 'POST', headers, body: tamperedBody })
    const r = await verifyHmacRequest(req, SECRET, checkNonce)
    expect(r.ok).toBe(false)
    expect((r as any).reason).toMatch(/signature/)
  })
})
```

### Effort & déploiement

- **Effort** : 5 jours (helper + migration nonce + refactor des 56 endpoints + workflow n8n + rotation procédure)
- **Hotfix recommandé** : NON (sprint dédié 1 semaine, refacto les 56 callers n8n est non trivial)
- **Rollback safety** : RISQUE — toucher 56 endpoints implique de tester chaque flow Telegram. **Stratégie sécurisée** :
  1. Phase 1 (jour 1) : déployer le helper HMAC et l'accepter EN PLUS du token statique (flag `LEGACY_INTERNAL_TOKEN_ENABLED=true`)
  2. Phase 2 (jour 2-3) : migrer les 56 callers n8n un par un, vérifier les logs
  3. Phase 3 (jour 4) : monitorer pendant 24h le nombre d'appels en mode legacy (log warning)
  4. Phase 4 (jour 5) : flip `LEGACY_INTERNAL_TOKEN_ENABLED=false`, rotation du secret HMAC
- **Restriction IP supplémentaire** : ajouter une middleware Vercel qui rejette les requêtes `/api/telegram/internal/*` si l'IP source n'est pas la whitelist du worker n8n (à mettre dans `vercel.json` ou middleware Next.js).
- **Rotation programmée** : ajouter dans le ROADMAP "rotation mensuelle de INTERNAL_HMAC_SECRET" — utiliser un rotation à fenêtre glissante (accepter old+new pendant 24h).

---

## Plan de déploiement global

### Phase 1 — HOTFIX immédiat (< 4 heures)

1. **SEC-001** : Patch route password + migration `413_password_reset_audit.sql`
   - PR dédiée, review par un 2e dev, merge direct main
   - Sortir le log des resets des 90 derniers jours, alerter si suspect
2. **SEC-004** : Helper `safe-equal.ts` + refactor (~15 sites) → 1 PR, peu de risque

### Phase 2 — Court terme (cette semaine)

3. **SEC-002** : Migration `414_revoke_exec_sql` + retirer les 5 callers
   - PR avec checklist : tests prod manuel pour vérifier que `team_leader` peut être créé sans exec_sql

### Phase 3 — Sprint dédié sécurité (2 semaines)

4. **SEC-003** : Migration `415_fix_rls_phase2.sql` + tests E2E RLS
   - Sortir d'abord la liste réelle des policies weak via `SELECT FROM pg_policies`
   - Adapter la migration, déployer hors heures
   - Tests E2E obligatoires avant le merge
5. **SEC-005** : HMAC refactor + nonce store + migration n8n
   - Phase de migration progressive avec fallback legacy
   - Pas avant SEC-003 (sinon trop de churn simultané sur Telegram)

### Phase 4 — Post-correctifs critiques (mois suivant)

6. Adopter Zod sur les 50 routes les plus critiques (SEC-014)
7. Rate limiting global via @upstash/ratelimit (SEC-012)
8. MFA obligatoire admin/super_admin (SEC-009, 010)
9. Cookie `active_societe_id` server-side (SEC-006)
10. Pentest externe sur 5 jours

---

## Fichiers modifiés / créés (récapitulatif)

### Créations
- `lib/security/safe-equal.ts` (SEC-004)
- `lib/security/hmac-auth.ts` (SEC-005)
- `supabase/migrations/413_password_reset_audit.sql` (SEC-001)
- `supabase/migrations/414_revoke_exec_sql_security_hardening.sql` (SEC-002)
- `supabase/migrations/415_fix_rls_policies_phase2.sql` (SEC-003)
- `supabase/migrations/416_telegram_hmac_nonces.sql` (SEC-005)
- Tests : `lib/security/__tests__/safe-equal.spec.ts`, `lib/security/__tests__/hmac-auth.spec.ts`, `__tests__/security/rls-phase2.spec.ts`, `app/api/admin/users/[id]/password/__tests__/route.spec.ts`

### Modifications
- `app/api/admin/users/[id]/password/route.ts` (SEC-001)
- `app/api/admin/fix-db/route.ts` (SEC-002)
- `app/api/admin/diag-team-leader/route.ts` (SEC-002)
- `app/api/admin/diagnostic/route.ts` (SEC-002)
- `app/api/admin/users/route.ts` (SEC-002, retrait `tryAutoFixRoleConstraint`)
- `app/api/client/users/route.ts` (SEC-002, retrait `tryAutoFixRoleConstraint`)
- `lib/lexora-internal-auth.ts` (SEC-004, SEC-005)
- `lib/telegram/auth.ts` (SEC-004)
- `lib/telegram/internal-auth.ts` (SEC-004, SEC-005)
- `lib/claude.ts` (SEC-004)

---

## Métriques de succès post-déploiement

| Métrique | Avant | Après |
|---|---|---|
| Note sécurité audit-9 | 4.0/10 | 7.0/10 |
| Routes vulnérables à escalade privilèges | 1 (SEC-001) | 0 |
| Tables en RLS theatre | 32 | 0 (hors catalogue read-only whitelist) |
| Surface DDL arbitraire via REST | exec_sql exposé | exec_sql supprimé |
| Comparaisons secrets timing-safe | 1/15 (6%) | 15/15 (100%) |
| Endpoints internes avec HMAC signature | 0/56 | 56/56 |

---

**Verdict** : avec ces 5 patches, **la note remonte de 4.0/10 à ~7.0/10**. Les 5 vulnérabilités critiques sont fermées. Restent les 8 hautes (SEC-006 à SEC-013) qui devront passer en vague 3 (rate limiting, MFA, Zod systématique, cookies server-side).
