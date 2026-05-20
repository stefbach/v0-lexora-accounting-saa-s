-- ============================================================================
-- Migration 290 — Diagnostic incohérences PCM (Banque -16M, 5800 +6M, 401 D=0)
-- ============================================================================
-- CONTEXTE :
--   Vue PCM : Classe 5 = -10.16M (Banque -16.4M, 5800 +6.2M)
--             Classe 4 = +17.57M (401 fournisseurs C=1.21M, D=0)
--   → Toutes les sorties de banque (21.6M) ont été classées en virement interne
--     au lieu d'être imputées aux comptes de charges/fournisseurs.
--
-- Ce script est UNIQUEMENT diagnostique — il ne modifie aucune donnée.
-- Exécutez chaque SELECT et envoyez-moi les résultats pour décider du correctif.
-- ============================================================================

-- ── REQUÊTE 1 : Vérification d'équilibre comptable global ────────────────
-- Toutes les écritures doivent satisfaire SUM(debit) = SUM(credit). Si non,
-- des écritures simples (sans contre-partie) ont été insérées.
SELECT
  ROUND(SUM(debit_mur)::numeric, 2)  AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS desequilibre
FROM ecritures_comptables_v2;

-- ── REQUÊTE 2 : Équilibre par journal (BNQ, OD, AC, etc.) ────────────────
SELECT
  journal,
  COUNT(*) AS nb,
  ROUND(SUM(debit_mur)::numeric, 2)  AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS desequilibre
FROM ecritures_comptables_v2
GROUP BY journal
ORDER BY ABS(SUM(debit_mur) - SUM(credit_mur)) DESC;

-- ── REQUÊTE 3 : Équilibre par ref_folio (chaque virement bancaire) ───────
-- Un virement = 1 ref_folio = 2 lignes (DR + CR) qui doivent s'équilibrer.
-- Liste les folios déséquilibrés (cause directe des -16M/+6M).
SELECT
  ref_folio,
  journal,
  COUNT(*) AS nb_lignes,
  ROUND(SUM(debit_mur)::numeric, 2)  AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS desequilibre,
  STRING_AGG(DISTINCT numero_compte, ', ' ORDER BY numero_compte) AS comptes_impliqués
FROM ecritures_comptables_v2
WHERE ref_folio IS NOT NULL
GROUP BY ref_folio, journal
HAVING ABS(SUM(debit_mur) - SUM(credit_mur)) > 0.01
ORDER BY ABS(SUM(debit_mur) - SUM(credit_mur)) DESC
LIMIT 30;

-- ── REQUÊTE 4 : Écritures BNQ par compte de contre-partie ─────────────────
-- Distribution des écritures BNQ : sur quels comptes sont-elles imputées ?
SELECT
  CASE
    WHEN numero_compte LIKE '512%' THEN '512 (Banque)'
    WHEN numero_compte LIKE '5800%' THEN '5800 (Virement interne transit)'
    WHEN numero_compte LIKE '401%' THEN '401 (Fournisseurs)'
    WHEN numero_compte LIKE '411%' THEN '411 (Clients)'
    WHEN numero_compte LIKE '455%' THEN '455 (CCA)'
    WHEN numero_compte LIKE '471%' THEN '471 (À classer)'
    WHEN numero_compte LIKE '4210%' THEN '4210 (Salaires)'
    WHEN numero_compte LIKE '62%' OR numero_compte LIKE '61%' THEN '6x (Charges)'
    ELSE numero_compte
  END AS categorie_compte,
  COUNT(*) AS nb,
  ROUND(SUM(debit_mur)::numeric, 2)  AS total_debit,
  ROUND(SUM(credit_mur)::numeric, 2) AS total_credit
FROM ecritures_comptables_v2
WHERE journal = 'BNQ'
GROUP BY categorie_compte
ORDER BY (SUM(debit_mur) + SUM(credit_mur)) DESC;

-- ── REQUÊTE 5 : Top 20 écritures BNQ au compte 5800 ──────────────────────
-- Voir si ces écritures sont vraiment des virements internes ou des paiements
-- mal classifiés.
SELECT
  id, date_ecriture, numero_compte, libelle,
  debit_mur, credit_mur, devise_origine, montant_origine, ref_folio
FROM ecritures_comptables_v2
WHERE journal = 'BNQ'
  AND numero_compte LIKE '5800%'
ORDER BY GREATEST(debit_mur, credit_mur) DESC
LIMIT 20;

-- ── REQUÊTE 6 : Classifications des transactions bancaires dans le JSON ──
-- Voir comment l'agent a classé les tx (cause amont des écritures BNQ).
SELECT
  COALESCE(tx->>'matched_type', tx->>'classification', '(non classé)') AS classification,
  COUNT(*) AS nb_tx,
  ROUND(SUM(GREATEST(
    (tx->>'debit')::numeric,
    (tx->>'credit')::numeric
  ))::numeric, 2) AS montant_total_devise_orig
FROM releves_bancaires rb,
     jsonb_array_elements(rb.transactions_json) AS tx
WHERE tx->>'statut' IN ('rapproche', 'propose', 'a_verifier')
GROUP BY classification
ORDER BY nb_tx DESC;

-- ── REQUÊTE 7 : Écritures BNQ orphelines (1 seule ligne, pas 2) ──────────
-- Une écriture BNQ doit créer DEUX lignes (DR 512 + CR autre OU CR 512 + DR autre).
-- Si ref_folio n'a qu'une seule ligne → contrepartie manquante.
SELECT
  COUNT(*) AS nb_refs_avec_1_ligne_seulement
FROM (
  SELECT ref_folio
  FROM ecritures_comptables_v2
  WHERE journal = 'BNQ' AND ref_folio IS NOT NULL
  GROUP BY ref_folio
  HAVING COUNT(*) = 1
) t;

-- Lister 20 exemples
SELECT
  e.ref_folio, e.date_ecriture, e.numero_compte, e.libelle,
  e.debit_mur, e.credit_mur
FROM ecritures_comptables_v2 e
WHERE e.journal = 'BNQ' AND e.ref_folio IN (
  SELECT ref_folio FROM ecritures_comptables_v2
  WHERE journal = 'BNQ' AND ref_folio IS NOT NULL
  GROUP BY ref_folio HAVING COUNT(*) = 1
)
ORDER BY e.date_ecriture DESC
LIMIT 20;
