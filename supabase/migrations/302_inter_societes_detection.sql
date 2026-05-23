-- ============================================================================
-- Migration 302 — Détection inter-sociétés pour le rapprochement bancaire
-- ============================================================================
-- CONTEXTE :
--   Les migrations 291/292/293 ont corrigé À POSTERIORI les virements
--   inter-sociétés mal classés (DR 5800 / CR 512 sans contrepartie). Cette
--   migration met en place l'infrastructure pour détecter ces virements
--   AU MOMENT DU RAPPROCHEMENT et créer directement DR 451 / CR 512 + le
--   miroir DR 512 / CR 451 dans la société destinataire.
--
-- CHANGEMENTS :
--   1. Ajouter `groupe_id` sur `societes` pour grouper les sociétés liées
--      (même actionnaire). NULL = société indépendante (pas dans un groupe).
--   2. Backfill : pour les sociétés du même `client_id`, on attribue un
--      `groupe_id` partagé (cohérence avec l'historique existant).
--   3. Vue `societes_du_meme_groupe` : pour une société donnée, liste les
--      autres sociétés du même groupe (utilisée par le helper TS).
--   4. RPC `get_societes_groupe(p_societe_id uuid)` : alternative SQL pure
--      au helper TS, accessible via supabase.rpc().
-- ============================================================================

BEGIN;

-- 1. Colonne `groupe_id` sur societes ------------------------------------------------------
-- NULL = société isolée. Plusieurs sociétés avec le même `groupe_id` =
-- même actionnaire / groupe (au sens IAS 24 "related parties").
ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS groupe_id UUID;

CREATE INDEX IF NOT EXISTS idx_societes_groupe_id
  ON public.societes(groupe_id)
  WHERE groupe_id IS NOT NULL;

COMMENT ON COLUMN public.societes.groupe_id IS
  'UUID groupant plusieurs sociétés du même actionnaire (IAS 24 related parties). '
  'NULL = société isolée. Utilisé par le rapprochement bancaire pour détecter '
  'les virements inter-sociétés et router vers compte 451 (Comptes courants Groupe) '
  'au lieu de 5800 (Transit).';

-- 2. Backfill : groupes implicites par client_id -------------------------------------------
-- Quand plusieurs sociétés partagent le même client_id, on crée un groupe_id
-- partagé. Idempotent : ne touche pas les lignes qui ont déjà un groupe_id.
WITH groupes_implicites AS (
  SELECT
    client_id,
    gen_random_uuid() AS new_groupe_id
  FROM public.societes
  WHERE client_id IS NOT NULL
    AND groupe_id IS NULL
  GROUP BY client_id
  HAVING COUNT(*) >= 2  -- au moins 2 sociétés pour former un groupe
)
UPDATE public.societes s
SET groupe_id = gi.new_groupe_id
FROM groupes_implicites gi
WHERE s.client_id = gi.client_id
  AND s.groupe_id IS NULL;

-- 3. Vue : sociétés du même groupe ---------------------------------------------------------
-- Permet d'écrire : SELECT * FROM societes_du_meme_groupe WHERE societe_source_id = '<id>';
-- Renvoie les AUTRES sociétés du groupe (exclut la source).
CREATE OR REPLACE VIEW public.societes_du_meme_groupe AS
SELECT
  src.id        AS societe_source_id,
  src.nom       AS societe_source_nom,
  tgt.id        AS societe_dest_id,
  tgt.nom       AS societe_dest_nom,
  tgt.groupe_id AS groupe_id,
  tgt.client_id AS client_id
FROM public.societes src
JOIN public.societes tgt ON (
  -- Priorité 1 : même groupe_id (explicite)
  (src.groupe_id IS NOT NULL AND tgt.groupe_id = src.groupe_id)
  OR
  -- Priorité 2 : fallback même client_id (legacy)
  (src.groupe_id IS NULL AND tgt.groupe_id IS NULL
   AND src.client_id IS NOT NULL AND tgt.client_id = src.client_id)
)
WHERE tgt.id <> src.id;

COMMENT ON VIEW public.societes_du_meme_groupe IS
  'Vue helper pour le rapprochement bancaire inter-sociétés. Pour une société '
  'source, liste les autres sociétés du même groupe (par groupe_id ou client_id). '
  'Cf migration 302 + lib/comptable/inter-societes.ts.';

-- 4. RPC : get_societes_groupe(p_societe_id) -----------------------------------------------
-- Alternative SQL pure au helper TS resolveInterSocieteForTransaction().
-- Renvoie un tableau d'objets {id, nom} consommable côté client.
CREATE OR REPLACE FUNCTION public.get_societes_groupe(p_societe_id UUID)
RETURNS TABLE (
  id UUID,
  nom TEXT,
  groupe_id UUID,
  client_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.societe_dest_id  AS id,
    v.societe_dest_nom AS nom,
    v.groupe_id,
    v.client_id
  FROM public.societes_du_meme_groupe v
  WHERE v.societe_source_id = p_societe_id;
$$;

COMMENT ON FUNCTION public.get_societes_groupe(UUID) IS
  'Renvoie les autres sociétés du même groupe que p_societe_id. '
  'Utilisé par le rapprochement bancaire inter-sociétés (route.ts).';

-- 5. Permissions ---------------------------------------------------------------------------
GRANT SELECT ON public.societes_du_meme_groupe TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_societes_groupe(UUID) TO authenticated, anon;

-- ── VÉRIFICATION ─────────────────────────────────────────────────────────────────────────
-- Combien de sociétés dans un groupe ?
SELECT
  COUNT(*) FILTER (WHERE groupe_id IS NOT NULL) AS nb_societes_dans_un_groupe,
  COUNT(DISTINCT groupe_id) FILTER (WHERE groupe_id IS NOT NULL) AS nb_groupes,
  COUNT(*) FILTER (WHERE groupe_id IS NULL) AS nb_societes_isolees
FROM public.societes;

-- Pour debug : afficher les groupes les plus grands
-- SELECT groupe_id, COUNT(*) AS nb_societes, array_agg(nom) AS societes
-- FROM public.societes
-- WHERE groupe_id IS NOT NULL
-- GROUP BY groupe_id
-- ORDER BY nb_societes DESC
-- LIMIT 10;

COMMIT;

-- ============================================================================
-- ROLLBACK (à exécuter manuellement si la migration cause un problème) :
--   DROP FUNCTION IF EXISTS public.get_societes_groupe(UUID);
--   DROP VIEW IF EXISTS public.societes_du_meme_groupe;
--   ALTER TABLE public.societes DROP COLUMN IF EXISTS groupe_id;
-- ============================================================================
