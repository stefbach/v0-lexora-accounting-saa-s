-- ============================================================
-- Migration 173 — Sprint PE1
--
-- Période de paie paramétrable par société.
--
-- MOTIVATION
--   La loi mauricienne (WRA 2019 S.27) n'impose pas de date précise pour
--   le salaire mensuel — seule la fréquence mensuelle est obligatoire.
--   Les PME suivent différentes pratiques :
--     - cut-off 24, paiement 25-28 (majorité)
--     - cut-off dernier jour, paiement dernier jour (OCC / Dr Bach)
--     - variantes
--
--   La colonne societes.period_closing_day existe depuis longtemps
--   (DEFAULT 24) mais n'est PAS utilisée par le moteur paie.
--
-- SCHEMA
--   periode_paie_mode               'calendaire' (défaut, rétrocompat)
--                                    ou 'cut_off_jour'
--   periode_paie_jour_cut_off       INTEGER 1..31 (défaut 24)
--   periode_paie_jour_paiement      INTEGER 1..31 (NULL = dernier jour
--                                    ouvrable du mois)
--   periode_paie_offset_paiement_mois INTEGER 0 (même mois) | 1 (mois+1)
--   periode_paie_notes              TEXT (notes internes libre)
--
-- RPC calculer_periode_paie(societe_id, date_reference)
--   retourne (periode_debut, periode_fin, date_paiement, mode,
--             jour_cut_off, jour_paiement).
--
-- IDEMPOTENTE.
-- ============================================================

-- ─── 1. Colonnes de config ──────────────────────────────────────────
ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS periode_paie_mode TEXT NOT NULL DEFAULT 'calendaire',
  ADD COLUMN IF NOT EXISTS periode_paie_jour_cut_off INTEGER DEFAULT 24,
  ADD COLUMN IF NOT EXISTS periode_paie_jour_paiement INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS periode_paie_offset_paiement_mois INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS periode_paie_notes TEXT;

-- Contraintes (recrées en DO block pour idempotence).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'societes_periode_paie_mode_check'
  ) THEN
    ALTER TABLE public.societes
      ADD CONSTRAINT societes_periode_paie_mode_check
      CHECK (periode_paie_mode IN ('calendaire', 'cut_off_jour'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'societes_periode_paie_cut_off_check'
  ) THEN
    ALTER TABLE public.societes
      ADD CONSTRAINT societes_periode_paie_cut_off_check
      CHECK (periode_paie_jour_cut_off IS NULL
             OR periode_paie_jour_cut_off BETWEEN 1 AND 31);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'societes_periode_paie_paiement_check'
  ) THEN
    ALTER TABLE public.societes
      ADD CONSTRAINT societes_periode_paie_paiement_check
      CHECK (periode_paie_jour_paiement IS NULL
             OR periode_paie_jour_paiement BETWEEN 1 AND 31);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'societes_periode_paie_offset_check'
  ) THEN
    ALTER TABLE public.societes
      ADD CONSTRAINT societes_periode_paie_offset_check
      CHECK (periode_paie_offset_paiement_mois IN (0, 1));
  END IF;
END $$;

COMMENT ON COLUMN public.societes.periode_paie_mode IS
  'PE1 - calendaire (défaut) : du 1er au dernier jour du mois.
   cut_off_jour : période glissante finissant le jour cut_off de chaque mois.';
COMMENT ON COLUMN public.societes.periode_paie_jour_cut_off IS
  'PE1 - Jour de clôture (mode cut_off_jour). Défaut 24.';
COMMENT ON COLUMN public.societes.periode_paie_jour_paiement IS
  'PE1 - Jour du mois de paiement. NULL = dernier jour ouvrable.';
COMMENT ON COLUMN public.societes.periode_paie_offset_paiement_mois IS
  'PE1 - 0 = paiement le mois de la période, 1 = mois suivant.';

-- ─── 2. Fonction calculer_periode_paie ──────────────────────────────
CREATE OR REPLACE FUNCTION public.calculer_periode_paie(
  p_societe_id UUID,
  p_date_reference DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
  periode_debut DATE,
  periode_fin DATE,
  date_paiement DATE,
  mode TEXT,
  jour_cut_off INTEGER,
  jour_paiement INTEGER
) LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  v_mode TEXT;
  v_cut_off INTEGER;
  v_jour_paie INTEGER;
  v_offset INTEGER;
  v_debut DATE;
  v_fin DATE;
  v_paie DATE;
  v_mois_paie INTEGER;
  v_annee_paie INTEGER;
  v_dernier_jour_mois INTEGER;
BEGIN
  SELECT
    COALESCE(s.periode_paie_mode, 'calendaire'),
    COALESCE(s.periode_paie_jour_cut_off, 24),
    s.periode_paie_jour_paiement,
    COALESCE(s.periode_paie_offset_paiement_mois, 0)
  INTO v_mode, v_cut_off, v_jour_paie, v_offset
  FROM public.societes s
  WHERE s.id = p_societe_id;

  IF v_mode = 'calendaire' THEN
    v_debut := DATE_TRUNC('month', p_date_reference)::DATE;
    v_fin := (DATE_TRUNC('month', p_date_reference) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    v_mois_paie := EXTRACT(MONTH FROM p_date_reference)::INTEGER;
    v_annee_paie := EXTRACT(YEAR FROM p_date_reference)::INTEGER;
  ELSE
    -- cut_off_jour : la période finit le jour `cut_off` du mois courant
    -- (si on est le jour cut_off ou avant) ou du mois suivant (si après).
    IF EXTRACT(DAY FROM p_date_reference) <= v_cut_off THEN
      v_fin := (DATE_TRUNC('month', p_date_reference)
                + (v_cut_off - 1) * INTERVAL '1 day')::DATE;
    ELSE
      v_fin := ((DATE_TRUNC('month', p_date_reference) + INTERVAL '1 month')
                + (v_cut_off - 1) * INTERVAL '1 day')::DATE;
    END IF;
    v_debut := (v_fin - INTERVAL '1 month' + INTERVAL '1 day')::DATE;
    v_mois_paie := EXTRACT(MONTH FROM v_fin)::INTEGER;
    v_annee_paie := EXTRACT(YEAR FROM v_fin)::INTEGER;
  END IF;

  -- Offset de paiement (mois suivant).
  IF v_offset = 1 THEN
    v_mois_paie := v_mois_paie + 1;
    IF v_mois_paie > 12 THEN
      v_mois_paie := 1;
      v_annee_paie := v_annee_paie + 1;
    END IF;
  END IF;

  -- Date de paiement : dernier jour ouvrable ou jour fixe (clampé).
  v_dernier_jour_mois := EXTRACT(DAY FROM
    (DATE_TRUNC('month', MAKE_DATE(v_annee_paie, v_mois_paie, 1))
     + INTERVAL '1 month' - INTERVAL '1 day')::DATE
  )::INTEGER;

  IF v_jour_paie IS NULL THEN
    v_paie := MAKE_DATE(v_annee_paie, v_mois_paie, v_dernier_jour_mois);
  ELSE
    v_paie := MAKE_DATE(v_annee_paie, v_mois_paie, LEAST(v_jour_paie, v_dernier_jour_mois));
  END IF;

  RETURN QUERY SELECT v_debut, v_fin, v_paie, v_mode, v_cut_off, v_jour_paie;
END $fn$;

COMMENT ON FUNCTION public.calculer_periode_paie(UUID, DATE) IS
  'PE1 - Calcule (periode_debut, periode_fin, date_paiement) pour une société
   selon sa config periode_paie_mode + cut_off + paiement + offset.';
