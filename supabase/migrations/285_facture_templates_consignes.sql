-- Ajoute le champ `consignes_ia` aux templates de facture.
-- Permet à l'utilisateur de joindre des instructions libres en français
-- (ex: "garde notre header bleu", "mentionne toujours notre licence FSC")
-- qui seront injectées dans le system prompt de l'assistant IA Factures
-- lors de la création d'une facture utilisant ce template.

ALTER TABLE public.facture_templates
  ADD COLUMN IF NOT EXISTS consignes_ia TEXT;

COMMENT ON COLUMN public.facture_templates.consignes_ia IS
  'Instructions libres rédigées par l''utilisateur, injectées dans le prompt Claude lors de la génération d''une facture basée sur ce template.';
