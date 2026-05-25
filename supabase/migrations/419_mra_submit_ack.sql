-- ════════════════════════════════════════════════════════════════════════════
-- 419_mra_submit_ack.sql
-- Wave 2-D, problème 1A — Soumission MRA via Playwright (CIT, TDS).
--
-- Ajoute aux tables de déclarations MRA les colonnes nécessaires pour tracer
-- une soumission réelle via le robot Playwright `submitMraDeclaration` :
--   • mra_ack_ref       — référence d'accusé renvoyée par eservices.mra.mu
--   • mra_screenshot_b64 — PNG base64 de l'écran d'accusé (preuve d'audit)
--   • mra_last_error    — message d'erreur du dernier échec
--
-- Étend les contraintes CHECK statut pour ajouter `manual_needed` (cas
-- CAPTCHA/OTP/UI cassée → bot retourne les fichiers en PJ Telegram pour
-- soumission manuelle, puis l'utilisateur saisit la `ack_ref` reçue).
--
-- Tables concernées : cit_returns (mig 260), tds_declarations_mensuelles_v2
-- (mig 259). Roc/SFT restent en Option B (mark_submitted manuel) — voir
-- rapport W2-D, problème 1A.
--
-- ⚠️ NE PAS apply_migration en prod sans confirmation utilisateur.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. cit_returns ─────────────────────────────────────────────────────────
ALTER TABLE public.cit_returns
  ADD COLUMN IF NOT EXISTS mra_ack_ref TEXT,
  ADD COLUMN IF NOT EXISTS mra_screenshot_b64 TEXT,
  ADD COLUMN IF NOT EXISTS mra_last_error TEXT;

ALTER TABLE public.cit_returns DROP CONSTRAINT IF EXISTS cit_returns_statut_check;
ALTER TABLE public.cit_returns ADD CONSTRAINT cit_returns_statut_check
  CHECK (statut IN ('draft','review','approved','submitted','manual_needed','accepted','rejected'));

COMMENT ON COLUMN public.cit_returns.mra_ack_ref IS
  'Référence d''accusé MRA renvoyée par eservices38.mra.mu après soumission Playwright.';
COMMENT ON COLUMN public.cit_returns.mra_screenshot_b64 IS
  'PNG base64 de l''écran d''accusé MRA (preuve d''audit, à archiver 5 ans ITA s.149).';
COMMENT ON COLUMN public.cit_returns.mra_last_error IS
  'Message d''erreur du dernier échec robot Playwright (login, CAPTCHA, sélecteur).';

-- ── 2. tds_declarations_mensuelles_v2 ──────────────────────────────────────
ALTER TABLE public.tds_declarations_mensuelles_v2
  ADD COLUMN IF NOT EXISTS mra_ack_ref TEXT,
  ADD COLUMN IF NOT EXISTS mra_screenshot_b64 TEXT,
  ADD COLUMN IF NOT EXISTS mra_last_error TEXT;

ALTER TABLE public.tds_declarations_mensuelles_v2
  DROP CONSTRAINT IF EXISTS tds_declarations_mensuelles_v2_statut_check;
ALTER TABLE public.tds_declarations_mensuelles_v2
  ADD CONSTRAINT tds_declarations_mensuelles_v2_statut_check
  CHECK (statut IN ('a_faire','declare','manual_needed','paye','retard'));

COMMENT ON COLUMN public.tds_declarations_mensuelles_v2.mra_ack_ref IS
  'Référence d''accusé MRA renvoyée par eservices.mra.mu/TDS après soumission Playwright.';
COMMENT ON COLUMN public.tds_declarations_mensuelles_v2.mra_screenshot_b64 IS
  'PNG base64 de l''écran d''accusé MRA TDS (preuve d''audit).';
COMMENT ON COLUMN public.tds_declarations_mensuelles_v2.mra_last_error IS
  'Message d''erreur du dernier échec robot Playwright.';

-- ── 3. Index utiles pour audit ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cit_returns_ack_ref
  ON public.cit_returns(mra_ack_ref) WHERE mra_ack_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tds_decl_ack_ref
  ON public.tds_declarations_mensuelles_v2(mra_ack_ref) WHERE mra_ack_ref IS NOT NULL;
