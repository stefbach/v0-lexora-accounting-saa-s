-- =====================================================================
-- Migration 482 — RPC atomique appliquer_mouvement_stock
-- =====================================================================
-- Réf. spec : docs/roadmap/inventaire-pos.md §1.2 / §1.6.
--
-- SEULE porte d'écriture de stock_niveaux et de produits.cout_unitaire_moyen :
--   • verrou pessimiste (FOR UPDATE) sur la ligne produit — sérialise les
--     mouvements concurrents (vente + réception simultanées) ;
--   • CUMP recalculé en NUMERIC strict (jamais de float) sur les entrées,
--     figé sur les sorties (COGS au CUMP courant) ;
--   • stock négatif interdit (STOCK_INSUFFISANT) ;
--   • extension R5 : refus de tout mouvement daté dans une période
--     comptable verrouillée (accounting_periods.status = 'locked').
--
-- SECURITY INVOKER : appelée par l'API avec le client service-role après
-- assertSocieteAccess ; un appel client direct reste couvert par les
-- policies RLS SEC-003 de la migration 481.
-- Idempotente (CREATE OR REPLACE).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.appliquer_mouvement_stock(
  p_societe_id     UUID,
  p_produit_id     UUID,
  p_depot_id       UUID,
  p_type_mouvement TEXT,
  p_quantite       NUMERIC,
  p_cout_unitaire  NUMERIC DEFAULT NULL,   -- requis pour entree_achat ; sinon CUMP courant
  p_date_mouvement DATE    DEFAULT CURRENT_DATE,
  p_motif          TEXT    DEFAULT NULL,
  p_reference_type TEXT    DEFAULT 'manuel',
  p_reference_id   UUID    DEFAULT NULL,
  p_cree_par       UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_produit       public.produits%ROWTYPE;
  v_niveau        public.stock_niveaux%ROWTYPE;
  v_dossier_id    UUID;
  v_sens          CHAR(1);
  v_qte_totale    NUMERIC(15,3);
  v_cout          NUMERIC(15,4);
  v_nouveau_cump  NUMERIC(15,4);
  v_nouvelle_qte  NUMERIC(15,3);
  v_valeur        NUMERIC(15,2);
  v_mouvement_id  UUID;
BEGIN
  IF p_quantite IS NULL OR p_quantite <= 0 THEN
    RAISE EXCEPTION 'QUANTITE_INVALIDE: la quantité doit être strictement positive';
  END IF;

  v_sens := CASE p_type_mouvement
    WHEN 'entree_achat'                THEN 'E'
    WHEN 'retour_client'               THEN 'E'
    WHEN 'ajustement_inventaire_plus'  THEN 'E'
    WHEN 'transfert_entree'            THEN 'E'
    WHEN 'sortie_vente'                THEN 'S'
    WHEN 'retour_fournisseur'          THEN 'S'
    WHEN 'ajustement_inventaire_moins' THEN 'S'
    WHEN 'transfert_sortie'            THEN 'S'
    WHEN 'perte_casse'                 THEN 'S'
    ELSE NULL
  END;
  IF v_sens IS NULL THEN
    RAISE EXCEPTION 'TYPE_MOUVEMENT_INVALIDE: %', p_type_mouvement;
  END IF;

  -- Extension R5 — période comptable verrouillée
  IF EXISTS (
    SELECT 1 FROM public.accounting_periods
    WHERE societe_id = p_societe_id
      AND status = 'locked'
      AND period_start <= p_date_mouvement
      AND period_end   >= p_date_mouvement
  ) THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: mouvement du % dans une période comptable clôturée', p_date_mouvement;
  END IF;

  -- Verrou de sérialisation : la ligne produit
  SELECT * INTO v_produit
  FROM public.produits
  WHERE id = p_produit_id AND societe_id = p_societe_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUIT_INTROUVABLE: % pour la société %', p_produit_id, p_societe_id;
  END IF;
  IF NOT v_produit.gere_en_stock THEN
    RAISE EXCEPTION 'PRODUIT_NON_STOCKE: % n''est pas géré en stock', v_produit.sku;
  END IF;

  PERFORM 1 FROM public.depots WHERE id = p_depot_id AND societe_id = p_societe_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'DEPOT_INTROUVABLE: % pour la société %', p_depot_id, p_societe_id;
  END IF;

  INSERT INTO public.stock_niveaux (societe_id, produit_id, depot_id, quantite, valeur_stock)
  VALUES (p_societe_id, p_produit_id, p_depot_id, 0, 0)
  ON CONFLICT (produit_id, depot_id) DO NOTHING;

  SELECT * INTO v_niveau
  FROM public.stock_niveaux
  WHERE produit_id = p_produit_id AND depot_id = p_depot_id
  FOR UPDATE;

  IF v_sens = 'E' THEN
    IF p_type_mouvement = 'entree_achat' AND p_cout_unitaire IS NULL THEN
      RAISE EXCEPTION 'COUT_REQUIS: une entrée d''achat exige le coût unitaire réel';
    END IF;
    v_cout := COALESCE(p_cout_unitaire, v_produit.cout_unitaire_moyen, 0);
    IF v_cout < 0 THEN
      RAISE EXCEPTION 'COUT_INVALIDE: le coût unitaire ne peut pas être négatif';
    END IF;
    -- CUMP pondéré sur le stock TOTAL du produit (tous dépôts)
    SELECT COALESCE(SUM(quantite), 0) INTO v_qte_totale
    FROM public.stock_niveaux WHERE produit_id = p_produit_id;
    IF v_qte_totale <= 0 THEN
      v_nouveau_cump := v_cout;
    ELSE
      v_nouveau_cump := ROUND(
        (v_qte_totale * COALESCE(v_produit.cout_unitaire_moyen, 0) + p_quantite * v_cout)
        / (v_qte_totale + p_quantite), 4);
    END IF;
    v_nouvelle_qte := v_niveau.quantite + p_quantite;
  ELSE
    IF v_niveau.quantite < p_quantite THEN
      RAISE EXCEPTION 'STOCK_INSUFFISANT: % disponible(s) au dépôt, % demandé(s)',
        v_niveau.quantite, p_quantite;
    END IF;
    -- Sortie valorisée au CUMP courant ; le CUMP ne change pas en sortie.
    v_cout := COALESCE(v_produit.cout_unitaire_moyen, 0);
    v_nouveau_cump := v_cout;
    v_nouvelle_qte := v_niveau.quantite - p_quantite;
  END IF;

  v_valeur := ROUND(p_quantite * v_cout, 2);

  SELECT id INTO v_dossier_id
  FROM public.dossiers WHERE societe_id = p_societe_id LIMIT 1;

  INSERT INTO public.mouvements_stock (
    societe_id, dossier_id, produit_id, depot_id, type_mouvement, sens,
    quantite, cout_unitaire, valeur_mouvement,
    reference_type, reference_id, date_mouvement, motif, cree_par
  ) VALUES (
    p_societe_id, v_dossier_id, p_produit_id, p_depot_id, p_type_mouvement, v_sens,
    p_quantite, v_cout, v_valeur,
    COALESCE(p_reference_type, 'manuel'), p_reference_id, p_date_mouvement, p_motif, p_cree_par
  ) RETURNING id INTO v_mouvement_id;

  UPDATE public.stock_niveaux
  SET quantite     = v_nouvelle_qte,
      valeur_stock = ROUND(v_nouvelle_qte * v_nouveau_cump, 2),
      updated_at   = now()
  WHERE id = v_niveau.id;

  IF v_sens = 'E' THEN
    UPDATE public.produits
    SET cout_unitaire_moyen = v_nouveau_cump, updated_at = now()
    WHERE id = p_produit_id;
  END IF;

  RETURN jsonb_build_object(
    'mouvement_id',        v_mouvement_id,
    'sens',                v_sens,
    'quantite',            p_quantite,
    'cout_unitaire',       v_cout,
    'valeur_mouvement',    v_valeur,
    'quantite_apres',      v_nouvelle_qte,
    'cout_unitaire_moyen', v_nouveau_cump
  );
END $$;
