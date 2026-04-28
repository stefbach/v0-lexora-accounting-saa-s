-- 211_banques_mauritius_table.sql
-- Table de référence des banques mauriciennes avec codes MCB BP-V1.
-- Source de vérité unique pour le mapping code_banque → code_mcb_bp utilisé
-- dans les lignes type 2 du fichier MCB Bulk Payment File (BP-V1).
--
-- Remplace les hardcoded mappings dans :
--   - lib/bankFormats.ts (BANK_CODES_MCB)
--   - lib/rh/banques-mauritius.ts (MCB_BANK_CODES)
--
-- CONTEXTE BUG (mars 2026)
-- ────────────────────────
-- Lexora utilisait des codes MCB BP faux — vérification croisée avec un
-- BP file validé MRA mars 2026 (OCC, BP-1920430.txt) :
--   SBM     = 11  (Lexora avait 03)  ❌
--   ABSA    = 03  (Lexora avait 04)  ❌
--   BANKONE = 05  (Lexora avait 08)  ❌
--   MCB     = NULL (virement interne, ligne type 1, pas de code)
-- Les autres banques (MAUBANK, AFRASIA, HSBC, SBI, BOB, SCB) seront
-- complétées quand le PDF officiel "MCB Bulk Payment File Specifications"
-- sera récupéré via le portail MCB Internet Banking.
--
-- Tant que code_mcb_bp est NULL, le générateur BP-V1 doit refuser de
-- générer une ligne pour cette banque (au lieu de générer un code "99"
-- silencieux qui aboutit à un fichier rejeté par MCB).

CREATE TABLE IF NOT EXISTS public.banques_mauritius (
  id              SERIAL PRIMARY KEY,
  code            TEXT UNIQUE NOT NULL,        -- MCB, SBM, BANKONE, ABSA, AFRASIA…
  nom             TEXT NOT NULL,                -- Nom officiel
  swift_bic       TEXT,                         -- Code SWIFT/BIC (8 ou 11 chars)
  code_mcb_bp     TEXT,                         -- Code numérique BP-V1 (NULL si non confirmé)
  est_mcb_interne BOOLEAN NOT NULL DEFAULT false,  -- TRUE = banque MCB elle-même (ligne type 1)
  source_code     TEXT,                         -- Provenance du code (ex: "BP-1920430.txt validé MRA mars 2026")
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.banques_mauritius IS 'Référentiel banques Maurice + codes MCB BP-V1. Source de vérité pour génération fichiers virement bulk.';
COMMENT ON COLUMN public.banques_mauritius.code_mcb_bp IS 'Code numérique 2 chiffres utilisé dans les lignes type 2 du format MCB BP-V1. NULL = non confirmé, ne pas générer.';
COMMENT ON COLUMN public.banques_mauritius.est_mcb_interne IS 'TRUE pour MCB uniquement (virement intra-banque, ligne type 1, pas de code BP).';

CREATE INDEX IF NOT EXISTS idx_banques_mauritius_code ON public.banques_mauritius(code);

-- Seed initial : 4 codes confirmés + autres en NULL (à compléter)
-- Codes confirmés via fichier réel BP-1920430.txt (OCC, mars 2026, validé MRA)
INSERT INTO public.banques_mauritius (code, nom, swift_bic, code_mcb_bp, est_mcb_interne, source_code) VALUES
  ('MCB',     'Mauritius Commercial Bank',          'MCBLMUMU',  NULL, true,  'Virement interne MCB → ligne type 1 sans code'),
  ('ABSA',    'ABSA Bank Mauritius',                'BARCMUMU',  '03', false, 'BP-1920430.txt validé MRA mars 2026 (DESIRE Marie Alicia)'),
  ('BANKONE', 'Bank One',                           'COMUMUXX',  '05', false, 'BP-1920430.txt validé MRA mars 2026 (CHAVETIAN Stephano)'),
  ('SBM',     'State Bank of Mauritius',            'STCBMUMU',  '11', false, 'BP-1920430.txt validé MRA mars 2026 (GROODOYAL Aditya)'),
  ('AFRASIA', 'AfrAsia Bank',                       'AFASMUMU',  NULL, false, 'À compléter via PDF MCB Bulk Payment File Specifications'),
  ('MAUBANK', 'MauBank',                            'MAUBMUMU',  NULL, false, 'À compléter via PDF MCB Bulk Payment File Specifications'),
  ('SCB',     'Standard Chartered Mauritius',       'SCBLMUMU',  NULL, false, 'À compléter via PDF MCB Bulk Payment File Specifications'),
  ('HSBC',    'HSBC Mauritius',                     'HSBCMUMU',  NULL, false, 'À compléter via PDF MCB Bulk Payment File Specifications'),
  ('SBI',     'SBI Mauritius',                      'SBINMUMU',  NULL, false, 'À compléter via PDF MCB Bulk Payment File Specifications'),
  ('BOB',     'Bank of Baroda',                     'BARBMUMU',  NULL, false, 'À compléter via PDF MCB Bulk Payment File Specifications'),
  ('ABC',     'ABC Banking Corporation',            'ABCBMUMU',  NULL, false, 'À compléter via PDF MCB Bulk Payment File Specifications'),
  ('BNP',     'BNP Paribas Mauritius',              'BNPAMUMU',  NULL, false, 'À compléter via PDF MCB Bulk Payment File Specifications'),
  ('CITI',    'Citi Mauritius',                     'CITIMUMU',  NULL, false, 'À compléter via PDF MCB Bulk Payment File Specifications'),
  ('HABIB',   'Habib Bank Mauritius',               'HABBMUMU',  NULL, false, 'À compléter via PDF MCB Bulk Payment File Specifications'),
  ('INVESTEC','Investec Mauritius',                 'INVCMUMU',  NULL, false, 'À compléter via PDF MCB Bulk Payment File Specifications'),
  ('BCP',     'Banque de Commerce et de Placements',NULL,        NULL, false, 'À compléter via PDF MCB Bulk Payment File Specifications')
ON CONFLICT (code) DO NOTHING;

-- Trigger pour maintenir updated_at
CREATE OR REPLACE FUNCTION public.banques_mauritius_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_banques_mauritius_updated_at ON public.banques_mauritius;
CREATE TRIGGER trg_banques_mauritius_updated_at
  BEFORE UPDATE ON public.banques_mauritius
  FOR EACH ROW EXECUTE FUNCTION public.banques_mauritius_set_updated_at();

-- RLS : lecture publique (référentiel), écriture admin only
ALTER TABLE public.banques_mauritius ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS banques_mauritius_select_all ON public.banques_mauritius;
CREATE POLICY banques_mauritius_select_all
  ON public.banques_mauritius FOR SELECT
  USING (true);

DROP POLICY IF EXISTS banques_mauritius_admin_write ON public.banques_mauritius;
CREATE POLICY banques_mauritius_admin_write
  ON public.banques_mauritius FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );
