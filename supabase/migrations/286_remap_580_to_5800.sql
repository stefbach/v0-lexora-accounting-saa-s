-- ============================================================================
-- Migration 286 — Remap virement_interne 580 → 5800 (PCM leaf)
-- ============================================================================
-- Le code écrivait 'virement_interne' au compte parent '580' au lieu du
-- compte feuille PCM '5800' (Virements internes - transit). Conséquence :
-- les écritures n'apparaissaient pas dans le Plan Comptable (compte 5800
-- marqué "non utilisé" malgré 14 écritures à 580).
--
-- Ce script :
--   1. Ajoute la remap 580 → 5800 dans compte_remap_pcm (auto-fix futur via trigger)
--   2. Backfill les écritures existantes
-- ============================================================================

-- 1. Enregistrer la remap (le trigger trg_remap_compte_pcm la prendra)
INSERT INTO compte_remap_pcm (legacy_code, pcm_code, libelle, note) VALUES
  ('580', '5800', 'Virements internes (transit)', 'Migration 286 — parent 58 → feuille 5800')
ON CONFLICT (legacy_code) DO UPDATE
  SET pcm_code = EXCLUDED.pcm_code,
      libelle  = EXCLUDED.libelle,
      note     = EXCLUDED.note;

-- 2. Backfill — déplacer les écritures existantes du parent 580 au feuille 5800
UPDATE ecritures_comptables_v2
SET numero_compte = '5800'
WHERE numero_compte = '580';
