-- ============================================================================
-- Migration 296 — Saisie des soldes d'ouverture 512 Banque (journal AN)
-- ============================================================================
-- CONTEXTE :
--   Le PCM affiche 512 Banque = -21.94M, alors que le solde bancaire réel est
--   légèrement positif. Raison : il n'y avait pas d'écriture d'ouverture
--   (à-nouveaux) pour le 512 dans la base. Les écritures BNQ représentent
--   uniquement les MOUVEMENTS de la période, pas le solde initial.
--
-- DONNÉES (selon utilisateur, taux EUR/MUR = 54.1712 du 04/04/2026) :
--
--   DDS (Digital Data Solutions Ltd) — id 1826dde7-7b41-4d14-bc75-d8d22dfc75fb
--     Solde actuel : 2,856.42 MUR + 404 EUR = 24,741.58 MUR équiv
--     Mouvements nets BNQ : -16,411,158.41
--     → Ouverture au 30/06/2025 = 24,741.58 + 16,411,158.41 = 16,435,899.99 MUR
--
--   OCC (Obesity Care Clinic Ltd) — id b010d75c-62a2-4aae-a52b-8c18261047f7
--     Solde actuel : 33,020.15 MUR + 23,909 EUR = 1,328,209.56 MUR équiv
--     Mouvements nets BNQ : -5,528,820.23
--     → Ouverture au 30/06/2025 = 1,328,209.56 + 5,528,820.23 = 6,857,029.79 MUR
--
-- ÉCRITURES (journal 'AN' = À-Nouveaux, date 30/06/2025) :
--   DDS : DR 512 = 16,435,899.99 / CR 110 = 16,435,899.99
--   OCC : DR 512 =  6,857,029.79 / CR 110 =  6,857,029.79
--
-- NB : 110 = Report à nouveau (capitaux propres). C'est la contre-partie
--      classique pour un solde d'ouverture d'actif issu des exercices
--      antérieurs. À ajuster ultérieurement quand on saisira les autres
--      soldes d'ouverture (clients, fournisseurs, immos, etc.).
-- ============================================================================

-- ── VÉRIFICATION 1 : pas d'ouverture déjà existante ─────────────────────────
SELECT COUNT(*) AS nb_ouvertures_existantes
FROM ecritures_comptables_v2
WHERE numero_compte LIKE '512%'
  AND journal IN ('AN', 'OD')
  AND date_ecriture <= '2025-07-01';

-- Si > 0 : arrêter et investiguer avant de continuer (doublon potentiel)

-- ============================================================================

BEGIN;

-- ── Ouverture DDS ────────────────────────────────────────────────────────────
INSERT INTO ecritures_comptables_v2
  (societe_id, journal, date_ecriture, numero_compte, libelle, debit_mur, credit_mur, ref_folio)
VALUES
  ('1826dde7-7b41-4d14-bc75-d8d22dfc75fb', 'AN', '2025-06-30', '512', 'À-nouveau — Solde d''ouverture banque DDS au 30/06/2025', 16435899.99, 0, 'AN-512-DDS-2025'),
  ('1826dde7-7b41-4d14-bc75-d8d22dfc75fb', 'AN', '2025-06-30', '110', 'À-nouveau — Contre-partie ouverture banque DDS',           0, 16435899.99, 'AN-512-DDS-2025');

-- ── Ouverture OCC ────────────────────────────────────────────────────────────
INSERT INTO ecritures_comptables_v2
  (societe_id, journal, date_ecriture, numero_compte, libelle, debit_mur, credit_mur, ref_folio)
VALUES
  ('b010d75c-62a2-4aae-a52b-8c18261047f7', 'AN', '2025-06-30', '512', 'À-nouveau — Solde d''ouverture banque OCC au 30/06/2025', 6857029.79, 0, 'AN-512-OCC-2025'),
  ('b010d75c-62a2-4aae-a52b-8c18261047f7', 'AN', '2025-06-30', '110', 'À-nouveau — Contre-partie ouverture banque OCC',           0, 6857029.79, 'AN-512-OCC-2025');

-- ── VÉRIFICATION 2 : solde 512 par société (tous journaux confondus) ────────
SELECT
  societe_id,
  CASE societe_id::text
    WHEN '1826dde7-7b41-4d14-bc75-d8d22dfc75fb' THEN 'DDS'
    WHEN 'b010d75c-62a2-4aae-a52b-8c18261047f7' THEN 'OCC'
    ELSE 'AUTRE'
  END AS societe,
  ROUND(SUM(debit_mur)::numeric, 2)                       AS total_D,
  ROUND(SUM(credit_mur)::numeric, 2)                      AS total_C,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)  AS solde_calcule_PCM
FROM ecritures_comptables_v2
WHERE numero_compte LIKE '512%'
GROUP BY societe_id
ORDER BY societe;

-- Attendu :
--   DDS : solde_calcule_PCM ≈ 24,741.58  (= 2,856.42 MUR + 404 EUR convertis)
--   OCC : solde_calcule_PCM ≈ 1,328,209.56 (= 33,020.15 MUR + 23,909 EUR convertis)

-- ── VÉRIFICATION 3 : équilibre AN ────────────────────────────────────────────
SELECT
  ROUND(SUM(debit_mur)::numeric, 2)                       AS total_D_AN,
  ROUND(SUM(credit_mur)::numeric, 2)                      AS total_C_AN,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)  AS desequilibre_AN
FROM ecritures_comptables_v2
WHERE journal = 'AN';

-- ── VÉRIFICATION 4 : équilibre global de la compta ──────────────────────────
SELECT
  ROUND(SUM(debit_mur)::numeric, 2)                       AS total_D_global,
  ROUND(SUM(credit_mur)::numeric, 2)                      AS total_C_global,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2)  AS desequilibre_global
FROM ecritures_comptables_v2;

COMMIT;

-- ============================================================================
-- ROLLBACK : si les soldes calculés ne correspondent pas, annuler :
--   DELETE FROM ecritures_comptables_v2
--   WHERE ref_folio IN ('AN-512-DDS-2025', 'AN-512-OCC-2025');
-- ============================================================================
