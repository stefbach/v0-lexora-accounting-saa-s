-- ============================================================
-- Migration 032: Fix bank RLS + client read access
-- ============================================================
-- Problème : clients ne peuvent pas lire comptes_bancaires / releves_bancaires
-- même si l'API utilise le service role key, certaines requêtes côté client
-- peuvent passer par le client Supabase auth (RLS actif)
-- Solution : ajouter policies de lecture pour les clients sur leurs sociétés

-- 1. comptes_bancaires : clients peuvent lire leurs propres comptes
DROP POLICY IF EXISTS "client_read_comptes_bancaires" ON public.comptes_bancaires;
CREATE POLICY "client_read_comptes_bancaires" ON public.comptes_bancaires
  FOR SELECT USING (
    public.get_my_role() IN ('admin','comptable','comptable_dedie','direction')
    OR (
      public.get_my_role() IN ('client_admin','client_user')
      AND societe_id IN (
        SELECT societe_id FROM public.dossiers WHERE client_id = auth.uid()
        UNION
        SELECT id FROM public.societes WHERE created_by = auth.uid()
      )
    )
  );

-- 2. releves_bancaires : clients peuvent lire leurs relevés
DROP POLICY IF EXISTS "client_read_releves_bancaires" ON public.releves_bancaires;
CREATE POLICY "client_read_releves_bancaires" ON public.releves_bancaires
  FOR SELECT USING (
    public.get_my_role() IN ('admin','comptable','comptable_dedie','direction')
    OR (
      public.get_my_role() IN ('client_admin','client_user')
      AND societe_id IN (
        SELECT societe_id FROM public.dossiers WHERE client_id = auth.uid()
        UNION
        SELECT id FROM public.societes WHERE created_by = auth.uid()
      )
    )
  );

-- 3. Vérifier que la colonne transactions_json existe bien
ALTER TABLE public.releves_bancaires
  ADD COLUMN IF NOT EXISTS transactions_json JSONB DEFAULT '[]'::jsonb;

-- 4. comptes_bancaires : s'assurer que actif a une valeur par défaut
ALTER TABLE public.comptes_bancaires
  ALTER COLUMN actif SET DEFAULT true;

-- 5. Index pour accélerer les lookups par societe
CREATE INDEX IF NOT EXISTS idx_comptes_bancaires_societe_actif
  ON public.comptes_bancaires(societe_id, actif)
  WHERE actif = true;

CREATE INDEX IF NOT EXISTS idx_releves_bancaires_societe
  ON public.releves_bancaires(societe_id);
