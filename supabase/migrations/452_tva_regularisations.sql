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

-- ── Câblage : total de régularisation porté sur la période courante ──────────
-- Colonne sur tva_mensuelle : le total signé des régularisations incluses est
-- ajouté à la TVA nette de la période courante pour obtenir le total à payer.
ALTER TABLE public.tva_mensuelle
  ADD COLUMN IF NOT EXISTS regularisation_anterieure NUMERIC(15,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.tva_mensuelle.regularisation_anterieure IS
  'Total signé des régularisations de période antérieure portées sur CETTE période (mig 452). total_a_payer = tva_nette + regularisation_anterieure.';

-- ── RPC transactionnelle : remplace le jeu de lignes + recâble le total ──────
-- Atomique (delete + insert + maj tva_mensuelle dans une seule transaction) :
-- évite la perte de lignes si l'insert échoue après le delete. SECURITY INVOKER
-- → la RLS s'applique (l'appelant doit avoir accès à la société).
CREATE OR REPLACE FUNCTION public.replace_tva_regularisations(
  p_societe uuid,
  p_client  uuid,
  p_periode text,
  p_user    uuid,
  p_lignes  jsonb
) RETURNS numeric
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_total numeric := 0;
  v_date_limite date;
BEGIN
  IF p_periode !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'periode invalide (attendu YYYY-MM): %', p_periode;
  END IF;

  -- 1) Remplace l'intégralité du jeu pour (société, période courante)
  DELETE FROM public.tva_regularisations
   WHERE societe_id = p_societe AND periode_courante = p_periode;

  INSERT INTO public.tva_regularisations
    (societe_id, client_id, periode_courante, periode_origine, libelle,
     montant, sens, type, facture_id, motif, statut, created_by)
  SELECT
    p_societe, p_client, p_periode,
    NULLIF(l->>'periode_origine', ''),
    l->>'libelle',
    COALESCE((l->>'montant')::numeric, 0),
    COALESCE(NULLIF(l->>'sens', ''), 'net'),
    COALESCE(NULLIF(l->>'type', ''), 'manuel'),
    NULLIF(l->>'facture_id', '')::uuid,
    NULLIF(l->>'motif', ''),
    COALESCE(NULLIF(l->>'statut', ''), 'incluse'),
    p_user
  FROM jsonb_array_elements(COALESCE(p_lignes, '[]'::jsonb)) AS l
  WHERE COALESCE(btrim(l->>'libelle'), '') <> '';

  -- 2) Total signé des lignes incluses
  SELECT COALESCE(SUM(montant), 0) INTO v_total
  FROM public.tva_regularisations
  WHERE societe_id = p_societe AND periode_courante = p_periode AND statut = 'incluse';

  -- 3) Recâble le total sur la période courante de tva_mensuelle
  v_date_limite := (to_date(p_periode || '-01', 'YYYY-MM-DD')
                    + interval '1 month' + interval '19 days')::date;

  INSERT INTO public.tva_mensuelle
    (client_id, societe_id, periode, date_limite, regularisation_anterieure)
  VALUES (p_client, p_societe, p_periode, v_date_limite, v_total)
  ON CONFLICT (societe_id, periode)
  DO UPDATE SET regularisation_anterieure = EXCLUDED.regularisation_anterieure,
                updated_at = now();

  RETURN round(v_total, 2);
END $fn$;

GRANT EXECUTE ON FUNCTION public.replace_tva_regularisations(uuid, uuid, text, uuid, jsonb) TO authenticated;
