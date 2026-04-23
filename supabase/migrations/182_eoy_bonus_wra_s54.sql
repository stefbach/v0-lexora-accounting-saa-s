-- ============================================================
-- Migration 182 — Sprint G11 Phase 1
--
-- End of Year Bonus (Workers' Rights Act 2019 Section 54)
--
-- Cette phase est SÉCURISÉE : aucune modification des tables existantes
-- (bulletins_paie, employes) hormis l'ajout de colonnes optionnelles
-- sur `societes` pour la configuration.
--
-- CALCUL S.54
--   base = MAX(moyenne_mensuelle_earnings, salaire_decembre)
--   bonus = base × (mois_travailles / 12), cap 1.0
--
-- ÉLIGIBILITÉ
--   - salaire_base ≤ seuil_max (défaut 100 000 MUR), sauf si
--     eoy_bonus_inclut_hors_seuil = TRUE (politique interne).
--   - Employé présent pendant au moins une partie de l'année.
--   - Si démission en cours d'année : >= 8 mois de service requis.
--
-- PAIEMENT
--   - 75% du bonus : avant 5 jours ouvrables avant le 25/12.
--   - 25% restants : avant le 31/12.
--
-- IDEMPOTENTE.
-- ============================================================

-- ─── 1. Paramètres société ───────────────────────────────────────────
ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS eoy_bonus_seuil_max NUMERIC DEFAULT 100000,
  ADD COLUMN IF NOT EXISTS eoy_bonus_inclut_hors_seuil BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS eoy_bonus_date_paiement_75pct DATE,
  ADD COLUMN IF NOT EXISTS eoy_bonus_date_paiement_25pct DATE;

COMMENT ON COLUMN public.societes.eoy_bonus_seuil_max IS
  'G11 - Seuil salaire mensuel max pour eligibilite EOY Bonus (WRA S.54). Defaut 100 000 MUR.';
COMMENT ON COLUMN public.societes.eoy_bonus_inclut_hors_seuil IS
  'G11 - Si TRUE, applique aussi aux employes > eoy_bonus_seuil_max (politique interne plus genereuse).';
COMMENT ON COLUMN public.societes.eoy_bonus_date_paiement_75pct IS
  'G11 - Date de paiement 75pct (override manuel, sinon auto-calcule 5 jours ouvrables avant 25/12).';
COMMENT ON COLUMN public.societes.eoy_bonus_date_paiement_25pct IS
  'G11 - Date de paiement 25pct (override manuel, sinon auto-calcule 31/12).';

-- ─── 2. Table eoy_bonus_calculs ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.eoy_bonus_calculs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  annee INTEGER NOT NULL,

  -- Données calcul
  earnings_annuel NUMERIC NOT NULL DEFAULT 0,
  nb_mois_travailles NUMERIC NOT NULL DEFAULT 0,
  salaire_decembre NUMERIC,
  moyenne_mensuelle NUMERIC NOT NULL DEFAULT 0,
  base_calcul NUMERIC NOT NULL DEFAULT 0,
  prorata_applique NUMERIC NOT NULL DEFAULT 1.0,
  bonus_calcule NUMERIC NOT NULL DEFAULT 0,

  -- Diagnostic
  bulletins_trouves INTEGER NOT NULL DEFAULT 0,
  bulletins_attendus INTEGER NOT NULL DEFAULT 0,

  -- Eligibilité
  eligible BOOLEAN NOT NULL DEFAULT TRUE,
  motif_non_eligible TEXT,

  -- Tracking paiement (préparé pour Phase 2, NULL en Phase 1)
  montant_paye_75pct NUMERIC DEFAULT 0,
  date_paiement_75pct DATE,
  bulletin_75pct_id UUID REFERENCES public.bulletins_paie(id) ON DELETE SET NULL,
  montant_paye_25pct NUMERIC DEFAULT 0,
  date_paiement_25pct DATE,
  bulletin_25pct_id UUID REFERENCES public.bulletins_paie(id) ON DELETE SET NULL,

  statut TEXT NOT NULL DEFAULT 'calcule',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contraintes (idempotentes).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eoy_bonus_calculs_statut_check') THEN
    ALTER TABLE public.eoy_bonus_calculs
      ADD CONSTRAINT eoy_bonus_calculs_statut_check
      CHECK (statut IN ('calcule', 'partiellement_paye', 'totalement_paye', 'annule'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eoy_bonus_calculs_employe_annee_uk') THEN
    ALTER TABLE public.eoy_bonus_calculs
      ADD CONSTRAINT eoy_bonus_calculs_employe_annee_uk
      UNIQUE (employe_id, annee);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_eoy_bonus_societe_annee ON public.eoy_bonus_calculs(societe_id, annee);
CREATE INDEX IF NOT EXISTS idx_eoy_bonus_statut ON public.eoy_bonus_calculs(statut);

COMMENT ON TABLE public.eoy_bonus_calculs IS
  'G11 - End-of-Year Bonus WRA S.54. Calcul + tracking paiement 75/25.
   Phase 1 : uniquement calcul + sauvegarde. Phase 2 : liaison bulletins + paiement.';

-- Trigger updated_at.
CREATE OR REPLACE FUNCTION public.trg_eoy_bonus_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END $fn$;

DROP TRIGGER IF EXISTS trg_eoy_bonus_updated_at ON public.eoy_bonus_calculs;
CREATE TRIGGER trg_eoy_bonus_updated_at
BEFORE UPDATE ON public.eoy_bonus_calculs
FOR EACH ROW EXECUTE FUNCTION public.trg_eoy_bonus_updated();

-- ─── 3. RLS ──────────────────────────────────────────────────────────
ALTER TABLE public.eoy_bonus_calculs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eoy_bonus_rh_all" ON public.eoy_bonus_calculs;
CREATE POLICY "eoy_bonus_rh_all" ON public.eoy_bonus_calculs FOR ALL
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','rh')));

-- ─── 4. RPC calculer_eoy_bonus (employé unique) ─────────────────────
CREATE OR REPLACE FUNCTION public.calculer_eoy_bonus(
  p_employe_id UUID,
  p_annee INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
) RETURNS TABLE (
  employe_id UUID,
  annee INTEGER,
  earnings_annuel NUMERIC,
  nb_mois_travailles NUMERIC,
  salaire_decembre NUMERIC,
  moyenne_mensuelle NUMERIC,
  base_calcul NUMERIC,
  prorata NUMERIC,
  bonus_calcule NUMERIC,
  eligible BOOLEAN,
  motif_non_eligible TEXT,
  bulletins_trouves INTEGER,
  bulletins_attendus INTEGER
) LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  v_employe RECORD;
  v_seuil NUMERIC;
  v_inclut_hors_seuil BOOLEAN;
  v_earnings NUMERIC := 0;
  v_mois_trav NUMERIC := 0;
  v_sal_dec NUMERIC := NULL;
  v_moyenne NUMERIC := 0;
  v_base NUMERIC := 0;
  v_prorata NUMERIC := 1.0;
  v_bonus NUMERIC := 0;
  v_date_arrivee DATE;
  v_date_depart DATE;
  v_debut_annee DATE := MAKE_DATE(p_annee, 1, 1);
  v_fin_annee DATE := MAKE_DATE(p_annee, 12, 31);
  v_periode_debut DATE;
  v_periode_fin DATE;
  v_nb_bulletins INTEGER := 0;
  v_mois_attendus INTEGER := 0;
BEGIN
  SELECT e.*, s.eoy_bonus_seuil_max, s.eoy_bonus_inclut_hors_seuil
  INTO v_employe
  FROM public.employes e
  JOIN public.societes s ON s.id = e.societe_id
  WHERE e.id = p_employe_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      p_employe_id, p_annee, 0::NUMERIC, 0::NUMERIC,
      NULL::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
      FALSE, 'employe_inexistant'::TEXT, 0, 0;
    RETURN;
  END IF;

  v_date_arrivee := v_employe.date_arrivee;
  v_date_depart := v_employe.date_depart;
  v_seuil := COALESCE(v_employe.eoy_bonus_seuil_max, 100000);
  v_inclut_hors_seuil := COALESCE(v_employe.eoy_bonus_inclut_hors_seuil, FALSE);

  -- Éligibilité : seuil salaire
  IF v_employe.salaire_base > v_seuil AND NOT v_inclut_hors_seuil THEN
    RETURN QUERY SELECT
      p_employe_id, p_annee, 0::NUMERIC, 0::NUMERIC,
      NULL::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
      FALSE, ('salaire_superieur_seuil_' || v_seuil::TEXT)::TEXT, 0, 0;
    RETURN;
  END IF;

  -- Employé présent pendant l'année ?
  IF v_date_arrivee IS NULL OR v_date_arrivee > v_fin_annee
     OR (v_date_depart IS NOT NULL AND v_date_depart < v_debut_annee) THEN
    RETURN QUERY SELECT
      p_employe_id, p_annee, 0::NUMERIC, 0::NUMERIC,
      NULL::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
      FALSE, 'pas_employe_pendant_annee'::TEXT, 0, 0;
    RETURN;
  END IF;

  -- Période d'emploi dans l'année
  v_periode_debut := GREATEST(v_date_arrivee, v_debut_annee);
  v_periode_fin := LEAST(COALESCE(v_date_depart, v_fin_annee), v_fin_annee);

  -- Nb mois travaillés (décimal, base 30.4375 j/mois moyenne)
  v_mois_trav := ROUND(
    (EXTRACT(EPOCH FROM (v_periode_fin::timestamp - v_periode_debut::timestamp))
     / (30.4375 * 86400))::NUMERIC,
    2
  );

  v_mois_attendus := GREATEST(1, CEIL(v_mois_trav)::INTEGER);

  -- Démission avant 8 mois : pas droit au bonus
  IF v_date_depart IS NOT NULL AND v_date_depart <= v_fin_annee AND v_mois_trav < 8 THEN
    RETURN QUERY SELECT
      p_employe_id, p_annee, 0::NUMERIC, v_mois_trav,
      NULL::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
      FALSE, 'demission_avant_8_mois'::TEXT, 0, v_mois_attendus;
    RETURN;
  END IF;

  -- Earnings annuels = SUM(salaire_brut) des bulletins de l'année
  SELECT
    COALESCE(SUM(b.salaire_brut), 0)::NUMERIC,
    COUNT(*)::INTEGER
  INTO v_earnings, v_nb_bulletins
  FROM public.bulletins_paie b
  WHERE b.employe_id = p_employe_id
    AND EXTRACT(YEAR FROM b.periode) = p_annee;

  -- Salaire brut de décembre (pour règle MAX)
  SELECT b.salaire_brut INTO v_sal_dec
  FROM public.bulletins_paie b
  WHERE b.employe_id = p_employe_id
    AND EXTRACT(YEAR FROM b.periode) = p_annee
    AND EXTRACT(MONTH FROM b.periode) = 12
  LIMIT 1;

  -- Moyenne mensuelle
  v_moyenne := CASE WHEN v_mois_trav > 0
    THEN ROUND((v_earnings / v_mois_trav)::NUMERIC, 2)
    ELSE 0
  END;

  -- Base = MAX(moyenne, salaire_decembre) (règle S.54)
  v_base := GREATEST(v_moyenne, COALESCE(v_sal_dec, 0));

  -- Prorata
  v_prorata := LEAST(1.0, v_mois_trav / 12);

  -- Bonus final
  v_bonus := ROUND((v_base * v_prorata)::NUMERIC, 2);

  RETURN QUERY SELECT
    p_employe_id, p_annee, v_earnings, v_mois_trav, v_sal_dec,
    v_moyenne, v_base, v_prorata, v_bonus,
    TRUE, NULL::TEXT, v_nb_bulletins, v_mois_attendus;
END $fn$;

COMMENT ON FUNCTION public.calculer_eoy_bonus(UUID, INTEGER) IS
  'G11 WRA S.54 - Calcul EOY Bonus en LECTURE SEULE sur bulletins_paie.
   Retourne le bonus dû + prorata + diagnostic bulletins manquants.';

-- ─── 5. RPC bulk calculer_eoy_bonus_societe ─────────────────────────
CREATE OR REPLACE FUNCTION public.calculer_eoy_bonus_societe(
  p_societe_id UUID,
  p_annee INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
) RETURNS TABLE (
  employe_id UUID,
  employe_nom TEXT,
  annee INTEGER,
  earnings_annuel NUMERIC,
  nb_mois_travailles NUMERIC,
  salaire_decembre NUMERIC,
  moyenne_mensuelle NUMERIC,
  base_calcul NUMERIC,
  prorata NUMERIC,
  bonus_calcule NUMERIC,
  eligible BOOLEAN,
  motif_non_eligible TEXT,
  bulletins_trouves INTEGER,
  bulletins_attendus INTEGER
) LANGUAGE plpgsql STABLE AS $fn$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    TRIM(COALESCE(e.prenom, '') || ' ' || COALESCE(e.nom, '')),
    p_annee,
    calc.earnings_annuel,
    calc.nb_mois_travailles,
    calc.salaire_decembre,
    calc.moyenne_mensuelle,
    calc.base_calcul,
    calc.prorata,
    calc.bonus_calcule,
    calc.eligible,
    calc.motif_non_eligible,
    calc.bulletins_trouves,
    calc.bulletins_attendus
  FROM public.employes e
  CROSS JOIN LATERAL public.calculer_eoy_bonus(e.id, p_annee) calc
  WHERE e.societe_id = p_societe_id
    AND (e.date_depart IS NULL OR EXTRACT(YEAR FROM e.date_depart) >= p_annee)
  ORDER BY e.nom, e.prenom;
END $fn$;

COMMENT ON FUNCTION public.calculer_eoy_bonus_societe(UUID, INTEGER) IS
  'G11 - Bulk calcul EOY pour tous les employes d''une societe / annee.';
