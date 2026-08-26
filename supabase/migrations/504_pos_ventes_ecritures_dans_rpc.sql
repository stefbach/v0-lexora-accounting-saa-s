-- =====================================================================
-- Migration 504 — Fiabilité POS : écritures comptables DANS la RPC de vente
-- =====================================================================
-- Avant : valider_vente_pos posait ticket + lignes + paiements + stock de façon
-- atomique, mais l'ENCAISSEMENT et le COGS étaient postés côté Node APRÈS le
-- commit → une panne entre les deux laissait une vente sans écriture.
--
-- Après : l'encaissement (journal POS, POS-<vente_id>) et le COGS (journal OD,
-- STK-<mouvement_id>, D variation / C stock au CUMP) sont insérés DANS la même
-- transaction. Plus aucune vente sans écriture. Garde-fou : Σ débit = Σ crédit
-- de l'encaissement vérifié avant retour (sinon rollback). Idempotence conservée
-- par ref_folio → la couche Node peut continuer à appeler ses helpers sans
-- double-poster (ils détectent le ref_folio déjà présent).
--
-- Miroir SQL de lib/pos/ecritures.ts (buildEcrituresVentePos) et
-- lib/inventaire/ecritures.ts (sortie_vente : D 6037 / C 3701).
-- =====================================================================

-- Helper : libellé PCM d'un compte (template global), repli « Compte <n> ».
CREATE OR REPLACE FUNCTION public._pcm_nom(p_compte text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT libelle FROM public.plan_comptable WHERE compte = p_compte AND societe_id IS NULL LIMIT 1),
    'Compte ' || p_compte)
$$;

CREATE OR REPLACE FUNCTION public.valider_vente_pos(
  p_societe_id UUID,
  p_session_id UUID,
  p_lignes     JSONB,
  p_paiements  JSONB,
  p_client_id  UUID DEFAULT NULL,
  p_date_vente TIMESTAMPTZ DEFAULT now(),
  p_cree_par   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_session      public.sessions_caisse%ROWTYPE;
  v_produit      public.produits%ROWTYPE;
  v_ligne        JSONB;
  v_paiement     JSONB;
  v_vente_id     UUID;
  v_numero       TEXT;
  v_seq          INTEGER;
  v_qte          NUMERIC(15,3);
  v_prix         NUMERIC(15,2);
  v_remise       NUMERIC(5,2);
  v_taux         NUMERIC(5,2);
  v_ht           NUMERIC(15,2);
  v_tva          NUMERIC(15,2);
  v_ttc          NUMERIC(15,2);
  v_total_ht     NUMERIC(15,2) := 0;
  v_total_tva    NUMERIC(15,2) := 0;
  v_total_ttc    NUMERIC(15,2) := 0;
  v_total_paye   NUMERIC(15,2) := 0;
  v_montant      NUMERIC(15,2);
  v_moyen        TEXT;
  v_compte       VARCHAR(10);
  v_ligne_id     UUID;
  v_mvt          JSONB;
  v_mouvements   JSONB := '[]'::jsonb;
  v_dossier_id   UUID;
  v_date         DATE := p_date_vente::date;
  v_exercice     TEXT := to_char(p_date_vente, 'YYYY');
  v_debit_moyen  JSONB := '{}'::jsonb;
  v_credit_vente JSONB := '{}'::jsonb;
  v_cogs_valeur  NUMERIC(15,2);
  v_cs           VARCHAR(10);
  v_cv           VARCHAR(10);
  v_key          TEXT;
  v_val          TEXT;
  v_sum_d        NUMERIC(15,2) := 0;
  v_sum_c        NUMERIC(15,2) := 0;
BEGIN
  IF p_lignes IS NULL OR jsonb_array_length(p_lignes) = 0 THEN
    RAISE EXCEPTION 'TICKET_VIDE: au moins une ligne est requise';
  END IF;
  IF p_paiements IS NULL OR jsonb_array_length(p_paiements) = 0 THEN
    RAISE EXCEPTION 'PAIEMENT_REQUIS: au moins un paiement est requis';
  END IF;

  SELECT * INTO v_session
  FROM public.sessions_caisse
  WHERE id = p_session_id AND societe_id = p_societe_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_INTROUVABLE: % pour la société %', p_session_id, p_societe_id;
  END IF;
  IF v_session.statut <> 'ouverte' THEN
    RAISE EXCEPTION 'SESSION_FERMEE: la session de caisse est fermée';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_societe_id::text || ':pos_ticket'));
  SELECT COUNT(*) + 1 INTO v_seq
  FROM public.ventes_pos
  WHERE societe_id = p_societe_id AND date_vente::date = p_date_vente::date;
  v_numero := 'TCK-' || to_char(p_date_vente, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO public.ventes_pos (
    societe_id, session_caisse_id, depot_id, numero_ticket, client_id,
    date_vente, montant_ht, montant_tva, montant_ttc, statut, cree_par
  ) VALUES (
    p_societe_id, p_session_id, v_session.depot_id, v_numero, p_client_id,
    p_date_vente, 0, 0, 0, 'validee', p_cree_par
  ) RETURNING id INTO v_vente_id;

  SELECT id INTO v_dossier_id FROM public.dossiers WHERE societe_id = p_societe_id LIMIT 1;

  FOR v_ligne IN SELECT * FROM jsonb_array_elements(p_lignes) LOOP
    SELECT * INTO v_produit
    FROM public.produits
    WHERE id = (v_ligne->>'produit_id')::uuid AND societe_id = p_societe_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUIT_INTROUVABLE: % pour la société %', v_ligne->>'produit_id', p_societe_id;
    END IF;
    IF NOT v_produit.actif THEN
      RAISE EXCEPTION 'PRODUIT_INACTIF: % n''est plus vendable', v_produit.sku;
    END IF;

    v_qte := (v_ligne->>'quantite')::numeric;
    IF v_qte IS NULL OR v_qte <= 0 THEN
      RAISE EXCEPTION 'QUANTITE_INVALIDE: la quantité doit être strictement positive';
    END IF;
    v_prix   := COALESCE((v_ligne->>'prix_unitaire_ht')::numeric, v_produit.prix_vente_ht);
    v_remise := COALESCE((v_ligne->>'remise_pct')::numeric, 0);
    v_taux   := COALESCE((v_ligne->>'taux_tva')::numeric, v_produit.taux_tva);
    IF v_prix < 0 OR v_remise < 0 OR v_remise > 100 OR v_taux < 0 THEN
      RAISE EXCEPTION 'LIGNE_INVALIDE: prix/remise/TVA hors bornes pour %', v_produit.sku;
    END IF;

    v_ht  := ROUND(v_qte * v_prix * (1 - v_remise / 100), 2);
    v_tva := ROUND(v_ht * v_taux / 100, 2);
    v_ttc := v_ht + v_tva;

    INSERT INTO public.lignes_vente_pos (
      societe_id, vente_pos_id, produit_id, quantite, prix_unitaire_ht,
      remise_pct, taux_tva, montant_ht, montant_tva, montant_ttc
    ) VALUES (
      p_societe_id, v_vente_id, v_produit.id, v_qte, v_prix,
      v_remise, v_taux, v_ht, v_tva, v_ttc
    ) RETURNING id INTO v_ligne_id;

    v_cv := COALESCE(NULLIF(v_produit.compte_vente, ''), '701');
    v_credit_vente := v_credit_vente || jsonb_build_object(
      v_cv, ROUND(COALESCE((v_credit_vente->>v_cv)::numeric, 0) + v_ht, 2));

    IF v_produit.gere_en_stock THEN
      v_mvt := public.appliquer_mouvement_stock(
        p_societe_id     := p_societe_id,
        p_produit_id     := v_produit.id,
        p_depot_id       := v_session.depot_id,
        p_type_mouvement := 'sortie_vente',
        p_quantite       := v_qte,
        p_cout_unitaire  := NULL,
        p_date_mouvement := p_date_vente::date,
        p_motif          := 'Vente POS ' || v_numero,
        p_reference_type := 'vente_pos',
        p_reference_id   := v_vente_id,
        p_cree_par       := p_cree_par
      );
      UPDATE public.lignes_vente_pos
      SET cout_unitaire_cump = (v_mvt->>'cout_unitaire')::numeric,
          mouvement_stock_id = (v_mvt->>'mouvement_id')::uuid
      WHERE id = v_ligne_id;
      v_mouvements := v_mouvements || jsonb_build_array(
        v_mvt || jsonb_build_object('produit_id', v_produit.id, 'ligne_id', v_ligne_id));

      v_cogs_valeur := ROUND((v_mvt->>'valeur_mouvement')::numeric, 2);
      IF v_cogs_valeur > 0 THEN
        v_cs := COALESCE(NULLIF(v_produit.compte_stock, ''), '3701');
        v_cv := COALESCE(NULLIF(v_produit.compte_variation_stock, ''), '6037');
        INSERT INTO public.ecritures_comptables_v2
          (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
        VALUES
          (p_societe_id, v_dossier_id, v_date, 'OD', 'STK-' || (v_mvt->>'mouvement_id'),
           v_cv, public._pcm_nom(v_cv), 'Vente POS ' || v_numero || ' — COGS ' || v_produit.sku,
           'Vente POS ' || v_numero || ' — COGS ' || v_produit.sku, v_cogs_valeur, 0, v_exercice),
          (p_societe_id, v_dossier_id, v_date, 'OD', 'STK-' || (v_mvt->>'mouvement_id'),
           v_cs, public._pcm_nom(v_cs), 'Vente POS ' || v_numero || ' — COGS ' || v_produit.sku,
           'Vente POS ' || v_numero || ' — COGS ' || v_produit.sku, 0, v_cogs_valeur, v_exercice);
      END IF;
    END IF;

    v_total_ht  := v_total_ht + v_ht;
    v_total_tva := v_total_tva + v_tva;
    v_total_ttc := v_total_ttc + v_ttc;
  END LOOP;

  FOR v_paiement IN SELECT * FROM jsonb_array_elements(p_paiements) LOOP
    v_moyen   := v_paiement->>'moyen_paiement';
    v_montant := ROUND(COALESCE((v_paiement->>'montant')::numeric, 0), 2);
    IF v_montant <= 0 THEN
      RAISE EXCEPTION 'PAIEMENT_INVALIDE: montant de paiement non positif';
    END IF;
    v_compte := CASE v_moyen
      WHEN 'especes'      THEN '530'
      WHEN 'carte'        THEN '5118'
      WHEN 'mobile_money' THEN '5118'
      WHEN 'virement'     THEN '512'
      ELSE NULL
    END;
    IF v_compte IS NULL THEN
      RAISE EXCEPTION 'MOYEN_PAIEMENT_INVALIDE: %', v_moyen;
    END IF;

    INSERT INTO public.paiements_pos (
      societe_id, vente_pos_id, moyen_paiement, montant, reference, compte_comptable
    ) VALUES (
      p_societe_id, v_vente_id, v_moyen, v_montant,
      NULLIF(v_paiement->>'reference', ''), v_compte
    );
    v_total_paye := v_total_paye + v_montant;

    v_debit_moyen := v_debit_moyen || jsonb_build_object(
      v_compte, ROUND(COALESCE((v_debit_moyen->>v_compte)::numeric, 0) + v_montant, 2));
  END LOOP;

  IF abs(v_total_paye - v_total_ttc) > 0.01 THEN
    RAISE EXCEPTION 'PAIEMENT_DESEQUILIBRE: % payé(s) pour un ticket de %', v_total_paye, v_total_ttc;
  END IF;

  UPDATE public.ventes_pos
  SET montant_ht = v_total_ht, montant_tva = v_total_tva, montant_ttc = v_total_ttc
  WHERE id = v_vente_id;

  -- Écriture d'encaissement (journal POS, POS-<vente_id>).
  FOR v_key, v_val IN SELECT key, value FROM jsonb_each_text(v_debit_moyen) LOOP
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES
      (p_societe_id, v_dossier_id, v_date, 'POS', 'POS-' || v_vente_id, v_key, public._pcm_nom(v_key),
       'Vente POS ' || v_numero, 'Vente POS ' || v_numero, v_val::numeric, 0, v_exercice);
    v_sum_d := v_sum_d + v_val::numeric;
  END LOOP;
  FOR v_key, v_val IN SELECT key, value FROM jsonb_each_text(v_credit_vente) LOOP
    IF v_val::numeric > 0 THEN
      INSERT INTO public.ecritures_comptables_v2
        (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
      VALUES
        (p_societe_id, v_dossier_id, v_date, 'POS', 'POS-' || v_vente_id, v_key, public._pcm_nom(v_key),
         'Vente POS ' || v_numero, 'Vente POS ' || v_numero, 0, v_val::numeric, v_exercice);
      v_sum_c := v_sum_c + v_val::numeric;
    END IF;
  END LOOP;
  IF v_total_tva > 0 THEN
    INSERT INTO public.ecritures_comptables_v2
      (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte, libelle, description, debit_mur, credit_mur, exercice)
    VALUES
      (p_societe_id, v_dossier_id, v_date, 'POS', 'POS-' || v_vente_id, '4457', public._pcm_nom('4457'),
       'Vente POS ' || v_numero, 'Vente POS ' || v_numero, 0, v_total_tva, v_exercice);
    v_sum_c := v_sum_c + v_total_tva;
  END IF;

  IF abs(v_sum_d - v_sum_c) > 0.01 THEN
    RAISE EXCEPTION 'R1_ENCAISSEMENT: écriture POS déséquilibrée (D=% / C=%)', v_sum_d, v_sum_c;
  END IF;

  RETURN jsonb_build_object(
    'vente_id',      v_vente_id,
    'numero_ticket', v_numero,
    'montant_ht',    v_total_ht,
    'montant_tva',   v_total_tva,
    'montant_ttc',   v_total_ttc,
    'mouvements',    v_mouvements,
    'ecritures_in_rpc', true
  );
END $$;
