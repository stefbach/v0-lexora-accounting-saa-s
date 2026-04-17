# Sprint Salarié — Progress

Branche : `fix/sprint-salarie-complet` (depuis `main@a4fb7c6`)
Démarrage : 2026-04-17
Owner : agent Claude Code autonome (weekend)
Validation humaine : lundi

## Vague 0 — Refactor fondation

| # | Item | Effort | Statut | Commit | Notes |
|---|---|---|---|---|---|
| V0.1 | Découper `page.tsx` en `_components/tabs/*` | M | 🔄 En cours | — | Extraction 1 tab = 1 commit |
| V0.2 | Fix overflow barre top desktop | S | ⏳ À faire | — | — |

## Vague 1 — Quick wins

| # | Item | Effort | Statut | Commit | Notes |
|---|---|---|---|---|---|
| V1.1 | Nettoyage listener hotfix | S | ⏳ | — | — |
| V1.3 | Contacts d'urgence dans Ma fiche | S | ⏳ | — | Whitelist serveur déjà OK |
| V1.4 | Remplacer `alert()` par toasts | S | ⏳ | — | shadcn/sonner |
| V1.5 | Documents — lecture seule | S | ⏳ | — | Endpoint `/api/salarie/documents` à créer (pas /api/rh) |
| V1.2 | Upload avatar | M | ⏳ | — | Endpoint `POST /api/rh/employes/me/photo` supposé (agent RH) |

## Vague 3 — Secondaires

| # | Item | Effort | Statut | Commit | Notes |
|---|---|---|---|---|---|
| V3.1 | Primes total année en cours | S | ⏳ | — | — |
| V3.4 | TIBOK unique CTA | S | ⏳ | — | — |
| V3.5 | Badge contrat à signer | S | ⏳ | — | — |
| V3.6 | Désactiver Signer après signature | S | ⏳ | — | — |
| V3.2 | Motif de rejet trajets | S | ⏳ | — | — |

## Vague 2 — Cœur

| # | Item | Effort | Statut | Commit | Notes |
|---|---|---|---|---|---|
| V2.5 | Refresh partiel congés | S | ⏳ | — | — |
| V2.2 | Pagination bulletins | S | ⏳ | — | UI prête même si API pas encore paginée |
| V2.3 | Sélecteur de mois planning | M | ⏳ | — | — |
| V2.1 | Upload certificat SL > 3j | M | ⏳ | — | Endpoint `POST /api/rh/conges/:id/certificat` supposé (agent RH) |
| V2.4 | `?merge_leaves=1` planning | L | ⏳ | — | Garder fusion client en fallback |
| V2.6 | Documents — activation complète | M | ⏳ | — | Dépend V1.5 + éventuels ajouts |

## PRs créées

| # | Titre | Branche source | Branche cible | Statut |
|---|---|---|---|---|
| 1 | Vague 0 — Fondation | `fix/sprint-salarie-complet` | `main` | À créer |
| 2 | Vague 1 — Quick wins | idem | main | À créer |
| 3 | Vague 3 — Secondaires | idem | main | À créer |
| 4 | Vague 2 — Fonctionnalités cœur | idem | main | À créer |

Note : on travaille sur une seule branche longue ; chaque PR sera rebasée si besoin et retiendra le sous-ensemble de commits de sa vague.

## Décisions & ambiguïtés

Voir `decisions.md` dans ce dossier au fur et à mesure.

## Dépendances agent RH (`fix/sprint-rh-securite`)

- `POST /api/rh/employes/me/photo` → utilisé par V1.2
- `POST /api/rh/conges/:id/certificat` → utilisé par V2.1
- Pagination `GET /api/rh/paie` (`?page=&limit=`) → utilisé par V2.2
- `GET /api/rh/planning?merge_leaves=1` → utilisé par V2.4
- Fixes P0 : R01 (access.ts), R02 (paie/pdf isSelf), R07 (XSS html_content), R08 (hash signature)
  → prérequis avant mise en prod des items impactés

Si l'agent RH merge sa branche avant moi, je rebase `fix/sprint-salarie-complet` sur `main` avant de merger mes PRs.
