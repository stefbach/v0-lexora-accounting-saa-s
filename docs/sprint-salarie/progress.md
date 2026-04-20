# Sprint Salarié — Progress

Branche : `fix/sprint-salarie-complet` (depuis `main@a4fb7c6`)
Démarrage : 2026-04-17 (weekend autonome)
Validation humaine : lundi

## Vague 0 — Refactor fondation ✅

| # | Item | Statut | Commit | Notes |
|---|---|---|---|---|
| V0.1 | Découper `page.tsx` en `_components/tabs/*` | ✅ | `52987f8` + `d8f21a7` | 2151 → 357 l. (-83 %) |
| V0.2 | Fix overflow barre top desktop | ✅ | `429c5c3` | Labels raccourcis + `flex-wrap` + `min-w-[96px]` |

## Vague 1 — Quick wins ✅

| # | Item | Statut | Commit | Notes |
|---|---|---|---|---|
| V1.1 | Nettoyage listener hotfix | ✅ | `1071e9b` | Retrait du `document.click`, hashchange gardé |
| V1.3 | Contacts d'urgence dans Ma fiche | ✅ | `1963076` | 3 champs (whitelist serveur OK) |
| V1.4 | Remplacer `alert()` par toasts | ✅ | `8c3f778` | `<Toaster>` monté dans root layout |
| V1.5 | Documents — lecture seule | ✅ | `d12fd88` | Nouveau `GET /api/salarie/documents` |
| V1.2 | Upload avatar | ✅ | `44cce5c` | UI prête, endpoint RH attendu |

## Vague 3 — Secondaires ✅

| # | Item | Statut | Commit | Notes |
|---|---|---|---|---|
| V3.1 | Primes total année en cours | ✅ | `3ed45f7` | Filtre `periode.startsWith(year)` |
| V3.4 | TIBOK unique CTA | ✅ | `21f0420` | 12 sous-onglets → 1 seul CTA |
| V3.5 | Badge contrat à signer | ✅ | `444800e` | Nouveau `/api/salarie/notifications` |
| V3.6 | Désactiver Signer après signature | ✅ | `cdd80a1` | Dialog footer adaptatif |
| V3.2 | Motif de rejet trajets | ✅ | `4a603d0` | Bloc rouge si `rejete + motif_rejet` |

## Vague 2 — Cœur ✅

| # | Item | Statut | Commit | Notes |
|---|---|---|---|---|
| V2.5 | Refresh partiel congés | ✅ | `441c3e6` | 6 fetch → 2 fetch par action |
| V2.2 | Pagination bulletins | ✅ | `6e25c53` | Slice local + TODO serveur |
| V2.3 | Sélecteur de mois planning | ✅ | `93de052` | Fetch self-contained |
| V2.4 | `?merge_leaves=1` planning | ✅ | `93de052` | Fallback client conservé |
| V2.1 | Upload certificat SL > 3j | ✅ | `4930c3d` | 2-step flow avec tolérance 404 |
| V2.6 | Documents activation | ✅ | `d12fd88` | Couvert par V1.5 (phase 1 : lecture seule) |

## Récap fichiers créés

### Nouveaux composants tabs (V0.1)
- `app/salarie/_components/shared/constants.ts`
- `app/salarie/_components/shared/helpers.ts`
- `app/salarie/_components/tabs/DashboardTab.tsx`
- `app/salarie/_components/tabs/MaFicheTab.tsx`
- `app/salarie/_components/tabs/BulletinsTab.tsx`
- `app/salarie/_components/tabs/PlanningTab.tsx`
- `app/salarie/_components/tabs/PrimesTab.tsx`
- `app/salarie/_components/tabs/CongesTab.tsx`
- `app/salarie/_components/tabs/DocumentsTab.tsx`
- `app/salarie/_components/tabs/TrajetsTab.tsx`
- `app/salarie/_components/tabs/SanteTab.tsx`
- `app/salarie/_components/tabs/ContratsTab.tsx`

### Nouvelles routes API
- `app/api/salarie/documents/route.ts` (V1.5)
- `app/api/salarie/notifications/route.ts` (V3.5)

### Fichiers modifiés
- `app/salarie/page.tsx` — slim orchestrator (357 l.)
- `app/layout.tsx` — Toaster sonner monté
- `components/layout/SalarieSidebar.tsx` — badges notifications

## PRs à créer par l'humain lundi

| # | Scope | Hash début | Hash fin | Titre suggéré |
|---|---|---|---|---|
| 1 | Vague 0 | `52987f8` | `429c5c3` | Sprint salarié — Vague 0 : refactor + overflow fix |
| 2 | Vague 1 | `1071e9b` | `44cce5c` | Sprint salarié — Vague 1 : quick wins |
| 3 | Vague 3 | `3ed45f7` | `4a603d0` | Sprint salarié — Vague 3 : améliorations secondaires |
| 4 | Vague 2 | `441c3e6` | `4930c3d` | Sprint salarié — Vague 2 : fonctionnalités cœur |

Les 4 vagues vivent sur une seule branche `fix/sprint-salarie-complet`
— les commits sont découpés pour permettre un split en 4 PRs si
l'humain le souhaite, ou un merge unique.

## Dépendances côté agent RH (`fix/sprint-rh-securite`)

Les items ci-dessous ont leur UI complète livrée mais dépendent d'un
endpoint RH qui n'existe pas encore :

| UI prête | Endpoint RH attendu | Comportement actuel |
|---|---|---|
| V1.2 avatar | `POST /api/rh/employes/me/photo` | 404 → toast warning, preview locale |
| V2.1 certificat SL | `POST /api/rh/conges/:id/certificat` | 404 → toast warning, demande créée quand même |
| V2.2 pagination | `GET /api/rh/paie?action=list&page=&limit=` | Slice côté client en fallback |
| V2.4 merge serveur | `GET /api/rh/planning?merge_leaves=1` | Fusion client en fallback |

## 4 failles P0 côté `/api/rh/*`

Rappel pour l'humain (détails dans `docs/audit-salarie/08-prerequis-p0-rh.md`) :

- **P0-01** Fallback `getUserSocieteIds` → toutes les sociétés
- **P0-02** `/api/rh/paie/pdf` sans check propriétaire
- **P0-03** XSS `dangerouslySetInnerHTML` sur contrats
- **P0-04** Signature contrat sans hash/snapshot

Tant que ces 4 failles ne sont pas corrigées par l'agent RH, certains
items livrés ici (bulletins, contrats, documents) restent vulnérables
**côté serveur** même si l'UI est propre.

## Décisions produit

Voir `decisions.md` : D01 (emplacement API Documents), D02 (structure
tabs), D03 (props extraites), D04 (règle `/api/salarie/*`).
