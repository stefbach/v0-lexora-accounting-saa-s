-- ═══════════════════════════════════════════════════════════════
-- Migration 147: Purge des doublons BNQ 411/401 (même facture/lettre)
--
-- Observé en prod (capture utilisateur) :
-- Pour chaque règlement client SKYCALL, DEUX écritures BNQ 411 crédit
-- sont visibles avec le même montant, la même date, la même lettre (R017,
-- R016, ...) mais des libellés légèrement différents :
--   • "Paiement SKYCALL — 02/03/2026"
--   • "Règlement 02/03/2026 — SKYCALL"
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

-- Aperçu : afficher le nombre de lignes qui seraient supprimées
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
      AND (numero_compte LIKE '401%' OR numero_compte LIKE '411%')
  ) sub
  WHERE rn > 1;
  RAISE NOTICE 'Migration 147: % ligne(s) BNQ 401/411 en doublon à supprimer', v_dup_count;
END $$;

-- Suppression effective des doublons BNQ 401/411 avec même lettre
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
      AND (numero_compte LIKE '401%' OR numero_compte LIKE '411%')
  ) sub
  WHERE rn > 1
);

-- Idem pour la contrepartie banque (512%) : deux entrées 512 débit/crédit
-- peuvent avoir été créées en miroir des 401/411 dupliquées.
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
      AND numero_compte LIKE '512%'
  ) sub
  WHERE rn > 1
);
