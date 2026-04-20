-- ═══════════════════════════════════════════════════════════════
-- Migration 147: Purge UNIVERSELLE des doublons d'écritures
--
-- ATTENTION : après PASSE 2, les écritures BNQ « orphelines »
-- (dont la contrepartie 512 a été supprimée) doivent aussi être
-- supprimées → PASSE 5 nettoie ces orphelins pour restaurer
-- l'équilibre Débit = Crédit.
-- ═══════════════════════════════════════════════════════════════

-- ─── PASSE 1 : Doublons BNQ avec MÊME lettre ─────────────────────
DELETE FROM public.ecritures_comptables_v2
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY societe_id, numero_compte, lettre, debit_mur, credit_mur, date_ecriture
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM public.ecritures_comptables_v2
    WHERE journal = 'BNQ'
      AND lettre IS NOT NULL
  ) sub
  WHERE rn > 1
);

-- ─── PASSE 2 : Doublons BNQ avec lettres DIFFÉRENTES ─────────────
DELETE FROM public.ecritures_comptables_v2
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY societe_id, numero_compte, debit_mur, credit_mur, date_ecriture
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM public.ecritures_comptables_v2
    WHERE journal = 'BNQ'
  ) sub
  WHERE rn > 1
);

-- ─── PASSE 3 : Doublons ACH/VTE par facture_id ──────────────────
DELETE FROM public.ecritures_comptables_v2
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY societe_id, facture_id, journal, numero_compte, debit_mur, credit_mur
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM public.ecritures_comptables_v2
    WHERE facture_id IS NOT NULL
      AND journal IN ('ACH', 'VTE')
  ) sub
  WHERE rn > 1
);

-- ─── PASSE 4 : Supprimer les écritures BNQ « total » quand les
-- écritures « détail par facture » existent déjà ─────────────────
DELETE FROM public.ecritures_comptables_v2 e
WHERE e.journal = 'BNQ'
  AND e.ref_folio IS NOT NULL
  AND e.ref_folio LIKE 'BANK-%'
  AND EXISTS (
    SELECT 1 FROM public.ecritures_comptables_v2 e2
    WHERE e2.journal = 'BNQ'
      AND e2.societe_id = e.societe_id
      AND e2.numero_compte = e.numero_compte
      AND e2.ref_folio LIKE e.ref_folio || '-%'
  );

-- ─── PASSE 5 : Supprimer les écritures BNQ orphelines ───────────
-- Après PASSE 2, certaines écritures débit (421/455) ont perdu leur
-- contrepartie crédit (512) qui a été supprimée comme doublon.
-- Une écriture BNQ lettrée dont le code lettre n'a AUCUNE autre
-- écriture BNQ dans la même société est un orphelin → à supprimer
-- pour restaurer l'équilibre.
DELETE FROM public.ecritures_comptables_v2
WHERE journal = 'BNQ'
  AND lettre IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.ecritures_comptables_v2 e2
    WHERE e2.journal = 'BNQ'
      AND e2.lettre = ecritures_comptables_v2.lettre
      AND e2.societe_id = ecritures_comptables_v2.societe_id
      AND e2.id != ecritures_comptables_v2.id
  );
