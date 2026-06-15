-- ============================================================================
-- Migration 461 — Garde-fou « Santé Banque » : vues d'anomalies rapprochement
-- ============================================================================
-- CONTEXTE :
--   Suite aux corrections de juin 2026 (relevés EUR/MUR importés à zéro,
--   dates de transaction manquantes au rapprochement, lignes mal signées,
--   écritures BNQ mal datées, doublons de comptes), ce garde-fou détecte
--   automatiquement TOUTE récidive, sur TOUS les clients, en une requête.
--
--   Objets créés :
--     1. bank_safe_num(text)      — cast numérique robuste (NULL si illisible)
--     2. v_banque_anomalies       — 1 ligne par anomalie détectée (tous clients)
--     3. v_sante_banque           — synthèse par société (compte + couleur)
--
--   6 contrôles couverts (sur relevés actifs / écritures BNQ / comptes) :
--     - lignes_a_zero          : ligne débit=0 ET crédit=0 mais montant natif présent
--     - dates_manquantes       : transaction sans champ `date`
--     - ecart_reconciliation   : solde_ouv + crédits − débits ≠ solde_clôture (>1)
--     - lignes_vs_total        : Σ lignes ≠ totaux d'en-tête (>1) → signe douteux
--     - bnq_date_hors_periode  : écriture BNQ datée hors période de son relevé
--     - compte_bancaire_double : 2+ fiches pour le même n° de compte
--
--   Exposé via /api/comptable/sante-banque. Lecture seule, aucun effet de bord.
-- ============================================================================

-- ── 1. Helper : cast numérique tolérant (ne fait jamais échouer la vue) ──────
CREATE OR REPLACE FUNCTION public.bank_safe_num(t text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF t IS NULL OR btrim(t) = '' THEN RETURN NULL; END IF;
  RETURN t::numeric;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- ── 2. Vue v_banque_anomalies : 1 ligne par anomalie, tous clients ───────────
DROP VIEW IF EXISTS public.v_banque_anomalies CASCADE;

CREATE VIEW public.v_banque_anomalies AS
-- (1) Lignes à zéro avec montant natif récupérable (bug montants EUR/MUR)
SELECT rb.societe_id,
       'lignes_a_zero'::text  AS type_anomalie,
       'critique'::text       AS severite,
       cb.devise,
       rb.periode,
       rb.id::text            AS reference,
       count(*)::int          AS nb,
       count(*) || ' ligne(s) à 0 avec montant natif récupérable' AS detail
FROM public.releves_bancaires rb
LEFT JOIN public.comptes_bancaires cb ON cb.id = rb.compte_bancaire_id
CROSS JOIN LATERAL jsonb_array_elements(rb.transactions_json) AS t(elem)
WHERE rb.superseded_by_id IS NULL
  AND COALESCE(public.bank_safe_num(t.elem->>'debit'), 0) = 0
  AND COALESCE(public.bank_safe_num(t.elem->>'credit'), 0) = 0
  AND COALESCE(NULLIF(t.elem->>'debit_mur',''), NULLIF(t.elem->>'credit_mur',''),
               NULLIF(t.elem->>'debit_devise',''), NULLIF(t.elem->>'credit_devise',''),
               NULLIF(t.elem->>'montant_origine','')) IS NOT NULL
GROUP BY rb.societe_id, cb.devise, rb.periode, rb.id

UNION ALL
-- (2) Transactions sans date (bug dates au rapprochement)
SELECT rb.societe_id, 'dates_manquantes', 'critique', cb.devise, rb.periode, rb.id::text,
       count(*)::int, count(*) || ' transaction(s) sans date'
FROM public.releves_bancaires rb
LEFT JOIN public.comptes_bancaires cb ON cb.id = rb.compte_bancaire_id
CROSS JOIN LATERAL jsonb_array_elements(rb.transactions_json) AS t(elem)
WHERE rb.superseded_by_id IS NULL
  AND NULLIF(t.elem->>'date','') IS NULL
GROUP BY rb.societe_id, cb.devise, rb.periode, rb.id

UNION ALL
-- (3) Écart de réconciliation (solde ouv + crédits − débits ≠ clôture)
SELECT rb.societe_id, 'ecart_reconciliation', 'critique', cb.devise, rb.periode, rb.id::text,
       1, 'Écart de ' || round(abs((rb.solde_ouverture + rb.total_credits - rb.total_debits) - rb.solde_cloture), 2) || ' (réconciliation solde)'
FROM public.releves_bancaires rb
LEFT JOIN public.comptes_bancaires cb ON cb.id = rb.compte_bancaire_id
WHERE rb.superseded_by_id IS NULL
  AND abs((rb.solde_ouverture + rb.total_credits - rb.total_debits) - rb.solde_cloture) > 1

UNION ALL
-- (4) Σ lignes ≠ totaux d'en-tête → signe d'une ligne probablement inversé
SELECT x.societe_id, 'lignes_vs_total', 'warning', x.devise, x.periode, x.id::text, 1,
       'Σ lignes ≠ totaux en-tête (déb ' || round(x.sdeb - x.total_debits, 2)
         || ', créd ' || round(x.scred - x.total_credits, 2) || ') — signe douteux'
FROM (
  SELECT rb.societe_id, cb.devise, rb.periode, rb.id,
         rb.total_debits, rb.total_credits,
         round(sum(COALESCE(public.bank_safe_num(t.elem->>'debit'), 0)), 2)  AS sdeb,
         round(sum(COALESCE(public.bank_safe_num(t.elem->>'credit'), 0)), 2) AS scred
  FROM public.releves_bancaires rb
  LEFT JOIN public.comptes_bancaires cb ON cb.id = rb.compte_bancaire_id
  CROSS JOIN LATERAL jsonb_array_elements(rb.transactions_json) AS t(elem)
  WHERE rb.superseded_by_id IS NULL
  GROUP BY rb.societe_id, cb.devise, rb.periode, rb.id, rb.total_debits, rb.total_credits
) x
WHERE abs(x.sdeb - x.total_debits) > 1 OR abs(x.scred - x.total_credits) > 1

UNION ALL
-- (5) Écritures BNQ datées hors de la période de leur relevé source
SELECT e.societe_id, 'bnq_date_hors_periode', 'warning', NULL::text,
       to_char(rb.date_debut, 'YYYY-MM'), e.id::text, 1,
       'Écriture BNQ datée ' || e.date_ecriture || ' hors période ('
         || rb.date_debut || ' → ' || rb.date_fin || ')'
FROM public.ecritures_comptables_v2 e
JOIN public.releves_bancaires rb
  ON rb.id = substring(e.ref_folio from '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')::uuid
WHERE e.journal = 'BNQ'
  AND e.ref_folio ~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
  AND e.date_ecriture NOT BETWEEN rb.date_debut AND rb.date_fin

UNION ALL
-- (6) Doublons de comptes bancaires (même n° de compte sur la société)
SELECT cb.societe_id, 'compte_bancaire_double', 'warning', cb.devise, NULL::text,
       cb.numero_compte, count(*)::int,
       count(*) || ' fiches pour le compte ' || cb.numero_compte
FROM public.comptes_bancaires cb
WHERE cb.numero_compte IS NOT NULL AND cb.numero_compte <> ''
GROUP BY cb.societe_id, cb.devise, cb.numero_compte
HAVING count(*) > 1;

COMMENT ON VIEW public.v_banque_anomalies IS
  'Garde-fou rapprochement (mig 461) : 1 ligne par anomalie bancaire détectée, '
  'tous clients. 6 contrôles : lignes_a_zero, dates_manquantes, '
  'ecart_reconciliation, lignes_vs_total, bnq_date_hors_periode, '
  'compte_bancaire_double. Exposé via /api/comptable/sante-banque.';

-- ── 3. Vue v_sante_banque : synthèse par société (badge dashboard) ───────────
DROP VIEW IF EXISTS public.v_sante_banque CASCADE;

CREATE VIEW public.v_sante_banque AS
SELECT s.id AS societe_id,
       count(a.type_anomalie)::int AS nb_anomalies,
       count(*) FILTER (WHERE a.severite = 'critique')::int AS nb_critiques,
       count(*) FILTER (WHERE a.severite = 'warning')::int  AS nb_warnings,
       CASE
         WHEN count(*) FILTER (WHERE a.severite = 'critique') > 0 THEN 'rouge'
         WHEN count(a.type_anomalie) > 0 THEN 'orange'
         ELSE 'vert'
       END AS couleur
FROM public.societes s
LEFT JOIN public.v_banque_anomalies a ON a.societe_id = s.id
GROUP BY s.id;

COMMENT ON VIEW public.v_sante_banque IS
  'Synthèse santé bancaire par société (mig 461) : nb anomalies + couleur '
  '(vert=0, orange=warnings, rouge=critiques). Voir v_banque_anomalies.';

-- ── 4. Droits (la couche API utilise le service-role + lib/rh/access.ts) ─────
GRANT SELECT ON public.v_banque_anomalies TO authenticated, service_role;
GRANT SELECT ON public.v_sante_banque     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bank_safe_num(text) TO authenticated, service_role;
