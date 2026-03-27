-- ============================================================
-- Migration 012: Exchange rates table
-- Stores daily exchange rates fetched from external API
-- Base currency: MUR (Mauritian Rupee)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.taux_change (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  devise TEXT NOT NULL,
  taux NUMERIC(12,4) NOT NULL,
  date_taux DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT DEFAULT 'exchangerate-api',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(devise, date_taux)
);

CREATE INDEX idx_taux_change_date ON public.taux_change(date_taux DESC);
CREATE INDEX idx_taux_change_devise ON public.taux_change(devise);

-- Insert fallback rates (Bank of Mauritius reference)
INSERT INTO public.taux_change (devise, taux, date_taux, source) VALUES
  ('EUR', 46.50, CURRENT_DATE, 'fallback'),
  ('GBP', 54.20, CURRENT_DATE, 'fallback'),
  ('USD', 44.80, CURRENT_DATE, 'fallback')
ON CONFLICT (devise, date_taux) DO NOTHING;
