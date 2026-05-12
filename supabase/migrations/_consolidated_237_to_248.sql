-- ═══════════════════════════════════════════════════════════════════════
-- LEXORA — Script consolidé migrations 237 → 248
--
-- À lancer EN UNE FOIS dans Supabase Studio SQL editor.
-- Toutes les migrations sont idempotentes (IF NOT EXISTS / DO BEGIN
-- IF EXISTS) — safe à relancer plusieurs fois sans casser quoi que
-- ce soit.
--
-- Ordre fixe :
--   237 paiements partiels      241 récurrence factures   245 BRN/KBIS
--   238 relances factures        242 logos bucket          246 adresse structurée
--   239 catalogue services       243 facture settings      247 numérotation tous types
--   240 contacts actif           244 tiers OCR fields      248 MRA audit logs
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 237 — factures_paiements (paiements partiels)
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.factures_paiements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id    UUID NOT NULL REFERENCES public.factures(id) ON DELETE CASCADE,
  societe_id    UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  montant       NUMERIC(15,2) NOT NULL CHECK (montant > 0),
  montant_mur   NUMERIC(15,2) NOT NULL CHECK (montant_mur > 0),
  devise        TEXT NOT NULL DEFAULT 'MUR',
  taux_change   NUMERIC(12,6) NOT NULL DEFAULT 1 CHECK (taux_change > 0),
  date_paiement DATE NOT NULL,
  mode_paiement TEXT NOT NULL DEFAULT 'virement'
                CHECK (mode_paiement IN ('virement','cheque','espece','carte','prelevement','autre')),
  reference     TEXT,
  notes         TEXT,
  ecriture_id   UUID,
  rapproche_releve_id UUID,
  source        TEXT NOT NULL DEFAULT 'manuel'
                CHECK (source IN ('manuel','rapprochement','backfill')),
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_factures_paiements_facture
  ON public.factures_paiements(facture_id);
CREATE INDEX IF NOT EXISTS idx_factures_paiements_societe_date
  ON public.factures_paiements(societe_id, date_paiement DESC);

ALTER TABLE public.factures_paiements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "factures_paiements_select" ON public.factures_paiements;
CREATE POLICY "factures_paiements_select" ON public.factures_paiements
  FOR SELECT USING (
    societe_id IN (
      SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
      UNION SELECT d.societe_id FROM public.dossiers d WHERE d.client_id = auth.uid()
      UNION SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "factures_paiements_modify" ON public.factures_paiements;
CREATE POLICY "factures_paiements_modify" ON public.factures_paiements
  FOR ALL USING (
    societe_id IN (
      SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
      UNION SELECT d.societe_id FROM public.dossiers d WHERE d.client_id = auth.uid()
      UNION SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.recompute_facture_paiement_state()
RETURNS TRIGGER AS $$
DECLARE
  v_facture_id   UUID;
  v_total_mur    NUMERIC(15,2);
  v_paye_mur     NUMERIC(15,2);
  v_solde        NUMERIC(15,2);
  v_statut_actuel TEXT;
  v_statut_cible  TEXT;
  v_echeance     DATE;
BEGIN
  v_facture_id := COALESCE(NEW.facture_id, OLD.facture_id);
  IF v_facture_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT COALESCE(f.montant_mur, f.montant_ttc, 0), f.statut, f.date_echeance
  INTO v_total_mur, v_statut_actuel, v_echeance
  FROM public.factures f WHERE f.id = v_facture_id;
  IF NOT FOUND OR v_statut_actuel = 'annule' THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT COALESCE(SUM(montant_mur), 0) INTO v_paye_mur
  FROM public.factures_paiements WHERE facture_id = v_facture_id;
  v_solde := GREATEST(v_total_mur - v_paye_mur, 0);
  IF v_paye_mur >= (v_total_mur - 1) THEN v_statut_cible := 'paye';
  ELSIF v_paye_mur > 1 THEN v_statut_cible := 'partiel';
  ELSIF v_echeance IS NOT NULL AND v_echeance < CURRENT_DATE THEN v_statut_cible := 'retard';
  ELSE v_statut_cible := 'en_attente';
  END IF;
  UPDATE public.factures SET solde_non_paye = v_solde, statut = v_statut_cible, updated_at = NOW() WHERE id = v_facture_id;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_factures_paiements_recompute ON public.factures_paiements;
CREATE TRIGGER trg_factures_paiements_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.factures_paiements
  FOR EACH ROW EXECUTE FUNCTION public.recompute_facture_paiement_state();

CREATE OR REPLACE FUNCTION public.tg_factures_paiements_touch_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_factures_paiements_updated_at ON public.factures_paiements;
CREATE TRIGGER trg_factures_paiements_updated_at
  BEFORE UPDATE ON public.factures_paiements
  FOR EACH ROW EXECUTE FUNCTION public.tg_factures_paiements_touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- 238 — factures_relances
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.factures_relances (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id    UUID NOT NULL REFERENCES public.factures(id) ON DELETE CASCADE,
  societe_id    UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  niveau        SMALLINT NOT NULL CHECK (niveau BETWEEN 1 AND 3),
  canal         TEXT NOT NULL CHECK (canal IN ('email','whatsapp')),
  statut        TEXT NOT NULL DEFAULT 'envoye'
                CHECK (statut IN ('envoye','echec','planifie','annule')),
  destinataire  TEXT,
  sujet         TEXT,
  message       TEXT,
  error         TEXT,
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
CREATE INDEX IF NOT EXISTS idx_factures_relances_real_sent
  ON public.factures_relances(facture_id, niveau DESC)
  WHERE statut = 'envoye' AND dry_run = FALSE;

ALTER TABLE public.factures_relances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "factures_relances_select" ON public.factures_relances;
CREATE POLICY "factures_relances_select" ON public.factures_relances FOR SELECT USING (
  societe_id IN (
    SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
    UNION SELECT d.societe_id FROM public.dossiers d WHERE d.client_id = auth.uid()
    UNION SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
  )
);
DROP POLICY IF EXISTS "factures_relances_modify" ON public.factures_relances;
CREATE POLICY "factures_relances_modify" ON public.factures_relances FOR ALL USING (
  societe_id IN (
    SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
    UNION SELECT d.societe_id FROM public.dossiers d WHERE d.client_id = auth.uid()
    UNION SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
  )
);

ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS relances_actif       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS relances_canaux      TEXT[]  NOT NULL DEFAULT ARRAY['email']::text[],
  ADD COLUMN IF NOT EXISTS relances_delais_jours JSONB  NOT NULL DEFAULT '{"1":7,"2":15,"3":30}'::jsonb;

-- ─────────────────────────────────────────────────────────────────────
-- 239 — factures_catalogue (unite + actif + RLS scopée)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.factures_catalogue
  ADD COLUMN IF NOT EXISTS unite      TEXT NOT NULL DEFAULT 'Forfait',
  ADD COLUMN IF NOT EXISTS actif      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION public.tg_factures_catalogue_touch_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_factures_catalogue_updated_at ON public.factures_catalogue;
CREATE TRIGGER trg_factures_catalogue_updated_at
  BEFORE UPDATE ON public.factures_catalogue
  FOR EACH ROW EXECUTE FUNCTION public.tg_factures_catalogue_touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_factures_catalogue_societe_actif
  ON public.factures_catalogue(societe_id, actif) WHERE actif = TRUE;

DROP POLICY IF EXISTS "fcat_auth" ON public.factures_catalogue;
DROP POLICY IF EXISTS "factures_catalogue_select" ON public.factures_catalogue;
CREATE POLICY "factures_catalogue_select" ON public.factures_catalogue FOR SELECT USING (
  societe_id IN (
    SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
    UNION SELECT d.societe_id FROM public.dossiers d WHERE d.client_id = auth.uid()
    UNION SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
  )
);
DROP POLICY IF EXISTS "factures_catalogue_modify" ON public.factures_catalogue;
CREATE POLICY "factures_catalogue_modify" ON public.factures_catalogue FOR ALL USING (
  societe_id IN (
    SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
    UNION SELECT d.societe_id FROM public.dossiers d WHERE d.client_id = auth.uid()
    UNION SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS "fc_auth" ON public.factures_contacts;
DROP POLICY IF EXISTS "factures_contacts_select" ON public.factures_contacts;
CREATE POLICY "factures_contacts_select" ON public.factures_contacts FOR SELECT USING (
  societe_id IN (
    SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
    UNION SELECT d.societe_id FROM public.dossiers d WHERE d.client_id = auth.uid()
    UNION SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
  )
);
DROP POLICY IF EXISTS "factures_contacts_modify" ON public.factures_contacts;
CREATE POLICY "factures_contacts_modify" ON public.factures_contacts FOR ALL USING (
  societe_id IN (
    SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
    UNION SELECT d.societe_id FROM public.dossiers d WHERE d.client_id = auth.uid()
    UNION SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
  )
);

-- ─────────────────────────────────────────────────────────────────────
-- 240 — factures_contacts actif + updated_at
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.factures_contacts
  ADD COLUMN IF NOT EXISTS actif      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION public.tg_factures_contacts_touch_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_factures_contacts_updated_at ON public.factures_contacts;
CREATE TRIGGER trg_factures_contacts_updated_at
  BEFORE UPDATE ON public.factures_contacts
  FOR EACH ROW EXECUTE FUNCTION public.tg_factures_contacts_touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_factures_contacts_societe_actif
  ON public.factures_contacts(societe_id, actif) WHERE actif = TRUE;

CREATE INDEX IF NOT EXISTS idx_factures_contacts_nom_lower
  ON public.factures_contacts(societe_id, lower(nom));

-- ─────────────────────────────────────────────────────────────────────
-- 241 — factures_recurrences (colonnes sur factures)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS recurrence_jour_du_mois   INTEGER
    CHECK (recurrence_jour_du_mois IS NULL OR recurrence_jour_du_mois BETWEEN 1 AND 28),
  ADD COLUMN IF NOT EXISTS recurrence_date_debut     DATE,
  ADD COLUMN IF NOT EXISTS recurrence_date_fin       DATE,
  ADD COLUMN IF NOT EXISTS derniere_generation_date  DATE,
  ADD COLUMN IF NOT EXISTS recurrence_template_id    UUID
    REFERENCES public.factures(id) ON DELETE SET NULL;

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name FROM pg_constraint
  WHERE conrelid = 'public.factures'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%statut%';
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.factures DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

ALTER TABLE public.factures
  ADD CONSTRAINT factures_statut_check
  CHECK (statut IN ('en_attente', 'partiel', 'paye', 'retard', 'annule', 'modele'));

UPDATE public.factures SET recurrent_frequence = 'mensuel'
WHERE recurrent = TRUE AND (recurrent_frequence IS NULL
  OR recurrent_frequence NOT IN ('mensuel', 'trimestriel', 'annuel'));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factures_recurrent_frequence_check') THEN
    ALTER TABLE public.factures ADD CONSTRAINT factures_recurrent_frequence_check
    CHECK (recurrent_frequence IS NULL OR recurrent_frequence IN ('mensuel', 'trimestriel', 'annuel'));
  END IF;
END $$;

UPDATE public.factures SET statut = 'modele' WHERE recurrent = TRUE AND statut <> 'modele';

CREATE INDEX IF NOT EXISTS idx_factures_recurrence_active
  ON public.factures(societe_id, derniere_generation_date)
  WHERE recurrent = TRUE AND statut = 'modele';
CREATE INDEX IF NOT EXISTS idx_factures_recurrence_template
  ON public.factures(recurrence_template_id) WHERE recurrence_template_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 242 — societes-logos bucket
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS logo_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('societes-logos', 'societes-logos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "societes_logos_public_read" ON storage.objects;
CREATE POLICY "societes_logos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'societes-logos');

DROP POLICY IF EXISTS "societes_logos_service_write" ON storage.objects;
CREATE POLICY "societes_logos_service_write"
  ON storage.objects FOR ALL
  USING (bucket_id = 'societes-logos' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'societes-logos' AND auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────
-- 243 — societes facture settings
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS website                   TEXT,
  ADD COLUMN IF NOT EXISTS banque_swift              TEXT,
  ADD COLUMN IF NOT EXISTS facture_prefixe           TEXT    DEFAULT 'INV-',
  ADD COLUMN IF NOT EXISTS facture_prochain_numero   INTEGER DEFAULT 1
    CHECK (facture_prochain_numero IS NULL OR facture_prochain_numero >= 1),
  ADD COLUMN IF NOT EXISTS facture_conditions_paiement INTEGER DEFAULT 30
    CHECK (facture_conditions_paiement IS NULL OR (facture_conditions_paiement >= 0 AND facture_conditions_paiement <= 365)),
  ADD COLUMN IF NOT EXISTS facture_footer_text       TEXT,
  ADD COLUMN IF NOT EXISTS facture_mention_legale    TEXT;

-- ─────────────────────────────────────────────────────────────────────
-- 244 — tiers_annuaire email/telephone/adresse
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.tiers_annuaire
  ADD COLUMN IF NOT EXISTS email     TEXT,
  ADD COLUMN IF NOT EXISTS telephone TEXT,
  ADD COLUMN IF NOT EXISTS adresse   TEXT;

CREATE INDEX IF NOT EXISTS idx_tiers_annuaire_email
  ON public.tiers_annuaire(lower(email)) WHERE email IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 245 — factures_contacts BRN/KBIS/site_web
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.factures_contacts
  ADD COLUMN IF NOT EXISTS brn       TEXT,
  ADD COLUMN IF NOT EXISTS kbis      TEXT,
  ADD COLUMN IF NOT EXISTS site_web  TEXT;

CREATE INDEX IF NOT EXISTS idx_factures_contacts_brn
  ON public.factures_contacts(societe_id, brn) WHERE brn IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 246 — factures_contacts adresse structurée + tiers_annuaire idem
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.factures_contacts
  ADD COLUMN IF NOT EXISTS code_postal TEXT,
  ADD COLUMN IF NOT EXISTS ville       TEXT,
  ADD COLUMN IF NOT EXISTS pays        TEXT,
  ADD COLUMN IF NOT EXISTS mobile      TEXT,
  ADD COLUMN IF NOT EXISTS fax         TEXT;

CREATE INDEX IF NOT EXISTS idx_factures_contacts_ville
  ON public.factures_contacts(societe_id, lower(ville)) WHERE ville IS NOT NULL;

ALTER TABLE public.tiers_annuaire
  ADD COLUMN IF NOT EXISTS code_postal TEXT,
  ADD COLUMN IF NOT EXISTS ville       TEXT,
  ADD COLUMN IF NOT EXISTS mobile      TEXT,
  ADD COLUMN IF NOT EXISTS fax         TEXT;

-- ─────────────────────────────────────────────────────────────────────
-- 247 — societes numérotation tous types (devis/avoir/note débit)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS devis_prefixe            TEXT    DEFAULT 'DEV-',
  ADD COLUMN IF NOT EXISTS devis_prochain_numero    INTEGER DEFAULT 1
    CHECK (devis_prochain_numero IS NULL OR devis_prochain_numero >= 1),
  ADD COLUMN IF NOT EXISTS avoir_prefixe            TEXT    DEFAULT 'AV-',
  ADD COLUMN IF NOT EXISTS avoir_prochain_numero    INTEGER DEFAULT 1
    CHECK (avoir_prochain_numero IS NULL OR avoir_prochain_numero >= 1),
  ADD COLUMN IF NOT EXISTS note_debit_prefixe       TEXT    DEFAULT 'ND-',
  ADD COLUMN IF NOT EXISTS note_debit_prochain_numero INTEGER DEFAULT 1
    CHECK (note_debit_prochain_numero IS NULL OR note_debit_prochain_numero >= 1);

-- ─────────────────────────────────────────────────────────────────────
-- 248 — mra_fiscalisation_logs (audit e-invoicing)
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mra_fiscalisation_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id    UUID REFERENCES public.factures(id) ON DELETE SET NULL,
  societe_id    UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  action        TEXT NOT NULL CHECK (action IN ('fiscalise','cancel','check_status','test_connection')),
  environment   TEXT NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','production')),
  success       BOOLEAN NOT NULL DEFAULT FALSE,
  irn           TEXT,
  qr_code_url   TEXT,
  http_status   INTEGER,
  duration_ms   INTEGER,
  error_code    TEXT,
  error_message TEXT,
  request_payload  JSONB,
  response_payload JSONB,
  source        TEXT NOT NULL DEFAULT 'manuel' CHECK (source IN ('manuel','cron','retry','api')),
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mra_logs_facture
  ON public.mra_fiscalisation_logs(facture_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mra_logs_societe_date
  ON public.mra_fiscalisation_logs(societe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mra_logs_success
  ON public.mra_fiscalisation_logs(societe_id, success, created_at DESC);

ALTER TABLE public.mra_fiscalisation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mra_logs_select" ON public.mra_fiscalisation_logs;
CREATE POLICY "mra_logs_select" ON public.mra_fiscalisation_logs FOR SELECT USING (
  societe_id IN (
    SELECT us.societe_id FROM public.user_societes us WHERE us.user_id = auth.uid()
    UNION SELECT d.societe_id FROM public.dossiers d WHERE d.client_id = auth.uid()
    UNION SELECT s.id FROM public.societes s WHERE s.created_by = auth.uid()
  )
);

COMMIT;

-- Force PostgREST schema reload (hors transaction)
NOTIFY pgrst, 'reload schema';
