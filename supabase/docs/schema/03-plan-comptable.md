# Plan comptable PCM Maurice + Règles comptables

## Principes

- Format PCM canonique : **4 chiffres** (ex: `4210`, `6411`). Quelques comptes parents à 3 chiffres restent (`401`, `411`, `512`, `706`) mais les sous-comptes doivent être à 4.
- Les codes **3-digits bare** (`421`, `431`, `432`, `433`, `444`) sont LEGACY → remappés automatiquement par `tr_00_legacy_3digit_warn` (mig 165).
- Les codes **6-digits legacy** (`421000`, `431100`, `447200`…) sont remappés via `compte_remap_pcm` + trigger `tr_ecritures_remap_pcm` (mig 144).
- Une écriture équilibrée : `Σ debit_mur = Σ credit_mur` par `ref_folio` à 0,01 MUR près (règle R1, enforced via trigger `tr_balance_check_*`).

## Plan comptable PCM Maurice (seed mig 166 + extensions 158/170)

### Classe 1 — Capitaux

| Compte | Libellé | Type | Sens |
|---|---|---|---|
| 1010 | Capital social | passif | C |
| 1061 | Réserve légale | passif | C |
| 1068 | Autres réserves | passif | C |
| 1190 | Report à nouveau | passif | C |
| 1200 | Résultat de l'exercice | passif | C |
| 1640 | Emprunts bancaires | passif | C |

### Classe 2 — Immobilisations

| Compte | Libellé | Type | Sens |
|---|---|---|---|
| 2181 | Installations générales, agencements | actif | D |
| 2183 | Matériel de bureau et informatique | actif | D |
| 2184 | Mobilier de bureau | actif | D |
| 2815 | Amortissement — Installations | passif | C |
| 2818 | Amortissement — Autres immobilisations | passif | C |

### Classe 4 — Tiers

| Compte | Libellé | Type | Sens |
|---|---|---|---|
| 401 | Fournisseurs (parent) | passif | C |
| 411 | Clients (parent) | actif | D |
| 4210 | Salaires nets à payer | passif | C |
| 4211 | Primes et gratifications à payer | passif | C |
| 4212 | 13e mois à payer (EOY Bonus) | passif | C |
| 4250 | Avances au personnel | actif | D |
| 4280 | Notes de frais à rembourser | passif | C |
| 4311 | CSG salarié à verser | passif | C |
| 4312 | NSF salarié à verser | passif | C |
| 4321 | CSG patronal à verser | passif | C |
| 4322 | NSF patronal à verser | passif | C |
| 4323 | PRGF à verser | passif | C |
| 4324 | Training Levy HRDC à verser | passif | C |
| 4330 | PAYE à reverser MRA | passif | C |
| 4455 | TVA à décaisser | passif | C |
| 4456 | TVA déductible | actif | D |
| 4457 | TVA collectée | passif | C |
| 4471 | MRA — impôts et taxes divers (attente) | passif | C |
| 4550 | Comptes courants associés | passif | C |
| 4670 | Tiers divers (inter-sociétés) | actif | D |
| 4710 | Comptes d'attente (à reclasser) | actif | D |

### Classe 5 — Trésorerie

| Compte | Libellé | Type | Sens |
|---|---|---|---|
| 512 | Banque (parent) | actif | D |
| 5121 | Banque MUR | actif | D |
| 5122 | Banque EUR | actif | D |
| 5123 | Banque USD | actif | D |
| 580 | Virements internes en transit | actif | D |

⚠ **Règle R3** : `580` DOIT être soldé à la clôture mensuelle. Toute écriture en transit non équilibrée en fin de mois est une anomalie.

### Classe 6 — Charges

| Compte | Libellé | Type | Sens |
|---|---|---|---|
| 601 | Achats de marchandises | charge | D |
| 606 | Fournitures non stockées | charge | D |
| 607 | Achats services/prestations | charge | D |
| 611 | Sous-traitance | charge | D |
| 6131 | Loyers | charge | D |
| 6135 | Charges locatives | charge | D |
| 6151 | Entretien et réparations | charge | D |
| 6160 | Assurances | charge | D |
| 6221 | Honoraires comptables | charge | D |
| 6225 | Honoraires juridiques | charge | D |
| 623 | Publicité et marketing | charge | D |
| 6251 | Frais de déplacement | charge | D |
| 6256 | Missions et réceptions | charge | D |
| 6261 | Téléphone et internet | charge | D |
| 6271 | Frais bancaires | charge | D |
| 6272 | Commissions bancaires (SWIFT) | charge | D |
| 628 | Charges externes diverses | charge | D |
| 6351 | Droits de timbre | charge | D |
| 6411 | Salaires et appointements bruts | charge | D |
| 6412 | Transport allowance | charge | D |
| 6413 | Petrol allowance | charge | D |
| 6414 | Heures supplémentaires | charge | D |
| 6415 | Primes et gratifications | charge | D |
| 6416 | 13e mois — EOY (provision) | charge | D |
| 6417 | Indemnités compensatrices et départ | charge | D |
| 6418 | Indemnités compensatrices (préavis) | charge | D |
| 6419 | Autres rémunérations | charge | D |
| 6451 | CSG patronale | charge | D |
| 6452 | NSF patronal | charge | D |
| 6453 | PRGF | charge | D |
| 6454 | Training Levy HRDC (1%) | charge | D |
| 651 | Redevances licences SaaS | charge | D |
| 661 | Intérêts bancaires | charge | D |
| 666 | Pertes de change | charge | D |
| 671 | Charges exceptionnelles | charge | D |

### Classe 7 — Produits

| Compte | Libellé | Type | Sens |
|---|---|---|---|
| 701 | Ventes de marchandises | produit | C |
| 706 | Prestations de services | produit | C |
| 708 | Produits accessoires | produit | C |
| 7131 | Production stockée | produit | C |
| 753 | Commissions reçues | produit | C |
| 766 | Gains de change | produit | C |
| 771 | Produits exceptionnels | produit | C |

---

## Règles comptables R1 à R7

### R1 — Équilibre par ref_folio
`Σ debit_mur = Σ credit_mur` par `ref_folio` à 0,01 MUR près.

**Enforcement** : triggers `tr_balance_check_insert` + `tr_balance_check_update` (mig 166+168) → `RAISE WARNING` non bloquant. Exclusions : `ref_folio LIKE 'BANK-%'` (paiements groupés 1:N) et `journal IN ('CLS', 'BNQ')` (classifications auto).

### R2 — Lettrage préservé
Un UPDATE ne doit jamais écraser la `lettre` d'une écriture déjà lettrée. Appliqué via `WHERE lettre IS NULL` dans tous les UPDATE de lettrage.

### R3 — 580 soldé en fin de mois
`SELECT SUM(debit_mur) - SUM(credit_mur) FROM ecritures_comptables_v2 WHERE numero_compte='580'` doit être = 0 à la clôture mensuelle. Sinon, OD de régularisation requise.

### R4 — Lettrage sans écart forcé
Si `|tx_amount - sum(factures)| > 100 MUR` ET `> 2%` → exiger qualification via `type_ecart` :
- `change` → 766 (gain) / 666 (perte)
- `escompte` → 765 / 665
- `penalite` → 631
- `exceptionnel` → 758 / 658
- `a_regulariser` → **471** (attente — régularisation ultérieure par comptable)

### R5 — Pas de doublon BNQ
Appliqué via :
- `ux_ecritures_v2_ref_folio` (partial unique index)
- `ux_mouvements_cca_source` (mig 167)
- Idempotence stricte auto_rapprocher (commit `d45854e`)
- `safeInsertBnq` dedup fonction

### R6 — Ref_folio unique pour paiements groupés
Un virement qui paie N factures utilise `ref_folio = BANK-<releve_id>-<tx_idx>-<facture_id_short>` (8 premiers chars du UUID facture) — permet N paires 401/512 pour la même tx bancaire sans violer l'index unique.

### R7 — Pas de lettrage sur classes 6/7
Les écritures de résultat (charges 6xxx, produits 7xxx) ne peuvent pas recevoir de `lettre`. Enforced par trigger `trg_enforce_r7_lettre_v2` → `RAISE EXCEPTION` bloquant.

---

## Règles de classification (table `classification_rules`)

État actuel (après mig 170) :

| rule_code | priorité | pattern_libelle | pattern_tiers | compte_debit | compte_credit | active |
|---|---|---|---|---|---|---|
| R01_MRA_PAYE | 10 | `paye` | - | **4471** (attente) | 512 | ✓ |
| R01_MRA_VAT | 11 | `vat\|tva` | - | 4455 | 512 | ✓ |
| R01_MRA_GENERAL | 12 | - | `mauritius revenue\|mra` | 4471 | 512 | ✓ |
| R02_BANK_FEES | 20 | `service fee\|tax amount due\|swift charge\|...` | `mcb\|sbm\|bom\|...` | 6271 | 512 | ✓ |
| R02_MASTERCARD_FEES | 21 | `merchant discount\|card.*discount\|...` | `mastercard\|visa\|...` | 6271 | 512 | ✓ |
| R02_STAMP_DUTY | 22 | `stamp duty\|droit de timbre` | - | 6351 | 512 | ✓ |
| R02_SWIFT_CHARGE | 23 | `swift charge\|outward transfer charge\|...` | - | 6272 | 512 | ✓ |
| R03_SALARY_BULK | 30 | `bulk payment.*salary\|salary\|salaires\|payroll` | - | **4210** | 512 | ✓ |
| R04_EPAYROLL | 40 | - | `e-payroll\|epayroll\|epay` | 4312 | 512 | ✓ |
| R04_NPF_NSF | 41 | `npf\|nsf` | **`mauritius revenue\|mra`** (restreint mig 170) | 4312 | 512 | ✓ |
| R04_CSG | 42 | `csg` | - | 4311 | 512 | ✓ |
| R04_PRGF | 43 | `prgf` | - | 4323 | 512 | ✓ |
| R04_EPAYROLL_IB | 44 | `ib account transfer.*epay\|...` | `e-payroll\|epayroll\|epay` | 4312 | 512 | ✓ |
| **R05_INTERCO** | 50 | NULL | NULL | 580 | 512 | ⚠ **DISABLED** (mig 170) |
| R06_IB_TELECOM | 60 | `ib standard payment` | `myt\|mauritius telecom\|cellplus\|emtel` | 401 | 512 | ✓ |
| R06_IB_GOOGLE | 61 | `ib standard payment\|outward transfer` | `google\|amazon\|microsoft\|cloudflare` | 401 | 512 | ✓ |

⚠ **Ne pas réactiver R05_INTERCO** sans pattern restrictif : elle matchait tout par défaut et a pollué 580 avec fournisseurs/salaires/personnes historiquement.

---

## Journaux comptables

| Journal | Rôle | Écritures typiques |
|---|---|---|
| **VTE** | Ventes | `411 D / 706 C / 4457 C` pour chaque facture client |
| **ACH** | Achats | `607 D / 4456 D / 401 C` pour chaque facture fournisseur |
| **BNQ** | Banque | Mouvements bancaires — paiements factures (paires 401/411 + 512), classifications auto (R01-R06) |
| **SAL** | Salaires (import-paie) | Agrégat mensuel : 6411-6419 D + 6451-6454 D → 4210/4311/4312/4321/4322/4323/4324/4330 C |
| **OD-PAIE** | Opérations paie par bulletin | Pipeline désactivé (mig 169). Similar à SAL mais par bulletin via RPC `generer_ecritures_paie` |
| **OD** | Opérations diverses manuelles | Écarts R4, TDS, régularisations, amortissements |
| **CLS** | Classification (ref_folio prefix, pas vrai journal) | `CLS-<releve>-<idx>` utilisé par `auto_rapprocher` phase finale |

---

## Flux des écritures depuis les sources métier

```
Facture client (INSERT factures)
    └─▶ createEcrituresForFacture()
        └─▶ VTE: 411 D (ttc_mur) + 706 C (ht_mur) + 4457 C (tva_mur)

Facture fournisseur (INSERT factures)
    └─▶ createEcrituresForFacture()
        └─▶ ACH: 607 D (ht_mur) + 4456 D (tva_mur) + 401 C (ttc_mur)

Paiement bancaire de facture (marquer_paye / lettrer_multi / auto)
    └─▶ createEcrituresForPayment()
        └─▶ BNQ: paire 411 C + 512 D (client) OU 401 D + 512 C (fournisseur)
            - ref_folio = BANK-<releve>-<tx>-<facture_short>
            - colonnes freeze: devise_origine, montant_origine, taux_change_applique

Bulletin paie validé (import-paie)
    └─▶ SAL mensuel agrégé (19 lignes typiques)

Tx bancaire non identifiée → auto_rapprocher
    ├─▶ Phase 1: matching facture (analyzeAllTransactions)
    ├─▶ Phase 2: classification R01-R06 (classifyTransaction)
    └─▶ Phase 3: INSERT BNQ via règle (ref_folio = CLS-<releve>-<idx>)

Écart rapprochement forcé (type_ecart='a_regulariser')
    └─▶ OD: ligne 471 (attente régularisation comptable)
```
