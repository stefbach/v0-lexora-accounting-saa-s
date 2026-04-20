-- ═══════════════════════════════════════════════════════════════
-- Migration 147: Purge UNIVERSELLE des doublons d'écritures
--
-- Deux types de doublons observés en prod :
--
-- TYPE 1 — Même lettre, libellés différents (compte 411/401) :
--   • "Paiement SKYCALL — 02/03/2026" (R017)
--   • "Règlement 02/03/2026 — SKYCALL" (R017)
--   Cause : phase finale auto_rapprocher + sync_lettrage
--
-- TYPE 2 — Lettres DIFFÉRENTES, même montant/date (compte 512) :
--   • "Banque [EUR @ 54.5852] — MR STEPHANE HENRI BACH" (CL1670047)
--   • "Banque — MR STEPHANE HENRI BACH" (A036)
--   Cause : auto_rapprocher crée CLS- + classer_transaction crée CL-
--   sans supprimer la CLS- existante (ref_folio CL- ≠ CLS-),
--   ET oldLettre lu APRÈS mise à jour → suppression par lettre jamais exécutée
--
-- Le même bug touche TOUS les comptes BNQ (401, 411, 512, 581, 421, ...).
-- ═══════════════════════════════════════════════════════════════

-- ─── PASSE 1 : Doublons BNQ avec MÊME lettre ─────────────────────
-- Clé de dédup : (societe_id, numero_compte, lettre, debit, credit, date).
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
-- Cas MR STEPHANE HENRI BACH : même (societe_id, numero_compte,
-- debit_mur, credit_mur, date_ecriture) mais lettres distinctes.
-- On garde le plus ancien, on supprime les plus récents.
-- Sécurité : limité au journal BNQ uniquement (les ACH/VTE
-- légitimes ne sont pas touchés).
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
-- Une facture = 1 jeu d'écritures ACH ou VTE. Si la même facture a
-- plusieurs entrées sur le même numero_compte + même direction, c'est
-- un doublon.
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
