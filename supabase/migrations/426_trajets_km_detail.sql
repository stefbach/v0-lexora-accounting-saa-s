-- ============================================================================
-- Migration 426 — Bug B : permettre plusieurs trajets km par employé/mois
-- ----------------------------------------------------------------------------
-- Le schéma actuel (mig 037) impose UNIQUE(employe_id, periode) sur
-- frais_km_mois → un seul enregistrement par employé et par mois. Les RH
-- veulent saisir N trajets distincts (client X, partenaire Y, formation Z)
-- sur un même mois pour traçabilité et justificatifs.
--
-- Solution : table détail `frais_km_trajets` (1..N par employé/mois) +
-- trigger d'agrégation qui synchronise `frais_km_mois` (total km validés
-- × tarif actif) pour préserver les flux paie / OD existants.
--
-- - RLS via helpers SEC-003 Phase 2 (user_has_employe_access).
-- - Trigger SECURITY DEFINER pour pouvoir écrire frais_km_mois même
--   quand l'utilisateur ne passe pas la policy d'écriture directe.
-- - Idempotent : tous les CREATE sont IF NOT EXISTS / OR REPLACE.
-- ============================================================================

-- 1. Table détail des trajets ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.frais_km_trajets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  employe_id UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  periode DATE NOT NULL,                          -- 1er du mois (ex: '2025-05-01')
  date_trajet DATE,                                -- date précise du trajet (optionnel)
  depart_adresse TEXT,
  arrivee_adresse TEXT,
  km NUMERIC(10, 2) NOT NULL CHECK (km >= 0),
  motif TEXT,                                      -- ex: "Client X", "Réunion partenaire"
  aller_retour BOOLEAN DEFAULT false,
  statut TEXT CHECK (statut IN ('en_attente', 'valide', 'rejete', 'paye')) DEFAULT 'en_attente',
  validated_by UUID REFERENCES public.profiles(id),
  validated_at TIMESTAMPTZ,
  rejected_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_frais_km_trajets_employe
  ON public.frais_km_trajets(employe_id, periode DESC);
CREATE INDEX IF NOT EXISTS idx_frais_km_trajets_societe
  ON public.frais_km_trajets(societe_id, periode DESC);
CREATE INDEX IF NOT EXISTS idx_frais_km_trajets_statut
  ON public.frais_km_trajets(societe_id, statut)
  WHERE statut = 'en_attente';

-- 2. RLS via helpers SEC-003 Phase 2 ---------------------------------------
ALTER TABLE public.frais_km_trajets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS frais_km_trajets_select ON public.frais_km_trajets;
DROP POLICY IF EXISTS frais_km_trajets_insert ON public.frais_km_trajets;
DROP POLICY IF EXISTS frais_km_trajets_update ON public.frais_km_trajets;
DROP POLICY IF EXISTS frais_km_trajets_delete ON public.frais_km_trajets;

CREATE POLICY frais_km_trajets_select ON public.frais_km_trajets
  FOR SELECT USING (public.user_has_employe_access(employe_id));
CREATE POLICY frais_km_trajets_insert ON public.frais_km_trajets
  FOR INSERT WITH CHECK (public.user_has_employe_access(employe_id));
CREATE POLICY frais_km_trajets_update ON public.frais_km_trajets
  FOR UPDATE USING (public.user_has_employe_access(employe_id))
  WITH CHECK (public.user_has_employe_access(employe_id));
CREATE POLICY frais_km_trajets_delete ON public.frais_km_trajets
  FOR DELETE USING (public.user_has_employe_access(employe_id));

-- 3. Trigger d'agrégation → frais_km_mois ----------------------------------
-- Recalcule la somme des km validés (statut IN ('valide','paye')) pour le
-- couple (employe_id, periode) et upsert frais_km_mois. Si aller_retour=true
-- on double le km. Le tarif appliqué est celui de la règle active de la
-- société (frais_km_rules / frais_km_regles, fallback 5 si rien trouvé,
-- aligné sur le default DDL de mig 037).
--
-- Note schéma : frais_km_mois (mig 037) n'a PAS de colonne societe_id ni
-- updated_at, et `montant` est GENERATED ALWAYS AS STORED → on n'écrit
-- que km_parcourus + tarif_applique.
CREATE OR REPLACE FUNCTION public.sync_frais_km_mois_from_trajets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_societe_id UUID;
  v_employe_id UUID;
  v_periode    DATE;
  v_total_km   NUMERIC;
  v_tarif      NUMERIC;
BEGIN
  v_societe_id := COALESCE(NEW.societe_id, OLD.societe_id);
  v_employe_id := COALESCE(NEW.employe_id, OLD.employe_id);
  v_periode    := COALESCE(NEW.periode,    OLD.periode);

  -- Somme des km validés (aller_retour doublé)
  SELECT COALESCE(
    SUM(CASE WHEN aller_retour THEN km * 2 ELSE km END),
    0
  )
  INTO v_total_km
  FROM public.frais_km_trajets
  WHERE employe_id = v_employe_id
    AND periode    = v_periode
    AND statut IN ('valide', 'paye');

  -- Tarif actif de la société — tente frais_km_rules puis frais_km_regles
  SELECT tarif_par_km INTO v_tarif
  FROM public.frais_km_rules
  WHERE societe_id = v_societe_id AND actif = true
  ORDER BY date_effet DESC NULLS LAST, id DESC
  LIMIT 1;

  IF v_tarif IS NULL THEN
    BEGIN
      EXECUTE 'SELECT tarif_par_km FROM public.frais_km_regles
               WHERE societe_id = $1 AND actif = true
               ORDER BY id DESC LIMIT 1'
        INTO v_tarif
        USING v_societe_id;
    EXCEPTION WHEN undefined_table THEN
      v_tarif := NULL;
    END;
  END IF;

  v_tarif := COALESCE(v_tarif, 5);

  -- Upsert agrégat — montant est GENERATED, ne PAS l'inclure
  INSERT INTO public.frais_km_mois (
    employe_id, periode, km_parcourus, tarif_applique
  )
  VALUES (
    v_employe_id, v_periode, v_total_km, v_tarif
  )
  ON CONFLICT (employe_id, periode) DO UPDATE
    SET km_parcourus   = EXCLUDED.km_parcourus,
        tarif_applique = EXCLUDED.tarif_applique;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_frais_km_mois_trigger ON public.frais_km_trajets;
CREATE TRIGGER sync_frais_km_mois_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.frais_km_trajets
  FOR EACH ROW EXECUTE FUNCTION public.sync_frais_km_mois_from_trajets();

-- 4. Permissions -----------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frais_km_trajets TO authenticated;

COMMENT ON TABLE public.frais_km_trajets IS
  'Détail des trajets km (1..N par employé/mois). Agrégé dans frais_km_mois via trigger sync_frais_km_mois_from_trajets.';
