-- ============================================================================
-- 281 — Sauvegarde du breakdown complet du solde de tout compte
-- ============================================================================
--
-- Problème : au moment de la confirmation d'un départ, on agrège les
-- montants dans bulletins_paie (salaire_base, special_allowance_1/2/3,
-- departure_notice, salaire_net) mais on PERD :
--   - les libellés détaillés des lignes additionnelles (lignes_extra)
--   - les sous-détails (jours AL restants, mois travaillés, formule
--     severance, etc.)
--
-- Conséquence : régénérer le PDF du solde de tout compte après
-- confirmation produit un document moins détaillé que celui affiché
-- à l'écran lors du calcul.
--
-- Solution : on persiste le breakdown JSON complet sur la fiche
-- employé (`employes.breakdown_depart`). C'est immutable une fois posé
-- et accessible aux endpoints PDF pour reconstruire exactement
-- l'affichage écran.
-- ============================================================================

BEGIN;

ALTER TABLE public.employes
  ADD COLUMN IF NOT EXISTS breakdown_depart JSONB;

CREATE INDEX IF NOT EXISTS idx_employes_breakdown_depart
  ON public.employes ((breakdown_depart IS NOT NULL))
  WHERE breakdown_depart IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
