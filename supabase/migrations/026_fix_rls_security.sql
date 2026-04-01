-- ============================================================
-- Migration 026_fix_rls_security: Fix USING(true) RLS policies
-- on notifications, simulations, and comptes_bancaires
-- ============================================================

-- ============================================================
-- 1. NOTIFICATIONS — users can only see their own notifications
-- ============================================================

-- Drop existing overly-permissive policy
DROP POLICY IF EXISTS "manage_notifs" ON public.notifications;

-- Admin / comptable: full access
CREATE POLICY "admin_comptable_manage_notifs" ON public.notifications
  FOR ALL USING (
    public.get_my_role() IN ('admin', 'super_admin', 'comptable', 'comptable_dedie')
  );

-- All other users: can only see notifications addressed to them
CREATE POLICY "user_read_own_notifs" ON public.notifications
  FOR SELECT USING (
    destinataire_id = auth.uid()
  );

-- Allow users to update their own notifications (mark as read)
CREATE POLICY "user_update_own_notifs" ON public.notifications
  FOR UPDATE USING (
    destinataire_id = auth.uid()
  ) WITH CHECK (
    destinataire_id = auth.uid()
  );

-- ============================================================
-- 2. SIMULATIONS — users can only see their own or their société's
-- ============================================================

-- Drop existing overly-permissive policy
DROP POLICY IF EXISTS "manage_sims" ON public.simulations;

-- Admin / comptable: full access
CREATE POLICY "admin_comptable_manage_sims" ON public.simulations
  FOR ALL USING (
    public.get_my_role() IN ('admin', 'super_admin', 'comptable', 'comptable_dedie')
  );

-- Users can see simulations they created
CREATE POLICY "user_read_own_sims" ON public.simulations
  FOR SELECT USING (
    cree_par_id = auth.uid()
  );

-- Users can see simulations for sociétés they have access to via dossiers
CREATE POLICY "user_read_societe_sims" ON public.simulations
  FOR SELECT USING (
    societe_id IN (
      SELECT d.societe_id FROM public.dossiers d WHERE d.client_id = auth.uid()
      UNION
      SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
      UNION
      SELECT s.id FROM public.societes s
        JOIN public.clients c ON s.client_id = c.id
        WHERE c.user_id = auth.uid()
    )
  );

-- Users can insert simulations for their sociétés
CREATE POLICY "user_insert_sims" ON public.simulations
  FOR INSERT WITH CHECK (
    cree_par_id = auth.uid()
    AND (
      societe_id IN (
        SELECT d.societe_id FROM public.dossiers d WHERE d.client_id = auth.uid()
        UNION
        SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
        UNION
        SELECT s.id FROM public.societes s
          JOIN public.clients c ON s.client_id = c.id
          WHERE c.user_id = auth.uid()
      )
    )
  );

-- Users can update their own simulations
CREATE POLICY "user_update_own_sims" ON public.simulations
  FOR UPDATE USING (
    cree_par_id = auth.uid()
  ) WITH CHECK (
    cree_par_id = auth.uid()
  );

-- Users can delete their own simulations
CREATE POLICY "user_delete_own_sims" ON public.simulations
  FOR DELETE USING (
    cree_par_id = auth.uid()
  );

-- ============================================================
-- 3. COMPTES_BANCAIRES — proper client + comptable RLS
-- ============================================================

-- Drop existing policies to recreate with proper access
DROP POLICY IF EXISTS "manage_comptes_bancaires" ON public.comptes_bancaires;
DROP POLICY IF EXISTS "client_read_comptes_bancaires" ON public.comptes_bancaires;

-- Admin: full access to all bank accounts
CREATE POLICY "admin_manage_comptes_bancaires" ON public.comptes_bancaires
  FOR ALL USING (
    public.get_my_role() IN ('admin', 'super_admin')
  );

-- Comptable: full access to bank accounts for their assigned clients
CREATE POLICY "comptable_manage_comptes_bancaires" ON public.comptes_bancaires
  FOR ALL USING (
    public.get_my_role() IN ('comptable', 'comptable_dedie')
    AND (
      -- Sociétés assigned to this comptable directly
      societe_id IN (
        SELECT s.id FROM public.societes s WHERE s.comptable_id = auth.uid()
      )
      OR
      -- Sociétés assigned via dossiers
      societe_id IN (
        SELECT d.societe_id FROM public.dossiers d WHERE d.comptable_id = auth.uid()
      )
    )
  );

-- Clients: can read bank accounts linked to their sociétés
CREATE POLICY "client_read_comptes_bancaires" ON public.comptes_bancaires
  FOR SELECT USING (
    public.get_my_role() IN ('client_admin', 'client_user')
    AND societe_id IN (
      -- Via dossiers (client_id on dossier)
      SELECT d.societe_id FROM public.dossiers d WHERE d.client_id = auth.uid()
      UNION
      -- Via societes.created_by (owner)
      SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
      UNION
      -- Via clients table → societes.client_id
      SELECT s.id FROM public.societes s
        JOIN public.clients c ON s.client_id = c.id
        WHERE c.user_id = auth.uid()
    )
  );

-- Direction: read access to all bank accounts
CREATE POLICY "direction_read_comptes_bancaires" ON public.comptes_bancaires
  FOR SELECT USING (
    public.get_my_role() IN ('direction')
  );
