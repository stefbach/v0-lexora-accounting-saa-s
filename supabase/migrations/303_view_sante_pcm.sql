-- ============================================================================
-- Migration 303 — Vue "Santé PCM" + RPC check_sante_pcm()
-- ============================================================================
-- CONTEXTE :
--   Suite à la correction de ~6M MUR de déséquilibre comptable (migrations
--   291-300), aucun système d'alerte n'existait. Le problème a été découvert
--   par hasard. Cette migration introduit :
--
--     1. Vue v_sante_pcm — synthèse temps réel par société
--     2. RPC check_sante_pcm(p_societe_id) — détails par société, exposé à
--        l'API Next.js (/api/comptable/sante-pcm)
--
--   Les 5 indicateurs suivis sont :
--     1) Déséquilibre global  : ABS(SUM(D) - SUM(C)) sur ecritures_comptables_v2
--     2) Déséquilibre par journal : journaux dont SUM(D) ≠ SUM(C) (tol 0.01)
--     3) Folios déséquilibrés  : ref_folio dont |D - C| > 0.01
--     4) Écritures orphelines  : lignes sans ref_folio NULL (ne peut pas être
--        lettrée ni rattachée à un folio bancaire ou achat)
--     5) Comptes hors PCG MU   : numero_compte non présent dans plan_comptable
--
--   Seuils :
--     - Vert  : score >= 99 ET déséquilibre global <= 1.00 MUR (arrondis tolérés)
--     - Orange: score >= 80
--     - Rouge : score < 80 OU déséquilibre global > 1.00 MUR
--
--   Performance : la vue scanne ecritures_comptables_v2 — un index composite
--   (societe_id, journal, ref_folio, numero_compte) existe déjà (mig 128/146).
-- ============================================================================

-- ── 1. Vue v_sante_pcm : synthèse par société ────────────────────────────────
DROP VIEW IF EXISTS public.v_sante_pcm CASCADE;

CREATE OR REPLACE VIEW public.v_sante_pcm AS
WITH
-- Total débit/crédit global par société
totaux_globaux AS (
  SELECT
    societe_id,
    COALESCE(SUM(debit_mur),  0)::NUMERIC(18,2) AS total_d_global,
    COALESCE(SUM(credit_mur), 0)::NUMERIC(18,2) AS total_c_global,
    COUNT(*) AS nb_ecritures_total
  FROM public.ecritures_comptables_v2
  GROUP BY societe_id
),
-- Journaux déséquilibrés par société
journaux_desequilibres AS (
  SELECT
    societe_id,
    COUNT(*) AS nb_journaux_desequilibres
  FROM (
    SELECT societe_id, journal,
           SUM(debit_mur) - SUM(credit_mur) AS ecart
    FROM public.ecritures_comptables_v2
    WHERE journal IS NOT NULL
    GROUP BY societe_id, journal
    HAVING ABS(SUM(debit_mur) - SUM(credit_mur)) > 0.01
  ) j
  GROUP BY societe_id
),
-- Folios (ref_folio) déséquilibrés par société (tol 0.01)
folios_desequilibres AS (
  SELECT
    societe_id,
    COUNT(*) AS nb_folios_desequilibres
  FROM (
    SELECT societe_id, ref_folio,
           SUM(debit_mur) - SUM(credit_mur) AS ecart
    FROM public.ecritures_comptables_v2
    WHERE ref_folio IS NOT NULL
    GROUP BY societe_id, ref_folio
    HAVING ABS(SUM(debit_mur) - SUM(credit_mur)) > 0.01
  ) f
  GROUP BY societe_id
),
-- Écritures orphelines (sans ref_folio) — un folio doit toujours regrouper
-- la partie débit et crédit d'une opération. Sans folio, impossible de
-- garantir l'équilibre par opération.
orphelines AS (
  SELECT
    societe_id,
    COUNT(*) AS nb_ecritures_orphelines
  FROM public.ecritures_comptables_v2
  WHERE ref_folio IS NULL
  GROUP BY societe_id
),
-- Comptes hors PCG mauricien : pas dans plan_comptable global
comptes_invalides AS (
  SELECT
    e.societe_id,
    COUNT(DISTINCT e.numero_compte) AS nb_comptes_invalides
  FROM public.ecritures_comptables_v2 e
  LEFT JOIN public.plan_comptable pc
    ON pc.compte = e.numero_compte
  WHERE pc.compte IS NULL
  GROUP BY e.societe_id
),
-- Sociétés référencées (au moins une écriture)
societes_ref AS (
  SELECT DISTINCT societe_id FROM public.ecritures_comptables_v2
  WHERE societe_id IS NOT NULL
)
SELECT
  s.societe_id,
  COALESCE(tg.total_d_global, 0)::NUMERIC(18,2) AS total_d_global,
  COALESCE(tg.total_c_global, 0)::NUMERIC(18,2) AS total_c_global,
  ROUND(
    COALESCE(tg.total_d_global, 0) - COALESCE(tg.total_c_global, 0),
    2
  )::NUMERIC(18,2) AS desequilibre_global,
  COALESCE(jd.nb_journaux_desequilibres, 0)::INT AS nb_journaux_desequilibres,
  COALESCE(fd.nb_folios_desequilibres,   0)::INT AS nb_folios_desequilibres,
  COALESCE(o.nb_ecritures_orphelines,    0)::INT AS nb_ecritures_orphelines,
  COALESCE(ci.nb_comptes_invalides,      0)::INT AS nb_comptes_invalides,
  COALESCE(tg.nb_ecritures_total,        0)::INT AS nb_ecritures_total,
  -- Score 0-100. Pondération :
  --   - Déséquilibre global > 1 MUR  : -40
  --   - Chaque journal déséquilibré  : -10 (capé à -30)
  --   - Chaque folio déséquilibré    : -1  (capé à -20)
  --   - Orphelines > 0               : -5  par tranche de 10 (capé à -20)
  --   - Comptes invalides > 0        : -2  chacun (capé à -10)
  GREATEST(0, 100
    - CASE WHEN ABS(COALESCE(tg.total_d_global, 0) - COALESCE(tg.total_c_global, 0)) > 1.00 THEN 40 ELSE 0 END
    - LEAST(30, COALESCE(jd.nb_journaux_desequilibres, 0) * 10)
    - LEAST(20, COALESCE(fd.nb_folios_desequilibres,   0) * 1)
    - LEAST(20, (COALESCE(o.nb_ecritures_orphelines,   0) / 10) * 5)
    - LEAST(10, COALESCE(ci.nb_comptes_invalides,      0) * 2)
  )::INT AS sante_score,
  CASE
    -- Bonus : tout déséquilibre global > 1 MUR force rouge
    WHEN ABS(COALESCE(tg.total_d_global, 0) - COALESCE(tg.total_c_global, 0)) > 1.00 THEN 'rouge'
    WHEN GREATEST(0, 100
      - LEAST(30, COALESCE(jd.nb_journaux_desequilibres, 0) * 10)
      - LEAST(20, COALESCE(fd.nb_folios_desequilibres,   0) * 1)
      - LEAST(20, (COALESCE(o.nb_ecritures_orphelines,   0) / 10) * 5)
      - LEAST(10, COALESCE(ci.nb_comptes_invalides,      0) * 2)
    ) >= 99 THEN 'vert'
    WHEN GREATEST(0, 100
      - LEAST(30, COALESCE(jd.nb_journaux_desequilibres, 0) * 10)
      - LEAST(20, COALESCE(fd.nb_folios_desequilibres,   0) * 1)
      - LEAST(20, (COALESCE(o.nb_ecritures_orphelines,   0) / 10) * 5)
      - LEAST(10, COALESCE(ci.nb_comptes_invalides,      0) * 2)
    ) >= 80 THEN 'orange'
    ELSE 'rouge'
  END AS sante_couleur
FROM societes_ref s
LEFT JOIN totaux_globaux       tg ON tg.societe_id = s.societe_id
LEFT JOIN journaux_desequilibres jd ON jd.societe_id = s.societe_id
LEFT JOIN folios_desequilibres   fd ON fd.societe_id = s.societe_id
LEFT JOIN orphelines             o  ON o.societe_id  = s.societe_id
LEFT JOIN comptes_invalides      ci ON ci.societe_id = s.societe_id;

COMMENT ON VIEW public.v_sante_pcm IS
  'Synthèse temps réel de la santé comptable par société (mig 303). ' ||
  'Couleur : vert (>=99 & |desequilibre|<=1 MUR), orange (>=80), rouge sinon. ' ||
  'Utilisée par /api/comptable/sante-pcm et la page /comptable/sante-pcm.';

-- ── 2. RPC check_sante_pcm — détails pour une société donnée ────────────────
DROP FUNCTION IF EXISTS public.check_sante_pcm(UUID);

CREATE OR REPLACE FUNCTION public.check_sante_pcm(p_societe_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_synthese JSONB;
  v_journaux JSONB;
  v_folios   JSONB;
  v_orphelines JSONB;
  v_comptes_inv JSONB;
BEGIN
  -- 1. Synthèse globale (ligne de v_sante_pcm)
  SELECT to_jsonb(v) INTO v_synthese
  FROM public.v_sante_pcm v
  WHERE v.societe_id = p_societe_id;

  IF v_synthese IS NULL THEN
    -- Société sans aucune écriture → état "vert" par défaut
    v_synthese := jsonb_build_object(
      'societe_id', p_societe_id,
      'total_d_global', 0,
      'total_c_global', 0,
      'desequilibre_global', 0,
      'nb_journaux_desequilibres', 0,
      'nb_folios_desequilibres', 0,
      'nb_ecritures_orphelines', 0,
      'nb_comptes_invalides', 0,
      'nb_ecritures_total', 0,
      'sante_score', 100,
      'sante_couleur', 'vert'
    );
  END IF;

  -- 2. Détail journaux déséquilibrés (top 20)
  SELECT COALESCE(jsonb_agg(j ORDER BY ABS_ECART DESC), '[]'::jsonb) INTO v_journaux
  FROM (
    SELECT
      journal,
      COUNT(*) AS nb_lignes,
      ROUND(SUM(debit_mur)::NUMERIC,  2) AS total_debit,
      ROUND(SUM(credit_mur)::NUMERIC, 2) AS total_credit,
      ROUND((SUM(debit_mur) - SUM(credit_mur))::NUMERIC, 2) AS ecart,
      ABS(SUM(debit_mur) - SUM(credit_mur))::NUMERIC AS ABS_ECART
    FROM public.ecritures_comptables_v2
    WHERE societe_id = p_societe_id AND journal IS NOT NULL
    GROUP BY journal
    HAVING ABS(SUM(debit_mur) - SUM(credit_mur)) > 0.01
    ORDER BY ABS_ECART DESC
    LIMIT 20
  ) j;

  -- 3. Détail folios déséquilibrés (top 30 par |écart|)
  SELECT COALESCE(jsonb_agg(f ORDER BY ABS_ECART DESC), '[]'::jsonb) INTO v_folios
  FROM (
    SELECT
      ref_folio,
      journal,
      COUNT(*) AS nb_lignes,
      ROUND(SUM(debit_mur)::NUMERIC,  2) AS total_debit,
      ROUND(SUM(credit_mur)::NUMERIC, 2) AS total_credit,
      ROUND((SUM(debit_mur) - SUM(credit_mur))::NUMERIC, 2) AS ecart,
      ABS(SUM(debit_mur) - SUM(credit_mur))::NUMERIC AS ABS_ECART,
      STRING_AGG(DISTINCT numero_compte, ', ' ORDER BY numero_compte) AS comptes
    FROM public.ecritures_comptables_v2
    WHERE societe_id = p_societe_id AND ref_folio IS NOT NULL
    GROUP BY ref_folio, journal
    HAVING ABS(SUM(debit_mur) - SUM(credit_mur)) > 0.01
    ORDER BY ABS_ECART DESC
    LIMIT 30
  ) f;

  -- 4. Détail écritures orphelines (top 30)
  SELECT COALESCE(jsonb_agg(o ORDER BY date_ecriture DESC), '[]'::jsonb) INTO v_orphelines
  FROM (
    SELECT
      id, date_ecriture, journal, numero_compte,
      description AS libelle, debit_mur, credit_mur
    FROM public.ecritures_comptables_v2
    WHERE societe_id = p_societe_id AND ref_folio IS NULL
    ORDER BY date_ecriture DESC
    LIMIT 30
  ) o;

  -- 5. Comptes hors PCG (codes non présents dans plan_comptable)
  SELECT COALESCE(jsonb_agg(c ORDER BY nb_lignes DESC), '[]'::jsonb) INTO v_comptes_inv
  FROM (
    SELECT
      e.numero_compte,
      COUNT(*) AS nb_lignes,
      ROUND(SUM(e.debit_mur)::NUMERIC,  2) AS total_debit,
      ROUND(SUM(e.credit_mur)::NUMERIC, 2) AS total_credit
    FROM public.ecritures_comptables_v2 e
    LEFT JOIN public.plan_comptable pc ON pc.compte = e.numero_compte
    WHERE e.societe_id = p_societe_id
      AND pc.compte IS NULL
    GROUP BY e.numero_compte
    ORDER BY COUNT(*) DESC
    LIMIT 30
  ) c;

  RETURN jsonb_build_object(
    'synthese',         v_synthese,
    'journaux',         v_journaux,
    'folios',           v_folios,
    'orphelines',       v_orphelines,
    'comptes_invalides', v_comptes_inv,
    'generated_at',     NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.check_sante_pcm(UUID) IS
  'Retourne la synthèse + le détail des problèmes de santé PCM pour une ' ||
  'société (mig 303). Utilisé par /api/comptable/sante-pcm.';

-- Droits d'exécution : la couche API utilise le service-role + vérifie
-- l'accès via lib/rh/access.ts, donc EXECUTE n'est PAS nécessaire pour
-- les rôles authenticated. Mais on l'ouvre quand même au cas où la RPC
-- serait appelée via PostgREST par un autre service.
GRANT EXECUTE ON FUNCTION public.check_sante_pcm(UUID) TO authenticated, service_role;
GRANT SELECT ON public.v_sante_pcm TO authenticated, service_role;
