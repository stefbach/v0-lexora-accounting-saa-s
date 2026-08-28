-- 509_fix_stock_initial_profit_fictif.sql
--
-- CORRECTIF COMPTABLE — Profit fictif créé par l'import de stock initial.
--
-- Symptôme (remonté par un comptable en test) : après un import de produits
-- avec stock initial, le compte de résultat affiche un bénéfice égal à la
-- valeur du stock importé, alors qu'aucune vente n'a eu lieu. Le bilan est
-- faussé (actif ↑ stock, capitaux propres ↑ résultat fictif).
--
-- Cause racine : le stock initial était comptabilisé comme une ENTRÉE D'ACHAT
-- de la période :
--     D 3701 (stock)          / C 6037 (variation de stock — CLASSE 6)
-- Or un crédit sur un compte de charge (classe 6) diminue les charges donc
-- gonfle le résultat. Pour un achat réel, ce crédit 6037 est neutralisé par
-- la charge d'achat 607 en face ; mais un stock INITIAL n'a pas d'achat en
-- face → le crédit 6037 reste seul et crée un résultat fictif.
--
-- Correctif (aligné sur enregistrer_soldes_ouverture / journal AN) : un stock
-- initial est un À-NOUVEAU. Sa contrepartie doit être le report à nouveau
-- (capitaux propres, compte 1101), journal AN, daté à l'ouverture d'exercice —
-- jamais un compte de charge.
--     D 3701 (stock)          / C 1101 (report à nouveau — solde d'ouverture)
--
-- Ce script reclasse les écritures DÉJÀ créées par l'import (identifiées via
-- mouvements_stock.motif = 'Stock initial (import)'). Le code applicatif
-- (lib/inventaire/ecritures.ts → createEcritureStockInitial) produit désormais
-- directement la bonne écriture pour les imports futurs.
--
-- Idempotent : une deuxième exécution ne touche plus rien (les lignes crédit
-- sont déjà en 1101 / journal AN).

BEGIN;

-- Écritures de stock initial à corriger, avec la date d'ouverture d'exercice
-- résolue par société (exercice courant → société → 1er janvier).
CREATE TEMP TABLE _stk_init_fix ON COMMIT DROP AS
SELECT
  e.id                        AS ecriture_id,
  e.numero_compte,
  e.credit_mur,
  COALESCE(
    (SELECT ex.date_debut
       FROM exercices_fiscaux ex
      WHERE ex.societe_id = e.societe_id
        AND ex.date_debut <= CURRENT_DATE
      ORDER BY ex.date_debut DESC
      LIMIT 1),
    s.date_debut_exercice,
    date_trunc('year', CURRENT_DATE)::date
  )                           AS date_ouverture
FROM ecritures_comptables_v2 e
JOIN mouvements_stock m
  ON e.ref_folio = 'STK-' || m.id::text
 AND m.motif = 'Stock initial (import)'
LEFT JOIN societes s ON s.id = e.societe_id;

-- 1) Ligne de contrepartie (crédit sur un compte de variation classe 6) →
--    report à nouveau 1101 (capitaux propres). C'est la ligne qui créait le
--    profit fictif.
UPDATE ecritures_comptables_v2 e
   SET numero_compte = '1101',
       nom_compte    = 'Report à nouveau — solde d''ouverture'
  FROM _stk_init_fix f
 WHERE e.id = f.ecriture_id
   AND f.credit_mur > 0
   AND e.numero_compte LIKE '60%';

-- 2) Toutes les lignes de stock initial : journal AN + date d'ouverture
--    d'exercice (au lieu de OD à la date d'import).
UPDATE ecritures_comptables_v2 e
   SET journal       = 'AN',
       date_ecriture = f.date_ouverture,
       exercice      = to_char(f.date_ouverture, 'YYYY')
  FROM _stk_init_fix f
 WHERE e.id = f.ecriture_id;

COMMIT;
