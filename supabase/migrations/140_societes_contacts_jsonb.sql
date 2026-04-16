-- ============================================================================
-- Migration 140 — societes.contacts (JSONB liste de contacts)
-- ============================================================================
--
-- Remplace le champ unique "personne_contact" / "contact_nom" par une
-- liste JSONB permettant d'enregistrer plusieurs contacts (CEO, DRH,
-- DAF, comptable externe, etc.) avec indication du contact principal.
--
-- Schéma d'un élément:
--   {
--     "nom": "DUPONT",
--     "prenom": "Jean",
--     "poste": "CEO",
--     "email": "jean@example.com",
--     "telephone": "+230 5123 4567",
--     "principal": true
--   }
--
-- L'ancien champ unique (s'il existe) reste en place pour rétrocompat.
-- Les nouveaux enregistrements utilisent exclusivement `contacts`.
--
-- Idempotente : ADD COLUMN IF NOT EXISTS.
-- ============================================================================

ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS contacts JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.societes.contacts IS
  'Liste des personnes de contact de la société (JSONB array):
   [{nom, prenom, poste, email, telephone, principal}]
   Le contact avec principal=true est mis en avant dans l''UI.
   Au plus un seul contact doit avoir principal=true (règle UI, non DDL).';

-- Index GIN pour les queries éventuelles sur email/nom des contacts.
CREATE INDEX IF NOT EXISTS idx_societes_contacts_gin
  ON public.societes USING gin (contacts);
