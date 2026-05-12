-- ═══════════════════════════════════════════════════════════════════════
-- Migration 247: Numérotation auto pour devis / avoir / note de débit
--
-- Demande utilisateur : "on doit pouvoir mettre en place incrémentation
-- automatique des factures que l'on paramètre au niveau du setting et
-- qu'ensuite on a plus besoin de gérer, de même pour devis avoir".
--
-- La mig 243 avait introduit `facture_prefixe` + `facture_prochain_numero`
-- pour les factures standard. Devis / avoir / note de débit fonctionnaient
-- encore avec des préfixes hardcodés (AV-, ND-, DEV-) et parsing du
-- dernier numéro.
--
-- Cette migration ajoute 6 colonnes (préfixe + compteur par type) :
--   devis_prefixe, devis_prochain_numero
--   avoir_prefixe, avoir_prochain_numero
--   note_debit_prefixe, note_debit_prochain_numero
--
-- Une fois paramétrés dans /client/facturation-settings, l'utilisateur
-- n'a plus jamais à gérer le numéro : il est généré et incrémenté
-- automatiquement par /api/client/factures POST.
-- ═══════════════════════════════════════════════════════════════════════

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

COMMENT ON COLUMN public.societes.devis_prefixe            IS 'Préfixe des numéros de devis (ex. "DEV-", "Q2026/", "QUOTE-").';
COMMENT ON COLUMN public.societes.devis_prochain_numero    IS 'Prochain numéro de devis. Incrémenté automatiquement à chaque création.';
COMMENT ON COLUMN public.societes.avoir_prefixe            IS 'Préfixe des numéros d''avoir (ex. "AV-", "CN-", "CR-").';
COMMENT ON COLUMN public.societes.avoir_prochain_numero    IS 'Prochain numéro d''avoir. Incrémenté automatiquement.';
COMMENT ON COLUMN public.societes.note_debit_prefixe       IS 'Préfixe des numéros de note de débit (ex. "ND-", "DN-", "DR-").';
COMMENT ON COLUMN public.societes.note_debit_prochain_numero IS 'Prochain numéro de note de débit. Incrémenté automatiquement.';

NOTIFY pgrst, 'reload schema';
