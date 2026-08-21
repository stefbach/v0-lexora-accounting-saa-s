-- =====================================================================
-- Migration 481 — Socle Inventaire / Gestion de stock (Module A, Phase 1)
-- =====================================================================
-- Réf. spec : docs/roadmap/inventaire-pos.md §1.2
--
-- Tables créées :
--   • produits        — référentiel articles (SKU, comptes, seuils, CUMP)
--   • depots          — points de stockage
--   • stock_niveaux   — solde courant dénormalisé (écrit UNIQUEMENT par la
--                       RPC appliquer_mouvement_stock, migration 482)
--   • mouvements_stock — journal immuable (source de vérité), corrections
--                       par mouvement compensatoire uniquement
--   • alertes_stock   — alertes seuil bas / rupture
--
-- RLS : SEC-003 — user_has_societe_access(societe_id) exclusivement
-- (jamais de sous-requête inline sur dossiers, jamais auth.uid() IS NOT NULL).
-- Idempotente et additive.
-- =====================================================================

-- ── 1. produits ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.produits (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id             UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  sku                    TEXT NOT NULL,
  code_barre             TEXT,
  designation            TEXT NOT NULL,
  description            TEXT,
  categorie              TEXT,
  unite_mesure           TEXT NOT NULL DEFAULT 'unite',
  gere_en_stock          BOOLEAN NOT NULL DEFAULT TRUE,
  methode_valorisation   TEXT NOT NULL DEFAULT 'CUMP' CHECK (methode_valorisation IN ('CUMP')),
  -- CUMP courant — maintenu par la RPC appliquer_mouvement_stock, jamais par le front
  cout_unitaire_moyen    NUMERIC(15,4) NOT NULL DEFAULT 0,
  prix_vente_ht          NUMERIC(15,2) NOT NULL DEFAULT 0,
  taux_tva               NUMERIC(5,2) NOT NULL DEFAULT 15,
  compte_stock           VARCHAR(10) NOT NULL DEFAULT '3701',
  compte_achat           VARCHAR(10) NOT NULL DEFAULT '601',
  compte_vente           VARCHAR(10) NOT NULL DEFAULT '701',
  compte_variation_stock VARCHAR(10) NOT NULL DEFAULT '6037',
  stock_mini             NUMERIC(15,3) NOT NULL DEFAULT 0,
  stock_maxi             NUMERIC(15,3),
  seuil_alerte           NUMERIC(15,3),
  catalogue_id           UUID REFERENCES public.factures_catalogue(id) ON DELETE SET NULL,
  actif                  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (societe_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_produits_societe ON public.produits(societe_id);
CREATE INDEX IF NOT EXISTS idx_produits_societe_actif ON public.produits(societe_id) WHERE actif;

-- ── 2. depots ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.depots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id  UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  nom         TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'entrepot' CHECK (type IN ('entrepot','boutique','point_de_vente')),
  adresse     TEXT,
  est_defaut  BOOLEAN NOT NULL DEFAULT FALSE,
  actif       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_depots_societe ON public.depots(societe_id);
-- Un seul dépôt par défaut par société
CREATE UNIQUE INDEX IF NOT EXISTS uq_depots_defaut_par_societe
  ON public.depots(societe_id) WHERE est_defaut;

-- ── 3. stock_niveaux ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_niveaux (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id   UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  produit_id   UUID NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  depot_id     UUID NOT NULL REFERENCES public.depots(id) ON DELETE CASCADE,
  quantite     NUMERIC(15,3) NOT NULL DEFAULT 0,
  valeur_stock NUMERIC(15,2) NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (produit_id, depot_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_niveaux_societe ON public.stock_niveaux(societe_id);
CREATE INDEX IF NOT EXISTS idx_stock_niveaux_depot ON public.stock_niveaux(depot_id);

-- ── 4. mouvements_stock (journal immuable) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.mouvements_stock (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id           UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  dossier_id           UUID REFERENCES public.dossiers(id) ON DELETE SET NULL,
  produit_id           UUID NOT NULL REFERENCES public.produits(id) ON DELETE RESTRICT,
  depot_id             UUID NOT NULL REFERENCES public.depots(id) ON DELETE RESTRICT,
  depot_destination_id UUID REFERENCES public.depots(id) ON DELETE RESTRICT,
  type_mouvement       TEXT NOT NULL CHECK (type_mouvement IN (
                         'entree_achat','sortie_vente',
                         'ajustement_inventaire_plus','ajustement_inventaire_moins',
                         'transfert_sortie','transfert_entree',
                         'retour_client','retour_fournisseur','perte_casse')),
  sens                 CHAR(1) NOT NULL CHECK (sens IN ('E','S')),
  quantite             NUMERIC(15,3) NOT NULL CHECK (quantite > 0),
  cout_unitaire        NUMERIC(15,4) NOT NULL CHECK (cout_unitaire >= 0),
  valeur_mouvement     NUMERIC(15,2) NOT NULL CHECK (valeur_mouvement >= 0),
  reference_type       TEXT NOT NULL DEFAULT 'manuel' CHECK (reference_type IN
                         ('bon_reception','vente_pos','inventaire_physique','transfert','manuel')),
  reference_id         UUID,
  date_mouvement       DATE NOT NULL,
  motif                TEXT,
  cree_par             UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mvt_stock_societe_produit_depot_date
  ON public.mouvements_stock(societe_id, produit_id, depot_id, date_mouvement);
CREATE INDEX IF NOT EXISTS idx_mvt_stock_societe_date
  ON public.mouvements_stock(societe_id, date_mouvement);

-- Immutabilité (même esprit que R6) : correction par mouvement
-- compensatoire uniquement, jamais par UPDATE/DELETE.
CREATE OR REPLACE FUNCTION public.mouvements_stock_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'MOUVEMENT_IMMUABLE: un mouvement de stock ne peut être ni modifié ni supprimé — créer un mouvement compensatoire';
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mouvements_stock_immutable ON public.mouvements_stock;
CREATE TRIGGER trg_mouvements_stock_immutable
  BEFORE UPDATE OR DELETE ON public.mouvements_stock
  FOR EACH ROW EXECUTE FUNCTION public.mouvements_stock_immutable();

-- ── 5. alertes_stock ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.alertes_stock (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id         UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  produit_id         UUID NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  depot_id           UUID REFERENCES public.depots(id) ON DELETE CASCADE,
  type_alerte        TEXT NOT NULL CHECK (type_alerte IN ('seuil_bas','rupture','surstockage')),
  seuil_reference    NUMERIC(15,3),
  quantite_constatee NUMERIC(15,3) NOT NULL DEFAULT 0,
  statut             TEXT NOT NULL DEFAULT 'active' CHECK (statut IN ('active','resolue','ignoree')),
  declenchee_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolue_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alertes_stock_societe_statut
  ON public.alertes_stock(societe_id, statut);
-- Une seule alerte ACTIVE par produit×dépôt (permet l'upsert côté API)
CREATE UNIQUE INDEX IF NOT EXISTS uq_alertes_stock_active
  ON public.alertes_stock(produit_id, depot_id) WHERE statut = 'active';

-- ── 6. Trigger updated_at partagé ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.inventaire_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_produits_touch ON public.produits;
CREATE TRIGGER trg_produits_touch BEFORE UPDATE ON public.produits
  FOR EACH ROW EXECUTE FUNCTION public.inventaire_touch_updated_at();

DROP TRIGGER IF EXISTS trg_depots_touch ON public.depots;
CREATE TRIGGER trg_depots_touch BEFORE UPDATE ON public.depots
  FOR EACH ROW EXECUTE FUNCTION public.inventaire_touch_updated_at();

-- ── 7. RLS — SEC-003 ─────────────────────────────────────────────────
ALTER TABLE public.produits         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depots           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_niveaux    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mouvements_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertes_stock    ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='produits' AND policyname='produits_tenant_select') THEN
    CREATE POLICY produits_tenant_select ON public.produits
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY produits_tenant_modify ON public.produits
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='depots' AND policyname='depots_tenant_select') THEN
    CREATE POLICY depots_tenant_select ON public.depots
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY depots_tenant_modify ON public.depots
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='stock_niveaux' AND policyname='stock_niveaux_tenant_select') THEN
    -- Lecture tenant ; l'écriture passe exclusivement par la RPC (mig 482),
    -- la policy modify couvre l'exécution de la RPC en SECURITY INVOKER.
    CREATE POLICY stock_niveaux_tenant_select ON public.stock_niveaux
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY stock_niveaux_tenant_modify ON public.stock_niveaux
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mouvements_stock' AND policyname='mouvements_stock_tenant_select') THEN
    CREATE POLICY mouvements_stock_tenant_select ON public.mouvements_stock
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    -- Journal immuable : INSERT uniquement (UPDATE/DELETE bloqués par trigger).
    CREATE POLICY mouvements_stock_tenant_insert ON public.mouvements_stock
      FOR INSERT WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='alertes_stock' AND policyname='alertes_stock_tenant_select') THEN
    CREATE POLICY alertes_stock_tenant_select ON public.alertes_stock
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY alertes_stock_tenant_modify ON public.alertes_stock
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;
