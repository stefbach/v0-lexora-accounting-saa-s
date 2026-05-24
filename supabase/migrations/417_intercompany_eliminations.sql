-- =====================================================================
-- Migration 417 — IFRS 10 §B86 : éliminations intra-groupe V1
-- =====================================================================
-- Objectif : permettre au moteur de consolidation
-- (lib/ifrs/ifrs10-eliminations.ts + app/api/comptable/gbc/consolidate)
-- d'écrire des écritures d'élimination tracées et auditables, et de
-- relier chaque écriture éliminée (ecritures_comptables_v2) à
-- l'enregistrement d'élimination qui l'a neutralisée.
--
-- Contexte :
--   - La table public.consolidation_eliminations existe déjà
--     (cf. mig 254) — elle stocke le RÉSULTAT (montants à éliminer).
--   - On ajoute ici une couche de DÉTECTION/TRAÇABILITÉ : la table
--     intercompany_eliminations capture les paires d'écritures
--     miroir détectées automatiquement (vente A→B ↔ achat B→A) avec
--     leurs métadonnées (compte, devise, taux, exercice).
--   - On ajoute aussi une colonne `elimination_id` sur
--     ecritures_comptables_v2 pour matérialiser le lien
--     « cette écriture a été neutralisée par X » côté audit.
--
-- Impact : additif uniquement (colonne nullable, nouvelle table).
-- Aucun changement sur les RPC ou les lignes existantes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Lien écriture ↔ élimination (audit trail bi-directionnel)
-- ---------------------------------------------------------------------
ALTER TABLE public.ecritures_comptables_v2
  ADD COLUMN IF NOT EXISTS elimination_id UUID
    REFERENCES public.consolidation_eliminations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ecritures_elimination_id
  ON public.ecritures_comptables_v2(elimination_id)
  WHERE elimination_id IS NOT NULL;

COMMENT ON COLUMN public.ecritures_comptables_v2.elimination_id IS
  'IFRS 10 §B86 : si non NULL, cette écriture a été neutralisée par '
  'une élimination consolidée. Utilisé pour l''audit trail et pour '
  'éviter le double comptage si une élimination est ré-appliquée.';

-- ---------------------------------------------------------------------
-- 2) Table intercompany_eliminations — détections automatiques
-- ---------------------------------------------------------------------
-- Chaque ligne = 1 paire d'écritures miroir détectée par
-- detectIntercompanyTransactions(). Une paire devient candidate à une
-- élimination (consolidation_eliminations.id stocké dans
-- generated_elimination_id quand l'utilisateur la matérialise).
CREATE TABLE IF NOT EXISTS public.intercompany_eliminations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_societe_id           UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  exercice                    TEXT NOT NULL,                          -- YYYY-YYYY
  detection_type              TEXT NOT NULL CHECK (detection_type IN (
    'mirror_sale_purchase',     -- 7xx d'un côté, 6xx de l'autre
    'mirror_ar_ap',             -- 411x d'un côté, 401x de l'autre
    'mirror_intercompany_loan', -- 16x/26x/45x croisés
    'mirror_dividend',          -- 761 d'un côté, 106/12 de l'autre
    'unrealized_profit_stock'   -- profit interne dans le stock à neutraliser
  )),
  from_societe_id             UUID NOT NULL REFERENCES public.societes(id),
  to_societe_id               UUID NOT NULL REFERENCES public.societes(id),
  from_ecriture_id            UUID REFERENCES public.ecritures_comptables_v2(id) ON DELETE SET NULL,
  to_ecriture_id              UUID REFERENCES public.ecritures_comptables_v2(id) ON DELETE SET NULL,
  from_numero_compte          TEXT NOT NULL,
  to_numero_compte            TEXT NOT NULL,
  amount_mur                  NUMERIC(15,2) NOT NULL CHECK (amount_mur >= 0),
  match_confidence            NUMERIC(3,2) NOT NULL DEFAULT 1.00      -- 0.00 → 1.00
                              CHECK (match_confidence BETWEEN 0 AND 1),
  match_method                TEXT NOT NULL CHECK (match_method IN (
    'exact_amount_date',        -- même montant + même date ±2j
    'exact_amount_period',      -- même montant dans la période
    'partial_amount',           -- montant partiellement matché
    'manual'                    -- saisie utilisateur (V2)
  )),
  generated_elimination_id    UUID REFERENCES public.consolidation_eliminations(id) ON DELETE SET NULL,
  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_societe_id <> to_societe_id)
);

CREATE INDEX IF NOT EXISTS idx_intercompany_elim_parent
  ON public.intercompany_eliminations(parent_societe_id, exercice);
CREATE INDEX IF NOT EXISTS idx_intercompany_elim_pair
  ON public.intercompany_eliminations(from_societe_id, to_societe_id, exercice);
CREATE INDEX IF NOT EXISTS idx_intercompany_elim_generated
  ON public.intercompany_eliminations(generated_elimination_id)
  WHERE generated_elimination_id IS NOT NULL;

ALTER TABLE public.intercompany_eliminations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'intercompany_eliminations'
      AND policyname = 'icelim_tenant_select'
  ) THEN
    CREATE POLICY icelim_tenant_select ON public.intercompany_eliminations
      FOR SELECT USING (public.user_has_societe_access(parent_societe_id));
    CREATE POLICY icelim_tenant_modify ON public.intercompany_eliminations
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(parent_societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(parent_societe_id));
  END IF;
END $$;

COMMENT ON TABLE public.intercompany_eliminations IS
  'IFRS 10 §B86 : détections automatiques de transactions miroir '
  'intra-groupe. Source de vérité pour l''algorithme de génération '
  'des écritures d''élimination (consolidation_eliminations). '
  'Une ligne = une paire d''écritures (vente/achat, créance/dette, '
  'prêt/emprunt, dividende, profit non réalisé sur stock).';
