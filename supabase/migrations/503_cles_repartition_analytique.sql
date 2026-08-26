-- =====================================================================
-- Migration 503 — Clés de répartition analytique
-- =====================================================================
-- Automatise la ventilation des charges indirectes/communes (loyer, élec,
-- assurances…) : une clé porte des POIDS par section (surface, effectif, %,
-- CA…), normalisés en pourcentages à l'application → génère des ventilations
-- (mig 502) sans ressaisie.
-- 100 % ADDITIF.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.cles_repartition (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id  uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  code        text NOT NULL,
  libelle     text NOT NULL,
  base        text NOT NULL DEFAULT 'pourcentage'
              CHECK (base IN ('pourcentage','surface','effectif','ca','manuel')),
  actif       boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (societe_id, code)
);

CREATE TABLE IF NOT EXISTS public.cles_repartition_lignes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id            uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  cle_id                uuid NOT NULL REFERENCES public.cles_repartition(id) ON DELETE CASCADE,
  section_analytique_id uuid NOT NULL REFERENCES public.sections_analytiques(id) ON DELETE CASCADE,
  poids                 numeric(15,4) NOT NULL CHECK (poids > 0),
  UNIQUE (cle_id, section_analytique_id)
);

CREATE INDEX IF NOT EXISTS idx_cles_repartition_societe ON public.cles_repartition(societe_id);
CREATE INDEX IF NOT EXISTS idx_cles_lignes_cle ON public.cles_repartition_lignes(cle_id);

-- Lien optionnel : une ventilation peut provenir d'une clé (traçabilité).
ALTER TABLE public.ventilations_analytiques
  ADD CONSTRAINT ventilations_cle_fk
  FOREIGN KEY (cle_repartition_id) REFERENCES public.cles_repartition(id) ON DELETE SET NULL;

ALTER TABLE public.cles_repartition ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cles_repartition_lignes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cles_repartition_select ON public.cles_repartition;
CREATE POLICY cles_repartition_select ON public.cles_repartition
  FOR SELECT USING (user_has_societe_access(societe_id));
DROP POLICY IF EXISTS cles_repartition_modify ON public.cles_repartition;
CREATE POLICY cles_repartition_modify ON public.cles_repartition
  FOR ALL USING (is_global_admin() OR user_has_societe_access(societe_id))
          WITH CHECK (is_global_admin() OR user_has_societe_access(societe_id));

DROP POLICY IF EXISTS cles_lignes_select ON public.cles_repartition_lignes;
CREATE POLICY cles_lignes_select ON public.cles_repartition_lignes
  FOR SELECT USING (user_has_societe_access(societe_id));
DROP POLICY IF EXISTS cles_lignes_modify ON public.cles_repartition_lignes;
CREATE POLICY cles_lignes_modify ON public.cles_repartition_lignes
  FOR ALL USING (is_global_admin() OR user_has_societe_access(societe_id))
          WITH CHECK (is_global_admin() OR user_has_societe_access(societe_id));

COMMIT;
