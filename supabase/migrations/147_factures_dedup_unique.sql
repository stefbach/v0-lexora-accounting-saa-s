-- ============================================================================
-- Migration 147 — Déduplication stricte des factures (client ET fournisseur)
-- ============================================================================
--
-- Contexte :
--   L'utilisateur génère ses factures CLIENTS en PDF externe puis les uploade
--   dans le module OCR — tout comme les factures FOURNISSEURS. La pipeline OCR
--   peut re-traiter le même document plusieurs fois (re-upload, retry, etc.).
--   Sans garde-fou, on se retrouve avec des doublons comptables.
--
-- Stratégie :
--   1. Fonction IMMUTABLE normalize_numero(TEXT) — trim + uppercase + suppression
--      des espaces, pour matcher "FAC 001", "fac001", "FAC001" comme identiques.
--   2. Index UNIQUE partiel sur (societe_id, type_facture, normalize_numero(...),
--      tiers, montant_ttc) : toute tentative d'insert d'une facture identique
--      lève une erreur au niveau DB.
--   3. Table `factures_doublons_detectes` pour logger les tentatives de doublon
--      rejetées par l'OCR. Lue par l'UI pour alerter l'utilisateur.
--
-- Idempotent : IF NOT EXISTS + CREATE OR REPLACE partout.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fonction IMMUTABLE de normalisation des numéros de facture
--    IMMUTABLE est indispensable pour utiliser la fonction dans un index.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_numero(p_num TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_num IS NULL THEN NULL
    ELSE UPPER(REPLACE(BTRIM(p_num), ' ', ''))
  END;
$$;

COMMENT ON FUNCTION public.normalize_numero(TEXT) IS
  'Normalise un numéro de facture pour la comparaison : trim, uppercase,
   suppression des espaces. IMMUTABLE => utilisable dans un index.
   Exemples : "  fac 001  " -> "FAC001", "FV-2026-000001" -> "FV-2026-000001".';

-- ---------------------------------------------------------------------------
-- 2. Index UNIQUE partiel de déduplication
--    Bloque l'insert d'une facture identique (même société + même type +
--    même numéro normalisé + même tiers + même montant TTC).
--    - type_facture est inclus pour que client et fournisseur soient isolés.
--    - WHERE numero_facture IS NOT NULL AND tiers IS NOT NULL :
--      on ne veut pas forcer l'unicité sur des brouillons incomplets.
-- ---------------------------------------------------------------------------

-- Pré-check : détecte doublons existants (n'échoue PAS, log et archive pour inspection)
DO $$
DECLARE
  v_nb_groupes INT;
  v_nb_lignes INT;
BEGIN
  WITH doublons AS (
    SELECT societe_id, type_facture, public.normalize_numero(numero_facture) AS num_n, tiers, montant_ttc, COUNT(*) AS cnt
    FROM public.factures
    WHERE numero_facture IS NOT NULL AND tiers IS NOT NULL
    GROUP BY societe_id, type_facture, public.normalize_numero(numero_facture), tiers, montant_ttc
    HAVING COUNT(*) > 1
  )
  SELECT COUNT(*), COALESCE(SUM(cnt), 0) INTO v_nb_groupes, v_nb_lignes FROM doublons;

  IF v_nb_groupes > 0 THEN
    RAISE NOTICE '[mig 147] % groupes de doublons détectés (% lignes au total). L''index UNIQUE va échouer si les doublons ne sont pas nettoyés.', v_nb_groupes, v_nb_lignes;
    RAISE NOTICE '[mig 147] Conseil : inspectez via SELECT * FROM public.factures WHERE (societe_id, type_facture, public.normalize_numero(numero_facture), tiers, montant_ttc) IN (...) avant re-exécution.';
  ELSE
    RAISE NOTICE '[mig 147] Aucun doublon détecté. Création de l''index UNIQUE en sécurité.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_factures_dedup
  ON public.factures (
    societe_id,
    type_facture,
    public.normalize_numero(numero_facture),
    tiers,
    montant_ttc
  )
  WHERE numero_facture IS NOT NULL
    AND tiers IS NOT NULL;

COMMENT ON INDEX public.uq_factures_dedup IS
  'Index UNIQUE partiel de déduplication factures. Clé :
   (societe_id, type_facture, numéro normalisé, tiers, montant_ttc).
   S''applique aux factures CLIENT ET FOURNISSEUR. Protège contre les
   doubles uploads OCR. Partial : ignore les brouillons sans numéro ou tiers.';

-- ---------------------------------------------------------------------------
-- 3. Table de tracking des tentatives de doublon détectées
--    Alimentée par le code applicatif lorsqu'un insert échoue avec
--    violation de uq_factures_dedup — l'UI la lit pour alerter l'utilisateur.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.factures_doublons_detectes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id           UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  tentative_facture    JSONB NOT NULL,
  facture_existante_id UUID REFERENCES public.factures(id) ON DELETE SET NULL,
  detected_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolu               BOOLEAN NOT NULL DEFAULT FALSE,
  resolu_at            TIMESTAMPTZ,
  resolu_par           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes                TEXT
);

COMMENT ON TABLE public.factures_doublons_detectes IS
  'Journal des tentatives de création d''une facture en doublon rejetées par
   l''index uq_factures_dedup. L''UI lit cette table pour alerter l''utilisateur
   et lui proposer de résoudre manuellement (ignorer / forcer / corriger).';

COMMENT ON COLUMN public.factures_doublons_detectes.tentative_facture IS
  'Payload JSON complet de la facture qu''on a tenté d''insérer (numero_facture,
   tiers, montants, dossier_id, source OCR, etc.) pour permettre une reprise.';

COMMENT ON COLUMN public.factures_doublons_detectes.facture_existante_id IS
  'ID de la facture déjà présente en base qui a provoqué le conflit.';

COMMENT ON COLUMN public.factures_doublons_detectes.resolu IS
  'TRUE quand un utilisateur a traité l''alerte (ignore, force ou corrige).';

-- Index pour la requête UI typique : « doublons non résolus de ma société »
CREATE INDEX IF NOT EXISTS idx_factures_doublons_societe_non_resolu
  ON public.factures_doublons_detectes (societe_id, resolu, detected_at DESC)
  WHERE resolu = FALSE;

CREATE INDEX IF NOT EXISTS idx_factures_doublons_facture_existante
  ON public.factures_doublons_detectes (facture_existante_id)
  WHERE facture_existante_id IS NOT NULL;
