-- ============================================================================
-- 476 — Archiver les plans « legacy » oubliés par la migration 467
-- ============================================================================
--
-- La migration 467 désactive les plans des packs `compta`, `paie`, `bundle`
-- et `addon`, mais laisse actifs les trois plans marqués `pack = 'legacy'`
-- par la migration 283 : `starter`, `pro` et `premium`.
--
-- Conséquence constatée sur le catalogue public avant correction :
-- /api/plans?type=dirigeant renvoyait encore
--   starter  Rs 1 500
--   pro      Rs 4 500
--   premium  Rs 8 500
-- aux côtés des nouveaux Packages Société et GBC. Un prospect aurait vu la
-- nouvelle grille sur /tarifs et un mélange des deux sur /inscription.
--
-- Comme en 467, les lignes ne sont pas supprimées : des sociétés y sont
-- rattachées et l'historique de facturation doit rester lisible. Elles
-- passent `actif = FALSE`, ce qui les retire du catalogue public sans casser
-- les jointures.
-- ============================================================================

BEGIN;

UPDATE public.plans
   SET actif = FALSE,
       prix_visible = FALSE,
       updated_at = NOW()
 WHERE pack = 'legacy';

COMMIT;

NOTIFY pgrst, 'reload schema';
