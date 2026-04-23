-- ============================================================
-- Migration 184 — Sprint G9
--
-- Disturbance Allowance (Workers' Rights Act 2019 Section 17A,
-- amendée par Finance Act 2024).
--
-- DÉFINITION UNSOCIAL HOURS :
--   Weekday : 22h00 → 06h00 (lendemain)
--   Weekend : samedi 13h00 → lundi 06h00
--
-- ALLOCATION :
--   Montant = taux_horaire_base × heures_unsocial × multiplicateur_societe
--   Ajoutée à la rémunération normale (soumise CSG/NSF/PAYE).
--
-- IDEMPOTENTE.
-- ============================================================

-- ─── 1. Paramètres société ───────────────────────────────────────────
ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS disturbance_allowance_active BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS disturbance_hourly_multiplier NUMERIC DEFAULT 1.0;

COMMENT ON COLUMN public.societes.disturbance_allowance_active IS
  'G9 - Si TRUE, calcul automatique de la disturbance allowance S.17A FMPA 2024.';
COMMENT ON COLUMN public.societes.disturbance_hourly_multiplier IS
  'G9 - Multiplicateur applique au taux horaire pour les heures unsocial. 1.0 = standard S.17A.';

-- ─── 2. Colonnes bulletin ────────────────────────────────────────────
ALTER TABLE public.bulletins_paie
  ADD COLUMN IF NOT EXISTS disturbance_allowance NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disturbance_heures NUMERIC DEFAULT 0;

COMMENT ON COLUMN public.bulletins_paie.disturbance_allowance IS
  'G9 - WRA S.17A : montant total allocation heures unsocial du mois.';
COMMENT ON COLUMN public.bulletins_paie.disturbance_heures IS
  'G9 - WRA S.17A : total heures unsocial du mois (weekday night + weekend).';

-- ─── 3. Table détail (audit + justificatifs) ────────────────────────
CREATE TABLE IF NOT EXISTS public.disturbance_heures_detail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  bulletin_id UUID REFERENCES public.bulletins_paie(id) ON DELETE SET NULL,
  date_pointage DATE NOT NULL,
  heures_unsocial NUMERIC NOT NULL DEFAULT 0,
  type_unsocial TEXT,
  taux_horaire NUMERIC NOT NULL,
  multiplier NUMERIC NOT NULL DEFAULT 1.0,
  montant NUMERIC NOT NULL,
  motif TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disturbance_type_unsocial_check') THEN
    ALTER TABLE public.disturbance_heures_detail ADD CONSTRAINT disturbance_type_unsocial_check
      CHECK (type_unsocial IS NULL OR type_unsocial IN ('weekday_night', 'weekend'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_disturbance_employe_date
  ON public.disturbance_heures_detail(employe_id, date_pointage);
CREATE INDEX IF NOT EXISTS idx_disturbance_bulletin
  ON public.disturbance_heures_detail(bulletin_id);

COMMENT ON TABLE public.disturbance_heures_detail IS
  'G9 - Detail des heures unsocial par jour pour tracabilite et audit.';

-- ─── 4. RPC detecter_unsocial_hours ─────────────────────────────────
-- Détecte les heures unsocial dans une plage horaire donnée. Gère les
-- sessions qui chevauchent minuit via un découpage heure par heure
-- (précision 1 minute) pour un résultat correct même si la session
-- couvre 22h30 → 06h45 (weekday night) ou vendredi 22h → dimanche 18h.
CREATE OR REPLACE FUNCTION public.detecter_unsocial_hours(
  p_date DATE,
  p_heure_debut TIME,
  p_heure_fin TIME
) RETURNS TABLE (
  heures_weekday_night NUMERIC,
  heures_weekend NUMERIC,
  heures_total_unsocial NUMERIC
) LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  v_debut_ts TIMESTAMP;
  v_fin_ts TIMESTAMP;
  v_cur_ts TIMESTAMP;
  v_step INTERVAL := INTERVAL '1 minute';
  v_dow INT;
  v_weekday_night NUMERIC := 0;
  v_weekend NUMERIC := 0;
  v_heure INT;
BEGIN
  v_debut_ts := p_date + p_heure_debut;
  -- Si heure_fin <= heure_debut, la session traverse minuit (J+1).
  IF p_heure_fin <= p_heure_debut THEN
    v_fin_ts := (p_date + INTERVAL '1 day')::timestamp + p_heure_fin;
  ELSE
    v_fin_ts := p_date + p_heure_fin;
  END IF;

  v_cur_ts := v_debut_ts;
  WHILE v_cur_ts < v_fin_ts LOOP
    v_dow := EXTRACT(DOW FROM v_cur_ts)::INT;  -- 0=dim, 6=sam
    v_heure := EXTRACT(HOUR FROM v_cur_ts)::INT;

    -- Weekend : samedi 13h+ ou dimanche tout ou lundi avant 6h.
    IF (v_dow = 6 AND v_heure >= 13)
       OR v_dow = 0
       OR (v_dow = 1 AND v_heure < 6) THEN
      v_weekend := v_weekend + 1;
    -- Weekday night : lundi-vendredi 22h-24h OU 0h-6h.
    ELSIF v_dow BETWEEN 1 AND 5
          AND (v_heure >= 22 OR v_heure < 6) THEN
      -- Attention : lundi 0h-6h est déjà capté par la branche weekend
      -- ci-dessus (lundi avant 6h). On ne l'ajoute pas au weekday_night.
      IF NOT (v_dow = 1 AND v_heure < 6) THEN
        v_weekday_night := v_weekday_night + 1;
      END IF;
    END IF;
    v_cur_ts := v_cur_ts + v_step;
  END LOOP;

  -- Conversion minutes -> heures (précision 2 décimales).
  v_weekday_night := ROUND((v_weekday_night / 60.0)::NUMERIC, 2);
  v_weekend := ROUND((v_weekend / 60.0)::NUMERIC, 2);

  RETURN QUERY SELECT
    v_weekday_night,
    v_weekend,
    ROUND((v_weekday_night + v_weekend)::NUMERIC, 2);
END $fn$;

COMMENT ON FUNCTION public.detecter_unsocial_hours(DATE, TIME, TIME) IS
  'G9 - WRA S.17A : detecte si des heures sont en unsocial hours
   (weekday 22h-6h ou weekend samedi 13h -> lundi 6h).
   Gere le chevauchement minuit via un scan minute par minute.';
