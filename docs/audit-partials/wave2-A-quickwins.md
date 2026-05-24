# WAVE 2-A — Quick wins liens cassés (propositions de patches)

Sous-agent : **W2-A**
Branche : `claude/kind-mccarthy-zknYB`
Statut : propositions de patches uniquement (aucune modification appliquée)
Date : 2026-05-24

Pré-requis vérifiés :
- `/auth/login` existe → `app/auth/login/page.tsx`
- `/inscription` existe et consomme `/api/plans` (cf. `app/inscription/page.tsx` lignes 57, 92, 138)
- `/api/plans` est public (anon), renvoie `{ plans: Plan[] }` (cf. `app/api/plans/route.ts`)
- `/rh/exports/paie` contient déjà l'onglet `virements` (cf. `app/rh/exports/paie/page.tsx` ligne 654)
- L'API `/api/rh/exports/virement` est utilisée par 9 fichiers — **ne pas toucher** ; seule la **page UI** `/rh/exports/virement` est en doublon

---

## Problème 1 : `/login` zombie

**Fichier** : `app/login/page.tsx` (63 lignes)

**Symptômes constatés (lecture du fichier)** :
- Ligne 26 : `<form>` sans `onSubmit` ni `action`
- Ligne 47-49 : `<Button asChild><Link href="/dashboard">…</Link></Button>` → la route `/dashboard` n'existe PAS (le redirect canonique post-login est `/redirect` → rôle-spécifique : `/admin`, `/comptable`, `/client`, `/rh`, `/salarie`)
- Ligne 55 : `<Link href="#">` (CTA "contact sales" non câblé)
- Ligne 11 : `getLocale()` est appelé côté serveur dans un composant `"use client"` (anti-pattern mineur)
- Aucun appel `signInWithPassword` ni `createBrowserClient` Supabase

**Conclusion** : page totalement décorative, aucun auth réelle. Le composant fonctionnel vit dans `app/auth/login/page.tsx`.

**Action proposée** : remplacement complet par un redirect serveur 308.

```diff
--- a/app/login/page.tsx
+++ b/app/login/page.tsx
@@ -1,63 +1,12 @@
-"use client"
-
-import Link from "next/link"
-import { Button } from "@/components/ui/button"
-import { Input } from "@/components/ui/input"
-import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
-import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"
-import { t, getLocale } from "@/lib/i18n"
-
-export default function LoginPage() {
-  const locale = getLocale()
-  return (
-    <div className="flex min-h-screen items-center justify-center bg-secondary/30 px-4">
-      <Card className="w-full max-w-md">
-        <CardHeader className="text-center">
-          <Link href="/" className="mx-auto mb-4 flex items-center gap-2">
-            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
-              <span className="text-lg font-bold text-primary-foreground">L</span>
-            </div>
-            <span className="text-2xl font-semibold tracking-tight text-foreground">Lexora</span>
-          </Link>
-          <CardTitle>{t('adm.login.welcome', locale)}</CardTitle>
-          <CardDescription>{t('adm.login.subtitle', locale)}</CardDescription>
-        </CardHeader>
-        <CardContent>
-          <form>
-            <FieldGroup>
-              <Field>
-                <FieldLabel htmlFor="email">{t('adm.login.email', locale)}</FieldLabel>
-                <Input id="email" type="email" placeholder="name@company.com" />
-              </Field>
-              <Field>
-                <FieldLabel htmlFor="password">{t('adm.login.password', locale)}</FieldLabel>
-                <Input id="password" type="password" placeholder="••••••••" />
-              </Field>
-            </FieldGroup>
-            …
-            <Button className="mt-6 w-full" asChild>
-              <Link href="/dashboard">{t('adm.login.signin', locale)}</Link>
-            </Button>
-          </form>
-        </CardContent>
-        …
-      </Card>
-    </div>
-  )
-}
+import { redirect, permanentRedirect } from 'next/navigation'
+
+/**
+ * /login — page historique zombie (formulaire HTML sans onSubmit,
+ * bouton "Sign in" pointant vers /dashboard inexistant).
+ * Conservée uniquement pour préserver les anciens bookmarks externes.
+ * Redirige définitivement vers la vraie page d'auth.
+ */
+export default function LoginPage() {
+  permanentRedirect('/auth/login') // 308 Permanent Redirect (HEAD/GET method preserved)
+}
```

**Note** : `permanentRedirect` (Next 14+) émet un 308 (préserve la méthode HTTP). Si Next < 14 dans ce repo, retomber sur `redirect('/auth/login', RedirectType.replace)` ou un simple `redirect('/auth/login')` (307 par défaut).

**Justification** :
- 308 plutôt que 307 → indique aux moteurs/proxies que la migration est permanente
- Suppression de toutes les chaînes i18n liées (`adm.login.*`) → si elles ne sont utilisées QUE par cette page, elles peuvent être nettoyées dans `lib/i18n.ts` (à confirmer avec grep avant commit)

**Risque** : faible. Aucun import depuis `app/login` n'existe ailleurs (page terminale).

---

## Problème 2 : `/ohada` CTAs cassés

**Fichier** : `app/ohada/page.tsx` (148 lignes)

**Symptômes constatés** :
- Ligne 22 : `<a href="/admin/ohada">Voir la démo</a>` → route privée (middleware admin) — un visiteur public reçoit redirect vers `/auth/login` puis erreur 403
- Ligne 131 : `<a href="/contact">Demander une démo</a>` → **route inexistante** (vérifié : `app/contact/` n'existe pas)

**Action proposée** : repointer vers parcours d'inscription / tarifs.

```diff
--- a/app/ohada/page.tsx
+++ b/app/ohada/page.tsx
@@ -19,9 +19,9 @@ export default function OhadaPublicPage() {
           5× moins chère que Sage X3, 10× plus rapide à déployer.
         </p>
         <div className="flex gap-4 justify-center">
-          <a href="/admin/ohada" className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
-            Voir la démo
-          </a>
+          <a href="/inscription?role=expert" className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
+            Démarrer l'essai gratuit
+          </a>
           <a href="#features" className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">
             Découvrir
           </a>
@@ -128,9 +128,9 @@ export default function OhadaPublicPage() {
       <section className="py-20 px-4 text-center bg-gradient-to-br from-blue-600 to-blue-800 text-white">
         <h2 className="text-4xl font-bold mb-4">Prêt à moderniser votre comptabilité OHADA ?</h2>
         <p className="text-xl mb-8 opacity-90">Démo gratuite, déploiement en 2 semaines</p>
-        <a href="/contact" className="inline-block px-8 py-4 bg-white text-blue-600 rounded-lg font-bold hover:shadow-lg">
+        <a href="/inscription" className="inline-block px-8 py-4 bg-white text-blue-600 rounded-lg font-bold hover:shadow-lg">
           Demander une démo
         </a>
       </section>
```

**Justification** :
- Ligne 22 : la cible OHADA naturelle est l'expert-comptable (multi-juridictions) → `?role=expert` pré-remplit le formulaire
- Ligne 131 : `/inscription` est la page de capture lead/démo standard
- Pourquoi pas `/tarifs` : la page tarifs est centrée Maurice (PCM/MRA) et n'a pas de pricing OHADA explicite. Mieux vaut un parcours lead → contact commercial via inscription

**Risque** : faible (changement de 2 attributs `href`).

---

## Problème 3 : `/tarifs` désynchronisée des plans réels

**Fichier** : `app/tarifs/page.tsx` (1882 lignes)

**Symptômes constatés (grep ciblé)** :
- Tarifs hardcodés ligne 541-543 :
  ```ts
  const pricesCompta = [1500, 3500, 6500, 12000]
  const pricesPaie   = [1700, 2700, 6700, 14500]
  const pricesBundle = [2720, 4960, 10560, 21200]
  ```
- Tier names hardcodés ligne 116 (FR) / 361 (EN) : `["Solo", "Petite entreprise", "PME", "Grande entreprise"]`
- 5 occurrences de `href="/auth/login"` aux lignes **1118** (nav), **1726/1731** (calculateur), **1806/1814** (CTA finale). Les boutons "Démarrer l'essai gratuit" et "Demander une démo" pointent vers login alors que le parcours public est `/inscription`
- Seules les cartes des plans (ligne 935) pointent déjà correctement vers `/inscription`
- **Aucun** appel `fetch('/api/plans')` dans ce fichier alors que `/inscription` (ligne 92) consomme cette source de vérité

**Action proposée** : 2 changements indépendants.

### 3a — Repointer les CTAs hero/calc/cta-finale vers `/inscription`

Le bouton "Se connecter" en nav (ligne 1118) reste sur `/auth/login` (c'est un login, pas un signup). Les 4 autres CTAs marketing basculent.

```diff
--- a/app/tarifs/page.tsx
+++ b/app/tarifs/page.tsx
@@ -1115,11 +1115,11 @@
                 }}>{l.toUpperCase()}</button>
               ))}
             </div>
             <Link href="/auth/login" style={{
               color: C.white, fontSize: "14px", fontWeight: 600,
               padding: "8px 20px", borderRadius: "8px",
               border: `1px solid ${C.navyBorder}`, textDecoration: "none",
-            }}>{txt.login}</Link>
+            }}>{txt.login}</Link>{/* nav login : OK, reste sur /auth/login */}
           </div>
         </div>
       </nav>
@@ -1723,13 +1723,13 @@
               )}

               <div className="flex flex-col sm:flex-row" style={{ gap: "12px", marginTop: "20px" }}>
-                <Link href="/auth/login" style={{
+                <Link href="/inscription" style={{
                   flex: 1, display: "block", textAlign: "center",
                   padding: "12px", borderRadius: "10px", fontWeight: 700, fontSize: "13px",
                   backgroundColor: C.gold, color: C.bg, textDecoration: "none", fontFamily: FONT,
                 }}>{txt.calcCta1}</Link>
-                <Link href="/auth/login" style={{
+                <Link href="/inscription" style={{
                   flex: 1, display: "block", textAlign: "center",
                   padding: "12px", borderRadius: "10px", fontWeight: 700, fontSize: "13px",
                   backgroundColor: "transparent", color: C.white,
                   border: `1px solid ${C.navyBorder}`, textDecoration: "none", fontFamily: FONT,
                 }}>{txt.calcCta2}</Link>
               </div>
@@ -1803,14 +1803,14 @@
             </h2>
             <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap", marginBottom: "32px" }}>
               <PressableWrap>
-                <Link href="/auth/login" style={{
+                <Link href="/inscription" style={{
                   display: "inline-block", padding: "15px 34px", borderRadius: "12px",
                   fontWeight: 700, fontSize: "15px", backgroundColor: C.gold, color: C.bg,
                   textDecoration: "none", fontFamily: FONT,
                   boxShadow: `0 12px 28px -10px ${C.gold}80`,
                 }}>{txt.ctaBtn1}</Link>
               </PressableWrap>
               <PressableWrap>
-                <Link href="/auth/login" style={{
+                <Link href="/inscription" style={{
                   display: "inline-block", padding: "15px 34px", borderRadius: "12px",
                   fontWeight: 700, fontSize: "15px", backgroundColor: "rgba(248,246,241,0.04)",
                   color: C.white, border: `1px solid ${C.navyBorder}`,
                   textDecoration: "none", fontFamily: FONT,
                 }}>{txt.ctaBtn2}</Link>
               </PressableWrap>
```

**Justification** :
- `ctaBtn1` = "Démarrer l'essai gratuit" / "Start free trial" → c'est un signup, donc `/inscription`
- `ctaBtn2` = "Demander une démo" / "Request a demo" → également capture lead via `/inscription`
- `calcCta1/2` (résultat du calculateur de prix) → l'utilisateur a vu son prix, il veut signup, pas se logger
- Seule la nav top (`txt.login`) reste sur `/auth/login` car c'est un bouton "Se connecter" pour utilisateur existant

### 3b — Migration vers `/api/plans` (proposition stratégique, NON appliquée immédiatement)

**Recommandation** : ne PAS faire dans ce quick win. Voici pourquoi :
- La page tarifs a une logique complexe (calculateur dynamique, 3 segments compta/paie/bundle, billing monthly/annual, FR/EN, plancher Rs 250) qui ne correspond pas 1:1 au schéma DB `plans` (`prix_mensuel_mur` / `prix_annuel_mur`)
- `/api/plans` n'expose qu'un prix unique par plan ; la grille tarifs croise (modules × tailles entreprise × billing) → 24+ combinaisons
- Migration = refonte fonctionnelle, pas un quick win

**Proposition alternative pour la cohérence** : créer un test E2E qui compare les `pricesCompta/Paie/Bundle` du tarifs.tsx avec les `prix_mensuel_mur` de la table `plans` et fail le CI si dérive > 5 %. Cela garde la maintenabilité sans refonte.

```ts
// __tests__/tarifs-plans-sync.test.ts (à créer dans une PR séparée)
// Compare hardcoded pricing in app/tarifs/page.tsx with /api/plans response
// Fail if drift > 5%. Maintenance-only safeguard.
```

**Risque** :
- 3a (5 hrefs) : faible
- 3b (migration API) : élevé — repoussé hors quick wins

---

## Problème 4 : `/juridique/documents` et `/juridique/conformite` introuvables

**Fichier** : `app/juridique/page.tsx` (37 lignes)

**Symptômes constatés** :
- Lignes 19-20 : 2 cartes pointent vers `/juridique/documents` et `/juridique/conformite`
- Vérification : `ls app/juridique/` → seules `contrats/` et `page.tsx` existent
- Résultat : clic sur ces cartes = 404

**Décision** : retirer les 2 liens cassés du hub. Les pages n'ont pas de roadmap documentée → ne pas créer de stubs vides (anti-pattern qui crée de la dette technique muette).

**Action proposée** :

```diff
--- a/app/juridique/page.tsx
+++ b/app/juridique/page.tsx
@@ -14,12 +14,11 @@ export default function JuridiquePage() {
         <p className="text-sm text-gray-500">{t('pub.juridique.subtitle', locale)}</p>
       </div>
       <div className="grid grid-cols-2 gap-4">
         {[
           { href: '/juridique/contrats', icon: '📄', label: t('pub.juridique.contracts', locale), desc: t('pub.juridique.contracts_desc', locale) },
-          { href: '/juridique/documents', icon: '📁', label: t('pub.juridique.documents', locale), desc: t('pub.juridique.documents_desc', locale) },
-          { href: '/juridique/conformite', icon: '✅', label: t('pub.juridique.compliance', locale), desc: t('pub.juridique.compliance_desc', locale) },
           { href: '/rh/employes', icon: '👥', label: t('pub.juridique.employees', locale), desc: t('pub.juridique.employees_desc', locale) },
         ].map(item => (
           <Link key={item.href} href={item.href}>
             <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-[#0B0F2E]">
               <CardContent className="p-5">
```

**Note** : le hub passe de 4 à 2 cartes. La grille `grid-cols-2` reste cohérente (2 cartes côte à côte). Les clés i18n `pub.juridique.documents*` et `pub.juridique.compliance*` peuvent rester (peu de poids, et faciles à réactiver si les pages sont créées).

**Alternative** (si on préfère préserver la grille 4 cellules) : remplacer les 2 cartes par des cartes "À venir" non cliquables avec un Badge "Bientôt". À discuter avec product.

**Risque** : faible. Si les pages sont en cours de dev sur une autre branche, le rebase signalera le conflit.

---

## Problème 5 : `/rh/exports/virement` doublon de `/rh/exports/paie?tab=virements`

**Fichier** : `app/rh/exports/virement/page.tsx` (405 lignes)

**Symptômes constatés** :
- `/rh/exports/paie` (1131 lignes) contient déjà un onglet `virements` (ligne 654 : `<Tabs defaultValue="virements">`, ligne 656 : `<TabsTrigger value="virements">`, ligne 667 : `<TabsContent value="virements">`)
- Les deux pages appellent le même endpoint `/api/rh/exports/virement` (lignes 106/135/166 dans virement, 207 dans paie)
- L'**API** `/api/rh/exports/virement/route.ts` est utilisée par **9 consommateurs** (telegram, paie, client/salaires, client/exports-rh, sidebar) → **NE PAS la supprimer**
- Seule la **page UI** est en doublon
- Référencement de la page UI : 1 seul endroit → `components/layout/AdminSidebarUnified.tsx:61`

**Action proposée** : remplacement de la page par un redirect + mise à jour du lien sidebar.

### 5a — Remplacer la page par un redirect 308

```diff
--- a/app/rh/exports/virement/page.tsx
+++ b/app/rh/exports/virement/page.tsx
@@ -1,405 +1,11 @@
-"use client"
-import { useState, useEffect, useCallback } from "react"
-…
-(405 lignes supprimées)
-…
+import { permanentRedirect } from 'next/navigation'
+
+/**
+ * /rh/exports/virement — doublon de l'onglet "virements"
+ * dans /rh/exports/paie (cf. Tabs ligne 654 de paie/page.tsx).
+ * L'API /api/rh/exports/virement reste en place (9 consommateurs).
+ * Seule la page UI est dépréciée.
+ */
+export default function ExportVirementRedirect() {
+  permanentRedirect('/rh/exports/paie?tab=virements')
+}
```

### 5b — Mettre à jour le lien sidebar (recommandé en même temps)

**Fichier** : `components/layout/AdminSidebarUnified.tsx` ligne 61

```diff
--- a/components/layout/AdminSidebarUnified.tsx
+++ b/components/layout/AdminSidebarUnified.tsx
@@ -58,7 +58,7 @@
       …
-      { href: "/rh/exports/virement", label: "Virements bancaires", icon: Banknote },
+      { href: "/rh/exports/paie?tab=virements", label: "Virements bancaires", icon: Banknote },
```

### 5c — Vérification du `defaultValue` Tabs

**À vérifier avant commit** : le composant `<Tabs>` de `app/rh/exports/paie/page.tsx` (ligne 654) doit lire le query param `tab` pour activer le bon onglet. Vérification de la ligne 654 :
```tsx
<Tabs defaultValue="virements" className="w-full">
```
→ `defaultValue="virements"` est codé en dur, donc le lien `?tab=virements` est cosmétique (l'onglet est déjà actif par défaut). Acceptable. Un vrai lien profond nécessiterait un `<Tabs value={searchParams.tab ?? 'virements'} onValueChange={…}>` mais c'est hors quick win.

**Risque** : faible. Le redirect préserve les anciens bookmarks. Aucune fonctionnalité perdue (l'onglet `paie` contient le même UI).

**Bonus** : 405 lignes supprimées → réduction nette de la dette UI.

---

## Synthèse — Effort estimé

| # | Fichier | Lignes supprimées | Lignes ajoutées | Risque | Validation requise |
|---|---|---|---|---|---|
| 1 | `app/login/page.tsx` | 63 | 12 | faible | grep `adm.login.*` pour nettoyer i18n |
| 2 | `app/ohada/page.tsx` | 2 attrs href | 2 attrs href | faible | aucune |
| 3a | `app/tarifs/page.tsx` | 4 `/auth/login` | 4 `/inscription` | faible | aucune |
| 3b | (migration API plans) | — | — | élevé | **reporté hors quick wins** |
| 4 | `app/juridique/page.tsx` | 2 entrées array | 0 | faible | confirmer product (alt : cartes "Bientôt") |
| 5a | `app/rh/exports/virement/page.tsx` | 405 | 11 | faible | tester `?tab=virements` sur paie |
| 5b | `components/layout/AdminSidebarUnified.tsx` | 1 href | 1 href | faible | aucune |

**Totaux nets** :
- Lignes supprimées : ~474
- Lignes ajoutées : ~30
- Net : **-444 lignes** de dead code / dette UI

**Temps dev estimé** : 25–35 min (lecture + patch + typecheck + smoke test manuel des redirects)

**Risque global** : **faible**

**Pré-requis avant merge** :
1. `npx tsc --noEmit` filtré sur les 6 fichiers touchés
2. Smoke test : `/login`, `/rh/exports/virement` redirigent bien (curl `-I`)
3. Smoke test : `/ohada` → clic "Voir la démo" → atterrit sur `/inscription?role=expert`
4. Smoke test : `/tarifs` → clic "Démarrer l'essai gratuit" → atterrit sur `/inscription`
5. Smoke test : `/juridique` → 2 cartes affichées au lieu de 4 (ou 4 si alt cartes "Bientôt")

**Hors scope quick wins (à traiter en wave 3 ou plus tard)** :
- Migration `tarifs/page.tsx` vers `/api/plans` (refonte fonctionnelle)
- Création réelle des pages `/juridique/documents` et `/juridique/conformite` (besoin spec produit)
- Refacto i18n pour purger les clés `adm.login.*` orphelines
- Vrai deep-linking des `<Tabs>` dans `/rh/exports/paie` via searchParams
