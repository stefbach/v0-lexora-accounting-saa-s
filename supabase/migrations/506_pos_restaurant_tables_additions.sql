-- =====================================================================
-- Migration 506 — POS restauration : tables + additions ouvertes
-- =====================================================================
-- Ajoute le modèle « restaurant » au POS : un plan de salle (tables), des
-- additions ouvertes (running tabs) alimentées au fil du service, encaissées
-- via la RPC valider_vente_pos existante (l'addition devient un ticket).
-- 100 % ADDITIF — le POS retail existant n'est pas touché.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.tables_restaurant (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id  uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  depot_id    uuid REFERENCES public.depots(id) ON DELETE SET NULL,
  code        text NOT NULL,
  nom         text,
  zone        text,
  capacite    integer,
  statut      text NOT NULL DEFAULT 'libre' CHECK (statut IN ('libre','occupee','reservee')),
  position_x  integer,
  position_y  integer,
  actif       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (societe_id, code)
);

CREATE TABLE IF NOT EXISTS public.additions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id        uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  depot_id          uuid REFERENCES public.depots(id) ON DELETE SET NULL,
  table_id          uuid REFERENCES public.tables_restaurant(id) ON DELETE SET NULL,
  session_caisse_id uuid REFERENCES public.sessions_caisse(id) ON DELETE SET NULL,
  numero            text,
  statut            text NOT NULL DEFAULT 'ouverte' CHECK (statut IN ('ouverte','encaissee','annulee')),
  couverts          integer,
  note              text,
  vente_pos_id      uuid REFERENCES public.ventes_pos(id) ON DELETE SET NULL,
  cree_par          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  opened_at         timestamptz NOT NULL DEFAULT now(),
  closed_at         timestamptz
);

CREATE TABLE IF NOT EXISTS public.additions_lignes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id       uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  addition_id      uuid NOT NULL REFERENCES public.additions(id) ON DELETE CASCADE,
  produit_id       uuid NOT NULL REFERENCES public.produits(id) ON DELETE RESTRICT,
  quantite         numeric(15,3) NOT NULL CHECK (quantite > 0),
  prix_unitaire_ht numeric(15,2) NOT NULL CHECK (prix_unitaire_ht >= 0),
  remise_pct       numeric(5,2) NOT NULL DEFAULT 0,
  taux_tva         numeric(5,2) NOT NULL DEFAULT 15,
  note             text,
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tables_resto_societe ON public.tables_restaurant(societe_id);
CREATE INDEX IF NOT EXISTS idx_additions_societe_statut ON public.additions(societe_id, statut);
CREATE INDEX IF NOT EXISTS idx_additions_table ON public.additions(table_id) WHERE statut = 'ouverte';
CREATE INDEX IF NOT EXISTS idx_additions_lignes_add ON public.additions_lignes(addition_id);

ALTER TABLE public.tables_restaurant ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.additions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.additions_lignes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tables_restaurant','additions','additions_lignes'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT USING (user_has_societe_access(societe_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_modify ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_modify ON public.%I FOR ALL USING (is_global_admin() OR user_has_societe_access(societe_id)) WITH CHECK (is_global_admin() OR user_has_societe_access(societe_id))', t, t);
  END LOOP;
END $$;

COMMIT;
