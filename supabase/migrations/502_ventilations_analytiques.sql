-- =====================================================================
-- Migration 502 — Ventilation analytique des écritures
-- =====================================================================
-- Cœur de la comptabilité analytique : affecter/répartir une écriture de charge
-- ou de produit (classe 6 / 7) sur UNE ou PLUSIEURS sections analytiques.
--
-- La colonne ecritures_comptables_v2.section_analytique_id (mig 500) ne porte
-- QU'UNE section (affectation directe 100 %, utilisée par production/chantiers).
-- Pour les charges communes/indirectes on a besoin d'un ÉCLATEMENT : cette table
-- répartit le montant d'une écriture entre plusieurs sections (Σ ≤ montant net).
--
-- Disjonction : on ne ventile QUE des écritures NON déjà taguées
-- (section_analytique_id IS NULL) → aucun double-comptage dans le P&L analytique
-- (direct-taggé ⊕ ventilé). 100 % ADDITIF.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.ventilations_analytiques (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id            uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  ecriture_id           uuid NOT NULL REFERENCES public.ecritures_comptables_v2(id) ON DELETE CASCADE,
  section_analytique_id uuid NOT NULL REFERENCES public.sections_analytiques(id) ON DELETE CASCADE,
  montant               numeric(15,2) NOT NULL CHECK (montant > 0),
  quote_part_pct        numeric(6,3),               -- informational (répartition en %)
  cle_repartition_id    uuid,                        -- FK ajoutée par la migration des clés
  note                  text,
  created_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ecriture_id, section_analytique_id)
);

CREATE INDEX IF NOT EXISTS idx_ventilations_societe  ON public.ventilations_analytiques(societe_id);
CREATE INDEX IF NOT EXISTS idx_ventilations_ecriture ON public.ventilations_analytiques(ecriture_id);
CREATE INDEX IF NOT EXISTS idx_ventilations_section  ON public.ventilations_analytiques(section_analytique_id);

ALTER TABLE public.ventilations_analytiques ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ventilations_tenant_select ON public.ventilations_analytiques;
CREATE POLICY ventilations_tenant_select ON public.ventilations_analytiques
  FOR SELECT USING (user_has_societe_access(societe_id));

DROP POLICY IF EXISTS ventilations_tenant_modify ON public.ventilations_analytiques;
CREATE POLICY ventilations_tenant_modify ON public.ventilations_analytiques
  FOR ALL USING (is_global_admin() OR user_has_societe_access(societe_id))
          WITH CHECK (is_global_admin() OR user_has_societe_access(societe_id));

COMMENT ON TABLE public.ventilations_analytiques IS
  'Répartition analytique d''une écriture (classe 6/7) entre sections (mig 502). '
  'Σ montant ≤ montant net de l''écriture ; ne concerne que les écritures non '
  'déjà taguées section_analytique_id (disjonction, pas de double-comptage).';

COMMIT;
