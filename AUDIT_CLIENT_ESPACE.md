# Audit complet — Espace Client Dirigeant (`/client`)

> Audit en lecture seule du `2026-04-17`. Aucune modification de code.
> Branche : `claude/audit-client-dashboard-dNI9N`.
> Périmètre : `app/client/**`, `app/api/client/**`, helpers Supabase, middleware, layouts client.

---

## Section 10 — Résumé exécutif

| Métrique | Valeur |
|---|---|
| Pages dans `app/client/**` | **51** fichiers `.tsx` (49 `page.tsx` + 1 `[id]/page.tsx` + 1 `layout.tsx`) |
| Routes API dans `app/api/client/**` | **14** routes (`route.ts`) |
| Pages qui mélangent silencieusement plusieurs sociétés | **5 confirmées** (`page.tsx` `/client`, `mes-comptes`, `banque` fallback, `tableau-de-bord` mode "all", `factures` fallback). 4 autres à risque ("all" mode). |
| Routes API avec verdict 🔴 ou 🟡 | **9 sur 14** : 🔴×4 (`actions`, `echeances`, `factures` POST/PATCH/DELETE, `investissements`) + 🟡×5 (`conseils`, `previsionnel`, `facture-template`, `tiers-offshore`, `societes` PATCH) |
| Complexité estimée de la refonte | **L → XL** (51 pages à toucher pour passer en mode mono-société, refactor du contexte société, ajout d'un guard d'accès systématique côté API, refonte des sidebars) |

**3 points URGENTS à traiter avant la refonte :**
1. 🔴 **Fuite cross-société sur 4 routes API** (`actions`, `echeances`, `investissements`, `factures` POST/PATCH/DELETE) : un utilisateur peut modifier les factures / échéances / investissements de N'IMPORTE QUELLE société dont il connaît l'`id`. Aucune vérification via `user_societes`. Ces routes utilisent toutes la `SUPABASE_SERVICE_ROLE_KEY` (RLS bypassé).
2. 🔴 **Dashboard `/client` (`app/client/page.tsx:212`) et `/client/mes-comptes` (`mes-comptes/page.tsx:17`) appellent `/api/client/financial` SANS `societe_id`** → KPIs (CA, dépenses, bénéfice, trésorerie) et soldes bancaires sont la **somme de toutes les sociétés** du dirigeant. Un client avec DDS + OCC voit "CA = 100k" sans savoir d'où ça vient.
3. 🔴 **Pas de Context React partagé pour la société active** : chaque page refait `fetch("/api/client/societes")` puis `setSelected(societes[0].id)`. Le `SocieteFilterProvider` existe dans `components/client/societe-filter.tsx` mais **n'est utilisé NULLE PART** (code mort). Pattern `societes[0]` répété **18+ fois**. La refonte doit poser un Context (ou cookie/URL param) avant tout.

---

## Sommaire

- [Section 1 — Inventaire des pages /client](#section-1--inventaire-des-pages-client)
- [Section 2 — Inventaire des API routes /api/client](#section-2--inventaire-des-api-routes-apiclient)
- [Section 3 — Gestion actuelle de societe_id](#section-3--gestion-actuelle-de-societe_id)
- [Section 4 — Middleware et auth](#section-4--middleware-et-auth)
- [Section 5 — Table user_societes — usage effectif](#section-5--table-user_societes--usage-effectif)
- [Section 6 — Pages qui mélangent plusieurs sociétés](#section-6--pages-qui-mlangent-plusieurs-socits)
- [Section 7 — Composants de layout (Sidebar, Header)](#section-7--composants-de-layout-sidebar-header)
- [Section 8 — Dépendances transversales](#section-8--dpendances-transversales)
- [Section 9 — Risques et points d'attention](#section-9--risques-et-points-dattention)

---

## Section 2 — Inventaire des API routes `/api/client`

### Vue d'ensemble

| Route | URL | Méthodes | Accepte `societe_id` ? | Vérifie via `user_societes` ? | Si `societe_id` absent | Auth | Service-role | Verdict |
|---|---|---|---|---|---|---|---|---|
| `actions/route.ts` | `/api/client/actions` | POST | non (utilise `document_id` / `facture_id`) | ❌ aucune vérif d'appartenance | n/a | `auth.getUser()` + role gate (l. 13-17) | non | 🔴 |
| `alertes/route.ts` | `/api/client/alertes` | GET | non — accepte `client_id` query | ✅ via dossiers (rôle gate l. 48-54) | défaut = `user.id`, fan-out tous dossiers | `auth.getUser()` (l. 36) | oui (l. 39) | 🟢 |
| `conseils/route.ts` | `/api/client/conseils` | GET | oui (query, optionnel, l. 50) | ❌ filtre par `societe_id` mais ne vérifie PAS qu'il appartient au caller | fan-out tous les dossiers du `client_id` | `auth.getUser()` (l. 29) | oui (l. 32) | 🟡 |
| `documents/route.ts` | `/api/client/documents` | GET | non (déduit via dossiers + role) | ✅ rôle-based, expansion via `user_societes` (l. 53-117) | n/a | `auth.getUser()` (l. 17) | oui (l. 24) | 🟢 |
| `echeances/route.ts` | `/api/client/echeances` | POST | oui (body, requis pour `apply_30_days` & batch) | ❌ **aucune** vérif d'appartenance avant query factures | `extract_one` n'exige même pas le `societe_id` | `auth.getUser()` (l. 22) | oui (l. 25) | 🔴 |
| `facture-template/route.ts` | `/api/client/facture-template` | POST | oui (multipart form, optionnel) | ❌ pas de vérif | template créé en `societe_id: null` (global, accessible par tout le monde) | `auth.getUser()` (l. 20) | oui (l. 174) | 🟡 |
| `factures/route.ts` | `/api/client/factures` | GET, POST, PATCH, DELETE | oui (query GET, body POST) | **GET ✅** (l. 127-135 user_societes) ; **POST/PATCH/DELETE ❌** | GET sans filtre = toutes sociétés du caller | `auth.getUser()` × 4 | oui sur les 4 méthodes | 🔴 (POST/PATCH/DELETE) |
| `factures/[id]/pdf/route.ts` | `/api/client/factures/[id]/pdf` | GET | non (id dans path) | ✅ via `user_societes` (l. 90-98) | n/a | `auth.getUser()` (l. 75) | oui (l. 79) | 🟢 |
| `financial/route.ts` | `/api/client/financial` | GET | oui (query `societe_id`, optionnel, l. 110) | ⚠️ filtre par `societe_id` mais ne vérifie pas que le caller a accès — repose sur le `targetClientId` | **fan-out à TOUTES les sociétés du `targetClientId`** (l. 127-146) ⚠️ source de tous les bugs UI | `auth.getUser()` (l. 71) | oui (l. 74) | 🟡 |
| `investissements/route.ts` | `/api/client/investissements` | GET, POST, DELETE | oui (query/body, requis pour GET et POST) | ❌ aucune vérif | 400 si absent | `auth.getUser()` × 3 | oui sur les 3 | 🔴 |
| `previsionnel/route.ts` | `/api/client/previsionnel` | GET | oui (query, optionnel, l. 50) | ❌ pas de vérif d'appartenance | fan-out tous dossiers du `client_id` | `auth.getUser()` (l. 29) | oui (l. 32) | 🟡 |
| `societes/route.ts` | `/api/client/societes` | GET, POST, PATCH | oui (PATCH via `?id=`) | **GET ✅** (résolution complexe par rôle l. 18-79) ; **POST ✅** (lie `created_by`) ; **PATCH ❌** (l. 192 `update().eq('id',id)` sans vérif) | GET = toutes sociétés visibles ; POST crée ; PATCH 400 | `auth.getUser()` × 3 | oui (POST, PATCH) | 🟡 (PATCH) |
| `tiers-offshore/route.ts` | `/api/client/tiers-offshore` | POST | oui (body, requis l. 34) | ❌ rôle gate uniquement, pas de vérif `user_societes` | 400 | `auth.getUser()` (l. 24) | oui (l. 38) | 🟡 |
| `users/route.ts` | `/api/client/users` | GET, POST, PATCH | oui (body POST/PATCH `societe_id` / `societe_ids`) | ✅ non-admins limités à leurs sociétés (l. 72-96, 149-165, 246-257) | 100% scoped | `getAuthUser()` helper (l. 17-24) | oui (admin client) | 🟢 |

### Détail par route critique

#### 🔴 `app/api/client/actions/route.ts` (POST)
- **Auth** : `auth.getUser()` l. 10 + rôle gate `client_admin|client_user|admin` l. 13-17.
- **Pas de `societe_id`** — manipule directement `document_id` et `facture_id`.
- **Lignes incriminées** :
  - l. 27-28 (`commenter_document`) : update sur `documents` par `id` sans vérif que le document appartient à une société du caller.
  - l. 52-55 (`approuver_facture`) : update sur `factures` par `id` sans vérif.
- **Exploit** : un `client_admin` connaissant un `facture.id` ou `document.id` peut **commenter / approuver / changer le statut de N'IMPORTE QUELLE facture ou document**, y compris d'une autre société.

#### 🔴 `app/api/client/echeances/route.ts` (POST)
- **Auth** : `auth.getUser()` l. 22.
- **Cas `apply_30_days`** (l. 33-37) : query `factures.update().eq('societe_id', societe_id)` — applique +30j à TOUTES les factures du `societe_id` passé. Aucune vérif d'appartenance.
- **Cas `extract_one`** (l. 53-58) : prend un `facture_id` arbitraire, fetch facture + document associé, lance n8n. Aucune vérif.
- **Cas batch** (l. 101-109) : query `factures.in('id', facture_ids)`. Aucune vérif.
- **Exploit** : un caller authentifié peut différer de 30 jours toutes les factures d'une société tierce.

#### 🔴 `app/api/client/investissements/route.ts` (GET, POST, DELETE)
- **Auth** : `auth.getUser()` × 3.
- **GET** (l. 23-31) : `eq('societe_id', societe_id)` direct, sans vérif.
- **POST** (l. 52-76) : insert dans `investissements_previsionnel`, sans vérif.
- **DELETE** (l. 91-95) : delete par `id`, sans vérif.
- **Exploit** : créer / lister / supprimer les investissements de toute société.

#### 🔴 `app/api/client/factures/route.ts`
- **GET** (l. 116-173) : ✅ vérifie que `societe_id` ∈ `user_societes` du caller (l. 127-135). **Tenant isolation correcte.**
- **POST** (l. 175-339) : exige `societe_id` (l. 195) mais **ne vérifie PAS** que le caller y a accès → un user peut créer une facture dans n'importe quelle société.
- **PATCH** (l. 341-442) : fetch facture par `id` (l. 354), check transition de statut (l. 360-369), mais **ne vérifie pas** le `societe_id` de la facture vs `user_societes`. Pire : `societe_id` est dans la whitelist `allowedUpdates` (l. 363) → un caller peut **réassigner une facture à une autre société**.
- **DELETE** (l. 444-505) : fetch par `id` (l. 456), **aucune vérif d'appartenance** avant `delete().eq('id', id)` (l. 495-498).

#### 🟡 `app/api/client/financial/route.ts` (GET)
- **Auth** : `auth.getUser()` l. 71.
- **`?societe_id=`** (l. 110) : si fourni, filtre `dossiers.eq('societe_id', requestedSocieteId)` (l. 112). **Ne vérifie pas** que le caller possède cette société, mais ça vient indirectement du fait que `dossiers.client_id` est filtré sur `targetClientId = user.id` (l. 98, 111). ⚠️ Fragile : si une société partagée a plusieurs dossiers, l'expansion l. 122-126 récupère `sharedDossiers` sans recheck.
- **Sans `societe_id`** (l. 127-146) : récupère **TOUTES les sociétés** liées au caller via `dossiers` + `created_by` + `sharedDossiers`. Renvoie des KPIs **agrégés sur toutes les sociétés**. C'est la **source du bug DDS+OCC** côté API : l'agrégation est légitimement renvoyée, et c'est aux pages d'éviter de l'appeler nu.
- **Délégation comptable** : si `?client_id=` ≠ `user.id`, exige rôle `comptable|comptable_dedie|admin` (l. 100-106). ✅
- **Verdict** : 🟡 — ne fuit pas vers d'autres clients, mais l'agrégation par défaut est l'origine indirecte de tous les bugs UI listés en Section 6.

#### 🟡 `app/api/client/conseils/route.ts` & `previsionnel/route.ts`
Même pattern que `financial` : `?societe_id=` optionnel, fan-out à toutes les sociétés du `client_id` si absent. Pas de vérif que `societe_id` ∈ sociétés du caller. **Risque** : un comptable dédié pourrait, en passant un `societe_id` non assigné, requêter le prévisionnel d'une autre société.

#### 🟡 `app/api/client/societes/route.ts` PATCH (l. 172-198)
- l. 192 : `admin.from('societes').update(updateData).eq('id', id)` — **aucune vérif** d'appartenance. Un caller authentifié peut renommer / changer BRN / TVA / adresse de **n'importe quelle société**.

#### 🟡 `app/api/client/facture-template/route.ts`
- l. 207 : si `societe_id` absent, template inséré avec `societe_id: null` → template **global**, visible / utilisable par tous les utilisateurs de la plateforme.

#### 🟡 `app/api/client/tiers-offshore/route.ts`
- Rôle gate l. 27-29 ✅, mais **pas de vérif `user_societes`** → un `client_admin` peut marquer un tiers comme offshore pour une société qui n'est pas la sienne (impacts fiscaux possibles).

### Anti-patterns systémiques côté API

1. **Service-role omniprésent** : 13 routes sur 14 utilisent `SUPABASE_SERVICE_ROLE_KEY`, ce qui bypasse RLS. Sécurité = la qualité des checks applicatifs (qui sont incomplets).
2. **Asymétrie GET vs mutation** : `factures` GET vérifie `user_societes`, mais POST/PATCH/DELETE non. Trace d'une migration de sécurité inachevée.
3. **Fan-out silencieux quand `societe_id` est omis** : `financial`, `conseils`, `previsionnel`, `factures` GET, `documents` GET — pratique dangereuse pour l'UI (cf. Section 6) et inutile pour la majorité des cas d'usage.
4. **`?client_id=` accepté sans gate strict** : `financial`, `alertes`, `conseils`, `previsionnel` acceptent `client_id` et autorisent les comptables. Pas un bug mais zone à durcir.



## Section 6 — Pages qui mélangent plusieurs sociétés

### Cause racine

`/api/client/financial` (route déjà auditée Section 2) **renvoie les KPIs agrégés sur TOUTES les sociétés du caller** quand `?societe_id=` est omis (l. 127-146 du fichier). Toute page UI qui appelle `fetch("/api/client/financial")` nu reçoit donc des nombres mélangés.

### Pages confirmées en bug

| Page | Symptôme | Lignes coupables | Gravité |
|---|---|---|---|
| `app/client/page.tsx` (Dashboard `/client`) | KPIs `chiffreAffaires`, `depenses`, `benefice`, `tresorerie` = somme **toutes sociétés**. Pire : le `brief-client` est correctement scopé sur `firstSociete` (l. 203-211) tandis que les KPIs financiers sont agrégés (l. 212) → **incohérence visible : "Conseil du mois" parle de la société A mais les chiffres mélangent A+B**. | l. 197 `firstSociete = societes[0]` ; l. 212 `fetch("/api/client/financial")` SANS `societe_id` ; l. 237-249 `setKpis(...)` à partir de cet agrégat. | 🔴 critique |
| `app/client/mes-comptes/page.tsx` | "Trésorerie totale" = somme des soldes de **tous les comptes bancaires de toutes les sociétés**. Pas de selector. | l. 17 `fetch("/api/client/financial")` ; l. 18 `setComptes(d.comptes_bancaires \|\| [])` ; l. 23 `totalMur = comptes.reduce(...)` ; l. 37 affichage. | 🔴 critique |
| `app/client/banque/page.tsx` | Fallback non-gardé : si `selectedSociete` est vide ou `"all"` au premier chargement, l. 75 fetch SANS filtre → données bancaires de toutes les sociétés. Le `setSelectedSociete(socs[0].id)` ne se fait qu'**après** le premier fetch (l. 86), donc le 1er render est mélangé. | l. 73-75 ternaire avec branche unfiltered ; l. 99-103 useEffect qui déclenche `fetchData(selectedSociete)` avec `selectedSociete=""`. | 🔴 critique |
| `app/client/tableau-de-bord/page.tsx` | Comporte un `<SelectItem value="all">Toutes mes sociétés</SelectItem>` (l. 270). En mode "all", l. 90 ne pose pas de `societe_id=` → KPIs, chart d'évolution mensuelle (chartFetches l. 101-104) et alertes (l. 130-189) sont **agrégés sans étiquetage par société**. | l. 90 `base = selected !== "all" ? ... : ""` ; l. 270 option "all". | 🟠 moyen (l'utilisateur a choisi explicitement "all" — UX trompeuse mais pas silencieuse) |
| `app/client/factures/page.tsx` | Au tout premier render, `societes[0]?.id` est utilisé (l. 258) mais le composant fetch peut tomber sur la branche unfiltered de `/api/client/financial`. À vérifier au cas par cas selon le flow réel. | l. 256-258 et conditions de fetch financial. | 🟠 moyen |

### Pages à risque (mode "all" présent — agrégation explicite mais non labellisée)

| Page | Selector "all" ? | Risque |
|---|---|---|
| `app/client/bilan/page.tsx` | Oui (l. 504-512) ; `selectedSoc = societes.find(...) \|\| societes[0]` (l. 458) | 🟠 — bilan agrégé multi-sociétés non distingué visuellement |
| `app/client/tva/page.tsx` | Oui (selector "all" l. 411-417) — quand sélectionné, `?societe_id=` n'est pas posé | 🔴 — **export MRA TVA agrégé sur 2 sociétés est juridiquement faux** (déclaration par BRN) |
| `app/client/echeances/page.tsx` | Oui — `socId = selectedSociete && selectedSociete !== "all" ? selectedSociete : societes[0]?.id` (l. 113, 179, 211) — fallback `societes[0]` permanent | 🟠 |
| `app/client/rapprochement/page.tsx` | Oui — selector + "all" | 🟠 |
| `app/client/documents/page.tsx` | Oui — "Toutes les sociétés — détection auto" (l. 461-476). En "all", le fan-out OCR peut catégoriser un document dans la mauvaise société. | 🔴 — risque de **rattachement OCR au mauvais dossier** |
| `app/client/annual-return/page.tsx` | Oui (selector + societes[0] fallback l. 219-220) — exports ROC | 🔴 — Annual Return est par société (BRN unique), agrégation = faux |
| `app/client/it-form3/page.tsx` | À vérifier — selector + query `?societe_id=` propre vers `/api/comptable/it-form3` (l. 145, 309) | 🟢 par défaut |

### Pages saines (filtrage strict par `societe_id`)

- `app/client/grand-livre/page.tsx` — utilise `/api/comptable/grand-livre` avec `societe_id` requis (l. 96).
- `app/client/rapprochement-mensuel/page.tsx` — `/api/comptable/rapprochement?societe_id=` (l. 47).
- `app/client/fournisseurs/page.tsx` — `/api/comptable/factures?societe_id=` (l. 69).
- `app/client/ecritures/page.tsx` — `/api/comptable/ecritures?societe_id=` (l. 104).
- `app/client/tableau-de-bord-financier/page.tsx` — POST `/api/generer-tableau-de-bord` avec `societe_id` requis (l. 32, button `disabled={!societe}` l. 54).

### Top 5 bugs à corriger en priorité

1. **`app/client/page.tsx:212`** — Dashboard `/client` mélange tout. Corriger en passant `?societe_id=${firstSociete.id}` (déjà connu l. 197).
2. **`app/client/mes-comptes/page.tsx:17`** — Idem, ajouter selector OU passer `?societe_id=`.
3. **`app/client/banque/page.tsx:75`** — Garder le fetch derrière `if (selectedSociete)` ; charger d'abord la liste des sociétés synchroniquement.
4. **`app/client/tva/page.tsx`** — Désactiver le mode "all" pour la TVA MRA (déclaration par BRN), forcer une société.
5. **`app/client/annual-return/page.tsx`** — Idem : Annual Return est mono-société par essence.

⚠️ **Note** : tous ces bugs disparaissent naturellement avec la refonte "une société active à la fois" — le `societe_id` deviendra obligatoire dans tous les fetch.



## Section 1 — Inventaire des pages `/client`

### Tableau exhaustif (49 page.tsx + layout)

| Fichier | Route URL | Rôles | Lignes | Utilise `societe_id` ? | Mode d'obtention | Mode "all" ? |
|---|---|---|---|---|---|---|
| `app/client/page.tsx` | `/client` | `client_admin`, `client_user`, `client_assistant` (via redirect) | 691 | partiel | `societes[0]` (l. 197, 666) + `brief-client` passe `societe_id`, mais `financial` non | non |
| `app/client/layout.tsx` | `/client/*` | tous | 27 | non (choisit la sidebar selon `profile.role`) | n/a | n/a |
| `app/client/alertes/page.tsx` | `/client/alertes` | bloque `client_user` (l. 115) | 340 | non | fetch `/api/client/alertes` directement | non |
| `app/client/annual-return/page.tsx` | `/client/annual-return` | bloque `client_user` (l. 453) | 1227 | oui | selector + `societes[0]` fallback (l. 219-220) | non |
| `app/client/assistant/page.tsx` | `/client/assistant` | `client_assistant` surtout | 936 | oui | `societes[0].societe_id` pour confirm (l. 286) + selector complet (l. 461-476) | oui |
| `app/client/banque/page.tsx` | `/client/banque` | bloque `client_user` (l. 129) | 617 | oui | selector + `societes[0]` fallback (l. 86) | oui (bug — cf. Section 6) |
| `app/client/bilan/page.tsx` | `/client/bilan` | bloque `client_user` (l. 438) | 792 | oui | selector + `societes[0]` fallback (l. 458) | oui |
| `app/client/chat-rh/page.tsx` | `/client/chat-rh` | — | 7 | n/a | **stub** : `dynamic(() => import('@/app/rh/chat/page'))` | n/a |
| `app/client/compte-courant/page.tsx` | `/client/compte-courant` | — | 565 | oui | selector (l. 169-173) ; `societes[0]` au fetch (l. 57) | oui |
| `app/client/conges/page.tsx` | `/client/conges` | — | 4 | n/a | **stub** dynamic vers `/app/rh/conges/page` | n/a |
| `app/client/declarations-sociales/page.tsx` | `/client/declarations-sociales` | — | 321 | oui | `societes[0]` initial (l. 77) + selector (l. 61) | non |
| `app/client/demandes-rh/page.tsx` | `/client/demandes-rh` | — | 344 | non visible | n/a | non |
| `app/client/documents/page.tsx` | `/client/documents` | gate partiel `client_admin` (l. 631) | 997 | oui | selector "Toutes les sociétés — détection auto" (l. 461-476) ; `societes[0]` fallback (l. 295) | oui (risque OCR mis-classé) |
| `app/client/documents/[id]/page.tsx` | `/client/documents/:id` | — | ⚠️ À vérifier (non lu intégralement) | via param d'URL | route param `[id]` | non |
| `app/client/echeances/page.tsx` | `/client/echeances` | bloque `client_user` (l. 389) | 823 | oui | selector + `societes[0]` fallback 3× (l. 113, 179, 211) | oui |
| `app/client/ecritures/page.tsx` | `/client/ecritures` | — | 540 | oui | selector (l. 80-85) vers `/api/comptable/ecritures` | non (API comptable exige `societe_id`) |
| `app/client/elaboration-paie/page.tsx` | `/client/elaboration-paie` | — | 440 | oui | selector | non |
| `app/client/employes/page.tsx` | `/client/employes` | — | 4 | n/a | **stub** dynamic vers `/app/rh/employes/page` | n/a |
| `app/client/exports-rh/page.tsx` | `/client/exports-rh` | — | 993 | oui | state local + `/api/comptable/societes` (l. 132) | oui (exports tous) |
| `app/client/facturation-settings/page.tsx` | `/client/facturation-settings` | — | 795 | partiel | lit majoritairement `localStorage` (settings fact, clients, catalogue) | non |
| `app/client/facture-preview/page.tsx` | `/client/facture-preview` | — | 355 | non | query param `?id=` (document preview) | n/a |
| `app/client/facture-template/page.tsx` | `/client/facture-template` | — | 7 | n/a | **stub 7 lignes** (probablement vide) | n/a |
| `app/client/factures/page.tsx` | `/client/factures` | — | 710 | oui | selector + `societes[0]` fallback (l. 258) | oui |
| `app/client/factures/import/page.tsx` | `/client/factures/import` | — | ⚠️ À vérifier | `societes[0]` fallback (l. 94) | form upload + auto-detect | non |
| `app/client/fiscal-freelance/page.tsx` | `/client/fiscal-freelance` | bloque `client_user` (l. 17) | 172 | non | n/a | non |
| `app/client/fournisseurs/page.tsx` | `/client/fournisseurs` | — | 599 | oui | selector (l. 55-61) vers `/api/comptable/factures` | non |
| `app/client/grand-livre/page.tsx` | `/client/grand-livre` | — | 392 | oui | state + `?societe_id=` requis par API comptable | non |
| `app/client/it-form3/page.tsx` | `/client/it-form3` | — | 866 | oui | selector + query `?societe_id=` vers `/api/comptable/it-form3` | non |
| `app/client/mes-comptes/page.tsx` | `/client/mes-comptes` | — | 80 | **non** | agrège `/api/client/financial` SANS filtre (l. 17) | bug 🔴 |
| `app/client/notifications/page.tsx` | `/client/notifications` | — | 232 | non | n/a | non |
| `app/client/nouvelle-facture/page.tsx` | `/client/nouvelle-facture` | — | 603 | oui | `societes[0]` initial (l. 104) + localStorage settings | non |
| `app/client/parametres-rh/page.tsx` | `/client/parametres-rh` | — | 695 | non | localStorage uniquement | non |
| `app/client/planning/page.tsx` | `/client/planning` | — | 369 | oui | selector + `societes[0]` fallback (l. 94) | non |
| `app/client/pointage/page.tsx` | `/client/pointage` | — | 4 | n/a | **stub** dynamic vers `/app/rh/pointage/page` | n/a |
| `app/client/previsionnel/page.tsx` | `/client/previsionnel` | bloque `client_user` (l. 371) | 910 | oui | selector + "all" ; appelle `/api/client/financial?societe_id=` | oui |
| `app/client/primes/page.tsx` | `/client/primes` | — | 444 | oui | `societes[0]` fallback (l. 89) | non |
| `app/client/profil/page.tsx` | `/client/profil` | bloque `client_user` (l. 86) | 293 | oui (affichage) | `societes[0]` pour affichage (l. 66) | non |
| `app/client/rapports-paie/page.tsx` | `/client/rapports-paie` | bloque `client_user` (l. 299) | 814 | oui | selector | non |
| `app/client/rapprochement-mensuel/page.tsx` | `/client/rapprochement-mensuel` | — | 431 | oui | selector + `/api/comptable/rapprochement?societe_id=` (l. 47) | non |
| `app/client/rapprochement/page.tsx` | `/client/rapprochement` | — | **3366** ⚠️ énorme | oui | selector + "all" | oui |
| `app/client/revenus-depenses/page.tsx` | `/client/revenus-depenses` | bloque `client_user` (l. 77) | 427 | non (statique) | n/a — template UI | non |
| `app/client/salaires-compta/page.tsx` | `/client/salaires-compta` | — | 240 | oui | selector vers `/api/comptable/societes` (l. 21) | non |
| `app/client/salaires/page.tsx` | `/client/salaires` | bloque `client_user` (l. 355) | 919 | oui | selector | non |
| `app/client/societe/page.tsx` | `/client/societe` | — | 373 | oui | query `?id=` (édition fiche société) | non |
| `app/client/societes/page.tsx` | `/client/societes` | — | 343 | non (liste toutes) | n/a — page de gestion | n/a |
| `app/client/tableau-de-bord/page.tsx` | `/client/tableau-de-bord` | redirect `client_assistant` → `/assistant` (l. 218-222) | 518 | oui | selector + `societes[0]` (l. 82, 276-277) | **oui — bug 🟠** |
| `app/client/tableau-de-bord-financier/page.tsx` | `/client/tableau-de-bord-financier` | — | 134 | oui | selector + button `disabled={!societe}` | non (société obligatoire) |
| `app/client/taux-change/page.tsx` | `/client/taux-change` | — | 382 | non | `/api/comptable/taux-change` (global) | n/a |
| `app/client/test-documents/page.tsx` | `/client/test-documents` | — | 60 | non | **page de test** — à supprimer | n/a |
| `app/client/tiers-consolidation/page.tsx` | `/client/tiers-consolidation` | — | 262 | oui | selector + `societes[0]` fallback (l. 49) | non |
| `app/client/tva/page.tsx` | `/client/tva` | bloque `client_user` (l. 181) | 906 | oui | selector + "all" (l. 411-417) | **oui — bug 🔴 déclaration MRA** |
| `app/client/utilisateurs/page.tsx` | `/client/utilisateurs` | — | 1002 | oui | selector | non |

### ⚠️ Doublons / recouvrements

- **Deux dashboards coexistent** : `/client` (`app/client/page.tsx`, 691 lignes, version "hero premium" avec ClientPageShell + ClientKit) **ET** `/client/tableau-de-bord` (`app/client/tableau-de-bord/page.tsx`, 518 lignes, version "KPI grid" avec shadcn/ui Cards). Ils utilisent des styles différents, des API différentes (brief-client vs financial avec date_range), et le `/redirect` envoie les clients vers **`/client/tableau-de-bord`** (pas `/client`) — donc `/client` est accessible uniquement par navigation directe. Candidat à supprimer ou fusionner.
- **Trois pages bancaires** : `banque` (617 l.), `mes-comptes` (80 l. — stub minimal), `rapprochement` (3366 l.), `rapprochement-mensuel` (431 l.). `mes-comptes` semble être un stub abandonné doublonnant `banque`.
- **Deux pages "tableau de bord financier"** : `tableau-de-bord` (KPI classique) et `tableau-de-bord-financier` (134 l., analyse IA). Le second est moins développé.

### Stubs / redirects pure

| Fichier | Lignes | Contenu |
|---|---|---|
| `chat-rh/page.tsx` | 7 | `dynamic(() => import('@/app/rh/chat/page'))` |
| `conges/page.tsx` | 4 | `dynamic(() => import('@/app/rh/conges/page'), { ssr: false })` |
| `employes/page.tsx` | 4 | `dynamic(() => import('@/app/rh/employes/page'), { ssr: false })` |
| `pointage/page.tsx` | 4 | `dynamic(() => import('@/app/rh/pointage/page'), { ssr: false })` |
| `facture-template/page.tsx` | 7 | probablement stub vide / redirect |
| `test-documents/page.tsx` | 60 | page de test à nettoyer |

### Pages les plus volumineuses (candidates à refactor avant la refonte)

1. `rapprochement/page.tsx` — **3366 lignes** (à éclater en sous-composants)
2. `annual-return/page.tsx` — 1227 lignes
3. `utilisateurs/page.tsx` — 1002 lignes
4. `documents/page.tsx` — 997 lignes
5. `exports-rh/page.tsx` — 993 lignes
6. `salaires/page.tsx` — 919 lignes
7. `previsionnel/page.tsx` — 910 lignes
8. `tva/page.tsx` — 906 lignes
9. `it-form3/page.tsx` — 866 lignes



## Section 3 — Gestion actuelle de `societe_id`

### 3.1 — React Context / Provider ?

**Réponse courte : un Context EXISTE mais n'est utilisé NULLE PART.**

Fichier : `components/client/societe-filter.tsx` (72 lignes)

```tsx
// l. 17-19
const SocieteContext = createContext<SocieteContextType>({
  selectedSocieteId: null, setSelectedSocieteId: () => {},
  societes: [], loading: true, financialUrl: "/api/client/financial"
})

// l. 21
export function useSocieteFilter() { return useContext(SocieteContext) }

// l. 23-48
export function SocieteFilterProvider({ children }: { children: ReactNode }) { ... }
```

Le provider fetch `/api/client/financial` (l. 29), extrait `availableSocietes` (l. 32-34) et expose `selectedSocieteId` + un `financialUrl` calculé.

Recherche Grep `SocieteFilterProvider|useSocieteFilter` dans tout le repo :
- **Seules références : à l'intérieur du fichier lui-même.** Aucun import côté page, aucun wrap dans un layout. **Code mort.**

Aucun autre context société n'existe : `SocieteProvider`, `CompanyContext`, `useSociete` → zéro résultat dans le repo.

### 3.2 — Stockage côté client (localStorage / sessionStorage / cookie custom)

**Aucun stockage de "société active" côté client.**

Recherche `localStorage` dans `app/client/**` : 6 pages l'utilisent, toutes pour du **métier facturation ou budget**, jamais pour la société active :

| Fichier | Clé localStorage | Usage |
|---|---|---|
| `nouvelle-facture/page.tsx` | `lexora_invoice_settings`, `lexora_invoice_clients`, `lexora_invoice_catalogue`, `lexora_invoice_template_colors`, `lexora_invoice_template` | Settings de facturation |
| `facturation-settings/page.tsx` | idem + `lexora_mra_settings` | Écriture des settings |
| `factures/page.tsx` | `lexora_recurring_invoices`, `lexora_invoice_settings`, `lexora_invoice_clients` | Factures récurrentes |
| `facture-preview/page.tsx` | `lexora_invoice_settings`, `lexora_invoice_template_colors` | Preview |
| `previsionnel/page.tsx` | `lexora_budgets` | Budgets stockés client-side |
| `bilan/page.tsx` | `lexora_bilan_prev_${exercice}` | OCR exercice précédent |
| `parametres-rh/page.tsx` | divers settings RH | |

**Aucune clé du type `lexora_active_societe` ou équivalent. La société active n'a aucune persistance client.**

### 3.3 — Stockage côté serveur (cookie, session DB, colonne profile)

**Aucun stockage explicite de "société active" côté serveur.**

Cependant :
- `profiles.societe_id` existe (lu dans `app/api/client/societes/route.ts` l. 18 — `admin.from('profiles').select('role, societe_id')`) et est utilisé comme "société par défaut" pour les rôles `rh`, `juridique`, `employe`, `manager`, `direction` (l. 67-71). **Pour les rôles client (`client_admin`, `client_user`, `client_assistant`), cette colonne n'est pas utilisée comme "société active"** — elle pourrait être utilisée pour un seul linkage initial.
- Pas de cookie `active_societe` dans le middleware.
- Pas de table `user_session_state` ou équivalent.

### 3.4 — Communication de la société active entre pages

**Chaque page se débrouille seule.** Patterns observés :

1. **Refetch systématique** : chaque page appelle `fetch("/api/client/societes")` à son mount pour récupérer la liste (observé dans ≥ 20 pages). Aucune mise en cache partagée.
2. **État local `useState`** : chaque page garde son `selectedSociete` / `selected` / `societeId` dans un `useState` local, réinitialisé à chaque navigation.
3. **Aucun URL param** : les pages ne passent **pas** la société via query param (ex: `/client/tva?societe_id=abc`) sauf exception comme `societe/page.tsx?id=xxx` (édition d'une fiche).
4. **Pas de props depuis le layout** : `app/client/layout.tsx` (27 lignes) ne transmet rien — il ne fait que switcher la sidebar.

⇒ **Quand un dirigeant passe de `/client/tva` à `/client/banque`, il doit re-sélectionner sa société.** C'est une cause majeure de l'UX "mélangée".

### 3.5 — Catalogue exhaustif du pattern `societes[0]`

19 occurrences dans `app/client/**`, toutes des anti-patterns "prends silencieusement la première société" :

| Fichier | Ligne | Contexte |
|---|---|---|
| `app/client/page.tsx` | 197 | `const firstSociete = societes[0]` puis fetch brief + financial |
| `app/client/page.tsx` | 666 | `setSociete(societes[0].nom \|\| "")` |
| `app/client/assistant/page.tsx` | 286 | `setConfirmSocId(societes.length > 0 ? societes[0].societe_id : "")` |
| `app/client/bilan/page.tsx` | 458 | `const selectedSoc = societes.find(s => s.id === selectedSociete) \|\| societes[0] \|\| null` |
| `app/client/documents/page.tsx` | 295 | `setConfirmSocId(... societes[0].societe_id ...)` |
| `app/client/echeances/page.tsx` | 113, 179, 211 | `const socId = selectedSociete && selectedSociete !== "all" ? selectedSociete : societes[0]?.id` (3 occurrences identiques) |
| `app/client/factures/page.tsx` | 258 | `const societeId = societes[0]?.id` |
| `app/client/factures/import/page.tsx` | 94 | `if ((d.societes \|\| []).length > 0) setSocieteId(d.societes[0].id)` |
| `app/client/nouvelle-facture/page.tsx` | 104 | `if (d.societes?.length > 0) setSocieteId(d.societes[0].id)` |
| `app/client/planning/page.tsx` | 94 | `if (societes.length && !selectedSociete) setSelectedSociete(societes[0].id)` |
| `app/client/primes/page.tsx` | 89 | idem planning |
| `app/client/profil/page.tsx` | 66 | `setSociete(data.societes[0])` |
| `app/client/tableau-de-bord/page.tsx` | 82, 276, 277 | `setSelected(societes[0].id)` ; affichage `societes[0].nom` et `societes[0].brn` quand `societes.length === 1` |
| `app/client/tiers-consolidation/page.tsx` | 49 | `if ((d.societes \|\| []).length > 0) setSocieteId(d.societes[0].id)` |

Hors `/client` : 2 occurrences dans `/comptable` et `/rh` (non scope, signalées pour info : `app/comptable/tva/page.tsx:86`, `app/rh/conges/page.tsx:692`).

**Conclusion refonte** : ces 19 occurrences + les `useState` locaux + l'absence de Context partagé = **tout le client sera à refactorer** pour passer en mode "société active globale".



## Section 5 — Table `user_societes` — usage effectif

### 5.1 Inventaire des accès

Recherche `user_societes` dans `app/` → 31 occurrences dans 17 fichiers. Filtré sur les routes pertinentes pour `/client` :

#### Routes API (dans scope)

| Fichier:ligne | Opération | `role` de `user_societes` lu ? |
|---|---|---|
| `app/api/client/societes/route.ts:45` | `admin.from('user_societes').select('societe_id').eq('user_id', user.id)` — utilisé pour construire la liste des sociétés visibles pour `client_admin`/`client_user`/`client_assistant` | ❌ non, seul `societe_id` est lu |
| `app/api/client/users/route.ts:35, 64, 81, 202, 248, 282, 284, 289` | Multiples : select (l. 35, 64), insert/upsert (l. 202, 284, 289), delete (l. 282). Colonne `role` utilisée lors des upserts. | ✅ (partiellement — pour écriture, pas pour lecture d'autorisation) |
| `app/api/client/factures/route.ts:130` | `supabase.from('user_societes').select('societe_id').eq('user_id', user.id)` pour vérifier qu'une facture GET est accessible | ❌ `role` ignoré |
| `app/api/client/factures/[id]/pdf/route.ts:93` | idem PDF facture | ❌ `role` ignoré |
| `app/api/client/documents/route.ts:55, 84, 117` | expansion sociétés + users liés aux sociétés | ❌ `role` ignoré (partiellement) |

#### Routes hors scope mais appelées depuis `/client`

| Fichier:ligne | Opération |
|---|---|
| `app/api/comptable/societes/route.ts:75` | Ajout `user_societes` pour TOUS les rôles (commentaire l. 74) — unifie la liste des sociétés |
| `app/api/comptable/rapprochement/route.ts:278` | Lecture pour filtrage |
| `app/api/documents/upload/route.ts:100, 128, 769, 1388` | Multiples lectures pour résoudre la société de destination OCR |
| `app/api/documents/[id]/route.ts:119` | Check d'accès document |
| `app/api/rh/societe/route.ts:66` | Résolution société pour contexte RH |
| `app/api/admin/users/route.ts:33, 114, 181, 183, 188` | CRUD admin des liens user-société |

#### Pages (lecture côté client)

| Fichier:ligne | Usage |
|---|---|
| `app/client/assistant/page.tsx:198` | Commentaire : *"Fallback for assistant/user roles: fetch from user_societes via client API"* — donc via l'API `/api/client/societes` |
| `app/client/documents/page.tsx:206` | Idem commentaire |

Aucune page ne requête `user_societes` directement via le browser (bonne pratique).

### 5.2 Incohérences de pattern

**Trois patterns coexistent** pour "quelles sociétés un user client voit-il ?" :

1. **`user_societes.user_id`** (l. 45 de `societes/route.ts`)
2. **`societes.created_by = user.id`** (l. 40 de `societes/route.ts`)
3. **`dossiers.client_id = user.id`** (l. 42 de `societes/route.ts`) — chaque dossier référence un `societe_id`

Le fichier `app/api/client/societes/route.ts` les combine correctement via `Map` + déduplication (l. 49-65). Mais **les autres routes n'appliquent pas toutes le même algorithme**. Exemples :

- `app/api/client/factures/route.ts` GET (l. 130) : vérifie uniquement `user_societes`. Une société créée par le user (présente via `created_by` mais absente de `user_societes`) serait **rejetée en 403**. Incohérence avec `societes/route.ts` qui l'autoriserait.
- `app/api/client/factures/[id]/pdf/route.ts` (l. 93) : idem, uniquement `user_societes`.
- `app/api/client/documents/route.ts` : pattern beaucoup plus complet (fan-out via `dossiers`, `created_by`, `user_societes`).

**Impact** : un utilisateur qui crée une société via POST `/api/client/societes` (qui fait `created_by: user.id` mais crée aussi un fallback dossier — cf. l. 108, 135-161) devrait voir ses factures… mais la route factures GET pourrait le bloquer si `user_societes` n'a pas été populée. Il existe d'ailleurs un fallback `dossiers.upsert` (l. 135-141) qui suggère que cette incohérence a déjà été rencontrée en production.

**Colonne `role` de `user_societes`** : définie mais **utilisée uniquement en écriture** (lors des upserts dans `users/route.ts` et `admin/users/route.ts`). Aucune route n'autorise / restreint en fonction de cette colonne. Elle n'est probablement pas exploitée effectivement.

**Recommandation refonte** : uniformiser sur une fonction / un helper unique `getAccessibleSocieteIds(userId)` qui applique les trois critères, et l'utiliser **systématiquement** dans toutes les routes et guards.



## Section 4 — Middleware et auth

### 4.1 Middleware racine

Fichier : `middleware.ts` (root, 19 lignes) — délègue à `lib/supabase/middleware.ts` (`updateSession`, 166 lignes).

Ce que fait `updateSession` pour `/client/*` :

1. **Refresh de la session Supabase** via `supabase.auth.getUser()` (l. 40).
2. **Redirection vers `/auth/login`** si non authentifié et route non-publique (l. 74-79). `/client/*` est explicitement traité comme protégé.
3. **Redirect `login → /redirect`** si déjà authentifié (l. 82-86).
4. **Role-based access control** pour `/client/*` (l. 102, 139) :
   ```ts
   if (isClientRoute && !['admin', 'super_admin', 'comptable', 'comptable_dedie',
                          'client_admin', 'client_user', 'client_assistant'].includes(role)) {
     return NextResponse.redirect('/redirect')
   }
   ```
   Le role est lu via `supabase.from('profiles').select('role, employe_id').eq('id', user.id)` (l. 106-110).

**Ce que le middleware NE fait PAS** :
- Aucune injection de `societe_id` dans un header custom.
- Aucun cookie "active_societe".
- Aucune vérification que l'utilisateur a au moins une société (un `client_admin` sans `user_societes` arrive directement sur `/client/tableau-de-bord`).
- Aucun blocage fin par sous-route (ex : `/client/tva` n'est pas interdit à `client_user` au niveau middleware — le blocage est fait en dur dans chaque page, cf. Section 1).

### 4.2 Lib Supabase utilisée

**`@supabase/ssr` uniquement** (moderne). Pas de cohabitation avec `@supabase/auth-helpers-nextjs`.

`package.json` :
```
"@supabase/ssr": "^0.9.0",
"@supabase/supabase-js": "^2.100.0"
```

Trois helpers :
- `lib/supabase/client.ts` (10 lignes) — `createBrowserClient` pour les Client Components
- `lib/supabase/server.ts` (28 lignes) — `createServerClient` avec `cookies()` de `next/headers`
- `lib/supabase/middleware.ts` (166 lignes) — `createServerClient` avec les cookies du `NextRequest`

Chaque API route server-side créé en plus **son propre admin client** via `createClient` de `@supabase/supabase-js` + `SUPABASE_SERVICE_ROLE_KEY` (pattern dupliqué : `getAdmin()` / `getAdminClient()` redéfini dans quasi chaque route). Candidat à factoriser en `lib/supabase/admin.ts`.

### 4.3 Schéma de lecture de session

**Client Components (`"use client"`)** :
```ts
import { createClient } from "@/lib/supabase/client"
const supabase = createClient()
const { data: { user } } = await supabase.auth.getUser()
```
Ou via `useProfile()` (hook dans `hooks/use-profile.ts`, 69 lignes) qui encapsule ça + un fetch de la ligne `profiles`.

**API Routes (`route.ts`)** :
```ts
import { createClient } from "@/lib/supabase/server"
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
```
Puis systématiquement : `const admin = getAdminClient()` pour bypasser RLS.

**Middleware** :
```ts
const supabase = createServerClient(url, key, { cookies: { getAll, setAll } })
const { data: { user } } = await supabase.auth.getUser()
```

### 4.4 Redirection des rôles non-dirigeants

- **Au niveau middleware** (global) : `/client/*` autorisé pour `admin|super_admin|comptable|comptable_dedie|client_admin|client_user|client_assistant`. Tout autre rôle (`rh`, `juridique`, `employe`, `manager`, `direction`) est redirigé vers `/redirect` qui lui applique son propre `ROLE_DASHBOARD` (`app/redirect/page.tsx`).
- **Au niveau layout** (`app/client/layout.tsx`) : si `profile.role === "comptable"`/`"comptable_dedie"`, affiche la `ComptableSidebarNew` à la place de la `ClientSidebarFull`. Donc un comptable accédant à `/client/*` y reste (peut ainsi "jouer le client") mais avec sa sidebar.
- **Au niveau page** (blocage fin) : ≥ 12 pages font `if (profile?.role === "client_user") return <access-denied-card>` (cf. Section 1). Les endroits : `alertes`, `annual-return`, `banque`, `bilan`, `echeances`, `fiscal-freelance`, `notifications`, `previsionnel`, `profil`, `rapports-paie`, `revenus-depenses`, `salaires`, `tva`. Répétition manuelle, pas de helper — source potentielle d'incohérences.
- **Cas `client_assistant`** : la page `/client/tableau-de-bord` fait `router.replace("/client/assistant")` (l. 218-222). Le `ClientSidebarFull` réduit aussi le menu à "Espace Assistant + Mon Profil" quand `role === "client_assistant"` (l. 240-254).

### 4.5 Risques auth identifiés

- **Cold start incohérent** : chaque page refait l'appel à Supabase pour `useProfile()`. Pendant le loading, le layout affiche un `<Loader2>` (l. 11-16). Ce loader est dupliqué par page (voir Section 7).
- **Middleware `.maybeSingle()` sur `profiles`** (l. 110) — le fallback quand la ligne est absente c'est `role = ''`, et toute route protégée redirige vers `/redirect`. Sûr mais génère un ping-pong possible si le trigger DB est lent.
- **Aucun rate limiting** au niveau des API routes client (pas de middleware additionnel).



## Section 7 — Composants de layout (Sidebar, Header)

### 7.1 Layout `/client`

Fichier unique : `app/client/layout.tsx` (27 lignes).

```tsx
export default function ClientLayout({ children }) {
  const { profile, loading } = useProfile()
  if (loading) return <Loader2 ... />
  const isComptable = profile?.role === "comptable" || profile?.role === "comptable_dedie"
  return (
    <div className="flex min-h-screen bg-gray-50">
      {isComptable ? <ComptableSidebarNew /> : <ClientSidebarFull />}
      <main className="flex-1 overflow-auto md:ml-64">{children}</main>
    </div>
  )
}
```

**Observations** :
- Le layout **n'a pas de header / topbar** — le header (titre, breadcrumbs, date) est rendu par chaque page individuellement via `<ClientPageShell>` (composant optionnel, voir 7.2).
- Pas de slot pour un sélecteur de société au niveau layout → **il faudra l'ajouter là pour la refonte** (sinon chaque page devra l'embarquer).
- La sidebar est fixe (`fixed left-0 top-0` cf. `ClientSidebarFull.tsx` l. 286) avec `md:ml-64` sur le main pour compenser.

### 7.2 ClientPageShell

`components/layout/ClientPageShell.tsx` (231 lignes).

Wrapper optionnel que chaque page peut utiliser pour bénéficier d'un cadre commun :
- Breadcrumbs (prop `breadcrumbs`)
- Titre, kicker, subtitle, actions
- Particle field décoratif
- Pas d'info société

**N'est pas utilisé par toutes les pages** : les pages `tableau-de-bord/page.tsx`, `rapprochement/page.tsx` et autres ne passent pas par ce shell. Deux styles coexistent :
- **Style "premium"** (ClientPageShell + ClientKit) : `page.tsx`, parties de `bilan`, `tva`
- **Style "utilitaire"** (Cards shadcn/ui directement) : `tableau-de-bord`, `banque`, `rapprochement`, etc.

### 7.3 Sidebars client

**Deux sidebars coexistent** pour l'espace client (hors `ComptableSidebarNew`) :

#### `components/layout/ClientSidebar.tsx` (152 lignes)
- Version simplifiée, 3 variantes de menu (adminSocieteNav, adminFreelanceNav, userNav)
- Affiche `LEXORA / roleLabel` (ex. "Admin", "Freelance", "Utilisateur")
- **Pas de nom de société affiché.**
- **Pas de sélecteur de société.**
- Recherche Grep : **semble NON importée** par `app/client/layout.tsx`. Probablement morte ou utilisée ailleurs.

#### `components/layout/ClientSidebarFull.tsx` (479 lignes) — **la sidebar effectivement utilisée**
- Importée par `app/client/layout.tsx` (l. 2).
- Menu riche avec sections collapsibles (Mon Espace, Facturation, Comptabilité, États Financiers, Fiscal MRA, RH & Paie, Mon Compte).
- **Affiche uniquement le logo `LEXORA` + badge "ESPACE CLIENT"** (l. 313-344). **Pas de nom de société.**
- **Pas de sélecteur de société.** L'utilisateur ne voit nulle part dans la sidebar la société active — il doit deviner via la page courante (si elle a un selector) ou les breadcrumbs.
- **Gating par modules** (l. 85-164, 180-226) : lit `societes[0].modules_actifs` (anti-pattern ⚠️ l. 190-202 : si l'utilisateur a plusieurs sociétés, la sidebar utilise les modules de **la première société arbitrairement**). Intersecte ensuite avec `profile.modules_utilisateur` (l. 206-220). Si une société permet la TVA mais pas la seconde, la sidebar affichera ou cachera la TVA uniquement selon la première → **incohérence garantie en cas de plans hétérogènes**.
- Gating par rôle supplémentaire : `isAssistant` (l. 240) réduit à un menu minimal.

### 7.4 Sélecteur de société

**Aucun sélecteur de société dans les layouts.** Chaque page qui en a besoin en intègre un localement :

| Page | Type de sélecteur |
|---|---|
| `tableau-de-bord/page.tsx` | `<Select>` shadcn/ui avec option `"all"` (l. 266-273) |
| `banque/page.tsx` | Select dans le header (l. 257-267) |
| `bilan/page.tsx` | Select (l. 504-512) |
| `tva/page.tsx` | Select (l. 411-417) |
| `documents/page.tsx` | Select "Toutes les sociétés — détection auto" (l. 461-476) |
| `rapprochement/page.tsx` | Select + "all" |
| `echeances/page.tsx` | Select + fallback `societes[0]` |
| `tableau-de-bord-financier/page.tsx` | Select obligatoire (button désactivé sans) |
| ... | ≥ 15 autres pages |

**Problème structurel** : à chaque navigation, l'utilisateur doit re-sélectionner sa société. Le `useState` local est réinitialisé. Pas de persistance.

**Recommandation refonte** :
1. Ajouter un sélecteur société **dans `ClientSidebarFull`** (zone juste sous le logo, ou dans le footer).
2. Remonter la société active dans un **Context global** (`SocieteActiveProvider` à wrapper dans `app/client/layout.tsx`).
3. Persister le `societe_id` choisi soit en cookie (readable by middleware), soit dans `localStorage` + URL param pour deep-linking.
4. Supprimer tous les sélecteurs locaux des pages → ils consomment le Context.
5. Bonus : afficher **le nom de la société active** en permanence dans la sidebar (ou en topbar collante) pour que le dirigeant sache toujours "dans quel dossier" il se trouve, comme sur un vrai ERP comptable.



## Section 8 — Dépendances transversales

### 8.1 Redirections après login

Fichier : `app/redirect/page.tsx` (70 lignes).

```ts
const ROLE_DASHBOARD: Record<string, string> = {
  client_admin:      '/client/tableau-de-bord',
  client_user:       '/client/tableau-de-bord',
  client_assistant:  '/client/assistant',
  // ...
}
```

⚠️ **Le `/redirect` pointe vers `/client/tableau-de-bord`, pas `/client`.** Donc la page `app/client/page.tsx` (691 lignes, dashboard "premium") **n'est jamais atteinte via le flow de login standard**. Elle est accessible uniquement :
- par navigation directe (taper `/client` dans l'URL)
- par les clics sur le logo dans `ClientSidebar.tsx` (l. 98 : `<Link href="/client">`) — mais cette sidebar n'est pas active
- par le logo dans `ClientSidebarFull.tsx` pointe vers `/client/tableau-de-bord` (l. 313) ✅

Conclusion : `app/client/page.tsx` est probablement **du code hérité à supprimer** après validation, ou à désigner comme la vraie home. Décision à prendre pendant la refonte.

### 8.2 Rôles `client_admin`, `client_user`, `client_assistant` référencés hors `/client`

Grep `client_admin|client_user|client_assistant` → 66 fichiers. Les références critiques hors scope :

| Fichier | Usage |
|---|---|
| `middleware.ts` (via `lib/supabase/middleware.ts:139, 144, 154`) | Role gates pour `/client/*`, `/juridique/*`, `/salarie/*` |
| `app/redirect/page.tsx:11-13` | Table de redirect après login |
| `app/rh/layout.tsx` | Vérification d'accès RH |
| `app/rh/employes/page.tsx:802` | Commentaire : création user côté RH crée `dossiers`/`user_societes` selon rôle |
| `app/rh/conges/page.tsx` | Role check |
| `app/juridique/layout.tsx` | Permet `client_admin`, `client_user` d'accéder (cf. middleware l. 133) |
| `app/salarie/layout.tsx` | Permet `client_admin`, `client_assistant` (cf. middleware l. 154) |
| `app/admin/users/page.tsx`, `app/admin/clients/page.tsx`, `app/admin/page.tsx`, `app/admin/societes/page.tsx` | Interfaces admin pour gérer les rôles client |
| `app/comptable/clients/[clientId]/page.tsx` | Vue comptable sur un client — utilise les mêmes API `/api/comptable/*`, peut naviguer par `societes[0]` (l. 414-421 anti-pattern dans le comptable) |
| `app/comptable/clients/page.tsx`, `equipe/page.tsx` | Autres vues comptables |
| `app/profil/page.tsx` | Profil global (hors `/client/profil`) |

### 8.3 API `/api/comptable/*` appelées depuis `/client/*`

Ceci est important : plusieurs pages `/client` appellent des endpoints comptables (avec `?societe_id=`). Si la refonte change l'auth dans ces routes, elle casse `/client` :

| API appelée | Pages `/client` qui l'appellent | Notes |
|---|---|---|
| `/api/comptable/societes` | `tiers-consolidation`, `exports-rh`, `rapprochement-mensuel`, `societe`, `echeances`, `tva`, `salaires-compta`, `previsionnel` | Version alternative du listing des sociétés |
| `/api/comptable/rapprochement` | `rapprochement-mensuel` | `?societe_id=` |
| `/api/comptable/rapprochement-mensuel` | `rapprochement-mensuel` | idem |
| `/api/comptable/rapprochement/smart`, `/smart/apply`, `/reset`, `/agent/deterministic`, `/agent` | `rapprochement/page.tsx` (3366 lignes) | Cœur du rapprochement |
| `/api/comptable/factures` | `echeances`, `fournisseurs`, `nouvelle-facture` (indirect) | `?societe_id=` |
| `/api/comptable/banque` | `banque` (PATCH nom_compte l. 119-124), `societe` | |
| `/api/comptable/comptes-bancaires` | `exports-rh` | |
| `/api/comptable/ecritures` | `ecritures` | `?societe_id=` requis |
| `/api/comptable/grand-livre` | `grand-livre` | `?societe_id=` requis |
| `/api/comptable/tiers/consolidation` | `tiers-consolidation` | |
| `/api/comptable/it-form3` | `it-form3` | |
| `/api/comptable/roc/annual-return`, `/administrateurs`, `/actionnaires` | `annual-return` | |
| `/api/comptable/taux-change` | `taux-change` | |
| `/api/brief-client` | `page.tsx` (dashboard) | Hors `/api/client` et `/api/comptable` |
| `/api/generer-tableau-de-bord` | `tableau-de-bord-financier` | |

**Risque de refonte** : toucher l'auth / le filtrage de ces endpoints comptables peut casser `/client`. Il faut les traiter dans une phase séparée **ou** auditer leur auth pour qu'elles soient compatibles avec les 3 rôles `client_admin|client_user|client_assistant`.

### 8.4 Composants `/components/` partagés

| Composant | Utilisé par | Risque refonte |
|---|---|---|
| `components/layout/ClientSidebarFull.tsx` | `app/client/layout.tsx` | fort (sidebar à étendre avec selector société) |
| `components/layout/ClientSidebar.tsx` | ⚠️ non importé par `layout.tsx` — mort ? | à supprimer ou documenter |
| `components/layout/ComptableSidebarNew.tsx` | `app/client/layout.tsx` (quand rôle comptable) + `/comptable/*` | à ne pas casser |
| `components/layout/ClientPageShell.tsx` | ≥ 5 pages (ex : `app/client/page.tsx`) | faible |
| `components/client/ClientKit.tsx` | pages "premium" | faible |
| `components/client/societe-filter.tsx` (`SocieteFilterProvider`, `SocieteSelector`) | **personne** (code mort) | zéro (à intégrer dans la refonte OU supprimer) |
| `hooks/use-profile.ts` | ≥ 30 pages | fort (central) |

### 8.5 Liens depuis d'autres espaces vers `/client/*`

Grep `href=.?/client/` → 10 fichiers dans `app/client/` eux-mêmes (liens internes). Aucun lien depuis `/admin/*`, `/comptable/*`, `/rh/*`, `/salarie/*`, `/juridique/*` vers une route spécifique `/client/*`.

Exceptions notables :
- `ClientSidebarFull.tsx` — certains items pointent vers `/rh/*` et `/comptable/contrats` (visibleForRoles gate).

### 8.6 Ce qui se casse si on refond `/client` sans précaution

- **Redirect après login** : si on change le nom de la route home (ex : `/client/tableau-de-bord` → `/client`), il faut mettre à jour `ROLE_DASHBOARD` dans `app/redirect/page.tsx:11-13`.
- **Logo sidebar** : `ClientSidebarFull.tsx:313` pointe vers `/client/tableau-de-bord`.
- **Stubs RH** (`chat-rh`, `conges`, `employes`, `pointage`) dépendent de `/app/rh/*`. Les supprimer sans migrer casserait la nav client.
- **Comptable accédant à `/client`** (layout switche sur `ComptableSidebarNew`) — flow actuel permet au comptable de "jouer le client". À conserver ou non selon choix produit.
- **Appels `/api/comptable/*` depuis `/client`** (cf. 8.3) — si on durcit l'auth de ces routes, prévoir.



## Section 9 — Risques et points d'attention

### 9.1 Code mort identifié

| Fichier | Constat |
|---|---|
| `components/client/societe-filter.tsx` | `SocieteFilterProvider` + `useSocieteFilter` **jamais importés nulle part** (72 lignes de code mort). Ironiquement, c'est *exactement* le pattern à ressusciter pour la refonte. |
| `components/layout/ClientSidebar.tsx` | 152 lignes, **pas importée par `app/client/layout.tsx`** (qui utilise `ClientSidebarFull`). À vérifier si utilisée ailleurs — sinon à supprimer. |
| `app/client/test-documents/page.tsx` | 60 lignes, nom parle de lui-même. Page de test à nettoyer. |
| `app/client/facture-template/page.tsx` | 7 lignes — probablement stub vide à supprimer. |
| `app/client/page.tsx` | 691 lignes. `/redirect` ne pointe jamais vers `/client` (→ `tableau-de-bord`). Soit à supprimer, soit à promouvoir comme vraie home. |
| `app/client/mes-comptes/page.tsx` | 80 lignes, doublonne `banque` (617 lignes) avec moins de fonctionnalités et un bug 🔴. Probablement à supprimer. |
| `app/client/chat-rh/page.tsx`, `conges/`, `employes/`, `pointage/` | Stubs 4-7 lignes pointant vers `/app/rh/*`. À conserver tant que la nav s'en sert, sinon à nettoyer. |

### 9.2 TODOs et commentaires d'alerte trouvés

- `app/api/rh/paie/route.ts:221` : *"une table de mapping (profiles/dossiers/user_societes/...) manque."*
- `app/client/assistant/page.tsx:198` & `app/client/documents/page.tsx:206` : *"Fallback for assistant/user roles: fetch from user_societes via client API"*
- `app/api/documents/upload/route.ts:119` : *"PRIORITY 2: user's profile société or user_societes"* — laisse entendre qu'il y a plusieurs "priorités" pas toujours cohérentes.
- `app/api/admin/create-user-employee/route.ts:10` : *"avec dossiers/user_societes, cet endpoint est spécifique au cas RH :"*

### 9.3 Duplication de logique

- **`getAdminClient()` / `getAdmin()` redéfinis** dans quasi chaque API route (13+ fois). Un seul helper dans `lib/supabase/admin.ts` règlerait ça.
- **Fetch de la liste des sociétés** (`fetch("/api/client/societes")`) répété dans ≥ 20 pages, sans cache partagé. Un React Context + SWR / TanStack Query résoudrait.
- **Blocage `if (profile?.role === "client_user")`** répété dans 12+ pages en dur. Un wrapper `<RequireRole roles={...}>` réduirait.
- **Patterns `getCurrentExercice()` / `parseExerciceDates()` / `getPreviousExercice()` / `getAvailableExercices()`** dupliqués dans plusieurs pages et dans `api/client/financial/route.ts:32-62`.
- **Calculs comptables** (`totalRevenue`, `totalExpenses`, `tvaCollectee`, etc.) basés sur `compte?.startsWith('7')` / `'6'` / `'4457'` / `'4456'` sont centralisés dans `financial/route.ts` mais partiellement redupliqués côté frontend (ex : `tableau-de-bord/page.tsx`).

### 9.4 Utilisation abusive de `any`

- `ClientSidebarFull.tsx:94, 103, 142` — cast `as any` pour contourner le type `MenuSection.items` (pour `visibleForRoles`). Couplé à une suppression silencieuse de permissions.
- `ClientSidebar.tsx:78` — `const category = (profile as any)?.client_category`.
- `app/api/client/financial/route.ts` : quasiment toutes les lignes manipulant `allEcritures`, `facturesFromTable`, `bankTransactions` typent `any` (l. 182-227, 431-451, 521-540).
- `app/client/tableau-de-bord/page.tsx:110-199` — `mData`, `eData`, `cData`, `f: any` dans les callbacks `Promise.all([...])`.

### 9.5 Endpoints apparemment non appelés

| Route | Constat |
|---|---|
| `/api/client/actions` | Peu de référants côté UI — à vérifier si encore utilisé |
| `/api/client/tiers-offshore` | Utilisé par `app/client/tiers-consolidation/page.tsx` probablement, mais simple rôle gate |
| `/api/client/facture-template` | Flow d'OCR de modèle de facture — à confirmer utilisation |
| `/api/client/conseils` | Appelé par le dashboard mais peu visible |

### 9.6 Risques spécifiques à la refonte "1 société active"

1. **Mode "all" à bannir** — plusieurs pages permettent aujourd'hui l'agrégation multi-sociétés. Pour TVA MRA et Annual Return, c'est **juridiquement faux**. La refonte doit explicitement supprimer ce mode de ces pages (au pire le garder dans des dashboards agrégés explicitement nommés "Consolidation").
2. **Flow OCR** (`documents/page.tsx` + `/api/documents/upload`) — actuellement, l'upload tente une "détection auto" de la société via OCR. Si la société active est imposée, ce flow devra forcer `societe_id` au lieu de faire une détection. Mais le backend OCR dépend peut-être d'autres contextes → **à tester en profondeur**.
3. **Comptable dédié "vue client"** — un comptable accède à `/client/*` avec la sidebar comptable. Il verra les pages du client qu'il a ouvert. La refonte doit prévoir **comment le comptable choisit la société** (aujourd'hui : via `/comptable/clients/[clientId]/[societeId]/*` — cf. `app/comptable/clients/[clientId]/page.tsx` qui liste les sociétés du client). Question produit : faut-il partager le même Context société pour comptable et client ?
4. **Sociétés héritées "sans société"** — des utilisateurs existants peuvent avoir zéro société (créée via `created_by` mais pas encore de `user_societes`). La page `/client/tableau-de-bord` a un onboarding (l. 283-294) — à garder.
5. **`modules_actifs` hétérogène entre sociétés** — aujourd'hui `ClientSidebarFull` lit `societes[0].modules_actifs`. En mode "1 société active", la sidebar doit lire **la société active**, ce qui changera dynamiquement. Donc **la sidebar devra re-render** à chaque changement de société → prévoir que `useEffect([profile])` devienne `useEffect([profile, activeSocieteId])` avec le Context.
6. **Cache HTTP `/api/client/societes`** : la route renvoie `Cache-Control: private, max-age=60` (l. 81). Si on introduit une société active persistée côté client, attention au staleness quand on crée une nouvelle société.
7. **Double dashboard** (`/client` vs `/client/tableau-de-bord`) — décider lequel garder avant tout reste. Recommandation : supprimer `/client/page.tsx` ou le transformer en simple redirect vers `/client/tableau-de-bord`.
8. **3366 lignes de `rapprochement/page.tsx`** — ce fichier devrait être éclaté avant toute refonte pour éviter une régression massive.
9. **Migration `ecritures_comptables` → `ecritures_comptables_v2`** (cf. `financial/route.ts:203-225`) — une VIEW est en place, mais le code lit encore les deux tables avec déduplication. Nettoyer en parallèle pour réduire le bruit.
10. **Aucun test automatisé** trouvé dans le repo (pas de `__tests__/`, pas de config Jest / Vitest / Playwright observable). La refonte devrait **absolument** ajouter au minimum des tests d'intégration sur les API routes (auth + isolation par société) — sans ça, les régressions passeront inaperçues.

### 9.7 Constats "mou" (non-bloquants)

- Styles inline très nombreux (ex : `ClientPageShell.tsx`, `ClientKit.tsx`, `ClientSidebarFull.tsx`). Tailwind est présent mais peu utilisé dans les composants "premium". À uniformiser.
- Beaucoup de libs UI installées (`@radix-ui/*` complet, framer-motion, gsap, three, react-pdf, leaflet, tiptap) — la surface est grande, mais pas tout utilisé. Non bloquant.
- Aucun `error.tsx` / `loading.tsx` Next.js observé dans `/client/*` — chaque page gère son propre loading state.
- `useProfile()` n'utilise pas de cache (pas de `swr` / `react-query`), il fetch Supabase à chaque mount — coût acceptable mais remplaçable.

### 9.8 Conclusion

Le sous-système `/client` est **fonctionnellement riche mais architecturalement fragmenté** :
- pas de notion de "société active" partagée,
- sécurité API inégale (certains endpoints sont forts, d'autres laissent passer n'importe quoi),
- styles et patterns incohérents entre pages,
- beaucoup de code mort ou doublonné.

La refonte "une société active à la fois" est **l'occasion idéale de uniformiser** :
- un `<SocieteActiveProvider>` dans `app/client/layout.tsx` (réactiver / remplacer `SocieteFilterProvider`),
- un helper `getAccessibleSocieteIds(user)` unique pour toutes les API routes,
- un `<RequireRole>` pour remplacer les 12 `if (role === "client_user")`,
- un cookie `active_societe_id` accessible par le middleware pour éventuellement pré-filtrer.

Priorité absolue : **corriger les 4 routes API fuyantes** (`actions`, `echeances`, `investissements`, `factures` POST/PATCH/DELETE) **avant** de déployer quoi que ce soit, car ce sont des vulnérabilités cross-tenant existantes, indépendantes de la refonte.


