-- ============================================================
-- Migration 167 — Sprint quick-fix S1
--
-- Note : le numéro 165 demandé dans la spec S1 était déjà pris par la
-- migration F13 (count_jours_ouvrables_rpc). On utilise 167 pour éviter
-- tout conflit.
--
-- Audit trail des suppressions de demandes de congés (WRA S.116 — registres).
-- Permet également la restauration en cas d'erreur.
--
-- IDEMPOTENTE : CREATE TABLE / INDEX IF NOT EXISTS.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.demandes_conges_supprimees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demande_id_original UUID NOT NULL,
  employe_id UUID NOT NULL,
  type_conge TEXT NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  nb_jours NUMERIC NOT NULL,
  statut_au_moment_suppression TEXT NOT NULL,
  donnees_completes JSONB NOT NULL,
  supprime_par UUID REFERENCES auth.users(id),
  supprime_le TIMESTAMPTZ DEFAULT NOW(),
  motif_suppression TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.demandes_conges_supprimees IS
  'Audit trail des demandes de congés supprimées (Sprint S1). Conformité WRA S.116 (registres). Snapshot JSONB complet pour restauration éventuelle.';

CREATE INDEX IF NOT EXISTS idx_demandes_supprimees_employe
  ON public.demandes_conges_supprimees (employe_id);
CREATE INDEX IF NOT EXISTS idx_demandes_supprimees_date
  ON public.demandes_conges_supprimees (supprime_le DESC);
CREATE INDEX IF NOT EXISTS idx_demandes_supprimees_original
  ON public.demandes_conges_supprimees (demande_id_original);
