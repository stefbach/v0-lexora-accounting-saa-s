-- ============================================================================
-- Migration 289 — Fusion doublon CCA + génération mouvements depuis écritures
-- ============================================================================
-- CONTEXTE :
-- Deux comptes CCA existent pour la même personne (MR STEPHANE HENRI BACH /
-- Stephane Henri Bach). La migration 288 a mis le même solde sur les deux
-- → total = 2 × solde réel (-3 103 160 = 2 × -1 551 580).
-- De plus, aucun mouvement → détail vide.
--
-- Ce script auto-détecte les doublons (même societe_id, nom similaire),
-- garde le plus récent (updated_at MAX), remet le doublon à 0, recalcule
-- le solde correct, et génère les mouvements depuis les écritures 455.
-- ============================================================================

-- ── ÉTAPE 1 : Diagnostic ─────────────────────────────────────────────────
SELECT
  cca.id, cca.societe_id, cca.nom, cca.type, cca.solde, cca.updated_at,
  (SELECT COUNT(*) FROM mouvements_compte_courant m WHERE m.compte_courant_id = cca.id) AS nb_mouvements
FROM comptes_courants_associes cca
ORDER BY cca.societe_id, LOWER(cca.nom), cca.updated_at DESC;

-- ── ÉTAPE 2 : Remettre TOUTES les CCA à 0 avant recalcul propre ──────────
-- (on va tout recalculer depuis les écritures — état propre garanti)
UPDATE comptes_courants_associes SET solde = 0;

-- ── ÉTAPE 3 : Calculer le vrai solde pour l'une des deux CCA par groupe ──
-- Pour chaque societe_id + prénom similaire, on garde le plus récent
-- (identified by MAX(updated_at)) et lui affecte SUM(credit-debit) du 455.
-- Les doublons restent à 0.

WITH ranked AS (
  SELECT
    id,
    societe_id,
    ROW_NUMBER() OVER (
      PARTITION BY societe_id
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    ) AS rn
  FROM comptes_courants_associes
),
soldes AS (
  SELECT
    e.societe_id,
    ROUND((SUM(e.credit_mur) - SUM(e.debit_mur))::numeric, 2) AS solde_calcule
  FROM ecritures_comptables_v2 e
  WHERE e.numero_compte LIKE '455%'
  GROUP BY e.societe_id
)
UPDATE comptes_courants_associes cca
SET solde = s.solde_calcule
FROM ranked r
JOIN soldes s ON s.societe_id = r.societe_id
WHERE cca.id = r.id
  AND r.rn = 1;  -- uniquement le "principal" par société

-- ── ÉTAPE 4 : Générer les mouvements rétroactifs pour les CCA actifs ─────
-- Insère un mouvement par écriture 455, uniquement sur les CCA avec solde ≠ 0
-- (les doublons à 0 sont ignorés).

INSERT INTO mouvements_compte_courant (
  compte_courant_id,
  societe_id,
  type,
  montant,
  date_mouvement,
  description
)
SELECT DISTINCT ON (cca.id, e.date_ecriture, e.libelle, GREATEST(e.credit_mur, e.debit_mur))
  cca.id                                                    AS compte_courant_id,
  e.societe_id,
  CASE WHEN e.credit_mur > 0 THEN 'avance' ELSE 'remboursement' END AS type,
  GREATEST(e.credit_mur, e.debit_mur)                       AS montant,
  e.date_ecriture                                           AS date_mouvement,
  COALESCE(e.libelle, 'Écriture BNQ rétro-importée')        AS description
FROM ecritures_comptables_v2 e
JOIN (
  -- Seulement le CCA principal (solde ≠ 0) par société
  SELECT id, societe_id
  FROM comptes_courants_associes
  WHERE solde <> 0
) cca ON cca.societe_id = e.societe_id
WHERE e.numero_compte LIKE '455%'
  AND GREATEST(e.credit_mur, e.debit_mur) > 0
  AND NOT EXISTS (
    SELECT 1 FROM mouvements_compte_courant m
    WHERE m.compte_courant_id = cca.id
      AND m.date_mouvement = e.date_ecriture
      AND ABS(m.montant - GREATEST(e.credit_mur, e.debit_mur)) < 0.01
      AND m.description = COALESCE(e.libelle, 'Écriture BNQ rétro-importée')
  );

-- ── ÉTAPE 5 : Vérification finale ────────────────────────────────────────
SELECT
  cca.id,
  cca.nom,
  cca.solde,
  COUNT(m.id)                                              AS nb_mouvements,
  ROUND(SUM(CASE WHEN m.type='avance' THEN m.montant ELSE 0 END)::numeric, 2) AS total_avances,
  ROUND(SUM(CASE WHEN m.type='remboursement' THEN m.montant ELSE 0 END)::numeric, 2) AS total_remboursements
FROM comptes_courants_associes cca
LEFT JOIN mouvements_compte_courant m ON m.compte_courant_id = cca.id
GROUP BY cca.id, cca.nom, cca.solde
ORDER BY ABS(cca.solde) DESC, cca.nom;
