# Gotchas & Historique des migrations

Ce document centralise les pièges rencontrés lors de la refonte comptable 2026 et la timeline des migrations critiques. À lire **avant** toute modification touchant `ecritures_comptables_v2`, le plan comptable, la classification bancaire ou le pipeline OCR.

---

## Gotchas critiques à connaître avant de toucher au code comptable

### 1. Partial unique index sur `ref_folio`

Index `ux_ecritures_v2_ref_folio` défini sur `(societe_id, ref_folio, numero_compte) WHERE ref_folio IS NOT NULL`.

- `ON CONFLICT` doit **impérativement** inclure la même clause `WHERE (ref_folio IS NOT NULL)`, sinon erreur PostgreSQL 42P10 ("there is no unique or exclusion constraint matching the ON CONFLICT specification").
- Exemple correct :
  ```sql
  INSERT INTO ecritures_comptables_v2 (...)
  VALUES (...)
  ON CONFLICT (societe_id, ref_folio, numero_compte)
    WHERE (ref_folio IS NOT NULL)
  DO NOTHING;
  ```
- Les écritures sans `ref_folio` (OD manuelles, CCA) ne sont **pas** dédupliquées par cet index. C'est voulu : elles doivent rester libres.

### 2. Transition tables + column list = erreur 0A000

Impossible de combiner `UPDATE OF col1, col2, col3 ... REFERENCING NEW TABLE AS new_table`.

- Erreur rencontrée mig 166 : `transition tables cannot be specified for triggers with column lists`.
- Fix mig 168 : séparer en **2 fonctions trigger** distinctes — une pour INSERT (sans OF), une pour UPDATE (sans OF). Chacune référence sa propre transition table.

### 3. Trigger `tr_ecritures_canonicalize_compte` fossile

Trigger antérieur à mig 144 qui réécrit silencieusement `4210` → `421`, `4711` → `471`, etc.

- **Si présent après mig 144**, il annule toute modification manuelle vers les codes canoniques 4-digits.
- Symptôme : on `UPDATE numero_compte = '4210'` et la valeur revient à `421` sans erreur.
- Fix : `DROP TRIGGER IF EXISTS tr_ecritures_canonicalize_compte ON ecritures_comptables_v2;` (à faire une fois, pas dans une migration car potentiellement déjà absent selon l'ordre de déploiement).

### 4. Classification rules codes 6-digits legacy

Mig 135/136 ont seedé `classification_rules` avec des codes comme `421100`, `431100`, `447100`.

- Ces codes sont automatiquement remappés vers 4-digits par `tr_ecritures_remap_pcm` (mig 144).
- Mig 170 a corrigé certaines règles pour pointer **directement** sur les 4-digits (`4471` au lieu de `447100`) afin d'éviter la dépendance au trigger.
- Si une nouvelle règle est ajoutée, utiliser **toujours** le code 4-digits canonique (voir `03-plan-comptable.md`).

### 5. R05_INTERCO désactivée

Règle catch-all `R05_INTERCO` avait `pattern_libelle=NULL` ET `pattern_tiers=NULL` → matchait **toute** transaction bancaire non classée.

- Polluait le compte 580 (virements internes) avec des fournisseurs, salaires, frais divers.
- **Mig 170** : `UPDATE classification_rules SET actif = false WHERE code = 'R05_INTERCO';`
- Ne **jamais** réactiver sans ajouter un `pattern_libelle` strict (ex : `'virement.*interne|transfer.*between'`).

### 6. R04_NPF_NSF matching agressif

Le code MCB "NPF/NSF" apparaît aussi dans des libellés fournisseurs (ex : `SKYCALL ... NPF`).

- Ancienne règle : `pattern_libelle LIKE '%NPF%' OR %NSF%'` → matchait trop.
- **Mig 170** : ajouté `pattern_tiers ILIKE 'mauritius revenue|mra'` pour restreindre aux paiements MRA.

### 7. Dual pipeline paie (SAL vs OD-PAIE)

Deux chemins écrivent des écritures de paie :
- `import-paie` route → journal **SAL** (agrégé)
- Trigger `trig_ecritures_paie` → journal **OD-PAIE** (par bulletin)

Laisser les deux actifs = **doublons garantis** sur 641, 431, 432.

- **Mig 169** : `DROP TRIGGER IF EXISTS trig_ecritures_paie ON bulletins_paie;` — OD-PAIE désactivé.
- Seul SAL (agrégé mensuel) reste actif. Si besoin de détail par bulletin à l'avenir : utiliser une vue, pas un second journal.

### 8. Devise figée sur `comptes_bancaires.devise`

`comptes_bancaires.devise` est renseigné **à la création** du compte bancaire (souvent MUR par défaut).

- Si l'OCR détecte un relevé EUR mais que le compte est figé en MUR → multiplication × 55 (taux MUR/EUR) au moment de `createEcrituresForPayment`.
- **Fix** :
  - `resolveBankCurrency()` (`lib/accounting/validate-bank-currency.ts`) lit la devise réelle du document OCR.
  - `compareCurrency()` lève `BankCurrencyError` si mismatch et redirige vers un compte bancaire `-EUR`/`-USD` (création auto si absent).
  - Whitelist IBAN `['MU']` pour les comptes ambigus sans devise OCR.

### 9. `montant_ttc` vs `montant_mur`

Ancien code écrivait `montant_ttc` brut (devise d'origine) dans `ecritures_comptables_v2.debit`/`credit`.

- Si facture EUR 1000 avec taux 55 → écriture 1000 alors qu'elle devrait être 55000 (en MUR).
- **Fix** : `createEcrituresForFacture` exige `montant_mur` + `devise` + `taux_change`. Si devise ≠ MUR, `montant_mur = montant_ttc × taux_change`.
- Le Grand Livre est **toujours** en MUR. Les colonnes `montant_devise`/`devise_origine`/`taux_change_applique` (mig 172) conservent la trace.

### 10. Re-classification polluante

Changer une transaction bancaire de "CCA" vers "Fournisseur" laissait des écritures fantômes en compte courant associé (4710).

- **Fix** : route `rapprochement` fait un **cleanup systémique** avant de reclasser :
  1. DELETE `ecritures_comptables_v2` WHERE `ref_folio` commence par `CCA-<tx_id>`
  2. DELETE `ecritures_comptables_v2` WHERE `ref_folio` commence par `BANK-<tx_id>`
  3. DELETE `ecritures_comptables_v2` WHERE `ref_folio` commence par `TDS-<tx_id>`, `MC-<tx_id>`, `CLS-<tx_id>`
  4. UPDATE `transactions_bancaires` SET `compte_classe = NULL, statut_classement = 'non_classee'`
  5. DELETE `comptes_courants_associes_mouvements` WHERE `source_transaction_id = tx_id`
  6. DELETE `lettrages` WHERE un des `ecritures_ids` pointait sur les écritures purgées
  7. UPDATE `factures.statut_paiement` si des lettres ont sauté

### 11. Paiements groupés 1:N → collisions `ref_folio`

Un paiement couvrant plusieurs factures générait un seul `ref_folio = BANK-<releve>-<tx>` → conflit sur les écritures 4210 par tiers.

- **Fix** : format `BANK-<releve>-<tx>-<facture_short>` où `facture_short` = 8 premiers caractères de `facture_id`. Chaque écriture 4210 a son propre ref_folio.

### 12. Faux CCA "MCB", "HSBC", "Virement"

Certains noms ressemblent à des banques → créaient des comptes CCA 4710-MCB, 4710-HSBC parasites.

- **Fix** : blocklist dans la route de classification
  ```ts
  const BANK_LIKE_NAMES = /^(mcb|hsbc|sbm|absa|barclays|banque|bank)\b/i;
  const FEE_LIKE_NAMES = /^(frais|charge|commission|fee)\b/i;
  ```
  Si un tiers matche → refus de créer un CCA, redirection vers compte de charges/banque.

### 13. CCA "Propage" + "Avance" doublons

Propagation automatique (trigger) se déclenchait sur des transactions **déjà** classées → créait des mouvements CCA identiques.

- **Mig 167** : ajout de `source_transaction_id` + unique index partiel `(societe_id, source_transaction_id) WHERE source_transaction_id IS NOT NULL` sur `comptes_courants_associes_mouvements`.
- Cleanup systémique + idempotence par UUID transaction.

### 14. `balance_check_trigger` et colonnes NULL

Trigger de contrôle balance exigeait que `debit + credit = total` par ligne.

- Problème : une ligne INSERT sans `debit` explicite → DEFAULT 0 → trigger passait, mais UPDATE partiel cassait.
- **Mig 168** : re-écrit en 2 fonctions (INSERT seul, UPDATE seul) avec `COALESCE(debit, 0) + COALESCE(credit, 0)` explicite.

### 15. Format nombre OCR (× 55, × 100)

Bank statements parsés par Claude API peuvent retourner :
- `1,234.56` (US format)
- `1.234,56` (EU format)
- `123456` (centimes, sans séparateur)

Si on `parseFloat()` naïvement sur `"1.234,56"` → obtient `1.234` puis multiplie devises → chiffres faux × 55 ou × 1000.

- **Fix** : `parseAmount()` dans `lib/utils/bank-amount.ts` détecte locale via position de la virgule/point et rejette les formats ambigus.
- Tout upload bancaire passe par `parseAmountSafe()` qui lève `ParseAmountError` en cas d'ambiguïté → F7 gate bloque l'import.

### 16. Taux de change figés vs historiques

Si on recalcule un paiement 6 mois après, le taux de change actuel ≠ taux du jour du paiement.

- **Mig 171** : table `taux_change_historique (date, devise, taux)`.
- **Mig 172** : colonnes `taux_change_applique`, `devise_origine`, `montant_devise` sur `ecritures_comptables_v2` (freeze au moment de l'écriture).
- `getHistoricalRate(supabase, date, devise)` dans `lib/accounting/historical-rates.ts` — lève `MissingHistoricalRateError` si pas de taux pour la date.

### 17. RLS et `service_role`

Les routes `/api/admin/*` et les triggers comptables utilisent `service_role` qui bypass RLS.

- **Attention** : `/api/admin/repair` prend un `societe_id` en paramètre → toujours vérifier via `with-societe-access.ts` que l'utilisateur authentifié y a accès.
- Les cron jobs signent leurs requêtes avec `CRON_SECRET` (whitelist dans middleware).

### 18. Purge des doublons et contreparties

Supprimer des écritures de classe 6 (charges) sans purger leur contrepartie 401/411/512 déséquilibre le Grand Livre.

- **Règle** : toujours purger par **groupe `ref_folio`** (qui regroupe débit + crédit) plutôt que ligne par ligne.
- Requête de dédup sûre :
  ```sql
  DELETE FROM ecritures_comptables_v2
  WHERE ref_folio IN (
    SELECT ref_folio FROM (
      SELECT ref_folio,
             ROW_NUMBER() OVER (PARTITION BY societe_id, journal, date_operation, libelle, debit, credit ORDER BY created_at) as rn
      FROM ecritures_comptables_v2
      WHERE ref_folio IS NOT NULL
    ) t WHERE rn > 1
  );
  ```

### 19. Lettrage et écritures classe 6/7

Règle R7 : **aucune lettre ne peut être posée sur une écriture de compte classe 6 ou 7** (charges/produits).

- Seules les écritures de tiers (classe 4) ou trésorerie (classe 5) sont lettrables.
- Trigger `trg_enforce_r7_lettre_v2` bloque les INSERT/UPDATE de `lettrages` qui violeraient cette règle.

### 20. Middleware et routes publiques

`lib/supabase/middleware.ts` a une whitelist stricte :
- `/api/cron/*` → header `Authorization: Bearer <CRON_SECRET>`
- `/api/public/*` → accès libre (uniquement contact form)
- `/api/auth/*`, `/api/contact`, `/api/admin/health` → pas de session requise

**Toute autre route `/api/*` exige une session Supabase valide.** Ne pas ajouter de bypass sans vérification.

---

## Timeline des migrations — génération par génération

### Génération "intégrité comptable" (mig 144-157)

| Mig | Nom | Objet |
|---|---|---|
| 144 | `integrite_comptable_comptes_canoniques` | Trigger `tr_ecritures_remap_pcm` ; canonicalise tous les numéros de compte vers 4-digits au moment de l'INSERT |
| 144bis | `unifier_colonnes_employes` | (collision numéro, renommé) colonnes `employes` unifiées |
| 145 | `avances_salaire` | Table `avances_salaire` liée à `bulletins_paie` |
| 146 | `fix_ecritures_doublons` | Première vague de dédup basique (non systémique) |
| 147 | `storage_buckets_avatars_certificats` | Buckets Supabase Storage |
| 148 | `separate_planning_config` | Sépare `societes.regles_planning` de `societes.config_generale` |
| 149 | `fix_pointages_planning_fk` | Clés étrangères pointages ↔ planning |
| 150 | `purge_bnq_doublons_meme_lettre` | Purge écritures BNQ doublonnées avec lettre identique |
| 152 | `shift_template_id_text` | Type TEXT pour shift template |
| 153-156 | `conges_*` | Périodes de congés, accruals, soldes |
| 157 | `conges_droits_accrual` | Accrual mensuel automatique |

**Pas de 151, 162 — numéros sautés** suite à collisions locales.

### Génération "refonte bancaire" (mig 158-172)

Cette génération est le cœur de la refonte comptable 2026. À déployer **dans l'ordre**, chaque migration dépendant de la précédente.

| Mig | Nom | Problème résolu | Impact |
|---|---|---|---|
| **158** | `fix_classification_rules_pcm` | Règles R01-R06 avec codes PCM corrigés | Nouvelles classifications OK, anciennes à remapper |
| **159** | `purge_paie_doublons` | Doublons historiques SAL/OD-PAIE | Grand Livre paie nettoyé |
| **163** | `remap_bare_3digit_to_pcm` | Écritures avec codes 3-digits nus (`421`, `401`) remappées vers 4-digits | Trigger mig 144 devient obsolète pour l'historique |
| **164** | `backfill_montants_mur_vte_ach` | Factures VTE/ACH n'avaient pas `montant_mur` | Conversion rétroactive via taux historique |
| **165** | `trigger_warn_legacy_3digit` | Log warning si un INSERT contient un code 3-digit nu | Détection de régressions |
| **166** | `plan_comptable_strict_canonique` | Trigger strict pour canoniser à l'INSERT (tentative avec transition tables) | Erreur 0A000 — re-fixé mig 168 |
| **167** | `cca_dedup_tracking` | Colonne `source_transaction_id` + unique index sur CCA mouvements | Plus de doublons "Propage + Avance" |
| **168** | `fix_balance_trigger_insert` | Séparation trigger INSERT/UPDATE pour éviter column list + transition tables | Balance check robuste |
| **169** | `disable_trig_ecritures_paie` | Désactivation du second pipeline paie OD-PAIE | Plus de doublons bulletins |
| **170** | `restreindre_regles_classification` | R05_INTERCO désactivée, R04_NPF_NSF restreinte à MRA | Plus de pollution compte 580 |
| **171** | `taux_change_historique` | Table `taux_change_historique` seedée avec MUR/EUR, MUR/USD, MUR/GBP depuis 2023 | Historique taux disponible |
| **172** | `freeze_rate_per_ecriture` | Colonnes `taux_change_applique`, `devise_origine`, `montant_devise` sur ecritures_v2 | Audit trail complet des conversions |

### Rollback strategy

**Aucune des migrations 158-172 n'est trivialement réversible.** Elles modifient des données historiques (purges, backfills).

- **En cas de problème** :
  1. Snapshot Supabase avant toute re-migration en prod
  2. Les fonctions `/admin/repair` permettent de re-jouer des opérations (idempotentes)
  3. `vider_580_vers_4710` + `relettrer_factures` sont les seules qui touchent le solde courant — toujours dry-run d'abord

- **Colonnes ajoutées** (171, 172) : peuvent être DROP sans perte (les données se recalculent).
- **Triggers désactivés** (169, R05_INTERCO) : peuvent être ré-activés mais déclencheront à nouveau les bugs documentés.
- **Purges** (159, 163, 164) : **irréversibles** — restaurer via snapshot.

---

## Commit references (branche `claude/fix-reconciliation-ledger-Pf2gE`)

Les commits-clés à connaître pour remonter l'historique du code :

| Commit (court) | Sujet |
|---|---|
| `d45854e` | Idempotence stricte via `ref_folio` sur `rapprochement` route |
| `b13f551` | Cleanup systémique sur re-classification (7 tables purgées) |
| `0180b30` | Blocklist CCA `BANK_LIKE_NAMES` + `FEE_LIKE_NAMES` |
| `f07532c` | Wiring `getHistoricalRate` dans `createEcrituresForPayment` |
| `89cc4a3` | Freeze colonnes `taux_change_applique`/`montant_devise`/`devise_origine` |

Pour l'OCR :

| Fichier | Rôle |
|---|---|
| `lib/utils/bank-amount.ts` | `parseAmount` + locale detection |
| `lib/accounting/validate-bank-currency.ts` | `resolveBankCurrency` + IBAN whitelist |
| `lib/accounting/historical-rates.ts` | Taux historiques + batch |
| `app/api/documents/upload/route.ts` | F7 gate sanity + conflict handling EUR/USD suffix |
| `lib/ai/prompts.ts` | Prompt strict "Relevé Bancaire" avec format nombre + devise obligatoire |

---

## Checklist déploiement pour une nouvelle société

Quand un nouveau client est onboardé, vérifier dans l'ordre :

1. **Plan comptable importé** — `plan_comptable_mauricien` est global, mais si la société a un plan custom, checker via `societes_plan_comptable`.
2. **`comptes_bancaires.devise`** — ouvrir un compte par devise (MUR, EUR, USD) dès qu'un relevé multi-devise est attendu.
3. **`taux_change_historique`** — vérifier que la table est peuplée pour la période qui couvre les factures importées. Sinon appeler `/api/admin/repair` avec action `backfill_taux_change`.
4. **Classification rules** — vérifier que les règles R01-R06 existent pour la société (elles sont globales par défaut, override possible par société via `classification_rules_overrides`).
5. **Paramètres paie** — table `parametres_paie_*` pour la période fiscale courante (MRA 2026 = mig 143).
6. **RLS** — tous les comptes utilisateurs de la société doivent avoir `user_societes` avec le bon rôle.
7. **Healthcheck** — `/admin/health` doit être vert avant toute facturation.

---

## FAQ interne

**Q : Pourquoi ne pas tout mettre en 6-digits et laisser le trigger canonicaliser ?**
R : Performance (trigger tourne à chaque INSERT ~) + risque que le trigger soit désactivé ou oublié lors d'un restore. Plus sûr d'écrire directement en 4-digits canonique.

**Q : Pourquoi R05_INTERCO n'est pas DROP mais juste désactivée ?**
R : Pour garder l'historique des tentatives de matching + permettre réactivation future si pattern plus strict défini.

**Q : Le compte 580 "virements internes" doit-il toujours être soldé en fin de période ?**
R : Oui, règle R3. L'action `vider_580_vers_4710` de `/admin/repair` le fait si le solde résiduel < 5000 MUR (valeur configurable).

**Q : Peut-on lettrer une écriture OD manuelle ?**
R : Oui si elle est sur un compte classe 4 ou 5. Les classes 6/7 restent bloquées par le trigger R7.

**Q : Que faire si `taux_change_historique` manque une date ?**
R : Fallback sur la date la plus proche antérieure (même devise). Si aucun taux < 90 jours → `MissingHistoricalRateError` bloque l'opération. L'action `backfill_taux_change` re-peuple depuis l'API externe.

**Q : Est-ce que `/admin/repair` est idempotent ?**
R : Oui, toutes les 9 actions sont idempotentes. Re-run 2 fois = même état final. Dry-run montre ce qui serait fait sans appliquer.
