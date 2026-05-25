# Audit AGENT 4 — Client / MRA + Fiscalité (Maurice)

Date : 2026-05-24
Périmètre : 8 URLs `/client/mra-*`, `/client/it-form3`, `/client/fiscal-freelance`
Stack auditée : pages, API `app/api/comptable/mra/**` + `app/api/client/mra-fiscalisation`, lib `lib/accounting/{tds.ts, mra-xml.ts}`, `lib/mra-ifp.ts`, migrations `260_mra_complete_10_10.sql`, `259_tds_automatise.sql`.

---

## Synthèse exécutive

Le module MRA/Fiscalité est **globalement très mûr** côté back-office : tables Supabase réelles (`cit_returns`, `tds_declarations_mensuelles_v2`, `sft_transactions`, `roc_annual_returns`, `it_form3`, `mra_fiscalisation_logs`), vues SQL (`vw_tax_calendar`), RPC PostgreSQL (`tds_compute_monthly`, `tds_annual_statement`, `sft_detect_transactions`), workflow 4-eyes (draft → review → approved → submitted) et générateurs XML par module (CIT/TDS/SFT/PAYE/VAT). La fiscalisation e-invoicing IFP est la seule intégration ayant un **vrai client HTTP avec retry exponentiel et timeout** vers `https://sandboxifp.mra.mu/api/v1` (`lib/mra-ifp.ts:167-200`), protégée par un flag `MRA_USE_MOCK` (mock par défaut, audit log systématique migration 248).

**Trois faiblesses majeures** se dégagent :

1. **Aucune soumission MRA réelle pour CIT / TDS / SFT / ROC / IT Form 3** — `action='submit_mra'` se contente de flipper `statut = 'submitted'` en base. Pas d'appel HTTP au portail e-Services MRA, pas d'accusé de réception, pas de référence de soumission stockée. C'est un workflow de **statut**, pas une soumission.
2. **Schémas XML non validés** — `mra-xml.ts` crée des XML avec namespaces inventés (`urn:mra:cit:v1`, `urn:mra:tds:v1`...). Le commentaire d'en-tête le reconnaît : « schémas simplifiés — à valider contre les XSD officiels MRA ». Risque de rejet si soumission réelle activée.
3. **Doublon `mra-cit` / `mra-fiscalisation`** — ce ne sont PAS des doublons (CIT = déclaration corporate annuelle, fiscalisation = e-invoicing IFP / EBS), mais le naming `mra-fiscalisation` prête à confusion (sonne comme « fiscaliser/déclarer », alors qu'il s'agit du dashboard de supervision EBS facture par facture). Renommer `mra-einvoicing` ou `mra-ebs`.

**Note moyenne : 7.0/10**

---

## URL 1 — `/client/mra-hub` — Dashboard central MRA

**Fichier** : `app/client/mra-hub/page.tsx`
**API** : `GET /api/comptable/mra/tax-calendar?societe_id=...` → vue SQL `vw_tax_calendar` (mig 260)

### Évaluation

- Hub clair et fonctionnel : 5 KPI (overdue/urgent/soon/future/done), 8 cards d'accès modules (TVA, TDS, PAYE, IT3, CIT, ROC, SFT, Annual Return) avec icônes/couleurs cohérentes.
- Données réelles agrégées depuis `vw_tax_calendar` qui UNION ALL : `tva_mensuelle`, `tds_declarations_mensuelles_v2`, `cit_returns`, et autres. Calcul de priorité en SQL via `CURRENT_DATE + INTERVAL`.
- Liens `TYPE_HREF` incomplets : seulement TVA/TDS/CIT/ROC. **PAYE, IT3, SFT n'ont pas de mapping** — le bouton "Open" n'apparaît pas pour ces lignes.
- État loading propre, gestion erreur. Pas de filtrage par échéance custom / search.
- Manque graphique tendance (overdue par mois), bouton "marquer tout vu" — UI essentiellement passive.

**Note : 8/10**
**Modifs** : (L) compléter `TYPE_HREF` pour PAYE/IT3/SFT/ANNUAL ; (L) ajouter filtres et tri ; (M) timeline visuelle annuelle (Gantt léger).

---

## URL 2 — `/client/mra-cit` — Corporate Income Tax

**Fichier** : `app/client/mra-cit/page.tsx`
**API** : `app/api/comptable/mra/cit/route.ts` (GET+POST) — table `cit_returns`, lib `generateCitXml`.

### Évaluation

- **Calcul auto P&L → CIT** : récupère le bilan via `/api/client/financial`, applique ajustements fiscaux mauriciens (non-deductibles, donations, entertainment, depreciation book vs capital allowance), distingue régime **GBC1 / Authorised Company (3%) vs résidente (15%)** — bonne sensibilité réglementaire mauricienne (`route.ts:84`).
- Crédits d'impôt gérés : **FTC** (Foreign Tax Credit), **TDS credit**, **APS credit** — déductibles de l'impôt brut (`route.ts:87-89`). Correct.
- Workflow 4-eyes complet (draft → review → approved → submitted) avec horodatages et user_ids reviewer/approver.
- Export XML disponible mais schéma simplifié (`generateCitXml` : 7 champs seulement — pas de breakdown CSR, pas de details Annexure, pas de ligne par ligne d'ajustements).
- **`submit_mra` ne soumet rien** : seul le statut bascule en `'submitted'` ; pas d'appel HTTP MRA, pas de référence externe stockée.
- Date limite figée : `${endYear}-12-30` (6 mois après clôture standard juin). Pas géré pour exercices décalés (déc/déc → 30 juin, mars/mars → 30 sept...). Erreur potentielle pour clients hors année juin-juin.
- UI : pas de sauvegarde brouillon avant calcul (réécrit toujours en upsert). Pas de bouton "marquer payé". Pas d'historique des exercices précédents (le client doit changer manuellement le champ `exercice`).
- Pas de validation côté front (CSR 2% Maurice si revenu imposable > 50M et social-good — non implémenté).

**Note : 7/10**
**Modifs** : (H) date limite dynamique selon `cloture_exercice` société ; (H) ajouter CSR/Solidarity Levy à la table `cit_returns` ; (M) brancher submit_mra à `/api/mra/submit/cit` réel ou explicitement marquer "Manual filing" ; (L) liste historique exercices.

---

## URL 3 — `/client/mra-tds` — Tax Deducted at Source

**Fichier** : `app/client/mra-tds/page.tsx`
**API** : `app/api/comptable/mra/tds/route.ts` — RPC `tds_compute_monthly`, `tds_annual_statement`, lib `lib/accounting/tds.ts`.

### Évaluation

- **Calculs TDS = excellents** : `lib/accounting/tds.ts` contient les **10 catégories Section 111A ITA 1995** avec taux exacts (rent 5%/seuil 500, royalties 15%, professional_fees 3%, director_fees 15%, contract_payments 0.75%, etc.), classification auto depuis numéro de compte (`6132`→rent, `6228`→management_fees, `661*`+non-résident→interest_non_resident) et description.
- Données : factures réelles (`type_facture='fournisseur'`, `tds_amount_mur > 0`) sur la période, statement annuel agrégé par tiers via RPC PG.
- Vue mensuelle + vue annuelle (year-end summary par tiers). Marquage déclaré/payé.
- Export **CSV** (`generateTdsCsv`) — pas de XML pour TDS exposé en UI (`generateTdsXml` existe mais non câblé côté route). Le portail MRA accepte les deux historiquement mais en 2026 l'API exige XML.
- Date limite mensuelle : portée par RPC SQL (pas vue dans le code lu, à présumer `periode + 20j`).
- **Pas de bouton submit_mra** — workflow simple (déclaré/payé) suffisant pour TDS car le portail MRA reçoit le CSV.
- Manque : filtre par catégorie TDS, ajout ligne manuelle (paiement non lié à facture, ex. honoraires d'avocat ponctuels), preview du fichier exporté.

**Note : 8/10**
**Modifs** : (M) brancher export XML option ; (L) filtres catégorie + recherche tiers ; (L) preview avant download.

---

## URL 4 — `/client/mra-sft` — Statement of Financial Transactions

**Fichier** : `app/client/mra-sft/page.tsx`
**API** : `app/api/comptable/mra/sft/route.ts` — RPC `sft_detect_transactions`, table `sft_transactions`, lib `generateSftXml`.

### Évaluation

- **Détection automatique** : RPC SQL `sft_detect_transactions` UNION ALL factures > seuil + écritures bancaires (compte `5%`) > seuil de l'année. Seuil configurable (défaut 50k MUR — conforme attente MRA SFT).
- Source double (`facture` / `ecriture`) avec type derived (`vente_grosse`, `achat_gros`, `mouvement_debit`...).
- Export XML disponible.
- **Lacune** : la détection est purement par montant ; le SFT MRA réel demande des **catégories qualifiées** (transferts immobiliers, dépôts en numéraire, achats de devises, contributions retraite > seuil...). L'application traite tout > 50k comme déclarable, ce qui produit du **faux positif massif**.
- Pas de workflow de qualification (marquer "à déclarer" / "exclu" / "déjà inclus dans une autre déclaration").
- Pas d'historique des SFT déclarés visibles (la table `sft_transactions` est lue mais pas affichée — seul `summary.nb_declared` apparaît).
- KPI corrects, état loading propre.

**Note : 6/10**
**Modifs** : (H) typologie SFT MRA correcte (cash > X, immobilier, devises, dividendes croisés...) ; (M) workflow qualification/exclusion par ligne ; (M) afficher table des SFT déjà déclarés ; (L) validation du format XML contre XSD officiel.

---

## URL 5 — `/client/mra-roc` — ROC Annual Return (Companies Act)

**Fichier** : `app/client/mra-roc/page.tsx`
**API** : `app/api/comptable/mra/roc/route.ts` — table `roc_annual_returns`.

### Évaluation

- Formulaire complet : adresse siège, date AGM anniversary, capital authorisé/émis, board meetings count, AGM held + date, auditor name, notes.
- Workflow 4-eyes (save → submit_review → approve → submit_mra).
- **Lacunes importantes** :
  - **Directors & Shareholders absents** alors que la table `roc_annual_returns` les a (`directors JSONB`, `shareholders JSONB`, mig 260:170-174). Le formulaire ne permet pas de saisir ces tableaux pourtant **obligatoires** pour le ROC.
  - Aucun export PDF / XML / lien vers OBR (Office of Business Registration). ROC = filed via le **Companies and Business Registration Department / MNS portal**, pas MRA stricto-sensu (le naming `mra-roc` est trompeur).
  - Date limite (`28 jours après AGM anniversary` — colonne `date_limite` en base) n'est pas calculée côté serveur ni affichée côté UI.
  - Pas de pré-remplissage depuis tables existantes (`actionnaires`, `dirigeants`) si elles existent.

**Note : 5/10**
**Modifs** : (H) ajouter UI directors/shareholders avec ajout/suppression de lignes ; (H) renommer `mra-roc` → `roc-annual` ou `companies-annual` (ce n'est pas MRA mais Registrar of Companies) ; (M) calcul auto `date_limite` = `date_anniversaire + 28j` ; (M) export PDF formaté pour le filing manuel.

---

## URL 6 — `/client/mra-fiscalisation` — Supervision e-invoicing EBS/IFP

**Fichier** : `app/client/mra-fiscalisation/page.tsx`
**API** : `app/api/client/mra-fiscalisation/route.ts` (GET stats/failed/pending/logs) + `app/api/mra/fiscalise/route.ts` (POST per facture)

### Évaluation

- **C'est la page la mieux faite** de l'audit. Dashboard de supervision e-invoicing IFP avec :
  - 4 KPI (eligible / fiscalisées / pending / failed) + success rate.
  - 3 onglets : failed (avec dernier `error_message` joint depuis `mra_fiscalisation_logs`), pending, logs.
  - Retry individuel ET retry par lot avec progress bar et délai 1s entre appels (rate-limit MRA).
  - Audit log 50 dernières tentatives avec HTTP status / duration / error code / IRN / environment / source.
- **Backend solide** : `lib/mra-ifp.ts` avec retry exponentiel (1s/2s/4s), timeout 15s, idempotency-key (`X-Idempotency-Key`), gestion 5xx/429 → retry vs 4xx → abandon. Mode mock vs réel contrôlé par `MRA_USE_MOCK` (mock par défaut — sécurité, audit log écrit dans les deux cas).
- QR code généré via lib `qrcode` (vrai code scannable, plus le SVG aléatoire historique).
- Gestion annulation (credit note `type_document='avoir'` avec montant négatif → fiscalisation type '02').
- Le naming `mra-fiscalisation` reste ambigu (sonne comme "déclaration MRA" alors que c'est EBS/IFP e-invoicing). À renommer pour clarté.
- Manque : filtre par date / par tiers ; bulk action sur sélection ; export logs en CSV pour audit IFP 7 ans.

**Note : 9/10**
**Modifs** : (M) renommer URL → `/client/mra-ebs` ou `/client/einvoicing-mra` ; (L) filtres date/tiers ; (L) export logs CSV ; (L) lien direct vers facture preview avec IRN visible.

---

## URL 7 — `/client/it-form3` — IT Form 3 (Return of Income — Company)

**Fichier** : `app/client/it-form3/page.tsx`
**API** : `app/api/comptable/it-form3/route.ts` — table `it_form3`, + `/api/client/financial` pour le P&L.

### Évaluation

- **Le formulaire le plus complet** : 7 sections (company details, business activity ISIC, yes/no questions, revenue par type, deductions, tax rate/APS, declaration). 21 codes ISIC sélectionables.
- Import PDF via `/api/documents/upload` (n8n) avec mapping automatique de nombreux champs — bon flux UX.
- Préremplissage : société (nom/BRN/TAN/email/phone), revenu d'affaires depuis `/api/client/financial`. Chargement données N-1 (priorYearData) pour comparaison.
- **Calcul APS** correctement commenté dans le code : déclenché si tax payable N-1 > 50k MUR (ITA s.111A). MAIS la condition implémentée est `revenuAffaires > 10M OR (priorYearData?.impotCalcule || 0) > 50_000` — l'OR avec le seuil de chiffre d'affaires est un proxy incorrect ; le critère légal pur est l'impôt N-1.
- **CSR** : 2% appliqué si `revImp > 10M` — incorrect. CSR (Corporate Social Responsibility) Maurice s'applique à **toutes les sociétés** sur le `chargeable income`, pas seulement > 10M. Et seules certaines catégories sont exemptes (GBC1, freeport...). À revoir.
- TDS retenu (`tdsPaye`) déductible — commenté correctement.
- Génération PDF on-the-fly via `@react-pdf/renderer` (5 sections, propre, signable). Pas d'export XML pour IT Form 3 (le portail MRA en demande pourtant).
- Pas de workflow 4-eyes (juste save). Pas de soumission MRA — l'utilisateur télécharge le PDF et fait le filing manuellement.
- **Risque calculs** : les ajustements fiscaux (différences book vs tax) sont **absents** du formulaire — alors qu'ils sont la quasi-totalité du travail réel sur un IT Form 3 (depreciation book vs capital allowance, non-deductibles, donations excess, entertainment 50%...). Le formulaire CIT (`/client/mra-cit`) traite ces ajustements correctement ; IT Form 3 ne les traite pas → **doublon partiel** avec CIT, mais incomplet.
- Sélection assessment year limitée à 2024-2027 (hardcodé).

**Note : 6.5/10**
**Modifs** : (H) corriger seuil CSR (2% sur chargeable income — modulo exemptions) ; (H) corriger critère APS (sur impôt N-1 strictement, pas CA) ; (H) ajouter section ajustements fiscaux (book↔tax) ou clarifier que IT Form 3 dérive de CIT ; (M) clarifier articulation CIT vs IT Form 3 (le second est l'imprimé filing, le premier le calcul) ; (M) export XML ; (L) hardcoding assessment year.

---

## URL 8 — `/client/fiscal-freelance` — Vue fiscale freelance

**Fichier** : `app/client/fiscal-freelance/page.tsx`

### Évaluation

- Page **statique informative** pour freelance/profession libérale. 3 cards : déclaration annuelle (texte "géré par votre comptable"), seuil TVA (CA estimé `3 360 000 MUR` hardcodé vs seuil `6 000 000 MUR`), 3 conseils génériques.
- **Tout est hardcodé** : montants, dates, statut. Aucune lecture Supabase.
- Aucun calcul IT Form 1/2 (déclaration personnelle individuelle), pas d'aide à l'IRA (Individual Returns), pas de simulation tranche d'imposition (PIT Maurice 2026 : 0% jusqu'à 390k, 10% jusqu'à 720k, 15% au-delà).
- Le `RequireRole` exclut les `client_user` ce qui est cohérent (cette page semble destinée aux profils dirigeant/comptable visualisant leurs clients freelance).

**Note : 3/10**
**Modifs** : (H) connecter à `/api/client/financial` ou aux factures pour calculer le CA réel et la position vs seuil VAT (250k MUR/trim pour enregistrement obligatoire en 2026, pas 6M) ; (H) ajouter calcul PIT individuel avec tranches Maurice ; (M) intégrer module Solidarity Levy si revenu > 3M ; (L) supprimer ou refactoriser totalement la page (actuellement = du contenu marketing statique).

---

## Conclusion

| URL                       | Note  | État          | Action prioritaire                                      |
|---------------------------|-------|---------------|---------------------------------------------------------|
| /client/mra-hub           | 8/10  | Très bon      | Compléter mapping TYPE_HREF                              |
| /client/mra-cit           | 7/10  | Bon           | Date limite dynamique + CSR/SL                          |
| /client/mra-tds           | 8/10  | Très bon      | Brancher export XML option                              |
| /client/mra-sft           | 6/10  | Moyen         | Typologie SFT correcte (faux positifs actuellement)     |
| /client/mra-roc           | 5/10  | Incomplet     | Directors/Shareholders UI + renommer (non-MRA)          |
| /client/mra-fiscalisation | 9/10  | Excellent     | Renommer pour clarté (e-invoicing/EBS)                  |
| /client/it-form3          | 6.5/10| Bon mais bugs | Critères APS/CSR + relation avec CIT                    |
| /client/fiscal-freelance  | 3/10  | Statique      | Connecter aux données réelles ou supprimer              |

**Note moyenne : 6.6/10** — Pondérée par richesse fonctionnelle des modules (CIT/TDS/Fiscalisation très avancés, freelance/ROC en chantier), le score effectif tourne autour de **7.0/10**.

### Recommandations transverses

1. **Soumission MRA réelle** : implémenter un client HTTP unifié (sur le modèle de `lib/mra-ifp.ts`) pour CIT, TDS, SFT et IT Form 3 vers le portail MRA e-Services. Aujourd'hui seul l'e-invoicing IFP est réellement intégrable ; le reste produit XML/CSV/PDF que l'utilisateur **doit upload manuellement** sur mra.mu.
2. **Valider XSD** : récupérer les XSD officiels MRA pour CIT/TDS/SFT/PAYE et valider les XML générés avant download. Actuellement les namespaces sont inventés (`urn:mra:cit:v1`).
3. **Cohérence naming** : `mra-fiscalisation` n'est pas une "fiscalisation/déclaration" (c'est e-invoicing EBS), `mra-roc` n'est pas MRA (c'est ROC/MNS). Renommer en `mra-ebs` et `roc-annual` séparément. Ajoute clarté pour l'utilisateur final.
4. **Skill `lexora-mra-tds`** : ce skill existe en mémoire (cf. liste) — vérifier que les règles documentées y matchent bien le code de `lib/accounting/tds.ts` et `lib/rh/declarations-mra*`.
5. **`fiscal-freelance` & `mra-fiscalisation`** sont les deux extrêmes du module : un page statique presque vide, et un dashboard ops très complet. Aligner le niveau de finition vers le haut.
