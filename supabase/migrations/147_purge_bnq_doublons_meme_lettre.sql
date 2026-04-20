-- ═══════════════════════════════════════════════════════════════
-- Migration 147: Purge UNIVERSELLE des doublons d'écritures
--
-- Observé en prod (capture utilisateur sur compte 411) :
-- Pour chaque règlement client SKYCALL, DEUX écritures BNQ 411 crédit
-- sont visibles avec le même montant, la même date, la même lettre (R017,
-- R016, ...) mais des libellés légèrement différents :
--   • "Paiement SKYCALL — 02/03/2026"
--   • "Règlement 02/03/2026 — SKYCALL"
--
-- ⚠ Le même bug touche TOUS les comptes BNQ :
--   • 401 (fournisseurs), 411 (clients)
--   • 512 (banque) — contrepartie de tout règlement
--   • 581 (virements internes)
--   • 421/4457/627 (salaires, TVA, frais) quand lettrés
--
-- Cause : deux code paths (phase finale d'auto_rapprocher + sync_lettrage)
-- créent la même écriture avec un libellé différent qui échappe à la
-- dédup BNQ (qui compare par libellé). Les correctifs code évitent les
-- doublons futurs ; cette migration nettoie les doublons existants.
--
-- Stratégie : pour chaque groupe (societe_id, numero_compte, lettre,
-- debit_mur, credit_mur, date_ecriture) avec journal='BNQ' qui contient
-- plus d'une ligne, on garde la plus ancienne (created_at MIN) et on
-- supprime les autres.
-- ═══════════════════════════════════════════════════════════════

-- Aperçu : afficher le nombre de lignes qui seraient supprimées (tous comptes)
DO $$
DECLARE
  v_dup_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_dup_count
  FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY societe_id, numero_compte, lettre, debit_mur, credit_mur, date_ecriture
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM public.ecritures_comptables_v2
    WHERE journal = 'BNQ'
      AND lettre IS NOT NULL
  ) sub
  WHERE rn > 1;
  RAISE NOTICE 'Migration 147: % ligne(s) BNQ en doublon (tous comptes confondus) à supprimer', v_dup_count;
END $$;

-- ─── SUPPRESSION UNIVERSELLE des doublons BNQ lettrés ──────────────
-- Couvre 401, 411, 512, 581, 421, 4457, 627, etc.
-- Même clé de dédup : (societe_id, numero_compte, lettre, debit, credit, date).
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

-- ─── Doublons BNQ NON lettrés ─────────────────────────────────────
-- Certaines écritures créées par backfill peuvent être sans lettre mais
-- identiques sur (societe_id, numero_compte, debit, credit, date, libelle).
-- On inclut le libellé dans la clé pour être plus conservateur sur les non-lettrées.
DELETE FROM public.ecritures_comptables_v2
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY societe_id, numero_compte, debit_mur, credit_mur, date_ecriture, libelle
        ORDER BY created_at ASC, id ASC
      ) AS rn
    FROM public.ecritures_comptables_v2
    WHERE journal = 'BNQ'
      AND lettre IS NULL
  ) sub
  WHERE rn > 1
);

-- ─── Doublons ACH/VTE par facture_id ──────────────────────────────
-- Une facture = 1 jeu d'écritures ACH ou VTE. Si la même facture a
-- plusieurs entrées sur le même numero_compte + même direction, c'est
-- un doublon (pas une écriture multi-lignes légitime).
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
