-- =====================================================================
-- Migration 487 — Manufacturing (Module C) : nomenclatures & ordres de
-- fabrication (MVP mono-niveau, sans main d'œuvre — Module D non livré)
-- =====================================================================
-- Réf. spec : docs/roadmap/manufacturing-job-costing.md §1.2 / §1.6.
--
-- Tables créées :
--   • nomenclatures        — en-tête de BOM (une seule version active/produit)
--   • lignes_nomenclature  — composants (anti-cycle + mono-niveau par trigger)
--   • ordres_fabrication   — OF : planifie → en_cours → cloture (immuable)
--   • consommations_of     — matières réellement sorties (journal, insert-only)
--   • productions_of       — produit fini entré en stock (journal, insert-only)
--
-- Extension du socle Inventaire (mig 481) : deux nouveaux types de
-- mouvement ('sortie_fabrication', 'entree_production') et un nouveau
-- reference_type ('ordre_fabrication') sur mouvements_stock.
--
-- RLS : SEC-003 — user_has_societe_access(societe_id) exclusivement.
-- Idempotente et additive.
-- =====================================================================

-- ── 1. nomenclatures ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nomenclatures (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id           UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  produit_fini_id      UUID NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  version              TEXT NOT NULL DEFAULT '1',
  libelle              TEXT,
  -- BOM définie « pour produire N unités » (fabrication par lot)
  quantite_produite    NUMERIC(15,3) NOT NULL DEFAULT 1 CHECK (quantite_produite > 0),
  statut               TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon','active','obsolete')),
  -- Indicatif (recalculé depuis les lignes au CUMP courant) ; le réel vient des OF
  cout_matieres_estime NUMERIC(15,4),
  actif                BOOLEAN NOT NULL DEFAULT TRUE,
  cree_par             UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (produit_fini_id, version)
);

CREATE INDEX IF NOT EXISTS idx_nomenclatures_societe ON public.nomenclatures(societe_id);
-- Une seule version active par produit fini
CREATE UNIQUE INDEX IF NOT EXISTS uq_nomenclatures_active_par_produit
  ON public.nomenclatures(produit_fini_id) WHERE statut = 'active';

-- ── 2. lignes_nomenclature ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lignes_nomenclature (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id           UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  nomenclature_id      UUID NOT NULL REFERENCES public.nomenclatures(id) ON DELETE CASCADE,
  produit_composant_id UUID NOT NULL REFERENCES public.produits(id) ON DELETE RESTRICT,
  quantite             NUMERIC(15,3) NOT NULL CHECK (quantite > 0),
  unite                TEXT,
  -- Rebut normal attendu : majore la quantité théorique consommée
  taux_perte_pct       NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (taux_perte_pct >= 0 AND taux_perte_pct < 100),
  ordre                INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (nomenclature_id, produit_composant_id)
);

CREATE INDEX IF NOT EXISTS idx_lignes_nomenclature_nom ON public.lignes_nomenclature(nomenclature_id);
CREATE INDEX IF NOT EXISTS idx_lignes_nomenclature_societe ON public.lignes_nomenclature(societe_id);

-- Anti-cycle (§1.2, verrouillé en base dès v1) :
--   • un composant ne peut pas être le produit fini de sa propre BOM ;
--   • v1 mono-niveau : un composant ne peut pas avoir de BOM active.
CREATE OR REPLACE FUNCTION public.lignes_nomenclature_anti_cycle()
RETURNS TRIGGER AS $$
DECLARE
  v_produit_fini UUID;
BEGIN
  SELECT produit_fini_id INTO v_produit_fini
  FROM public.nomenclatures WHERE id = NEW.nomenclature_id;

  IF NEW.produit_composant_id = v_produit_fini THEN
    RAISE EXCEPTION 'BOM_CYCLE: le composant ne peut pas être le produit fini de sa propre nomenclature';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.nomenclatures
    WHERE produit_fini_id = NEW.produit_composant_id AND statut = 'active'
  ) THEN
    RAISE EXCEPTION 'BOM_MULTINIVEAU: le composant % a lui-même une nomenclature active — nomenclatures multi-niveaux hors périmètre v1', NEW.produit_composant_id;
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lignes_nomenclature_anti_cycle ON public.lignes_nomenclature;
CREATE TRIGGER trg_lignes_nomenclature_anti_cycle
  BEFORE INSERT OR UPDATE ON public.lignes_nomenclature
  FOR EACH ROW EXECUTE FUNCTION public.lignes_nomenclature_anti_cycle();

-- Verrou symétrique : activer une BOM dont le produit fini est déjà
-- composant d'une autre BOM active créerait un multi-niveau.
CREATE OR REPLACE FUNCTION public.nomenclatures_anti_multiniveau()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.statut = 'active' AND EXISTS (
    SELECT 1
    FROM public.lignes_nomenclature ln
    JOIN public.nomenclatures n ON n.id = ln.nomenclature_id
    WHERE ln.produit_composant_id = NEW.produit_fini_id
      AND n.statut = 'active'
  ) THEN
    RAISE EXCEPTION 'BOM_MULTINIVEAU: le produit fini % est composant d''une autre nomenclature active', NEW.produit_fini_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_nomenclatures_anti_multiniveau ON public.nomenclatures;
CREATE TRIGGER trg_nomenclatures_anti_multiniveau
  BEFORE INSERT OR UPDATE ON public.nomenclatures
  FOR EACH ROW EXECUTE FUNCTION public.nomenclatures_anti_multiniveau();

-- ── 3. ordres_fabrication ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ordres_fabrication (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id            UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  depot_id              UUID NOT NULL REFERENCES public.depots(id) ON DELETE RESTRICT,
  nomenclature_id       UUID NOT NULL REFERENCES public.nomenclatures(id) ON DELETE RESTRICT,
  numero_of             TEXT NOT NULL,
  quantite_a_produire   NUMERIC(15,3) NOT NULL CHECK (quantite_a_produire > 0),
  quantite_produite     NUMERIC(15,3) NOT NULL DEFAULT 0,
  -- MVP : planifie → en_cours (consommation) → cloture (production + coût figé)
  statut                TEXT NOT NULL DEFAULT 'planifie' CHECK (statut IN ('planifie','en_cours','cloture','annule')),
  date_planifiee        DATE,
  date_debut_reel       TIMESTAMPTZ,
  date_fin_reel         TIMESTAMPTZ,
  -- Cumuls maintenus par les RPC (mig 489), jamais recalculés côté client.
  -- cout_matieres_reel = montant imputé à l'en-cours 3300 (quantités
  -- théoriques valorisées au CUMP réel ; l'écart anormal part en 6586).
  cout_matieres_reel    NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Réservé Module D (imputations_temps) — toujours 0 dans ce MVP.
  cout_main_oeuvre_reel NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Figé à la clôture = (matières + main d'œuvre) / quantite_produite. Jamais recalculé (R6).
  cout_unitaire_revient NUMERIC(15,4),
  responsable_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (societe_id, numero_of)
);

CREATE INDEX IF NOT EXISTS idx_of_societe_statut ON public.ordres_fabrication(societe_id, statut);
CREATE INDEX IF NOT EXISTS idx_of_nomenclature ON public.ordres_fabrication(nomenclature_id);

-- Immutabilité post-clôture (esprit R6) : correction par OF de
-- régularisation, jamais par UPDATE/DELETE.
CREATE OR REPLACE FUNCTION public.ordres_fabrication_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.statut IN ('en_cours','cloture') THEN
      RAISE EXCEPTION 'OF_IMMUABLE: un OF % ne peut pas être supprimé — créer un OF de régularisation', OLD.statut;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.statut = 'cloture' THEN
    RAISE EXCEPTION 'OF_IMMUABLE: un OF clôturé ne peut plus être modifié — créer un OF de régularisation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ordres_fabrication_immutable ON public.ordres_fabrication;
CREATE TRIGGER trg_ordres_fabrication_immutable
  BEFORE UPDATE OR DELETE ON public.ordres_fabrication
  FOR EACH ROW EXECUTE FUNCTION public.ordres_fabrication_immutable();

DROP TRIGGER IF EXISTS trg_ordres_fabrication_touch ON public.ordres_fabrication;
CREATE TRIGGER trg_ordres_fabrication_touch BEFORE UPDATE ON public.ordres_fabrication
  FOR EACH ROW EXECUTE FUNCTION public.inventaire_touch_updated_at();

DROP TRIGGER IF EXISTS trg_nomenclatures_touch ON public.nomenclatures;
CREATE TRIGGER trg_nomenclatures_touch BEFORE UPDATE ON public.nomenclatures
  FOR EACH ROW EXECUTE FUNCTION public.inventaire_touch_updated_at();

-- ── 4. consommations_of (journal insert-only) ────────────────────────
CREATE TABLE IF NOT EXISTS public.consommations_of (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id           UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  ordre_fabrication_id UUID NOT NULL REFERENCES public.ordres_fabrication(id) ON DELETE CASCADE,
  produit_id           UUID NOT NULL REFERENCES public.produits(id) ON DELETE RESTRICT,
  quantite_theorique   NUMERIC(15,3) NOT NULL CHECK (quantite_theorique >= 0),
  quantite_reelle      NUMERIC(15,3) NOT NULL CHECK (quantite_reelle > 0),
  cout_unitaire        NUMERIC(15,4) NOT NULL DEFAULT 0,  -- CUMP au moment de la consommation
  valeur_theorique     NUMERIC(15,2) NOT NULL DEFAULT 0,  -- → en-cours 3300
  valeur_reelle        NUMERIC(15,2) NOT NULL DEFAULT 0,  -- → crédit stock composant
  mouvement_stock_id   UUID REFERENCES public.mouvements_stock(id) ON DELETE RESTRICT,
  date_consommation    DATE NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consommations_of_ordre ON public.consommations_of(ordre_fabrication_id);
CREATE INDEX IF NOT EXISTS idx_consommations_of_societe ON public.consommations_of(societe_id);

-- ── 5. productions_of (journal insert-only) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.productions_of (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id            UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  ordre_fabrication_id  UUID NOT NULL REFERENCES public.ordres_fabrication(id) ON DELETE CASCADE,
  produit_id            UUID NOT NULL REFERENCES public.produits(id) ON DELETE RESTRICT,
  quantite              NUMERIC(15,3) NOT NULL CHECK (quantite > 0),
  cout_unitaire_revient NUMERIC(15,4) NOT NULL DEFAULT 0,
  mouvement_stock_id    UUID REFERENCES public.mouvements_stock(id) ON DELETE RESTRICT,
  date_production       DATE NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_productions_of_ordre ON public.productions_of(ordre_fabrication_id);
CREATE INDEX IF NOT EXISTS idx_productions_of_societe ON public.productions_of(societe_id);

-- Journaux immuables (réutilise le trigger générique du socle Inventaire).
DROP TRIGGER IF EXISTS trg_consommations_of_immutable ON public.consommations_of;
CREATE TRIGGER trg_consommations_of_immutable
  BEFORE UPDATE OR DELETE ON public.consommations_of
  FOR EACH ROW EXECUTE FUNCTION public.mouvements_stock_immutable();

DROP TRIGGER IF EXISTS trg_productions_of_immutable ON public.productions_of;
CREATE TRIGGER trg_productions_of_immutable
  BEFORE UPDATE OR DELETE ON public.productions_of
  FOR EACH ROW EXECUTE FUNCTION public.mouvements_stock_immutable();

-- ── 6. Extension mouvements_stock (types fabrication, §1.6) ──────────
ALTER TABLE public.mouvements_stock DROP CONSTRAINT IF EXISTS mouvements_stock_type_mouvement_check;
ALTER TABLE public.mouvements_stock ADD CONSTRAINT mouvements_stock_type_mouvement_check
  CHECK (type_mouvement IN (
    'entree_achat','sortie_vente',
    'ajustement_inventaire_plus','ajustement_inventaire_moins',
    'transfert_sortie','transfert_entree',
    'retour_client','retour_fournisseur','perte_casse',
    'sortie_fabrication','entree_production'));

ALTER TABLE public.mouvements_stock DROP CONSTRAINT IF EXISTS mouvements_stock_reference_type_check;
ALTER TABLE public.mouvements_stock ADD CONSTRAINT mouvements_stock_reference_type_check
  CHECK (reference_type IN
    ('bon_reception','vente_pos','inventaire_physique','transfert','manuel','ordre_fabrication'));

-- ── 7. RLS — SEC-003 ─────────────────────────────────────────────────
ALTER TABLE public.nomenclatures       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lignes_nomenclature ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordres_fabrication  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consommations_of    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productions_of      ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nomenclatures' AND policyname='nomenclatures_tenant_select') THEN
    CREATE POLICY nomenclatures_tenant_select ON public.nomenclatures
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY nomenclatures_tenant_modify ON public.nomenclatures
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='lignes_nomenclature' AND policyname='lignes_nomenclature_tenant_select') THEN
    CREATE POLICY lignes_nomenclature_tenant_select ON public.lignes_nomenclature
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY lignes_nomenclature_tenant_modify ON public.lignes_nomenclature
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ordres_fabrication' AND policyname='ordres_fabrication_tenant_select') THEN
    CREATE POLICY ordres_fabrication_tenant_select ON public.ordres_fabrication
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY ordres_fabrication_tenant_modify ON public.ordres_fabrication
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;

  -- Journaux insert-only : SELECT + INSERT (UPDATE/DELETE bloqués par trigger).
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='consommations_of' AND policyname='consommations_of_tenant_select') THEN
    CREATE POLICY consommations_of_tenant_select ON public.consommations_of
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY consommations_of_tenant_insert ON public.consommations_of
      FOR INSERT WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='productions_of' AND policyname='productions_of_tenant_select') THEN
    CREATE POLICY productions_of_tenant_select ON public.productions_of
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY productions_of_tenant_insert ON public.productions_of
      FOR INSERT WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;
