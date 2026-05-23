-- Template IA actif par société.
-- Permet de persister côté serveur le modèle de facture sélectionné par
-- l'utilisateur (au lieu de dépendre uniquement de localStorage, qui se
-- perd entre navigateurs et appareils).
--
-- Référencé par :
--   - /client/facturation-settings (tab Modèles) — read/write via API societes
--   - /api/client/factures-ia/chat — injecte le template dans le prompt
--   - /api/client/factures-ia/generer — propage template_id sur la facture
--   - /api/client/factures/[id]/pdf — applique couleur + position logo

ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS facture_template_id UUID;

COMMENT ON COLUMN public.societes.facture_template_id IS
  'Référence vers facture_templates.id si la société utilise un template IA par défaut. Null = template hardcoded (standard).';
