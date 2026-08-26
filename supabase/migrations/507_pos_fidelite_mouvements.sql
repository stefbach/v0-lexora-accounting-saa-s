-- =====================================================================
-- Migration 507 — POS fidélité : registre des mouvements de points
-- =====================================================================
-- Programme de fidélité client au POS. Modèle auditable : chaque variation
-- de points est un mouvement (gain sur vente, utilisation, ajustement) ; le
-- solde d'un client est la somme de ses mouvements. 100 % ADDITIF.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.pos_fidelite_mouvements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id    uuid NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL REFERENCES public.factures_contacts(id) ON DELETE CASCADE,
  vente_pos_id  uuid REFERENCES public.ventes_pos(id) ON DELETE SET NULL,
  points        integer NOT NULL,
  type          text NOT NULL DEFAULT 'gain' CHECK (type IN ('gain','utilisation','ajustement')),
  motif         text,
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Un seul mouvement de gain par ticket (idempotence).
  UNIQUE (vente_pos_id, type)
);

CREATE INDEX IF NOT EXISTS idx_fidelite_societe_client
  ON public.pos_fidelite_mouvements(societe_id, client_id);

ALTER TABLE public.pos_fidelite_mouvements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_fidelite_mouvements_select ON public.pos_fidelite_mouvements;
CREATE POLICY pos_fidelite_mouvements_select ON public.pos_fidelite_mouvements
  FOR SELECT USING (user_has_societe_access(societe_id));

DROP POLICY IF EXISTS pos_fidelite_mouvements_modify ON public.pos_fidelite_mouvements;
CREATE POLICY pos_fidelite_mouvements_modify ON public.pos_fidelite_mouvements
  FOR ALL
  USING (is_global_admin() OR user_has_societe_access(societe_id))
  WITH CHECK (is_global_admin() OR user_has_societe_access(societe_id));

COMMIT;
