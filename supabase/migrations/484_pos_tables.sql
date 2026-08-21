-- =====================================================================
-- Migration 484 — Point de vente (Module B, MVP) : tables
-- =====================================================================
-- Réf. spec : docs/roadmap/inventaire-pos.md §2.2.
--
-- Tables créées :
--   • sessions_caisse — un shift de caisse (ouverture/fermeture, écart)
--   • ventes_pos      — ticket de caisse (flux itemisé autonome, hors `factures`)
--   • lignes_vente_pos — lignes du ticket (COGS au CUMP capturé à la vente)
--   • paiements_pos   — encaissements multi-moyens d'un ticket
--
-- Écritures : générées côté API (journal POS, ref_folio POS-<vente_id>) ;
-- la déduction de stock passe par la RPC appliquer_mouvement_stock
-- (migration 482) appelée depuis valider_vente_pos (migration 486).
--
-- RLS : SEC-003 — user_has_societe_access(societe_id) exclusivement
-- (societe_id dénormalisé sur les tables filles pour rester dans ce cadre).
-- Idempotente et additive.
-- =====================================================================

-- ── 1. sessions_caisse ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sessions_caisse (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id               UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  depot_id                 UUID NOT NULL REFERENCES public.depots(id) ON DELETE RESTRICT,
  caissier_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  statut                   TEXT NOT NULL DEFAULT 'ouverte' CHECK (statut IN ('ouverte','fermee')),
  fond_ouverture           NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (fond_ouverture >= 0),
  fond_fermeture_theorique NUMERIC(15,2),
  fond_fermeture_compte    NUMERIC(15,2),
  ecart_caisse             NUMERIC(15,2) GENERATED ALWAYS AS
                             (fond_fermeture_compte - fond_fermeture_theorique) STORED,
  ouverte_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  fermee_at                TIMESTAMPTZ,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_caisse_societe_statut
  ON public.sessions_caisse(societe_id, statut);
-- Un caissier n'a qu'une seule session ouverte à la fois par société.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_caisse_ouverte_par_caissier
  ON public.sessions_caisse(societe_id, caissier_id) WHERE statut = 'ouverte';

-- ── 2. ventes_pos (ticket) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ventes_pos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id        UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  session_caisse_id UUID NOT NULL REFERENCES public.sessions_caisse(id) ON DELETE RESTRICT,
  depot_id          UUID NOT NULL REFERENCES public.depots(id) ON DELETE RESTRICT,
  numero_ticket     TEXT NOT NULL,
  client_id         UUID REFERENCES public.factures_contacts(id) ON DELETE SET NULL,
  facture_id        UUID REFERENCES public.factures(id) ON DELETE SET NULL,
  date_vente        TIMESTAMPTZ NOT NULL DEFAULT now(),
  montant_ht        NUMERIC(15,2) NOT NULL DEFAULT 0,
  montant_tva       NUMERIC(15,2) NOT NULL DEFAULT 0,
  montant_ttc       NUMERIC(15,2) NOT NULL DEFAULT 0,
  statut            TEXT NOT NULL DEFAULT 'validee' CHECK (statut IN
                      ('brouillon','validee','annulee','remboursee','remboursee_partiel')),
  cree_par          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (societe_id, numero_ticket)
);

CREATE INDEX IF NOT EXISTS idx_ventes_pos_societe_date
  ON public.ventes_pos(societe_id, date_vente);
CREATE INDEX IF NOT EXISTS idx_ventes_pos_session
  ON public.ventes_pos(session_caisse_id);

-- ── 3. lignes_vente_pos ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lignes_vente_pos (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id         UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  vente_pos_id       UUID NOT NULL REFERENCES public.ventes_pos(id) ON DELETE CASCADE,
  produit_id         UUID NOT NULL REFERENCES public.produits(id) ON DELETE RESTRICT,
  quantite           NUMERIC(15,3) NOT NULL CHECK (quantite > 0),
  prix_unitaire_ht   NUMERIC(15,2) NOT NULL CHECK (prix_unitaire_ht >= 0),
  remise_pct         NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (remise_pct >= 0 AND remise_pct <= 100),
  taux_tva           NUMERIC(5,2) NOT NULL DEFAULT 15 CHECK (taux_tva >= 0),
  montant_ht         NUMERIC(15,2) NOT NULL,
  montant_tva        NUMERIC(15,2) NOT NULL,
  montant_ttc        NUMERIC(15,2) NOT NULL,
  -- CUMP capturé au moment de la vente (COGS) — renseigné par valider_vente_pos
  cout_unitaire_cump NUMERIC(15,4),
  mouvement_stock_id UUID REFERENCES public.mouvements_stock(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lignes_vente_pos_vente
  ON public.lignes_vente_pos(vente_pos_id);
CREATE INDEX IF NOT EXISTS idx_lignes_vente_pos_produit
  ON public.lignes_vente_pos(produit_id);

-- ── 4. paiements_pos ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.paiements_pos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id       UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  vente_pos_id     UUID NOT NULL REFERENCES public.ventes_pos(id) ON DELETE CASCADE,
  moyen_paiement   TEXT NOT NULL CHECK (moyen_paiement IN
                     ('especes','carte','mobile_money','virement')),
  montant          NUMERIC(15,2) NOT NULL CHECK (montant > 0),
  reference        TEXT,
  compte_comptable VARCHAR(10) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paiements_pos_vente
  ON public.paiements_pos(vente_pos_id);
CREATE INDEX IF NOT EXISTS idx_paiements_pos_societe_moyen
  ON public.paiements_pos(societe_id, moyen_paiement);

-- ── 5. Trigger updated_at (réutilise la fonction de la migration 481) ─
DROP TRIGGER IF EXISTS trg_sessions_caisse_touch ON public.sessions_caisse;
CREATE TRIGGER trg_sessions_caisse_touch BEFORE UPDATE ON public.sessions_caisse
  FOR EACH ROW EXECUTE FUNCTION public.inventaire_touch_updated_at();

-- ── 6. RLS — SEC-003 ─────────────────────────────────────────────────
ALTER TABLE public.sessions_caisse  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventes_pos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lignes_vente_pos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paiements_pos    ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sessions_caisse' AND policyname='sessions_caisse_tenant_select') THEN
    CREATE POLICY sessions_caisse_tenant_select ON public.sessions_caisse
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY sessions_caisse_tenant_modify ON public.sessions_caisse
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ventes_pos' AND policyname='ventes_pos_tenant_select') THEN
    CREATE POLICY ventes_pos_tenant_select ON public.ventes_pos
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY ventes_pos_tenant_modify ON public.ventes_pos
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='lignes_vente_pos' AND policyname='lignes_vente_pos_tenant_select') THEN
    CREATE POLICY lignes_vente_pos_tenant_select ON public.lignes_vente_pos
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY lignes_vente_pos_tenant_modify ON public.lignes_vente_pos
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='paiements_pos' AND policyname='paiements_pos_tenant_select') THEN
    CREATE POLICY paiements_pos_tenant_select ON public.paiements_pos
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY paiements_pos_tenant_modify ON public.paiements_pos
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;
