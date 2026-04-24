-- ═══════════════════════════════════════════════════════════════
-- Migration 188 — HOTFIX G8 : compte dédié IAS 19
--
-- Crée un sous-compte 64175 enfant de 6417 pour isoler la charge
-- de provision IAS 19 des autres indemnités de départ.
--
-- Le helper lib/rh/ias19-provisions.ts passe à 64175. Aucun impact
-- sur les provisions existantes : G8 n'a jamais été comptabilisé
-- en prod avant ce hotfix.
-- ═══════════════════════════════════════════════════════════════

INSERT INTO public.plan_comptable
  (compte, libelle, type_compte, sens_normal, compte_parent, niveau, actif)
SELECT '64175',
       'Provisions congés payés (charge) — IAS 19',
       'charge', 'D', '6417', 5, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.plan_comptable WHERE compte = '64175'
);

COMMENT ON COLUMN public.plan_comptable.compte IS
  'Compte PCM. 64175 = sous-compte dédié IAS 19 (hotfix G8, migration 188).';
