-- =============================================================================
-- Migration 020 — Messagerie interne Client ↔ Comptable
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.messages_internes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expediteur_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  destinataire_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  societe_id    UUID REFERENCES public.societes(id) ON DELETE SET NULL,
  dossier_id    UUID REFERENCES public.dossiers(id) ON DELETE SET NULL,
  sujet         TEXT,
  corps         TEXT NOT NULL,
  type_message  VARCHAR(30) NOT NULL DEFAULT 'general',
  -- general | demande_document | question_compta | question_paie | question_juridique | urgence
  priorite      VARCHAR(10) NOT NULL DEFAULT 'normale', -- normale | haute | urgente
  lu            BOOLEAN NOT NULL DEFAULT FALSE,
  lu_le         TIMESTAMPTZ,
  document_ref  UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  reponse_a     UUID REFERENCES public.messages_internes(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.messages_internes ENABLE ROW LEVEL SECURITY;

-- Un utilisateur peut voir les messages qu'il a envoyés ou reçus
CREATE POLICY "messages_propres" ON public.messages_internes
  USING (
    auth.uid() = expediteur_id
    OR auth.uid() = destinataire_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_messages_expediteur ON public.messages_internes(expediteur_id);
CREATE INDEX IF NOT EXISTS idx_messages_destinataire ON public.messages_internes(destinataire_id);
CREATE INDEX IF NOT EXISTS idx_messages_societe ON public.messages_internes(societe_id);
CREATE INDEX IF NOT EXISTS idx_messages_lu ON public.messages_internes(lu) WHERE lu = FALSE;
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.messages_internes(created_at DESC);

