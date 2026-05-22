-- Lien factures ↔ template IA actif.
-- Permet au générateur PDF de retrouver les paramètres de personnalisation
-- (couleur primaire, position du logo, mentions légales) utilisés à la
-- création de la facture, même si l'utilisateur change ensuite de template
-- actif côté préférences.

ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS template_id UUID;

-- Index partiel : optimise les rares jointures factures → facture_templates
-- (PDF generation). Ne pose pas la FK pour rester compatible avec les
-- environnements où facture_templates n'a pas encore été migrée.
CREATE INDEX IF NOT EXISTS idx_factures_template_id
  ON public.factures(template_id)
  WHERE template_id IS NOT NULL;

COMMENT ON COLUMN public.factures.template_id IS
  'Référence vers facture_templates.id si la facture a été créée avec un template IA. Null si template standard.';
