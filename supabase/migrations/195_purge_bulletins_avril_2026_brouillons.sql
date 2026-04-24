-- ═══════════════════════════════════════════════════════════════
-- Migration 195 — Purge bulletins avril 2026 en statut 'brouillon'
--
-- Après les fixes 193 (WRA S.45) et 194 (recalcul soldes) et le fix
-- moteur paie (check enConge prioritaire), les bulletins d'avril 2026
-- générés AVANT ces fixes sont potentiellement incohérents :
--   - Sheetal : -2 024 MUR absence injustifiée sur 24/04 AL approuvée
--   - Marie Alicia / New employe / Test Nouveau : absences à recalculer
--
-- Solution : supprimer les bulletins brouillons d'avril 2026. Mégane
-- relance "Calculer paie avril 2026" depuis /rh/paie — le nouveau
-- moteur génère des bulletins cohérents.
--
-- SÉCURITÉ : ne supprime QUE les brouillons. Les bulletins 'valide',
-- 'comptabilise' ou 'paye' sont préservés (historique sacré).
--
-- Aucune cascade : vérifié qu'aucune écriture comptable n'est rattachée
-- aux brouillons (elles sont créées à la comptabilisation uniquement).
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_supprimes INTEGER;
  v_preserves INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_preserves
  FROM public.bulletins_paie
  WHERE periode = '2026-04-01'
    AND statut <> 'brouillon';

  DELETE FROM public.bulletins_paie
  WHERE periode = '2026-04-01'
    AND statut = 'brouillon';
  GET DIAGNOSTICS v_supprimes = ROW_COUNT;

  RAISE NOTICE 'Migration 195 — Avril 2026 : % bulletins brouillons supprimés, % bulletins préservés (valide/comptabilise/paye).',
    v_supprimes, v_preserves;
END $$;
