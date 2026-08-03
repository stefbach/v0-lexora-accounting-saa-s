-- ============================================================================
-- 477 — `cabinet_solo` doit cibler les comptables, pas les dirigeants
-- ============================================================================
--
-- La migration 275 crée les trois plans du pack `cabinet` avec
-- `type_cible = 'comptable'`. En production, `cabinet_solo` porte pourtant
-- `type_cible = 'dirigeant'` : une dérive appliquée à la main, qu'aucune
-- migration ne reproduit. Ses deux jumeaux (`cabinet_team`,
-- `cabinet_enterprise`) sont restés sur `comptable`.
--
-- Tant que les plans `legacy` et `compta`/`paie`/`bundle` encombraient le
-- catalogue, l'anomalie passait inaperçue. Une fois 467 et 476 appliquées,
-- /api/plans?type=dirigeant renvoie :
--   cabinet_solo        Rs 4 500   <-- pack cabinet, proposé à un dirigeant
--   societe_essentiel   Rs 2 500
--   societe_croissance  Rs 4 900
--   …
-- et /inscription affiche la liste telle quelle, sans filtre. Un dirigeant
-- se voit donc proposer un abonnement de cabinet comptable, intercalé entre
-- deux paliers du Package Société et moins cher que Croissance.
--
-- Seul `type_cible` est corrigé. Le prix (Rs 4 500 en base contre Rs 3 500
-- en 275) relève d'une décision commerciale et n'est pas touché ici.
-- ============================================================================

BEGIN;

UPDATE public.plans
   SET type_cible = 'comptable',
       updated_at = NOW()
 WHERE code = 'cabinet_solo'
   AND type_cible <> 'comptable';

COMMIT;

NOTIFY pgrst, 'reload schema';
