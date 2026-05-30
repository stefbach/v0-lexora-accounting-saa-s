-- =============================================================================
-- Migration 452 — TVA : régularisations période antérieure (mode éditable)
-- =============================================================================
-- BESOIN (cas utilisateur) :
--   Des factures d'une période DÉJÀ déclarée à la MRA (donc figée, mig 451)
--   sont saisies APRÈS coup (ex. factures Mediasys mars/avril ajoutées en mai,
--   ou factures déc/jan/fév scannées en mai). On ne touche PAS à la compta
--   (les écritures gardent leur vraie date) ni à la déclaration figée d'origine.
--   À la place, l'écart de TVA est porté en RÉGULARISATION sur la période
--   courante (pratique MRA du "prior-period adjustment").
--
--   Cette table persiste les lignes de régularisation, éditables, rattachées à
--   la période courante (periode_courante). Deux origines :
--     - 'ecart_auto' : écart détecté automatiquement sur une période figée
--                      (tva recalculée depuis les écritures − montant déclaré MRA).
--     - 'manuel'     : ligne ajoutée à la main (facture hors système, ajustement).
--
--   La compta reste intègre (vraie date) ; la MRA reçoit la régul sur la période
--   courante ; traçabilité complète (période d'origine + facture liée + motif).
--
-- ADDITIF : aucune table existante modifiée. RLS tenant-scoped via le helper
-- SEC-003 public.user_has_societe_access(societe_id).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tva_regularisations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id        UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  client_id         UUID,
  -- Période (YYYY-MM) sur laquelle la régularisation est DÉCLARÉE (période courante)
  periode_courante  TEXT NOT NULL,
  -- Période (YYYY-MM) d'origine du fait générateur (NULL si ligne purement manuelle)
  periode_origine   TEXT,
  libelle           TEXT NOT NULL,
  -- Montant SIGNÉ en MUR : + = TVA nette à payer en plus, − = crédit / déductible en plus
  montant           NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Nature : 'collectee' (output), 'deductible' (input) ou 'net' (écart net direct)
  sens              TEXT NOT NULL DEFAULT 'net' CHECK (sens IN ('collectee', 'deductible', 'net')),
  -- Origine de la ligne
  type              TEXT NOT NULL DEFAULT 'manuel' CHECK (type IN ('ecart_auto', 'manuel')),
  -- Facture liée (optionnelle) — traçabilité du justificatif
  facture_id        UUID,
  motif             TEXT,
  -- Statut : 'incluse' (compte dans le total reporté), 'ignoree' (écartée), 'proposee'
  statut            TEXT NOT NULL DEFAULT 'incluse' CHECK (statut IN ('proposee', 'incluse', 'ignoree')),
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tva_regularisations_societe_periode_idx
  ON public.tva_regularisations (societe_id, periode_courante);
CREATE INDEX IF NOT EXISTS tva_regularisations_origine_idx
  ON public.tva_regularisations (societe_id, periode_origine);

COMMENT ON TABLE public.tva_regularisations IS
  'Régularisations TVA de période antérieure portées sur la période courante (mode éditable). La compta reste à la vraie date ; ces lignes alimentent le VAT3 de la période courante en ajustement.';
COMMENT ON COLUMN public.tva_regularisations.montant IS
  'Montant signé MUR : + = à payer en plus sur la période courante, − = crédit. Total reporté = SUM(montant) WHERE statut = ''incluse''.';

-- ── RLS (SEC-003) ────────────────────────────────────────────────────────────
ALTER TABLE public.tva_regularisations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'user_has_societe_access'
  ) THEN
    RAISE EXCEPTION 'SEC-003: user_has_societe_access() manquant — appliquer la migration 404/415 d''abord';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'tva_regularisations'
      AND policyname = 'tva_regularisations_tenant_all'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY tva_regularisations_tenant_all
        ON public.tva_regularisations
        FOR ALL
        USING (public.user_has_societe_access(societe_id))
        WITH CHECK (public.user_has_societe_access(societe_id));
    $pol$;
  END IF;
END $$;
