-- =====================================================================
-- Migration 513 — Barème CSG / NSF daté (date d'effet) + plafond NSF 2026-2027
-- =====================================================================
-- Contexte : `parametres_paie_mra` est versionnée « une ligne par année »
-- (7 consommateurs lisent `order by annee desc limit 1`). Elle ne peut pas
-- porter un changement de plafond NSF au 1er juillet sans rendre ces
-- lectures ambiguës. On sort donc les taux CSG/NSF et le plafond NSF dans
-- une table dédiée, résolue par plage d'effet [date_debut, date_fin] :
-- lib/rh/cotisations-mra.ts (bulletin de paie ET export PACO).
--
-- Mise à jour annuelle MRA : fermer la ligne en cours (date_fin = veille)
-- et insérer la nouvelle avec sa date d'effet. Aucun changement de code.
--
-- Sources :
--   * Taux CSG (1,5 % / 3 % ≤ 50 000 ; 3 % / 6 % au-delà) et NSF (1 % / 2,5 %)
--     inchangés (cf. mig 143 / 212).
--   * Plafond NSF mensuel : 28 570 au 2025-07-01 (mig 212) ;
--     29 710 au 2026-07-01 (notice MNS sur seuils MRA, juillet 2026).
--     Cas MRA de contrôle : base 28 915 → NSF 1 012 (non plafonné).
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.cotisations_mra_baremes (
  id                        SERIAL PRIMARY KEY,
  date_debut                DATE NOT NULL UNIQUE,
  date_fin                  DATE,               -- NULL = encore en vigueur
  annee                     INTEGER,            -- repli de résolution (tax-params.ts)
  csg_seuil_taux_reduit     NUMERIC(12,2) NOT NULL,
  csg_salarie_taux_reduit   NUMERIC(6,4)  NOT NULL,
  csg_salarie_taux_plein    NUMERIC(6,4)  NOT NULL,
  csg_patronal_taux_reduit  NUMERIC(6,4)  NOT NULL,
  csg_patronal_taux_plein   NUMERIC(6,4)  NOT NULL,
  nsf_salarie               NUMERIC(6,4)  NOT NULL,
  nsf_patronal              NUMERIC(6,4)  NOT NULL,
  nsf_plafond_mensuel       NUMERIC(12,2) NOT NULL,
  source_ref                TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_cotisations_mra_baremes_dates CHECK (date_fin IS NULL OR date_fin >= date_debut)
);

COMMENT ON TABLE public.cotisations_mra_baremes IS
  'Taux CSG/NSF et plafond NSF mensuel par date d''effet (MRA). Source unique du bulletin et de l''export PACO (mig 513).';

INSERT INTO public.cotisations_mra_baremes (
  date_debut, date_fin, annee,
  csg_seuil_taux_reduit, csg_salarie_taux_reduit, csg_salarie_taux_plein,
  csg_patronal_taux_reduit, csg_patronal_taux_plein,
  nsf_salarie, nsf_patronal, nsf_plafond_mensuel, source_ref
) VALUES
  ('2025-07-01', '2026-06-30', 2025,
   50000, 0.015, 0.030, 0.030, 0.060, 0.010, 0.025, 28570,
   'MRA — NSF insurable ceiling effective 1 July 2025 (mig 212)'),
  ('2026-07-01', NULL, 2026,
   50000, 0.015, 0.030, 0.030, 0.060, 0.010, 0.025, 29710,
   'MRA — NSF insurable ceiling effective 1 July 2026 (notice MNS)')
ON CONFLICT (date_debut) DO NOTHING;

-- Référentiel : lecture pour tout utilisateur authentifié, écriture admin.
ALTER TABLE public.cotisations_mra_baremes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cotisations_mra_baremes_select_all ON public.cotisations_mra_baremes;
CREATE POLICY cotisations_mra_baremes_select_all
  ON public.cotisations_mra_baremes FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS cotisations_mra_baremes_admin_write ON public.cotisations_mra_baremes;
CREATE POLICY cotisations_mra_baremes_admin_write
  ON public.cotisations_mra_baremes FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- Barème NSF par fréquence (nsf_baremes, mig 212) : même mise à jour au 2026-07-01.
-- Planchers journaliers/hebdo/quinzaine/demi-mois non publiés dans la notice → NULL.
UPDATE public.nsf_baremes
   SET date_fin = '2026-06-30'
 WHERE date_debut = '2025-07-01' AND date_fin IS NULL;

INSERT INTO public.nsf_baremes (
  date_debut, date_fin,
  daily_max, weekly_max, fortnightly_max, half_monthly_max,
  monthly_min_household, monthly_min_other, monthly_max,
  source_ref
)
SELECT '2026-07-01', NULL,
       1143, 6856, 13712, 14855,
       2910, 4580, 29710,
       'MRA — NSF rates effective 1 July 2026 (notice MNS)'
WHERE NOT EXISTS (SELECT 1 FROM public.nsf_baremes WHERE date_debut = '2026-07-01');

COMMIT;
