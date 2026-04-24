# Schema comptable Lexora — Index

Documentation complète du schéma Supabase comptable après la refonte 2026 (migrations 158-172). À lire avant toute intervention sur le code comptable, le plan comptable mauricien, la classification bancaire ou le pipeline OCR.

---

## Table des matières

### [01 — Tables](./docs/schema/01-tables.md)
Référence exhaustive des 14 tables comptables critiques : colonnes, contraintes, index, RLS, migrations de référence, gotchas par table.

Tables documentées :
- `ecritures_comptables_v2` (source de vérité du Grand Livre)
- `plan_comptable_mauricien` (codes PCM globaux)
- `societes_plan_comptable` (overrides par société)
- `factures` + `factures_lignes`
- `transactions_bancaires` + `releves_bancaires`
- `bulletins_paie` + `parametres_paie_*`
- `comptes_bancaires`
- `comptes_courants_associes` + `comptes_courants_associes_mouvements`
- `lettrages`
- `classification_rules`
- `taux_change_historique`

### [02 — Triggers & Functions](./docs/schema/02-triggers-functions.md)
Triggers SQL, fonctions, canonicalisation PCM, contrôles balance, règles R1-R7.

Contenu clé :
- `tr_ecritures_remap_pcm` (canonicalisation 4-digits)
- `tr_balance_check_insert` / `tr_balance_check_update` (mig 168)
- `trg_enforce_r7_lettre_v2` (blocage lettrage classes 6/7)
- `trig_ecritures_paie` (désactivé mig 169)
- `tr_ecritures_canonicalize_compte` (fossile à DROP)
- Fonctions : `generer_ecritures_paie`, `remap_compte_pcm`, `tr_00_legacy_3digit_warn`

### [03 — Plan Comptable Mauricien](./docs/schema/03-plan-comptable.md)
Plan comptable mauricien (PCM), codes canoniques 4-digits, journal codes, règles R1-R7, classification rules.

Contenu clé :
- Tables PCM classe 1-7
- Règles comptables R1 (balance), R2 (lettrage), R3 (580 soldé), R4 (écart toléré), R5 (dédup), R6 (ref_folio unique), R7 (no lettre 6/7)
- Journal codes : VTE, ACH, BNQ, SAL, OD, OD-PAIE (inactif), CLS
- Classification rules R01-R06 (R05_INTERCO désactivée mig 170)

### [04 — Pipelines & Routes](./docs/schema/04-pipelines.md)
11 pipelines métier : OCR upload, facturation, paie, rapprochement, lettrage, `/admin/repair`.

Pipelines documentés :
1. OCR upload bancaire (`/api/documents/upload`)
2. Facture client (VTE)
3. Facture fournisseur (ACH)
4. Paie agrégée SAL
5. OD-PAIE désactivé (référence historique)
6. Auto-rapprochement (`/api/comptable/rapprochement`)
7. Classification transaction (`/api/comptable/transactions/classer`)
8. Marquer payé (lettrage automatique)
9. Sync lettrage (`/api/comptable/lettrage/sync`)
10. Backfill `montants_mur` (mig 164)
11. `/admin/repair` — 9 actions idempotentes

### [05 — Gotchas & Migrations](./docs/schema/05-gotchas-migrations.md)
Pièges à connaître, timeline des migrations 144-172, rollback strategy, checklist nouvelle société.

Contenu clé :
- 20 gotchas critiques (partial unique index, trigger canonicalize fossile, dual pipeline paie, devise figée, etc.)
- Timeline génération "intégrité comptable" (144-157)
- Timeline génération "refonte bancaire" (158-172)
- Commit references branche `claude/fix-reconciliation-ledger-Pf2gE`
- Checklist déploiement nouvelle société
- FAQ interne

---

## Points d'entrée fréquents

| Question | Section à lire |
|---|---|
| "Comment ajouter un nouveau compte bancaire multi-devise ?" | 01 (comptes_bancaires) + 05 (gotcha 8) |
| "Pourquoi mes écritures ont disparu après re-classification ?" | 04 (pipeline 7) + 05 (gotcha 10) |
| "Erreur `42P10` sur `ON CONFLICT`" | 05 (gotcha 1) |
| "Le Grand Livre est déséquilibré" | 03 (règle R1) + 05 (gotcha 18) + 04 (/admin/repair) |
| "Comment débugger un paiement multi-factures ?" | 04 (pipeline 8) + 05 (gotcha 11) |
| "Ajouter une classification rule" | 03 (classification_rules) + 05 (gotcha 4) |
| "Pipeline OCR upload" | 04 (pipeline 1) + 05 (gotchas 15-16) |
| "Déployer pour un nouveau client" | 05 (checklist déploiement) |

---

## Conventions

- **Montants** : toujours en MUR dans `ecritures_comptables_v2.debit`/`credit`. Les colonnes `montant_devise` + `devise_origine` + `taux_change_applique` conservent la trace si la transaction d'origine est EUR/USD/GBP.
- **Codes PCM** : 4-digits canoniques (`4210`, `4711`, `5121`). Pas de 3-digits nus ni 6-digits legacy.
- **ref_folio** : identifiant unique partiel par `(societe_id, ref_folio, numero_compte)` où `ref_folio IS NOT NULL`. Format recommandé :
  - Factures : `FAC-<facture_id_short>`
  - Paiements : `BANK-<releve_id>-<tx_id>-<facture_short>`
  - CCA : `CCA-<tx_id>`
  - Paie : `SAL-<YYYY-MM>`
- **Journaux** : VTE (ventes), ACH (achats), BNQ (banque), SAL (salaires), OD (diverses), CLS (clôture).
- **Migrations** : numéro strictement croissant, pas de réutilisation. Sauts acceptés (151, 160-162 vides).

---

*Dernière mise à jour : 2026-04-23 — post-migration 172.*
