-- Ajouter IBAN sur comptes_bancaires pour matching automatique OCR
ALTER TABLE public.comptes_bancaires ADD COLUMN IF NOT EXISTS iban TEXT;
ALTER TABLE public.comptes_bancaires ADD COLUMN IF NOT EXISTS swift TEXT;

-- Index pour recherche rapide par IBAN
CREATE INDEX IF NOT EXISTS idx_cb_iban ON public.comptes_bancaires(iban) WHERE iban IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cb_numero ON public.comptes_bancaires(numero_compte) WHERE numero_compte IS NOT NULL;

-- S'assurer que societes a bien un champ brn indexé
CREATE INDEX IF NOT EXISTS idx_societes_brn ON public.societes(brn) WHERE brn IS NOT NULL;
