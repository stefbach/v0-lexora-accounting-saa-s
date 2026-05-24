# AUDIT 11 — UX/UI TRANSVERSAL

> Auditeur : Agent 11 (Frontend Developer)
> Stack : Next.js 15 (App Router) + TypeScript + Tailwind v4 (CSS vars) + shadcn/ui (style "new-york", baseColor neutral) + Radix UI + lucide-icons + sonner + framer-motion + Lenis + Three.js / R3F + GSAP
> Méthode : analyse statique (aucun navigateur disponible), grep sur `app/` (198 pages) + `components/` (155 fichiers).

---

## Synthèse

| Indicateur                          | Note         |
|-------------------------------------|--------------|
| **Note globale UX/UI**              | **6.2 / 10** |
| Cohérence design system             | 5.5 / 10     |
| Accessibilité estimée               | 5 / 10       |
| Responsive                          | 6.5 / 10     |
| Performance UI (RSC, images, bundle)| 4 / 10       |
| Patterns DRY                        | 6 / 10      |
| Robustesse (loading / error / 404)  | 3 / 10      |
| i18n (FR/EN)                        | 8 / 10      |

**Verdict** — Lexora dispose d'une **base shadcn/ui premium et complète** (59 composants UI, tokens motion/shadows/z-index/spacing soignés dans `app/globals.css`) et d'un **système i18n FR/EN structuré par chunks**. En revanche, l'app souffre de **trois maladies systémiques** qui plombent la note :

1. **Tout est `"use client"` (199 fichiers pour 198 pages)** — App Router est utilisé comme un SPA Next 13 legacy.
2. **44 % des couleurs sont hardcodées** (`bg-emerald-600`, `style={{color:"#0B0F2E"}}`) → le design system est by-passé partout.
3. **Aucun `loading.tsx` / `error.tsx` / `not-found.tsx`** dans tout `app/` → pas de streaming, pas d'error boundary native, pas de 404 personnalisée.

---

## Design system

### Composants UI
- `components/ui/**` : **59 composants** — toute la suite shadcn (alert, button, card, dialog, sheet, table, tabs, tooltip, sonner, sidebar, …) + extras custom (`MonthPicker`, `motion.tsx`, `spinner.tsx`, `empty.tsx`, `kbd.tsx`).
- `components.json` cohérent : style "new-york", `rsc: true`, alias `@/components/ui`, lucide icon library.
- **Toaster unifié sur Sonner** (`<Toaster richColors position="top-right" />` dans `app/layout.tsx`). `useToast`/`@/components/ui/toast` jamais importés depuis `app/`. ✅
- **Mais** : 11 pages importent directement `from "sonner"` au lieu de passer par un wrapper projet, et certaines pages réinventent leur propre toast inline (ex. `app/client/factures/page.tsx` ligne 258-266 : `<div className="fixed top-4 right-4 ...">`). ⚠️

### Cohérence couleurs / tokens
**Tokens définis** (`app/globals.css`, 221 lignes) — palette Lexora cohérente :
```
--bg-hero:        #0B0F2E   (navy signature)
--color-accent:   #D4AF37   (or)
--color-accent-2: #4191FF   (bleu)
--background, --foreground, --card, --primary, --muted, --ring, --sidebar*
--radius, --shadow-sm/md/lg/glow-*
--ease-out, --duration-fast/normal/slow
--z-base..z-cursor (échelle z-index complète)
```
+ `@theme inline` (Tailwind v4) qui mappe `--color-*` → utilitaires `bg-primary`, `text-muted-foreground`, etc.

**Bypass massif** (mesuré sur `app/` uniquement) :
- `559` occurrences d'inline `style={{ ... #hex ... }}`
- `569` classes Tailwind couleur hardcodées (`bg-emerald-*`, `bg-teal-*`, `bg-cyan-*`, `bg-indigo-*`, `bg-blue-NNN`, …)
- `715` utilisations correctes des tokens (`bg-primary`, `text-muted-foreground`, …)
- ➜ **environ 44 % des couleurs ne passent pas par le DS**

**Conséquence directe** : tout dark-mode futur est cassé (les `style={{ color: "#0B0F2E" }}` ne réagissent pas à `.dark`), et chaque module a sa propre palette d'écosystème (factures = emerald/teal, RH = orange/amber, etc.) — pas de cohérence visuelle entre espaces.

### Typographie
- Police unique **Poppins** (300/400/500/700) chargée via `@import url('https://fonts.googleapis.com/css2?...')` dans `globals.css`. ⚠️ Devrait passer par `next/font/google` (FOUT, perf).
- `font-sans` mappé sur Poppins dans `@theme inline`. ✅
- Mais une vingtaine de fichiers re-déclarent `fontFamily: "'Poppins', sans-serif"` en inline style — duplication inutile.

---

## Navigation / layout

### Sidebars (`components/layout/**`, 3 048 lignes total)
- **8 sidebars** : `AdminSidebar`, `AdminSidebarUnified` (?), `ClientSidebarFull` (640 lignes !), `ComptableSidebar`, `ComptableSidebarNew` (559 lignes — `New` suggère un legacy `ComptableSidebar` encore présent), `JuridiqueSidebar`, `RHSidebarDedicated`, `SalarieSidebar`.
- **Dead code suspect** : `AdminSidebar` + `AdminSidebarUnified` cohabitent (jamais référencé dans layouts) ; `ComptableSidebar` (336 l.) cohabite avec `ComptableSidebarNew` (559 l.) → seul `New` est utilisé.
- Sidebars dark (`--sidebar: #0B0F2E`), foreground clair, bordures `--sidebar-border` — cohérent visuellement entre rôles. ✅
- Logique de visibilité par module + régime société (gbc1, authorised_company, holding, branch_foreign_pe, domestic) — bien structurée.
- ⚠️ Toutes en `"use client"` → re-render à chaque navigation, pas de SSR du menu actif.

### Header / page shell
- `ClientPageShell` (233 lignes, `components/layout/`) : wrapper unique pour les pages client avec breadcrumb, kicker, titre, sous-titre, actions, fond radial + ParticleField. ✅ bonne abstraction.
- ⚠️ Background hardcodé en inline style (`linear-gradient(180deg,#F8F9FC...)`) au lieu de `bg-background`/token.
- **Particle field activé par défaut** sur toutes les pages client — coût CPU non-négligeable. Heureusement respecte `prefers-reduced-motion` via `useReducedMotion()` de framer-motion. ✅
- Pas d'équivalent `ComptablePageShell`, `RHPageShell`, `SalariePageShell` → chaque page de ces espaces réinvente son header.

### Breadcrumbs
- Composant `components/ui/breadcrumb.tsx` existe, et `ClientPageShell` en gère un.
- **Mais** : seulement **4 mentions de "Breadcrumb"** dans tout `app/` (2 dans `comptable/clients/...` et 2 dans `help/...`). Les autres pages n'ont pas de fil d'ariane. ❌

### Multi-rôles
- Layouts serveur (`app/{admin,comptable,rh,client,salarie,juridique}/layout.tsx`) effectuent l'auth + check rôle côté server → 👍 RBAC robuste.
- 8 layouts → 8 sidebars → 1 sidebar par rôle ; passage entre rôles cohérent.

### Mobile responsive
- `149 / 198` pages contiennent au moins une classe `sm:` / `md:` / `lg:` / `xl:` → **75 %** des pages ont une intention responsive.
- **Mais** : convention `md:ml-64` (compensation sidebar) utilisée seulement dans **4 layouts** → le shift sidebar n'est pas systématique.
- Sidebars : présence de `Menu` / `X` (lucide) dans `ClientSidebarFull` indique un toggle mobile, mais les autres sidebars (`ComptableSidebarNew`, `RHSidebarDedicated`) doivent être vérifiées au cas par cas.
- Aucun viewport `<meta>` custom : Next.js gère par défaut, OK.

---

## Patterns UI

### Pages liste (filtre + tableau + actions)
- Pattern récurrent mais **pas extrait en composant** : chaque page (factures, employés, fournisseurs, etc.) reconstruit son propre header + tabs + filtres + tableau.
- Exemple typique : `app/client/factures/page.tsx` (763 lignes) — `useState` pour search/filter/tab × N, `useMemo` pour filtered/counts, Tabs shadcn, `Table` shadcn.
- ⚠️ Pas de `DataTable` générique (pas de `@tanstack/react-table`). Tri/pagination réinventés à chaque page.
- Pages liste typiques entre **500 et 1 600 lignes** (employes = 1 626 l., paie = 1 358 l., nouvelle-facture = 1 080 l.).

### Formulaires
- Composant `components/ui/form.tsx` (React Hook Form + zod) existe.
- **Mais** : la majorité des formulaires utilisent `useState` natif + validation manuelle. Aucun usage homogène de `react-hook-form`. ⚠️
- Pattern récurrent dans `app/rh/employes/page.tsx` : `FormSection` + `FormField` re-définis localement (lignes 19-47) plutôt qu'utilisés depuis `@/components/ui/form`. ❌ duplication.

### Modals / Dialogs
- `<Dialog>` shadcn utilisé `659` fois dans `app/`. ✅ Système unifié.
- `<Sheet>` / `<Drawer>` : `90` usages — bon mix pour panneaux latéraux mobile.
- Focus trap fourni par Radix Dialog → focus management OK.

### Toasts
- Sonner global (top-right, richColors) ✅
- `290` appels à `toast()` dans `app/`. ✅
- **Mais** : au moins 1 page réinvente un toast custom inline (`app/client/factures/page.tsx`). À harmoniser.

---

## États de l'interface

### Loading states
- `588` patterns `setLoading / isLoading / loading` détectés → on _gère_ le loading partout, mais …
- `<Skeleton>` n'est utilisé que **2 fois** dans tout `app/`. ❌
- Pattern dominant : `<Loader2 className="animate-spin" />` centré sur la page (renvoie un blank screen 1-3 s). UX médiocre comparé à des skeletons.
- **0 fichier `loading.tsx`** dans `app/` ➜ aucune utilisation du streaming RSC natif Next 15.
- `Suspense` utilisé seulement **11 fois** (dont 3 wrappers obligatoires `useSearchParams`).

### Empty states
- `218` fichiers contiennent une mention "Aucun…/Empty/empty" → présents.
- Composant `components/ui/empty.tsx` existe (probablement shadcn empty) mais usage non quantifié — probablement sous-utilisé au profit de strings "Aucune donnée" sans illustration.

### Error states
- **0 fichier `error.tsx`** dans `app/` ➜ aucune error boundary App-Router. Tout crash UI = écran blanc.
- **0 fichier `not-found.tsx`** ➜ 404 native Next.js (page générique).
- Erreurs réseau : majoritairement gérées par `try { … } catch { toast.error("…") }` — OK mais incohérent (certaines pages échouent silencieusement avec un `console.error`).

### Success feedback
- Géré via sonner `toast.success("…")` — homogène. ✅

---

## Accessibilité (a11y)

**Score estimé : 5 / 10**

### Points positifs
- `*:focus-visible { outline: 2px solid var(--ring); }` global dans `globals.css`. ✅
- Radix UI sous shadcn gère ARIA roles, focus trap, keyboard nav nativement (Dialog, Select, Tabs, Dropdown…). ✅
- `@media (prefers-reduced-motion)` respecté côté CSS + via `useReducedMotion()` de framer-motion. ✅
- `<html lang="fr">` correctement défini. ✅
- 149 mentions `aria-label / role= / aria-*` dans `app/`.

### Problèmes
- **Labels d'inputs** : seulement **35 `htmlFor=`** dans 198 pages, alors que `71 <input` natifs détectés + plusieurs centaines de `<Input>` shadcn. Beaucoup de champs sans `<Label htmlFor>` lié — fail axe-core probable. ❌
- **Alt sur images** : seulement **12 occurrences `alt=`** dans tout `app/`. Les rares `<img>` (6) ont un alt mais l'absence de `next/image` interdit les alts générés. À vérifier : les avatars/logos uploadés via `<img>` non géré.
- **Contrastes** : palette Lexora `--muted-foreground: #4A5490` sur `--background: #F8F9FC` → ratio ~7.5:1 OK. `--accent-foreground: #0B0F2E` sur `#D4AF37` → ratio ~7.4:1 OK. ✅
- **Pages "neon"** (factures avec `bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50`, texte `text-emerald-700/80`) → contrastes faibles probables sur badges et sous-titres.
- Bouton FR/EN inline du login (`<button onClick={...}>`) sans `aria-pressed`. ⚠️

---

## Performance UI

**Score : 4 / 10** — c'est le plus gros chantier.

### Server vs Client components
- `app/` contient **198 pages**, dont **199 fichiers `"use client"`** (composants ou pages) → grosso modo **100 % des pages sont rendues côté client**.
- Les seules exceptions : `app/layout.tsx` (root), `app/client/page.tsx` (10 lignes, redirect), et les `app/*/layout.tsx` (qui font auth serveur).
- Conséquence : zero React Server Components → tout fetch passe par `useEffect` + `fetch("/api/…")` côté client → cascades waterfall (`useEffect → API → setState → re-render`), bundle JS énorme, pas de streaming, pas de cache RSC.
- **Anti-pattern bien visible** dans `app/direction/page.tsx` ligne 45 : `Promise.all(socs.map(async (s) => fetch...))` côté client, alors qu'un Server Component avec `await` aurait fait pareil en SSR + cache.

### Images
- **Zéro usage de `next/image`** dans tout `app/` ou `components/` (`grep -rln "next/image" → 0`).
- **6 `<img>` natifs** : logos signature, photos employé, signature juridique → pas redimensionnés, pas optimisés, pas lazy. Modeste mais constant.
- Logos de société dans facture/email/préférences renvoyés depuis Supabase Storage sans optimisation Vercel.

### Bundle / lazy loading
- Heavy deps installées : `three` (0.183), `@react-three/fiber`, `@react-three/drei`, `gsap`, `framer-motion` (12.38), `lenis`, `@react-pdf/renderer`. → bundle landing très lourd.
- `dynamic()` utilisé **10 fois** seulement dans tout le code → composants 3D, PDF, "CerveauTIBOK" sont chargés à la demande sur certaines pages, mais la majorité (ex. landing `app/page.tsx` = 2 037 lignes en client) est en eager.
- `app/layout.tsx` charge **`LenisProvider` globalement** → smooth scroll JS exécuté même sur les pages dashboard data-heavy où il n'apporte rien.

### Poppins chargé via `@import url()`
- Bloque le rendu jusqu'au CSS chargé. Devrait passer par `next/font/google` (preload + `font-display: swap` géré + no-FOUT).

### ParticleField
- Activé par défaut dans `ClientPageShell` (option `disableParticles` à passer explicitement). → coût continu RequestAnimationFrame sur toutes les pages client. Heureusement débrayé sur les pages data-heavy (`app/client/factures` passe `disableParticles`).

---

## Cohérence FR / terminologie

- **i18n FR/EN** structuré en `lib/i18n.ts` (667 lignes) + 13 chunks (`gbc`, `mra`, `hr`, `core`, `invoicing`, `accounting`, `comptable`, `rh_admin`, `admin`, `public`, `components`, `invoicing_ext`, `mra_ext`). ✅ Très bon découpage.
- **158 fichiers** appellent `t(..., locale)` → couverture i18n correcte mais pas systématique (198 pages au total, ~80 % seulement).
- Toponymie comptable Maurice : PCM, MRA, NSF, CSG, GBC1, BNQ correctement présentes. ✅
- ⚠️ Mots français sans accents trouvés dans i18n : `'home.cta_title': 'Pret a transformer votre comptabilite ?'` (accents manquants). Probable copy issue lors d'un copier-coller depuis un environnement sans accents.
- **Tone mix** :
  - App web business → vouvoiement ("Votre société", "Vos factures").
  - Bots Telegram → tutoiement ("Bienvenue sur Lexora Bot", "Tape exactement").
  - Pas d'incohérence flagrante (deux canaux distincts), mais à expliciter en charte éditoriale.
- Emojis dans certains emails admin (`<h1>Bienvenue ${prenom} 🎉</h1>`) → OK pour onboarding mais à valider que la charte les autorise.

---

## Pages échantillon — Note /10

| Page | Lignes | "use client" | Note | Commentaire |
|------|-------:|:-----------:|:----:|-------------|
| `app/page.tsx` (Landing) | 2 037 | ✅ (?!) | 5/10 | Landing en 2 037 lignes client-side. Trop monolithique. Doit être SC + Suspense + dynamic. |
| `app/auth/login/page.tsx` | 141 | ✅ | 6/10 | i18n OK, focus visible OK, **mais** couleurs inline `#0B0F2E` / `#D4AF37` / `#fef2f2` partout, switcher lang sans `aria-pressed`, pas de "Mot de passe oublié" (décision produit, OK). |
| `app/client/page.tsx` | 10 | RSC ✅ | 8/10 | Simple redirect ; bien fait. |
| `app/client/tableau-de-bord/page.tsx` | 490 | ✅ | 6.5/10 | KPI dashboard correct mais full-client. |
| `app/client/factures/page.tsx` | 763 | ✅ | 6/10 | Filtres bien, **toast custom inline** + couleurs emerald/teal hardcodées, pas de virtualisation pour grands volumes. |
| `app/client/nouvelle-facture/page.tsx` | 1 080 | ✅ | 5.5/10 | Formulaire à 1 080 lignes en useState ; aucun react-hook-form. Suspense wrapper present (bon réflexe pour useSearchParams). |
| `app/comptable/page.tsx` | 532 | ✅ | 6.5/10 | Dashboard comptable, structure claire. |
| `app/admin/page.tsx` | 467 | ✅ | 7/10 | Le mieux structuré : i18n, KPI cards via shadcn, lisible. |
| `app/rh/page.tsx` | 991 | ✅ | 6/10 | Centre de commande RH ; gros fichier monolithique. |
| `app/rh/paie/page.tsx` | 1 358 | ✅ | 5.5/10 | Page paie énorme ; à splitter en composants RSC + tabs lazy. |
| `app/rh/employes/page.tsx` | 1 626 | ✅ | 5/10 | Le plus gros : 1 626 lignes, `FormSection`/`FormField` redéfinis localement, beaucoup d'inline styles. |
| `app/salarie/page.tsx` | 364 | ✅ | 7/10 | Portail employé compact, tabs propres. |
| `app/direction/page.tsx` | 177 | ✅ | 6.5/10 | Concis, `dynamic(CerveauTIBOK, { ssr: false })` ✅. Mais cascades fetch client. |

**Moyenne pondérée : ~6.2 / 10**

---

## Top 10 recommandations UX/UI

### 🔴 P0 — Bloquants (impact immédiat sur la perf et la robustesse)

1. **Ajouter `loading.tsx`, `error.tsx` et `not-found.tsx` à la racine de chaque espace** (`app/client/`, `app/comptable/`, `app/rh/`, `app/admin/`, `app/salarie/`, `app/direction/`). Bénéfice : skeletons natifs streamés, error boundary Next 15, 404 brandée. **Effort : 1 jour.**

2. **Migrer les pages dashboard en Server Components**, en gardant uniquement les widgets interactifs en client. Cibles prioritaires :
   - `app/client/tableau-de-bord/page.tsx`
   - `app/direction/page.tsx`
   - `app/admin/page.tsx`
   - `app/comptable/page.tsx`
   Pattern : la `page.tsx` devient SC, fait les fetchs Supabase server-side, et `<TableauDeBordClient initialData={...} />` reste client pour l'interactivité. Bénéfice : -50 % JS sur le first load, suppression des cascades waterfall. **Effort : 1 semaine.**

3. **Bannir les couleurs hex en inline `style={{ color: "#0B0F2E" }}` et les classes `bg-emerald-*`/`bg-teal-*` hardcodées.** Lint rule `eslint-plugin-tailwindcss` + revue de code. Migrer vers `bg-primary`, `text-foreground`, `bg-accent`, etc. Bénéfice : dark mode prêt à activer, charte respectée, refonte couleur en 1 PR. **Effort : 3-5 jours.**

### 🟠 P1 — Hauts (UX et maintenance)

4. **Extraire un composant `DataTable` générique** (basé sur `@tanstack/react-table` + `components/ui/table.tsx`) avec : tri, pagination, virtualisation (`@tanstack/react-virtual`), recherche, filtres. Migrer factures/employes/fournisseurs/déclarations dessus. Bénéfice : -3 000 lignes dupliquées, perf grosses listes. **Effort : 1-2 semaines.**

5. **Adopter `next/font/google` pour Poppins** (suppression du `@import url` bloquant). Remplacer aussi les `<img>` par `<Image>` partout (`app/rh/societe`, `app/rh/employes/[id]`, signatures). Bénéfice : LCP -300-500 ms. **Effort : 0.5 jour.**

6. **Standardiser les formulaires sur `react-hook-form` + `zod`** via `components/ui/form.tsx` déjà présent. Commencer par `app/client/nouvelle-facture` (1 080 l.) et `app/rh/employes` (1 626 l.). Bénéfice : validation cohérente, codebase divisée par 2 sur les formulaires lourds. **Effort : 1-2 semaines.**

7. **Ajouter un `<Breadcrumbs>` systématique** dans chaque `*PageShell` (Comptable, RH, Salarie, Admin), comme dans `ClientPageShell`. Bénéfice : navigation à 4-5 niveaux compréhensible, retour orienté. **Effort : 2 jours.**

### 🟡 P2 — Moyens (polish et a11y)

8. **Audit a11y axe-core sur 10 pages clés** : login, dashboard client, factures, nouvelle-facture, employes, paie, dashboard comptable, dashboard admin, dashboard salarie, direction. Corriger les `<Label htmlFor>` manquants (priorité 1), les `aria-pressed` sur les toggles custom (FR/EN, mode sombre futur), les contrastes badges colorés. **Effort : 3-5 jours.**

9. **Nettoyer les sidebars dupliquées** : supprimer `AdminSidebarUnified.tsx` (non utilisé), `ComptableSidebar.tsx` (remplacé par `ComptableSidebarNew`). Renommer `ComptableSidebarNew` → `ComptableSidebar` (suffixe "New" = code smell). Bénéfice : -700 lignes de code mort. **Effort : 1 jour.**

10. **Remplacer les `<Loader2 className="animate-spin" />` plein-écran par des `<Skeleton>` ciblés** dans les pages liste et dashboard. Bénéfice : perception perf nettement améliorée, layout shift réduit. **Effort : 1 semaine, en parallèle des SC migrations.**

---

## Annexe — Métriques brutes

| Mesure                                                 | Valeur                |
|--------------------------------------------------------|-----------------------|
| Pages totales (`app/**/page.tsx`)                      | 198                   |
| Fichiers `"use client"` dans `app/`                    | 199                   |
| Composants UI (`components/ui/*.tsx`)                  | 59                    |
| Sidebars (`components/layout/*Sidebar*.tsx`)           | 8                     |
| Lignes totales layouts                                 | 3 048                 |
| Inline styles `style={{...}}` dans `app/`              | 2 148                 |
| Inline styles contenant un hex couleur                 | 559                   |
| Classes Tailwind couleur hardcodées (emerald/teal/...) | 569                   |
| Classes Tailwind couleur via tokens (primary/muted/…)  | 715                   |
| Usages de `next/image`                                 | 0                     |
| Usages de `<img>` natifs                               | 6                     |
| `htmlFor=` (label binding)                             | 35                    |
| `aria-*` / `role=`                                     | 149                   |
| Mentions `Skeleton`                                    | 2                     |
| Patterns loading state                                 | 588                   |
| Empty state mentions                                   | 218                   |
| `<Dialog>` shadcn                                      | 659                   |
| `<Sheet>` / `<Drawer>`                                 | 90                    |
| Toasts (sonner)                                        | 290                   |
| `loading.tsx` / `error.tsx` / `not-found.tsx`          | 0 / 0 / 0             |
| `Suspense` (dont 3 wrappers obligatoires)              | 11                    |
| `dynamic()` imports                                    | 10                    |
| Fichiers utilisant `t(..., locale)` (i18n)             | 158 / 198             |
| Reduced-motion handling                                | 57 occurrences        |
| Breadcrumb usage hors composant shell                  | 4                     |

---

**Auditeur** : Agent 11 — Frontend Developer
**Date** : 2026-05-24
**Méthode** : analyse statique exhaustive sur `app/` + `components/` (aucun navigateur disponible — pas de Lighthouse / axe DevTools).
