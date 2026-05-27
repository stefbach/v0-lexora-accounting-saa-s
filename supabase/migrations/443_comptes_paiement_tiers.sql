-- =============================================================================
-- Migration 443 — Comptes de paiement tiers (règlements hors banque)
-- =============================================================================
-- CONTEXTE :
--   Une facture (fournisseur ou client) peut être réglée hors du compte
--   bancaire de la société, par exemple :
--     • Un associé paie un fournisseur depuis ses fonds personnels
--       → la société doit à l'associé : compte courant associé (455)
--     • Une société sœur du groupe règle pour le compte de la société
--       → compte de liaison inter-sociétés (451)
--     • L'exploitant règle via sa carte personnelle
--       → compte personnel exploitant (108)
--
--   Dans tous ces cas, l'écriture comptable est :
--     D 401/411 (solde la dette/créance envers le fournisseur/client)
--     C <compte_tiers> (création/augmentation de la dette envers le tiers)
--
-- STRATÉGIE :
--   Whitelist par société des comptes de paiement tiers autorisés.
--   Évite la saisie libre qui pourrait imputer par erreur sur 401 ou 411.
--
--   Le code de compte (455, 451, 108, etc.) est libre — l'utilisateur
--   choisit ce qui correspond à son plan comptable. Le libellé permet
--   d'identifier le tiers (« CCA Stéphane Bach », « Groupe XYZ », etc.).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.comptes_paiement_tiers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id    UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  code_compte   TEXT NOT NULL CHECK (code_compte ~ '^[0-9]{3,8}$'),
  nom_compte    TEXT NOT NULL CHECK (length(trim(nom_compte)) > 0),
  type          TEXT NOT NULL DEFAULT 'tiers'
                CHECK (type IN ('associe', 'societe_liee', 'exploitant', 'tiers')),
  actif         BOOLEAN NOT NULL DEFAULT true,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (societe_id, code_compte, nom_compte)
);

CREATE INDEX IF NOT EXISTS idx_cpt_societe_actif
  ON public.comptes_paiement_tiers (societe_id, actif);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_cpt_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_cpt_set_updated_at ON public.comptes_paiement_tiers;
CREATE TRIGGER tg_cpt_set_updated_at
  BEFORE UPDATE ON public.comptes_paiement_tiers
  FOR EACH ROW EXECUTE FUNCTION public.tg_cpt_set_updated_at();

-- RLS — accès via helper user_has_societe_access (SEC-003)
ALTER TABLE public.comptes_paiement_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cpt_select ON public.comptes_paiement_tiers;
CREATE POLICY cpt_select ON public.comptes_paiement_tiers
  FOR SELECT USING (public.user_has_societe_access(societe_id));

DROP POLICY IF EXISTS cpt_insert ON public.comptes_paiement_tiers;
CREATE POLICY cpt_insert ON public.comptes_paiement_tiers
  FOR INSERT WITH CHECK (public.user_has_societe_access(societe_id));

DROP POLICY IF EXISTS cpt_update ON public.comptes_paiement_tiers;
CREATE POLICY cpt_update ON public.comptes_paiement_tiers
  FOR UPDATE USING (public.user_has_societe_access(societe_id))
  WITH CHECK (public.user_has_societe_access(societe_id));

DROP POLICY IF EXISTS cpt_delete ON public.comptes_paiement_tiers;
CREATE POLICY cpt_delete ON public.comptes_paiement_tiers
  FOR DELETE USING (public.user_has_societe_access(societe_id));

COMMENT ON TABLE public.comptes_paiement_tiers IS
'Whitelist des comptes de tiers autorisés pour les règlements hors banque. Utilisé par /api/comptable/factures/regler-hors-banque pour empêcher la saisie libre.';
