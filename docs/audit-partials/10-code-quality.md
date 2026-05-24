# AUDIT 10 — CODE QUALITY TRANSVERSAL

> **Repo** : `v0-lexora-accounting-saa-s`
> **Branche** : `claude/kind-mccarthy-zknYB`
> **Date** : 2026-05-24
> **Stack** : Next.js 16.2 (App Router) · React 19 · TypeScript 5.7 · Supabase · Tailwind v4

---

## Synthèse

| KPI | Valeur | Verdict |
|---|---|---|
| **Note globale code quality** | **5.5 / 10** | Moyen, dette technique sérieuse |
| Erreurs TypeScript (`tsc --noEmit`) | **0** | Excellent, build sain |
| `as any` / cast typés sales | **689** occurrences sur 213 fichiers | Très élevé — qualité de typage en façade |
| `@ts-ignore` / `@ts-expect-error` | **0** | Excellent |
| `console.log` en code prod | **217** occurrences | Préoccupant (à nettoyer) |
| `console.error`/`console.warn` | 640 | Acceptable mais à passer en logger structuré |
| TODO / FIXME / HACK | **9** | Excellent, faible dette annotée |
| Fichiers > 1000 lignes | **39** | Red flag majeur |
| Pages dupliquées identifiées | **9 clusters** | Critique |
| Composants orphelins | **8 confirmés** | Mort à supprimer |
| Endpoints API non référencés | **~11 dead** + ~30 douteux | Significatif |
| Fichiers `lib/` orphelins | **~10** | À éclaircir |
| Tests automatisés | **40 fichiers** | Couverture surtout sur `lib/accounting/*` |
| "use client" pages | **176 / 190 (92,6 %)** | Quasi-100 % client side — anti-pattern App Router |
| "use server" actions | **0** | Aucune Server Action utilisée |

---

## 1. TypeScript

### Bilan
- `npx tsc --noEmit` (`strict: true`) : **0 erreur**, exit code 0
- Aucun `@ts-ignore` / `@ts-expect-error`
- **MAIS** : 689 `as any` répartis sur 213 fichiers → le typage est largement contourné, pas violé

### Top 10 fichiers les plus "any-pollués"

| # | Fichier | `as any` |
|--:|---|--:|
| 1 | `app/api/comptable/rapprochement/route.ts` | **35** |
| 2 | `components/layout/ClientSidebarFull.tsx` | 33 |
| 3 | `app/rh/conges/page.tsx` | 23 |
| 4 | `app/api/comptable/tva/export/route.ts` | 21 |
| 5 | `lib/rh/ias19-eoy-provisions.ts` | 15 |
| 6 | `app/api/documents/upload/route.ts` | 15 |
| 7 | `lib/rh/ias19-provisions.ts` | 14 |
| 8 | `app/api/rh/paie/route.ts` | 12 |
| 9 | `app/api/client/factures/[id]/pdf/route.ts` | 11 |
| 10 | `lib/rh/declarations-mra.ts` | 10 |

→ Domaines les plus touchés : **rapprochement bancaire**, **paie/IAS19**, **TVA export**, **uploads documents**.

### `tsconfig.json`
Correct (`strict: true`, `noEmit`, module bundler, paths `@/*`). RAS sur la config.

---

## 2. Pages / routes dupliquées (CRITIQUE)

| URL A | URL B (et C) | Vraiment doublon ? | Recommandation |
|---|---|---|---|
| `/client/rapprochement` (2352 l.) | `/client/rapprochement-mensuel` (413 l.) | **Non** — la mensuelle est une vue séparée (clôture mensuelle) | Renommer en `/client/rapprochement/cloture-mensuelle` pour clarifier |
| `/comptable/inter-societes` (431 l.) | `/comptable/interco` (511 l.) | **Oui, fonctionnel** — `interco` = validation virements DDS→OCC, `inter-societes` ≈ équivalent UX nouvelle gen | Choisir une, rediriger l'autre. Code presque dupliqué |
| `/comptable/clients` (365 l.) | `/comptable/mes-clients` (131 l.) | **Partiel** — `mes-clients` paraît être une vue simplifiée orphelinée | Supprimer `mes-clients` ou en faire un alias |
| `/client/nouvelle-facture` (1080 l.) | `/client/nouvelle-facture-ia` (407 l.) | **Non** — IA est l'assistant conversationnel, l'autre le formulaire manuel | Garder les deux, mais centraliser les fetchers communs |
| `/client/salaires` (887 l.) | `/client/salaires-compta` (222 l.) | **À examiner** — `salaires-compta` paraît être vue côté compta dans espace client | Préciser le scope ; renommer pour éviter confusion |
| `/client/salaires-compta` | `/rh/salaires-compta` (232 l.) | **OUI, vrai doublon** — même nom, même rendu (`SalairesComptaPage`) avec contexte différent | Factoriser en composant partagé `components/salaires/SalairesComptaView.tsx` |
| `/rh/eoy-bonus` (640 l.) | `/rh/paie/edf` (456 l.) · `/rh/provisions/eoy` (509 l.) | **Trois pages couvrant le même domaine "bonus fin d'année"** | Regrouper sous `/rh/paie/eoy/{bonus,edf,provision}` ; factoriser les calculs |
| `/rh/exports/paie` (1131 l.) | `/rh/exports-legaux` (297 l.) · `/rh/paie/exports-mra` (17 l.) | `/rh/paie/exports-mra` = **redirect-only** (déjà fait) ; `exports-legaux` ≠ `exports/paie` | Supprimer la redirection après période de grâce ; clarifier `exports-legaux` vs `exports/paie` |
| `/client/mra-cit` (147 l.) | `/client/mra-fiscalisation` (391 l.) | **Non doublon** — `mra-cit` = Corporate Income Tax, `mra-fiscalisation` = e-invoicing EBS | OK, mais regrouper sous `/client/mra/{cit,fiscalisation,roc,sft,tds}` (déjà partiellement fait via `/mra-hub`) |
| `/client/gbc-consolidation` (188 l.) | `/client/tiers-consolidation` (243 l.) | **Probable** — l'un parle de consolidation GBC, l'autre de fusion tiers | À renommer pour éviter confusion (`/client/tiers/fusionner` vs `/client/gbc/consolidation`) |

### Autres doublons probables détectés

- **9 routes "/client/mra-*"** + `/client/mra-hub` → hub OK, mais structure plate. Migrer vers `/client/mra/[type]`
- **8 routes "/client/gbc-*"** → idem, regrouper sous `/client/gbc/[volet]`
- **`components/layout/`** : 9 sidebars (Admin × 2, Comptable × 2, Client × 1, RH × 1, Salarie, Juridique, ClientPageShell) — 2 sont orphelines (`ComptableSidebar.tsx`, `AdminSidebarUnified.tsx`)

---

## 3. Dead code

### Composants orphelins confirmés (jamais importés)

| Fichier | Statut |
|---|---|
| `components/dashboard/dashboard-nav.tsx` | **0 import** |
| `components/dashboard/document-upload.tsx` | **0 import** |
| `components/video/HoverVideoCard.tsx` | **0 import** |
| `components/video/LazyVideo.tsx` | **0 import** |
| `components/video/ScrollVideo.tsx` | **0 import** |
| `components/video/VideoHero.tsx` | **0 import** |
| `components/editable/approval-workflow.tsx` | **0 import** |
| `components/editable/editable-bilan.tsx` | **0 import** |
| `components/editable/editable-chart-of-accounts.tsx` | **0 import** |
| `components/editable/editable-journal-entry.tsx` | **0 import** |
| `components/layout/AdminSidebarUnified.tsx` | **0 import** |
| `components/layout/ComptableSidebar.tsx` | **0 import** (remplacé par `ComptableSidebarNew`) |

→ **12 composants morts** = ~3000 lignes à supprimer.

### Endpoints API jamais référencés depuis le front (hors cron / paramètres dynamiques)

Endpoints **vraiment dead** (0 référence dans tout le repo, hors `route.ts` lui-même) :

- `/api/admin/backfill-releves-bancaires`
- `/api/admin/diag-team-leader`
- `/api/admin/diagnostic`
- `/api/admin/recompute-conges-nb-jours`
- `/api/admin/repair-orphan-documents`
- `/api/admin/wra-statut-rapport`
- `/api/alertes/generate`
- `/api/generer-previsionnel`
- `/api/me`
- `/api/messages`
- `/api/publier-document`

Suspects (≤ 1 référence, probable test/utility) :
- `/api/brief-client`, `/api/calculer-tresorerie`, `/api/client/conseils`, `/api/tiers-patterns`
- `/api/audit/sod-compliance`, `/api/jurisdictions`
- `/api/admin/fix-db`, `/api/admin/cash-in-lieu`, `/api/admin/recompute-accrual-mensuel`
- `/api/comptable/cta-recalc`, `/api/comptable/sante-pcm`

### Fichiers `lib/` orphelins (probables)

- `lib/tresorerie.ts`
- `lib/process-document.ts`
- `lib/bankFormats.ts`
- `lib/tokens.ts` (design tokens, jamais importé alors que ça devrait l'être par Framer Motion)
- `lib/types/index.ts` (centralise Role/DocumentType/etc — pas utilisé, types redéfinis ailleurs)
- `lib/credentials/employee-passwords.ts`
- `lib/planning/presets.ts` (le code utilise `lib/planning/ui-presets.ts`)
- `lib/rh/contratsTemplates.ts`
- **`lib/ifrs/*`** : 7 moteurs (ifrs9-ecl-engine, ifrs15-revenue-engine, ifrs16-leases-engine, ifrs13-fair-value-engine, ias36-impairment-engine, ias38-intangibles, ias7-cash-flow) → uniquement référencés par `lib/ifrs/__tests__/ifrs-engines.test.ts`. Le code prod réimplémente directement dans les routes API.

### Toast système doublonné

`components/ui/sonner.tsx` (utilisé) + `components/ui/toaster.tsx` + `components/ui/toast.tsx` + `components/ui/use-toast.ts` (3 fichiers Radix Toast, 1 seul `useToast` consumer dans `CascadeDeleteButton`) → un seul système devrait suffire.

---

## 4. Fichiers > 1000 lignes (red flag)

Top 20 :

| # | Lignes | Fichier |
|--:|--:|---|
| 1 | **5235** | `app/api/comptable/rapprochement/route.ts` |
| 2 | 3971 | `lib/i18n/rh_admin.ts` *(i18n, OK)* |
| 3 | 2800 | `lib/i18n/comptable.ts` *(i18n)* |
| 4 | 2744 | `app/rh/conges/page.tsx` |
| 5 | 2629 | `lib/help/content.ts` *(contenu)* |
| 6 | 2557 | `lib/help/content-en.ts` *(contenu)* |
| 7 | **2473** | `app/api/rh/paie/route.ts` |
| 8 | **2458** | `app/api/documents/upload/route.ts` |
| 9 | 2377 | `app/rh/planning/page.tsx` |
| 10 | 2352 | `app/client/rapprochement/page.tsx` |
| 11 | 2037 | `app/page.tsx` *(landing)* |
| 12 | 1882 | `app/tarifs/page.tsx` *(landing)* |
| 13 | 1772 | `lib/i18n/invoicing.ts` *(i18n)* |
| 14 | 1626 | `app/rh/employes/page.tsx` |
| 15 | 1534 | `app/client/facturation-settings/page.tsx` |
| 16 | 1513 | `lib/i18n/admin.ts` *(i18n)* |
| 17 | **1426** | `lib/accounting/intelligent-rapprochement.ts` |
| 18 | 1425 | `app/api/rh/conges/route.ts` |
| 19 | 1403 | `app/rh/societe/page.tsx` |
| 20 | 1358 | `app/rh/paie/page.tsx` |

**Total : 39 fichiers > 1000 lignes.** Hors fichiers de contenu (`i18n/*`, `help/content*`, landing), **8 fichiers métier critiques** dépassent 2000 lignes. Le hotspot absolu est `app/api/comptable/rapprochement/route.ts` à **5235 lignes** (avec 35 `as any` et 50 `console.log`).

---

## 5. Duplication code

### Patterns dupliqués détectés

1. **Sidebars** : 9 fichiers `components/layout/*Sidebar*.tsx` — structure quasi-identique (nav items + logout + role). Devrait être 1 composant `<RoleSidebar role="..." />` avec config par rôle.
2. **Helpers `fmt(n)` / `formatDate(d)`** : redéfinis dans pratiquement chaque page (`rapprochement-mensuel`, `salaires-compta` ×2, etc.). Devrait vivre dans `lib/utils/format.ts`.
3. **Fetchers Supabase répétés** : aucun `lib/api/*` ou `lib/fetchers/*` centralisé — chaque page fait son propre `fetch("/api/...")` avec gestion erreur ad-hoc.
4. **`salaires-compta`** : code quasi-identique entre `/client/salaires-compta` (222 l.) et `/rh/salaires-compta` (232 l.) — même fonction `SalairesComptaPage`, mêmes états, seule la source de société diffère.
5. **IFRS9 ECL** : moteur dans `lib/ifrs/ifrs9-ecl-engine.ts` + réimplémentation dans `app/api/comptable/ifrs9/ecl/route.ts`.
6. **Toast système double** (Radix Toast + Sonner).

### Server Components vs Client Components
- **176 / 190 pages** sont `"use client"` (92,6 %)
- **0 Server Action** (`"use server"`)
- App Router est utilisé presque uniquement comme un routeur SPA classique. Aucune RSC streaming, aucun avantage du modèle hybride Next.js 16.

---

## 6. Dépendances

### Packages **inutilisés / quasi-inutilisés** dans `package.json`

| Dépendance | Imports trouvés | Verdict |
|---|--:|---|
| `exceljs` (+ `@types/exceljs`) | **0 dans app/components/lib** (utilisé dans `scripts/` uniquement) | Déplacer en `devDependencies` ou supprimer si scripts plus utilisés |
| `cmdk` | 1 (`components/ui/command.tsx`) | OK mais via composant Radix non utilisé ailleurs — vérifier |
| `embla-carousel-react` | 1 | À vérifier |
| `html2pdf.js` | 1 (`app/client/bilan/page.tsx`) | OK |
| `input-otp` | 1 | À vérifier |
| `leaflet` (+ `react-leaflet` + `@types/leaflet`) | 1 (`app/rh/geolocalisation/MapComponent.tsx`) | OK mais lourd pour 1 page |
| `react-day-picker` | 1 | OK |
| `react-resizable-panels` | 1 | À vérifier |
| `vaul` | 3 | OK |
| `qrcode` (+ `@types/qrcode`) | 2 | OK |
| `recharts` | 3 | Peu utilisé pour 1 lib de graphs |
| `@react-three/drei` + `@react-three/fiber` | 3 (composants 3D landing) | OK landing, mais lourd (~150KB) |
| `@tiptap/*` (3 packages) | 1 (`components/rh/ContractEditor.tsx`) | OK |
| `playwright-core` + `@sparticuz/chromium` | 4-5 | OK (PDF rendering ?) |
| `gsap` | 2 | Très peu utilisé |
| `next-themes` | 2 (theme-provider + sonner) | À vérifier — pas de toggle dark visible |

### Versions
- **Next.js 16.2.0** ✓ très récent
- **React 19.2.4** ✓ très récent
- **Supabase JS ^2.100** ✓
- **TypeScript 5.7.3** ✓
- **ESLint v10** + `typescript-eslint` v8 ✓
- **Tailwind v4 + PostCSS** ✓
- Stack à jour, pas de dette de version.

### Scripts manquants
- Pas de `"lint:fix"`, `"typecheck"` (alias direct vers `tsc --noEmit`), `"format"` (pas de Prettier configuré).

---

## 7. Tests & couverture

- **40 fichiers de tests** (`*.test.ts` / `*.test.tsx`)
- Concentrés sur `lib/accounting/*` (13 tests), `lib/ifrs/__tests__`, `lib/audit/__tests__`, `lib/forex/__tests__`
- **Aucun test sur les pages / composants UI** (Vitest présent + `@vitest/coverage-v8`, mais 0 test React)
- **Aucun test E2E** (pas de Playwright config dans `tests/`)
- Coverage globale non calculable sans exécution — probablement < 5 % sur tout le repo (faible)

---

## 8. Conventions / qualité

### Points positifs
- `strict: true`, build TS clean
- 0 `@ts-ignore`
- 9 TODO/FIXME → faible dette annotée
- Tests présents sur la logique métier critique (accounting/IFRS)
- `i18n` structuré (`lib/i18n/*`)
- Stack à jour (Next 16, React 19)

### Points négatifs
- 689 `as any` → typage en façade
- 217 `console.log` en code prod (50 dans la route rapprochement, 51 dans uploads)
- 39 fichiers > 1000 lignes
- 9 sidebars dupliquées
- 92,6 % de pages `"use client"` (anti-pattern App Router)
- 0 Server Action
- `lib/ifrs/*` mort (testé mais non utilisé)
- 12 composants orphelins confirmés
- ~11 endpoints API morts
- Pas de Prettier, pas de pré-commit hook visible (ni `.husky/`)
- Pas de couverture UI / E2E

---

## Top 15 actions de cleanup prioritaires

1. **Découper `app/api/comptable/rapprochement/route.ts`** (5235 lignes, 35 `as any`, 50 `console.log`) en sous-modules dans `lib/accounting/rapprochement/` — c'est le plus gros risque de bug du repo.
2. **Supprimer les 12 composants orphelins** (`components/dashboard/dashboard-nav.tsx`, `document-upload.tsx`, `components/video/*` × 4, `components/editable/*` × 4, `AdminSidebarUnified.tsx`, `ComptableSidebar.tsx`) → ~3000 lignes en moins.
3. **Supprimer les 11 endpoints API morts** listés (admin/diagnostic, /api/me, /api/messages, /api/publier-document, etc.).
4. **Factoriser `salaires-compta`** (`/client/salaires-compta` + `/rh/salaires-compta`) en un composant `<SalairesComptaView />` partagé.
5. **Consolider les sidebars** : 1 seul `<RoleSidebar role="..." />` au lieu de 9 fichiers (~2000 lignes économisées).
6. **Choisir un seul système toast** : supprimer `components/ui/toaster.tsx`, `toast.tsx`, `use-toast.ts` (Sonner suffit). Migrer `CascadeDeleteButton` vers `toast` de sonner.
7. **Nettoyer les `console.log`** en code prod (217 → 0). Mettre un wrapper `logger` minimal qui no-op en prod.
8. **Réduire les `as any`** sur les top 5 fichiers (rapprochement, ClientSidebarFull, rh/conges, tva/export, documents/upload) — gain de typage majeur.
9. **Décider du sort de `lib/ifrs/*`** : soit migrer le code prod vers ces moteurs (DRY), soit supprimer les engines + leurs tests.
10. **Regrouper `/client/mra-*`** (9 routes) sous `/client/mra/[type]` ; idem `/client/gbc-*` (8 routes) → URL plus claires + code factorisé.
11. **Migrer `/rh/eoy-bonus` + `/rh/paie/edf` + `/rh/provisions/eoy`** vers une zone `/rh/paie/eoy/*` unifiée.
12. **Découper les 8 pages > 2000 lignes** en sous-composants (conges, planning, rapprochement, employes, facturation-settings, etc.).
13. **Introduire `lib/utils/format.ts`** (fmt, formatDate, formatCurrency) — détruire les ~50 redéfinitions locales.
14. **Introduire des Server Components et Server Actions** pour les pages lourdes en data (employes, planning) — actuellement 100 % côté client = perfs dégradées.
15. **Ajouter Prettier + pre-commit hook** (husky) + script `pnpm typecheck` + `pnpm lint:fix` dans `package.json`.

---

## Conclusion

Code **fonctionnellement riche** mais **structurellement endetté**. La stack est moderne (Next 16, React 19, TS strict, 0 erreur), mais la qualité interne souffre :
- gros fichiers monolithiques (rapprochement, paie, conges)
- typage de surface (689 `as any`)
- routes dupliquées ou abandonnées
- composants morts non supprimés
- usage anti-pattern d'App Router (presque tout en client)

Un cleanup ciblé sur les 15 actions ci-dessus apporterait une réduction estimée de **~10 000 lignes** mortes/redondantes et une remontée de la note de **5.5 → 7.5/10**.
