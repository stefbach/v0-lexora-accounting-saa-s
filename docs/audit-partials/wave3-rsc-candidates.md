# Wave 3 — Audit Server Components convertibles

**Agent** : V4-31/40 (Vague 4 UX/UI)
**Branche** : `roadmap/v4-ux-ui`
**Date** : 2026-05-24
**Scope** : Pages `app/**/page.tsx` actuellement marquées `"use client"`

## 1. Contexte

Next.js App Router favorise par défaut les Server Components (RSC).
`"use client"` doit être réservé aux composants nécessitant :

- État local (`useState`, `useReducer`)
- Effets navigateur (`useEffect`, `useLayoutEffect`)
- Event handlers DOM (`onClick`, `onChange`, `onSubmit`...)
- API navigateur (`localStorage`, `window`, `document`)
- Hooks React Context côté client
- Librairies clientes (Recharts, Framer Motion, react-pdf viewer...)

Sinon, la page peut/doit être convertie en RSC pour bénéficier de :
- Streaming SSR, HTML statique, payload JS réduit
- Accès direct aux secrets / Supabase service role
- Meilleur SEO et FCP

## 2. État des lieux

| Métrique | Valeur |
|---|---|
| Fichiers totaux `app/` | 197 |
| Fichiers `"use client"` | 197 |
| Pages (`page.tsx`) totales | 197 |
| **Pages `"use client"`** | **179 (90.9%)** |
| Pages RSC actuelles | 18 (9.1%) |

Anti-pattern confirmé : la quasi-totalité du tree est cliente alors qu'une
fraction non-négligeable n'utilise aucun hook ni event handler.

## 3. Méthodologie

Pour chaque `page.tsx` avec `"use client"`, comptage via `grep` de :
- Hooks d'état : `useState`, `useReducer`, `useEffect`, `useRef`,
  `useMemo`, `useCallback`, `useContext`
- Event handlers : `onClick=`, `onChange=`, `onSubmit=`, `onBlur=`,
  `onFocus=`, `onKeyDown=`, `onInput=`
- Hooks navigation : `useRouter`, `usePathname`, `useSearchParams`,
  `useParams` (Next.js — restent côté serveur en RSC sauf `useRouter`)
- React Hook Form : `useForm`, `FormProvider`, `react-hook-form`

**Note clé** : `lib/i18n.ts → getLocale()` lit `localStorage`. Toute page
qui appelle `getLocale()` directement est donc liée au client. Migration
RSC = soit (a) refactor i18n vers cookie/header, soit (b) extraire
le rendu locale-dépendant dans un petit composant client wrapper.

## 4. Difficultés

| Niveau | Critère |
|---|---|
| **Facile** | state=0, event=0, form=0 → conversion directe (retirer `"use client"`) éventuel remplacement `getLocale()` par lecture cookie |
| **Moyenne** | 1-2 hooks d'état OU 1-3 event handlers OU formulaire isolable → extraire un sous-composant client, garder le reste RSC |
| **Difficile** | >3 hooks d'état OU >3 event handlers OU chart/3D/PDF lib → refactor majeur, garder client mais split en sous-composants RSC pour les parties statiques |

## 5. Candidates par espace

### 5.1 Public / Auth (légales + landing)

| URL | Fichier | Lignes | Raison | Difficulté |
|---|---|---|---|---|
| `/cgu` | `app/cgu/page.tsx` | 146 | Pure lecture légale, aucun hook React, juste `getLocale` i18n | **Facile** |
| `/cgv` | `app/cgv/page.tsx` | 154 | Idem CGU, contenu statique légal | **Facile** |
| `/mentions-legales` | `app/mentions-legales/page.tsx` | 454 | Texte légal pur, gros gain JS bundle | **Facile** |
| `/protection-donnees` | `app/protection-donnees/page.tsx` | 119 | RGPD/PDPA statique | **Facile** |
| `/login` | `app/login/page.tsx` | 63 | Form HTML brut sans handler (formAction natif possible) | **Facile** |
| `/juridique` | `app/juridique/page.tsx` | 37 | 4 cartes `<Link>` statiques | **Facile** |
| `/pilotage-telegram` | `app/pilotage-telegram/page.tsx` | 481 | Landing produit, uniquement `<Link>` + `BrainOrb3DLazy` (déjà lazy client interne) | **Facile** |
| `/` (home) | `app/page.tsx` | 2037 | Landing : 1 useState (menu mobile) + 5 onClick (fermer menu) → extraire `<MobileMenu>` client, le reste RSC | **Moyenne** |
| `/auth/login` | `app/auth/login/page.tsx` | n/a | Formulaire login Supabase — garder client (handlers auth) | Difficile (à garder) |
| `/inscription` | `app/inscription/page.tsx` | n/a | Wizard signup multi-étapes | Difficile (à garder) |

### 5.2 Admin

| URL | Fichier | Lignes | Raison | Difficulté |
|---|---|---|---|---|
| `/admin/lexora-tooling` | `app/admin/lexora-tooling/page.tsx` | 345 | Catalogue read-only skills+MCP, aucun hook, aucun handler | **Facile** |
| `/admin/health` | `app/admin/health/page.tsx` | 355 | 7 useState (fetch monitoring) + 2 handlers → fetch en RSC + sous-composant refresh client | **Moyenne** |

Autres pages admin (`users`, `clients`, `comptables`, `societes`,
`plans`, `services`, `lexora-billing/*`, `demandes-inscription`,
`purge`, `repair`, `reset-societe`, `documents`, `parametres`)
= Difficile (CRUD multi-tables, modals, edition inline).

### 5.3 Comptable

| URL | Fichier | Lignes | Raison | Difficulté |
|---|---|---|---|---|
| `/comptable/mes-clients` | `app/comptable/mes-clients/page.tsx` | 131 | 4 useState (fetch), aucun onClick → fetch côté serveur, extraire interactions | **Moyenne** |
| `/comptable/salaires` | `app/comptable/salaires/page.tsx` | 187 | 9 useState mais aucun handler → typiquement fetch+display, RSC + Suspense | **Moyenne** |
| `/comptable/clients/[clientId]/[societeId]/previsionnel` | idem | 375 | 7 useState + 1 handler + 2 router → extraire wizard client | **Moyenne** |

Autres pages comptable = Difficile (workflows rapprochement, contrats,
chat IA, génération PDF).

### 5.4 RH

| URL | Fichier | Lignes | Raison | Difficulté |
|---|---|---|---|---|
| `/rh/paie/exports-mra` | `app/rh/paie/exports-mra/page.tsx` | 17 | Quasi-vide (proxy redirect), 2 useState/router triviaux | **Facile** |
| `/rh/salaires-compta` | `app/rh/salaires-compta/page.tsx` | 232 | 8 useState mais 0 handler → fetch côté serveur + tableau RSC | **Moyenne** |
| `/rh/parametres` | `app/rh/parametres/page.tsx` | 247 | 5 useState 0 handler → idem | **Moyenne** |
| `/rh/conges/parametres` | `app/rh/conges/parametres/page.tsx` | 505 | 6 useState + 2 handlers → mixte | **Moyenne** |

Autres RH (`employes`, `paie`, `pointage`, `planning`, `conges`,
`declarations-mra`, `trajets-km`, `manager`, `chat`, etc.)
= Difficile (formulaires saisie, drag&drop, calendriers interactifs).

### 5.5 Client (espace société)

| URL | Fichier | Lignes | Raison | Difficulté |
|---|---|---|---|---|
| `/client/chat-rh` | `app/client/chat-rh/page.tsx` | 7 | Wrapper `dynamic(..., {ssr:false})` autour de `/rh/chat` → `"use client"` inutile sur le wrapper | **Facile** |
| `/client/conges` | `app/client/conges/page.tsx` | 4 | Idem wrapper dynamic | **Facile** |
| `/client/employes` | `app/client/employes/page.tsx` | 4 | Idem wrapper dynamic | **Facile** |
| `/client/pointage` | `app/client/pointage/page.tsx` | 4 | Idem wrapper dynamic | **Facile** |
| `/client/fiscal-freelance` | `app/client/fiscal-freelance/page.tsx` | 160 | `useProfile` + i18n — extraire gate `RequireRole` en client, contenu en RSC | **Moyenne** |
| `/client/leases` | `app/client/leases/page.tsx` | 92 | 5 useState + 1 handler → IFRS 16 dashboard, fetchable côté serveur | **Moyenne** |
| `/client/mra-hub` | `app/client/mra-hub/page.tsx` | 124 | 5 useState + 1 handler → cartes MRA majoritairement read-only | **Moyenne** |
| `/client/select-societe` | `app/client/select-societe/page.tsx` | 203 | 2 useState + 1 handler + router → liste sociétés (RSC) + bouton "Sélectionner" client | **Moyenne** |
| `/client/tableau-de-bord-financier` | idem | 121 | 5 useState + 2 handlers — KPI dashboard | **Moyenne** |
| `/client/notifications` | `app/client/notifications/page.tsx` | 276 | 5 useState 0 handler → liste notifs RSC + bouton mark-read client | **Moyenne** |
| `/client/gbc-dashboard` | idem | 260 | 6 useState + 1 handler — dashboard GBC | **Moyenne** |
| `/client/ifrs9-ecl` | idem | 240 | 7 useState + 2 handlers — affichage ECL | **Moyenne** |
| `/client/revenus-depenses` | idem | 320 | 8 useState + 1 handler — graphe à isoler | **Moyenne** |
| `/client/alertes` | idem | 348 | 5 useState + 2 handlers | **Moyenne** |
| `/client/demandes-rh` | idem | 344 | 6 useState + 2 handlers | **Moyenne** |
| `/client/settings/google-accounts` | idem | 173 | 7 useState + 3 handlers — OAuth callback | **Moyenne** |
| `/client/factures/import` | idem | 279 | 6 useState + 4 handlers — upload form | **Moyenne** |

Autres pages client (`banque`, `rapprochement`, `tableau-de-bord`,
`grand-livre`, `bilan`, `ecritures`, `nouvelle-facture*`,
`mra-fiscalisation`, `mra-cit`, `tva`, `it-form3`, `gbc-pillar-two`,
`gbc-crs-fatca`, `assistant`, `lex-ocr`, `telegram-*`, etc.)
= Difficile (interactions denses, modals, formulaires, AI streaming,
PDF live).

### 5.6 Autres

| URL | Fichier | Lignes | Raison | Difficulté |
|---|---|---|---|---|
| `/redirect` | `app/redirect/page.tsx` | 71 | 2 useState mais c'est un router redirector — garder client (uses `useRouter` push) | Difficile (à garder) |

## 6. Stats globales

| Difficulté | Nombre | % du parc client |
|---|---|---|
| **Facile** (RSC pur, conversion directe) | **13** | 7.3% |
| **Moyenne** (split client/serveur partiel) | **~21** | 11.7% |
| **Difficile** (rester `"use client"`) | **~143** | 79.9% |
| Restent client volontairement (auth, wizard) | 2 | 1.1% |

**Total candidates convertibles** : **34 pages** (18.9% du parc client)
dont **13 quick-wins immédiats**.

## 7. Top 10 quick-wins (à traiter en priorité)

Pages **Facile** classées par gain potentiel (taille bundle, fréquence
de visite, SEO) :

1. **`/`** (`app/page.tsx`, 2037 lignes) — landing publique, gain SEO+FCP massif. Extraire `<MobileMenu>` client, tout le reste RSC.
2. **`/pilotage-telegram`** (481 lignes) — landing produit, SEO critique.
3. **`/mentions-legales`** (454 lignes) — texte légal RGPD, statique.
4. **`/cgv`** (154 lignes) — page légale.
5. **`/cgu`** (146 lignes) — page légale.
6. **`/protection-donnees`** (119 lignes) — RGPD/PDPA.
7. **`/admin/lexora-tooling`** (345 lignes) — doc interne read-only.
8. **`/login`** (63 lignes) — form natif sans JS (formAction).
9. **`/juridique`** (37 lignes) — 4 cartes statiques.
10. **`/client/{chat-rh,conges,employes,pointage}`** (4 wrappers, ~5 lignes chacun) — `"use client"` inutile sur des wrappers `next/dynamic`.

## 8. Pré-requis transverse

Avant de convertir massivement :

1. **Refactor `lib/i18n.ts → getLocale()`** pour ne plus dépendre de
   `localStorage`. Stocker la locale en cookie httpOnly (lecture serveur
   via `cookies()` de `next/headers`) → débloque ~10 pages "facile" et
   permet beaucoup de "moyenne".
2. **Audit des composants `components/layout/ClientPageShell`,
   `LegalShell`** : vérifier qu'ils ne réimposent pas `"use client"` en
   cascade.
3. **Documenter pattern recommandé** : page = RSC, fetch Supabase
   service role, props passées à un `<XxxClient>` interactif minimal.

## 9. Estimation effort

- Phase 1 (quick-wins Facile, sans refactor i18n) : **2-3 j-h**, 13 pages.
- Phase 2 (refactor `getLocale` + 5 pages légales/landing) : **1 j-h**.
- Phase 3 (pages Moyenne, split client/serveur) : **8-10 j-h**, ~21 pages.

Gain attendu : **-30% JS bundle initial** sur les routes publiques,
**-15%** sur l'espace client moyen, FCP < 1.5s sur landing.
