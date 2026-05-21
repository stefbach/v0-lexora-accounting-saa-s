# Tests d'intégration — comptabilité Lexora

Ce dossier contient :

- `inter-societes.test.ts` — tests **unitaires** purs (pas de Supabase) du
  module `lib/comptable/inter-societes.ts`. Lancés systématiquement par
  `npm test`.
- `equilibre.integration.test.ts` — invariants d'équilibre sur la table
  `ecritures_comptables_v2` (Supabase requis).
- `rapprochement.integration.test.ts` — cas étendus de
  `detectInterSociete()` + invariant solde 451 par groupe (Supabase requis
  pour R4, R1–R3 toujours exécutés).
- `onboarding.integration.test.ts` — RPC `enregistrer_soldes_ouverture`
  (migration 301) : équilibre AN + idempotence (Supabase requis).

## Prérequis

Les tests d'intégration utilisent un client `@supabase/supabase-js` en
service-role pour bypasser RLS. Variables d'env requises :

```bash
export NEXT_PUBLIC_SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
```

Sans ces variables, les blocs `describe` correspondants sont
**proprement skipés** (`describe.skip`) — la CI passe quand même.

## Lancer

Tous les tests vitest (unitaires + intégration s'il y a env) :

```bash
npm test
```

Un seul fichier :

```bash
npx vitest run lib/comptable/__tests__/equilibre.integration.test.ts
npx vitest run lib/comptable/__tests__/rapprochement.integration.test.ts
npx vitest run lib/comptable/__tests__/onboarding.integration.test.ts
```

## Invariants vérifiés

### Equilibre (`equilibre.integration.test.ts`)

| ID | Invariant | Tolérance |
|----|-----------|-----------|
| I1 | Pour chaque société, `SUM(debit_mur) = SUM(credit_mur)` sur toute `ecritures_comptables_v2` | 0.02 MUR |
| I2 | Pour chaque (société, journal) — BNQ, ACH, VTE, OD-PAIE, SAL, AN, OD… — `SUM(D) = SUM(C)` | 0.02 MUR |
| I3 | Pour chaque `ref_folio` non null, `SUM(D) = SUM(C)` | 0.02 MUR |
| I4 | Solde du compte 5800 (transit virements internes) par société : `|solde|` raisonnable | 100 000 MUR |

I4 garde-fou contre la régression observée en prod (compte 5800 accumulant
6,25 M MUR — cf migrations 291/293).

### Rapprochement (`rapprochement.integration.test.ts`)

| ID | Invariant | Type |
|----|-----------|------|
| R1 | `detectInterSociete()` matche correctement des libellés bruyants (refs banque, ponctuation) | Unitaire |
| R2 | Quand plusieurs sociétés pourraient matcher, on renvoie UN seul gagnant (best score ≥ 0.85) | Unitaire |
| R3 | Pas de faux positif sur libellés systémiques (MRA PAYE, Salary, BOM, etc.) | Unitaire |
| R4 | Pour chaque groupe, somme du compte 451 sur toutes les sociétés du groupe ≈ 0 | Supabase |

R4 vérifie l'invariant IAS 24 / mig 302 : les comptes courants
inter-sociétés doivent s'annuler quand on consolide.

### Onboarding (`onboarding.integration.test.ts`)

| ID | Invariant |
|----|-----------|
| O1 | `enregistrer_soldes_ouverture(dry_run=true)` renvoie `total_debit = total_credit` |
| O2 | Appel réel : 10 écritures créées (5 lignes × 2), journal AN, équilibrées par folio et globalement |
| O3 | Second appel = `deja_saisi`, pas de doublon (idempotence) |

Le test crée une société temporaire `__TEST_ONBOARDING_<timestamp>__` et
**nettoie tout** en `afterAll` (delete écritures + delete marker + delete
société).

## Configuration vitest

Les fichiers `*.integration.test.ts` sont inclus dans la config vitest
standard (`vitest.config.ts`, glob `lib/**/*.test.ts`). Ils se
**skip-eux-mêmes** si l'env Supabase est absente — pas besoin de config
séparée.

## Recommandation CI

Ces tests étant en lecture seule (sauf `onboarding` qui crée puis supprime
sa propre société), ils peuvent tourner contre la prod, mais on
recommande :

- En CI, exporter les vars d'env via secrets GitHub Actions
  (`SUPABASE_SERVICE_ROLE_KEY` reste un secret).
- Localement, charger via `.env.local` et `dotenv-cli` si besoin.
