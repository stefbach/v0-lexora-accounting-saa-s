-- ═══════════════════════════════════════════════════════════════════════
-- Migration 238: Relances automatiques de factures clients impayées
--
-- Permet d'envoyer (manuellement ou via cron quotidien) des relances
-- multi-canaux (email + WhatsApp) sur les factures clients en retard.
-- 3 niveaux configurables par société (défauts J+7 / J+15 / J+30).
--
-- L'historique factures_relances trace chaque envoi (date, canal,
-- destinataire, statut, erreur) — sert aussi à savoir où on en est
-- pour chaque facture (max(niveau) WHERE statut='envoye').
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Table d'historique des relances ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.factures_relances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id    UUID NOT NULL REFERENCES public.factures(id) ON DELETE CASCADE,
  societe_id    UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  niveau        SMALLINT NOT NULL CHECK (niveau BETWEEN 1 AND 3),
  canal         TEXT NOT NULL CHECK (canal IN ('email','whatsapp')),
  statut        TEXT NOT NULL DEFAULT 'envoye'
                CHECK (statut IN ('envoye','echec','planifie','annule')),
  destinataire  TEXT,                 -- email ou n° tel snapshot
  sujet         TEXT,
  message       TEXT,
  error         TEXT,                 -- détail si statut='echec'
  dry_run       BOOLEAN NOT NULL DEFAULT FALSE,
  source        TEXT NOT NULL DEFAULT 'manuel'
                CHECK (source IN ('manuel','cron','api')),
  created_by    UUID,
  date_envoi    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_factures_relances_facture
  ON public.factures_relances(facture_id, niveau DESC, date_envoi DESC);
CREATE INDEX IF NOT EXISTS idx_factures_relances_societe_date
  ON public.factures_relances(societe_id, date_envoi DESC);
-- Pour requête "dernier niveau envoyé non-dry" par facture (utilisé par findFacturesARelancer)
CREATE INDEX IF NOT EXISTS idx_factures_relances_real_sent
  ON public.factures_relances(facture_id, niveau DESC)
  WHERE statut = 'envoye' AND dry_run = FALSE;

-- ── 2. RLS scopée par société ──────────────────────────────────────────
ALTER TABLE public.factures_relances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "factures_relances_select" ON public.factures_relances;
CREATE POLICY "factures_relances_select" ON public.factures_relances
  FOR SELECT USING (
    societe_id IN (
      SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
      UNION
      SELECT d.societe_id FROM public.dossiers d WHERE d.client_id = auth.uid()
      UNION
      SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "factures_relances_modify" ON public.factures_relances;
CREATE POLICY "factures_relances_modify" ON public.factures_relances
  FOR ALL USING (
    societe_id IN (
      SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
      UNION
      SELECT d.societe_id FROM public.dossiers d WHERE d.client_id = auth.uid()
      UNION
      SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
    )
  );

-- ── 3. Config relances par société ─────────────────────────────────────
-- relances_actif       : on/off global pour la société (par défaut false)
-- relances_canaux      : ['email'] | ['whatsapp'] | ['email','whatsapp']
-- relances_delais_jours: nb de jours APRÈS échéance pour déclencher
--                       chaque niveau ; défaut {"1":7,"2":15,"3":30}
ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS relances_actif       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS relances_canaux      TEXT[]  NOT NULL DEFAULT ARRAY['email']::text[],
  ADD COLUMN IF NOT EXISTS relances_delais_jours JSONB  NOT NULL DEFAULT '{"1":7,"2":15,"3":30}'::jsonb;

COMMENT ON TABLE  public.factures_relances IS 'Historique des relances de factures clients impayées. 1 ligne par envoi (réel ou dry_run).';
COMMENT ON COLUMN public.factures_relances.niveau IS '1=rappel courtois, 2=relance ferme, 3=mise en demeure. Le délai entre la date d''échéance et le déclenchement est paramétré dans societes.relances_delais_jours.';
COMMENT ON COLUMN public.factures_relances.dry_run IS 'TRUE = simulation (rien n''a été envoyé). Permet de tracer les previews sans polluer l''historique réel.';
COMMENT ON COLUMN public.societes.relances_actif IS 'On/off global des relances automatiques (cron). Les envois manuels via UI restent autorisés même si false.';
COMMENT ON COLUMN public.societes.relances_canaux IS 'Canaux par défaut utilisés par le cron pour cette société.';
