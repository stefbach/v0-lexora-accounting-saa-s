# LEXORA — MASTER PLAN DE DÉVELOPPEMENT
## Application SaaS Comptable Universelle — Maurice (MRA Compliant)
## Généré le 2026-03-28 par audit complet

---

## CONTEXTE

LEXORA est un SaaS comptable IA dédié aux entreprises mauriciennes (MRA compliant).
Stack : Next.js 14, Supabase PostgreSQL, Claude AI (Anthropic), Vercel, WATI (WhatsApp).
Repo GitHub : stefbach/v0-lexora-accounting-saa-s

---

## SPRINT 0 — CORRECTIONS CRITIQUES (bugs bloquants en production)

### S0-1 : Unifier les écritures comptables v1 → v2
**Problème :** `ecritures_comptables` (v1, liée à dossier_id) reçoit toutes les écritures IA.
`ecritures_comptables_v2` (liée à societe_id) = vide, jamais alimentée.
**Fix :**
- Migration SQL 014 : migrer v1 → v2 + ajouter societe_id sur v1
- Modifier `upload/route.ts` : écrire dans les DEUX tables pendant la transition
- À terme : tout passer sur v2, supprimer v1

### S0-2 : Normaliser SUPABASE_SERVICE_ROLE_KEY partout
**Problème :** Certaines routes utilisent `SUPABASE_SECRET_KEY || SUPABASE_SERVICE_ROLE_KEY`, d'autres uniquement `SUPABASE_SERVICE_ROLE_KEY`.
**Fix :**
- Chercher/remplacer dans tout le codebase : standardiser sur `SUPABASE_SERVICE_ROLE_KEY`
- Mettre à jour `.env.local.example`

### S0-3 : Fixer trigger create_dossiers_for_societe (client_id manquant)
**Problème :** Le trigger insert dans `dossiers` sans `client_id` (NOT NULL) → crash silencieux.
**Fix :**
- Migration 014 : ajouter `client_id` depuis `societes.client_id` dans le trigger
- Rendre `dossiers.comptable_id` nullable (déjà fait migration 011 ✅)

### S0-4 : Fixer cron alerte-csg-mensuelle (3 bugs SQL)
**Problème :**
- `.eq('statut', 'active')` → colonne inexistante (c'est `statut_tva` booléen)
- `.gt('nombre_employes', 0)` → colonne inexistante
- Référence à `declarations_fiscales` → table inexistante (c'est `declarations_annuelles`)
**Fix :** Corriger les 3 requêtes dans `/api/cron/alerte-csg-mensuelle/route.ts`

### S0-5 : Fixer cron alerte-tva-j1 (INSERT sans client_id)
**Problème :** INSERT dans `tva_mensuelle` sans `client_id` (NOT NULL).
**Fix :** Récupérer `client_id` depuis `societes` avant l'insert.

### S0-6 : Fixer middleware (dashboard public sans auth)
**Problème :** `pathname.startsWith('/dashboard')` → toutes les pages /dashboard/* sont publiques.
**Fix :** Retirer `/dashboard` des routes publiques dans `lib/supabase/middleware.ts`.

### S0-7 : Fixer RLS notifications + simulations (USING true)
**Problème :** `CREATE POLICY ... USING (true)` → tout le monde voit tout.
**Fix :** Migration 014 : RLS correcte par destinataire_id / cree_par_id.

### S0-8 : Fixer RLS comptes_bancaires (clients bloqués)
**Problème :** Migration 010 drop+recrée la table sans RLS client.
**Fix :** Migration 014 : ajouter policy client via `societes.client_id`.

### S0-9 : Fixer dialog réassignation société (ne fait rien)
**Problème :** `handleReassign()` contient `// For now, just close the dialog`.
**Fix :** Créer route `PATCH /api/documents/[id]` + appeler depuis handleReassign.

### S0-10 : Supprimer double routing /dashboard/*
**Problème :** `/app/dashboard/*` (prototype v0) coexiste avec `/app/admin`, `/app/comptable`, `/app/client`.
**Fix :** Supprimer `/app/dashboard/` entièrement.

---

## SPRINT 1 — UPLOAD / OCR / AFFECTATION (fonctionnalité #1)

### S1-1 : Prompt relevé bancaire V2 — Lecture complète obligatoire
**Fichier :** `lib/ai/prompts.ts` + `app/api/documents/upload/route.ts`
**Changements :**
- Injecter `SYSTEM_PROMPT_RELEVE_BANCAIRE` depuis `prompts.ts` dans l'upload (pas le prompt inline)
- Augmenter `max_tokens` à 16384 pour les relevés bancaires
- Ajouter instruction explicite : "Lis TOUTES les lignes sans exception"
- Ajouter vérification de cohérence : `solde_ouverture + Σ(crédits) - Σ(débits) = solde_clôture`
- Si écart > 1 MUR : flag `lignes_manquantes: true` + relancer avec hint

**Patterns MCB étendus à ajouter dans le prompt :**
```
- "IB Account Transfer" → 581 Virements internes
- "Direct Debit Scheme MAURITIUS REVENUE AUTHORITY" → selon référence : 4457/431/444
- "Forex Difference" → 666/766 Écart de change
- "PAIEMENT MCB-[0-9]+" → 58X Virement interne inter-comptes
- "Bulk Payment SALARY" → 421 Rémunérations
- "International Transfer" → identifier tiers sur libellé
- "SWIFT" → virement international, identifier devise
- "Standing Order" → prélèvement automatique récurrent
- "Charge / Commission" → 627 Frais bancaires
```

**Identification bénéficiaire/payeur sur crédits :**
- Extraire le nom de l'entité depuis le libellé ("VIREMENT DE : <NOM>")
- Mapper vers compte 411 + nom_tiers identifié
- Détecter référence facture si présente (REF, INV, #, /)

### S1-2 : Traçabilité du taux de change par transaction
**Migration SQL 015 :**
```sql
ALTER TABLE transactions_bancaires ADD COLUMN devise_origine TEXT;
ALTER TABLE transactions_bancaires ADD COLUMN montant_origine NUMERIC(15,4);
ALTER TABLE transactions_bancaires ADD COLUMN taux_change_applique NUMERIC(12,6);
ALTER TABLE transactions_bancaires ADD COLUMN source_taux TEXT DEFAULT 'live';
ALTER TABLE transactions_bancaires ADD COLUMN ecart_change_mur NUMERIC(15,2) DEFAULT 0;
```
- Stocker le taux appliqué au moment de l'analyse
- Calculer et stocker l'écart de change si le taux évolue
- Générer écriture 666/766 pour les écarts de change réalisés

### S1-3 : Route PATCH /api/documents/[id] — Correction manuelle
**Nouveau fichier :** `app/api/documents/[id]/route.ts`
```ts
PATCH /api/documents/[id]
Body: {
  type_document?: DocumentType,
  societe_id?: string,        // → met à jour dossier_id
  societe_detectee?: string,
  type_document_force?: boolean  // flag "corrigé manuellement"
}
```
- Met à jour `type_document`, `dossier_id`, `societe_detectee`
- Ajoute colonne `corrige_manuellement BOOLEAN DEFAULT false` sur documents
- Logs la correction dans `cron_logs` ou nouvelle table `corrections_log`

### S1-4 : Route POST /api/documents/[id]/reanalyze — Re-challenge IA
**Nouveau fichier :** `app/api/documents/[id]/reanalyze/route.ts`
```ts
POST /api/documents/[id]/reanalyze
Body: {
  hint?: string,            // "C'est une facture EMTEL juillet 2025"
  type_force?: DocumentType, // forcer le type pour le prompt
  societe_hint?: string,    // indice société
  max_tokens?: number       // override (défaut 8192, max 16384)
}
```
- Télécharge le fichier depuis Supabase Storage
- Injecte le hint dans le prompt système
- Re-analyse avec le bon prompt spécialisé (pas le prompt générique)
- Met à jour le document + génère nouvelles écritures

### S1-5 : Vue détail document avec preview + données IA
**Nouveau fichier :** `app/client/documents/[id]/page.tsx` + `app/comptable/documents/[id]/page.tsx`
Contenu :
- Aperçu PDF (iframe) ou image
- Données extraites par l'IA : montants, dates, références, tiers
- Niveau de confiance (badge coloré)
- Écritures comptables générées (tableau débit/crédit)
- Boutons : ✅ Valider | ✏️ Corriger type/société | 🔄 Réanalyser | 💬 Ajouter hint | 🗑️ Supprimer

### S1-6 : Dashboard comptable "À valider" — File d'attente
**Modifier :** `app/comptable/documents/page.tsx`
- Onglet "À valider" : documents avec `confiance_type < 80` ou `type_document = 'autre'`
- Onglet "Non identifiés" : `tiers_identifie = null` dans transactions_bancaires
- Actions bulk : valider tous / réanalyser tous
- Colonne confiance IA visible

### S1-7 : Interface correction tiers bancaires non identifiés
**Nouveau fichier :** `app/comptable/banque/tiers/page.tsx`
- Tableau des libellés bancaires non mappés
- Pour chaque libellé : [Libellé banque] → [Tiers ?] [Compte comptable ?]
- Après correction : sauvegardé dans table `tiers_patterns` pour apprentissage
- Nouvelle table SQL :
```sql
CREATE TABLE tiers_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES societes(id),
  pattern TEXT NOT NULL,         -- fragment du libellé banque
  tiers_identifie TEXT,          -- nom du tiers
  compte_comptable TEXT,         -- compte à utiliser
  nb_utilisations INTEGER DEFAULT 1,
  cree_par UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societe_id, pattern)
);
```

---

## SPRINT 2 — CORRECTIONS MODÈLE DE DONNÉES + RLS COMPLETS

### S2-1 : Exercice fiscal juillet-juin
**Migration 015 :**
```sql
ALTER TABLE societes ADD COLUMN date_debut_exercice DATE DEFAULT '2024-07-01';
ALTER TABLE societes ADD COLUMN date_fin_exercice DATE DEFAULT '2025-06-30';
ALTER TABLE societes ADD COLUMN mois_cloture INTEGER DEFAULT 6;  -- 6=juin, 12=décembre
```
- Modifier toutes les requêtes de période pour respecter l'exercice
- `periode` = 'FY2025-2026' au lieu de '2025-01' pour les rapports annuels

### S2-2 : Réconcilier modèle profiles vs clients
**Décision :** Garder `profiles` comme modèle unique. La table `clients` est redondante.
- Garder `clients` pour compatibilité mais y ajouter un trigger de sync avec `profiles`
- Mettre à jour toutes les RLS qui pointent vers `clients.user_id` → `profiles.id`
- Mettre à jour `comptes_bancaires`, `bilans_officiels`, `simulations`

### S2-3 : Brancher la table `assignations`
- Route `POST /api/admin/users/assign` → écrire dans `assignations` (pas `profiles.comptable_id`)
- Route `GET /api/comptable/clients` → lire depuis `assignations`
- Garder `profiles.comptable_id` pour compatibilité descendante

### S2-4 : Régénérer lib/types/index.ts depuis SQL actuel
- Synchroniser les types TypeScript avec le schéma réel
- Ajouter types manquants : `Alerte`, `CompteBancaire`, `Transaction`, `Bilan`, `Previsionnel`

---

## SPRINT 3 — MODULE RELEVÉ BANCAIRE COMPLET

### S3-1 : Page rapprochement bancaire comptable
**Nouveau fichier :** `app/comptable/banque/rapprochement/[societe_id]/page.tsx`
- Liste des relevés importés par compte
- Statut rapprochement : ✅ Équilibré / ⚠️ Écart détecté / 🔄 En cours
- Détail transactions avec statut lettrage
- Actions : Lettrer / Délettrer / Marquer justifié / Créer écriture manuelle

### S3-2 : Lettrage automatique factures ↔ transactions
- Croiser `transactions_bancaires.libelle_banque` avec `n8n_result.extraction.numero_reference`
- Si match : marquer `statut_lettrage = 'lettre'`, lier `document_lie_id`
- Mettre à jour solde `411 Clients` / `401 Fournisseurs`

### S3-3 : Rapport de rapprochement bancaire mensuel
- Vue récap par compte : solde DB ↔ solde relevé
- Liste des transactions non lettrées (écarts à justifier)
- Export CSV/PDF du rapprochement

---

## SPRINT 4 — GRAND LIVRE + BALANCE + ÉTATS FINANCIERS

### S4-1 : Grand Livre fonctionnel
**Nouveau fichier :** `app/comptable/clients/[clientId]/[societeId]/grand-livre/page.tsx`
- Filtre par compte / période / journal
- Toutes les écritures de `ecritures_comptables_v2`
- Solde progressif par compte
- Export Excel

### S4-2 : Balance des comptes (Trial Balance)
**Nouveau fichier :** `app/comptable/clients/[clientId]/[societeId]/balance/page.tsx`
- Agrégation par compte : total débit / total crédit / solde
- Distinction : comptes de bilan vs comptes de résultat
- Vérification : Σ débits = Σ crédits

### S4-3 : P&L calculé depuis les écritures (pas hardcodé)
- Remplacer les données mockées par un calcul réel depuis `ecritures_comptables_v2`
- Comptes 70x = Produits, 60x-65x = Charges
- Agrégation mensuelle + cumul exercice

### S4-4 : Bilan comptable calculé depuis les écritures
- Actif : comptes 1xx-5xx (solde débiteur)
- Passif + CP : comptes 1xx-5xx (solde créditeur) + comptes 6xx/7xx → résultat
- Vérification Actif = Passif + Capitaux Propres

---

## SPRINT 5 — MODULE PAIE COMPLET (données DDS réelles)

### S5-1 : Tables paie
**Migration 016 :**
```sql
CREATE TABLE employes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES societes(id),
  nom_complet TEXT NOT NULL,
  prenom TEXT,
  nic TEXT,           -- National Identity Card
  tan TEXT,           -- Tax Account Number
  date_embauche DATE,
  date_depart DATE,
  poste TEXT,
  salaire_base NUMERIC(15,2),
  devise_salaire TEXT DEFAULT 'MUR',
  compte_bancaire_employe TEXT,  -- IBAN MCB ou autre
  type_contrat TEXT,  -- CDI, CDD, temps_partiel
  pourcentage_refacturation NUMERIC(5,2) DEFAULT 0, -- % refacturé interco
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bulletins_paie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID REFERENCES employes(id),
  societe_id UUID REFERENCES societes(id),
  periode TEXT NOT NULL,           -- YYYY-MM
  salaire_brut NUMERIC(15,2),
  csg_salarie_3pct NUMERIC(15,2),
  nsf_salarie_1pct NUMERIC(15,2),  -- 1 MUR fixe
  paye NUMERIC(15,2),
  salaire_net NUMERIC(15,2),
  csg_patronal_6pct NUMERIC(15,2),
  nsf_patronal_2_5pct NUMERIC(15,2), -- 2.5 MUR fixe
  training_levy_1pct NUMERIC(15,2),
  prgf_4_5_mur_jour NUMERIC(15,2),
  csg_bonus NUMERIC(15,2) DEFAULT 0,  -- 13ème mois
  nsf_arrears NUMERIC(15,2) DEFAULT 0,
  devise TEXT DEFAULT 'MUR',
  taux_change_applique NUMERIC(12,6) DEFAULT 1,
  montant_devise_origine NUMERIC(15,2),
  ecart_forex NUMERIC(15,2) DEFAULT 0,  -- comme DDS Johanna HAGGOO
  statut TEXT DEFAULT 'brouillon',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE declarations_edf (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES societes(id),
  exercice TEXT NOT NULL,          -- FY2025-2026
  nb_employes INTEGER,
  total_salaires_bruts NUMERIC(15,2),
  total_csg_salarie NUMERIC(15,2),
  total_csg_patronal NUMERIC(15,2),
  total_paye NUMERIC(15,2),
  total_nsf NUMERIC(15,2),
  total_training_levy NUMERIC(15,2),
  statut TEXT DEFAULT 'a_faire',
  date_soumission DATE,
  reference_mra TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### S5-2 : Calcul paie automatique MRA 2025
- Barème PAYE 2025 : 0-650k = 0%, 650k-700k = 10%, >700k = 15%
- CSG : 3% salarié / 6% patronal (pas de plafond)
- NSF : 1 MUR salarié / 2.5 MUR patronal (fixe)
- Training Levy : 1% patronal
- PRGF : 4.5 MUR/jour ouvré
- 13ème mois : 1/12 salaire annuel, CSG Bonus sur le montant

### S5-3 : Interface saisie/validation paie
**Nouveau :** `app/comptable/salaires/[societe_id]/page.tsx`
- Tableau employees avec salaires
- Calcul automatique de toutes les cotisations
- Génération bulletins PDF
- Génération masse salariale (virement MCB)
- Génération écritures comptables 641/645/421/431/444

### S5-4 : Gestion salaires EUR avec forex
- Détection si salaire en EUR (champ `devise_salaire`)
- Application taux MCB du jour
- Calcul et stockage écart de change mensuel
- Écriture 666 automatique pour forex difference

---

## SPRINT 6 — IT FORM 3 / IS ANNUEL / ANNUAL ALLOWANCE

### S6-1 : Tables fiscales
**Migration 017 :**
```sql
CREATE TABLE annual_allowance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES societes(id),
  exercice TEXT NOT NULL,
  actif_id UUID REFERENCES immobilisations(id),
  description TEXT,
  categorie TEXT,   -- commercial_premises|motor_vehicles|furniture|computer|other
  taux_mra NUMERIC(5,2),  -- 5|20|25|50|100
  cout_01_07 NUMERIC(15,2),
  twdv_01_07 NUMERIC(15,2),   -- Tax Written Down Value ouverture
  additions NUMERIC(15,2) DEFAULT 0,
  disposals_cost NUMERIC(15,2) DEFAULT 0,
  disposals_twdv NUMERIC(15,2) DEFAULT 0,
  cout_30_06 NUMERIC(15,2),
  twdv_adjusted NUMERIC(15,2),
  annual_allowance NUMERIC(15,2),
  twdv_30_06 NUMERIC(15,2),   -- TWDV clôture
  fully_expensed BOOLEAN DEFAULT false,  -- si coût < 60 000 MUR
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE it_form3 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES societes(id),
  exercice TEXT NOT NULL,           -- FY2025-2026
  annee_assessment TEXT,
  -- REVENUS
  revenu_affaires NUMERIC(15,2),    -- Schedule A
  revenu_emploi NUMERIC(15,2),      -- Schedule B
  revenu_locatif NUMERIC(15,2),     -- Schedule C
  revenu_interets NUMERIC(15,2),    -- Schedule D
  dividendes NUMERIC(15,2),
  total_revenus NUMERIC(15,2),
  -- AJUSTEMENTS
  annual_allowance_total NUMERIC(15,2),
  autres_deductions NUMERIC(15,2),
  revenu_imposable NUMERIC(15,2),
  -- IMPÔT
  taux_is NUMERIC(5,2) DEFAULT 15,
  impot_calcule NUMERIC(15,2),
  aps_q1 NUMERIC(15,2) DEFAULT 0,
  aps_q2 NUMERIC(15,2) DEFAULT 0,
  aps_q3 NUMERIC(15,2) DEFAULT 0,
  total_aps_paye NUMERIC(15,2) DEFAULT 0,
  impot_solde NUMERIC(15,2),
  -- CSR
  csr_applicable BOOLEAN DEFAULT false,
  csr_2pct NUMERIC(15,2) DEFAULT 0,
  -- STATUT
  statut TEXT DEFAULT 'brouillon',
  date_soumission DATE,
  reference_mra TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### S6-2 : Calcul Annual Allowance automatique
- Règle MRA : actif < 60 000 MUR → 100% la 1ère année (fully expensed)
- Commercial premises : 5% × TWDV
- Motor vehicles : 25% × TWDV
- Furniture & Fittings : 20% × TWDV
- Computer Equipment : 50% × TWDV
- Calcul TWDV = TWDV ouverture + Additions - Disposals TWDV - Annual Allowance

### S6-3 : Interface FAR + Annual Allowance
**Nouveau :** `app/comptable/clients/[clientId]/[societeId]/far/page.tsx`
- Tableau FAR identique au document DDS :
  Date | Description | Fournisseur | Coût 01/07 | Additions | Disposals | Coût 30/06 | Amort 01/07 | Dotation | Amort 30/06 | NBV
- Séparation comptable (IFRS 20%) vs fiscal (MRA Annual Allowance)
- Export Excel (format identique au document modèle)

### S6-4 : IT Form 3 — Page saisie et calcul
**Nouveau :** `app/comptable/clients/[clientId]/[societeId]/it-form3/page.tsx`
- Saisie guidée par section (Schedule A/B/C/D)
- Calcul automatique depuis les données comptables
- Annual Allowance importée depuis la table
- Calcul IS + APS + CSR automatique
- Export PDF format MRA

---

## SPRINT 7 — ANNUAL RETURN ROC + ACTIONNARIAT

### S7-1 : Tables ROC
**Migration 018 :**
```sql
CREATE TABLE actionnaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES societes(id),
  nom TEXT NOT NULL,
  type_personne TEXT,  -- physique|morale
  nationalite TEXT,
  nb_actions INTEGER,
  type_actions TEXT,   -- ordinaires|preferentielles
  pourcentage NUMERIC(5,2),
  date_entree DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE administrateurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES societes(id),
  nom TEXT NOT NULL,
  type TEXT,   -- director|secretary|chairperson
  nationalite TEXT,
  date_nomination DATE,
  date_fin DATE,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE annual_returns_roc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES societes(id),
  annee INTEGER NOT NULL,
  date_agm DATE,
  date_echeance DATE,   -- AGM + 28 jours
  date_soumission DATE,
  reference_roc TEXT,
  statut TEXT DEFAULT 'a_faire',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### S7-2 : Interface Annual Return
**Nouveau :** `app/comptable/clients/[clientId]/[societeId]/annual-return/page.tsx`
- Formulaire avec toutes les sections du Annual Return ROC
- Actionnariat (tableau avec % parts)
- Administrateurs et Secretary
- États financiers simplifiés
- Alerte automatique deadline (AGM + 28 jours)

---

## SPRINT 8 — CONSOLIDATION INTERCO MULTI-SOCIÉTÉS

### S8-1 : Table flux interco
**Migration 019 :**
```sql
CREATE TABLE flux_interco (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_emettrice_id UUID REFERENCES societes(id),
  societe_receptrice_id UUID REFERENCES societes(id),
  date_flux DATE NOT NULL,
  description TEXT,
  montant_mur NUMERIC(15,2),
  devise TEXT DEFAULT 'MUR',
  montant_devise NUMERIC(15,4),
  taux_change NUMERIC(12,6),
  type_flux TEXT,  -- mise_a_disposition|refacturation|pret|dividende
  document_id UUID REFERENCES documents(id),
  statut_reconciliation TEXT DEFAULT 'en_attente',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### S8-2 : Vue réconciliation INTERCO
**Nouveau :** `app/comptable/interco/page.tsx`
- Tableau croisé OCC ↔ DDS (comme l'onglet INTERCO du fichier DDS)
- Receivable vs Payable par société
- Détection écarts de réconciliation
- Calcul mise à disposition par employé

---

## SPRINT 9 — TVA COMPLÈTE (BOXES 1-9)

### S9-1 : Boxes 4-9 dans tva_mensuelle
**Migration 020 :**
```sql
ALTER TABLE tva_mensuelle ADD COLUMN tva_reverse_charge_output NUMERIC(15,2) DEFAULT 0;  -- Box 4
ALTER TABLE tva_mensuelle ADD COLUMN tva_reverse_charge_input NUMERIC(15,2) DEFAULT 0;   -- Box 5
ALTER TABLE tva_mensuelle ADD COLUMN exports_zero_rated NUMERIC(15,2) DEFAULT 0;          -- Box 6
ALTER TABLE tva_mensuelle ADD COLUMN capital_goods_adjustment NUMERIC(15,2) DEFAULT 0;    -- Box 7
ALTER TABLE tva_mensuelle ADD COLUMN bad_debt_relief NUMERIC(15,2) DEFAULT 0;            -- Box 8
ALTER TABLE tva_mensuelle ADD COLUMN penalites_retard NUMERIC(15,2) DEFAULT 0;           -- Box 9
ALTER TABLE tva_mensuelle ADD COLUMN interets_retard NUMERIC(15,2) DEFAULT 0;
```

### S9-2 : Calcul auto Reverse Charge depuis factures fournisseurs
- Détecter automatiquement les achats SaaS étrangers (OpenAI, AWS, Vercel, etc.)
- Calculer TVA Reverse Charge (Output + Input = net 0)
- Injecter dans Box 4 + Box 5 de la déclaration mensuelle

### S9-3 : Interface déclaration TVA complète
**Modifier :** `app/comptable/tva/page.tsx`
- Afficher les 9 boxes MRA
- Calcul automatique depuis les écritures 4456/4457
- Génération fichier XML/CSV format MRA eServices
- Historique des déclarations avec statut

---

## SPRINT 10 — PLAN COMPTABLE MRA + DASHBOARD ADMIN

### S10-1 : Table plan comptable
**Migration 021 :**
```sql
CREATE TABLE plan_comptable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT NOT NULL UNIQUE,
  libelle TEXT NOT NULL,
  classe INTEGER,          -- 1=capitaux, 2=immo, 3=stocks, 4=tiers, 5=finances, 6=charges, 7=produits
  type_compte TEXT,        -- actif|passif|charge|produit
  sens_normal TEXT,        -- debit|credit
  est_analytique BOOLEAN DEFAULT false,
  est_budgetaire BOOLEAN DEFAULT false,
  niveau INTEGER DEFAULT 3,  -- 1=classe, 2=compte, 3=sous-compte
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```
- Seed : plan comptable MRA complet (classes 1-7)
- Validation des numéros de compte à la saisie d'écritures

### S10-2 : Dashboard admin avec KPIs réels
**Modifier :** `app/admin/page.tsx`
- Cards dynamiques : nb clients, comptables, sociétés, documents, alertes actives
- Graphique MRR (si données de facturation)
- Top 5 alertes critiques
- Documents en attente de traitement

### S10-3 : Paramètres plateforme
**Nouveau :** `app/admin/parametres/page.tsx` complet
- Configuration WATI (WhatsApp)
- Configuration email (Resend)
- Taux de change manuels (override)
- Barème PAYE annuel (MRA)
- Paramètres exercice fiscal par défaut

---

## RÉSUMÉ DES FICHIERS À CRÉER / MODIFIER

### Migrations SQL (fichiers dans /supabase/migrations/)
- 014_fixes_critiques.sql (S0-1 à S0-10)
- 015_upload_ocr_improvements.sql (S1-2, S1-7)
- 016_paie_employes.sql (S5-1)
- 017_fiscal_it_form3.sql (S6-1)
- 018_roc_actionnariat.sql (S7-1)
- 019_interco_consolidation.sql (S8-1)
- 020_tva_boxes_completes.sql (S9-1)
- 021_plan_comptable.sql (S10-1)

### Routes API nouvelles
- PATCH /api/documents/[id]/route.ts
- POST /api/documents/[id]/reanalyze/route.ts
- GET /api/documents/[id]/route.ts (détail + n8n_result)
- GET/POST /api/employes/route.ts
- GET/POST /api/bulletins-paie/route.ts
- GET/POST /api/annual-allowance/route.ts
- GET/POST /api/it-form3/route.ts
- GET/POST /api/annual-return/route.ts
- GET/POST /api/flux-interco/route.ts
- GET/POST /api/tiers-patterns/route.ts

### Pages nouvelles
- app/client/documents/[id]/page.tsx
- app/comptable/documents/[id]/page.tsx
- app/comptable/banque/rapprochement/[societe_id]/page.tsx
- app/comptable/banque/tiers/page.tsx
- app/comptable/clients/[clientId]/[societeId]/grand-livre/page.tsx
- app/comptable/clients/[clientId]/[societeId]/balance/page.tsx
- app/comptable/clients/[clientId]/[societeId]/far/page.tsx
- app/comptable/clients/[clientId]/[societeId]/it-form3/page.tsx
- app/comptable/clients/[clientId]/[societeId]/annual-return/page.tsx
- app/comptable/interco/page.tsx
- app/comptable/paie/[societe_id]/page.tsx

### Fichiers modifiés
- lib/ai/prompts.ts (prompts bancaire V2, paie, IS)
- lib/types/index.ts (régénération complète)
- app/api/documents/upload/route.ts (prompt injection + max_tokens)
- app/api/cron/alerte-csg-mensuelle/route.ts (fix 3 bugs)
- app/api/cron/alerte-tva-j1/route.ts (fix client_id)
- lib/supabase/middleware.ts (fix dashboard public)
- app/admin/page.tsx (KPIs dynamiques)
- app/comptable/tva/page.tsx (boxes 1-9)
- vercel.json (ajout crons paie, APS, EDF)

---

## ORDRE D'EXÉCUTION POUR CLAUDE CODE

1. Sprint 0 → fixes bloquants (ne pas livrer sans ça)
2. Sprint 1 → upload/OCR (fonctionnalité #1)
3. Sprint 2 → données propres (base saine)
4. Sprint 4 → Grand Livre (dépend de Sprint 0)
5. Sprint 3 → Banque (dépend de Sprint 1+2)
6. Sprint 5 → Paie (module autonome)
7. Sprint 6 → IT Form 3 (dépend de Sprint 5)
8. Sprint 9 → TVA complète (dépend de Sprint 2)
9. Sprint 7 → ROC (module autonome)
10. Sprint 8 → INTERCO (dépend de Sprint 5)
11. Sprint 10 → Plan comptable + Admin (finition)

---

## NOTES TECHNIQUES

- Toujours utiliser SUPABASE_SERVICE_ROLE_KEY (pas SUPABASE_SECRET_KEY)
- max_tokens relevés bancaires : 16384 (pas 4096)
- Exercice fiscal Maurice : 1 juillet → 30 juin
- Taux MRA Annual Allowance : 5% (locaux) / 20% (mobilier) / 25% (véhicules) / 50% (informatique) / 100% si < 60 000 MUR
- CSG 2025 : 3% salarié / 6% patronal (remplace NPF depuis Social Contributions Act 2021)
- NSF : 1 MUR salarié / 2.5 MUR patronal (fixe mensuel)
- TVA Maurice : 15% standard, 0% export, exonéré médical/financier
- Reverse Charge : tous achats SaaS étrangers → Box 4+5 MRA, net=0
- PAYE barème 2025 : 0-650k=0%, 650k-700k=10%, >700k=15%
- Relevés MCB : patterns "IB Account Transfer", "Direct Debit Scheme MRA", "Forex Difference", "PAIEMENT MCB-XXXX"
- Devise salaires : certains employés payés en EUR (MCB-4587) → écart forex obligatoire
