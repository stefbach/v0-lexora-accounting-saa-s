-- =====================================================================
-- Migration 497 — Fondations moteur du PCM maître
-- =====================================================================
-- Enrichit l'objet « compte » (audit produit) et ajoute un garde-fou :
--   • postable      : le compte accepte-t-il des écritures directes ?
--   • related_party : compte de partie liée (associés / intercompany / liaison).
--   • vat_treatment : traitement TVA par défaut des postings (à affiner en UI).
--
-- Règle de backfill SÛRE — non-postable = compte PARENT (a des sous-comptes
-- actifs) SANS aucune écriture propre. Les comptes COLLECTIFS mouvementés
-- (401 Fournisseurs, 411 Clients, 512 Banque, 455 Assoc., 471 Attente…) restent
-- postables même s'ils ont des sous-comptes. Aucun compte déjà mouvementé n'est
-- rendu non-postable → aucun blocage rétroactif.
--
-- Garde-fou : écriture rejetée si le compte est non-postable (INSERT, ou bascule
-- d'un code existant VERS un parent). Additif et idempotent.
-- =====================================================================

BEGIN;

ALTER TABLE public.plan_comptable
  ADD COLUMN IF NOT EXISTS postable      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS related_party BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vat_treatment TEXT;

ALTER TABLE public.plan_comptable
  DROP CONSTRAINT IF EXISTS plan_comptable_vat_treatment_check;
ALTER TABLE public.plan_comptable
  ADD CONSTRAINT plan_comptable_vat_treatment_check
  CHECK (vat_treatment IS NULL OR vat_treatment IN ('standard','reduced','zero','exempt','out_of_scope'));

UPDATE public.plan_comptable p
   SET postable = FALSE
 WHERE p.actif
   AND EXISTS (SELECT 1 FROM public.plan_comptable c WHERE c.compte_parent = p.compte AND c.actif)
   AND NOT EXISTS (SELECT 1 FROM public.ecritures_comptables_v2 e WHERE e.numero_compte = p.compte);

UPDATE public.plan_comptable
   SET related_party = TRUE
 WHERE actif
   AND ( compte LIKE '451%' OR compte LIKE '455%' OR compte LIKE '18%'
         OR libelle ~* 'inter-?soci|associ|related party|intercomp|liaison|shareholder|actionnaire' );

CREATE OR REPLACE FUNCTION public.check_ecriture_postable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_postable BOOLEAN;
BEGIN
  IF NEW.numero_compte IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.numero_compte IS NOT DISTINCT FROM OLD.numero_compte THEN
    RETURN NEW;
  END IF;

  v_postable := COALESCE(
    (SELECT postable FROM public.plan_comptable
       WHERE compte = NEW.numero_compte AND societe_id = NEW.societe_id LIMIT 1),
    (SELECT postable FROM public.plan_comptable
       WHERE compte = NEW.numero_compte AND societe_id IS NULL LIMIT 1),
    TRUE
  );

  IF v_postable = FALSE THEN
    RAISE EXCEPTION
      'Écriture interdite sur le compte de regroupement % : ce compte a des sous-comptes. Utilisez un compte détail (postable).',
      NEW.numero_compte
      USING ERRCODE = 'check_violation',
            HINT = 'Choisissez un sous-compte mouvementable (postable=true) au lieu du compte parent.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ecriture_postable_guard ON public.ecritures_comptables_v2;
CREATE TRIGGER ecriture_postable_guard
  BEFORE INSERT OR UPDATE ON public.ecritures_comptables_v2
  FOR EACH ROW EXECUTE FUNCTION public.check_ecriture_postable();

CREATE INDEX IF NOT EXISTS idx_plan_comptable_postable
  ON public.plan_comptable(postable) WHERE postable = FALSE;

COMMIT;
