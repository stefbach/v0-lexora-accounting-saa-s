-- ============================================================
-- Migration 109: Fix — reset potentiellement mauvais auth_user_id
-- ============================================================
-- Si la migration 108 a lié le mauvais employé, on reset les doublons.
-- Un auth_user_id ne doit être attribué qu'à UN SEUL employé.

-- 1. Détecter les doublons (même auth_user_id sur plusieurs employés)
-- et garder seulement le premier par date d'arrivée
WITH duplicates AS (
  SELECT id, auth_user_id,
    ROW_NUMBER() OVER (PARTITION BY auth_user_id ORDER BY date_arrivee DESC) as rn
  FROM public.employes
  WHERE auth_user_id IS NOT NULL
    AND date_depart IS NULL
)
UPDATE public.employes e
SET auth_user_id = NULL
FROM duplicates d
WHERE e.id = d.id AND d.rn > 1;

-- 2. Vérifier que chaque auth_user_id existe réellement dans auth.users
-- Si un auth_user_id pointe vers un user supprimé, le reset
UPDATE public.employes e
SET auth_user_id = NULL
WHERE e.auth_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = e.auth_user_id);

-- 3. Re-synchroniser profiles.employe_id depuis les liens valides
UPDATE public.profiles p
SET employe_id = e.id
FROM public.employes e
WHERE e.auth_user_id = p.id
  AND e.date_depart IS NULL
  AND (p.employe_id IS NULL OR p.employe_id != e.id);

-- 4. Nettoyer profiles.employe_id qui pointent vers des employés partis
UPDATE public.profiles p
SET employe_id = NULL
WHERE p.employe_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.employes e
    WHERE e.id = p.employe_id AND e.date_depart IS NULL
  );
