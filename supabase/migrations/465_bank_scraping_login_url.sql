-- 465 — URL de connexion Internet Banking configurable par compte
--
-- Jusqu'ici l'URL du portail bancaire était codée en dur dans le robot
-- Playwright (lib/banks/scraper.ts → BANK_LOGIN_URLS). On la rend
-- configurable par compte pour couvrir les sous-domaines "corporate",
-- les portails Business dédiés et les banques hors liste.
--
-- Colonne nullable : si NULL, le robot retombe sur l'URL par défaut de la
-- banque détectée. Aucun impact sur les comptes existants.

ALTER TABLE public.comptes_bancaires_scraping_creds
  ADD COLUMN IF NOT EXISTS login_url text;

COMMENT ON COLUMN public.comptes_bancaires_scraping_creds.login_url IS
  'URL de connexion Internet Banking (override de BANK_LOGIN_URLS). NULL = URL par défaut de la banque.';
