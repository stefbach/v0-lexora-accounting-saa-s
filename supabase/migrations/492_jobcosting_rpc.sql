-- =====================================================================
-- Migration 492 — RPC Job Costing (imputation atomique + facturation)
-- =====================================================================
-- Réf. spec : docs/roadmap/manufacturing-job-costing.md §2.4 / §2.5.
--
-- 1. imputer_temps_job     : insère une imputation de temps (job OU OF),
--    snapshot du coût horaire chargé figé à la date (§2.5, jamais de JOIN
--    live sur le salaire), contrôle R5 (période verrouillée), et met à jour
--    le cumul de coût du job (cout_temps_reel + montant_facturable) ou de
--    l'OF (cout_main_oeuvre_reel) — le tout dans UNE transaction.
--
-- 2. consommer_stock_job   : consommation de stock imputée à un job. Sortie
--    valorisée au CUMP courant (mécanique du socle mig 482 : verrou de la
--    ligne produit, stock négatif refusé, R5), mouvement 'sortie_job', puis
--    depense_job (achat_materiel) et cumul cout_depenses_reel — atomique.
--    N'appelle PAS appliquer_mouvement_stock (fonction partagée du socle,
--    non étendue au type 'sortie_job') : logique de sortie répliquée ici pour
--    rester découplé de la zone inventaire/manufacturing.
--
-- 3. facturer_job          : gèle montant_facture = montant_facturable,
--    passe le job en 'facture', fige les imputations facturables validées
--    en 'facture' (immuables ensuite, R6). L'écriture de vente client reste
--    produite par le module Facturation existant (lien facture_id optionnel).
--
-- Aucun FLOAT : NUMERIC strict de bout en bout. SECURITY INVOKER, idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.imputer_temps_job(
  p_societe_id           UUID,
  p_employe_id           UUID,
  p_date                 DATE,
  p_heures               NUMERIC,
  p_job_id               UUID    DEFAULT NULL,
  p_ordre_id             UUID    DEFAULT NULL,
  p_type_heures          TEXT    DEFAULT 'normale',
  p_facturable           BOOLEAN DEFAULT TRUE,
  p_taux_horaire_facture NUMERIC DEFAULT NULL,
  p_cout_horaire_charge  NUMERIC DEFAULT NULL,
  p_tache                TEXT    DEFAULT NULL,
  p_description          TEXT    DEFAULT NULL,
  p_pointage_id          UUID    DEFAULT NULL,
  p_saisi_par            UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_cout        NUMERIC(10,4);
  v_cout_total  NUMERIC(15,2);
  v_facturable  NUMERIC(15,2) := 0;
  v_imput_id    UUID;
  v_of_statut   TEXT;
BEGIN
  IF p_heures IS NULL OR p_heures <= 0 THEN
    RAISE EXCEPTION 'HEURES_INVALIDES: la durée imputée doit être strictement positive';
  END IF;
  IF (p_job_id IS NULL) = (p_ordre_id IS NULL) THEN
    RAISE EXCEPTION 'CIBLE_INVALIDE: exactement un rattachement requis (job OU ordre de fabrication)';
  END IF;

  -- R5 — période comptable verrouillée
  IF EXISTS (
    SELECT 1 FROM public.accounting_periods
    WHERE societe_id = p_societe_id
      AND status = 'locked'
      AND period_start <= p_date
      AND period_end   >= p_date
  ) THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: imputation du % dans une période comptable clôturée', p_date;
  END IF;

  -- Snapshot du coût horaire chargé (§2.5) : override explicite sinon taux en
  -- vigueur à la date de prestation ; jamais un JOIN live sur le salaire.
  v_cout := p_cout_horaire_charge;
  IF v_cout IS NULL THEN
    SELECT cout_horaire_charge INTO v_cout
    FROM public.couts_horaires_employes
    WHERE societe_id = p_societe_id
      AND employe_id = p_employe_id
      AND date_effet <= p_date
    ORDER BY date_effet DESC
    LIMIT 1;
  END IF;
  IF v_cout IS NULL THEN
    RAISE EXCEPTION 'COUT_HORAIRE_REQUIS: aucun coût horaire chargé pour l''employé à la date % (créer un snapshot ou fournir un taux)', p_date;
  END IF;
  IF v_cout < 0 THEN
    RAISE EXCEPTION 'COUT_HORAIRE_INVALIDE: négatif';
  END IF;

  -- Job cible : doit exister et être ouvrable
  IF p_job_id IS NOT NULL THEN
    PERFORM 1 FROM public.jobs WHERE id = p_job_id AND societe_id = p_societe_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'JOB_INTROUVABLE: % pour la société %', p_job_id, p_societe_id;
    END IF;
  ELSE
    SELECT statut INTO v_of_statut
    FROM public.ordres_fabrication
    WHERE id = p_ordre_id AND societe_id = p_societe_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'OF_INTROUVABLE: % pour la société %', p_ordre_id, p_societe_id;
    END IF;
    IF v_of_statut NOT IN ('planifie', 'en_cours') THEN
      RAISE EXCEPTION 'OF_STATUT_INVALIDE: imputation impossible sur un OF %', v_of_statut;
    END IF;
  END IF;

  INSERT INTO public.imputations_temps (
    societe_id, job_id, ordre_fabrication_id, employe_id, pointage_id,
    date_prestation, heures, type_heures, tache, description,
    facturable, taux_horaire_facture, cout_horaire_charge, saisi_par
  ) VALUES (
    p_societe_id, p_job_id, p_ordre_id, p_employe_id, p_pointage_id,
    p_date, p_heures, COALESCE(p_type_heures, 'normale'), p_tache, p_description,
    COALESCE(p_facturable, TRUE), p_taux_horaire_facture, v_cout, p_saisi_par
  ) RETURNING id, cout_total INTO v_imput_id, v_cout_total;

  IF p_job_id IS NOT NULL THEN
    IF COALESCE(p_facturable, TRUE) AND p_taux_horaire_facture IS NOT NULL THEN
      v_facturable := ROUND(p_heures * p_taux_horaire_facture, 2);
    END IF;
    UPDATE public.jobs
    SET cout_temps_reel    = cout_temps_reel + v_cout_total,
        montant_facturable = montant_facturable + v_facturable,
        updated_at         = now()
    WHERE id = p_job_id;
  ELSE
    UPDATE public.ordres_fabrication
    SET cout_main_oeuvre_reel = cout_main_oeuvre_reel + v_cout_total,
        updated_at            = now()
    WHERE id = p_ordre_id;
  END IF;

  RETURN jsonb_build_object(
    'imputation_id',       v_imput_id,
    'cout_horaire_charge', v_cout,
    'cout_total',          v_cout_total,
    'montant_facturable',  v_facturable
  );
END $$;

-- ── 2. Consommation de stock imputée à un job ───────────────────────
CREATE OR REPLACE FUNCTION public.consommer_stock_job(
  p_societe_id UUID,
  p_job_id     UUID,
  p_produit_id UUID,
  p_depot_id   UUID,
  p_quantite   NUMERIC,
  p_date       DATE    DEFAULT CURRENT_DATE,
  p_facturable BOOLEAN DEFAULT TRUE,
  p_marge_pct  NUMERIC DEFAULT 0,
  p_motif      TEXT    DEFAULT NULL,
  p_cree_par   UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_produit      public.produits%ROWTYPE;
  v_niveau       public.stock_niveaux%ROWTYPE;
  v_dossier_id   UUID;
  v_cout         NUMERIC(15,4);
  v_valeur       NUMERIC(15,2);
  v_mouvement_id UUID;
  v_depense_id   UUID;
  v_facturable   NUMERIC(15,2) := 0;
BEGIN
  IF p_quantite IS NULL OR p_quantite <= 0 THEN
    RAISE EXCEPTION 'QUANTITE_INVALIDE: la quantité consommée doit être strictement positive';
  END IF;

  PERFORM 1 FROM public.jobs WHERE id = p_job_id AND societe_id = p_societe_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_INTROUVABLE: % pour la société %', p_job_id, p_societe_id;
  END IF;

  -- R5 — période comptable verrouillée
  IF EXISTS (
    SELECT 1 FROM public.accounting_periods
    WHERE societe_id = p_societe_id
      AND status = 'locked'
      AND period_start <= p_date
      AND period_end   >= p_date
  ) THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: consommation du % dans une période comptable clôturée', p_date;
  END IF;

  -- Verrou de sérialisation : la ligne produit (mécanique socle mig 482)
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

  SELECT * INTO v_niveau
  FROM public.stock_niveaux
  WHERE produit_id = p_produit_id AND depot_id = p_depot_id
  FOR UPDATE;
  IF NOT FOUND OR v_niveau.quantite < p_quantite THEN
    RAISE EXCEPTION 'STOCK_INSUFFISANT: % disponible(s) au dépôt, % demandé(s)',
      COALESCE(v_niveau.quantite, 0), p_quantite;
  END IF;

  -- Sortie valorisée au CUMP courant ; le CUMP ne change pas en sortie.
  v_cout   := COALESCE(v_produit.cout_unitaire_moyen, 0);
  v_valeur := ROUND(p_quantite * v_cout, 2);

  SELECT id INTO v_dossier_id FROM public.dossiers WHERE societe_id = p_societe_id LIMIT 1;

  INSERT INTO public.mouvements_stock (
    societe_id, dossier_id, produit_id, depot_id, type_mouvement, sens,
    quantite, cout_unitaire, valeur_mouvement,
    reference_type, reference_id, date_mouvement, motif, cree_par
  ) VALUES (
    p_societe_id, v_dossier_id, p_produit_id, p_depot_id, 'sortie_job', 'S',
    p_quantite, v_cout, v_valeur,
    'job', p_job_id, p_date,
    COALESCE(p_motif, 'Consommation job'), p_cree_par
  ) RETURNING id INTO v_mouvement_id;

  UPDATE public.stock_niveaux
  SET quantite     = v_niveau.quantite - p_quantite,
      valeur_stock = ROUND((v_niveau.quantite - p_quantite) * v_cout, 2),
      updated_at   = now()
  WHERE id = v_niveau.id;

  INSERT INTO public.depenses_job (
    societe_id, job_id, type_depense, description, montant_ht, devise,
    mouvement_stock_id, facturable, marge_refacturation_pct, date_depense, cree_par
  ) VALUES (
    p_societe_id, p_job_id, 'achat_materiel',
    v_produit.designation || ' (' || v_produit.sku || ') × ' || p_quantite,
    v_valeur, 'MUR',
    v_mouvement_id, COALESCE(p_facturable, TRUE), COALESCE(p_marge_pct, 0), p_date, p_cree_par
  ) RETURNING id INTO v_depense_id;

  IF COALESCE(p_facturable, TRUE) THEN
    v_facturable := ROUND(v_valeur * (1 + COALESCE(p_marge_pct, 0) / 100.0), 2);
  END IF;

  UPDATE public.jobs
  SET cout_depenses_reel = cout_depenses_reel + v_valeur,
      montant_facturable = montant_facturable + v_facturable,
      updated_at         = now()
  WHERE id = p_job_id;

  RETURN jsonb_build_object(
    'mouvement_id',       v_mouvement_id,
    'depense_id',         v_depense_id,
    'produit_id',         p_produit_id,
    'quantite',           p_quantite,
    'cout_unitaire',      v_cout,
    'valeur_mouvement',   v_valeur,
    'montant_facturable', v_facturable,
    'quantite_apres',     v_niveau.quantite - p_quantite
  );
END $$;

-- ── 3. Facturation d'un job : gel du montant + imputations figées ────
CREATE OR REPLACE FUNCTION public.facturer_job(
  p_societe_id UUID,
  p_job_id     UUID,
  p_date       DATE DEFAULT CURRENT_DATE,
  p_facture_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_job          public.jobs%ROWTYPE;
  v_nb_imput     INTEGER;
BEGIN
  SELECT * INTO v_job
  FROM public.jobs
  WHERE id = p_job_id AND societe_id = p_societe_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_INTROUVABLE: % pour la société %', p_job_id, p_societe_id;
  END IF;
  IF v_job.statut IN ('facture', 'annule') THEN
    RAISE EXCEPTION 'JOB_STATUT_INVALIDE: facturation impossible depuis le statut %', v_job.statut;
  END IF;

  -- Fige les imputations facturables déjà validées (immuables ensuite, R6).
  UPDATE public.imputations_temps
  SET statut_validation = 'facture', updated_at = now()
  WHERE job_id = p_job_id
    AND facturable = TRUE
    AND statut_validation = 'valide';
  GET DIAGNOSTICS v_nb_imput = ROW_COUNT;

  UPDATE public.jobs
  SET statut          = 'facture',
      montant_facture = montant_facturable,
      facture_id      = COALESCE(p_facture_id, facture_id),
      date_cloture    = p_date,
      updated_at      = now()
  WHERE id = p_job_id;

  RETURN jsonb_build_object(
    'job_id',              p_job_id,
    'statut',              'facture',
    'montant_facture',     v_job.montant_facturable,
    'imputations_figees',  v_nb_imput
  );
END $$;
