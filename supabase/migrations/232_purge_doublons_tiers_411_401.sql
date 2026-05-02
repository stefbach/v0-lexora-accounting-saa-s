-- ============================================================================
-- Migration 232 — Purge doublons 411/401 + diagnostic factures "payé" sans BNQ
-- ============================================================================
--
-- Bug observé en prod (signalé sur compte 411 SKYCALL) :
--
-- 1. Doublons VTE/ACH sur 411/401 pour la MÊME facture :
--    Cause : createEcrituresForFacture (lib/accounting/ecritures-factures.ts)
--    ne supprime QUE les écritures non lettrées avant régénération.
--    Si une ancienne écriture est lettrée (à un taux de change historique),
--    elle survit. Une nouvelle régénération crée une 2e ligne au taux courant.
--    Exemple SKYCALL : 18 450 EUR le 04/07/2025 →
--      • AUTO0001 = 1 007 120 MUR (taux 54.58, écriture courante)
--      • AUTO0002 = 942 252 MUR (taux 51.07, écriture historique lettrée)
--    Total 411 = 1,949M MUR au lieu de 1,007M attendu.
--
-- 2. 411/401 sans crédit/débit alors que factures marquées "payé" :
--    Cause : factures marquées "payé" manuellement via la page /client/factures
--    sans passer par le rapprochement. Aucune écriture BNQ
--    (debit 512 / credit 411) n'est créée → le compte tiers reste débiteur.
--
-- Cette migration :
--   PASSE 1 : Purge les doublons 411/401 par facture_id, garde le plus récent
--             (created_at DESC). Détache la lettre des écritures supprimées
--             pour la repousser sur l'écriture conservée si pertinent.
--   PASSE 2 : Diagnostic — liste les factures statut='paye' sans écriture BNQ
--             de contrepartie. Ne supprime ni ne crée rien (action humaine
--             requise : passer par le rapprochement OU créer les BNQ
--             manuellement).
--
-- IDEMPOTENT.
-- ============================================================================

-- ─── PASSE 1 : Doublons 411/401 par facture_id ──────────────────────────────
-- On garde la ligne la plus récente (taux de change courant). Si une ligne
-- supprimée portait une lettre, on la transfère à la ligne conservée pour
-- préserver le lettrage des paiements.

-- 1a. Préparer le mapping (lignes à supprimer + leur lettre éventuelle)
CREATE TEMP TABLE doublons_tier_to_kill ON COMMIT DROP AS
SELECT
  doublons.id AS doomed_id,
  doublons.lettre AS doomed_lettre,
  doublons.date_lettrage AS doomed_date_lettrage,
  keepers.id AS keeper_id
FROM (
  SELECT
    id, facture_id, numero_compte, lettre, date_lettrage, created_at,
    ROW_NUMBER() OVER (
      PARTITION BY facture_id, numero_compte
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.ecritures_comptables_v2
  WHERE facture_id IS NOT NULL
    AND journal IN ('VTE', 'ACH')
    -- On cible uniquement les comptes tiers : 411x, 401x (pas 706/607/4456/4457)
    AND (numero_compte LIKE '411%' OR numero_compte LIKE '401%')
) doublons
JOIN (
  SELECT
    facture_id, numero_compte,
    (ARRAY_AGG(id ORDER BY created_at DESC, id DESC))[1] AS id
  FROM public.ecritures_comptables_v2
  WHERE facture_id IS NOT NULL
    AND journal IN ('VTE', 'ACH')
    AND (numero_compte LIKE '411%' OR numero_compte LIKE '401%')
  GROUP BY facture_id, numero_compte
  HAVING COUNT(*) > 1
) keepers ON keepers.facture_id = doublons.facture_id
         AND keepers.numero_compte = doublons.numero_compte
WHERE doublons.rn > 1;

-- 1b. Reporter le lettrage des supprimés sur le keeper si le keeper n'est
--     pas déjà lettré et qu'au moins un doomed l'était
UPDATE public.ecritures_comptables_v2 ecr
SET lettre = mapping.first_lettre,
    date_lettrage = mapping.first_date_lettrage
FROM (
  SELECT
    keeper_id,
    -- Première lettre non nulle parmi les supprimés (n'importe laquelle)
    (ARRAY_AGG(doomed_lettre) FILTER (WHERE doomed_lettre IS NOT NULL))[1] AS first_lettre,
    (ARRAY_AGG(doomed_date_lettrage) FILTER (WHERE doomed_date_lettrage IS NOT NULL))[1] AS first_date_lettrage
  FROM doublons_tier_to_kill
  GROUP BY keeper_id
  HAVING BOOL_OR(doomed_lettre IS NOT NULL)
) mapping
WHERE ecr.id = mapping.keeper_id
  AND ecr.lettre IS NULL;

-- 1c. Supprimer les doublons
DELETE FROM public.ecritures_comptables_v2
WHERE id IN (SELECT doomed_id FROM doublons_tier_to_kill);

-- ─── PASSE 1bis : Doublons par ref_folio FAC-<id> sans facture_id ──────────
-- Cas legacy où facture_id n'a pas été propagé sur les écritures (avant
-- mig 133). On dédup par ref_folio = 'FAC-<facture_id>' qui est aussi
-- stable.
CREATE TEMP TABLE doublons_ref_to_kill ON COMMIT DROP AS
SELECT
  doublons.id AS doomed_id,
  doublons.lettre AS doomed_lettre,
  doublons.date_lettrage AS doomed_date_lettrage,
  keepers.id AS keeper_id
FROM (
  SELECT
    id, ref_folio, numero_compte, lettre, date_lettrage, created_at,
    ROW_NUMBER() OVER (
      PARTITION BY ref_folio, numero_compte
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.ecritures_comptables_v2
  WHERE ref_folio LIKE 'FAC-%'
    AND facture_id IS NULL
    AND journal IN ('VTE', 'ACH')
    AND (numero_compte LIKE '411%' OR numero_compte LIKE '401%')
) doublons
JOIN (
  SELECT
    ref_folio, numero_compte,
    (ARRAY_AGG(id ORDER BY created_at DESC, id DESC))[1] AS id
  FROM public.ecritures_comptables_v2
  WHERE ref_folio LIKE 'FAC-%'
    AND facture_id IS NULL
    AND journal IN ('VTE', 'ACH')
    AND (numero_compte LIKE '411%' OR numero_compte LIKE '401%')
  GROUP BY ref_folio, numero_compte
  HAVING COUNT(*) > 1
) keepers ON keepers.ref_folio = doublons.ref_folio
         AND keepers.numero_compte = doublons.numero_compte
WHERE doublons.rn > 1;

UPDATE public.ecritures_comptables_v2 ecr
SET lettre = mapping.first_lettre,
    date_lettrage = mapping.first_date_lettrage
FROM (
  SELECT
    keeper_id,
    (ARRAY_AGG(doomed_lettre) FILTER (WHERE doomed_lettre IS NOT NULL))[1] AS first_lettre,
    (ARRAY_AGG(doomed_date_lettrage) FILTER (WHERE doomed_date_lettrage IS NOT NULL))[1] AS first_date_lettrage
  FROM doublons_ref_to_kill
  GROUP BY keeper_id
  HAVING BOOL_OR(doomed_lettre IS NOT NULL)
) mapping
WHERE ecr.id = mapping.keeper_id
  AND ecr.lettre IS NULL;

DELETE FROM public.ecritures_comptables_v2
WHERE id IN (SELECT doomed_id FROM doublons_ref_to_kill);

-- ─── PASSE 2 : Diagnostic — factures "payé" sans BNQ de contrepartie ────────
-- Liste les factures dont statut='paye' mais qui n'ont aucune écriture BNQ
-- créditant 411 (client) ou débitant 401 (fournisseur). Le compte tiers
-- reste débiteur/créditeur dans la balance → faux positif "client doit X".
--
-- Action humaine requise : ces factures doivent être passées dans le
-- rapprochement bancaire ou avoir leurs écritures BNQ créées manuellement.
CREATE TEMP TABLE factures_paye_sans_bnq ON COMMIT DROP AS
SELECT
  f.id AS facture_id,
  f.societe_id,
  f.numero_facture,
  f.tiers,
  f.type_facture,
  f.date_facture,
  f.montant_ttc,
  f.devise,
  f.montant_mur,
  COUNT(ecr_tier.id) AS nb_ecritures_tier,
  COUNT(ecr_bnq.id) AS nb_ecritures_bnq
FROM public.factures f
LEFT JOIN public.ecritures_comptables_v2 ecr_tier
  ON ecr_tier.facture_id = f.id
 AND ecr_tier.journal IN ('VTE', 'ACH')
 AND (
   (f.type_facture = 'client'      AND ecr_tier.numero_compte LIKE '411%' AND ecr_tier.debit_mur > 0)
   OR
   (f.type_facture = 'fournisseur' AND ecr_tier.numero_compte LIKE '401%' AND ecr_tier.credit_mur > 0)
 )
LEFT JOIN public.ecritures_comptables_v2 ecr_bnq
  ON ecr_bnq.facture_id = f.id
 AND ecr_bnq.journal = 'BNQ'
 AND (
   (f.type_facture = 'client'      AND ecr_bnq.numero_compte LIKE '411%' AND ecr_bnq.credit_mur > 0)
   OR
   (f.type_facture = 'fournisseur' AND ecr_bnq.numero_compte LIKE '401%' AND ecr_bnq.debit_mur > 0)
 )
WHERE f.statut = 'paye'
GROUP BY f.id, f.societe_id, f.numero_facture, f.tiers, f.type_facture,
         f.date_facture, f.montant_ttc, f.devise, f.montant_mur
HAVING COUNT(ecr_tier.id) > 0  -- a une écriture VTE/ACH (donc bien comptabilisée)
   AND COUNT(ecr_bnq.id) = 0;  -- mais pas de BNQ de paiement

-- ─── Rapport ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_killed_with_id INTEGER;
  v_killed_legacy INTEGER;
  v_factures_orphelines INTEGER;
  v_societes_concernees INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO v_factures_orphelines FROM factures_paye_sans_bnq;
  SELECT COUNT(DISTINCT societe_id) INTO v_societes_concernees FROM factures_paye_sans_bnq;

  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ Migration 232 terminée';
  RAISE NOTICE '';
  RAISE NOTICE '── PASSE 1 : Purge doublons 411/401 ──';
  RAISE NOTICE '  • Doublons supprimés (facture_id): voir lignes affectées par DELETE';
  RAISE NOTICE '  • Doublons supprimés (ref_folio legacy): voir lignes affectées par DELETE';
  RAISE NOTICE '  • Le lettrage des supprimés a été reporté sur le keeper si applicable.';
  RAISE NOTICE '';
  RAISE NOTICE '── PASSE 2 : Factures "payé" sans BNQ de contrepartie (DIAGNOSTIC SEUL) ──';
  RAISE NOTICE '  • Nombre de factures concernées : %', v_factures_orphelines;
  RAISE NOTICE '  • Sociétés concernées : %', v_societes_concernees;
  RAISE NOTICE '';
  IF v_factures_orphelines > 0 THEN
    RAISE NOTICE '  ⚠️ Ces factures sont marquées "payé" mais n''ont pas d''écriture BNQ.';
    RAISE NOTICE '  → Compte 411/401 reste débiteur/créditeur dans la balance.';
    RAISE NOTICE '  → Action requise : passer ces factures dans le rapprochement bancaire';
    RAISE NOTICE '    pour générer les écritures BNQ de paiement (debit 512 / credit 411).';
    RAISE NOTICE '';
    RAISE NOTICE '  Top 20 factures concernées :';
    FOR rec IN
      SELECT numero_facture, tiers, type_facture, date_facture,
             montant_mur, devise
      FROM factures_paye_sans_bnq
      ORDER BY date_facture DESC
      LIMIT 20
    LOOP
      RAISE NOTICE '    • [%] % — % — % MUR — %',
        rec.type_facture, rec.numero_facture, rec.tiers,
        rec.montant_mur, rec.date_facture;
    END LOOP;
  END IF;
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;
