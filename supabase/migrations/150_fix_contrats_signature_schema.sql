-- ============================================================
-- Migration 150 — Aligner schema contrats_employes avec le code
--
-- CONTEXTE :
--   - La migration 107 (contrats_dual_signature.sql) existe en fichier
--     mais n'a JAMAIS été appliquée en prod (cf. schema_migrations).
--     Le code référence depuis longtemps les colonnes date_signature_employe,
--     ip_signature_employe, signe_par_id, etc. → erreurs runtime silencieuses.
--   - Cette migration consolide :
--       1) Tout ce que faisait 107 (idempotent)
--       2) Les colonnes additionnelles requises pour le sprint contrats
--          (signature image employé, traçabilité signe_employeur, PDF storage,
--          notification, période d'essai, motif CDD)
--       3) Nouveau CHECK constraint statut aligné avec le flow attendu
--
-- FLOW STATUT (nouveau) :
--   brouillon → signe_employeur → signe_complet → (expire | resilie)
--
--   `signe_employeur` = l'employeur a signé en premier (offre engagée).
--   `signe_complet`   = l'employé a contresigné (contrat parfait).
--
-- IMPORTANT — SÉMANTIQUE :
--   Le code historique utilisait `signe_employe` = "signé par l'employé".
--   Le nouveau modèle inverse l'ordre : `signe_employeur` = "signé par
--   l'employeur en premier". La migration de données convertit `signe_employe`
--   → `signe_employeur` *par compatibilité technique du flow* mais une
--   donnée historique ainsi convertie reste sémantiquement ambiguë (l'employé
--   avait signé en premier dans l'ancien flow). Aucune ligne en prod
--   n'utilise actuellement `signe_employe` (vérifié), donc l'impact est nul.
--
-- Idempotent : ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS.
-- ============================================================

ALTER TABLE public.contrats_employes
  -- ─── Signature employé (séparation des champs unifiés legacy) ───
  ADD COLUMN IF NOT EXISTS date_signature_employe   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ip_signature_employe     TEXT,
  ADD COLUMN IF NOT EXISTS token_signature_employe  TEXT,
  ADD COLUMN IF NOT EXISTS signature_image_employe_url TEXT,

  -- ─── Signature dirigeant / employeur ───
  ADD COLUMN IF NOT EXISTS date_signature_dirigeant TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ip_signature_dirigeant   TEXT,
  ADD COLUMN IF NOT EXISTS signe_par_id             UUID REFERENCES auth.users(id),

  -- ─── Workflow employeur (qui a appuyé sur "Signer & approuver") ───
  ADD COLUMN IF NOT EXISTS signe_employeur_par      UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS signe_employeur_at       TIMESTAMPTZ,

  -- ─── Notification employé (WhatsApp + email) ───
  ADD COLUMN IF NOT EXISTS notification_envoyee_at  TIMESTAMPTZ,

  -- ─── Stockage PDF final (bucket Supabase Storage `contrats/`) ───
  ADD COLUMN IF NOT EXISTS pdf_storage_path         TEXT,

  -- ─── Champs métier WRA 2019 utilisés par le générateur ───
  ADD COLUMN IF NOT EXISTS periode_essai_jours      INTEGER DEFAULT 90,
  ADD COLUMN IF NOT EXISTS motif_cdd                TEXT;

-- Migrer les données existantes :
--   Anciens champs unifiés → nouveaux champs employé.
--   Attention : seulement quand date_signature IS NOT NULL pour ne pas
--   écraser des valeurs déjà migrées par un éventuel passage de 107.
UPDATE public.contrats_employes
SET
  date_signature_employe  = COALESCE(date_signature_employe, date_signature),
  ip_signature_employe    = COALESCE(ip_signature_employe, ip_signature),
  token_signature_employe = COALESCE(token_signature_employe, token_signature)
WHERE date_signature IS NOT NULL;

-- ─── CHECK constraint statut (nouveau flow) ───
ALTER TABLE public.contrats_employes
  DROP CONSTRAINT IF EXISTS contrats_employes_statut_check;

-- Migrer les anciens statuts AVANT d'appliquer la nouvelle contrainte :
--   - 'signe' (legacy = les deux ont signé)            → 'signe_complet'
--   - 'signe_employe' (legacy = en attente employeur)  → 'signe_employeur'
--     (Mapping technique du nom; cf. note de tête.)
UPDATE public.contrats_employes SET statut = 'signe_complet'
  WHERE statut = 'signe';

UPDATE public.contrats_employes SET statut = 'signe_employeur'
  WHERE statut = 'signe_employe';

ALTER TABLE public.contrats_employes
  ADD CONSTRAINT contrats_employes_statut_check
  CHECK (statut IN ('brouillon', 'signe_employeur', 'signe_complet', 'expire', 'resilie'));

-- ─── Comments documentation ───
COMMENT ON COLUMN public.contrats_employes.date_signature_employe   IS 'Date de signature électronique de l''employé.';
COMMENT ON COLUMN public.contrats_employes.date_signature_dirigeant IS 'Date de contresignature du dirigeant (peut être identique à signe_employeur_at).';
COMMENT ON COLUMN public.contrats_employes.signe_par_id             IS 'auth.users.id du dirigeant signataire (référence auth).';
COMMENT ON COLUMN public.contrats_employes.signature_image_employe_url IS 'URL/data-URI de l''image de signature de l''employé (bucket avatars ou data URI).';
COMMENT ON COLUMN public.contrats_employes.signe_employeur_par      IS 'auth.users.id de l''utilisateur qui a cliqué Approuver & signer côté employeur.';
COMMENT ON COLUMN public.contrats_employes.signe_employeur_at       IS 'Timestamp du clic Approuver & signer côté employeur.';
COMMENT ON COLUMN public.contrats_employes.notification_envoyee_at  IS 'Quand la notification (WhatsApp+email) a été envoyée à l''employé.';
COMMENT ON COLUMN public.contrats_employes.pdf_storage_path         IS 'Chemin Supabase Storage du PDF final signé (bucket contrats/).';
COMMENT ON COLUMN public.contrats_employes.periode_essai_jours      IS 'Période d''essai en jours (WRA 2019 max 180j). Default 90.';
COMMENT ON COLUMN public.contrats_employes.motif_cdd                IS 'Motif justifiant le CDD (WRA 2019 s.17, obligatoire pour CDD).';
