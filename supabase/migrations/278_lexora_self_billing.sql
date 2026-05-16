-- ============================================================================
-- 278 — Lexora self-billing : facturation SaaS au nom de Digital Data Solutions
-- ============================================================================
--
-- Génération automatique d'une facture à la validation de la demande
-- d'inscription, avec intégration comptable, rapprochement bancaire dédié
-- et relance multi-canal (email, telegram, sms, whatsapp).
--
-- Tables :
--   - lexora_settings           : singleton config DDS Ltd (BRN, TVA, IBAN…)
--   - lexora_invoices           : factures émises par DDS aux clients SaaS
--   - lexora_dunning_log        : journal des relances envoyées
--
-- Le couplage à la comptabilité se fait via `accounting_entry_ref` (pointeur
-- vers une écriture dans la société DDS), pas via FK pour éviter le couplage
-- bidirectionnel rigide.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. SINGLETON CONFIG (DDS Ltd / Lexora)
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lexora_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton
  -- Identité légale
  raison_sociale     TEXT NOT NULL DEFAULT 'Digital Data Solutions Ltd',
  brn                TEXT,
  vat_number         TEXT,
  capital_mur        NUMERIC(15,2),
  adresse            TEXT,
  ville              TEXT DEFAULT 'Port-Louis',
  pays               TEXT DEFAULT 'Mauritius',
  telephone          TEXT,
  email              TEXT,
  website            TEXT DEFAULT 'https://lexora.finance',
  -- Compte bancaire MUR (rapprochement)
  banque_nom         TEXT,
  iban               TEXT,
  swift_bic          TEXT,
  numero_compte      TEXT,
  -- Société DDS dans Lexora (pour intégration compta)
  societe_id         UUID REFERENCES public.societes(id),
  dossier_id         UUID REFERENCES public.dossiers(id),
  -- Paramètres facturation
  tva_rate_default   NUMERIC(5,2) NOT NULL DEFAULT 15.00,
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  -- Comptes par défaut pour l'écriture comptable
  compte_client      TEXT NOT NULL DEFAULT '411000',
  compte_produit     TEXT NOT NULL DEFAULT '706000',
  compte_tva         TEXT NOT NULL DEFAULT '4457',
  journal_vente      TEXT NOT NULL DEFAULT 'VTE',
  -- Calendrier de relance (jours après échéance)
  dunning_schedule   JSONB NOT NULL DEFAULT '[7, 15, 30]'::jsonb,
  dunning_channels   JSONB NOT NULL DEFAULT '["email","telegram"]'::jsonb,
  -- Séquence
  invoice_prefix     TEXT NOT NULL DEFAULT 'LEX',
  -- Méta
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Singleton seed (à compléter en admin)
INSERT INTO public.lexora_settings (id, raison_sociale)
VALUES (1, 'Digital Data Solutions Ltd')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 2. FACTURES LEXORA
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lexora_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Origine
  demande_id         UUID REFERENCES public.demandes_inscription(id) ON DELETE SET NULL,
  client_societe_id  UUID REFERENCES public.societes(id) ON DELETE SET NULL,
  client_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Identité facture
  invoice_number     TEXT NOT NULL UNIQUE,           -- LEX-2026-0001
  invoice_date       DATE NOT NULL,                  -- date CGV / validation
  due_date           DATE NOT NULL,
  cgv_accepted_at    TIMESTAMPTZ,                    -- horodatage CGV de l'inscription

  -- Snapshot client (au moment de la facturation, immutable)
  customer_snapshot  JSONB NOT NULL,
  -- {nom, brn, vat, adresse, ville, dirigeant_nom, dirigeant_email, telephone}

  -- Snapshot émetteur (lexora_settings à l'instant t)
  issuer_snapshot    JSONB NOT NULL,

  -- Lignes (ici 1 seule ligne en MVP : "Abonnement plan X")
  lines              JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- [{designation, quantite, prix_unitaire_ht, tva_rate, montant_ht}]

  -- Totaux
  devise             TEXT NOT NULL DEFAULT 'MUR',
  amount_ht          NUMERIC(15,2) NOT NULL,
  tva_amount         NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount_ttc         NUMERIC(15,2) NOT NULL,
  amount_paid        NUMERIC(15,2) NOT NULL DEFAULT 0,

  -- Statut
  status             TEXT NOT NULL DEFAULT 'emise'
                     CHECK (status IN ('brouillon','emise','partiellement_payee','payee','en_retard','annulee')),

  -- Paiement
  paid_at            TIMESTAMPTZ,
  payment_method     TEXT,       -- 'virement', 'cb', 'mcb_juice', 'cheque'
  payment_reference  TEXT,       -- ex: réf virement bancaire
  bank_transaction_id UUID,      -- lien vers transaction bancaire si dispo

  -- Intégration compta
  accounting_entry_ref TEXT,     -- numero_piece côté ecritures_comptables
  accounting_dossier_id UUID,    -- dossier_id où l'écriture a été créée

  -- PDF
  pdf_storage_path   TEXT,       -- bucket Supabase Storage (optionnel)

  -- Méta
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by         UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_lex_inv_status     ON public.lexora_invoices(status);
CREATE INDEX IF NOT EXISTS idx_lex_inv_due        ON public.lexora_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_lex_inv_client_soc ON public.lexora_invoices(client_societe_id);
CREATE INDEX IF NOT EXISTS idx_lex_inv_demande    ON public.lexora_invoices(demande_id);
CREATE INDEX IF NOT EXISTS idx_lex_inv_date       ON public.lexora_invoices(invoice_date DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_lexora_invoices_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS lexora_invoices_updated_at ON public.lexora_invoices;
CREATE TRIGGER lexora_invoices_updated_at
  BEFORE UPDATE ON public.lexora_invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_lexora_invoices_updated_at();

-- Séquence pour la numérotation (par année)
CREATE TABLE IF NOT EXISTS public.lexora_invoice_sequence (
  year INTEGER PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.next_lexora_invoice_number(p_prefix TEXT DEFAULT 'LEX')
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM NOW())::INTEGER;
  v_next INTEGER;
BEGIN
  INSERT INTO public.lexora_invoice_sequence (year, last_number)
  VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_number = lexora_invoice_sequence.last_number + 1
  RETURNING last_number INTO v_next;
  RETURN format('%s-%s-%s', p_prefix, v_year, LPAD(v_next::TEXT, 4, '0'));
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. LOG DES RELANCES
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lexora_dunning_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        UUID NOT NULL REFERENCES public.lexora_invoices(id) ON DELETE CASCADE,
  channel           TEXT NOT NULL CHECK (channel IN ('email','telegram','sms','whatsapp')),
  recipient         TEXT NOT NULL,    -- email / chat_id / phone E.164
  stage             TEXT,              -- 'J+7', 'J+15', 'J+30', 'manual'
  message           TEXT,
  status            TEXT NOT NULL DEFAULT 'sent'
                    CHECK (status IN ('sent','delivered','failed','skipped')),
  provider          TEXT,              -- 'resend', 'telegram_bot', 'twilio_sms', 'twilio_whatsapp'
  provider_msg_id   TEXT,
  error             TEXT,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_dunning_invoice ON public.lexora_dunning_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_dunning_sent_at ON public.lexora_dunning_log(sent_at DESC);

-- ─────────────────────────────────────────────────────────────────────
-- 4. RLS (admin/super_admin seulement)
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.lexora_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lexora_invoices    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lexora_dunning_log ENABLE ROW LEVEL SECURITY;

-- Politique simple : admin only. (Les routes API utilisent service_role.)
DROP POLICY IF EXISTS lex_settings_admin    ON public.lexora_settings;
DROP POLICY IF EXISTS lex_invoices_admin    ON public.lexora_invoices;
DROP POLICY IF EXISTS lex_dunning_admin     ON public.lexora_dunning_log;

CREATE POLICY lex_settings_admin ON public.lexora_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p
              WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin'))
  );

CREATE POLICY lex_invoices_admin ON public.lexora_invoices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p
              WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin'))
  );

CREATE POLICY lex_dunning_admin ON public.lexora_dunning_log
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p
              WHERE p.id = auth.uid() AND p.role IN ('admin','super_admin'))
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
