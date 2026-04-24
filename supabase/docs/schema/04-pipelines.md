# Pipelines de génération d'écritures comptables

Chaque pipeline ci-dessous documente comment une action métier se traduit en
écritures dans `ecritures_comptables_v2`. Si tu cherches "d'où vient cette
écriture 411 ?", c'est ici.

## Liste des pipelines

1. [OCR — Upload relevé bancaire](#1-ocr--upload-relevé-bancaire)
2. [Facture client (création)](#2-facture-client-création)
3. [Facture fournisseur (création)](#3-facture-fournisseur-création)
4. [Paie — Bulletin validé (SAL mensuel, actif)](#4-paie--bulletin-validé-sal-mensuel-actif)
5. [Paie — Bulletin par bulletin (OD-PAIE désactivé)](#5-paie--bulletin-par-bulletin-od-paie-désactivé)
6. [Rapprochement — auto_rapprocher](#6-rapprochement--auto_rapprocher)
7. [Rapprochement — classer_transaction manuel](#7-rapprochement--classer_transaction-manuel)
8. [Rapprochement — marquer_paye / lettrer_multi](#8-rapprochement--marquer_paye--lettrer_multi)
9. [sync_lettrage](#9-sync_lettrage)
10. [backfill-ecritures (admin)](#10-backfill-ecritures-admin-one-shot)
11. [/admin/repair (9 actions de nettoyage)](#11-adminrepair-9-actions-de-nettoyage)

---

## 1. OCR — Upload relevé bancaire

**Route** : `POST /api/documents/upload`
**Fichier** : `app/api/documents/upload/route.ts`

**Flow** :
1. Upload PDF → S3
2. Claude Haiku 4.5 classifie le type de document (`releve_bancaire` | `facture_client` | `facture_fournisseur` | ...)
3. Si `releve_bancaire` → prompt `SYSTEM_PROMPT_RELEVE_BANCAIRE` (lib/ai/prompts.ts) via Claude Sonnet
4. Extraction JSON `{banque, devise, lignes[{date, libelle, debit, credit, devise, montant_origine, ...}]}`
5. **Validation devise** via `resolveBankCurrency()` — pas de fallback 'MUR' silencieux (F2)
6. **Parsing montants** via `parseAmount()` — gère `1,234.56` et `1.234,56` (F4/F5)
7. **Gate F7** : si `max(montant) > 20M MUR` OU `> 50× médiane` → `statut='erreur_ocr'` + 400, pas d'insert
8. **Check devise vs compte existant** via `compareCurrency()` — si conflit, crée un NOUVEAU compte avec suffixe `-EUR/-USD` (F1)
9. INSERT dans `releves_bancaires` avec `transactions_json` contenant `tx.devise` + `tx.montant_origine` par ligne (F8)

**Écritures produites** : AUCUNE à l'upload. Les écritures BNQ sont générées au rapprochement.

**Protections** (tous les CRITIQUES de l'audit OCR) :
- F1, F2, F3 : validation devise stricte
- F4, F5 : parseAmount avec throw strict
- F6 : lignes_manquantes ou ecart_solde>1 → bloque avec erreur_ocr
- F7 : bornes de sanité sur montants
- F11 : prompt renforcé (format numérique + devise obligatoire)

**Référence** : `docs/OCR_AUDIT_2026-04.md`

---

## 2. Facture client (création)

**Route** : `POST /api/client/factures`
**Fichier** : `app/api/client/factures/route.ts` + `lib/accounting/ecritures-factures.ts:createEcrituresForFacture`

**Flow** :
1. INSERT `factures` avec `type_facture='client'`, `montant_mur` calculé = `montant_ttc × taux_change`
2. Si `statut='en_attente'` (pas brouillon/devis) → `createEcrituresForFacture(facture)`
3. Génère 3 lignes VTE liées par `facture_id` et `ref_folio = FAC-<facture.id>` :

| Compte | Sens | Montant | Libellé |
|---|---|---|---|
| 411 | D | `ttc_mur` | Clients |
| 706 | C | `ht_mur` | Prestations de services |
| 4457 | C | `tva_mur` (= ttc_mur - ht_mur) | TVA collectée |

**Idempotence** : DELETE des écritures VTE non lettrées existantes avant INSERT + check par `ref_folio` et `facture_id`.

**Gotcha** : si la facture a été déjà lettrée (paiement reçu), les écritures lettrées NE SONT PAS supprimées → `nb_entries = 0` et le UPDATE d'une facture lettrée avec nouveau montant ne re-génère pas. Si besoin de régénérer avec nouveau montant : passer par `/admin/repair` action `backfill_factures_ecritures` ou migration 161 (backfill MUR).

---

## 3. Facture fournisseur (création)

**Route** : `POST /api/client/factures` (même endpoint avec `type_facture='fournisseur'`)

**Flow** : idem facture client mais inversé :

| Compte | Sens | Montant | Libellé |
|---|---|---|---|
| 607 | D | `ht_mur` | Achats |
| 4456 | D | `tva_mur` | TVA déductible |
| 401 | C | `ttc_mur` | Fournisseurs |

Journal = `ACH`, ref_folio = `FAC-<facture.id>`.

---

## 4. Paie — Bulletin validé (SAL mensuel, actif)

**Route** : `POST /api/rh/import-paie?action=import`
**Fichier** : `app/api/rh/import-paie/route.ts` ligne 504+

**Flow** : 1 batch par mois, agrégé sur tous les bulletins validés du mois.

**Écritures produites** (journal `SAL`, ref_folio = `SAL-<YYYY>-<MM>`) :

| Compte | Sens | Montant | Source |
|---|---|---|---|
| 6411 | D | Σ salaire_base | Salaires bruts |
| 6414 | D | Σ heures_sup_montant | Heures sup |
| 6415 | D | Σ allowances (transport+petrol+special) | Primes/indemnités |
| 6416 | D | Σ eoy_bonus | 13e mois provision |
| 6418 | D | Σ ajustements | Éléments non détaillés |
| 6451 | D | Σ csg_patronal | CSG patronale |
| 6452 | D | Σ nsf_patronal | NSF patronal |
| 6453 | D | Σ prgf | PRGF |
| 6454 | D | Σ training_levy | Training Levy |
| 4210 | C | Σ salaire_net | Net à payer |
| 4311 | C | Σ csg_salarie | CSG sal à verser |
| 4312 | C | Σ nsf_salarie | NSF sal à verser |
| 4321 | C | Σ csg_patronal | CSG pat à verser |
| 4322 | C | Σ nsf_patronal | NSF pat à verser |
| 4323 | C | Σ prgf | PRGF à verser |
| 4324 | C | Σ training_levy | Levy à verser |
| 4330 | C | Σ paye | PAYE MRA |
| 4212 | C | Σ eoy_bonus/12 | Provision 13e mois |

**Idempotence** : DELETE + INSERT atomique par `(societe_id, journal='SAL', date='YYYY-MM-01')` avant INSERT.

---

## 5. Paie — Bulletin par bulletin (OD-PAIE désactivé)

**Fonction SQL** : `generer_ecritures_paie(p_bulletin_id UUID)`
**Trigger** : `trig_ecritures_paie` **DÉSACTIVÉ** (mig 204)

**Pourquoi désactivé** : coexistait avec le pipeline SAL mensuel → doublons sur classes 42xx/43xx.

**Réactivation** : `ALTER TABLE bulletins_paie ENABLE TRIGGER trig_ecritures_paie`. ⚠ Purger les SAL existants avant sinon doublons immédiats.

Appelable en RPC si besoin : `supabase.rpc('generer_ecritures_paie', {p_bulletin_id})`. Journal = `OD-PAIE`, ref_folio = `BP-<bulletin_id>`.

---

## 6. Rapprochement — auto_rapprocher

**Route** : `POST /api/comptable/rapprochement` body `{action: 'auto_rapprocher', societe_id, date_debut?, date_fin?}`
**Fichier** : `app/api/comptable/rapprochement/route.ts`

**Flow** (plusieurs milliers de lignes — découpé en phases) :
1. Charge toutes tx `statut IN ('non_identifie', 'a_verifier')` des relevés (optionnellement filtrées par dates)
2. **Phase 1 — Matching factures** : `analyzeAllTransactions()` (`lib/accounting/matching-engine.ts`) cherche les factures ouvertes qui matchent chaque tx (exact_reference, close_amount, grouped_sum)
3. **Phase 2 — Classification** : `classifyTransaction()` applique les règles R01-R06 aux tx non matchées
4. **Phase 3 — Virements internes** (R05 désactivé, code inerte actuellement)
5. **Phase finale — Génération BNQ** pour chaque tx classifiée (sans facture) :
   - `ref_folio = CLS-<releve_id>-<tx_idx>`
   - Charge le taux **historique** via `getHistoricalRate(supabase, tx.date, devise)`
   - INSERT paire BNQ avec colonnes freeze : `taux_change_applique`, `devise_origine`, `montant_origine`

**Idempotence** : check strict `ref_folio` via DB query (commit `d45854e`). Cliquer N fois = même état.

**Fallback taux historique** : si `MissingHistoricalRateError` :
- tx `non_identifie`/`a_verifier` → statut `a_verifier_taux` + skip INSERT
- tx déjà classifiée → fallback taux live + `console.warn`

---

## 7. Rapprochement — classer_transaction manuel

**Route** : `POST /api/comptable/rapprochement` body `{action: 'classer_transaction', transaction_id, releve_id, classification, compte_custom?, apply_to_similar?, ...}`

**Flow** :
1. **Cleanup systémique avant re-classification** (commit `b13f551`) :
   - DELETE écritures BNQ par ref_folio prefix (`CL-`, `CLS-`, `BANK-`, `TDS-`, `MC-`)
   - UPDATE `factures.statut = 'en_attente'` si la tx avait des factures liées et que la nouvelle classification ≠ client/fournisseur
   - DELETE `mouvements_compte_courant` par `source_releve_id + source_transaction_idx`
   - UPDATE `lettre = NULL` sur ACH/OD/VTE qui partageaient l'ancienne lettre
2. Pose nouveau `matched_type` et nouvelle lettre sur la tx dans `transactions_json`
3. Si `compte_custom` fourni → validation contre `plan_comptable` (throw si absent)
4. Génère les 2 lignes BNQ (compte choisi + 512) avec le bon taux historique + colonnes freeze
5. Si `classification == 'compte_courant_associe'` :
   - **Blocklist** : refuse si le tiers match `BANK_LIKE_NAMES` ou `FEE_LIKE_NAMES` (MCB/SBM/Tax/Fee…) — commit `0180b30`
   - Crée/update `comptes_courants_associes` + INSERT `mouvements_compte_courant` avec source tracking (mig 202)
6. Si `apply_to_similar=true` → propage sur toutes les tx du même tiers (self-exclusion, dedup strict)

---

## 8. Rapprochement — marquer_paye / lettrer_multi

**Route** : `POST /api/comptable/rapprochement` body `{action: 'lettrer_multi', transaction_id, releve_id, facture_ids, type_ecart?}`

**Flow** :
1. Vérifie `Σ(factures.ttc_mur) ≈ tx.amount_mur` à la tolérance près
2. Si écart > 100 MUR ET > 2% ET pas de `type_ecart` → retourne HTTP 409 avec liste d'options (`change`, `escompte`, `penalite`, `exceptionnel`, `a_regulariser`)
3. Sinon :
   - UPDATE `factures.statut = 'paye'` + rapproche_*
   - Génère paire BNQ par facture avec `ref_folio = BANK-<releve>-<tx>-<facture_short>` (ref_folio unique par facture pour paiements groupés)
   - Si écart > 0,01 : génère ligne OD avec compte selon `type_ecart` (471 pour `a_regulariser`)

---

## 9. sync_lettrage

**Route** : `POST /api/comptable/rapprochement` body `{action: 'sync_lettrage', societe_id, mois?}`

**Flow** : scanne les factures `paye` sans BNQ et crée les paires manquantes (utilisé après un backfill data ou un import bulk). Utilise les mêmes règles que marquer_paye mais batch. INSERT direct dans `ecritures_comptables_v2` (pas la vue v1) pour préserver les colonnes freeze (commit `89cc4a3`).

---

## 10. backfill-ecritures (admin one-shot)

**Route** : `POST /api/comptable/factures/backfill-ecritures` body `{societe_id, dry_run}`

Régénère VTE/ACH pour toutes les factures non-brouillon/annule qui n'en ont pas. Utilisé lors de migrations de données historiques ou après un reset partiel.

---

## 11. /admin/repair (9 actions de nettoyage)

**Route** : `POST /api/admin/repair` body `{societe_id, actions: string[], dry_run?}`
**Fichier** : `app/api/admin/repair/route.ts`

Actions disponibles :

| Action | Rôle |
|---|---|
| `backfill_factures_ecritures` | Pour chaque facture sans VTE/ACH → appelle `createEcrituresForFacture` |
| `backfill_paiements_bnq` | Pour chaque facture `paye` sans BNQ → crée paire 401/411 + 512 avec `ref_folio` unique par facture |
| `purge_cca_doublons` | Dedup `mouvements_compte_courant` par `(compte, date, montant_devise_origine)` |
| `delete_cca_banques_frais` | Supprime les CCA dont le nom match bank-like / fee-like patterns |
| `remap_legacy_comptes` | 421/431/432/433/444 → PCM 4-digits selon libellé |
| `relettrer_factures` | Lettre unique par facture sur lignes 411/401 non lettrées |
| `purge_montants_amplifies` | Détecte lignes BNQ > 5× médiane par `(compte, journal)` → purge paire + 512 si non lettrée |
| `purge_classifications_bogus_npf_nsf` | Purge BNQ 43xx avec libellé "NPF/NSF — <non-MRA>" |
| `vider_580_vers_4710` | Déplace tout BNQ 580 vers 4710 (R3 — 580 soldé) |

Toutes les actions sont idempotentes, préservent les écritures lettrées, et reportent des détails en dry_run.

**UI** : `/admin/repair?societe_id=<UUID>` — dropdown UUID + checkbox actions + bouton Dry run / Apply.
