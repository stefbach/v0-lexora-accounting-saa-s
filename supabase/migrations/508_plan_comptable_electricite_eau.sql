-- =====================================================================
-- Migration 508 — Plan comptable : comptes Électricité et Eau (utilities)
-- =====================================================================
-- Comble un trou du plan révélé par le test de catégorisation : aucun compte
-- dédié pour l'électricité (CEB) ni l'eau (CWA) — le seul compte utility était
-- 6261 « Téléphone et internet ». Sans ces comptes, l'IA rangeait CEB/CWA dans
-- 628 « Charges externes diverses » (confiance basse). Comptes GLOBAUX
-- (societe_id NULL), 100 % additif. `classe` est GÉNÉRÉE → jamais insérée.
-- =====================================================================

BEGIN;

INSERT INTO public.plan_comptable
  (compte, libelle, type_compte, sens_normal, compte_parent, niveau, actif, est_analytique,
   categorie_ifrs, sous_categorie_ifrs, poste_etat_financier_ifrs, est_contra_ifrs,
   code_interne_ifrs, postable, related_party, societe_id)
VALUES
  -- code_interne_ifrs laissé NULL (FK vers comptes_ifrs ; pas de mapping dédié requis).
  ('6263', 'Électricité', 'charge', 'D', '626', 4, true, false,
   'charges', 'achats_et_charges_externes', 'SOCI.Charges.AchatsEtChargesExternes', false,
   NULL, true, false, NULL),
  ('6264', 'Eau', 'charge', 'D', '626', 4, true, false,
   'charges', 'achats_et_charges_externes', 'SOCI.Charges.AchatsEtChargesExternes', false,
   NULL, true, false, NULL)
ON CONFLICT DO NOTHING;

COMMIT;
