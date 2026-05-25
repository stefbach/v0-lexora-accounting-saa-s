# Audit AGENT 5 — CLIENT : GBC + Consolidation + International (12 URLs)

Date : 2026-05-24
Périmètre : 12 pages `/client/*` côté GBC / Full IFRS / Consolidation IFRS 10 / IFRS 9 ECL / FX / Annual Return.

## Synthèse

Le module GBC est de **loin** le plus structuré et le plus "auditable" du repo. Il couvre les 9 phases (A → I) annoncées dans le dashboard (devise fonctionnelle IAS 21 → PER → Substance/CIGA → TP → UBO → Consolidation IFRS 10 → CRS/FATCA → Pillar Two → Leases IFRS 16) avec :

- des **tables Supabase dédiées** (`gbc_per_categories`, `gbc_foreign_tax_credits`, `gbc_substance_tracking`, `gbc_substance_requirements`, `tp_transactions`, `tp_master_file`, `beneficial_owners`, `beneficial_owners_history`, `societes_relationships`, `consolidation_eliminations`, `crs_account_holders`, `crs_fatca_submissions`, `globe_jurisdictions`, `globe_gir_submissions`, `gbc_per_categories`),
- des **RPC Postgres métier** (`gbc_compute_tax_liability`, `gbc_assess_substance`, `consolidate_aggregate`, `compute_nci`, `ifrs9_compute_ecl_full`, `ifrs9_refresh_all_stages`),
- une **librairie TypeScript dédiée** (`lib/accounting/pillar-two.ts`, `lib/accounting/consolidation.ts`, `lib/accounting/crs-fatca.ts`, `lib/ifrs/ifrs9-ecl-engine.ts`) avec tests unitaires,
- des migrations clairement numérotées (250 PER, 251 Substance, 252 TP, 253 UBO, 254 Consolidation, 255 CRS/FATCA, 256 Pillar Two, 237 IFRS 9 stages),
- un **filtrage par régime** côté UI (`domestic` / `gbc1` / `authorised_company` / `holding` / `branch_foreign_pe`) qui masque les tuiles non applicables — c'est le seul module du SaaS qui implémente correctement la modulation par contexte fiscal.

Toutes les pages compilent (typage strict, i18n FR/EN via `t()`, sélection société via `useSocieteActive`), utilisent un patron homogène (KPIs en cards + tableau + dialogs de saisie). Les calculs critiques (Pillar Two top-up, goodwill IFRS 3, FTC, ECL) sont implémentés côté serveur ou en TS testé, **sans mocks de valeurs**.

**Quelques bémols majeurs :**

1. **Élimination intercos** — déclarée dans la table `consolidation_eliminations` mais **non appliquée** dans la réponse de `/api/comptable/gbc/consolidate` (boucle vide, voir code ci-dessous). Le total agrégé renvoyé inclut donc les doublons intercos.
2. **Translation IAS 21** — l'API consolidation expose `child.devise_fonctionnelle` mais ne convertit pas les soldes filiales en devise présentation du parent ; les soldes agrégés sont sommés "à plat" en MUR.
3. **CRS XML** — `generateCrsXmlSkeleton` est explicitement marqué comme "squelette" (commentaire dans `lib/accounting/crs-fatca.ts`) ; non conforme au schéma OCDE 2.0 complet (manque namespaces, ReportingFI block, MessageSpec, signature).
4. **Doublon URL "consolidation"** — `/client/gbc-consolidation` (IFRS 10, parent/filiales) et `/client/tiers-consolidation` (dédoublonnage de noms de tiers/CCA) **n'ont rien à voir** mais le nom porte à confusion. À renommer (suggestion : `/client/tiers-deduplicate`).
5. **PER computation** — la SQL utilise `e.per_category` (champ sur l'écriture comptable) mais aucune migration consultée ne montre comment ce champ est rempli automatiquement à partir du compte (les écritures legacy ont `per_category = NULL` → tombent en "non éligible" par défaut). Risque sous-estimation portion exempte.
6. **`taux-change`** — le bouton "Mettre à jour depuis BoM" appelle en réalité ExchangeRate-API (pas BoM Bank of Mauritius). Voir `lib/taux-change.ts` ligne 25 (`CURRENCIES_TO_FETCH`) + la card label dit "BoM" dans l'UI. Trompeur pour l'auditeur MRA.
7. **Pillar Two `submit_gir`** — passe juste `status: 'submitted'`, aucun envoi réel à l'OCDE / pas de génération XML GIR ; le bouton donne une fausse sensation de soumission.
8. **`annual-return`** — utilise React.print() via `window.open` + html2canvas/print, pas de génération PDF côté serveur via `@react-pdf/renderer` (stack pourtant disponible) ; fragile pour la conformité Companies Act.

## URL par URL

---

### 1. `/client/gbc-dashboard` — `app/client/gbc-dashboard/page.tsx`

**État** : compile, charge en parallèle 8 endpoints GBC + leases + mes-societes.

**Bons points** :
- Filtrage par régime (`mod.per_active`, `mod.substance_required`, …) parfaitement implémenté en mirror de `lib/accounting/regime.ts`.
- 3 KPIs synthétiques (compliant / at_risk / non_compliant) calculés sur les tuiles affichées seulement.
- Statut par tuile (`ok`/`warning`/`error`/`pending`/`na`) avec couleurs cohérentes.
- i18n complet (`t('gbc.dashboard.*')`).

**Bémols** :
- L'exercice est dérivé du mois courant (`getMonth() >= 6`) sans tenir compte de l'`exercice_debut_mois` configurable côté société.
- La tuile `IFRS 16 leases` pointe vers `/client/leases` qui n'est pas dans le périmètre Agent 5 et n'a pas été vérifiée existante.
- 0 TODO/mock dans le fichier.

**Note : 8.5/10**
**Modifs** : L = harmoniser la dérivation `exercice` via `lib/exercice.ts` (probablement existant).

---

### 2. `/client/gbc-per` — `app/client/gbc-per/page.tsx` + `app/api/comptable/gbc/per-computation/route.ts`

**État** : compile, GET appelle RPC `gbc_compute_tax_liability` + lit `gbc_per_categories` + `gbc_foreign_tax_credits`. POST insère un FTC.

**Calcul vérifié (migration 250)** :
- IS = `(rev_total − rev_non_eligible − rev_exempt_portion) × 15% + max(0, rev_non_eligible − charges) × 15% − FTC`
- Avec `rev_exempt_portion = rev × exemption_pct/100` (typiquement 80% → portion taxable réelle = 20%, taux effectif 3%). **Math correcte**.
- FTC plafonné `min(foreign_tax_paid, foreign_income × 15%)` — conforme ITA s.77.

**Bémols** :
- Le calcul s'appuie sur `e.per_category` (sur chaque écriture). Si l'écriture n'a pas été taguée, elle tombe en `non_eligible` → sous-estimation de la portion PER. La page ne montre **aucun outil de tagging**. `lib/accounting/gbc-auto-tagging.ts` existe mais aucun lien depuis la UI PER.
- Les `per_categories` (codes, libellés, exemption_pct) sont lus depuis la DB ; les tests `pillar-two.test.ts` / `consolidation.test.ts` existent mais aucun `gbc-per.test.ts`.
- 3 TODO/mocks (commentaires de doc, pas de mocks de valeurs).
- Pas d'export "Form 3" / pas de génération PDF déclarative.

**Note : 7.5/10**
**Modifs** :
- H = ajouter section "Écritures non taguées" + bouton "Auto-tag via `gbc-auto-tagging.ts`".
- M = export PDF / CSV Form 3 MRA.
- M = ajouter tests sur `gbc_compute_tax_liability`.

---

### 3. `/client/gbc-substance` — `app/client/gbc-substance/page.tsx` + `app/api/comptable/gbc/substance/route.ts`

**État** : compile, upsert sur `gbc_substance_tracking`, RPC `gbc_assess_substance` pour évaluation auto.

**Bons points** :
- Checklist CIGA correctement modélisée : type d'activité, date, lieu (placeholder "Mauritius"), description, participants. Stockée en `jsonb` `ciga_activities[]`.
- Mapping activity_code → seuils `min_expenditure_mur` + `min_employees` (table `gbc_substance_requirements`) — conforme FSC Substance Rules.
- Status auto : `compliant` / `at_risk` / `non_compliant` / `pending` calculé côté RPC.

**Bémols** :
- `actual_expenditure_mur` / `actual_employees` proviennent du RPC mais on ne voit pas dans la UI **d'où ils sont tirés** (vraisemblablement plan comptable 64xx + RH effectifs). Pas de traçabilité côté audit.
- Saisie CIGA fait un POST complet de la liste à chaque ajout (pas incrémental → race condition possible si deux opérateurs).
- Pas de validation "lieu = Mauritius" obligatoire pour les Board Meetings (substance requirement strict).
- 3 occurrences de "TODO"-like (commentaires).

**Note : 7.5/10**
**Modifs** :
- M = afficher la source des `actual_expenditure_mur` (plan comptable + journal).
- M = forcer `location='Mauritius'` pour `board_meeting` et `investment_decision` (avec alerte si autre).
- L = endpoint dédié `POST /ciga-activity` au lieu de réécrire la liste.

---

### 4. `/client/gbc-transfer-pricing` — `app/client/gbc-transfer-pricing/page.tsx` + `app/api/comptable/gbc/transfer-pricing/route.ts`

**État** : compile, deux entités gérées (`tp_transactions` + `tp_master_file`).

**Bons points** :
- 5 méthodes OECD : CUP / RPM / CPM / TNMM / PSM — toutes documentées dans les SelectItem.
- 3 tiers de documentation (`documentation_required` > 5M MUR, `recommended` > 1M, `optional`) — seuils OECD/FSC Mauritius cohérents.
- Master File OECD : group_structure, business_overview, intangibles, financing, financial_position, consolidated_revenue.
- Sauvegarde `is_within_range` (oui/non) + `arm_length_range_low/high` + `benchmarking_source`.

**Bémols** :
- **Pas de Local File** — seul Master File. Pour Maurice (FSC + Income Tax Act s.75A) le Local File est typiquement requis. Manque champ "tested_party" et "comparables_list".
- Le code de la route GET fait un fallback double-fetch bizarre (ligne 19-22) qui ré-interroge `tp_transactions` si exercice fourni — pattern peu lisible.
- 4 TODO-likes dans le code (commentaires).
- Pas d'attachement de pièces justificatives (rapports de comparables).

**Note : 7/10**
**Modifs** :
- H = ajouter Local File (tested party, FAR analysis, comparables list).
- M = simplifier requête GET (un seul appel).
- M = attachement de PDF (rapport benchmarking).

---

### 5. `/client/gbc-ubo` — `app/client/gbc-ubo/page.tsx` + `app/api/comptable/gbc/beneficial-owners/route.ts`

**État** : compile, table `beneficial_owners` + `beneficial_owners_history` (audit trail).

**Bons points** :
- Champs UBO complets : identité, DOB, nationalité, résidence, pièce ID (type/n°/pays/expiry), %détention, nature contrôle (shares/voting/board/contract/other), is_PEP + détails, sanctions screening.
- 3 actions : declare / attest (re-vérification) / revoke (effective_to date).
- History persisté avec `old_value`/`new_value` JSONB — bon pour audit FSC.
- Warning si `total_pct_declared < 75%` → "vérifier UBOs ≥10% manquants" (seuil FSC).

**Bémols** :
- **Aucun screening sanctions réel** : c'est un Select Oui/Non manuel (OFAC/EU listings non interrogés).
- **Aucun PEP screening API** (typiquement Dow Jones / WorldCheck).
- Pas de validation "somme pct ≤ 100%".
- Pas d'upload pièce d'identité (KYC).
- 1 TODO-like (commentaire).

**Note : 7/10**
**Modifs** :
- H = intégration screening sanctions (OFAC SDN list libre, ou WorldCheck via API).
- M = upload + storage Supabase de la pièce ID.
- L = validation back `SUM(pct_detention) ≤ 100`.

---

### 6. `/client/gbc-pillar-two` — `app/client/gbc-pillar-two/page.tsx` + `app/api/comptable/gbc/pillar-two/route.ts` + `lib/accounting/pillar-two.ts`

**État** : compile, calcul Top-up dans `lib/accounting/pillar-two.ts` avec test unitaire (`pillar-two.test.ts`).

**Bons points (très solide)** :
- Constantes correctes : `PILLAR_TWO_REVENUE_THRESHOLD_EUR = 750_000_000`, `MINIMUM_ETR_PCT = 15`.
- SBIE phase-in implémenté : 2024+ → 5%/5%, transitional 2022 (9.4%/7.8%) et 2023 (9%/7.6%).
- Formule Top-up = `max(0, GloBE_income − SBIE) × (15 − ETR) / 100` avec ETR = `covered_taxes / globe_income × 100`.
- Preview live dans la dialog (ETR, SBIE, excess, top-up) → excellent UX auditeur.
- `is_low_taxed` flag dans la table → coloration rouge dans le tableau ETR.
- Détection in_scope basée sur consolidated_revenue_eur ≥ 750M.

**Bémols** :
- `submit_gir` ne génère **aucun XML GIR OCDE** (juste un upsert avec `status='submitted'`). Le bouton est trompeur.
- Pas d'IIR / UTPR / QDMTT séparés (juste `total_top_up_mur` + `total_dmtt_mur`).
- Pas de gestion des **safe harbours** (CbCR safe harbour, Simplified ETR safe harbour) — pourtant cruciaux 2024-2026.
- 1 TODO-like.

**Note : 8/10**
**Modifs** :
- H = implémenter safe harbours (au moins CbCR transitional safe harbour 2024-2026).
- H = générer XML GIR (schema OCDE) ou au moins JSON conforme.
- M = séparer IIR / UTPR / QDMTT.

---

### 7. `/client/gbc-crs-fatca` — `app/client/gbc-crs-fatca/page.tsx` + `app/api/comptable/gbc/crs-fatca/route.ts` + `lib/accounting/crs-fatca.ts`

**État** : compile, table `crs_account_holders` + `crs_fatca_submissions`, génération XML.

**Bons points** :
- Champs holder complets : type (individual/entity/controlling_person), TIN + pays émetteur, balance EOY, interest, dividends, gross_proceeds, other_income.
- Seuils FATCA codés : 50K USD individu, 250K USD entité.
- Liste `CRS_REPORTABLE_JURISDICTIONS` (40+ juridictions OCDE).
- `isFatcaReportable()` / `isCrsReportable()` helpers testés (`crs-fatca.test.ts`).
- Génération XML déclenche un upsert en `crs_fatca_submissions` avec status='draft'.

**Bémols (majeurs)** :
- **XML "squelette" explicitement non production-grade** (commentaire dans le code). Manque namespaces complets, ReportingFI, MessageSpec, signature digitale.
- Pas de helper `combined` (CRS+FATCA simultanés) malgré le type `SubmissionType = 'crs' | 'fatca' | 'combined'`.
- Pas de validation TIN (format par pays).
- Bouton "Générer XML" disponible même quand `nb_holders = 0` → produit un XML vide.
- 1 TODO-like.

**Note : 6.5/10**
**Modifs** :
- H = XML CRS schema 2.0 complet (namespaces, MessageSpec, ReportingFI, OECD0 vs OECD1).
- H = XML FATCA séparé (US FATCA schema 2.0).
- M = validation TIN par juridiction (regex).

---

### 8. `/client/gbc-consolidation` — `app/client/gbc-consolidation/page.tsx` + `app/api/comptable/gbc/consolidate/route.ts` + `lib/accounting/consolidation.ts`

**État** : compile, table `societes_relationships` + `consolidation_eliminations` + RPC `consolidate_aggregate` + `compute_nci`.

**Bons points** :
- Calcul goodwill IFRS 3 : `cost − (FV_net_assets × pct)` — preview live dans la dialog.
- Méthodes : full / equity / proportional (IFRS 10 + IAS 28).
- Helper `recommendConsolidationMethod` (>50% → full, ≥20% → equity).
- NCI calculé par RPC sur capitaux propres filiale × (100 − pct_parent).
- KPIs : nb consolidées full, total goodwill, nb éliminations, total NCI.

**Bémols (majeurs)** :
- **Élimination intercos non appliquée** : route ligne 26-30 boucle sur `eliminations` mais ne fait rien (commentaire "for now we keep it simple") → les soldes agrégés contiennent les doublons intercos.
- **Translation IAS 21 absente** : aucune conversion devise filiale → devise présentation parent. `child.devise_fonctionnelle` est exposé mais ignoré dans l'agrégation.
- Pas d'UI pour saisir les éliminations (création table seulement).
- Pas de génération états consolidés (bilan / P&L consolidés).
- Pas de test d'impairment goodwill annuel (helper `isGoodwillImpaired` existe mais non appelé).
- 1 TODO-like.

**Note : 6/10**
**Modifs** :
- H = appliquer les éliminations dans l'agrégat retourné.
- H = translation IAS 21 (taux clôture pour bilan, taux moyen pour P&L, différence en OCI).
- M = UI d'ajout d'élimination + génération auto (détection comptes 4xx miroir entre sociétés du périmètre).
- M = états consolidés exportables.

---

### 9. `/client/tiers-consolidation` — `app/client/tiers-consolidation/page.tsx`

**État** : compile. **CE N'EST PAS DE LA CONSOLIDATION IFRS 10.**

**Description réelle** : outil de dédoublonnage des noms de tiers (clients/fournisseurs) avec score de similarité (fuzzy matching). Permet de fusionner les variantes orthographiques de "ACME Ltd" / "Acme Limited" / "ACME LTD." en un nom canonique → renomme factures + fusionne CCA.

**Bons points** :
- UI claire : sensibilité paramétrable (min_similarity 0.4-1), groupes affichés avec variantes + scores, sélection du nom canonique.
- Confirmation explicite "Action IRREVERSIBLE" avant fusion.
- 0 TODO/mock.

**Bémols** :
- **Nom de l'URL trompeur** — devrait être `/client/tiers-deduplication` ou `/client/tiers-merge`. Confusion forte avec consolidation IFRS 10.
- Aucun lien depuis le dashboard GBC (logique, puisque hors GBC).
- Pas de "preview" du SQL exécuté avant la fusion (irréversible).
- Pas d'undo (audit trail ? non vérifié).

**Note : 7.5/10** (en tant qu'outil de nettoyage tiers — bon)
**Modifs** :
- H = renommer URL pour éviter la confusion avec `gbc-consolidation`.
- M = ajouter un journal d'opérations / undo (table `tiers_merge_history`).

---

### 10. `/client/ifrs9-ecl` — `app/client/ifrs9-ecl/page.tsx` + `app/api/comptable/ifrs9/ecl/route.ts` + `lib/ifrs/ifrs9-ecl-engine.ts`

**État** : compile, RPC `ifrs9_compute_ecl_full` + `ifrs9_refresh_all_stages` + vue `vw_ifrs9_disclosure`.

**Bons points** :
- Stages 1/2/3 visualisés avec coloration (emerald/amber/red) + disclosure IFRS 7.35M (exposure + nb_contreparties + nb_factures par stage).
- Colonnes affichées : tiers, stage, exposure, PD utilisé, LGD, EAD factor, macro_multiplier, ECL_base, ECL_with_macro.
- KPIs : exposure_total, ECL_base, ECL_forward_looking, macro_impact, coverage_ratio_pct.
- Override manuel d'un stage avec prompt obligatoire pour la raison → traçabilité (action='override_stage' POST).
- Refresh stages bouton dédié.
- Tables sous-jacentes : `ifrs9_stage_assignments`, `ifrs9_counterparty_params`, `ifrs9_macro_scenarios` (migration 237 + 222).
- 0 TODO/mock.

**Bémols** :
- Pas d'affichage des **scénarios macro** (`ifrs9_macro_scenarios`) ni du `macro_weights` utilisé — le multiplicateur arrive comme un nombre opaque.
- Pas de simulation "what-if" (changer macro_multiplier de +0.1 et voir impact).
- Pas de SICR threshold visible (Significant Increase in Credit Risk — déclencheur passage 1→2).
- Pas de génération d'écritures comptables (provision 491xxx).
- L'override force un stage côté tiers mais on ne sait pas si elle persiste ou si elle est écrasée par `refresh_all_stages`.

**Note : 8/10**
**Modifs** :
- M = afficher les scénarios macro (base/upside/downside + poids).
- M = expliquer le SICR threshold dans la UI (tooltip).
- M = générer écritures comptables provision (proposition au comptable).
- L = simulation what-if.

---

### 11. `/client/taux-change` — `app/client/taux-change/page.tsx` + `app/api/comptable/taux-change/route.ts` + `lib/taux-change.ts`

**État** : compile, table `taux_change` + connecteur `bom-fx` + ExchangeRate-API fallback.

**Bons points** :
- 14 devises supportées (EUR, GBP, USD, ZAR, CNY, AED, INR, SGD, JPY, CHF, CAD, AUD, KES, MGA).
- Saisie manuelle historique possible (action='manual_entry').
- Source badge "auto" vs "manual" visible dans le tableau → traçabilité MRA.
- Historique par devise (30 jours).
- Fallback rates hardcodés (FALLBACK_RATES dans `lib/taux-change.ts`) → ne plante jamais.
- 2 TODO-like (commentaires).

**Bémols (majeurs)** :
- Le bouton dit "Mettre à jour depuis BoM" mais le connecteur réel `fetchAndStoreRates` utilise ExchangeRate-API en pratique (BoM est un connecteur séparé dans `lib/connectors/bom-fx`, mais le fallback API n'est pas forcément BoM). **Trompeur**.
- `FALLBACK_RATES` hardcodés peuvent rester actifs si DB vide (EUR=46.50 etc.) — ils datent de quand ?
- Pas d'historique de **conversion** (quelle écriture comptable a utilisé quel taux) — gros manque pour audit IAS 21.
- Pas de cron job visible pour rafraîchir quotidiennement (le bouton est manuel).
- Pas de gestion taux moyen mensuel (utile pour P&L conso IAS 21).

**Note : 6.5/10**
**Modifs** :
- H = clarifier source réelle : si BoM, vérifier que `lib/connectors/bom-fx.ts` est bien appelé ; sinon renommer "ExchangeRate-API".
- H = ajouter cron Vercel quotidien (`/api/cron/refresh-taux-change`).
- M = vue "taux moyen mensuel" calculée pour conso P&L IAS 21.
- M = traçabilité écriture → taux utilisé (champ `taux_change_id` sur `ecritures_comptables_v2` ?).

---

### 12. `/client/annual-return` — `app/client/annual-return/page.tsx` + `app/api/comptable/roc/annual-return/route.ts`

**État** : compile, lit `societes`, `administrateurs`, `actionnaires`, `financial`, sauvegarde via POST.

**Bons points** :
- Couvre les 5 sheets Companies Act 2001 : Company Info / Shares / Capital Details / Directors+Secretary / Financial Summary.
- Pré-remplissage automatique depuis Supabase (`societes` + `roc/administrateurs` + `roc/actionnaires` + `client/financial`).
- Comparatif N vs N-1 avec variance %.
- Import PDF via `/api/documents/upload` (envoi N8N) → mapping de 15+ champs.
- Sauvegarde JSON dans `annual_returns.notes` pour les champs hors schéma.
- 0 TODO/mock.

**Bémols** :
- Export PDF = `window.print()` via clone HTML stripé de Tailwind couleurs (workaround oklch/lab) — fragile. La stack `@react-pdf/renderer` est disponible mais non utilisée.
- Stockage de structures complexes (shares, directors) **sérialisées dans une colonne `notes` JSON** → pas requêtable.
- Pas de validation pre-soumission (somme par_value_shares + no_par_value_shares = stated_capital ?).
- Le `company_type` propose `GBC1` et `GBC2` mais Mauritius a aboli GBC2 en 2019 (devenu Authorised Company) — incohérent avec le filtrage `regime` du dashboard GBC.
- Pas d'envoi automatique au Registrar of Companies (le bouton "save" enregistre en local seulement).

**Note : 7/10**
**Modifs** :
- H = remplacer print() par génération PDF `@react-pdf/renderer` (stack disponible, déjà utilisée dans RH).
- M = colonnes dédiées dans `annual_returns` (shares, directors, secretary) au lieu de `notes` JSON.
- M = mettre à jour SelectItem `company_type` (retirer GBC2, ajouter Authorised Company, aligner avec `regime` enum).
- L = validation "stated_capital = somme parts émises".

---

## Note moyenne du périmètre

| URL | Note |
| --- | ---- |
| `/client/gbc-dashboard` | 8.5 |
| `/client/gbc-per` | 7.5 |
| `/client/gbc-substance` | 7.5 |
| `/client/gbc-transfer-pricing` | 7.0 |
| `/client/gbc-ubo` | 7.0 |
| `/client/gbc-pillar-two` | 8.0 |
| `/client/gbc-crs-fatca` | 6.5 |
| `/client/gbc-consolidation` | 6.0 |
| `/client/tiers-consolidation` | 7.5 |
| `/client/ifrs9-ecl` | 8.0 |
| `/client/taux-change` | 6.5 |
| `/client/annual-return` | 7.0 |

**Note moyenne : 7.25 / 10**

## Conclusion

Le module GBC est **le plus mature et le plus "compliance-ready"** du SaaS Lexora : architecture en phases A→I, séparation lib/RPC/UI claire, filtrage par régime, audit trail (history tables) sur UBO + ECL, tests unitaires sur Pillar Two et consolidation. Le code est cohérent, peu de mocks, i18n complet.

**Trois points bloquants pour aller en production réelle** :

1. **Consolidation IFRS 10 incomplète** : éliminations intercos non appliquées + translation IAS 21 absente → les états consolidés ne sont **pas auditables**. La table existe, le helper TS existe, mais la chaîne UI → API → RPC ne ferme jamais la boucle.

2. **CRS/FATCA XML non production-grade** : le commentaire l'admet, mais le bouton de génération XML est trompeur pour le client. Soit retirer le bouton, soit terminer le schéma OCDE 2.0.

3. **Pillar Two GIR n'envoie rien** : `submit_gir` fait juste un UPDATE status. Pour des holdings > 750M EUR, c'est un risque réputation.

**Trois points faciles à corriger** :

- Renommer `/client/tiers-consolidation` → `/client/tiers-deduplication` (confusion sémantique).
- Aligner `company_type` de `annual-return` avec le `regime` enum (retirer GBC2).
- Cron quotidien BoM pour `taux-change` + clarifier la source affichée dans la UI.

## 3 highlights

1. **Pillar Two : le seul calcul fiscal vraiment complet du repo.** Phase-in SBIE 2022→2024+ implémenté, formule top-up correcte, preview live dans la UI, test unitaire. Référence à reproduire ailleurs (IFRS 9 ECL est presque au même niveau).

2. **Consolidation IFRS 10 cassée silencieusement.** Le route `/api/comptable/gbc/consolidate` charge `consolidation_eliminations` mais une boucle vide les ignore (commentaire "for now we keep it simple"). Les soldes consolidés contiennent les intercos en double — produit un bilan / P&L incorrect sans erreur visible. C'est le bug le plus critique du périmètre.

3. **`taux-change` : libellé UI trompeur.** Le bouton "Mettre à jour depuis BoM" appelle ExchangeRate-API en pratique. Un connecteur BoM existe (`lib/connectors/bom-fx.ts`) mais n'est pas systématiquement utilisé. À clarifier urgemment — un auditeur MRA verra "BoM" et fera confiance à un taux qui n'en vient pas.
