-- ============================================================================
-- Migration 170 — Restreindre les règles de classification trop permissives
-- ============================================================================
--
-- Bugs observés en prod sur Digital Data Solutions après activation des
-- règles de classification (migrations 135/136) :
--
--   1. R01_MRA_PAYE → target 4330 (PAYE pur) ALORS que les paiements MRA
--      bancaires sont souvent GLOBAUX (couvrent PAYE + CSG + NSF + Levy).
--      Résultat : 13 M MUR faussement débités sur 4330 au lieu de ventilés.
--      Fix : router vers 4471 (MRA général = compte d'attente) pour que le
--      comptable ventile manuellement.
--
--   2. R04_NPF_NSF avec pattern_libelle='npf|nsf' et pattern_tiers=NULL
--      matche N'IMPORTE QUELLE tx dont le libellé bancaire contient "NPF/NSF"
--      (codes de référence MCB). Exemples observés : SKYCALL (client),
--      Stephane Bach (associé), Emtel, Serviqual, Obesity Care Clinic.
--      Résultat : 4.37 M MUR faussement crédités sur 4312 NSF salarié.
--      Fix : exiger le tiers MRA. Seuls les vrais paiements NSF à la MRA
--      tombent désormais sur 4312.
--
--   3. R05_INTERCO avec pattern_libelle=NULL et pattern_tiers=NULL matche
--      TOUTES les tx non identifiées → catch-all qui a routé fournisseurs,
--      salaires, virements perso vers 580 (virements internes). Résultat :
--      977K MUR faussement sur 580 (viole la règle R3 mauricienne qui exige
--      580 soldé à la clôture mensuelle).
--      Fix : désactiver R05_INTERCO. Les vrais virements interco seront
--      classifiés manuellement via l'UI ou via une règle future plus
--      spécifique (ex: pattern_tiers matchant les noms de sociétés sœurs
--      connues).
--
-- IDEMPOTENTE (UPDATE conditionnels). Aucune suppression de données.
-- ============================================================================

-- ── 1. R01_MRA_PAYE : route vers 4471 (MRA général) au lieu de 4330 (PAYE) ──
UPDATE public.classification_rules
SET compte_debit = '4471',
    classification = 'MRA — paiement global',
    libelle_template = 'Paiement MRA — {{date}}'
WHERE rule_code = 'R01_MRA_PAYE'
  AND compte_debit IN ('4330', '447200', '447');

-- ── 2. R04_NPF_NSF : exige tiers MRA pour éviter les faux positifs ─────────
UPDATE public.classification_rules
SET pattern_tiers = 'mauritius revenue|^mra\b|\bmra\b'
WHERE rule_code = 'R04_NPF_NSF';

-- ── 3. R05_INTERCO : désactiver (trop permissive) ──────────────────────────
UPDATE public.classification_rules
SET active = FALSE,
    classification = COALESCE(classification, '') || ' [DÉSACTIVÉE MIG 170 — pattern trop large]'
WHERE rule_code = 'R05_INTERCO'
  AND active = TRUE;

-- ── 4. Créer le compte 4710 (compte d'attente) s'il n'existe pas ──────────
-- (seedé partiellement par migration 166, ajout explicite ici)
INSERT INTO public.plan_comptable (compte, libelle, type_compte, sens_normal, compte_parent, niveau)
VALUES ('4710', 'Comptes d''attente',                       'actif',  'D', '471', 4)
ON CONFLICT (compte) DO UPDATE
  SET libelle = EXCLUDED.libelle;

-- ── 5. Rapport ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_r01_after TEXT;
  v_r04_after TEXT;
  v_r05_active BOOLEAN;
BEGIN
  SELECT compte_debit INTO v_r01_after FROM public.classification_rules WHERE rule_code = 'R01_MRA_PAYE';
  SELECT pattern_tiers INTO v_r04_after FROM public.classification_rules WHERE rule_code = 'R04_NPF_NSF';
  SELECT active INTO v_r05_active FROM public.classification_rules WHERE rule_code = 'R05_INTERCO';

  RAISE NOTICE '▶ Migration 170 terminée';
  RAISE NOTICE '  • R01_MRA_PAYE compte_debit = % (attendu 4471)', v_r01_after;
  RAISE NOTICE '  • R04_NPF_NSF pattern_tiers = % (attendu mauritius revenue|mra)', v_r04_after;
  RAISE NOTICE '  • R05_INTERCO active = % (attendu FALSE)', v_r05_active;
END $$;
