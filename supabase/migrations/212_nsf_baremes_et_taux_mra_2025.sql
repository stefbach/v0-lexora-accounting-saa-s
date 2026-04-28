-- 212_nsf_baremes_et_taux_mra_2025.sql
-- 1) Crée la table nsf_baremes (référentiel barème NSF par date d'effet,
--    inclut tous les seuils min/max par fréquence — daily/weekly/...).
-- 2) Met à jour parametres_paie_mra :
--      nsf_plafond_mensuel : 28 600 → 28 570 (effective 2025-07-01)
--      training_levy       : 0.010 → 0.015  (effective 2021-07-01)
--
-- CONTEXTE BUG OCC AVRIL 2026
-- ──────────────────────────
-- Lexora utilisait :
--   - NSF max mensuel = 28 600   → erroné depuis 1er juillet 2025 (vrai = 28 570)
--   - Training Levy   = 1.0%     → erroné depuis 1er juillet 2021 (vrai = 1.5%)
--
-- Ces 2 bugs concernent le calcul interne Lexora et la somme à régler au
-- MRA. Ils n'affectent PAS le format du fichier PACO (la colonne 12 LEVY
-- est juste Y/N, le MRA recalcule lui-même les montants à partir du Wage
-- Bill).
--
-- Vérification OCC avril 2026 :
--   - Total Training Levy Lexora = 3 062 MUR  (à 1%)
--   - Total Training Levy attendu ≈ 4 593 MUR (à 1.5%)
--   - Sous-collection ≈ 1 530 MUR/mois
--
-- Référence MRA officielle (Workers' Rights Act + EPZA Act + Finance Acts) :
--   https://www.mra.mu/index.php/employers/csg-nsf

-- ============================================================
-- 1. Table nsf_baremes — référentiel par date d'effet
-- ============================================================

CREATE TABLE IF NOT EXISTS public.nsf_baremes (
  id                            SERIAL PRIMARY KEY,
  date_debut                    DATE NOT NULL,
  date_fin                      DATE,                      -- NULL si encore en vigueur
  -- Daily
  daily_min_household           NUMERIC(10,2),
  daily_min_other               NUMERIC(10,2),
  daily_max                     NUMERIC(10,2),
  -- Weekly
  weekly_min_household          NUMERIC(10,2),
  weekly_min_other              NUMERIC(10,2),
  weekly_max                    NUMERIC(10,2),
  -- Fortnightly
  fortnightly_min_household     NUMERIC(10,2),
  fortnightly_min_other         NUMERIC(10,2),
  fortnightly_max               NUMERIC(10,2),
  -- Half Monthly
  half_monthly_min_household    NUMERIC(10,2),
  half_monthly_min_other        NUMERIC(10,2),
  half_monthly_max              NUMERIC(10,2),
  -- Monthly (le seul utilisé pour l'instant côté Lexora)
  monthly_min_household         NUMERIC(10,2),
  monthly_min_other             NUMERIC(10,2),
  monthly_max                   NUMERIC(10,2) NOT NULL,
  source_ref                    TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_nsf_baremes_dates CHECK (date_fin IS NULL OR date_fin >= date_debut)
);

COMMENT ON TABLE public.nsf_baremes IS 'Barèmes NSF MRA par date d''effet — seuils min/max d''insurable earnings par fréquence de paie.';
COMMENT ON COLUMN public.nsf_baremes.monthly_max IS 'Plafond NSF mensuel = base imposable maximale pour cotisation NSF salarié et patronal.';

-- Index pour lookup par date
CREATE INDEX IF NOT EXISTS idx_nsf_baremes_date_debut ON public.nsf_baremes(date_debut);

-- Seed barème en vigueur depuis le 1er juillet 2025
INSERT INTO public.nsf_baremes (
  date_debut, date_fin,
  daily_min_household, daily_min_other, daily_max,
  weekly_min_household, weekly_min_other, weekly_max,
  fortnightly_min_household, fortnightly_min_other, fortnightly_max,
  half_monthly_min_household, half_monthly_min_other, half_monthly_max,
  monthly_min_household, monthly_min_other, monthly_max,
  source_ref
) VALUES (
  '2025-07-01', NULL,
  108,    169,    1099,
  645,    1015,   6593,
  1290,   2031,   13186,
  1398,   2200,   14285,
  2795,   4400,   28570,
  'MRA — NSF rates effective 1 July 2025 (Workers'' Rights Act 2019)'
)
ON CONFLICT DO NOTHING;

-- RLS : lecture publique (référentiel), écriture admin only
ALTER TABLE public.nsf_baremes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nsf_baremes_select_all ON public.nsf_baremes;
CREATE POLICY nsf_baremes_select_all
  ON public.nsf_baremes FOR SELECT
  USING (true);

DROP POLICY IF EXISTS nsf_baremes_admin_write ON public.nsf_baremes;
CREATE POLICY nsf_baremes_admin_write
  ON public.nsf_baremes FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- ============================================================
-- 2. UPDATE parametres_paie_mra — taux corrects
-- ============================================================
-- On met à jour TOUTES les rows de parametres_paie_mra car le moteur paie
-- lit la row la plus récente (.order('annee', { ascending: false }).limit(1)).
-- La row à jour aura les nouveaux taux ; les rows historiques restent
-- pour audit mais ne sont plus lues. On force la valeur à la fois sur
-- l'année courante et les antérieures pour éviter une régression si
-- un job rétroactif lit l'ancien taux.

UPDATE public.parametres_paie_mra
SET
  nsf_plafond_mensuel = 28570,
  training_levy       = 0.015,
  updated_at          = NOW()
WHERE nsf_plafond_mensuel = 28600
   OR training_levy = 0.010
   OR training_levy = 0.01;

-- Si aucune row n'existe (cas fresh DB), seed une row pour 2025-2026
INSERT INTO public.parametres_paie_mra (
  annee,
  csg_seuil_taux_reduit,
  csg_salarie_taux_reduit,
  csg_salarie_taux_plein,
  csg_patronal,
  nsf_salarie,
  nsf_patronal,
  nsf_plafond_mensuel,
  training_levy
)
SELECT 2025, 50000, 0.015, 0.030, 0.030, 0.010, 0.025, 28570, 0.015
WHERE NOT EXISTS (SELECT 1 FROM public.parametres_paie_mra WHERE annee = 2025);
