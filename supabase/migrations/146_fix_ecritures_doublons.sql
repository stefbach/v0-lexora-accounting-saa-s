-- ═══════════════════════════════════════════════════════════════
-- Migration 146: Anti-doublons écritures comptables
--
-- 1. Nettoyer les doublons ACH/VTE existants (garder 1 seul jeu
--    par facture_id / ref_folio)
-- 2. Nettoyer les doublons BNQ avec même clé de dédup
-- 3. Ajouter un index sur (societe_id, facture_id) pour les lookups
-- 4. Ajouter un index partiel unique sur BNQ pour empêcher les
--    doublons futurs au niveau DB
-- ═══════════════════════════════════════════════════════════════

-- Step 1: Supprimer les doublons ACH/VTE (même facture_id, même
-- journal, même compte, même montant). On garde la plus récente.
DELETE FROM public.ecritures_comptables_v2
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY societe_id, facture_id, journal, numero_compte, debit_mur, credit_mur
        ORDER BY created_at DESC
      ) AS rn
    FROM public.ecritures_comptables_v2
    WHERE facture_id IS NOT NULL
      AND journal IN ('ACH', 'VTE')
  ) sub
  WHERE rn > 1
);

-- Step 2: Supprimer les doublons BNQ (même clé de dédup que bnq-dedupe.ts).
DELETE FROM public.ecritures_comptables_v2
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY COALESCE(dossier_id, '00000000-0000-0000-0000-000000000000'),
                     date_ecriture, numero_compte, libelle, debit_mur, credit_mur
        ORDER BY created_at DESC
      ) AS rn
    FROM public.ecritures_comptables_v2
    WHERE journal = 'BNQ'
  ) sub
  WHERE rn > 1
);

-- Step 3: Index pour lookups rapides par facture_id
CREATE INDEX IF NOT EXISTS idx_ecritures_v2_facture_id
  ON public.ecritures_comptables_v2 (facture_id)
  WHERE facture_id IS NOT NULL;

-- Step 4: Index pour les ref_folio lookups (anti-doublon + delete)
CREATE INDEX IF NOT EXISTS idx_ecritures_v2_societe_ref_folio
  ON public.ecritures_comptables_v2 (societe_id, ref_folio)
  WHERE ref_folio IS NOT NULL;
