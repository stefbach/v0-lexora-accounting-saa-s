-- ============================================================================
-- Migration 418 — SFT detection v2 : 6 catégories qualifiées
-- ============================================================================
-- Référence légale :
--   - Income Tax (Statement of Financial Transactions) Regulations 2015
--   - MRA Communiqué 2019/06 — seuils SFT par catégorie
--   - ITA s.123A — pénalités non-déclaration (Rs 5 000/transaction omise)
--
-- Problème corrigé (W2-D #5) :
--   La RPC `sft_detect_transactions` actuelle (mig 260) filtre par un
--   simple seuil monétaire (Rs 50k) sans typologie qualifiée. Résultat :
--   centaines de faux positifs (salaires, paiements MRA, loyers locaux,
--   achats fournisseurs banals). Les vraies transactions SFT sont
--   noyées dans le bruit ⇒ risque réglementaire moyen (non-déclaration).
--
-- Cette migration crée une nouvelle RPC `sft_detect_transactions_v2`
-- avec 6 catégories qualifiées et seuils légaux dédiés. L'ancienne RPC
-- est conservée pour rétrocompat. Les routes API sont migrées vers v2.
--
-- 6 catégories (SFT Reg 2015 + Comm 2019/06) :
--   A. immobilier        ≥ 2 000 000 MUR  (compte 211x / 213x)
--   B. cash              ≥ 500 000 MUR    (cumul/an/tiers, compte 530x)
--   C. virements intl    ≥ 500 000 MUR    (classe 5 + tiers non-MU)
--   D. dividendes NR     ≥ 500 000 MUR    (compte 457x + tiers non-MU)
--   E. intérêts NR       ≥ 100 000 MUR    (compte 661x + tiers non-MU)
--   F. loyers NR         ≥ 240 000 MUR    (compte 6132 + tiers non-MU)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- RPC v2 : détection SFT avec typologie qualifiée
-- ----------------------------------------------------------------------------
-- NB : les écritures comptables (`ecritures_comptables_v2`) ne portent
--      pas de FK directe `tiers_id`. Le rattachement counterparty se fait :
--        - via `facture_id` → `factures.tiers` (TEXT) → `tiers_annuaire`
--          (LOWER(nom)) pour récupérer pays / related_party,
--        - fallback : extraction depuis `description` (best-effort).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sft_detect_transactions_v2(
  p_societe_id UUID,
  p_year INT,
  p_category TEXT DEFAULT NULL  -- filtre optionnel : 'immobilier','cash','virement_intl','dividende_nr','interet_nr','loyer_nr'
) RETURNS TABLE (
  source              TEXT,
  date_trans          DATE,
  counterparty        TEXT,
  counterparty_country TEXT,
  amount_mur          NUMERIC,
  transaction_type    TEXT,
  sft_category        TEXT,
  threshold_used      NUMERIC,
  ecriture_id         UUID,
  facture_id          UUID,
  legal_ref           TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  -- ------------------------------------------------------------------------
  -- A. IMMOBILIER — comptes 211x / 213x ≥ 2 000 000 MUR
  --    SFT Reg 2015 Schedule Cat A : acquisition / disposal of immovable property
  -- ------------------------------------------------------------------------
  SELECT
    'ecriture_immobilier'::TEXT                                   AS source,
    e.date_ecriture                                               AS date_trans,
    COALESCE(f.tiers, e.description, 'tiers inconnu')             AS counterparty,
    COALESCE(ta.pays, 'MU')                                       AS counterparty_country,
    GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0))::NUMERIC AS amount_mur,
    (CASE WHEN COALESCE(e.debit_mur,0) > 0
          THEN 'acquisition_immobilier'
          ELSE 'cession_immobilier' END)::TEXT                    AS transaction_type,
    'immobilier'::TEXT                                            AS sft_category,
    2000000::NUMERIC                                              AS threshold_used,
    e.id                                                          AS ecriture_id,
    e.facture_id                                                  AS facture_id,
    'SFT Reg 2015 Cat A (immovable property)'::TEXT               AS legal_ref
  FROM public.ecritures_comptables_v2 e
  LEFT JOIN public.factures f       ON f.id = e.facture_id
  LEFT JOIN public.tiers_annuaire ta ON LOWER(ta.nom) = LOWER(COALESCE(f.tiers, ''))
  WHERE e.societe_id = p_societe_id
    AND EXTRACT(YEAR FROM e.date_ecriture) = p_year
    AND (e.numero_compte LIKE '211%' OR e.numero_compte LIKE '213%')
    AND GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0)) >= 2000000
    AND (p_category IS NULL OR p_category = 'immobilier')

  UNION ALL

  -- ------------------------------------------------------------------------
  -- B. CASH — caisse 530x, cumul ≥ 500 000 MUR / an / tiers
  --    SFT Reg 2015 Schedule Cat B : cash deposits / withdrawals
  -- ------------------------------------------------------------------------
  SELECT
    'ecriture_cash'::TEXT                                         AS source,
    MAX(e.date_ecriture)                                          AS date_trans,
    COALESCE(NULLIF(TRIM(e.description), ''), 'caisse')           AS counterparty,
    'MU'::TEXT                                                    AS counterparty_country,
    SUM(GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0)))::NUMERIC AS amount_mur,
    'mouvement_especes'::TEXT                                     AS transaction_type,
    'cash'::TEXT                                                  AS sft_category,
    500000::NUMERIC                                               AS threshold_used,
    NULL::UUID                                                    AS ecriture_id,
    NULL::UUID                                                    AS facture_id,
    'SFT Reg 2015 Cat B (cash transactions)'::TEXT                AS legal_ref
  FROM public.ecritures_comptables_v2 e
  WHERE e.societe_id = p_societe_id
    AND EXTRACT(YEAR FROM e.date_ecriture) = p_year
    AND e.numero_compte LIKE '530%'
    AND (p_category IS NULL OR p_category = 'cash')
  GROUP BY COALESCE(NULLIF(TRIM(e.description), ''), 'caisse')
  HAVING SUM(GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0))) >= 500000

  UNION ALL

  -- ------------------------------------------------------------------------
  -- C. VIREMENTS INTERNATIONAUX — classe 5, tiers non-résident ≥ 500 000 MUR
  --    SFT Reg 2015 Schedule Cat C : foreign currency / cross-border transfers
  -- ------------------------------------------------------------------------
  SELECT
    'ecriture_intl'::TEXT                                         AS source,
    e.date_ecriture                                               AS date_trans,
    COALESCE(f.tiers, e.description, 'tiers étranger')            AS counterparty,
    ta.pays                                                       AS counterparty_country,
    GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0))::NUMERIC AS amount_mur,
    (CASE WHEN COALESCE(e.debit_mur,0) > 0
          THEN 'virement_intl_entrant'
          ELSE 'virement_intl_sortant' END)::TEXT                 AS transaction_type,
    'virement_intl'::TEXT                                         AS sft_category,
    500000::NUMERIC                                               AS threshold_used,
    e.id                                                          AS ecriture_id,
    e.facture_id                                                  AS facture_id,
    'SFT Reg 2015 Cat C / MRA Comm 2019/06 (cross-border)'::TEXT  AS legal_ref
  FROM public.ecritures_comptables_v2 e
  LEFT JOIN public.factures f       ON f.id = e.facture_id
  INNER JOIN public.tiers_annuaire ta ON LOWER(ta.nom) = LOWER(COALESCE(f.tiers, ''))
  WHERE e.societe_id = p_societe_id
    AND EXTRACT(YEAR FROM e.date_ecriture) = p_year
    AND e.numero_compte LIKE '5%'
    AND ta.pays IS NOT NULL
    AND ta.pays <> 'MU'
    AND GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0)) >= 500000
    AND (p_category IS NULL OR p_category = 'virement_intl')

  UNION ALL

  -- ------------------------------------------------------------------------
  -- D. DIVIDENDES versés à NON-RÉSIDENTS — compte 457x, tiers non-MU ≥ 500 000 MUR
  --    SFT Reg 2015 Schedule Cat D : dividends paid to non-residents
  -- ------------------------------------------------------------------------
  SELECT
    'ecriture_dividende_nr'::TEXT                                 AS source,
    e.date_ecriture                                               AS date_trans,
    COALESCE(f.tiers, e.description, 'actionnaire NR')            AS counterparty,
    ta.pays                                                       AS counterparty_country,
    GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0))::NUMERIC AS amount_mur,
    'dividende_non_resident'::TEXT                                AS transaction_type,
    'dividende_nr'::TEXT                                          AS sft_category,
    500000::NUMERIC                                               AS threshold_used,
    e.id                                                          AS ecriture_id,
    e.facture_id                                                  AS facture_id,
    'SFT Reg 2015 Cat D (dividends to non-residents)'::TEXT       AS legal_ref
  FROM public.ecritures_comptables_v2 e
  LEFT JOIN public.factures f       ON f.id = e.facture_id
  INNER JOIN public.tiers_annuaire ta ON LOWER(ta.nom) = LOWER(COALESCE(f.tiers, ''))
  WHERE e.societe_id = p_societe_id
    AND EXTRACT(YEAR FROM e.date_ecriture) = p_year
    AND e.numero_compte LIKE '457%'
    AND ta.pays IS NOT NULL
    AND ta.pays <> 'MU'
    AND GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0)) >= 500000
    AND (p_category IS NULL OR p_category = 'dividende_nr')

  UNION ALL

  -- ------------------------------------------------------------------------
  -- E. INTÉRÊTS versés à NON-RÉSIDENTS — compte 661x, tiers non-MU ≥ 100 000 MUR
  --    SFT Reg 2015 Schedule Cat E : interest paid to non-residents
  -- ------------------------------------------------------------------------
  SELECT
    'ecriture_interet_nr'::TEXT                                   AS source,
    e.date_ecriture                                               AS date_trans,
    COALESCE(f.tiers, e.description, 'prêteur NR')                AS counterparty,
    ta.pays                                                       AS counterparty_country,
    GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0))::NUMERIC AS amount_mur,
    'interet_non_resident'::TEXT                                  AS transaction_type,
    'interet_nr'::TEXT                                            AS sft_category,
    100000::NUMERIC                                               AS threshold_used,
    e.id                                                          AS ecriture_id,
    e.facture_id                                                  AS facture_id,
    'SFT Reg 2015 Cat E (interest to non-residents)'::TEXT        AS legal_ref
  FROM public.ecritures_comptables_v2 e
  LEFT JOIN public.factures f       ON f.id = e.facture_id
  INNER JOIN public.tiers_annuaire ta ON LOWER(ta.nom) = LOWER(COALESCE(f.tiers, ''))
  WHERE e.societe_id = p_societe_id
    AND EXTRACT(YEAR FROM e.date_ecriture) = p_year
    AND e.numero_compte LIKE '661%'
    AND ta.pays IS NOT NULL
    AND ta.pays <> 'MU'
    AND GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0)) >= 100000
    AND (p_category IS NULL OR p_category = 'interet_nr')

  UNION ALL

  -- ------------------------------------------------------------------------
  -- F. LOYERS versés à NON-RÉSIDENTS — compte 6132, tiers non-MU ≥ 240 000 MUR
  --    SFT Reg 2015 Schedule Cat F : rent paid to non-residents (Rs 20k/mois)
  -- ------------------------------------------------------------------------
  SELECT
    'ecriture_loyer_nr'::TEXT                                     AS source,
    e.date_ecriture                                               AS date_trans,
    COALESCE(f.tiers, e.description, 'bailleur NR')               AS counterparty,
    ta.pays                                                       AS counterparty_country,
    GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0))::NUMERIC AS amount_mur,
    'loyer_non_resident'::TEXT                                    AS transaction_type,
    'loyer_nr'::TEXT                                              AS sft_category,
    240000::NUMERIC                                               AS threshold_used,
    e.id                                                          AS ecriture_id,
    e.facture_id                                                  AS facture_id,
    'SFT Reg 2015 Cat F (rent to non-residents)'::TEXT            AS legal_ref
  FROM public.ecritures_comptables_v2 e
  LEFT JOIN public.factures f       ON f.id = e.facture_id
  INNER JOIN public.tiers_annuaire ta ON LOWER(ta.nom) = LOWER(COALESCE(f.tiers, ''))
  WHERE e.societe_id = p_societe_id
    AND EXTRACT(YEAR FROM e.date_ecriture) = p_year
    AND e.numero_compte LIKE '6132%'
    AND ta.pays IS NOT NULL
    AND ta.pays <> 'MU'
    AND GREATEST(COALESCE(e.debit_mur, 0), COALESCE(e.credit_mur, 0)) >= 240000
    AND (p_category IS NULL OR p_category = 'loyer_nr')

  ORDER BY date_trans DESC, amount_mur DESC;
END;
$$;

COMMENT ON FUNCTION public.sft_detect_transactions_v2(UUID, INT, TEXT) IS
  'SFT v2 (mig 418) — détection qualifiée 6 catégories (Income Tax SFT '
  'Regulations 2015 + MRA Communiqué 2019/06). Remplace l''ancienne RPC '
  '`sft_detect_transactions` (mig 260) qui ne filtrait que par seuil '
  'monétaire global. Catégories : immobilier (2M), cash (500k cumul), '
  'virement_intl (500k), dividende_nr (500k), interet_nr (100k), '
  'loyer_nr (240k). Le paramètre `p_category` filtre optionnellement '
  'sur une catégorie unique. Le rattachement counterparty se fait via '
  'la chaîne ecriture → facture_id → factures.tiers → tiers_annuaire.';

GRANT EXECUTE ON FUNCTION public.sft_detect_transactions_v2(UUID, INT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- Vue helper : récap par catégorie (utile pour le dashboard SFT)
-- ----------------------------------------------------------------------------
-- (Vue dynamique paramétrée non possible côté PG : on expose une fonction.)
CREATE OR REPLACE FUNCTION public.sft_summary_by_category(
  p_societe_id UUID,
  p_year INT
) RETURNS TABLE (
  sft_category   TEXT,
  nb_transactions BIGINT,
  total_mur      NUMERIC,
  threshold_used NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    d.sft_category,
    COUNT(*)::BIGINT       AS nb_transactions,
    SUM(d.amount_mur)::NUMERIC AS total_mur,
    MAX(d.threshold_used)::NUMERIC AS threshold_used
  FROM public.sft_detect_transactions_v2(p_societe_id, p_year, NULL) d
  GROUP BY d.sft_category
  ORDER BY d.sft_category;
$$;

GRANT EXECUTE ON FUNCTION public.sft_summary_by_category(UUID, INT) TO authenticated;
