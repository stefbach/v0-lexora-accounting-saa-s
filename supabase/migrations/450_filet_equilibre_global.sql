-- =============================================================================
-- Migration 450 — Filet anti-déséquilibre GLOBAL (toutes pièces, tous journaux)
-- =============================================================================
-- POURQUOI :
--   Le filet OD-PAIE (mig 449) ne couvre que la paie. Or on a observé des
--   pièces déséquilibrées sur d'AUTRES journaux :
--     • ACH (factures fournisseur) avec une ligne HT ou TVA manquante
--       (imports / OCR legacy) → Grand Livre faux ;
--     • risque identique sur VTE, OD, BNQ par tout chemin d'écriture.
--
--   Ce filet généralise le principe : AUCUNE pièce comptable (groupée par
--   ref_folio) ne peut être committée si Σdébit ≠ Σcrédit.
--
-- CONCEPTION :
--   CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED → la vérification est
--   repoussée à la FIN de transaction (COMMIT), quand la pièce est complète.
--   Une pièce est l'ensemble des lignes partageant (societe_id, ref_folio).
--   Tolérance 0.01 MUR (arrondi).
--
--   PRÉREQUIS appliqué AVANT cette migration (sinon elle bloquerait des
--   COMMIT futurs touchant ces pièces) : toutes les pièces existantes sont
--   équilibrées par ref_folio. Les à-nouveaux (journal AN) qui étaient
--   scindés débit/contre-partie sous deux ref_folio distincts ont été
--   fusionnés sous un ref_folio unique.
--
--   ref_folio NULL : ignoré (lignes sans pièce — non groupables).
--
-- NB : trigger PAR LIGNE mais DÉFÉRÉ → ne se déclenche qu'au COMMIT. Pour un
--   gros COMMIT multi-pièces, chaque ligne vérifie sa propre pièce (SELECT
--   indexé sur ref_folio) ; coût négligeable vs l'intégrité garantie.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.assert_piece_equilibre()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_solde NUMERIC(16,2);
BEGIN
  -- Pas de ref_folio → ligne non rattachée à une pièce, on n'impose rien.
  IF NEW.ref_folio IS NULL OR NEW.ref_folio = '' THEN
    RETURN NULL;
  END IF;

  SELECT ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)
  INTO v_solde
  FROM public.ecritures_comptables_v2
  WHERE societe_id = NEW.societe_id
    AND ref_folio  = NEW.ref_folio;

  IF v_solde IS NOT NULL AND ABS(v_solde) > 0.01 THEN
    RAISE EXCEPTION
      'Pièce % déséquilibrée (solde % MUR) — COMMIT refusé (filet équilibre mig 450)',
      NEW.ref_folio, v_solde;
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_piece_equilibre ON public.ecritures_comptables_v2;
CREATE CONSTRAINT TRIGGER trg_piece_equilibre
  AFTER INSERT OR UPDATE ON public.ecritures_comptables_v2
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_piece_equilibre();

COMMENT ON FUNCTION public.assert_piece_equilibre() IS
  'Mig 450 : filet global — refuse au COMMIT toute pièce (societe_id, ref_folio) dont Σdébit≠Σcrédit. Couvre ACH/VTE/OD/BNQ/AN/OD-PAIE.';

-- Index de support (lookup par pièce dans le trigger). IF NOT EXISTS : idempotent.
CREATE INDEX IF NOT EXISTS idx_ecritures_v2_societe_reffolio
  ON public.ecritures_comptables_v2 (societe_id, ref_folio)
  WHERE ref_folio IS NOT NULL;
