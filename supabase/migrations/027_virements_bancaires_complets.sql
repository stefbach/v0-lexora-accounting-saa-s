-- =============================================================================
-- Migration 027 — Virements bancaires : comptes employeur + employé structurés
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enrichir la table employes avec les infos bancaires structurées
-- -----------------------------------------------------------------------------
ALTER TABLE public.employes
  ADD COLUMN IF NOT EXISTS bank_code        TEXT,           -- code banque: MCB, SBM, ABC, AFRASIA, MAUBANK, BANKONE, ABSA, SCB, HSBC, BCP, BDM, CIM, AUTRE
  ADD COLUMN IF NOT EXISTS bank_iban        TEXT,           -- IBAN complet si disponible
  ADD COLUMN IF NOT EXISTS bank_swift       TEXT,           -- BIC/SWIFT de la banque bénéficiaire
  ADD COLUMN IF NOT EXISTS bank_branch      TEXT,           -- Agence / Branch code
  ADD COLUMN IF NOT EXISTS bank_account_name TEXT;          -- Nom du titulaire du compte (si différent du nom employé)

-- Backfill bank_code depuis bank_name existant
UPDATE public.employes SET bank_code =
  CASE
    WHEN UPPER(bank_name) LIKE '%MCB%' OR UPPER(bank_name) LIKE '%MAURITIUS COMMERCIAL%' THEN 'MCB'
    WHEN UPPER(bank_name) LIKE '%SBM%' OR UPPER(bank_name) LIKE '%STATE BANK%'           THEN 'SBM'
    WHEN UPPER(bank_name) LIKE '%ABC%'                                                    THEN 'ABC'
    WHEN UPPER(bank_name) LIKE '%AFRASIA%'                                                THEN 'AFRASIA'
    WHEN UPPER(bank_name) LIKE '%MAUBANK%' OR UPPER(bank_name) LIKE '%MPCB%'             THEN 'MAUBANK'
    WHEN UPPER(bank_name) LIKE '%BANK ONE%' OR UPPER(bank_name) LIKE '%BANKONE%'         THEN 'BANKONE'
    WHEN UPPER(bank_name) LIKE '%ABSA%' OR UPPER(bank_name) LIKE '%BARCLAYS%'            THEN 'ABSA'
    WHEN UPPER(bank_name) LIKE '%STANDARD CHARTERED%' OR UPPER(bank_name) LIKE '%SCB%'   THEN 'SCB'
    WHEN UPPER(bank_name) LIKE '%HSBC%'                                                   THEN 'HSBC'
    WHEN UPPER(bank_name) LIKE '%BCP%'                                                    THEN 'BCP'
    WHEN UPPER(bank_name) LIKE '%MASCAREIGNES%' OR UPPER(bank_name) LIKE '%BDM%'         THEN 'BDM'
    WHEN UPPER(bank_name) LIKE '%CIM%'                                                    THEN 'CIM'
    WHEN bank_name IS NOT NULL AND bank_name != ''                                        THEN 'AUTRE'
    ELSE NULL
  END
WHERE bank_code IS NULL;

-- -----------------------------------------------------------------------------
-- 2. Enrichir comptes_bancaires (employeur) avec type de compte et usage paie
-- -----------------------------------------------------------------------------
ALTER TABLE public.comptes_bancaires
  ADD COLUMN IF NOT EXISTS bank_code        TEXT,           -- MCB, SBM, etc.
  ADD COLUMN IF NOT EXISTS usage_paie       BOOLEAN DEFAULT false,  -- Ce compte est utilisé pour payer les salaires
  ADD COLUMN IF NOT EXISTS usage_mra        BOOLEAN DEFAULT false,  -- Ce compte est utilisé pour payer la MRA (CSG, TVA, IS)
  ADD COLUMN IF NOT EXISTS bank_branch      TEXT,           -- Agence
  ADD COLUMN IF NOT EXISTS nom_signataire   TEXT,           -- Nom du signataire autorisé
  ADD COLUMN IF NOT EXISTS plafond_virement NUMERIC(15,2);  -- Plafond par virement (sécurité)

-- Backfill bank_code depuis banque existant
UPDATE public.comptes_bancaires SET bank_code =
  CASE
    WHEN UPPER(banque) LIKE '%MCB%'                THEN 'MCB'
    WHEN UPPER(banque) LIKE '%SBM%'                THEN 'SBM'
    WHEN UPPER(banque) LIKE '%ABC%'                THEN 'ABC'
    WHEN UPPER(banque) LIKE '%AFRASIA%'            THEN 'AFRASIA'
    WHEN UPPER(banque) LIKE '%MAUBANK%'            THEN 'MAUBANK'
    WHEN UPPER(banque) LIKE '%BANK ONE%'           THEN 'BANKONE'
    WHEN UPPER(banque) LIKE '%ABSA%' OR UPPER(banque) LIKE '%BARCLAYS%' THEN 'ABSA'
    WHEN UPPER(banque) LIKE '%STANDARD CHARTERED%' THEN 'SCB'
    WHEN UPPER(banque) LIKE '%HSBC%'               THEN 'HSBC'
    WHEN UPPER(banque) LIKE '%BCP%'                THEN 'BCP'
    WHEN UPPER(banque) LIKE '%MASCAREIGNES%'       THEN 'BDM'
    WHEN UPPER(banque) LIKE '%CIM%'                THEN 'CIM'
    ELSE 'AUTRE'
  END
WHERE bank_code IS NULL;

-- Marquer les comptes MUR comme comptes paie par défaut (si compte_principal)
UPDATE public.comptes_bancaires
  SET usage_paie = true
  WHERE compte_principal = true AND devise = 'MUR';

-- -----------------------------------------------------------------------------
-- 3. Table virements_salaires — historique des fichiers de virement générés
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.virements_salaires (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id            UUID REFERENCES public.societes(id) NOT NULL,
  periode               TEXT NOT NULL,                          -- YYYY-MM
  date_generation       TIMESTAMPTZ DEFAULT NOW(),
  compte_emetteur_id    UUID REFERENCES public.comptes_bancaires(id), -- Compte employeur source
  banque_emettrice      TEXT NOT NULL,                          -- MCB, SBM, etc.
  numero_compte_emetteur TEXT,                                  -- Numéro compte débiteur
  iban_emetteur         TEXT,
  swift_emetteur        TEXT,
  nb_beneficiaires      INTEGER DEFAULT 0,
  montant_total_mur     NUMERIC(15,2) DEFAULT 0,
  montant_total_eur     NUMERIC(15,2) DEFAULT 0,               -- Si salariés en EUR
  fichier_genere        TEXT,                                   -- Nom du fichier CSV
  statut                TEXT DEFAULT 'genere'
    CHECK (statut IN ('genere', 'uploade_banque', 'execute', 'rejete')),
  date_execution        DATE,
  reference_banque      TEXT,                                   -- Référence donnée par la banque
  notes                 TEXT,
  created_by            UUID REFERENCES public.profiles(id),
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_virements_societe ON public.virements_salaires(societe_id, periode);

ALTER TABLE public.virements_salaires ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "virements_admin_comptable" ON public.virements_salaires
    FOR ALL USING (public.get_my_role() IN ('admin', 'comptable', 'comptable_dedie'));
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Vue recap_virements_par_banque
-- Pour savoir combien aller payer dans quelle banque
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.recap_virements_par_banque AS
SELECT
  bp.societe_id,
  bp.periode::TEXT,
  COALESCE(e.bank_code, 'SANS_BANQUE') AS banque_beneficiaire,
  COALESCE(e.bank_name, 'Non renseignée') AS nom_banque,
  COUNT(bp.id) AS nb_employes,
  SUM(bp.salaire_net) AS montant_total_mur,
  array_agg(
    json_build_object(
      'employe_code', e.code,
      'nom', e.nom,
      'prenom', e.prenom,
      'bank_account', e.bank_account,
      'bank_iban', e.bank_iban,
      'bank_swift', e.bank_swift,
      'bank_branch', e.bank_branch,
      'montant', bp.salaire_net,
      'devise', COALESCE(e.devise, 'MUR')
    )
  ) AS employes_detail
FROM public.bulletins_paie bp
JOIN public.employes e ON bp.employe_id = e.id
WHERE bp.statut = 'valide'
GROUP BY bp.societe_id, bp.periode, e.bank_code, e.bank_name
ORDER BY montant_total_mur DESC;

-- =============================================================================
-- FIN MIGRATION 027
-- =============================================================================
