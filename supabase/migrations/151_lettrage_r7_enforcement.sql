-- ============================================================================
-- Migration 151: Enforcement DB de la règle R7 (anti-lettrage classes 6/7)
-- ============================================================================
-- Interdit au niveau base de données le lettrage d'une écriture dont le compte
-- commence par 6 (charges) ou 7 (produits). Seuls les comptes de tiers sont
-- lettrables (classes 1, 2, 3, 4, 5).
--
-- Règle comptable R7 : le lettrage sert à apparier débit/crédit sur comptes
-- de tiers (ex: 401 fournisseur). Lettrer un 606100 (électricité) n'a pas
-- de sens et indique une erreur.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_enforce_r7_no_lettre_resultat()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Si aucun code lettre posé, pas de vérif
  IF NEW.lettre IS NULL OR NEW.lettre = '' THEN
    RETURN NEW;
  END IF;

  -- Vérifier que le compte n'est pas de classe 6 ou 7
  IF NEW.numero_compte IS NOT NULL
     AND (NEW.numero_compte LIKE '6%' OR NEW.numero_compte LIKE '7%')
  THEN
    RAISE EXCEPTION 'R7_VIOLATION: Lettrage interdit sur compte de classe 6/7 (résultat). Compte: %, Lettre tentée: %',
      NEW.numero_compte, NEW.lettre
      USING ERRCODE = 'check_violation',
            HINT = 'Seuls les comptes de tiers (classes 1-5) peuvent être lettrés.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_r7_lettre_v2 ON ecritures_comptables_v2;

CREATE TRIGGER trg_enforce_r7_lettre_v2
BEFORE INSERT OR UPDATE OF lettre ON ecritures_comptables_v2
FOR EACH ROW
WHEN (NEW.lettre IS NOT NULL)
EXECUTE FUNCTION fn_enforce_r7_no_lettre_resultat();

-- ============================================================================
-- Nettoyer les lettrages invalides existants (si présents avant le trigger)
-- ============================================================================
-- On ne supprime pas, on retire juste la lettre pour respecter la règle.
-- Ces cas sont loggés pour audit manuel.

DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM ecritures_comptables_v2
  WHERE lettre IS NOT NULL
    AND numero_compte IS NOT NULL
    AND (numero_compte LIKE '6%' OR numero_compte LIKE '7%');

  IF v_count > 0 THEN
    RAISE NOTICE '[mig 151] % écritures avaient un lettrage invalide sur classe 6/7 — nettoyées', v_count;
    UPDATE ecritures_comptables_v2
    SET lettre = NULL,
        date_lettrage = NULL,
        lettrage_auto = FALSE
    WHERE lettre IS NOT NULL
      AND numero_compte IS NOT NULL
      AND (numero_compte LIKE '6%' OR numero_compte LIKE '7%');
  END IF;
END $$;

COMMENT ON FUNCTION fn_enforce_r7_no_lettre_resultat IS 'Trigger BEFORE INSERT/UPDATE : empêche toute pose de lettre sur comptes classe 6 (charges) ou 7 (produits). Règle comptable R7.';
