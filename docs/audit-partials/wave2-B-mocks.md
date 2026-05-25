# WAVE 2-B — Pages mock à fonctionnaliser

Sous-agent : **W2-B**
Branche : `claude/kind-mccarthy-zknYB`
Date : 2026-05-24

Ce rapport propose des patchs concrets pour chacune des 6 pages
cosmétiques/mock signalées par Agents 3 et 7. Les patchs ne sont **pas
appliqués** (mission strictement diagnostique).

Complexité globale : **moyenne**. 3 patchs sont triviaux (1 et 2 et 3
sont des lectures/écritures directes Supabase), 2 sont modérés (5 et 6,
réutilisent endpoints existants), 1 est lourd (4, refonte ou
suppression).

---

## Problème 1 : `/client/notifications` (cosmétique pur)

**Fichier** : `app/client/notifications/page.tsx`

**Diagnostic** : ligne 28 `const notifications: NotificationItem[] = []`
hardcodé. Aucun fetch. Aucun marquage "lu". La page affiche en
permanence l'état vide même si des notifications WhatsApp/email
existent en base.

**Endpoint/table cible** :
- Table : `public.notifications` (voir `001_initial_schema.sql:165`,
  schéma identique dans `010_financial_modules.sql:221`)
- Colonnes : `id, destinataire_id, type ('whatsapp'|'email'), sujet,
  message, statut ('pending'|'sent'|'failed'), metadata, created_at`
- RLS : policy "Users can view their notifications" (ligne 452) →
  `destinataire_id = auth.uid()`
- **Aucun endpoint REST existant** — il faut soit créer
  `app/api/client/notifications/route.ts`, soit faire un `from()` direct
  côté client (RLS protège déjà).

**Patch proposé** (lecture directe via client Supabase, le plus simple) :

```diff
--- a/app/client/notifications/page.tsx
+++ b/app/client/notifications/page.tsx
@@ -1,6 +1,7 @@
 "use client"

-import { useState } from "react"
+import { useState, useEffect } from "react"
+import { createClient } from "@/lib/supabase/client"
 import {
   Card,
   CardContent,
@@ -25,7 +26,5 @@ interface NotificationItem {
   statut: "pending" | "sent" | "failed"
 }

-const notifications: NotificationItem[] = []
-
 function formatDateTime(dateStr: string) {
@@ -84,6 +83,28 @@ export default function NotificationsPage() {
   const locale = getLocale()
   const { profile } = useProfile()
   const [filter, setFilter] = useState("tous")
+  const [notifications, setNotifications] = useState<NotificationItem[]>([])
+  const [loading, setLoading] = useState(true)
+
+  useEffect(() => {
+    let cancelled = false
+    async function load() {
+      const supabase = createClient()
+      const { data } = await supabase
+        .from("notifications")
+        .select("id, type, message, created_at, statut")
+        .order("created_at", { ascending: false })
+        .limit(200)
+      if (cancelled) return
+      setNotifications(
+        (data || []).map((n: any) => ({
+          id: n.id, type: n.type, message: n.message,
+          date: n.created_at, statut: n.statut,
+        }))
+      )
+      setLoading(false)
+    }
+    load()
+    return () => { cancelled = true }
+  }, [])
```

Le marquage "lu" n'a actuellement aucune colonne dédiée dans le schéma
notifications (statut = pending/sent/failed, pas lu/non-lu). Deux
options :
- (a) **Pas de "lu" pour le moment** — la page est purement consultative
  (statut applique l'état d'envoi).
- (b) Ajouter une colonne `lu_at TIMESTAMPTZ` via migration
  `309_notifications_lu_at.sql` puis exposer un endpoint
  `POST /api/client/notifications/[id]/read`.

Recommandation : option (a) en première passe — la mission dit "lire les
vraies notifications", c'est l'attendu critique. Le marquage lu peut
suivre en wave 3.

**Effort** : 15 min (option a) | 1h (option b avec migration)
**Risque** : faible. RLS protège déjà la lecture.

---

## Problème 2 : `/client/profil` (boutons sans action)

**Fichier** : `app/client/profil/page.tsx`

**Diagnostic** :
- Ligne 129-132 : `<Button>Sauvegarder les modifications</Button>` SANS
  `onClick`. Les inputs `fullName/email/phone` sont gérés en state mais
  rien ne les persiste.
- Ligne 258-260 : `<Button>Changer mot de passe</Button>` SANS `onClick`.
- Les switches notifications (Email/WhatsApp/TVA/Documents/Salaires)
  sont aussi en state local pur. Aucune colonne `preferences_notif`
  dans `profiles` (cf migration 001) — il faudrait l'ajouter, ou
  ignorer en wave 2.

**Endpoint/table cible** :
- `profiles` (full_name, phone, email — `001:14-17`)
- `supabase.auth.updateUser({ password })` pour le mot de passe (côté
  client direct, pas besoin d'endpoint)
- Pour `email` : `supabase.auth.updateUser({ email })` (déclenche email
  de confirmation Supabase) — attention : si on veut juste mettre à jour
  `profiles.email` sans réauth, faire un UPDATE direct (mais désync
  auth.users). Recommandation : **ne pas autoriser le changement
  d'email** ici, le mettre en `disabled`.

**Patch proposé** :

```diff
--- a/app/client/profil/page.tsx
+++ b/app/client/profil/page.tsx
@@ -1,7 +1,8 @@
 "use client"

-import { useState, useEffect } from "react"
+import { useState, useEffect } from "react"
 import Link from "next/link"
+import { createClient } from "@/lib/supabase/client"
 import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
 import { RequireRole, NON_CLIENT_USER_ROLES } from "@/components/client/RequireRole"
 import {
@@ -41,6 +42,9 @@ export default function ProfilPage() {
   const [fullName, setFullName] = useState("")
   const [email, setEmail] = useState("")
   const [phone, setPhone] = useState("")
+  const [saving, setSaving] = useState(false)
+  const [pwdOpen, setPwdOpen] = useState(false)
+  const [newPwd, setNewPwd] = useState("")

   const societe = activeSociete as Societe | null
   const loadingSociete = societeLoading
@@ -61,6 +65,40 @@ export default function ProfilPage() {
     }
   }, [profile])

+  async function handleSaveProfile() {
+    if (!profile?.id) return
+    setSaving(true)
+    try {
+      const supabase = createClient()
+      const { error } = await supabase
+        .from("profiles")
+        .update({ full_name: fullName, phone: phone || null })
+        .eq("id", profile.id)
+      if (error) {
+        alert("Erreur sauvegarde : " + error.message)
+      } else {
+        alert("Profil mis à jour")
+      }
+    } finally {
+      setSaving(false)
+    }
+  }
+
+  async function handleChangePassword() {
+    if (!newPwd || newPwd.length < 8) {
+      alert("Mot de passe : 8 caractères minimum")
+      return
+    }
+    const supabase = createClient()
+    const { error } = await supabase.auth.updateUser({ password: newPwd })
+    if (error) {
+      alert("Erreur : " + error.message)
+    } else {
+      alert("Mot de passe modifié")
+      setNewPwd("")
+      setPwdOpen(false)
+    }
+  }
@@
-          <div className="flex justify-end">
-            <Button style={{ backgroundColor: "#D4AF37", color: "white" }}>
-              {t('core.prof.save_changes', locale)}
-            </Button>
-          </div>
+          <div className="flex justify-end">
+            <Button
+              disabled={saving}
+              onClick={handleSaveProfile}
+              style={{ backgroundColor: "#D4AF37", color: "white" }}
+            >
+              {saving ? "..." : t('core.prof.save_changes', locale)}
+            </Button>
+          </div>
@@
-            <Button variant="outline" style={{ borderColor: "#0B0F2E", color: "#0B0F2E" }}>
-              {t('core.prof.change_password', locale)}
-            </Button>
+            <Button
+              variant="outline"
+              onClick={() => setPwdOpen(v => !v)}
+              style={{ borderColor: "#0B0F2E", color: "#0B0F2E" }}
+            >
+              {t('core.prof.change_password', locale)}
+            </Button>
           </div>
+          {pwdOpen && (
+            <div className="flex gap-2 items-end pt-2 border-t">
+              <div className="space-y-1 flex-1">
+                <Label htmlFor="new-pwd">Nouveau mot de passe</Label>
+                <Input
+                  id="new-pwd"
+                  type="password"
+                  value={newPwd}
+                  onChange={(e) => setNewPwd(e.target.value)}
+                  placeholder="Minimum 8 caractères"
+                />
+              </div>
+              <Button onClick={handleChangePassword}
+                style={{ backgroundColor: "#D4AF37", color: "white" }}>
+                Valider
+              </Button>
+            </div>
+          )}
```

Champ `email` : mettre `readOnly` ou ajouter une note "contactez votre
comptable pour modifier l'email" — éviter le risque de désync
auth/profiles.

Pour les switches notif (notifEmail, notifWhatsapp, notifTva, ...) :
hors scope sans migration ajoutant `profiles.preferences_notif JSONB`.
Marquer un TODO dans le code et garder en wave 3.

**Effort** : 30-45 min
**Risque** : faible. RLS profiles autorise UPDATE sur `id = auth.uid()`
(cf 001 plus bas dans le fichier).

---

## Problème 3 : `/client/alertes` (état lu/archivé éphémère)

**Fichier** : `app/client/alertes/page.tsx`

**Diagnostic** : ligne 102-109 — quand on fait `markAsRead` ou
`archiveAlert`, on modifie uniquement `setAlerts(...)` côté state React.
Au reload, tout repart à zéro. Les alertes du `/api/client/alertes` sont
des alertes **calculées à la volée** (rule-based) et n'ont pas
d'identité persistante en base.

**Endpoint/table cible** :
- Pas de table existante pour lu/archivé d'alertes calculées.
- Deux approches :
  1. **localStorage par utilisateur** : zéro migration, persistance par
     navigateur. Acceptable pour un état UX léger.
  2. **Migration** : créer
     `public.client_alertes_state(user_id uuid, societe_id uuid,
     alerte_id text, lue_at, archivee_at)` puis endpoint
     `POST /api/client/alertes/state`.

Vu que les `alerte.id` du endpoint ne sont pas stables entre runs
(générés à la volée → vérifier), option 1 est la seule fiable sans
refactor profond du endpoint `/api/client/alertes`.

**Vérification id stable** : à confirmer en lisant `app/api/client/alertes/route.ts`
(au-delà des 80 premières lignes). Si les ids sont déterministes (ex.
`alerte:VAT-overdue:${societe_id}`) → option 2 viable.

**Patch proposé (option 1, localStorage)** :

```diff
--- a/app/client/alertes/page.tsx
+++ b/app/client/alertes/page.tsx
@@ -91,6 +91,18 @@ export default function AlertesPage() {
   const [alerts, setAlerts] = useState<AlertItem[]>([])
   const [loading, setLoading] = useState(true)

+  const storageKey = societeId ? `lexora:alertes:state:${societeId}` : null
+
+  function loadLocalState(): Record<string, { lue?: boolean; archivee?: boolean }> {
+    if (!storageKey || typeof window === "undefined") return {}
+    try { return JSON.parse(localStorage.getItem(storageKey) || "{}") } catch { return {} }
+  }
+
+  function persistLocalState(state: Record<string, any>) {
+    if (!storageKey || typeof window === "undefined") return
+    localStorage.setItem(storageKey, JSON.stringify(state))
+  }
+
   useEffect(() => {
     async function fetchAlerts() {
       if (!societeId) { setLoading(false); return }
@@ -101,11 +113,12 @@ export default function AlertesPage() {
         if (res.ok) {
           const data = await res.json()
           if (Array.isArray(data.alertes)) {
+            const persisted = loadLocalState()
             setAlerts(
               data.alertes.map((a: any) => ({
                 ...a,
-                lue: false,
-                archivee: false,
+                lue: persisted[a.id]?.lue ?? false,
+                archivee: persisted[a.id]?.archivee ?? false,
               }))
             )
           }
@@ -157,11 +170,21 @@ export default function AlertesPage() {
   }

   function markAsRead(id: string) {
-    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, lue: true } : a)))
+    setAlerts((prev) => {
+      const next = prev.map((a) => (a.id === id ? { ...a, lue: true } : a))
+      const state = loadLocalState()
+      state[id] = { ...(state[id] || {}), lue: true }
+      persistLocalState(state)
+      return next
+    })
   }

   function archiveAlert(id: string) {
-    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, archivee: true, lue: true } : a)))
+    setAlerts((prev) => {
+      const next = prev.map((a) => (a.id === id ? { ...a, archivee: true, lue: true } : a))
+      const state = loadLocalState()
+      state[id] = { ...(state[id] || {}), lue: true, archivee: true }
+      persistLocalState(state)
+      return next
+    })
   }
```

**Effort** : 20 min (option 1) | 2h (option 2 avec migration + endpoint)
**Risque** : faible.

---

## Problème 4 : `/comptable/charges-sociales` (nom mensonger, clone de Balance)

**Fichier** : `app/comptable/charges-sociales/page.tsx`

**Diagnostic** : la page est un copier-collé textuel de la page
**Balance comptable**. Tous les libellés `t('cab.charges.*')` pointent
en réalité vers les traductions de balance (`class_1..class_7`,
`grand_total`, `kpi_total_debit`, etc.). Elle appelle
`/api/comptable/balance` (ligne 57). Aucun calcul de charges sociales
(CSG / NSF / PAYE) n'est fait.

Une **vraie** page charges sociales devrait :
- Lire `paie_periodes` / `bulletins_paie` (RH) ET/OU les écritures sur
  comptes 437x (charges sociales à payer) et 438x.
- Afficher : CSG part patronale, NSF, PAYE, total par mois, statut payé
  / à payer (lien avec `paiements_mra` éventuellement).
- Probablement très proche de ce que produit l'export MRA
  (`app/api/rh/exports-mra` ou équivalent).

**Endpoint/table cible** :
- `bulletins_paie` (cotisations détaillées par employé)
- `ecritures_comptables_v2` filtré sur comptes commençant par `437` et
  `438`
- Endpoint à créer : `GET /api/comptable/charges-sociales?societe_id=X
  &date_debut=&date_fin=` retournant
  `{ periodes: [{ mois, csg_employeur, csg_employe, nsf, paye,
  total, statut }] }`

**Patch proposé** :

Vu l'ampleur (refonte UI complète + endpoint + jointures RH/compta), deux
options réalistes :

**Option A — Suppression + redirect (effort minimal, honnête)** :

```diff
--- a/app/comptable/charges-sociales/page.tsx
+++ b/app/comptable/charges-sociales/page.tsx
@@ -1,213 +1,11 @@
-"use client"
-
-import { useState, useEffect, useCallback } from "react"
-/* ... 200 lignes de Balance copier-collée ... */
+import { redirect } from "next/navigation"
+
+export default function ChargesSocialesPage() {
+  // Cette route était un faux clone de /comptable/balance.
+  // Redirige vers la page Balance en attendant une vraie page
+  // charges sociales (cf. wave 3 — lecture paie + comptes 437/438).
+  redirect("/comptable/balance")
+}
```

Et supprimer l'entrée du menu/sidebar si elle existe.

**Option B — Vraie page (effort lourd, hors-scope wave 2)** :
créer `app/api/comptable/charges-sociales/route.ts` + refondre la page
en mode "tableau par mois × cotisation". Estimation : 1-2 jours dev.

Recommandation : **option A** en wave 2-B. Ouvrir une issue GitHub pour
option B.

**Effort** : 10 min (option A) | 1-2 jours (option B)
**Risque** : faible (option A — il faut vérifier qu'aucun lien
externe/menu pointe spécifiquement vers `/comptable/charges-sociales`).

---

## Problème 5 : `/comptable/clients/[clientId]/[societeId]/tableau-de-bord` (scores hardcodés)

**Fichier** : `app/comptable/clients/[clientId]/[societeId]/tableau-de-bord/page.tsx`

**Diagnostic** :
- `societeName = "TIBOK Ltd"` en dur (ligne 41)
- Scores A/B hardcodés (lignes 47-90)
- Comptes MCB / SBM / CIC en dur (lignes 92-96)
- KPIs (ratio liquidité 2.4x, marge nette 12%, ROE 18%, DSO 42j…)
  100% mock

**Endpoint/table cible** :
- Nom société : `supabase.from('societes').select('nom').eq('id', societeId).single()`
- Trésorerie : `supabase.from('comptes_bancaires').select('id, banque,
  numero, devise, solde_courant').eq('societe_id', societeId).eq('actif', true)`
- KPIs : à calculer depuis `ecritures_comptables_v2` (CA = somme classe 7 ;
  marge = (CA - achats classe 6) / CA ; trésorerie = solde 512x ; etc.)
  → idéalement créer un endpoint `GET /api/comptable/scoring?societe_id=X
  &periode=YYYY-MM` qui calcule les 4 quadrants.
- Existe déjà partiellement : `/api/comptable/sante-pcm` (donne un score
  santé comptable) et `/api/comptable/etats-financiers` (donne le P&L et
  bilan, d'où on peut dériver marge, ratio liquidité, DSO).

**Patch proposé** (squelette : récupère les vraies données de base,
calcule les KPIs simples depuis le bilan/P&L) :

```diff
--- a/app/comptable/clients/[clientId]/[societeId]/tableau-de-bord/page.tsx
+++ b/app/comptable/clients/[clientId]/[societeId]/tableau-de-bord/page.tsx
@@ -1,9 +1,9 @@
 "use client"

 import { useParams } from "next/navigation"
 import Link from "next/link"
-import { useState } from "react"
+import { useState, useEffect } from "react"
+import { createClient } from "@/lib/supabase/client"
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
@@ -36,9 +36,69 @@ export default function TableauDeBordPage() {
   const params = useParams()
   const locale = getLocale()
   const clientId = params.clientId as string
   const societeId = params.societeId as string
-  const societeName = "TIBOK Ltd"
+  const [societeName, setSocieteName] = useState("...")
+  const [tresorerieComptes, setTresorerieComptes] = useState<
+    Array<{ banque: string; solde: number; devise: string }>
+  >([])
+  const [kpis, setKpis] = useState<{
+    liq_ratio?: number
+    net_margin?: number
+    debt_equity?: number
+    dso_days?: number
+  } | null>(null)
+  const [loading, setLoading] = useState(true)
+
+  useEffect(() => {
+    let cancelled = false
+    async function load() {
+      const supabase = createClient()
+      // Nom société
+      const { data: soc } = await supabase
+        .from("societes")
+        .select("nom")
+        .eq("id", societeId)
+        .single()
+      // Comptes bancaires (trésorerie)
+      const { data: comptes } = await supabase
+        .from("comptes_bancaires")
+        .select("banque, devise, solde_courant")
+        .eq("societe_id", societeId)
+        .eq("actif", true)
+      // Bilan + PnL pour calculer ratios
+      const [bilanRes, pnlRes] = await Promise.all([
+        fetch(`/api/comptable/etats-financiers?societe_id=${societeId}&type=bilan`),
+        fetch(`/api/comptable/etats-financiers?societe_id=${societeId}&type=pnl`),
+      ])
+      const bilan = bilanRes.ok ? await bilanRes.json() : null
+      const pnl = pnlRes.ok ? await pnlRes.json() : null
+
+      if (cancelled) return
+      setSocieteName(soc?.nom || "---")
+      setTresorerieComptes(
+        (comptes || []).map((c: any) => ({
+          banque: c.banque,
+          devise: c.devise || "MUR",
+          solde: Number(c.solde_courant || 0),
+        }))
+      )
+      // Quelques KPIs simples — à enrichir selon shape exact des endpoints
+      const actif_c = bilan?.actif?.courant?.total || 0
+      const passif_dc = bilan?.passif?.dettes_courantes?.total || 1
+      const ca = pnl?.chiffre_affaires || 0
+      const resultat_net = pnl?.resultat_net || 0
+      setKpis({
+        liq_ratio: actif_c / passif_dc,
+        net_margin: ca ? (resultat_net / ca) * 100 : 0,
+        debt_equity: bilan?.ratios?.debt_equity,
+        dso_days: pnl?.dso || undefined,
+      })
+      setLoading(false)
+    }
+    load()
+    return () => { cancelled = true }
+  }, [societeId])
@@
-  const tresorerieComptes = [
-    { banque: "MCB", solde: 150000 },
-    { banque: "SBM", solde: 65000 },
-    { banque: "CIC (12 000 EUR = 558 000 MUR)", solde: 558000 },
-  ]
+  // tresorerieComptes is now state (see useEffect above)

   const [selectedPeriod, setSelectedPeriod] = useState(periods[0])
```

Et remplacer les `score: "A" / "B"` hardcodés dans `quadrants` par une
fonction `scoreFromKpi(kpis)` qui retourne A/B/C selon des seuils
métier (ex. liq_ratio > 2 → A ; 1-2 → B ; <1 → C).

**Effort** : 2-3h (lecture base + calcul KPIs basiques) ; jusqu'à 1-2
jours si on veut un vrai modèle de scoring sophistiqué.
**Risque** : moyen — il faut vérifier le shape exact retourné par
`/api/comptable/etats-financiers` (chemin `actif.courant.total` etc.,
visible dans `route.ts:189-252`) et `comptes_bancaires.solde_courant`
existe bien (à confirmer dans migrations 010/006). Si la colonne ne
s'appelle pas `solde_courant`, ajuster.

---

## Problème 6 : `/comptable/clients/[clientId]/[societeId]/bilan` (actifs/passifs en dur + societeName = "TIBOK Ltd")

**Fichier** : `app/comptable/clients/[clientId]/[societeId]/bilan/page.tsx`

**Diagnostic** :
- Ligne 37 : `const societeName = "TIBOK Ltd"` hardcodé
- Lignes 45-73 : actifNonCourant / actifCourant / capitauxPropres /
  passifCourant tous en dur (chiffres fictifs)
- Lignes 57-61 : détail trésorerie MCB/SBM/CIC mock identique au TDB
- Aucun fetch, aucune utilisation des params `clientId`/`societeId` au
  niveau données

**Endpoint/table cible** :
- **Endpoint existant** : `/api/comptable/etats-financiers?societe_id=X
  &type=bilan` retourne déjà la structure complète :
  ```
  {
    actif: {
      non_courant: { immo_corp, immo_incorp, amortissements,
                     immo_fin, total },
      courant: { stocks, clients_brut, provision_clients, clients,
                 autres_creances, tresorerie, total },
      total
    },
    passif: {
      capitaux_propres: { capital, reserves, report_nvx,
                          resultat_exercice, total },
      emprunts_lt,
      dettes_courantes: { ... , total },
      total
    },
    equilibre, delta
  }
  ```
  (Voir `app/api/comptable/etats-financiers/route.ts:189-252`)
- Nom société : `supabase.from('societes').select('nom').eq('id', societeId).single()`
- Trésorerie détaillée par banque : `comptes_bancaires` filtré societe_id

**Patch proposé** :

```diff
--- a/app/comptable/clients/[clientId]/[societeId]/bilan/page.tsx
+++ b/app/comptable/clients/[clientId]/[societeId]/bilan/page.tsx
@@ -1,9 +1,10 @@
 "use client"

 import { useParams } from "next/navigation"
 import Link from "next/link"
-import { useState } from "react"
+import { useState, useEffect } from "react"
+import { createClient } from "@/lib/supabase/client"
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
@@ -32,12 +33,72 @@ export default function BilanOfficielPage() {
   const params = useParams()
   const locale = getLocale()
   const clientId = params.clientId as string
   const societeId = params.societeId as string
-  const societeName = "TIBOK Ltd"
+  const [societeName, setSocieteName] = useState("...")
+  const [bilan, setBilan] = useState<any | null>(null)
+  const [tresorerieDetail, setTresorerieDetail] = useState<
+    Array<{ banque: string; montant: number }>
+  >([])
+  const [loading, setLoading] = useState(true)
+  const [selectedExercise, setSelectedExercise] = useState(exercises[0])
+
+  useEffect(() => {
+    let cancelled = false
+    async function load() {
+      setLoading(true)
+      const supabase = createClient()
+      const [{ data: soc }, { data: comptes }, biRes] = await Promise.all([
+        supabase.from("societes").select("nom").eq("id", societeId).single(),
+        supabase.from("comptes_bancaires")
+          .select("banque, devise, solde_courant")
+          .eq("societe_id", societeId).eq("actif", true),
+        fetch(`/api/comptable/etats-financiers?societe_id=${societeId}&type=bilan&exercice=${selectedExercise}`),
+      ])
+      const bi = biRes.ok ? await biRes.json() : null
+      if (cancelled) return
+      setSocieteName(soc?.nom || "---")
+      setTresorerieDetail(
+        (comptes || []).map((c: any) => ({
+          banque: `${c.banque} (${c.devise || "MUR"})`,
+          montant: Number(c.solde_courant || 0),
+        }))
+      )
+      setBilan(bi)
+      setLoading(false)
+    }
+    load()
+    return () => { cancelled = true }
+  }, [societeId, selectedExercise])
@@
-  const actifNonCourant = [
-    { compte: t('cabclt.bilan.tangible_assets', locale), montant: 850000 },
-    /* ... */
-  ]
-  const actifCourant = [ /* ... */ ]
-  const tresorerieDetail = [ /* ... */ ]
-  const capitauxPropres = [ /* ... */ ]
-  const passifCourant = [ /* ... */ ]
+  const actifNonCourant = bilan ? [
+    { compte: t('cabclt.bilan.tangible_assets', locale), montant: bilan.actif.non_courant.immo_corp },
+    { compte: t('cabclt.bilan.intangible_assets', locale), montant: bilan.actif.non_courant.immo_incorp },
+    { compte: t('cabclt.bilan.accumulated_depreciation', locale), montant: -bilan.actif.non_courant.amortissements },
+  ] : []
+  const actifCourant = bilan ? [
+    { compte: t('cabclt.bilan.trade_receivables', locale), montant: bilan.actif.courant.clients },
+    { compte: t('cabclt.bilan.stocks', locale), montant: bilan.actif.courant.stocks },
+    { compte: t('cabclt.bilan.cash_equivalents', locale), montant: bilan.actif.courant.tresorerie },
+  ] : []
+  const capitauxPropres = bilan ? [
+    { compte: t('cabclt.bilan.share_capital', locale), montant: bilan.passif.capitaux_propres.capital },
+    { compte: t('cabclt.bilan.legal_reserves', locale), montant: bilan.passif.capitaux_propres.reserves },
+    { compte: t('cabclt.bilan.retained_earnings', locale), montant: bilan.passif.capitaux_propres.report_nvx },
+  ] : []
+  const passifCourant = bilan?.passif?.dettes_courantes
+    ? Object.entries(bilan.passif.dettes_courantes)
+        .filter(([k]) => k !== "total")
+        .map(([compte, montant]) => ({ compte, montant: Number(montant) }))
+    : []
```

Et retirer la déclaration `const [selectedExercise, setSelectedExercise] = useState(exercises[0])`
plus bas (déjà déclarée plus haut maintenant).

Ajouter un loader pendant `loading === true`.

**Effort** : 1-2h (l'endpoint existe déjà, c'est juste du branchement)
**Risque** : faible — vérifier le mapping exact des comptes du passif
courant retourné par l'endpoint (TVA, CSG/NSF, fournisseurs).

---

## Récap effort & risque

| # | Page                                                | Effort     | Risque  | Type           |
|---|-----------------------------------------------------|------------|---------|----------------|
| 1 | client/notifications                                | 15 min     | faible  | lecture simple |
| 2 | client/profil                                       | 30-45 min  | faible  | update RLS     |
| 3 | client/alertes                                      | 20 min     | faible  | localStorage   |
| 4 | comptable/charges-sociales                          | 10 min (A) | faible  | redirect       |
| 5 | comptable/clients/[…]/tableau-de-bord               | 2-3 h      | moyen   | calcul KPIs    |
| 6 | comptable/clients/[…]/bilan                         | 1-2 h      | faible  | branchement API|

**Total wave 2-B (option minimum / option A pour le #4)** : ~5-7 h dev
+ tests.

**Hors-scope wave 2 (à reporter)** :
- Vraie page charges sociales (#4 option B) : 1-2 jours
- Système d'évaluation KPI métier avancé (#5) : 1-2 jours
- Migration `preferences_notif` profiles + UI switches (#2 bonus) :
  2-3 h
- Migration `client_alertes_state` pour persistance multi-device (#3
  option 2) : 3-4 h
