# Tables critiques — schéma Lexora

Lexora est un SaaS comptable multi-tenant Maurice. Chaque donnée métier est
scopée par `societe_id` (UUID). RLS est activé sur toutes les tables critiques,
mais certaines policies historiques sont encore `auth.uid() IS NOT NULL` (faibles —
cf. audit sécurité `docs/SECURITY_AUDIT_2026-04.md`) et nécessitent de passer par
`assertSocieteAccess` côté API.

## Table des matières

- [ecritures_comptables_v2](#ecritures_comptables_v2)
- [ecritures_comptables](#ecritures_comptables-vue-v1)
- [factures](#factures)
- [releves_bancaires](#releves_bancaires)
- [comptes_bancaires](#comptes_bancaires)
- [bulletins_paie](#bulletins_paie)
- [employes](#employes)
- [societes](#societes)
- [dossiers](#dossiers)
- [classification_rules](#classification_rules)
- [plan_comptable](#plan_comptable)
- [compte_remap_pcm](#compte_remap_pcm)
- [comptes_courants_associes + mouvements_compte_courant](#comptes-courants-associés)
- [taux_change_historique](#taux_change_historique)

---

## ecritures_comptables_v2

**Rôle** : source de vérité unique pour toutes les écritures comptables (journal VTE/ACH/BNQ/SAL/OD). Depuis mig 120, V1 est devenue une vue sur V2.

**Colonnes importantes** :

| Colonne | Type | Commentaire |
|---|---|---|
| `id` | UUID PK | |
| `societe_id` | UUID | scope multi-tenant |
| `dossier_id` | UUID nullable | FK vers `dossiers` (compat v1) |
| `date_ecriture` | DATE | date comptable |
| `journal` | TEXT | `VTE`, `ACH`, `BNQ`, `SAL`, `OD`, `OD-PAIE`, `CLS` |
| `ref_folio` | TEXT | clé d'idempotence : `FAC-<id>`, `BP-<id>`, `BANK-<r>-<tx>`, `CLS-<r>-<tx>`, `TDS-<r>-<tx>` |
| `numero_piece` | TEXT | numéro de pièce justificative |
| `numero_compte` | TEXT | code PCM 4-digits (`4210`, `6411`, `4312`…) |
| `nom_compte` | TEXT | libellé humain du compte |
| `libelle` / `description` | TEXT | ligne écriture (80 chars) |
| `debit_mur` / `credit_mur` | NUMERIC(15,2) | EN MUR, pas devise origine |
| `lettre` | TEXT nullable | code lettrage (CLI-xxxxx, FOU-xxxxx, CLS-xxxx…) |
| `date_lettrage` | DATE nullable | |
| `facture_id` | UUID nullable | FK vers `factures` (mig 133) |
| `exercice` | TEXT | année fiscale (YYYY) |
| **`devise_origine`** | TEXT nullable | mig 172 — devise de la tx source (EUR/USD/MUR) |
| **`montant_origine`** | NUMERIC nullable | mig 172 — montant dans la devise d'origine |
| **`taux_change_applique`** | NUMERIC nullable | mig 172 — taux gelé au moment de l'écriture (pas live) |

**Indexes** :
- `ux_ecritures_v2_ref_folio` : UNIQUE partiel sur `(societe_id, ref_folio, numero_compte) WHERE ref_folio IS NOT NULL`
- `idx_ecritures_v2_facture_id` : partiel sur `(facture_id) WHERE facture_id IS NOT NULL`
- `idx_ecritures_v2_societe_ref_folio` : `(societe_id, ref_folio)`
- `idx_ecritures_v2_paie_dedup` : partiel sur `(societe_id, journal, numero_compte, date_ecriture, debit_mur, credit_mur) WHERE journal IN ('SAL', 'OD-PAIE')`

**Contraintes** :
- `chk_ecritures_v2_numero_compte_format` (NOT VALID) : `numero_compte ~ '^[1-8][0-9]{2,4}$'` (mig 166)

**Triggers** : voir [02-triggers-functions.md](02-triggers-functions.md).

**Migrations clés** : 120, 133, 146, 150, 166, 167, 168, 172.

**Gotchas** :
- ⚠ Partial unique index : `ON CONFLICT` doit inclure `WHERE (ref_folio IS NOT NULL)` sinon erreur 42P10
- ⚠ Les 3 colonnes freeze (`devise_origine`, `montant_origine`, `taux_change_applique`) ne sont propagées que via INSERT direct V2. La vue V1 INSTEAD OF trigger les perd.
- La source de vérité pour les gros volumes est V2 — V1 est conservée uniquement pour le code TS legacy.

---

## ecritures_comptables (vue V1)

**Rôle** : vue rétrocompatible avec les noms de colonnes v1 (`compte`, `debit`, `credit`). Les triggers INSTEAD OF INSERT/UPDATE/DELETE réécrivent vers V2.

**Migrations** : `120_unify_ecritures_v2.sql`

**Gotchas** :
- ⚠ Ne propage PAS les colonnes `taux_change_applique`, `devise_origine`, `montant_origine`. Tout nouveau code doit écrire direct V2.

---

## factures

**Rôle** : factures clients et fournisseurs (devis/avoirs/facture/note_debit).

**Colonnes importantes** :
- `id`, `societe_id`, `dossier_id`, `type_facture` ('client'|'fournisseur'), `type_document` ('facture'|'avoir'|'devis'|'note_debit')
- `numero_facture`, `tiers`, `description`, `date_facture`, `date_echeance`
- `devise` (défaut 'MUR'), `taux_change` (défaut 1)
- `montant_ht`, `montant_tva`, `montant_ttc`, `taux_tva`, `montant_mur`
- `statut` : `en_attente | partiel | paye | retard | annule | brouillon`
- `rapproche_releve_id`, `rapproche_transaction_idx`, `rapproche_date`, `rapproche_source` — lien vers la tx bancaire qui a payé la facture
- `facture_origine_id` — pour avoirs (FK vers facture d'origine)

**Migrations** : 034 (create), 042, 099, 134 (avoirs).

**Gotchas** :
- `montant_mur` DOIT être rempli pour factures multi-devises. Si absent : `createEcrituresForFacture` fera `montant_ttc × taux_change` en fallback.
- `type_document='devis'` ne génère PAS d'écriture (skip jusqu'à conversion en facture).
- RLS historique faible (`auth.uid() IS NOT NULL`) — filtrage côté API obligatoire.

---

## releves_bancaires

**Rôle** : relevés bancaires importés. Les transactions sont stockées dans une colonne JSONB.

**Colonnes importantes** :
- `id`, `societe_id`, `compte_bancaire_id` (FK)
- `periode`, `date_debut`, `date_fin`
- `solde_ouverture`, `solde_cloture`
- `transactions_json` : JSONB array d'objets
- `statut` : 'en_attente' | 'traite' | 'erreur_ocr'
- `message_erreur` : si statut=erreur_ocr

**Format `transactions_json[i]`** (depuis fix OCR session avril 2026) :
```json
{
  "date": "YYYY-MM-DD",
  "libelle": "IB Account Transfer ...",
  "debit": 600.00,
  "credit": 0,
  "devise": "EUR",          // NEW — devise de la tx (fix F8)
  "montant_origine": 600,   // NEW — montant dans devise origine
  "tiers_detecte": "MR STEPHANE HENRI BACH",
  "statut": "non_identifie|rapproche|propose|a_verifier|interne|a_verifier_taux",
  "matched_type": "client|fournisseur|frais_bancaires|compte_courant_associe|...",
  "lettre": "AUTO0001",
  "facture_id": "uuid",
  "facture_ids": ["uuid1", "uuid2"],
  "rapproche_at": "ISO datetime"
}
```

**Gotchas** :
- ⚠ `transactions_json` est lu/écrit comme un blob — pas de transactionalité fine. Un UPDATE sur un seul index écrase le JSON entier.
- `compte_bancaire_id` détermine la devise de toutes les tx **sauf** si `tx.devise` est renseigné individuellement (depuis fix OCR).

---

## comptes_bancaires

**Rôle** : compte bancaire d'une société (1 société peut avoir N comptes).

**Colonnes** : `id`, `societe_id`, `banque`, `numero_compte`, `iban`, `devise`, `compte_comptable` (code PCM du 512, ex: `5121` MUR / `5122` EUR), `actif`.

**Gotchas** :
- ⚠ La `devise` est figée à la création. Si mal détectée à l'upload du 1er relevé, toutes les tx futures sont converties avec le mauvais taux → bug ×55 historique. Fix session : `compareCurrency()` bloque l'update silencieux + crée un nouveau compte avec suffixe `-EUR`/`-USD` en cas de conflit.

---

## bulletins_paie

**Rôle** : bulletin de salaire mensuel par employé.

**Colonnes importantes** : `id`, `employe_id`, `periode`, `salaire_base`, `transport_allowance`, `petrol_allowance`, `heures_sup_montant`, `special_allowance_1`, `eoy_bonus`, `csg_salarie`, `nsf_salarie`, `csg_patronal`, `nsf_patronal`, `training_levy`, `prgf`, `paye`, `salaire_net`, `statut` (brouillon|valide|comptabilise), `comptabilise`, `date_comptabilisation`, `nb_ecritures_generees`.

**Triggers** : `trg_auto_verrouille_bulletin` (bloque modif si statut>=valide), `trig_ecritures_paie` DÉSACTIVÉ (mig 169).

**Gotchas** :
- ⚠ Deux pipelines d'écritures paie coexistent historiquement. `SAL` mensuel agrégé (via `/api/rh/import-paie`) est le seul ACTIF. `OD-PAIE` par bulletin (`generer_ecritures_paie` RPC) est désactivé pour éviter doublons.

---

## employes

Colonnes : `id`, `societe_id`, `nom`, `prenom`, `code`, `email`, `telephone`, `date_embauche`, `type_contrat`, `salaire_base`, `mode_paiement`, `role` (pour détecter les associés), statut emploi.

RLS activé, policies à renforcer (audit sécurité).

---

## societes

Colonnes : `id`, `nom`, `brn` (Business Registration Number Maurice), `tan`, `vat_number`, `adresse`, `contacts` JSONB, `created_by`, `mra_api_key` (⚠ en clair — audit sécurité), etc.

**Gotcha** : `user_societes` (table de liaison) + `dossiers.client_id` + `societes.created_by` = 3 chemins de résolution d'accès, tous gérés par `lib/supabase/assert-societe-access.ts`.

---

## dossiers

Lien historique entre `societe` et `comptable` / `profile`. Utilisé en V1 via `dossier_id`. Depuis V2 on préfère scoper par `societe_id` direct.

---

## classification_rules

**Rôle** : règles automatiques qui classifient les tx bancaires lors de `auto_rapprocher`.

**Colonnes** : `id`, `rule_code`, `societe_id` (nullable = règle globale), `priority`, `active`, `pattern_libelle` (regex), `pattern_tiers` (regex), `classification`, `compte_debit`, `compte_credit`, `libelle_template`, `requires_validation`, `compliance_flag`, `legal_warning`, `nb_used`, `last_used_at`.

**Règles seedées** : R01-R06 (mig 135 + 136 + 170). Voir [03-plan-comptable.md](03-plan-comptable.md) pour la liste complète et l'état actuel (R05 désactivée).

---

## plan_comptable

**Rôle** : référentiel des comptes PCM Maurice.

**Colonnes** : `compte` (PK text, 3-5 digits), `libelle`, `type_compte` ('actif'|'passif'|'charge'|'produit'), `sens_normal` ('D'|'C'), `compte_parent`, `niveau`, `classe`, `actif`.

**Migrations** : 018 (initial), 144 (canoniques 4-digits), 158 (compléments MRA/bancaire), 166 (PCM complet ~80 comptes).

**Usage** : consulté par le picker plan comptable UI (`PlanComptablePicker` via `/api/comptable/plan-comptable`) et par le trigger `tr_00_legacy_3digit_warn` pour valider les remap.

---

## compte_remap_pcm

**Rôle** : table de remap codes legacy (6-digits type `421000`) → PCM canonique (4-digits type `4210`). Consommée par la fonction `remap_compte_pcm()` et son trigger.

**Colonnes** : `legacy_code` (PK), `pcm_code`, `libelle`, `note`.

**Migration** : 144, étendue par 158.

---

## Comptes courants associés

Deux tables :

**`comptes_courants_associes`** : 1 compte par associé/collaborateur. Colonnes : `id`, `societe_id`, `nom`, `type` ('associe'|'employe'), `solde` (agrégat recalculé).

**`mouvements_compte_courant`** : journal des mouvements. Colonnes importantes :
- `compte_courant_id` FK
- `societe_id`, `date_mouvement`, `type` ('avance'|'apport'|'retrait'|'remboursement'), `montant`, `description`
- **`source_releve_id`**, **`source_transaction_idx`**, **`source_kind`** (mig 167) — tracking de la tx bancaire source
- `facture_id`, `lettre` (optionnels)

**Index** : `ux_mouvements_cca_source` UNIQUE partiel sur `(compte_courant_id, source_releve_id, source_transaction_idx) WHERE source_releve_id IS NOT NULL` — empêche les doublons CCA structurellement.

**Gotchas** :
- ⚠ Les mouvements créés avant mig 167 n'ont pas de `source_releve_id` → pas protégés par l'index. Nettoyables via `/admin/repair` action `purge_cca_doublons`.
- ⚠ Le solde est un agrégat dénormalisé. `UPDATE comptes_courants_associes SET solde = ...` doit être cohérent avec `SUM(mouvements.montant * signe)`.

---

## taux_change_historique

**Rôle** : source de vérité pour les taux de change à une date donnée. Seedée initialement + alimentée manuellement ou via job de synchro.

**Colonnes** : `date_taux` (DATE), `devise` (TEXT), `taux_vers_mur` (NUMERIC), `source` (TEXT).

**PK** : `(date_taux, devise)`.

**Migration** : `171_taux_change_historique.sql`.

**Consommé par** :
- `lib/accounting/historical-rates.ts` :
  - `getHistoricalRate(supabase, date, devise)` — retourne le taux applicable (plus récent `date_taux <= date`)
  - `getHistoricalRatesForDates(supabase, tuples[])` — batch
- Utilisé par `app/api/comptable/rapprochement/route.ts` pour **geler** le taux au moment de la création BNQ (fix bug "×54 aujourd'hui au lieu de ×52 le 15/11/2025")

**Gotchas** :
- Si la devise n'a pas de row → `MissingHistoricalRateError`. Le code fallback sur taux live en mode non-bloquant pour tx déjà classifiées, mais flag `a_verifier_taux` pour tx non identifiées.
