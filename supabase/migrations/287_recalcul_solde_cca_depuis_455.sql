-- ============================================================================
-- Migration 287 — Recalcul solde comptes_courants_associes depuis écritures 455
-- ============================================================================
-- CONTEXTE :
-- lettrer_manuel classifiait les transactions comme 'compte_courant_associe'
-- en créant des écritures au compte 455 mais SANS mettre à jour
-- comptes_courants_associes.solde (champ stocké, non calculé depuis écritures).
-- Résultat : le dashboard CCA affiche 0 malgré des écritures existantes.
--
-- CORRECTION CODE (déployée) : le bloc CCA dans lettrer_manuel met désormais
-- à jour solde + insère dans mouvements_compte_courant pour les nouvelles txs.
-- Ce script corrige les SOLDES EXISTANTS avant le déploiement du fix.
--
-- LOGIQUE COMPTABLE :
--   455 CREDIT = l'associé a déposé de l'argent → entreprise doit davantage
--   455 DÉBIT   = entreprise a remboursé l'associé → entreprise doit moins
--   solde CCA   = SUM(credit_mur) - SUM(debit_mur) au compte 455
-- ============================================================================

-- ── ÉTAPE 1 : Diagnostic — écritures 455 par societe_id ──────────────────
SELECT
  e.societe_id,
  COUNT(*)                                               AS nb_ecritures,
  ROUND(SUM(e.credit_mur)::numeric, 2)                  AS total_credit_mur,
  ROUND(SUM(e.debit_mur)::numeric, 2)                   AS total_debit_mur,
  ROUND((SUM(e.credit_mur) - SUM(e.debit_mur))::numeric, 2) AS solde_calcule,
  MIN(e.date_ecriture)                                  AS premiere_ecriture,
  MAX(e.date_ecriture)                                  AS derniere_ecriture
FROM ecritures_comptables_v2 e
WHERE e.numero_compte LIKE '455%'
GROUP BY e.societe_id
ORDER BY e.societe_id;

-- ── ÉTAPE 2 : État actuel des CCA ────────────────────────────────────────
SELECT id, societe_id, nom, solde
FROM comptes_courants_associes
ORDER BY societe_id, nom;

-- ── ÉTAPE 3 : UPDATE solde ───────────────────────────────────────────────
-- Cas général : une CCA par société (ou match exact par tiers).
-- Si plusieurs CCA par société, toutes reçoivent le solde global 455 —
-- vérifier manuellement si c'est le cas.
UPDATE comptes_courants_associes cca
SET solde = ROUND((
  SELECT COALESCE(SUM(e.credit_mur) - SUM(e.debit_mur), 0)
  FROM ecritures_comptables_v2 e
  WHERE e.societe_id = cca.societe_id
    AND e.numero_compte LIKE '455%'
)::numeric, 2)
WHERE EXISTS (
  SELECT 1
  FROM ecritures_comptables_v2 e
  WHERE e.societe_id = cca.societe_id
    AND e.numero_compte LIKE '455%'
);

-- ── ÉTAPE 4 : Insérer un mouvement de régularisation (traçabilité) ───────
-- Un mouvement unique "correction solde initial" par CCA mis à jour,
-- afin que mouvements_compte_courant reflète l'historique.
INSERT INTO mouvements_compte_courant (
  compte_courant_id,
  societe_id,
  type,
  montant,
  date_mouvement,
  description
)
SELECT
  cca.id,
  cca.societe_id,
  CASE WHEN cca.solde >= 0 THEN 'avance' ELSE 'remboursement' END AS type,
  ABS(cca.solde)                                                   AS montant,
  CURRENT_DATE                                                     AS date_mouvement,
  'Régularisation migration 287 — recalcul solde depuis écritures 455' AS description
FROM comptes_courants_associes cca
WHERE cca.solde <> 0
  AND NOT EXISTS (
    SELECT 1 FROM mouvements_compte_courant m
    WHERE m.compte_courant_id = cca.id
      AND m.description LIKE 'Régularisation migration 287%'
  );

-- ── ÉTAPE 5 : Vérification post-update ───────────────────────────────────
SELECT cca.id, cca.societe_id, cca.nom, cca.solde,
       ROUND((
         SELECT COALESCE(SUM(e.credit_mur) - SUM(e.debit_mur), 0)
         FROM ecritures_comptables_v2 e
         WHERE e.societe_id = cca.societe_id AND e.numero_compte LIKE '455%'
       )::numeric, 2) AS solde_depuis_ecritures
FROM comptes_courants_associes cca
ORDER BY cca.societe_id, cca.nom;
