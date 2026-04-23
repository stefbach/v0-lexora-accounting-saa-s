-- ============================================================
-- Migration 169 — Sprint bugs paie/conges F14
--
-- Audit trail des actions recalcul/calcul paie pour debugging + tracabilite.
-- Permet d'identifier rapidement pourquoi un bulletin n'a pas ete modifie
-- (verrouille, paye, erreur, etc.).
--
-- IDEMPOTENTE : CREATE TABLE/INDEX IF NOT EXISTS.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_recalcul_paie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  periode DATE NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('calcul_initial', 'recalcul_batch', 'recalcul_individuel', 'calcul_unitaire')),
  nb_bulletins_cibles INTEGER NOT NULL DEFAULT 0,
  nb_bulletins_modifies INTEGER NOT NULL DEFAULT 0,
  nb_bulletins_skip INTEGER NOT NULL DEFAULT 0,
  nb_bulletins_erreur INTEGER NOT NULL DEFAULT 0,
  raisons_skip JSONB,
  erreurs JSONB,
  declenche_par UUID REFERENCES auth.users(id),
  declenche_le TIMESTAMPTZ DEFAULT NOW(),
  duree_ms INTEGER
);

COMMENT ON TABLE public.audit_recalcul_paie IS
  'F14 — Audit trail des calculs/recalculs de paie. Utile pour debugging (pourquoi le bouton Recalculer n''a pas eu d''effet visible) et compliance.';

CREATE INDEX IF NOT EXISTS idx_audit_recalcul_societe_periode
  ON public.audit_recalcul_paie (societe_id, periode DESC, declenche_le DESC);

CREATE INDEX IF NOT EXISTS idx_audit_recalcul_user
  ON public.audit_recalcul_paie (declenche_par, declenche_le DESC);
