# 01 — Cartographie code de l'Espace Salarié

> Lecture seule. Aucune modification. Snapshot au 2026-04-17, branche
> `claude/fix-lexora-audit-timeout-Uq4qB`.

## 1. Points d'entrée

| Fichier | Lignes | Rôle |
|---|---:|---|
| `app/salarie/layout.tsx` | 64 | Garde de rôle côté serveur + injection de la sidebar dédiée. |
| `app/salarie/page.tsx` | **2145** | **Page monolithique** — tous les onglets dans un seul fichier client. |
| `components/layout/SalarieSidebar.tsx` | 211 | Sidebar dédiée à l'espace salarié (n'utilise PAS celle de `/rh`). |

Aucun sous-dossier `app/salarie/<onglet>/page.tsx` : tout est rendu par un
seul composant React (`EspaceEmployePage`) avec un state `tab` local.

## 2. Garde de rôle (`app/salarie/layout.tsx:23-56`)

- `ALLOWED_ROLES` : `employe`, `salarie`, `rh`, `rh_manager`, `manager`,
  `admin`, `super_admin`, `direction`, `client_admin`, `client_assistant`.
- Fallback notable : même si `profiles.role` est vide, l'accès est accordé
  dès lors que `profiles.employe_id` est renseigné.
- Redirection par défaut : `/redirect` (dispatcher global).
- Les non-authentifiés sont interceptés plus tôt par le middleware global.

## 3. Navigation (`SalarieSidebar.tsx:19-30`)

10 entrées, toutes liées à la même page via des hash-anchors :

| Hash | Label | Onglet interne |
|---|---|---|
| `#dashboard` | Pointage | `dashboard` |
| `#conges` | Mes congés | `conges` |
| `#bulletins` | Mes bulletins | `bulletins` |
| `#planning` | Mon planning | `planning` |
| `#primes` | Mes primes | `primes` |
| `#contrats` | Mes contrats | `contrats` |
| `#documents` | Mes documents | `documents` |
| `#trajets` | Mes trajets km | `trajets` |
| `#sante` | Ma santé (TIBOK) | `sante` |
| `#profil` | Ma fiche | `profil` |

La page lit `window.location.hash` au montage (`page.tsx:1072`) pour
pré-sélectionner l'onglet. Un listener `hashchange` dans la sidebar suit
l'onglet actif pour le highlight.

## 4. Composants internes de `page.tsx`

Déclarés dans le même fichier (pas d'imports externes dédiés) :

| Composant | Lignes | Onglet rendu |
|---|---|---|
| `MaFicheTab` | 41-197 | `profil` |
| `CongesTab` | 199-633 | `conges` |
| `TrajetsTab` | 635-825 | `trajets` |
| `ContratsTab` | 827-1017 | `contrats` |
| `DocumentsTab` | 1019-1044 | `documents` |
| `EspaceEmployePage` (default export) | 1046-fin | conteneur + dashboard, bulletins, planning, primes, santé (inline) |

Les onglets **dashboard**, **bulletins**, **planning**, **primes**, **sante**
ne sont pas des composants isolés : ils sont rendus inline dans le JSX
de `EspaceEmployePage` (voir `page.tsx:1269, 1508, 1562, 1712, 1810`).

## 5. Type `Tab` (`page.tsx:38`)

```ts
type Tab = "dashboard" | "profil" | "bulletins" | "planning"
         | "primes" | "conges" | "documents" | "trajets"
         | "sante" | "contrats"
```

## 6. APIs RH présentes dans le repo (`app/api/rh/*`)

22 routes recensées :

```
annonces   audit      chat       conges     contrats   depart
employes   exports    frais-km   geolocalisation       groupes
heures-sup import-paie           jours-feries          manager-groupes
paie       planning   pointage   primes     shifts     societe
trajets-km
```

Détail des endpoints appelés par l'espace salarié → voir `02-apis-inventory.md`.

## 7. Observations structurelles (facts)

1. **Fichier unique de 2145 lignes** : tous les onglets cohabitent. Un
   refactor "un onglet par fichier" est la Vague 0 du plan de sprint.
2. **Double sidebar** : `SalarieSidebar` est distincte de `components/layout/Sidebar.tsx` (zone RH). Le salarié ne voit jamais les onglets RH.
3. **Pas de `/api/salarie/*`** : toutes les requêtes de l'espace salarié
   tapent sur `/api/rh/*`. La séparation côté API est donc logique, pas physique.
4. **Endpoint `me`** : `/api/rh/employes/me` (GET + PATCH) est le seul
   endpoint explicitement "self" utilisé par l'espace salarié.
5. **Composants inline vs isolés** : les 5 onglets rendus inline dans le
   default export mélangent state du conteneur et logique métier — c'est
   la principale dette côté DX.
