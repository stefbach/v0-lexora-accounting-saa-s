-- ============================================================================
-- Migration 144 : intégrité comptable — comptes canoniques + vue orphelines
-- ============================================================================
-- Objectif : mettre fin aux 3 dérives constatées sur ecritures_comptables_v2 :
--
--   1. Codes compte dupliqués (421 / 421000 / 4212 avec même libellé)
--   2. Écritures orphelines après déplacement de facture entre sociétés
--   3. Déséquilibre par ref_folio impossible à détecter proactivement
--
-- Cette migration est idempotente (peut être rejouée sans effet secondaire).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Forme canonique des numéros de compte
-- ────────────────────────────────────────────────────────────────────────────
-- Règle : on tronque les zéros de fin (mais on préserve un minimum de 3
-- chiffres pour rester OHADA-compatible). Exemples :
--   421         → 421
--   4210        → 421
--   421000      → 421
--   4212        → 4212        (pas de 0 final, conservé)
--   42120       → 4212
--   401         → 401
--   4457        → 4457
--
-- Les comptes entièrement numériques sont normalisés. Les codes non numériques
-- (rares, ex. "5124-MCB") sont laissés tels quels pour ne pas corrompre les
-- sous-comptes bancaires créés par le module rapprochement.
CREATE OR REPLACE FUNCTION canonicalize_compte(p_compte TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_trimmed TEXT;
BEGIN
  IF p_compte IS NULL THEN RETURN NULL; END IF;
  v_trimmed := TRIM(p_compte);
  IF v_trimmed = '' THEN RETURN v_trimmed; END IF;
  -- Si le code n'est pas strictement numérique, on le laisse intact
  -- (préserve les sous-comptes comme 5124-MCB, 401-FOURN, etc.)
  IF v_trimmed !~ '^[0-9]+$' THEN
    RETURN v_trimmed;
  END IF;
  -- Supprimer les zéros de fin, tout en gardant ≥ 3 chiffres
  WHILE LENGTH(v_trimmed) > 3 AND RIGHT(v_trimmed, 1) = '0' LOOP
    v_trimmed := LEFT(v_trimmed, LENGTH(v_trimmed) - 1);
  END LOOP;
  RETURN v_trimmed;
END;
$$;

COMMENT ON FUNCTION canonicalize_compte(TEXT) IS
  'Forme canonique d''un numéro de compte : supprime les 0 finaux (min 3 chiffres). '
  'Utilisée par le trigger d''insertion sur ecritures_comptables_v2 et par le backfill.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Trigger BEFORE INSERT/UPDATE sur ecritures_comptables_v2
-- ────────────────────────────────────────────────────────────────────────────
-- Toute nouvelle écriture voit son numero_compte normalisé avant d'être persistée.
CREATE OR REPLACE FUNCTION trg_canonicalize_numero_compte()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.numero_compte := canonicalize_compte(NEW.numero_compte);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_ecritures_canonicalize_compte ON ecritures_comptables_v2;
CREATE TRIGGER tr_ecritures_canonicalize_compte
  BEFORE INSERT OR UPDATE OF numero_compte ON ecritures_comptables_v2
  FOR EACH ROW
  EXECUTE FUNCTION trg_canonicalize_numero_compte();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Backfill : canonicaliser les écritures existantes
-- ────────────────────────────────────────────────────────────────────────────
-- On met à jour uniquement celles dont la canonicalisation change le code,
-- pour limiter le volume d'UPDATE et éviter de déclencher des logs inutiles.
UPDATE ecritures_comptables_v2
SET numero_compte = canonicalize_compte(numero_compte)
WHERE numero_compte IS NOT NULL
  AND canonicalize_compte(numero_compte) <> numero_compte;

-- Idem sur plan_comptable_client si la table existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'plan_comptable_client'
  ) THEN
    EXECUTE $sql$
      UPDATE plan_comptable_client
      SET numero_compte = canonicalize_compte(numero_compte)
      WHERE numero_compte IS NOT NULL
        AND canonicalize_compte(numero_compte) <> numero_compte
    $sql$;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Vue v_ecritures_desequilibre — surfacer les folios non équilibrés
-- ────────────────────────────────────────────────────────────────────────────
-- Un ref_folio bien formé doit avoir SUM(debit) = SUM(credit) en MUR.
-- Tout écart > 0,01 MUR indique une pièce cassée (écriture orpheline,
-- contrepartie supprimée, erreur d'arrondi, etc.).
CREATE OR REPLACE VIEW v_ecritures_desequilibre AS
SELECT
  societe_id,
  ref_folio,
  COUNT(*)                         AS nb_lignes,
  SUM(COALESCE(debit_mur, 0))      AS total_debit,
  SUM(COALESCE(credit_mur, 0))     AS total_credit,
  SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0)) AS ecart,
  MIN(date_ecriture)               AS date_debut,
  MAX(date_ecriture)               AS date_fin
FROM ecritures_comptables_v2
WHERE ref_folio IS NOT NULL
GROUP BY societe_id, ref_folio
HAVING ABS(SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0))) > 0.01;

COMMENT ON VIEW v_ecritures_desequilibre IS
  'Folios dont les débits ne matchent pas les crédits. Utilisée pour détecter '
  'les écritures orphelines après suppression/déplacement de facture.';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Vue v_ecritures_sans_ref_folio — écritures legacy sans ref_folio
-- ────────────────────────────────────────────────────────────────────────────
-- Le reset ne peut pas nettoyer ces écritures (il filtre par ref_folio LIKE).
-- Cette vue permet de les inventorier avant un reset complet.
CREATE OR REPLACE VIEW v_ecritures_sans_ref_folio AS
SELECT
  societe_id,
  journal,
  COUNT(*)                         AS nb_lignes,
  SUM(COALESCE(debit_mur, 0))      AS total_debit,
  SUM(COALESCE(credit_mur, 0))     AS total_credit,
  MIN(date_ecriture)               AS date_debut,
  MAX(date_ecriture)               AS date_fin
FROM ecritures_comptables_v2
WHERE ref_folio IS NULL
GROUP BY societe_id, journal;

COMMENT ON VIEW v_ecritures_sans_ref_folio IS
  'Écritures sans ref_folio (legacy). Permet de compter ce qui échappe au reset normal.';
