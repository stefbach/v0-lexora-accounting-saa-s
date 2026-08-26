-- =====================================================================
-- Migration 500 — Comptabilité analytique : dimension unifiée
-- =====================================================================
-- Aujourd'hui le grand livre (ecritures_comptables_v2) ne porte QUE deux FK
-- analytiques codées en dur, ajoutées ensemble par la mig 490 :
--   job_id  (chantiers/affaires)  et  ordre_fabrication_id (production).
-- Manufacturing (Module C) et Job-costing (Module D) sont donc le MÊME patron
-- « objet de coût + imputations + reclassement OD taggé sur la ligne »,
-- implémenté deux fois. Cette migration introduit UNE dimension analytique
-- générique et unifiée :
--
--   sections_analytiques  (type : chantier | production | centre_cout | projet)
--   ecritures_comptables_v2.section_analytique_id  (FK nullable, indexée)
--
-- 100 % ADDITIF : job_id / ordre_fabrication_id sont CONSERVÉS (rétro-compat) ;
-- section_analytique_id les SUBSUME. Backfill des jobs/OF existants en sections
-- + rattachement des écritures déjà taggées (no-op tant qu'il n'y en a pas).
-- =====================================================================

BEGIN;

-- ── 1. Table des sections analytiques (axe de coût unifié) ──────────────────
CREATE TABLE IF NOT EXISTS public.sections_analytiques (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id            uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  code                  text NOT NULL,
  libelle               text NOT NULL,
  type                  text NOT NULL CHECK (type IN ('chantier','production','centre_cout','projet')),
  statut                text NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif','clos')),
  budget_montant        numeric(15,2),
  budget_heures         numeric(12,2),
  -- Rattachement optionnel à l'objet métier source (subsume les 2 FK bespoke).
  job_id                uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  ordre_fabrication_id  uuid REFERENCES public.ordres_fabrication(id) ON DELETE SET NULL,
  parent_id             uuid REFERENCES public.sections_analytiques(id) ON DELETE SET NULL,
  actif                 boolean NOT NULL DEFAULT true,
  created_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (societe_id, code)
);

CREATE INDEX IF NOT EXISTS idx_sections_analytiques_societe ON public.sections_analytiques(societe_id);
CREATE INDEX IF NOT EXISTS idx_sections_analytiques_type    ON public.sections_analytiques(societe_id, type);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sections_analytiques_job
  ON public.sections_analytiques(job_id) WHERE job_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sections_analytiques_of
  ON public.sections_analytiques(ordre_fabrication_id) WHERE ordre_fabrication_id IS NOT NULL;

ALTER TABLE public.sections_analytiques ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sections_analytiques_tenant_select ON public.sections_analytiques;
CREATE POLICY sections_analytiques_tenant_select ON public.sections_analytiques
  FOR SELECT USING (user_has_societe_access(societe_id));

DROP POLICY IF EXISTS sections_analytiques_tenant_modify ON public.sections_analytiques;
CREATE POLICY sections_analytiques_tenant_modify ON public.sections_analytiques
  FOR ALL USING (is_global_admin() OR user_has_societe_access(societe_id))
          WITH CHECK (is_global_admin() OR user_has_societe_access(societe_id));

COMMENT ON TABLE public.sections_analytiques IS
  'Dimension analytique unifiée (mig 500) : chantiers, ordres de fabrication, '
  'centres de coût, projets. Un axe unique posé sur le grand livre via '
  'ecritures_comptables_v2.section_analytique_id.';

-- ── 2. Dimension analytique générique sur le grand livre ───────────────────
ALTER TABLE public.ecritures_comptables_v2
  ADD COLUMN IF NOT EXISTS section_analytique_id uuid
    REFERENCES public.sections_analytiques(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ecritures_v2_section
  ON public.ecritures_comptables_v2(section_analytique_id)
  WHERE section_analytique_id IS NOT NULL;

COMMENT ON COLUMN public.ecritures_comptables_v2.section_analytique_id IS
  'Dimension analytique unifiée (mig 500). Subsume job_id / ordre_fabrication_id '
  '(conservés pour rétro-compatibilité).';

-- ── 3. Backfill : jobs & OF existants → sections, puis rattachement GL ──────
-- (No-op tant qu'il n'existe ni job ni OF ; idempotent via ON CONFLICT.)

INSERT INTO public.sections_analytiques (societe_id, code, libelle, type, statut, budget_montant, budget_heures, job_id)
SELECT j.societe_id, j.code, j.libelle, 'chantier',
       CASE WHEN j.statut = 'cloture' OR j.statut = 'annule' THEN 'clos' ELSE 'actif' END,
       j.budget_montant, j.budget_heures, j.id
FROM public.jobs j
ON CONFLICT (societe_id, code) DO NOTHING;

INSERT INTO public.sections_analytiques (societe_id, code, libelle, type, statut, ordre_fabrication_id)
SELECT o.societe_id, o.numero_of, 'Production ' || o.numero_of, 'production',
       CASE WHEN o.statut = 'cloture' OR o.statut = 'annule' THEN 'clos' ELSE 'actif' END,
       o.id
FROM public.ordres_fabrication o
ON CONFLICT (societe_id, code) DO NOTHING;

UPDATE public.ecritures_comptables_v2 e
   SET section_analytique_id = s.id
  FROM public.sections_analytiques s
 WHERE e.section_analytique_id IS NULL
   AND e.job_id IS NOT NULL
   AND s.job_id = e.job_id;

UPDATE public.ecritures_comptables_v2 e
   SET section_analytique_id = s.id
  FROM public.sections_analytiques s
 WHERE e.section_analytique_id IS NULL
   AND e.ordre_fabrication_id IS NOT NULL
   AND s.ordre_fabrication_id = e.ordre_fabrication_id;

COMMIT;
