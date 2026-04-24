-- ============================================================================
-- Migration 158 — Corriger les comptes des règles de classification vers PCM 4-digits
-- ============================================================================
--
-- Contexte : migrations 135 et 136 ont seedé les règles R01-R06 avec des codes
-- legacy 6-digits ('421100', '431100', '431200', '431300', '447100', '447200',
-- '44551', '627100', '627200', '635100'). Le trigger `tr_ecritures_remap_pcm`
-- (migration 144) ne remappe QUE certains de ces codes :
--   • 421100 → 4211 (mais on attend 4210 pour Net à payer)
--   • 431100 → 4312 (mais seule NSF sal va sur 4312 ; CSG sal = 4311)
--   • 431200 → pas de remap (devrait être 4312 pour NSF)
--   • 431300 → pas de remap (devrait être 4323 pour PRGF)
--
-- Conséquence observée sur la société client (captures Grand Livre) :
--   • compte 421 : 9 crédits, 0 débit, solde -5,7M  (désynchronisé)
--   • compte 4211 : 12 débits orphelins (3,4M)      (doublon du 4210)
--   • compte 4312 : 73 lignes, écart crédit-débit 5,9M (accumulation des R04)
--   • 4321 / 4322 / 4323 / 4324 : 9 lignes chacun   (cohérent via import-paie)
--
-- Cette migration met à jour le `compte_debit` des règles directement vers le
-- PCM canonique 4-digits, sans passer par le trigger de remap. Idempotente.
--
-- Règles corrigées :
--   • R03_SALARY_BULK     : 421100 → 4210  (salaires nets à payer)
--   • R04_EPAYROLL        : 431100 → 4312  (NSF salarié : approximation la
--                                           + courante pour "epay" globaux.
--                                           NB : un paiement e-payroll paie
--                                           plusieurs cotisations en réalité ;
--                                           cette règle reste un pis-aller.)
--   • R04_NPF_NSF         : 431200 → 4312  (NSF salarié à verser)
--   • R04_CSG             : 431100 → 4311  (CSG salarié à verser — pas NSF !)
--   • R04_PRGF            : 431300 → 4323  (PRGF à verser)
--   • R04_EPAYROLL_IB     : 431100 → 4312  (idem R04_EPAYROLL)
--   • R01_MRA_PAYE        : 447200 → 4330  (PAYE à reverser — PCM canonique)
--   • R01_MRA_VAT         : 44551  → 4455  (TVA à décaisser, PCM 4-digits)
--   • R01_MRA_GENERAL     : 447100 → 44713 (MRA génériques, on garde legacy
--                                           car pas de code PCM canonique
--                                           clair — placeholder 4471*)
--   • R02_BANK_FEES       : 627100 → 6271  (frais bancaires PCM 4-digits)
--   • R02_MASTERCARD_FEES : 627100 → 6271  (frais carte, idem)
--   • R02_STAMP_DUTY      : 635100 → 6351  (droits de timbre, PCM 4-digits)
--   • R02_SWIFT_CHARGE    : 627200 → 6272  (commissions SWIFT, PCM 4-digits)
--
-- Note importante : on NE touche PAS R05 (interco '580'), ni R06 (401 fournisseur)
-- ni R07 (directeurs) qui utilisent déjà les bons codes.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Ajouter les libellés PCM manquants dans plan_comptable
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.plan_comptable (compte, libelle, type_compte, sens_normal, compte_parent, niveau)
VALUES
  ('4455', 'TVA à décaisser',                              'passif', 'C', '445', 4),
  ('4471', 'MRA — impôts et taxes divers',                 'passif', 'C', '447', 4),
  ('6271', 'Frais bancaires',                              'charge', 'D', '627', 4),
  ('6272', 'Commissions bancaires (SWIFT, cables)',        'charge', 'D', '627', 4),
  ('6351', 'Droits de timbre et enregistrement',           'charge', 'D', '635', 4)
ON CONFLICT (compte) DO UPDATE
  SET libelle = EXCLUDED.libelle,
      type_compte = EXCLUDED.type_compte,
      sens_normal = EXCLUDED.sens_normal,
      compte_parent = EXCLUDED.compte_parent,
      niveau = EXCLUDED.niveau;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Mettre à jour les règles R01 / R02 / R03 / R04
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.classification_rules SET compte_debit = '4210' WHERE rule_code = 'R03_SALARY_BULK';
UPDATE public.classification_rules SET compte_debit = '4312' WHERE rule_code = 'R04_EPAYROLL';
UPDATE public.classification_rules SET compte_debit = '4312' WHERE rule_code = 'R04_NPF_NSF';
UPDATE public.classification_rules SET compte_debit = '4311' WHERE rule_code = 'R04_CSG';
UPDATE public.classification_rules SET compte_debit = '4323' WHERE rule_code = 'R04_PRGF';
UPDATE public.classification_rules SET compte_debit = '4312' WHERE rule_code = 'R04_EPAYROLL_IB';
UPDATE public.classification_rules SET compte_debit = '4330' WHERE rule_code = 'R01_MRA_PAYE';
UPDATE public.classification_rules SET compte_debit = '4455' WHERE rule_code = 'R01_MRA_VAT';
UPDATE public.classification_rules SET compte_debit = '4471' WHERE rule_code = 'R01_MRA_GENERAL';
UPDATE public.classification_rules SET compte_debit = '6271' WHERE rule_code = 'R02_BANK_FEES';
UPDATE public.classification_rules SET compte_debit = '6271' WHERE rule_code = 'R02_MASTERCARD_FEES';
UPDATE public.classification_rules SET compte_debit = '6351' WHERE rule_code = 'R02_STAMP_DUTY';
UPDATE public.classification_rules SET compte_debit = '6272' WHERE rule_code = 'R02_SWIFT_CHARGE';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Mettre à jour aussi la table compte_remap_pcm (migration 144) pour
--    que tout futur INSERT legacy passe par un remap cohérent avec ci-dessus
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO compte_remap_pcm (legacy_code, pcm_code, libelle, note) VALUES
  ('421100', '4210', 'Salaires nets à payer',                      'Correction Mig 158 : 421100 → 4210 (le 4211 est Primes à payer)'),
  ('431100', '4311', 'CSG salarié à verser',                       'Correction Mig 158 : CSG sal sur 4311 (pas 4312 qui est NSF)'),
  ('431200', '4312', 'NSF salarié à verser',                       'Ajout Mig 158'),
  ('431300', '4323', 'PRGF à verser',                              'Ajout Mig 158'),
  ('447100', '4471', 'MRA — impôts et taxes divers',               'Ajout Mig 158'),
  ('447200', '4330', 'PAYE à reverser à la MRA',                   'Ajout Mig 158'),
  ('44551',  '4455', 'TVA à décaisser',                            'Ajout Mig 158'),
  ('627100', '6271', 'Frais bancaires',                            'Ajout Mig 158'),
  ('627200', '6272', 'Commissions bancaires (SWIFT)',              'Ajout Mig 158'),
  ('635100', '6351', 'Droits de timbre',                           'Ajout Mig 158')
ON CONFLICT (legacy_code) DO UPDATE
  SET pcm_code = EXCLUDED.pcm_code,
      libelle  = EXCLUDED.libelle,
      note     = EXCLUDED.note;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Vérification
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.classification_rules
  WHERE rule_code IN ('R01_MRA_PAYE','R01_MRA_VAT','R01_MRA_GENERAL',
                      'R02_BANK_FEES','R02_MASTERCARD_FEES','R02_STAMP_DUTY','R02_SWIFT_CHARGE',
                      'R03_SALARY_BULK',
                      'R04_EPAYROLL','R04_NPF_NSF','R04_CSG','R04_PRGF','R04_EPAYROLL_IB')
    AND compte_debit !~ '^[0-9]{4}$';  -- expect 4-digit codes now
  IF v_count > 0 THEN
    RAISE WARNING 'Migration 158: % règle(s) n''ont pas été mise(s) à jour (probablement non seedées en base)', v_count;
  END IF;
  RAISE NOTICE 'Migration 158 terminée — R01/R02/R03/R04 alignées sur PCM 4-digits';
END $$;
