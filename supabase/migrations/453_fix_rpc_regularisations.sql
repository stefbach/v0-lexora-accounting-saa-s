-- =============================================================================
-- Migration 453 — Fix RPC régularisations TVA (point mort sur sociétés client_id NULL)
-- =============================================================================
-- BUG (mig 452) : replace_tva_regularisations() écrivait le total dans
--   tva_mensuelle (colonne regularisation_anterieure) via un INSERT ... ON CONFLICT.
--   Or tva_mensuelle a des contraintes HÉRITÉES :
--     - client_id NOT NULL
--     - societe   NOT NULL CHECK (societe IN ('TIBOK','BPO','OBESITY_CARE','NHS_S2'))
--   Pour les sociétés dont societes.client_id est NULL (ex. Digital Data Solutions —
--   cf. mig 451), l'INSERT viole client_id NOT NULL → la fonction LÈVE une exception →
--   toute la transaction est annulée → le total n'est jamais branché sur la déclaration.
--   Symptôme utilisateur : régularisation « au point mort », rien ne s'affiche sur mai.
--
-- CORRECTIF : la fonction ne touche PLUS à tva_mensuelle. Elle se limite à remplacer
--   atomiquement le jeu de lignes (tva_regularisations, sans contrainte bloquante) et
--   à renvoyer le total. Le calcul TVA (/api/comptable/tva/calculer) SOMME désormais
--   directement les lignes incluses de tva_regularisations (source de vérité) pour
--   alimenter total_a_payer — plus de dépendance à une écriture fragile.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.replace_tva_regularisations(
  p_societe uuid,
  p_client  uuid,
  p_periode text,
  p_user    uuid,
  p_lignes  jsonb
) RETURNS numeric
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_total numeric := 0;
BEGIN
  IF p_periode !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'periode invalide (attendu YYYY-MM): %', p_periode;
  END IF;

  -- Remplace l'intégralité du jeu pour (société, période courante)
  DELETE FROM public.tva_regularisations
   WHERE societe_id = p_societe AND periode_courante = p_periode;

  INSERT INTO public.tva_regularisations
    (societe_id, client_id, periode_courante, periode_origine, libelle,
     montant, sens, type, facture_id, motif, statut, created_by)
  SELECT
    p_societe, p_client, p_periode,
    NULLIF(l->>'periode_origine', ''),
    l->>'libelle',
    COALESCE((l->>'montant')::numeric, 0),
    COALESCE(NULLIF(l->>'sens', ''), 'net'),
    COALESCE(NULLIF(l->>'type', ''), 'manuel'),
    NULLIF(l->>'facture_id', '')::uuid,
    NULLIF(l->>'motif', ''),
    COALESCE(NULLIF(l->>'statut', ''), 'incluse'),
    p_user
  FROM jsonb_array_elements(COALESCE(p_lignes, '[]'::jsonb)) AS l
  WHERE COALESCE(btrim(l->>'libelle'), '') <> '';

  SELECT COALESCE(SUM(montant), 0) INTO v_total
  FROM public.tva_regularisations
  WHERE societe_id = p_societe AND periode_courante = p_periode AND statut = 'incluse';

  RETURN round(v_total, 2);
END $fn$;

GRANT EXECUTE ON FUNCTION public.replace_tva_regularisations(uuid, uuid, text, uuid, jsonb) TO authenticated;
