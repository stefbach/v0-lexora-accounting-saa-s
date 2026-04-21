-- ============================================================
-- Migration 153 — F4 : resynchroniser soldes_conges avec la réalité
--                      des demandes_conges approuvées pour 2026.
--
-- CONTEXTE :
--   F3 a créé le helper canonique recomputeSoldeCongesAll() qui utilise
--   une recompute SUM-based idempotente. Cette migration rejoue cette
--   logique CÔTÉ SQL pour corriger les 4 employés dont soldes_conges
--   avait dérivé historiquement (sur-comptages et sous-comptages) :
--
--     CHINAN Gavena   (DDS) : sl_pris 0  → 2   (sous-compte)
--     GROODOYAL Aditya (OCC) : al_pris 5  → 4   (sur-compte)
--     QUENETTE Mégane  (OCC) : al_pris 4  → 2   (sur-compte)
--                               sl_pris 2  → 1.5 (sur-compte)
--     DESIRE Marie Alicia (OCC) : sl_pris 2 → 3  (sous-compte)
--
-- RÈGLES (alignées avec lib/rh/soldes-conges.ts) :
--   - AL : demandes type='AL' approuvées en 2026
--        + UL auto-basculés depuis un AL (motif contient
--          '[Auto-bascule UL]' SANS mention "Sick Leave")
--   - SL : demandes type='SL' approuvées en 2026
--   - al_solde, sl_solde : GENERATED ALWAYS → ne pas écrire
--
-- Idempotente : UPSERT ON CONFLICT (employe_id, annee). Ré-exécuter
-- cette migration donne exactement le même résultat. Crée les rows
-- soldes_conges manquantes (al_droit=22, sl_droit=15 par défaut WRA).
-- ============================================================

WITH approved_2026 AS (
  SELECT
    dc.employe_id,
    dc.nb_jours,
    dc.impose_par_societe,
    -- Classification canonique : AL pur OU UL bascule-from-AL
    CASE
      WHEN dc.type_conge = 'AL' THEN 'AL'
      WHEN dc.type_conge = 'UL'
        AND dc.motif ILIKE '%[Auto-bascule UL]%'
        AND dc.motif !~* 'Sick\s+Leave'
        THEN 'AL'
      WHEN dc.type_conge = 'SL' THEN 'SL'
      ELSE dc.type_conge
    END AS type_canonique
  FROM public.demandes_conges dc
  WHERE dc.statut = 'approuve'
    AND EXTRACT(YEAR FROM dc.date_debut) = 2026
),
sums AS (
  SELECT
    employe_id,
    COALESCE(SUM(CASE WHEN type_canonique = 'AL' THEN nb_jours ELSE 0 END), 0)::numeric AS al_pris,
    COALESCE(SUM(CASE WHEN type_canonique = 'AL' AND impose_par_societe IS TRUE THEN nb_jours ELSE 0 END), 0)::numeric AS al_impose_societe,
    COALESCE(SUM(CASE WHEN type_canonique = 'AL' AND COALESCE(impose_par_societe, FALSE) = FALSE THEN nb_jours ELSE 0 END), 0)::numeric AS al_impose_employe,
    COALESCE(SUM(CASE WHEN type_canonique = 'SL' THEN nb_jours ELSE 0 END), 0)::numeric AS sl_pris
  FROM approved_2026
  GROUP BY employe_id
)
INSERT INTO public.soldes_conges (
  employe_id, annee,
  al_droit, al_pris, al_impose_societe, al_impose_employe,
  sl_droit, sl_pris,
  updated_at
)
SELECT
  s.employe_id, 2026,
  22, s.al_pris, s.al_impose_societe, s.al_impose_employe,
  15, s.sl_pris,
  NOW()
FROM sums s
ON CONFLICT (employe_id, annee) DO UPDATE SET
  al_pris = EXCLUDED.al_pris,
  al_impose_societe = EXCLUDED.al_impose_societe,
  al_impose_employe = EXCLUDED.al_impose_employe,
  sl_pris = EXCLUDED.sl_pris,
  updated_at = NOW();
