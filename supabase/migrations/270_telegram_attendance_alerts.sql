-- Migration 270 — Alertes présence employés (Telegram Phase A)
--
-- Pour chaque (employé, jour de planning), on garde l'état de surveillance :
--  - 'pending'      : alerte envoyée, attente d'une action
--  - 'pointed'      : l'employé a pointé (via Telegram ou autre)
--  - 'excused'      : le manager a marqué l'absence comme excusée
--  - 'unjustified'  : le manager a marqué l'absence comme non justifiée
--
-- Le cron `/api/cron/telegram-attendance-watcher` (toutes les 5 min) :
--   - vérifie la présence attendue ce jour-là dans planning_assignments
--   - croise avec les pointages, demandes_conges, statut d'absence
--   - envoie une alerte si > 10 min de retard, max 3 fois par jour par employé.

CREATE TABLE IF NOT EXISTS public.telegram_attendance_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id      UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  employe_id      UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  date_planning   DATE NOT NULL,
  alert_count     INTEGER NOT NULL DEFAULT 0,
  last_alert_at   TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','excused','unjustified','pointed')),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employe_id, date_planning)
);

CREATE INDEX IF NOT EXISTS idx_tg_att_societe ON public.telegram_attendance_alerts(societe_id);
CREATE INDEX IF NOT EXISTS idx_tg_att_date    ON public.telegram_attendance_alerts(date_planning);
CREATE INDEX IF NOT EXISTS idx_tg_att_status  ON public.telegram_attendance_alerts(status);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_att_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tg_att_touch ON public.telegram_attendance_alerts;
CREATE TRIGGER trg_tg_att_touch
  BEFORE UPDATE ON public.telegram_attendance_alerts
  FOR EACH ROW EXECUTE FUNCTION public.tg_att_touch_updated_at();

-- RLS scoped société
ALTER TABLE public.telegram_attendance_alerts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "tg_att_select" ON public.telegram_attendance_alerts;
  CREATE POLICY "tg_att_select" ON public.telegram_attendance_alerts
    FOR SELECT USING (
      societe_id IN (
        SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
      )
    );

  DROP POLICY IF EXISTS "tg_att_write" ON public.telegram_attendance_alerts;
  CREATE POLICY "tg_att_write" ON public.telegram_attendance_alerts
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

COMMENT ON TABLE public.telegram_attendance_alerts IS 'Idempotence + état des alertes Telegram pour les no-shows (max 3 alertes/jour/employé).';
