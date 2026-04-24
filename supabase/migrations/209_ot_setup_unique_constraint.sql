-- ============================================================================
-- Migration 209 — Heures supplémentaires (OT) : index + RLS
-- ============================================================================
--
-- CONTEXTE :
-- La table `heures_travaillees` existe depuis la migration 015/017 avec la
-- contrainte UNIQUE(employe_id, date). Jusqu'ici elle était vide en prod :
-- les bulletins DDS étaient importés via Excel (source='import_excel') et
-- `heures_sup_montant` arrivait pré-calculé par le prestataire externe.
--
-- Cette migration prépare la reprise du calcul OT en interne par Lexora
-- (cadre Workers' Rights Act 2019 Mauritius : 45h/sem, +50% puis +100%) :
--   1. Index explicite (employe_id, date) pour UPSERT côté lib/rh/overtime.ts
--      (redondant avec la contrainte UNIQUE existante mais explicite pour
--      les futurs lecteurs de schéma)
--   2. Index secondaire (employe_id, date_trunc('month', date)) pour les
--      requêtes mensuelles de preview OT
--   3. RLS durcie :
--      • SELECT : tout membre de la société de l'employé (user_societes)
--      • INSERT/UPDATE/DELETE : rôles rh / manager / client_admin uniquement
--        (le rôle `admin` de profiles est réservé équipe Lexora et n'a PAS
--        vocation à saisir de l'OT côté client — il passe par les outils
--        internes)
--
-- IDEMPOTENTE. Toutes les policies utilisent DROP IF EXISTS + CREATE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Index (employe_id, date) — explicite pour UPSERT
-- ----------------------------------------------------------------------------
-- Note : la contrainte UNIQUE(employe_id, date) existe déjà (migration 017),
-- donc un index unique implicite est présent. On en ajoute un nommé pour
-- lisibilité du schéma et pour que les outils (pg_stat_user_indexes) le
-- repèrent sous un nom explicite.
CREATE UNIQUE INDEX IF NOT EXISTS idx_heures_travaillees_employe_date
  ON public.heures_travaillees (employe_id, date);

-- ----------------------------------------------------------------------------
-- 2. Index pour requêtes mensuelles (preview OT)
-- ----------------------------------------------------------------------------
-- Utilisé par previewOvertimeMois() qui filtre par mois civil.
CREATE INDEX IF NOT EXISTS idx_heures_travaillees_employe_periode
  ON public.heures_travaillees (employe_id, date_trunc('month', date));

-- ----------------------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------------------
-- RLS déjà activée en 015/017 — idempotent.
ALTER TABLE public.heures_travaillees ENABLE ROW LEVEL SECURITY;

-- Policy lecture : tout membre de la société de l'employé (table user_societes)
DROP POLICY IF EXISTS "heures_travaillees_select_same_societe" ON public.heures_travaillees;
CREATE POLICY "heures_travaillees_select_same_societe"
  ON public.heures_travaillees
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.employes e
      JOIN public.user_societes us ON us.societe_id = e.societe_id
      WHERE e.id = heures_travaillees.employe_id
        AND us.user_id = auth.uid()
    )
  );

-- Policy écriture (INSERT / UPDATE / DELETE) : rôles rh / manager / client_admin
-- IMPORTANT : FOR ALL exige WITH CHECK pour couvrir les INSERT (sinon rejeté).
-- USING est évalué sur les lignes EXISTANTES (UPDATE/DELETE), WITH CHECK sur
-- les lignes NOUVELLES/MODIFIÉES (INSERT/UPDATE). On applique la même règle
-- côté lecture de l'autorisation : l'employé cible doit appartenir à une
-- société dont l'utilisateur est membre avec un rôle autorisé.
DROP POLICY IF EXISTS "heures_travaillees_write_rh_manager_dirigeant" ON public.heures_travaillees;
CREATE POLICY "heures_travaillees_write_rh_manager_dirigeant"
  ON public.heures_travaillees
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.employes e
      JOIN public.user_societes us ON us.societe_id = e.societe_id
      WHERE e.id = heures_travaillees.employe_id
        AND us.user_id = auth.uid()
        AND us.role IN ('rh', 'manager', 'client_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.employes e
      JOIN public.user_societes us ON us.societe_id = e.societe_id
      WHERE e.id = heures_travaillees.employe_id
        AND us.user_id = auth.uid()
        AND us.role IN ('rh', 'manager', 'client_admin')
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Reload PostgREST schema cache (Supabase)
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
