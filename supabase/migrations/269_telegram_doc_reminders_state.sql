-- Migration 269 — État des rappels documents (Telegram Phase A)
--
-- Pour chaque (société, type de document, période), on garde l'état :
--  - 'pending'  : pas encore reçu, rappel sera envoyé
--  - 'received' : marqué comme reçu/soumis depuis Telegram (stoppe les rappels)
--  - 'snoozed'  : reporté jusqu'à snoozed_until
--
-- Le cron `/api/cron/telegram-document-reminders` lit cette table avant chaque
-- envoi pour décider si un rappel doit partir.

CREATE TABLE IF NOT EXISTS public.telegram_doc_reminders_state (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id      UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,            -- ex: 'releve_bancaire:<compte_id>', 'tva', 'paye', 'csg', 'factures_clients_brouillon', 'factures_fournisseurs'
  period          TEXT NOT NULL,            -- 'YYYY-MM' (mois concerné)
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','received','snoozed')),
  snoozed_until   TIMESTAMPTZ,
  received_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  received_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(societe_id, type, period)
);

CREATE INDEX IF NOT EXISTS idx_tg_doc_rem_societe ON public.telegram_doc_reminders_state(societe_id);
CREATE INDEX IF NOT EXISTS idx_tg_doc_rem_status  ON public.telegram_doc_reminders_state(status);
CREATE INDEX IF NOT EXISTS idx_tg_doc_rem_period  ON public.telegram_doc_reminders_state(period);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_doc_rem_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tg_doc_rem_touch ON public.telegram_doc_reminders_state;
CREATE TRIGGER trg_tg_doc_rem_touch
  BEFORE UPDATE ON public.telegram_doc_reminders_state
  FOR EACH ROW EXECUTE FUNCTION public.tg_doc_rem_touch_updated_at();

-- RLS scoped société (via user_societes)
ALTER TABLE public.telegram_doc_reminders_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "tg_doc_rem_select" ON public.telegram_doc_reminders_state;
  CREATE POLICY "tg_doc_rem_select" ON public.telegram_doc_reminders_state
    FOR SELECT USING (
      societe_id IN (
        SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
      )
    );

  DROP POLICY IF EXISTS "tg_doc_rem_write" ON public.telegram_doc_reminders_state;
  CREATE POLICY "tg_doc_rem_write" ON public.telegram_doc_reminders_state
    FOR ALL USING (
      societe_id IN (
        SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
      )
    )
    WITH CHECK (
      societe_id IN (
        SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
      )
    );
END $$;

COMMENT ON TABLE  public.telegram_doc_reminders_state IS 'État des rappels documents envoyés via Telegram (idempotence côté business).';
COMMENT ON COLUMN public.telegram_doc_reminders_state.type   IS 'Type de document attendu — utilise une clé compacte (ex: releve_bancaire:<compte_id>, tva, paye, csg).';
COMMENT ON COLUMN public.telegram_doc_reminders_state.period IS 'Mois concerné au format YYYY-MM.';
