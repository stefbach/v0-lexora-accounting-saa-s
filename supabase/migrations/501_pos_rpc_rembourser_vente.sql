-- =====================================================================
-- Migration 501 — RPC POS : rembourser_vente_pos (remboursement / annulation)
-- =====================================================================
-- Contrepartie de valider_vente_pos (mig 486). Rembourse ou annule un ticket
-- VALIDÉ de façon ATOMIQUE : ré-entrée du stock (mouvements `retour_client`,
-- sens E, au CUMP capturé sur la ligne) via la RPC appliquer_mouvement_stock
-- (mig 482), puis bascule du statut. Renvoie les mouvements créés pour que la
-- couche Node poste la contrepassation comptable (COGS inversé + encaissement
-- inversé), même architecture que la vente.
--
-- Statuts : 'remboursee' (retour marchandise + argent) ou 'annulee' (erreur de
-- caisse). Idempotence côté écritures par ref_folio POS-<id>-REMB.
-- SECURITY INVOKER ; RLS SEC-003 couvre l'accès direct. CREATE OR REPLACE.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.rembourser_vente_pos(
  p_societe_id UUID,
  p_vente_id   UUID,
  p_statut     TEXT DEFAULT 'remboursee',
  p_date       DATE DEFAULT NULL,
  p_cree_par   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_vente      public.ventes_pos%ROWTYPE;
  v_ligne      public.lignes_vente_pos%ROWTYPE;
  v_produit    public.produits%ROWTYPE;
  v_mvt        JSONB;
  v_mouvements JSONB := '[]'::jsonb;
  v_date       DATE;
BEGIN
  IF p_statut NOT IN ('remboursee', 'annulee') THEN
    RAISE EXCEPTION 'STATUT_INVALIDE: % (attendu remboursee|annulee)', p_statut;
  END IF;

  SELECT * INTO v_vente
  FROM public.ventes_pos
  WHERE id = p_vente_id AND societe_id = p_societe_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VENTE_INTROUVABLE: % pour la société %', p_vente_id, p_societe_id;
  END IF;
  IF v_vente.statut <> 'validee' THEN
    RAISE EXCEPTION 'VENTE_NON_REMBOURSABLE: le ticket est déjà en statut %', v_vente.statut;
  END IF;

  v_date := COALESCE(p_date, CURRENT_DATE);

  -- Ré-entrée de stock par ligne (retour_client, au CUMP capturé à la vente).
  FOR v_ligne IN
    SELECT * FROM public.lignes_vente_pos
    WHERE vente_pos_id = p_vente_id AND societe_id = p_societe_id
  LOOP
    SELECT * INTO v_produit
    FROM public.produits
    WHERE id = v_ligne.produit_id AND societe_id = p_societe_id;

    IF FOUND AND v_produit.gere_en_stock THEN
      v_mvt := public.appliquer_mouvement_stock(
        p_societe_id     := p_societe_id,
        p_produit_id     := v_ligne.produit_id,
        p_depot_id       := v_vente.depot_id,
        p_type_mouvement := 'retour_client',
        p_quantite       := v_ligne.quantite,
        p_cout_unitaire  := COALESCE(v_ligne.cout_unitaire_cump, 0),
        p_date_mouvement := v_date,
        p_motif          := 'Remboursement POS ' || v_vente.numero_ticket,
        p_reference_type := 'vente_pos',
        p_reference_id   := p_vente_id,
        p_cree_par       := p_cree_par
      );
      v_mouvements := v_mouvements || jsonb_build_array(
        v_mvt || jsonb_build_object('produit_id', v_ligne.produit_id));
    END IF;
  END LOOP;

  UPDATE public.ventes_pos SET statut = p_statut WHERE id = p_vente_id;

  RETURN jsonb_build_object(
    'vente_id',      p_vente_id,
    'numero_ticket', v_vente.numero_ticket,
    'statut',        p_statut,
    'date',          v_date,
    'mouvements',    v_mouvements
  );
END $$;

GRANT EXECUTE ON FUNCTION public.rembourser_vente_pos(UUID, UUID, TEXT, DATE, UUID)
  TO authenticated, service_role;
