-- ═══════════════════════════════════════════════════════════════════════
-- Migration 243: Colonnes facturation persistantes sur `societes`
--
-- Avant : la page /client/facturation-settings stockait TOUT en
-- localStorage (perdu entre appareils, jamais lisible côté serveur).
-- L'utilisateur devait re-saisir nom, BRN, adresse, téléphone, banque,
-- préfixe facture, conditions paiement à chaque nouveau navigateur.
--
-- Cette migration ajoute les 7 colonnes manquantes (les autres existent
-- déjà via mig 046, 106, 006) pour que TOUTES les infos de facturation
-- soient persistées en DB et auto-rechargées au chargement de la page.
--
-- Les colonnes existantes mappées par la page :
--   nom, brn, numero_tva_mra → vat_number, adresse, telephone, email,
--   logo_url, devise_principale → devise_defaut,
--   bank_name → banque_nom, bank_account_number → banque_compte,
--   iban → banque_iban
-- ═══════════════════════════════════════════════════════════════════════

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

COMMENT ON COLUMN public.societes.website                    IS 'Site web de la société, affiché sur les factures et templates.';
COMMENT ON COLUMN public.societes.banque_swift               IS 'Code SWIFT/BIC, complète bank_name + iban pour les paiements internationaux.';
COMMENT ON COLUMN public.societes.facture_prefixe            IS 'Préfixe des numéros de facture (ex. "INV-", "FACT-").';
COMMENT ON COLUMN public.societes.facture_prochain_numero    IS 'Prochain numéro de facture à utiliser. Incrémenté à chaque création de facture.';
COMMENT ON COLUMN public.societes.facture_conditions_paiement IS 'Délai de paiement par défaut en jours (0..365), pré-rempli à la création d''une facture.';
COMMENT ON COLUMN public.societes.facture_footer_text        IS 'Bas de page imprimé sur le PDF (ex. "Merci pour votre confiance").';
COMMENT ON COLUMN public.societes.facture_mention_legale     IS 'Mention légale obligatoire (TVA, BRN, mention de pénalités de retard, etc.).';

-- Force PostgREST à recharger le schema cache (sinon les nouveaux champs
-- ne sont pas trouvables via l'API jusqu'au prochain restart).
NOTIFY pgrst, 'reload schema';
