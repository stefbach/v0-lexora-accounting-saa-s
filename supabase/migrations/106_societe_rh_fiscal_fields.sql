-- Champs RH, fiscal et bancaires pour la fiche société
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS paye_number      TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS csg_number       TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS nsf_number       TEXT;

-- RH / temps de travail
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS heures_semaine          NUMERIC(5,2) DEFAULT 45;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS jours_travail_semaine   INTEGER      DEFAULT 5;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS conges_annuels_jours    INTEGER      DEFAULT 20;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS conges_maladie_jours    INTEGER      DEFAULT 15;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS ot_taux_normal          NUMERIC(4,2) DEFAULT 1.5;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS ot_taux_majore          NUMERIC(4,2) DEFAULT 2.0;

-- Coordonnées bancaires principales
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS bank_name           TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE public.societes ADD COLUMN IF NOT EXISTS iban                TEXT;
