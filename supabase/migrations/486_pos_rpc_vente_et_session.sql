-- =====================================================================
-- Migration 486 — RPC POS : valider_vente_pos + fermer_session_caisse
-- =====================================================================
-- Réf. spec : docs/roadmap/inventaire-pos.md §2.2 / §2.4 / §2.6.
--
-- valider_vente_pos : validation ATOMIQUE d'un ticket —
--   ticket + lignes + paiements + déduction de stock dans UNE transaction.
--   La déduction de stock RÉUTILISE la RPC appliquer_mouvement_stock
--   (migration 482 : verrou de ligne, CUMP, stock négatif refusé,
--   extension R5 période verrouillée) — aucune logique dupliquée.
--   Un STOCK_INSUFFISANT sur la ligne N annule tout le ticket.
--
-- fermer_session_caisse : clôture d'un shift — fond théorique =
--   fond d'ouverture + Σ encaissements espèces du shift, écart calculé
--   (colonne générée), récapitulatif par moyen de paiement retourné.
--
-- Montants : NUMERIC strict, arrondi half-up (ROUND) — jamais de float.
-- SECURITY INVOKER ; RLS SEC-003 (migration 484) couvre l'accès direct.
-- Idempotente (CREATE OR REPLACE).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.valider_vente_pos(
  p_societe_id UUID,
  p_session_id UUID,
  p_lignes     JSONB,               -- [{produit_id, quantite, prix_unitaire_ht?, remise_pct?, taux_tva?}]
  p_paiements  JSONB,               -- [{moyen_paiement, montant, reference?}]
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
BEGIN
  IF p_lignes IS NULL OR jsonb_array_length(p_lignes) = 0 THEN
    RAISE EXCEPTION 'TICKET_VIDE: au moins une ligne est requise';
  END IF;
  IF p_paiements IS NULL OR jsonb_array_length(p_paiements) = 0 THEN
    RAISE EXCEPTION 'PAIEMENT_REQUIS: au moins un paiement est requis';
  END IF;

  -- Verrou de la session — sérialise les tickets d'un même shift.
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

  -- Numérotation du ticket — sérialisée par société (verrou advisory transactionnel).
  PERFORM pg_advisory_xact_lock(hashtext(p_societe_id::text || ':pos_ticket'));
  SELECT COUNT(*) + 1 INTO v_seq
  FROM public.ventes_pos
  WHERE societe_id = p_societe_id
    AND date_vente::date = p_date_vente::date;
  v_numero := 'TCK-' || to_char(p_date_vente, 'YYYYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO public.ventes_pos (
    societe_id, session_caisse_id, depot_id, numero_ticket, client_id,
    date_vente, montant_ht, montant_tva, montant_ttc, statut, cree_par
  ) VALUES (
    p_societe_id, p_session_id, v_session.depot_id, v_numero, p_client_id,
    p_date_vente, 0, 0, 0, 'validee', p_cree_par
  ) RETURNING id INTO v_vente_id;

  -- Lignes : montants recalculés en NUMERIC (source de vérité serveur).
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

    v_qte    := (v_ligne->>'quantite')::numeric;
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

    -- Déduction de stock — RPC du socle inventaire (verrou + CUMP + R5).
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
    END IF;

    v_total_ht  := v_total_ht + v_ht;
    v_total_tva := v_total_tva + v_tva;
    v_total_ttc := v_total_ttc + v_ttc;
  END LOOP;

  -- Paiements : moyen → compte comptable (530 espèces, 5118 transit, 512 banque).
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
  END LOOP;

  IF abs(v_total_paye - v_total_ttc) > 0.01 THEN
    RAISE EXCEPTION 'PAIEMENT_DESEQUILIBRE: % payé(s) pour un ticket de %', v_total_paye, v_total_ttc;
  END IF;

  UPDATE public.ventes_pos
  SET montant_ht = v_total_ht, montant_tva = v_total_tva, montant_ttc = v_total_ttc
  WHERE id = v_vente_id;

  RETURN jsonb_build_object(
    'vente_id',      v_vente_id,
    'numero_ticket', v_numero,
    'montant_ht',    v_total_ht,
    'montant_tva',   v_total_tva,
    'montant_ttc',   v_total_ttc,
    'mouvements',    v_mouvements
  );
END $$;

-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fermer_session_caisse(
  p_societe_id  UUID,
  p_session_id  UUID,
  p_fond_compte NUMERIC,
  p_notes       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_session        public.sessions_caisse%ROWTYPE;
  v_total_especes  NUMERIC(15,2);
  v_theorique      NUMERIC(15,2);
  v_ecart          NUMERIC(15,2);
  v_nb_tickets     INTEGER;
  v_total_ttc      NUMERIC(15,2);
  v_par_moyen      JSONB;
BEGIN
  IF p_fond_compte IS NULL OR p_fond_compte < 0 THEN
    RAISE EXCEPTION 'FOND_INVALIDE: le fond de caisse compté doit être positif ou nul';
  END IF;

  SELECT * INTO v_session
  FROM public.sessions_caisse
  WHERE id = p_session_id AND societe_id = p_societe_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_INTROUVABLE: % pour la société %', p_session_id, p_societe_id;
  END IF;
  IF v_session.statut <> 'ouverte' THEN
    RAISE EXCEPTION 'SESSION_FERMEE: la session est déjà fermée';
  END IF;

  SELECT COALESCE(SUM(p.montant), 0) INTO v_total_especes
  FROM public.paiements_pos p
  JOIN public.ventes_pos v ON v.id = p.vente_pos_id
  WHERE v.session_caisse_id = p_session_id
    AND v.statut = 'validee'
    AND p.moyen_paiement = 'especes';

  SELECT COUNT(*), COALESCE(SUM(montant_ttc), 0) INTO v_nb_tickets, v_total_ttc
  FROM public.ventes_pos
  WHERE session_caisse_id = p_session_id AND statut = 'validee';

  SELECT COALESCE(jsonb_object_agg(moyen, total), '{}'::jsonb) INTO v_par_moyen
  FROM (
    SELECT p.moyen_paiement AS moyen, SUM(p.montant) AS total
    FROM public.paiements_pos p
    JOIN public.ventes_pos v ON v.id = p.vente_pos_id
    WHERE v.session_caisse_id = p_session_id AND v.statut = 'validee'
    GROUP BY p.moyen_paiement
  ) t;

  v_theorique := ROUND(v_session.fond_ouverture + v_total_especes, 2);

  UPDATE public.sessions_caisse
  SET statut                   = 'fermee',
      fond_fermeture_theorique = v_theorique,
      fond_fermeture_compte    = ROUND(p_fond_compte, 2),
      fermee_at                = now(),
      notes                    = COALESCE(p_notes, notes),
      updated_at               = now()
  WHERE id = p_session_id;

  v_ecart := ROUND(p_fond_compte, 2) - v_theorique;

  RETURN jsonb_build_object(
    'session_id',               p_session_id,
    'fond_ouverture',           v_session.fond_ouverture,
    'fond_fermeture_theorique', v_theorique,
    'fond_fermeture_compte',    ROUND(p_fond_compte, 2),
    'ecart_caisse',             v_ecart,
    'nb_tickets',               v_nb_tickets,
    'total_ttc',                v_total_ttc,
    'total_especes',            v_total_especes,
    'par_moyen',                v_par_moyen
  );
END $$;
