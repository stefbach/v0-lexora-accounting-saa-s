-- ============================================================================
-- Migration 138 — societes.pointage_actif + backfill soldes_conges NULL
-- ============================================================================
--
-- DEUX OBJECTIFS dans cette migration :
--
-- 1) Tracer dans le codebase la colonne `societes.pointage_actif` qui a
--    été appliquée manuellement en prod (mig "135" côté équipe métier
--    était mal alignée — le 135 du codebase est compliance_classification).
--    Le code TypeScript la lit en 6 endroits, avec fallback false si la
--    colonne manque, mais sans cette migration aucun nouveau dev ne peut
--    reproduire le schéma prod en local.
--
-- 2) Réparer les soldes_conges historiques où al_droit / sl_droit sont
--    NULL parce que l'API employes.POST n'initialisait pas les valeurs
--    avant le sprint 3. La page /rh/conges recalcule les droits à la
--    volée donc l'utilisateur ne voit pas le bug, mais les rapports SQL
--    et exports analytics qui lisent al_droit cassent.
--
-- Idempotente : ADD COLUMN IF NOT EXISTS + UPDATE filtré sur NULL.
-- ============================================================================

-- ── 1. Colonne pointage_actif sur societes ─────────────────────────────────
ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS pointage_actif BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.societes.pointage_actif IS
  'Quand TRUE: les absences sans pointage NI congé approuvé sont déduites
   du salaire net au prochain calcul de paie. Quand FALSE (défaut): le
   pointage est optionnel, aucune déduction automatique. Le toggle est
   exposé dans /rh/societe → onglet Contact → carte « Pointage obligatoire ».';

-- ── 2. Backfill des soldes_conges NULL (héritage pré-sprint 3) ──────────────
-- Calcule al_droit et sl_droit selon WRA 2019 :
--   • Mois d'ancienneté au 1er janvier de l'année du solde
--   • Si >= 12 mois → droit complet (22 AL / 15 SL)
--   • Sinon → prorata (mois × 22/12 ou × 15/12), arrondi à l'entier
-- al_pris et sl_pris passent à 0 si NULL (pas de prise enregistrée).
--
-- Le COALESCE sur al_pris / sl_pris est sûr : si la valeur existe déjà
-- (ex. employé qui a pris des congés mais qui a perdu al_droit), elle
-- est préservée.
WITH calc AS (
  SELECT
    sc.id,
    GREATEST(0,
      EXTRACT(YEAR FROM AGE(MAKE_DATE(sc.annee, 1, 1), e.date_arrivee)) * 12
      + EXTRACT(MONTH FROM AGE(MAKE_DATE(sc.annee, 1, 1), e.date_arrivee))
    )::INTEGER AS mois_anciennete
  FROM public.soldes_conges sc
  JOIN public.employes e ON e.id = sc.employe_id
  WHERE sc.al_droit IS NULL OR sc.sl_droit IS NULL
)
UPDATE public.soldes_conges sc
SET
  al_droit = COALESCE(sc.al_droit,
    CASE
      WHEN calc.mois_anciennete >= 12 THEN 22
      ELSE GREATEST(0, ROUND(calc.mois_anciennete * 22.0 / 12)::INTEGER)
    END),
  sl_droit = COALESCE(sc.sl_droit,
    CASE
      WHEN calc.mois_anciennete >= 12 THEN 15
      ELSE GREATEST(0, ROUND(calc.mois_anciennete * 15.0 / 12)::INTEGER)
    END),
  al_pris = COALESCE(sc.al_pris, 0),
  sl_pris = COALESCE(sc.sl_pris, 0)
FROM calc
WHERE sc.id = calc.id;

-- Diagnostic (commenté, à exécuter manuellement si besoin) :
--   SELECT count(*) FROM soldes_conges WHERE al_droit IS NULL;
--   → devrait retourner 0 après cette migration.
