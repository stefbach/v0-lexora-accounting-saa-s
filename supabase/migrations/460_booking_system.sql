-- =====================================================================
-- Migration 460 — Système de prise de RDV publique (Calendly-like)
-- =====================================================================
-- Permet à un utilisateur Lexora (owner — typiquement direction/admin)
-- d'exposer une page publique /rdv où des prospects peuvent prendre RDV
-- (démo en ligne ou présentiel). Intégration Google Calendar via les
-- tokens user_oauth_accounts existants.
--
-- 2 tables :
--   - booking_settings : config par owner (agenda Google, jours/heures
--     ouvrés, durée slot, mode online/présentiel, modèles)
--   - bookings : RDV pris par les prospects (event Google + meta prospect)
--
-- Pas de RLS sur bookings côté API publique : les endpoints utilisent
-- l'admin client (service role) et appliquent les contrôles côté code.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.booking_settings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id            UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Agenda Google à utiliser (account_email d'un compte user_oauth_accounts
  -- avec scopes calendar + gmail.send idéalement)
  google_account_email     TEXT NOT NULL,
  calendar_id              TEXT NOT NULL DEFAULT 'primary',

  -- Page publique
  slug                     TEXT NOT NULL UNIQUE DEFAULT 'rdv',  -- /rdv/<slug> (ou /rdv si défaut)
  page_title               TEXT NOT NULL DEFAULT 'Prendre rendez-vous avec Lexora',
  page_subtitle            TEXT,
  page_intro               TEXT,  -- Markdown court — affiché au-dessus du sélecteur

  -- Durée et créneaux
  duration_minutes         INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes IN (15, 30, 45, 60, 90)),
  slot_interval_minutes    INTEGER NOT NULL DEFAULT 30 CHECK (slot_interval_minutes IN (15, 30, 60)),
  buffer_before_minutes    INTEGER NOT NULL DEFAULT 0,
  buffer_after_minutes     INTEGER NOT NULL DEFAULT 0,
  min_notice_hours         INTEGER NOT NULL DEFAULT 4,         -- pas de RDV à moins de Xh
  max_advance_days         INTEGER NOT NULL DEFAULT 30,        -- ouverture sur N jours

  -- Disponibilité (JSON pour flexibilité)
  -- working_days : array de strings 'mon','tue','wed','thu','fri','sat','sun'
  working_days             TEXT[] NOT NULL DEFAULT ARRAY['mon','tue','wed','thu','fri'],
  -- working_hours_start / end : format "HH:MM" Maurice (Indian/Mauritius)
  working_hours_start      TEXT NOT NULL DEFAULT '09:00',
  working_hours_end        TEXT NOT NULL DEFAULT '17:00',
  lunch_break_start        TEXT,                                  -- ex '12:00'
  lunch_break_end          TEXT,                                  -- ex '13:00'
  timezone                 TEXT NOT NULL DEFAULT 'Indian/Mauritius',

  -- Lieux disponibles
  location_online_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  location_in_person_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  in_person_address        TEXT,                                  -- affiché si présentiel activé

  -- Modèles d'event Google Calendar
  event_title_template     TEXT NOT NULL DEFAULT 'Démo Lexora — {prospect_name}',
  event_description_template TEXT NOT NULL DEFAULT 'Démo Lexora demandée par {prospect_name} ({prospect_email}).\nSociété : {prospect_company}\n\nMessage :\n{notes}',

  -- Notifications quand un RDV est pris
  notify_via_email         BOOLEAN NOT NULL DEFAULT TRUE,
  notify_via_telegram      BOOLEAN NOT NULL DEFAULT TRUE,
  notify_email             TEXT,                                  -- destinataire (sinon = owner email)

  active                   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_settings_slug ON public.booking_settings(slug) WHERE active = TRUE;

CREATE OR REPLACE FUNCTION public.booking_settings_touch() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_booking_settings_touch ON public.booking_settings;
CREATE TRIGGER trg_booking_settings_touch BEFORE UPDATE ON public.booking_settings
  FOR EACH ROW EXECUTE FUNCTION public.booking_settings_touch();

-- L'utilisateur lit/modifie ses propres settings ; les anons peuvent
-- lire les settings actifs via le slug (page publique).
ALTER TABLE public.booking_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_settings_owner_all ON public.booking_settings;
CREATE POLICY booking_settings_owner_all ON public.booking_settings
  FOR ALL USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS booking_settings_public_read ON public.booking_settings;
CREATE POLICY booking_settings_public_read ON public.booking_settings
  FOR SELECT TO anon, authenticated USING (active = TRUE);

-- =====================================================================
-- bookings : un RDV pris par un prospect
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.bookings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  settings_id              UUID NOT NULL REFERENCES public.booking_settings(id) ON DELETE CASCADE,

  -- Prospect (saisi sur la page publique)
  prospect_name            TEXT NOT NULL,
  prospect_email           TEXT NOT NULL,
  prospect_phone           TEXT,
  prospect_company         TEXT,
  notes                    TEXT,

  -- Créneau (UTC stockés pour cohérence)
  start_at                 TIMESTAMPTZ NOT NULL,
  end_at                   TIMESTAMPTZ NOT NULL,

  -- Lieu choisi
  location_type            TEXT NOT NULL CHECK (location_type IN ('online', 'in_person')),
  in_person_address        TEXT,                                  -- copie pour historique
  meet_url                 TEXT,                                  -- si online

  -- Lien avec Google Calendar
  google_event_id          TEXT,                                  -- id event créé
  google_calendar_id       TEXT,                                  -- calendrier utilisé

  status                   TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show')),
  cancellation_token       TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  cancellation_reason      TEXT,

  -- Anti-double-booking
  CHECK (end_at > start_at),

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_owner_start ON public.bookings(owner_user_id, start_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status, start_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_cancel_token ON public.bookings(cancellation_token);

DROP TRIGGER IF EXISTS trg_bookings_touch ON public.bookings;
CREATE TRIGGER trg_bookings_touch BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.booking_settings_touch();

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bookings_owner_all ON public.bookings;
CREATE POLICY bookings_owner_all ON public.bookings
  FOR ALL USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

-- Pas de SELECT public — les prospects ne voient que leur propre booking
-- via le cancellation_token (logique côté endpoint).

DO $$ BEGIN
  RAISE NOTICE '[460] Booking system créé : booking_settings + bookings.';
END $$;
