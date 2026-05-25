# WAVE 2-C — Persistence critique

**Sous-agent** : W2-C
**Branche** : `claude/kind-mccarthy-zknYB`
**Date** : 2026-05-24
**Périmètre** : remédiation de 2 pages `/client/*` aux problèmes de persistance bloquants pour le mode multi-user / multi-société.

---

## Problème 1 : `/client/parametres-rh` (Agent 6, BLOQUANT)

**Fichier** : `app/client/parametres-rh/page.tsx` (697 lignes, `"use client"`).

### Diagnostic

Page 100 % `localStorage`, **zéro appel Supabase / API**. Six entités gérées :

| Clé `localStorage`  | Entité métier          | Forme            |
|---------------------|------------------------|------------------|
| `rh_departments`    | Départements (DIR/FIN/IT/RH/COM…) | `Department[]` `{id,code,name,manager}` |
| `rh_offices`        | Bureaux / sites        | `Office[]` `{id,code,name,address}` |
| `rh_leave_types`    | Types de congés        | `LeaveType[]` `{id,code,name,daysPerYear,requiresCertificate,paid}` |
| `rh_holidays`       | Jours fériés par année | `Record<year, PublicHoliday[]>` |
| `rh_pay_groups`     | Groupes de paie (MUT/AE/TL/AST) | `PayGroup[]` `{id,code,name,employees[]}` |
| `rh_calendars`      | Calendriers de travail | `WorkCalendar[]` `{id,name,days,hoursPerDay}` |

Chemin d'écriture : helpers `loadLS / saveLS` lignes 117-127, appelés via `saveDepts/saveOffs/saveLts/saveHols/savePgs/saveCals` (lignes 205-210). Chargement initial dans `useEffect` ligne 195 — pose des **DEFAULTS hardcodés Maurice 2025/2026** dans le `localStorage` du premier navigateur qui ouvre la page.

**Conséquences observées** :
- Multi-user impossible : chaque navigateur a son propre référentiel. Un dirigeant qui change un libellé de jour férié sur son laptop ne le verra pas sur son téléphone, et le comptable du cabinet ne le voit jamais.
- Multi-société cassée : pas de `societe_id` du tout. Tous les paramètres sont partagés entre toutes les sociétés du même navigateur.
- Les `id` sont générés via `Math.random().toString(36)` (`uid()` ligne 41), donc collisions possibles et impossibles à mapper à un identifiant Supabase.
- Aucun lien avec l'employé : `PayGroup.employees: string[]` contient des ids opaques jamais reliés à `employes.id`.
- Suppression de cookies / cache navigateur → perte totale des paramètres RH du tenant.

### État actuel des tables Supabase pertinentes

| Entité UI            | Table existante en prod                              | Action |
|----------------------|------------------------------------------------------|--------|
| Départements         | **AUCUNE** (seulement `employes.departement TEXT`, mig 100 ligne 159) | CREATE TABLE |
| Bureaux              | **AUCUNE** (seulement `employes.site_bureau TEXT`, mig 047 ligne 24) | CREATE TABLE |
| Types de congés      | `conges_regles` (mig 170) — schéma riche WRA 2019, `societe_id` NULL = global, override par société | Réutiliser, **pas de DDL** |
| Jours fériés         | `jours_feries` (mig 017 + mig 139) — `societe_id NULL` = global MU, UNIQUE(date,societe_id) | Réutiliser, **pas de DDL** |
| Groupes de paie      | `groupes_employes` (mig 041) + table de liaison `employe_groupes` | Réutiliser, **pas de DDL** |
| Calendriers travail  | **AUCUNE** (`employes.heures_semaine` au cas-par-cas) | CREATE TABLE |

Trois tables manquent : `departements_rh`, `bureaux_rh`, `calendriers_travail`.

### Schéma Supabase proposé

```sql
-- ============================================================================
-- Migration XXX — Tables manquantes pour /client/parametres-rh
-- ============================================================================
-- Crée les 3 référentiels RH qui vivaient uniquement en localStorage :
--   departements_rh, bureaux_rh, calendriers_travail.
-- Les 3 autres (types de congés, jours fériés, groupes de paie) sont déjà
-- couverts par conges_regles, jours_feries, groupes_employes.
--
-- Pattern : societe_id NOT NULL (scope obligatoire), code unique par société,
-- RLS via user_has_societe_access() comme migration 219.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.departements_rh (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id  UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  nom         TEXT NOT NULL,
  manager_id  UUID REFERENCES public.employes(id) ON DELETE SET NULL,
  actif       BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, code)
);
CREATE INDEX IF NOT EXISTS idx_departements_rh_societe
  ON public.departements_rh(societe_id);

CREATE TABLE IF NOT EXISTS public.bureaux_rh (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id  UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,
  nom         TEXT NOT NULL,
  adresse     TEXT,
  latitude    NUMERIC,
  longitude   NUMERIC,
  rayon_pointage_m INTEGER DEFAULT 50,
  actif       BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, code)
);
CREATE INDEX IF NOT EXISTS idx_bureaux_rh_societe
  ON public.bureaux_rh(societe_id);

CREATE TABLE IF NOT EXISTS public.calendriers_travail (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id   UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  nom          TEXT NOT NULL,
  jours        TEXT[] NOT NULL DEFAULT ARRAY['Lun','Mar','Mer','Jeu','Ven']::TEXT[],
  heures_par_jour NUMERIC(4,2) NOT NULL DEFAULT 9,
  actif        BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, nom)
);
CREATE INDEX IF NOT EXISTS idx_calendriers_travail_societe
  ON public.calendriers_travail(societe_id);

-- ─── RLS (pattern hérité de migration 219) ─────────────────────────────────
ALTER TABLE public.departements_rh   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bureaux_rh        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendriers_travail ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['departements_rh','bureaux_rh','calendriers_travail'] LOOP
    EXECUTE format($f$
      CREATE POLICY "%I_tenant_select" ON public.%I
        FOR SELECT USING (public.user_has_societe_access(societe_id));
      CREATE POLICY "%I_tenant_modify" ON public.%I
        FOR ALL USING (public.user_has_societe_access(societe_id))
        WITH CHECK (public.user_has_societe_access(societe_id));
    $f$, t, t, t, t);
  END LOOP;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.departements_rh IS
  'Référentiel des départements RH par société. Remplace localStorage rh_departments. Référencé par employes.departement_id (à ajouter).';
COMMENT ON TABLE public.bureaux_rh IS
  'Référentiel des bureaux/sites par société. Remplace localStorage rh_offices. Référencé par employes.bureau_id (à ajouter).';
COMMENT ON TABLE public.calendriers_travail IS
  'Calendriers de travail par société (jours+heures). Remplace localStorage rh_calendars. Référencé par employes.calendrier_id (à ajouter).';
```

**Note** : la jointure FK depuis `employes.departement TEXT` → `departements_rh.id` n'est PAS dans cette migration (ne pas casser la prod). Migration séparée à prévoir une fois le référentiel peuplé (`ALTER TABLE employes ADD COLUMN departement_id UUID REFERENCES departements_rh(id)`, idem `bureau_id`, `calendrier_id`).

### Endpoints API à créer

Trois nouveaux endpoints (le pattern existe déjà via `app/api/rh/jours-feries/route.ts` et `app/api/rh/groupes/route.ts`) :

```
app/api/rh/departements/route.ts      → GET ?societe_id=...  POST {action: 'creer'|'modifier'|'supprimer'}
app/api/rh/bureaux/route.ts           → idem
app/api/rh/calendriers/route.ts       → idem
```

Le `groupes` (groupes de paie) passe par `app/api/rh/groupes/route.ts` qui existe déjà — la page peut l'utiliser tel quel.
Les `jours-feries` passent par `app/api/rh/jours-feries/route.ts` qui existe déjà.
Les `types de congés` doivent réutiliser `conges_regles` — un endpoint `app/api/rh/types-conges/route.ts` à créer si absent.

Squelette d'endpoint (modelé sur `jours-feries`) :

```typescript
// app/api/rh/departements/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const ALLOWED = ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin']

export async function GET(req: Request) {
  const supaAuth = await createServerClient()
  const { data: { user } } = await supaAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const url = new URL(req.url)
  const societe_id = url.searchParams.get('societe_id')
  if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

  const sb = admin()
  const { data, error } = await sb
    .from('departements_rh')
    .select('*')
    .eq('societe_id', societe_id)
    .eq('actif', true)
    .order('code')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ departements: data ?? [] })
}

export async function POST(req: Request) {
  const supaAuth = await createServerClient()
  const { data: { user } } = await supaAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const sb = admin()
  const { data: profile } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !ALLOWED.includes(profile.role))
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const body = await req.json()
  const { action, societe_id, id, code, nom, manager_id } = body

  if (action === 'creer') {
    if (!societe_id || !code || !nom)
      return NextResponse.json({ error: 'societe_id, code, nom requis' }, { status: 400 })
    const { data, error } = await sb.from('departements_rh')
      .insert({ societe_id, code, nom, manager_id: manager_id || null })
      .select().single()
    if (error) {
      if (error.code === '23505')
        return NextResponse.json({ error: 'Code déjà existant pour cette société' }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, departement: data })
  }

  if (action === 'modifier') {
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (code !== undefined) updates.code = code
    if (nom !== undefined) updates.nom = nom
    if (manager_id !== undefined) updates.manager_id = manager_id || null
    const { data, error } = await sb.from('departements_rh').update(updates).eq('id', id).select().maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, departement: data })
  }

  if (action === 'supprimer') {
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
    // soft-delete pour préserver les références
    const { error } = await sb.from('departements_rh').update({ actif: false }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
}
```

Endpoints `bureaux` et `calendriers` strictement identiques modulo le nom de table et la liste des colonnes.

### Patch front (extrait représentatif)

```diff
 "use client"
-import { useState, useEffect } from "react"
+import { useState, useEffect } from "react"
+import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
 ...
-// localStorage helpers
-function loadLS<T>(key: string, fallback: T): T { ... }
-function saveLS<T>(key: string, value: T) { ... }
+// API helpers
+async function apiGet(path: string) {
+  const r = await fetch(path, { cache: 'no-store' })
+  if (!r.ok) throw new Error((await r.json()).error || r.statusText)
+  return r.json()
+}
+async function apiPost(path: string, body: any) {
+  const r = await fetch(path, {
+    method: 'POST',
+    headers: { 'Content-Type': 'application/json' },
+    body: JSON.stringify(body),
+  })
+  if (!r.ok) throw new Error((await r.json()).error || r.statusText)
+  return r.json()
+}
 ...
 export default function ParametresRHPage() {
   const locale = getLocale()
+  const { societeId, loading: societeLoading } = useSocieteActive()
   ...
-  useEffect(() => {
-    setDepartments(loadLS("rh_departments", DEFAULT_DEPARTMENTS))
-    setOffices(loadLS("rh_offices", DEFAULT_OFFICES))
-    setLeaveTypes(loadLS("rh_leave_types", DEFAULT_LEAVE_TYPES))
-    setHolidays(loadLS("rh_holidays", { 2025: HOLIDAYS_2025, 2026: HOLIDAYS_2026 }))
-    setPayGroups(loadLS("rh_pay_groups", DEFAULT_PAY_GROUPS))
-    setCalendars(loadLS("rh_calendars", DEFAULT_CALENDARS))
-  }, [])
+  useEffect(() => {
+    if (!societeId) return
+    Promise.all([
+      apiGet(`/api/rh/departements?societe_id=${societeId}`).then(d => d.departements ?? []),
+      apiGet(`/api/rh/bureaux?societe_id=${societeId}`).then(d => d.bureaux ?? []),
+      apiGet(`/api/rh/types-conges?societe_id=${societeId}`).then(d => d.types_conges ?? []),
+      apiGet(`/api/rh/jours-feries?societe_id=${societeId}&annee=${holidayYear}`).then(d => d.jours_feries ?? []),
+      apiGet(`/api/rh/groupes?societe_id=${societeId}`).then(d => d.groupes ?? []),
+      apiGet(`/api/rh/calendriers?societe_id=${societeId}`).then(d => d.calendriers ?? []),
+    ]).then(([d, o, lt, h, pg, c]) => {
+      setDepartments(d); setOffices(o); setLeaveTypes(lt);
+      setHolidays(prev => ({ ...prev, [holidayYear]: h }));
+      setPayGroups(pg); setCalendars(c);
+    }).catch(e => console.error('[parametres-rh] load error', e))
+  }, [societeId, holidayYear])
 ...
-  const saveDepts = (d: Department[]) => { setDepartments(d); saveLS("rh_departments", d) }
+  // Save = appel API par action (creer/modifier/supprimer) + refresh local
+  const addDept = async (dept: Partial<Department>) => {
+    const r = await apiPost('/api/rh/departements', { action: 'creer', societe_id: societeId, ...dept })
+    setDepartments(prev => [...prev, r.departement])
+  }
+  const updateDept = async (id: string, dept: Partial<Department>) => {
+    const r = await apiPost('/api/rh/departements', { action: 'modifier', id, ...dept })
+    setDepartments(prev => prev.map(x => x.id === id ? r.departement : x))
+  }
+  const deleteDept = async (id: string) => {
+    await apiPost('/api/rh/departements', { action: 'supprimer', id })
+    setDepartments(prev => prev.filter(x => x.id !== id))
+  }
 ...
+  if (societeLoading) return <Loader />
+  if (!societeId) return <NoSocieteSelected />
```

Les six onglets suivent strictement le même pattern — la complexité front est mécanique, pas conceptuelle.

### Migration des données existantes (one-off côté users actuels)

Les seules données réelles déjà saisies vivent dans le `localStorage` d'utilisateurs spécifiques (probablement très peu en mai 2026 vu l'état du module). Approche recommandée :

1. **Côté code** : au premier mount post-déploiement, si la page reçoit un 200 vide ET qu'un blob `localStorage` existe, proposer un bouton « Importer mes paramètres locaux dans la société active » qui POST séquentiellement vers les endpoints `creer`. Supprimer le blob `localStorage` après succès.
2. **Côté ops** : pas de migration SQL nécessaire (les défauts hardcodés `DEFAULT_DEPARTMENTS` / `HOLIDAYS_2025` sont déjà couverts par le seed `conges_regles` global et `jours_feries` global Maurice).
3. Pour les jours fériés société-spécifiques : si un user a modifié sa liste, l'import importe sur `jours_feries` avec `societe_id = societeId`.

### Effort & risque

- **DDL** : 1 migration SQL nouvelle (3 tables + RLS). Effort : **2 h**. Risque : faible (CREATE IF NOT EXISTS, pas d'ALTER sur tables existantes).
- **API** : 3-4 nouvelles routes (departements, bureaux, calendriers, types-conges). Pattern copié-collé. Effort : **3-4 h**.
- **Front** : refactor `parametres-rh/page.tsx` (~697 lignes, mécanique). Effort : **4-6 h** + recettage manuel par onglet.
- **Total estimé** : **1 à 1.5 jour-dev**.
- **Risque blocant** : si la migration FK depuis `employes.departement TEXT → UUID` est faite trop tôt, casse les exports de paie. → faire en 2e temps, après stabilisation du référentiel.

---

## Problème 2 : `/client/societe` ignore SocieteActiveProvider (Agent 3)

**Fichier** : `app/client/societe/page.tsx` (375 lignes).

### Diagnostic

Lignes 295-306 :

```typescript
useEffect(() => {
  Promise.all([
    fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
  ]).then(([d1, d2]) => {
    const all = [...(d1.societes || []), ...(d2.societes || [])]
    const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values())
    setSocietes(unique)
    if (unique.length >= 1) { setSocieteId(unique[0].id); setSociete(unique[0]) }   // ← BUG
    setLoading(false)
  })
}, [])
```

**Trois bugs en cascade** :

1. **Refait son propre fetch** de la liste des sociétés au lieu d'utiliser `useSocieteActive().societes`. Double round-trip réseau et dépendance sur deux endpoints (`/api/comptable/societes` ET `/api/client/societes`) au lieu d'un seul.
2. **Sélectionne `unique[0]`** systématiquement → ignore le choix utilisateur stocké dans le cookie `active_societe_id` / `lexora_active_societe`. Tout dirigeant multi-société qui a sélectionné « Société B » dans son menu sera renvoyé sur « Société A » (la première par ordre alphabétique) à chaque visite de `/client/societe`. C'est l'**unique page client qui a ce comportement** (cf. `relances/`, `lex-factures/`, `recurrences/`, `alertes/`, `planning/`, `rapports-paie/`, `plan-comptable/`, `mra-roc/`, `factures/import/`, `revenus-depenses/` utilisent toutes `useSocieteActive()`).
3. **Mélange comptable + client** : appeler `/api/comptable/societes` depuis une page `/client/*` est sémantiquement incorrect, et redondant avec la logique `acting_as` du provider (`ACTING_AS_SOCIETE_COOKIE`, ligne 33 du provider) qui gère déjà ce cas.

Le sélecteur lignes 345-352 réécrit également `societeId` localement sans mettre à jour le cookie partagé → tout changement de société dans cette page est perdu dès qu'on navigue ailleurs.

### Vérification du provider (`SocieteActiveProvider.tsx`)

Le provider expose **tout ce dont la page a besoin** :

- `societes: Societe[]` (ligne 36-49 — type incluant `brn, ern, numero_tva_mra, statut_tva, secteur_activite, adresse, telephone, email, modules_actifs` + `[key: string]: unknown` pour le reste).
- `societeId: string | null`
- `societe: Societe | null` (objet courant, mémoïsé)
- `switchSociete(id)` (met à jour cookie + localStorage + state)
- `refresh()` (pour rafraîchir après save)
- `loading`, `error`

Le type `Societe` couvre les colonnes affichées par les 4 onglets (Details/Contact/Payroll/Bank) via la signature index `[key: string]: unknown`. **Aucune extension nécessaire.**

### Patch front (drop-in)

```diff
 "use client"
-import { useState, useEffect, useCallback } from "react"
+import { useState, useEffect } from "react"
 ...
+import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
 ...
 export default function SocieteSettingsPage() {
   const locale = getLocale()
-  const [societes, setSocietes] = useState<any[]>([])
-  const [societeId, setSocieteId] = useState("")
-  const [societe, setSociete] = useState<any>(null)
-  const [loading, setLoading] = useState(true)
+  const {
+    societes,
+    societeId,
+    societe,
+    loading,
+    switchSociete,
+    refresh,
+  } = useSocieteActive()
   const [saving, setSaving] = useState(false)
   const [saved, setSaved] = useState(false)
   const [tab, setTab] = useState<Tab>("details")
 
-  useEffect(() => {
-    Promise.all([
-      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
-      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
-    ]).then(([d1, d2]) => {
-      const all = [...(d1.societes || []), ...(d2.societes || [])]
-      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values())
-      setSocietes(unique)
-      if (unique.length >= 1) { setSocieteId(unique[0].id); setSociete(unique[0]) }
-      setLoading(false)
-    })
-  }, [])
-
-  useEffect(() => {
-    if (societeId) {
-      const s = societes.find(s => s.id === societeId)
-      if (s) setSociete(s)
-    }
-  }, [societeId, societes])
-
   const handleSave = async (data: any) => {
     setSaving(true); setSaved(false)
     try {
       const res = await fetch("/api/admin/societes", {
         method: "PUT",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ id: societeId, ...data }),
       })
       const result = await res.json()
       if (result.error) alert(t('core.socset.error_prefix', locale) + ": " + result.error)
       else {
         setSaved(true)
-        setSociete(data)
+        await refresh()   // ← re-fetch global liste pour propager partout
         setTimeout(() => setSaved(false), 3000)
       }
     } catch { alert(t('core.socset.network_error', locale)) }
     setSaving(false)
   }
 
   if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>
+  if (!societeId || !societe) {
+    return (
+      <div className="p-6">
+        <p className="text-gray-500">Aucune société active. Sélectionnez-en une dans le menu.</p>
+      </div>
+    )
+  }
 ...
       {societes.length > 1 && (
-        <Select value={societeId} onValueChange={setSocieteId}>
+        <Select value={societeId} onValueChange={switchSociete}>
           <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
           <SelectContent>
             {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
           </SelectContent>
         </Select>
       )}
```

Effets de bord positifs :
- Le sélecteur de société écrit maintenant cookie+localStorage → cohérence multi-page.
- Suppression de l'appel à `/api/comptable/societes` depuis `/client/*` (séparation des rôles).
- La page respecte le `ACTING_AS_SOCIETE_COOKIE` du comptable acting-as-client.
- `refresh()` après save re-fetch la liste → la sidebar, le sélecteur global et toutes les autres pages voient l'update sans reload.

### Migration SQL nécessaire ?

**Non.** Aucune DDL. Strictement un patch front.

### Effort & risque

- **Effort** : **30 min – 1 h** (suppression de state local + branchement du hook). 
- **Risque** : faible. Une seule subtilité : vérifier que le `<SocieteActiveProvider>` enveloppe bien `/client/societe` dans `app/client/layout.tsx` (le hook `throw` sinon — voir provider ligne 237). C'est très probablement déjà le cas vu que 10+ autres pages `/client/*` utilisent le hook sans encombre.
- **Tests à refaire manuellement** :
  - Dirigeant 2 sociétés → sélectionner société B ailleurs → ouvrir `/client/societe` → doit afficher B (et non A).
  - Sauvegarder un champ → la sidebar et le menu de sélection reflètent immédiatement le nouveau `nom` / `short_name`.
  - Comptable mode "acting as" client X → `/client/societe` doit afficher la société de X, pas la société du comptable.

---

## Récap livrables

| # | Item                                                 | Type        | Chemin                                                       | Status        |
|---|------------------------------------------------------|-------------|--------------------------------------------------------------|---------------|
| 1 | Migration SQL `departements_rh / bureaux_rh / calendriers_travail` | DDL         | `supabase/migrations/2XX_parametres_rh_persistence.sql` (à créer) | **À écrire** |
| 2 | Endpoint départements                                | API         | `app/api/rh/departements/route.ts` (à créer)                 | **À écrire** |
| 3 | Endpoint bureaux                                     | API         | `app/api/rh/bureaux/route.ts` (à créer)                      | **À écrire** |
| 4 | Endpoint calendriers                                 | API         | `app/api/rh/calendriers/route.ts` (à créer)                  | **À écrire** |
| 5 | Endpoint types-congés (sur `conges_regles`)          | API         | `app/api/rh/types-conges/route.ts` (à créer)                 | **À écrire** |
| 6 | Refactor front parametres-rh                         | Front       | `app/client/parametres-rh/page.tsx`                          | **Patch ci-dessus** |
| 7 | Refactor front societe (use provider)                | Front       | `app/client/societe/page.tsx`                                | **Patch ci-dessus** |

**Complexité estimée totale** : **1.5 à 2 jours-dev**, dont 80 % sur le problème 1 (parametres-rh). Le problème 2 est une correction triviale d'un anti-pattern isolé.

**Migrations SQL requises** : **OUI** pour problème 1 (3 nouvelles tables + RLS). **NON** pour problème 2.

**Dépendance / ordre** : appliquer la migration SQL EN PREMIER (idempotente, sans risque), puis déployer les endpoints (sans front qui les consomme = no-op), puis enfin remplacer le front. Permet un rollback front-only en cas de souci.
