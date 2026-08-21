-- =====================================================================
-- Migration 489 — RPC Manufacturing : cycle de vie des OF
-- =====================================================================
-- Réf. spec : docs/roadmap/manufacturing-job-costing.md §1.2 / §1.4.
--
-- 1. appliquer_mouvement_stock : étendue (CREATE OR REPLACE, corps de la
--    mig 482 inchangé) aux deux types fabrication :
--      sortie_fabrication → 'S' (composant sorti au CUMP)
--      entree_production  → 'E' (produit fini entré au coût de revient,
--                                coût requis comme entree_achat)
-- 2. consommer_ordre_fabrication : lancement d'un OF — consomme les
--    composants EN UNE TRANSACTION (un échec STOCK_INSUFFISANT/
--    PERIOD_LOCKED annule tout), via appliquer_mouvement_stock (jamais
--    d'écriture directe de stock_niveaux). Fige cout_matieres_reel =
--    Σ quantités théoriques × CUMP réel (le montant imputé à l'en-cours
--    3300 ; l'écart réel-théorique part en 6586, cf. lib/manufacturing).
-- 3. produire_ordre_fabrication : clôture — entrée en stock du produit
--    fini au coût de revient figé, statut 'cloture' (immuable ensuite).
--
-- Aucun FLOAT : NUMERIC strict de bout en bout.
-- SECURITY INVOKER, idempotente (CREATE OR REPLACE).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.appliquer_mouvement_stock(
  p_societe_id     UUID,
  p_produit_id     UUID,
  p_depot_id       UUID,
  p_type_mouvement TEXT,
  p_quantite       NUMERIC,
  p_cout_unitaire  NUMERIC DEFAULT NULL,
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
    WHEN 'entree_production'           THEN 'E'
    WHEN 'sortie_vente'                THEN 'S'
    WHEN 'retour_fournisseur'          THEN 'S'
    WHEN 'ajustement_inventaire_moins' THEN 'S'
    WHEN 'transfert_sortie'            THEN 'S'
    WHEN 'perte_casse'                 THEN 'S'
    WHEN 'sortie_fabrication'          THEN 'S'
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
    IF p_type_mouvement IN ('entree_achat', 'entree_production') AND p_cout_unitaire IS NULL THEN
      RAISE EXCEPTION 'COUT_REQUIS: une entrée % exige le coût unitaire réel', p_type_mouvement;
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

-- ── 2. Lancement d'un OF : consommation atomique des composants ──────
-- p_lignes : [{"produit_id": uuid, "quantite_theorique": n, "quantite_reelle": n}, …]
CREATE OR REPLACE FUNCTION public.consommer_ordre_fabrication(
  p_societe_id UUID,
  p_ordre_id   UUID,
  p_lignes     JSONB,
  p_date       DATE DEFAULT CURRENT_DATE,
  p_cree_par   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_of              public.ordres_fabrication%ROWTYPE;
  v_ligne           JSONB;
  v_produit_id      UUID;
  v_qte_theorique   NUMERIC(15,3);
  v_qte_reelle      NUMERIC(15,3);
  v_mvt             JSONB;
  v_cout            NUMERIC(15,4);
  v_valeur_reelle   NUMERIC(15,2);
  v_valeur_theo     NUMERIC(15,2);
  v_total_theo      NUMERIC(15,2) := 0;
  v_total_reel      NUMERIC(15,2) := 0;
  v_conso_id        UUID;
  v_consos          JSONB := '[]'::jsonb;
BEGIN
  IF p_lignes IS NULL OR jsonb_typeof(p_lignes) <> 'array' OR jsonb_array_length(p_lignes) = 0 THEN
    RAISE EXCEPTION 'LIGNES_REQUISES: au moins un composant à consommer';
  END IF;

  SELECT * INTO v_of
  FROM public.ordres_fabrication
  WHERE id = p_ordre_id AND societe_id = p_societe_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OF_INTROUVABLE: % pour la société %', p_ordre_id, p_societe_id;
  END IF;
  IF v_of.statut <> 'planifie' THEN
    RAISE EXCEPTION 'OF_STATUT_INVALIDE: lancement impossible depuis le statut %', v_of.statut;
  END IF;

  FOR v_ligne IN SELECT * FROM jsonb_array_elements(p_lignes) LOOP
    v_produit_id    := (v_ligne->>'produit_id')::uuid;
    v_qte_theorique := ROUND(COALESCE((v_ligne->>'quantite_theorique')::numeric, 0), 3);
    v_qte_reelle    := ROUND(COALESCE((v_ligne->>'quantite_reelle')::numeric, 0), 3);
    IF v_produit_id IS NULL OR v_qte_reelle <= 0 OR v_qte_theorique < 0 THEN
      RAISE EXCEPTION 'LIGNE_INVALIDE: produit_id et quantités (réelle > 0) requis';
    END IF;

    -- Sortie de stock du composant — TOUJOURS via la RPC du socle
    -- (verrou, CUMP, stock négatif, R5) ; un échec annule toute la transaction.
    v_mvt := public.appliquer_mouvement_stock(
      p_societe_id, v_produit_id, v_of.depot_id, 'sortie_fabrication',
      v_qte_reelle, NULL, p_date,
      'Consommation OF ' || v_of.numero_of,
      'ordre_fabrication', p_ordre_id, p_cree_par);

    v_cout          := (v_mvt->>'cout_unitaire')::numeric;
    v_valeur_reelle := (v_mvt->>'valeur_mouvement')::numeric;
    v_valeur_theo   := ROUND(v_qte_theorique * v_cout, 2);

    INSERT INTO public.consommations_of (
      societe_id, ordre_fabrication_id, produit_id,
      quantite_theorique, quantite_reelle, cout_unitaire,
      valeur_theorique, valeur_reelle, mouvement_stock_id, date_consommation
    ) VALUES (
      p_societe_id, p_ordre_id, v_produit_id,
      v_qte_theorique, v_qte_reelle, v_cout,
      v_valeur_theo, v_valeur_reelle, (v_mvt->>'mouvement_id')::uuid, p_date
    ) RETURNING id INTO v_conso_id;

    v_total_theo := v_total_theo + v_valeur_theo;
    v_total_reel := v_total_reel + v_valeur_reelle;
    v_consos := v_consos || jsonb_build_object(
      'consommation_id', v_conso_id,
      'produit_id', v_produit_id,
      'quantite_theorique', v_qte_theorique,
      'quantite_reelle', v_qte_reelle,
      'cout_unitaire', v_cout,
      'valeur_theorique', v_valeur_theo,
      'valeur_reelle', v_valeur_reelle);
  END LOOP;

  UPDATE public.ordres_fabrication
  SET statut = 'en_cours',
      date_debut_reel = now(),
      cout_matieres_reel = v_total_theo,
      updated_at = now()
  WHERE id = p_ordre_id;

  RETURN jsonb_build_object(
    'ordre_id',           p_ordre_id,
    'statut',             'en_cours',
    'cout_matieres_reel', v_total_theo,
    'valeur_sortie_stock', v_total_reel,
    'ecart_valeur',        ROUND(v_total_reel - v_total_theo, 2),
    'consommations',       v_consos
  );
END $$;

-- ── 3. Clôture d'un OF : entrée du produit fini au coût de revient ───
CREATE OR REPLACE FUNCTION public.produire_ordre_fabrication(
  p_societe_id UUID,
  p_ordre_id   UUID,
  p_quantite   NUMERIC,
  p_date       DATE DEFAULT CURRENT_DATE,
  p_cree_par   UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_of           public.ordres_fabrication%ROWTYPE;
  v_produit_id   UUID;
  v_cout_total   NUMERIC(15,2);
  v_revient      NUMERIC(15,4);
  v_mvt          JSONB;
  v_qte          NUMERIC(15,3);
BEGIN
  IF p_quantite IS NULL OR p_quantite <= 0 THEN
    RAISE EXCEPTION 'QUANTITE_INVALIDE: la quantité produite doit être strictement positive';
  END IF;
  v_qte := ROUND(p_quantite, 3);

  SELECT * INTO v_of
  FROM public.ordres_fabrication
  WHERE id = p_ordre_id AND societe_id = p_societe_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OF_INTROUVABLE: % pour la société %', p_ordre_id, p_societe_id;
  END IF;
  IF v_of.statut <> 'en_cours' THEN
    RAISE EXCEPTION 'OF_STATUT_INVALIDE: clôture impossible depuis le statut %', v_of.statut;
  END IF;

  SELECT produit_fini_id INTO v_produit_id
  FROM public.nomenclatures WHERE id = v_of.nomenclature_id;

  -- Coût de revient réel = (matières + main d'œuvre) / quantité produite.
  -- Figé ICI, jamais recalculé (immuabilité post-clôture, R6).
  v_cout_total := v_of.cout_matieres_reel + v_of.cout_main_oeuvre_reel;
  v_revient    := ROUND(v_cout_total / v_qte, 4);

  v_mvt := public.appliquer_mouvement_stock(
    p_societe_id, v_produit_id, v_of.depot_id, 'entree_production',
    v_qte, v_revient, p_date,
    'Production OF ' || v_of.numero_of,
    'ordre_fabrication', p_ordre_id, p_cree_par);

  INSERT INTO public.productions_of (
    societe_id, ordre_fabrication_id, produit_id,
    quantite, cout_unitaire_revient, mouvement_stock_id, date_production
  ) VALUES (
    p_societe_id, p_ordre_id, v_produit_id,
    v_qte, v_revient, (v_mvt->>'mouvement_id')::uuid, p_date
  );

  UPDATE public.ordres_fabrication
  SET statut = 'cloture',
      quantite_produite = v_qte,
      cout_unitaire_revient = v_revient,
      date_fin_reel = now(),
      updated_at = now()
  WHERE id = p_ordre_id;

  RETURN jsonb_build_object(
    'ordre_id',              p_ordre_id,
    'statut',                'cloture',
    'produit_fini_id',       v_produit_id,
    'quantite_produite',     v_qte,
    'cout_unitaire_revient', v_revient,
    'cout_total',            v_cout_total,
    'mouvement_id',          v_mvt->>'mouvement_id',
    'cout_unitaire_moyen',   (v_mvt->>'cout_unitaire_moyen')::numeric
  );
END $$;
