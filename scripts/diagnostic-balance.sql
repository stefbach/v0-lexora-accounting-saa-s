-- ═══════════════════════════════════════════════════════════════
-- scripts/diagnostic-balance.sql
--
-- Diagnostic + réparation des déséquilibres de la balance par compte.
--
-- Usage : connecter à la DB Supabase, remplacer <SOCIETE_ID> par l'UUID,
-- puis exécuter les requêtes une par une (dans l'ordre) pour identifier
-- la source du déséquilibre avant toute correction.
--
-- Cause principale connue (investigation 2026-04-21) :
--   Deux chemins de génération d'écritures paie utilisaient des PCM
--   différents :
--     • generer_ecritures_paie() (trigger SQL, migration 120) → 421/431/444
--     • app/api/rh/import-paie/route.ts                        → 4210/4311/4330
--   Résultat : les charges 6xxx existaient mais leurs contreparties se
--   répartissaient sur des comptes incohérents, créant un écart au total.
-- ═══════════════════════════════════════════════════════════════

-- ── 0. Paramètres ──────────────────────────────────────────────────
-- Remplacer la valeur ci-dessous avant exécution.
\set societe_id '\'00000000-0000-0000-0000-000000000000\''

-- ── 1. Écart global ────────────────────────────────────────────────
SELECT
  SUM(debit_mur)   AS total_debit,
  SUM(credit_mur)  AS total_credit,
  SUM(debit_mur) - SUM(credit_mur) AS ecart,
  COUNT(*)         AS nb_ecritures
FROM public.ecritures_comptables_v2
WHERE societe_id = :societe_id;

-- ── 2. Écart par journal ───────────────────────────────────────────
-- Un journal équilibré a SUM(debit) = SUM(credit). Tout écart indique
-- une insertion partielle ou une migration cassée.
SELECT
  journal,
  COUNT(*)                              AS nb_ecritures,
  ROUND(SUM(debit_mur)::numeric, 2)     AS debit,
  ROUND(SUM(credit_mur)::numeric, 2)    AS credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS ecart
FROM public.ecritures_comptables_v2
WHERE societe_id = :societe_id
GROUP BY journal
HAVING ABS(SUM(debit_mur) - SUM(credit_mur)) > 0.01
ORDER BY ABS(SUM(debit_mur) - SUM(credit_mur)) DESC;

-- ── 3. Pièces (ref_folio) déséquilibrées ───────────────────────────
-- Chaque ref_folio représente une piece comptable et DOIT être
-- équilibrée. Liste les 50 plus gros écarts.
SELECT
  journal,
  ref_folio,
  date_ecriture,
  COUNT(*)                              AS nb_lignes,
  ROUND(SUM(debit_mur)::numeric, 2)     AS debit,
  ROUND(SUM(credit_mur)::numeric, 2)    AS credit,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS ecart
FROM public.ecritures_comptables_v2
WHERE societe_id = :societe_id
  AND ref_folio IS NOT NULL
GROUP BY journal, ref_folio, date_ecriture
HAVING ABS(SUM(debit_mur) - SUM(credit_mur)) > 0.01
ORDER BY ABS(SUM(debit_mur) - SUM(credit_mur)) DESC
LIMIT 50;

-- ── 4. Collisions PCM — même concept, codes différents ─────────────
-- Ces paires (code court vs codes longs) devraient être consolidées.
WITH pcm AS (
  SELECT numero_compte, SUM(debit_mur) AS d, SUM(credit_mur) AS c, COUNT(*) AS n
  FROM public.ecritures_comptables_v2
  WHERE societe_id = :societe_id
  GROUP BY numero_compte
)
SELECT
  CASE
    WHEN numero_compte IN ('421', '4210', '4211', '4212') THEN '→ Personnel — rémunérations'
    WHEN numero_compte IN ('431', '4311', '4312')         THEN '→ CSG/NSF salarié'
    WHEN numero_compte IN ('432', '4321', '4322', '4323', '4324') THEN '→ CSG/NSF patronal / Training / PRGF'
    WHEN numero_compte IN ('444', '4330', '4440')         THEN '→ PAYE à reverser MRA'
    ELSE NULL
  END AS concept,
  numero_compte,
  n   AS nb_ecritures,
  ROUND(d::numeric, 2) AS debit,
  ROUND(c::numeric, 2) AS credit,
  ROUND((d - c)::numeric, 2) AS solde
FROM pcm
WHERE numero_compte IN ('421', '4210', '4211', '4212',
                        '431', '4311', '4312',
                        '432', '4321', '4322', '4323', '4324',
                        '444', '4330', '4440')
ORDER BY concept NULLS LAST, numero_compte;

-- ── 5. Orphelins — charges 6xxx sans contrepartie dans la même pièce ──
WITH pieces AS (
  SELECT
    ref_folio,
    journal,
    date_ecriture,
    BOOL_OR(numero_compte LIKE '6%') AS has_charge,
    BOOL_OR(numero_compte LIKE '4%') AS has_dette,
    BOOL_OR(numero_compte LIKE '5%') AS has_tresor,
    SUM(debit_mur)  AS d,
    SUM(credit_mur) AS c,
    COUNT(*)        AS nb
  FROM public.ecritures_comptables_v2
  WHERE societe_id = :societe_id
    AND ref_folio IS NOT NULL
  GROUP BY ref_folio, journal, date_ecriture
)
SELECT
  ref_folio, journal, date_ecriture, nb,
  ROUND(d::numeric, 2) AS debit,
  ROUND(c::numeric, 2) AS credit
FROM pieces
WHERE has_charge AND NOT has_dette AND NOT has_tresor
ORDER BY date_ecriture DESC
LIMIT 50;

-- ── 6. Écritures 580 non soldées (virements internes en transit) ───
-- Règle R3 : le 580 doit toujours être soldé à la clôture.
SELECT
  date_ecriture,
  ref_folio,
  libelle,
  ROUND(debit_mur::numeric, 2)  AS debit,
  ROUND(credit_mur::numeric, 2) AS credit,
  lettre
FROM public.ecritures_comptables_v2
WHERE societe_id = :societe_id
  AND numero_compte LIKE '580%'
  AND lettre IS NULL
ORDER BY date_ecriture DESC;

-- ── 7. Écritures 411 (clients) orphelines — paiements sans facture ──
-- Si 411 a beaucoup de crédits (règlements) sans débits (factures),
-- les factures initiales n'ont pas été générées.
SELECT
  date_ecriture,
  ref_folio,
  journal,
  libelle,
  ROUND(debit_mur::numeric, 2)  AS debit,
  ROUND(credit_mur::numeric, 2) AS credit,
  facture_id,
  lettre
FROM public.ecritures_comptables_v2
WHERE societe_id = :societe_id
  AND numero_compte = '411'
  AND credit_mur > 0
  AND facture_id IS NULL
ORDER BY date_ecriture DESC
LIMIT 50;

-- ═══════════════════════════════════════════════════════════════
-- RÉPARATION (à exécuter MANUELLEMENT après analyse des résultats)
-- ═══════════════════════════════════════════════════════════════

-- ── R.1 Consolidation comptes paie (4-chiffres → 3-chiffres) ───────
-- Si la requête 4 montre que certaines écritures sont sur '4210'
-- plutôt que '421', on les consolide pour aligner avec le trigger.
-- DÉCOMMENTER APRÈS VÉRIFICATION :
-- UPDATE public.ecritures_comptables_v2
--   SET numero_compte = '421', nom_compte = 'Personnel — rémunérations dues'
-- WHERE societe_id = :societe_id AND numero_compte IN ('4210', '4211', '4212');
--
-- UPDATE public.ecritures_comptables_v2
--   SET numero_compte = '431', nom_compte = 'Sécurité sociale (CSG/NSF)'
-- WHERE societe_id = :societe_id AND numero_compte IN ('4311', '4312', '4321', '4322');
--
-- UPDATE public.ecritures_comptables_v2
--   SET numero_compte = '432', nom_compte = 'Training Levy / PRGF'
-- WHERE societe_id = :societe_id AND numero_compte IN ('4323', '4324');
--
-- UPDATE public.ecritures_comptables_v2
--   SET numero_compte = '444', nom_compte = 'État — PAYE'
-- WHERE societe_id = :societe_id AND numero_compte IN ('4330', '4440');

-- ── R.2 Supprimer les pièces SAL orphelines ────────────────────────
-- (si la requête 5 montre des pièces SAL avec seulement des charges 6xxx)
-- DÉCOMMENTER APRÈS VÉRIFICATION :
-- DELETE FROM public.ecritures_comptables_v2
-- WHERE societe_id = :societe_id
--   AND ref_folio IN (
--     SELECT ref_folio FROM (
--       SELECT ref_folio,
--              BOOL_OR(numero_compte LIKE '6%') AS has_charge,
--              BOOL_OR(numero_compte LIKE '4%') AS has_dette,
--              BOOL_OR(numero_compte LIKE '5%') AS has_tresor
--       FROM public.ecritures_comptables_v2
--       WHERE societe_id = :societe_id AND journal = 'SAL'
--       GROUP BY ref_folio
--     ) x WHERE has_charge AND NOT has_dette AND NOT has_tresor
--   );
-- Ensuite : rejouer import-paie pour chaque période concernée.

-- ── R.3 Re-vérifier l'équilibre global ─────────────────────────────
-- SELECT SUM(debit_mur) - SUM(credit_mur) AS ecart_final
-- FROM public.ecritures_comptables_v2
-- WHERE societe_id = :societe_id;
