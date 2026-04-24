-- ============================================================================
-- Migration 159 — Purge des doublons sur les journaux paie (SAL, OD-PAIE)
--                 + redédoublonnage strict BNQ classe 42x/43x
-- ============================================================================
--
-- Contexte : migration 146 a dédupliqué ACH/VTE + BNQ, mais exclut SAL/OD-PAIE.
-- En prod, on voit sur la classe 43 :
--   • compte 4312 : 73 écritures (attendues : ~9/mois × 1 source = 9)
--   • écart crédit-débit 5,9M MUR
-- Causes : (1) coexistence de 3 pipelines paie (import-paie agrégé SAL,
-- generer_ecritures_paie par bulletin OD-PAIE, classifications R04 via BNQ)
-- et (2) absence de contrainte d'unicité / dédup sur SAL et OD-PAIE.
--
-- Cette migration :
--   • Passe 1 : dédoublonne SAL par (societe_id, date, journal, numero_compte,
--               debit_mur, credit_mur, libelle) — garde la plus ancienne.
--   • Passe 2 : dédoublonne OD-PAIE par (societe_id, ref_folio, numero_compte,
--               debit_mur, credit_mur) — garde la plus ancienne. ref_folio stable
--               (`BP-<bulletin_id>`) donc la clé est fiable.
--   • Passe 3 : redédup BNQ classe 42x/43x (ces comptes sortent du périmètre
--               de la dédup BNQ existante de migration 150 qui se faisait sur
--               toutes classes confondues — ici on resserre).
--   • Passe 4 : purge les écritures classe 42x/43x orphelines (perdues après
--               passes 1-3) : lettre non nulle mais aucune contrepartie
--               partageant cette lettre. Restaure l'équilibre.
--
-- Toutes les passes préservent le lettrage existant : on garde la plus ancienne
-- ligne (qui porte typiquement la lettre historique). Idempotent.
-- ============================================================================

-- ─── PASSE 1 : Doublons SAL ─────────────────────────────────────────────────
DELETE FROM public.ecritures_comptables_v2
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY societe_id, date_ecriture, journal, numero_compte,
                     COALESCE(debit_mur, 0), COALESCE(credit_mur, 0),
                     COALESCE(libelle, '')
        ORDER BY
          -- Préserver les lettrages existants (les lettrées en premier)
          (CASE WHEN lettre IS NOT NULL THEN 0 ELSE 1 END),
          created_at ASC,
          id ASC
      ) AS rn
    FROM public.ecritures_comptables_v2
    WHERE journal = 'SAL'
  ) sub
  WHERE rn > 1
);

-- ─── PASSE 2 : Doublons OD-PAIE par ref_folio `BP-<uuid>` ──────────────────
DELETE FROM public.ecritures_comptables_v2
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY societe_id, ref_folio, numero_compte,
                     COALESCE(debit_mur, 0), COALESCE(credit_mur, 0)
        ORDER BY
          (CASE WHEN lettre IS NOT NULL THEN 0 ELSE 1 END),
          created_at ASC,
          id ASC
      ) AS rn
    FROM public.ecritures_comptables_v2
    WHERE journal = 'OD-PAIE'
      AND ref_folio IS NOT NULL
  ) sub
  WHERE rn > 1
);

-- ─── PASSE 3 : Doublons BNQ classe 42/43 (règles R03/R04 jouées N fois) ──
-- Clé : (societe_id, numero_compte, date_ecriture, debit_mur, credit_mur,
--        libelle). Le ref_folio CLS-<releveId>-<idx> est unique par tx donc
--        on l'ajoute — si 2 tx distinctes ont produit la même écriture, on
--        les préserve.
DELETE FROM public.ecritures_comptables_v2
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY societe_id, numero_compte, date_ecriture,
                     COALESCE(debit_mur, 0), COALESCE(credit_mur, 0),
                     COALESCE(libelle, ''),
                     COALESCE(ref_folio, '')
        ORDER BY
          (CASE WHEN lettre IS NOT NULL THEN 0 ELSE 1 END),
          created_at ASC,
          id ASC
      ) AS rn
    FROM public.ecritures_comptables_v2
    WHERE journal = 'BNQ'
      AND (
        LEFT(COALESCE(numero_compte, ''), 2) IN ('42', '43')
        OR LEFT(COALESCE(numero_compte, ''), 3) IN ('421', '422', '423', '424', '425',
                                                     '431', '432', '433', '434')
      )
  ) sub
  WHERE rn > 1
);

-- ─── PASSE 4 : Écritures 42x/43x orphelines après dédup ────────────────────
-- Après une purge doublons, une ligne lettrée peut perdre sa contrepartie (512)
-- qui était le doublon et a été supprimée. On retire donc les lignes lettrées
-- dont plus aucune autre écriture ne partage la lettre dans la même société.
DELETE FROM public.ecritures_comptables_v2
WHERE journal IN ('BNQ', 'OD-PAIE')
  AND lettre IS NOT NULL
  AND (
    LEFT(COALESCE(numero_compte, ''), 3) IN ('421', '422', '423', '424', '425',
                                              '431', '432', '433', '434')
    OR LEFT(COALESCE(numero_compte, ''), 2) = '42'
    OR LEFT(COALESCE(numero_compte, ''), 2) = '43'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.ecritures_comptables_v2 e2
    WHERE e2.societe_id = ecritures_comptables_v2.societe_id
      AND e2.lettre = ecritures_comptables_v2.lettre
      AND e2.id != ecritures_comptables_v2.id
  );

-- ─── Index partiel anti-doublon futur sur SAL et OD-PAIE ──────────────────
-- On ne met PAS un UNIQUE strict (des variantes de libellé volontaires peuvent
-- exister). À la place, un index qui rend la dédup ultérieure rapide.
CREATE INDEX IF NOT EXISTS idx_ecritures_v2_paie_dedup
  ON public.ecritures_comptables_v2
  (societe_id, journal, numero_compte, date_ecriture, debit_mur, credit_mur)
  WHERE journal IN ('SAL', 'OD-PAIE');

-- ─── Rapport ──────────────────────────────────────────────────────────────
DO $$
DECLARE v_rows INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_rows FROM public.ecritures_comptables_v2;
  RAISE NOTICE 'Migration 159 terminée. Écritures restantes : %', v_rows;
END $$;
