-- ============================================================================
-- Migration 322 — ÉCRITURES D'OUVERTURE: Rétablir soldes bancaires réels
-- ============================================================================
-- CONTEXTE:
--   Après le grand nettoyage (Mig 314-321), les comptes 512xxx sont à 0
--   mais les vraies soldes bancaires sont:
--     - DDS 512100 (MUR): 80,153.66
--     - DDS 512101 (EUR): 404.83
--     - OCC 512100 (MUR): 9,111.15
--     - OCC 512101 (EUR): 23,909.00
--
--   Total écart: ~113k MUR (modeste, gérable)
--
-- SOLUTION:
--   Créer écritures d'OUVERTURE pour chaque compte bancaire avec un écart > 0
--     DR 512xxx (montant écart)
--     CR 1101 "Capital - Solde d'ouverture banque" (contrepartie)
--
--   Cela:
--   ✓ Reflète exactement les vrais soldes bancaires
--   ✓ Préserve la double-entry (balance équilibrée)
--   ✓ Contrepartie en compte 1101 (capital initial - opening balance equity)
--   ✓ Traçable: ref_folio = 'OUVERTURE-322-<societe_id>-<compte>'
--
-- RÉSULTAT:
--   ✓ Soldes bancaires = vrais soldes
--   ✓ Balance globale = équilibrée
--   ✓ Comptabilité saine et alignée avec la réalité
-- ============================================================================

BEGIN;

-- ── 1. AUDIT AVANT: Écarts actuels ─────────────────────────────────────
SELECT
  '=== ÉCARTS AVANT MIG 322 ===' AS section,
  cb.societe_id,
  (SELECT nom FROM societes WHERE id = cb.societe_id) AS societe_nom,
  cb.compte_comptable,
  cb.devise,
  ROUND(cb.solde_actuel::numeric, 2) AS solde_reel,
  ROUND(COALESCE((
    SELECT SUM(debit_mur) - SUM(credit_mur)
    FROM ecritures_comptables_v2
    WHERE numero_compte = cb.compte_comptable
      AND societe_id = cb.societe_id
  ), 0)::numeric, 2) AS solde_comptable,
  ROUND((cb.solde_actuel - COALESCE((
    SELECT SUM(debit_mur) - SUM(credit_mur)
    FROM ecritures_comptables_v2
    WHERE numero_compte = cb.compte_comptable
      AND societe_id = cb.societe_id
  ), 0))::numeric, 2) AS ecart_a_corriger
FROM comptes_bancaires cb
WHERE cb.compte_comptable IS NOT NULL
  AND cb.solde_actuel <> 0
ORDER BY cb.societe_id, cb.compte_comptable;

-- ── 2. CRÉER ÉCRITURES D'OUVERTURE ─────────────────────────────────────
-- Pour chaque compte bancaire avec écart > 0:
--   Créer 2 écritures (double-entry):
--   - Ligne 1: DR ou CR 512xxx (selon signe)
--   - Ligne 2: Contrepartie sur 1101 (Capital - solde d'ouverture banque)

-- IMPORTANT: On utilise GROUP BY car la table peut avoir plusieurs lignes
-- pour la même (societe_id, compte_comptable) si plusieurs comptes bancaires
-- partagent le même compte comptable. On somme leurs soldes.

WITH ecarts_par_compte AS (
  SELECT
    cb.societe_id,
    cb.compte_comptable,
    cb.devise,
    SUM(cb.solde_actuel) AS solde_reel_total,
    COALESCE((
      SELECT SUM(debit_mur) - SUM(credit_mur)
      FROM ecritures_comptables_v2
      WHERE numero_compte = cb.compte_comptable
        AND societe_id = cb.societe_id
    ), 0) AS solde_comptable
  FROM comptes_bancaires cb
  WHERE cb.compte_comptable IS NOT NULL
  GROUP BY cb.societe_id, cb.compte_comptable, cb.devise
)
INSERT INTO ecritures_comptables_v2 (
  id, societe_id, date_ecriture, ref_folio, numero_compte, nom_compte,
  description, libelle, debit_mur, credit_mur, journal, devise_origine, created_at
)
SELECT
  gen_random_uuid() AS id,
  ec.societe_id,
  CURRENT_DATE AS date_ecriture,
  'OUVERTURE-322-' || ec.societe_id || '-' || ec.compte_comptable AS ref_folio,
  ec.compte_comptable AS numero_compte,
  CASE
    WHEN ec.compte_comptable = '512100' THEN 'Banque - solde d''ouverture (MUR)'
    WHEN ec.compte_comptable = '512101' THEN 'Banque - solde d''ouverture (EUR)'
    ELSE 'Banque - solde d''ouverture'
  END AS nom_compte,
  'Écriture d''ouverture - rétablir solde réel bancaire (mig 322)' AS description,
  'opening balance - mig 322' AS libelle,
  CASE WHEN (ec.solde_reel_total - ec.solde_comptable) > 0
       THEN (ec.solde_reel_total - ec.solde_comptable) ELSE 0 END AS debit_mur,
  CASE WHEN (ec.solde_reel_total - ec.solde_comptable) < 0
       THEN ABS(ec.solde_reel_total - ec.solde_comptable) ELSE 0 END AS credit_mur,
  'AN' AS journal,  -- Journal Ã-nouveaux
  ec.devise AS devise_origine,
  NOW() AS created_at
FROM ecarts_par_compte ec
WHERE ABS(ec.solde_reel_total - ec.solde_comptable) > 0.01;

-- ── 3. CRÉER CONTREPARTIES SUR COMPTE 1101 (Capital - solde d'ouverture) ─
WITH ecarts_par_compte AS (
  SELECT
    cb.societe_id,
    cb.compte_comptable,
    cb.devise,
    SUM(cb.solde_actuel) AS solde_reel_total,
    COALESCE((
      SELECT SUM(debit_mur) - SUM(credit_mur)
      FROM ecritures_comptables_v2
      WHERE numero_compte = cb.compte_comptable
        AND societe_id = cb.societe_id
        AND ref_folio NOT LIKE 'OUVERTURE-322-%'
    ), 0) AS solde_comptable
  FROM comptes_bancaires cb
  WHERE cb.compte_comptable IS NOT NULL
  GROUP BY cb.societe_id, cb.compte_comptable, cb.devise
)
INSERT INTO ecritures_comptables_v2 (
  id, societe_id, date_ecriture, ref_folio, numero_compte, nom_compte,
  description, libelle, debit_mur, credit_mur, journal, devise_origine, created_at
)
SELECT
  gen_random_uuid() AS id,
  ec.societe_id,
  CURRENT_DATE AS date_ecriture,
  'OUVERTURE-322-CP-' || ec.societe_id || '-' || ec.compte_comptable AS ref_folio,
  '1101' AS numero_compte,
  'Capital - solde d''ouverture banque' AS nom_compte,
  'Contrepartie écriture d''ouverture - équilibre solde bancaire (mig 322)' AS description,
  'opening balance contrepartie - mig 322' AS libelle,
  -- Sens INVERSE de l'écriture sur 512xxx
  CASE WHEN (ec.solde_reel_total - ec.solde_comptable) < 0
       THEN ABS(ec.solde_reel_total - ec.solde_comptable) ELSE 0 END AS debit_mur,
  CASE WHEN (ec.solde_reel_total - ec.solde_comptable) > 0
       THEN (ec.solde_reel_total - ec.solde_comptable) ELSE 0 END AS credit_mur,
  'AN' AS journal,
  ec.devise AS devise_origine,
  NOW() AS created_at
FROM ecarts_par_compte ec
WHERE ABS(ec.solde_reel_total - ec.solde_comptable) > 0.01;

-- ── 4. VÉRIFICATION FINALE ────────────────────────────────────────────
SELECT
  '=== ÉCRITURES CRÉÉES PAR MIG 322 ===' AS section,
  numero_compte,
  COUNT(*) AS nb,
  ROUND(SUM(debit_mur)::numeric, 2) AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit
FROM ecritures_comptables_v2
WHERE ref_folio LIKE 'OUVERTURE-322%'
GROUP BY numero_compte
ORDER BY numero_compte;

-- ── 5. SOLDES BANCAIRES APRÈS MIG 322 ─────────────────────────────────
SELECT
  '=== SOLDES BANCAIRES APRÈS MIG 322 ===' AS section,
  cb.societe_id,
  (SELECT nom FROM societes WHERE id = cb.societe_id) AS societe_nom,
  cb.compte_comptable,
  cb.devise,
  ROUND(SUM(cb.solde_actuel)::numeric, 2) AS solde_reel,
  ROUND(COALESCE((
    SELECT SUM(debit_mur) - SUM(credit_mur)
    FROM ecritures_comptables_v2
    WHERE numero_compte = cb.compte_comptable
      AND societe_id = cb.societe_id
  ), 0)::numeric, 2) AS solde_comptable,
  ROUND((SUM(cb.solde_actuel) - COALESCE((
    SELECT SUM(debit_mur) - SUM(credit_mur)
    FROM ecritures_comptables_v2
    WHERE numero_compte = cb.compte_comptable
      AND societe_id = cb.societe_id
  ), 0))::numeric, 2) AS ecart,
  CASE
    WHEN ABS(SUM(cb.solde_actuel) - COALESCE((
      SELECT SUM(debit_mur) - SUM(credit_mur)
      FROM ecritures_comptables_v2
      WHERE numero_compte = cb.compte_comptable
        AND societe_id = cb.societe_id
    ), 0)) < 0.01 THEN '✓ ALIGNÉ'
    ELSE '⚠ ÉCART'
  END AS status
FROM comptes_bancaires cb
WHERE cb.compte_comptable IS NOT NULL
GROUP BY cb.societe_id, cb.compte_comptable, cb.devise
ORDER BY cb.societe_id, cb.compte_comptable;

-- ── 6. BALANCE GLOBALE FINALE ─────────────────────────────────────────
SELECT
  '=== BALANCE GLOBALE FINALE ===' AS section,
  ROUND(SUM(debit_mur)::numeric, 2) AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS desequilibre,
  CASE
    WHEN ABS(SUM(debit_mur) - SUM(credit_mur)) < 0.01 THEN '✅ COMPTABILITÉ ÉQUILIBRÉE'
    ELSE '⚠ DÉSÉQUILIBRE: ' || ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)::TEXT
  END AS status
FROM ecritures_comptables_v2;

-- ── 7. SOLDES PAR CLASSE ──────────────────────────────────────────────
SELECT
  '=== SOLDES PAR CLASSE ===' AS section,
  SUBSTRING(numero_compte FROM 1 FOR 1) AS classe,
  COUNT(*) AS nb_ecritures,
  ROUND(SUM(debit_mur)::numeric, 2) AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS solde
FROM ecritures_comptables_v2
GROUP BY SUBSTRING(numero_compte FROM 1 FOR 1)
ORDER BY classe;

COMMIT;
