-- ============================================================
-- Migration 164 — Sprint WRA Compliance G1
--
-- Cash-in-lieu automatique des congés (WRA Section 45 pour AL,
-- Section 47 pour VL) : paiement compensatoire OBLIGATOIRE des jours
-- non pris en fin de cycle. Toute clause de caducité est nulle de
-- plein droit (S.18(4)). Sanctions : rappel intégral + 12% intérêts
-- (S.27(6)) + amende 100K MUR (S.123).
--
-- URGENCE : Vanessa TOBEGNO cycle ferme 08/05/2026 (22j AL ≈ 28 915 MUR),
-- Sheetal SEKELY cycle ferme 11/05/2026 (6j AL ≈ 14 355 MUR).
--
-- IDEMPOTENT : CREATE TABLE/INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION.
-- ============================================================

-- ─── 1. Table paiements_conges_compensation (audit trail) ────────────
CREATE TABLE IF NOT EXISTS public.paiements_conges_compensation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,

  type_conge TEXT NOT NULL CHECK (type_conge IN ('AL', 'VL', 'SL')),

  -- Cycle concerné
  cycle_debut DATE NOT NULL,
  cycle_fin DATE NOT NULL,

  -- Détails du calcul
  jours_droit NUMERIC NOT NULL,
  jours_pris NUMERIC NOT NULL DEFAULT 0,
  jours_payes_compensation NUMERIC NOT NULL,
  montant_par_jour NUMERIC NOT NULL,
  montant_total NUMERIC NOT NULL,

  -- Lien avec le bulletin qui a servi à payer
  bulletin_paie_id UUID REFERENCES public.bulletins_paie(id) ON DELETE SET NULL,
  periode_bulletin DATE,

  -- Statut du paiement
  statut TEXT NOT NULL DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente', 'valide', 'paye', 'annule')),

  -- Raison du déclenchement
  motif TEXT NOT NULL DEFAULT 'fin_cycle_automatique'
    CHECK (motif IN ('fin_cycle_automatique', 'refus_employeur_vl', 'fin_contrat', 'manuel')),

  -- Traçabilité
  cree_le TIMESTAMPTZ DEFAULT NOW(),
  cree_par UUID REFERENCES auth.users(id),
  valide_le TIMESTAMPTZ,
  valide_par UUID REFERENCES auth.users(id),
  paye_le TIMESTAMPTZ,
  commentaire TEXT,

  -- Un seul paiement compensation par (employé, type, cycle).
  UNIQUE (employe_id, type_conge, cycle_debut, cycle_fin)
);

COMMENT ON TABLE public.paiements_conges_compensation IS
  'WRA 2019 — Audit trail des cash-in-lieu de congés (S.45 AL, S.47 VL). Paiement compensatoire obligatoire des jours non pris en fin de cycle.';

CREATE INDEX IF NOT EXISTS idx_paiements_conges_employe
  ON public.paiements_conges_compensation (employe_id, type_conge, cycle_fin);
CREATE INDEX IF NOT EXISTS idx_paiements_conges_statut
  ON public.paiements_conges_compensation (statut, periode_bulletin);

-- ─── 2. Colonnes cash-in-lieu sur bulletins_paie ─────────────────────
ALTER TABLE public.bulletins_paie
  ADD COLUMN IF NOT EXISTS montant_cash_in_lieu NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS jours_cash_in_lieu NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_in_lieu_type TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bulletins_paie_cash_in_lieu_type_check'
  ) THEN
    ALTER TABLE public.bulletins_paie
      ADD CONSTRAINT bulletins_paie_cash_in_lieu_type_check
      CHECK (cash_in_lieu_type IS NULL OR cash_in_lieu_type IN ('AL', 'VL', 'mixte'));
  END IF;
END $$;

COMMENT ON COLUMN public.bulletins_paie.montant_cash_in_lieu IS
  'WRA S.45/S.47 — Paiement compensatoire congés non pris en fin de cycle.';
COMMENT ON COLUMN public.bulletins_paie.jours_cash_in_lieu IS
  'Nombre de jours de congés payés en cash-in-lieu dans ce bulletin.';
COMMENT ON COLUMN public.bulletins_paie.cash_in_lieu_type IS
  'Type de congés concernés par le cash-in-lieu : AL, VL ou mixte.';

-- ─── 3. Fonction detect_cycles_a_clore ───────────────────────────────
-- Liste les cycles AL qui se ferment dans les N prochains jours (défaut 30).
-- Calcule le montant à payer et signale si un paiement existe déjà.
CREATE OR REPLACE FUNCTION public.detect_cycles_a_clore(
  p_jours_avance INTEGER DEFAULT 30
) RETURNS TABLE (
  employe_id UUID,
  employe_prenom TEXT,
  employe_nom TEXT,
  societe_id UUID,
  societe_nom TEXT,
  salaire_base NUMERIC,
  cycle_debut DATE,
  cycle_fin DATE,
  jours_avant_fin INTEGER,
  al_droit NUMERIC,
  al_pris NUMERIC,
  al_solde_a_payer NUMERIC,
  montant_estime NUMERIC,
  deja_paye BOOLEAN
) LANGUAGE plpgsql STABLE AS $fn$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.prenom::TEXT,
    e.nom::TEXT,
    e.societe_id,
    s.nom::TEXT,
    e.salaire_base::NUMERIC,
    sc.periode_debut,
    sc.periode_fin,
    (sc.periode_fin - CURRENT_DATE)::INTEGER,
    sc.al_droit::NUMERIC,
    sc.al_pris::NUMERIC,
    sc.al_solde::NUMERIC,
    -- Montant = solde × (salaire_base / 22 jours ouvrés/mois)
    ROUND((sc.al_solde * (e.salaire_base::NUMERIC / 22))::NUMERIC, 2),
    EXISTS (
      SELECT 1 FROM public.paiements_conges_compensation pcc
      WHERE pcc.employe_id = e.id
        AND pcc.type_conge = 'AL'
        AND pcc.cycle_debut = sc.periode_debut
        AND pcc.cycle_fin   = sc.periode_fin
        AND pcc.statut IN ('valide', 'paye')
    )
  FROM public.soldes_conges sc
  JOIN public.employes e ON e.id = sc.employe_id
  JOIN public.societes s ON s.id = e.societe_id
  WHERE e.date_depart IS NULL
    AND sc.al_solde > 0
    AND sc.periode_fin BETWEEN CURRENT_DATE AND CURRENT_DATE + (p_jours_avance || ' days')::INTERVAL
  ORDER BY sc.periode_fin;
END $fn$;

COMMENT ON FUNCTION public.detect_cycles_a_clore(INTEGER) IS
  'WRA S.45 — Détecte les cycles AL qui se ferment dans les N prochains jours (défaut 30). Calcule montant cash-in-lieu = al_solde × (salaire_base / 22).';
