-- ============================================================
-- Migration 170 — Sprint WRA Compliance G4
--
-- Ajout des types de congés manquants et table de règles par type :
--   - FML (Family Medical Leave, S.47A)          — 10j/an, déductible
--   - SPC_MARIAGE_SELF / SPC_MARIAGE_ENFANT      — 6j / 3j (S.48)
--   - SPC_DECES                                   — 3j (S.48)
--   - JUR (Juror Leave, S.49)                    — durée service juré
--   - INT (International Events, S.50)           — durée événement
--   - CRT (Court Leave, S.51)                    — temps nécessaire
--
-- + Correction des règles existantes (PAT 4 semaines, MAT 16, etc.) via
-- seed de la table conges_regles.
--
-- IDEMPOTENTE : IF NOT EXISTS, CREATE OR REPLACE, ON CONFLICT DO NOTHING.
-- ============================================================

-- ─── 1. Documentation des types sur demandes_conges.type_conge ───────
COMMENT ON COLUMN public.demandes_conges.type_conge IS
  'Types WRA 2019 : AL (S.45 22j/an), SL (S.46 15j/an), VL (S.47 30j/5ans workers), FML (S.47A 10j/an déductible), SPC_MARIAGE_SELF (S.48 6j), SPC_MARIAGE_ENFANT (S.48 3j), SPC_DECES (S.48 3j), JUR (S.49), INT (S.50), CRT (S.51), MAT (S.52 16 sem), PAT (S.53 4 sem), UL / SANS_SOLDE (pratique interne), COM (récupération heures sup).';

-- ─── 2. Table conges_regles : règles par type + société (override) ──
CREATE TABLE IF NOT EXISTS public.conges_regles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES public.societes(id) ON DELETE CASCADE,
  type_conge TEXT NOT NULL,
  jours_par_cycle NUMERIC,
  unite_cycle TEXT DEFAULT '12 months',
  anciennete_min_mois INTEGER DEFAULT 0,
  basic_salary_max NUMERIC,
  exclu_migrant BOOLEAN DEFAULT FALSE,
  paye BOOLEAN DEFAULT TRUE,
  deductible_de TEXT[],
  reference_wra TEXT,
  description TEXT,
  requiert_certificat_medical BOOLEAN DEFAULT FALSE,
  requiert_acte_naissance BOOLEAN DEFAULT FALSE,
  requiert_acte_deces BOOLEAN DEFAULT FALSE,
  requiert_convocation BOOLEAN DEFAULT FALSE,
  actif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- UNIQUE avec COALESCE pour gérer societe_id NULL (règle globale).
-- Postgres ne traite pas NULL comme égal à NULL dans les contraintes UNIQUE
-- standard, donc on utilise un index unique partiel.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conges_regles_global
  ON public.conges_regles (type_conge) WHERE societe_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_conges_regles_societe
  ON public.conges_regles (societe_id, type_conge) WHERE societe_id IS NOT NULL;

COMMENT ON TABLE public.conges_regles IS
  'G4 — Règles par type de congé WRA 2019. societe_id NULL = règle globale Maurice (seed de base). Si une société veut override, INSERT avec societe_id rempli. get_conge_regle(societe_id, type) retourne la règle effective.';

-- ─── 3. Seed des règles globales (societe_id = NULL) ─────────────────
INSERT INTO public.conges_regles (societe_id, type_conge, jours_par_cycle, unite_cycle,
  anciennete_min_mois, basic_salary_max, exclu_migrant, paye, deductible_de,
  reference_wra, description, requiert_certificat_medical,
  requiert_acte_naissance, requiert_acte_deces, requiert_convocation)
VALUES
  (NULL, 'AL', 22, '12 months', 12, NULL, FALSE, TRUE, NULL, 'S.45',
    'Annual Leave : 22 jours ouvrables apres 12 mois de service continu. Accrual 1j/mois M7-M12 (max 6). Solde non pris = paiement compensatoire obligatoire en fin de cycle.',
    FALSE, FALSE, FALSE, FALSE),
  (NULL, 'SL', 15, '12 months', 6, NULL, FALSE, TRUE, NULL, 'S.46',
    'Sick Leave : 15 jours/an apres 12 mois. Accrual 1j/mois M7-M12 (max 6). Certificat medical si >= 3 jours consecutifs.',
    TRUE, FALSE, FALSE, FALSE),
  (NULL, 'VL', 30, '5 years', 60, 50000, TRUE, TRUE, NULL, 'S.47',
    'Vacation Leave : 30 jours par cycle de 5 ans. Workers uniquement (basic <= 50 000 MUR/mois). Migrant workers exclus.',
    FALSE, FALSE, FALSE, FALSE),
  (NULL, 'FML', 10, '12 months', 12, 50000, FALSE, TRUE, ARRAY['AL','SL','VL'], 'S.47A',
    'Family Medical Leave : 10 jours/an pour s''occuper d''un parent/enfant/grand-parent malade. Workers uniquement. Deductible au choix de AL, SL ou VL.',
    TRUE, TRUE, FALSE, FALSE),
  (NULL, 'SPC_MARIAGE_SELF', 6, 'lifetime', 12, NULL, FALSE, TRUE, NULL, 'S.48',
    'Special Leave — Premier mariage du salarie : 6 jours ouvrables. Une seule fois dans la carriere.',
    FALSE, FALSE, FALSE, TRUE),
  (NULL, 'SPC_MARIAGE_ENFANT', 3, 'per event', 12, NULL, FALSE, TRUE, NULL, 'S.48',
    'Special Leave — Premier mariage d''un enfant : 3 jours ouvrables.',
    FALSE, TRUE, FALSE, TRUE),
  (NULL, 'SPC_DECES', 3, 'per event', 12, NULL, FALSE, TRUE, NULL, 'S.48',
    'Special Leave — Deces conjoint/enfant/parent/frere/soeur : 3 jours ouvrables.',
    FALSE, FALSE, TRUE, FALSE),
  (NULL, 'JUR', NULL, 'per event', 0, NULL, FALSE, TRUE, NULL, 'S.49',
    'Juror Leave : duree du service jure (Courts Act 1945). Tous salaries, paye integralement.',
    FALSE, FALSE, FALSE, TRUE),
  (NULL, 'INT', NULL, 'per event', 0, NULL, FALSE, TRUE, NULL, 'S.50',
    'International Sport/Cultural Events : duree de l''evenement. Tous salaries, paye. Documentation officielle requise.',
    FALSE, FALSE, FALSE, TRUE),
  (NULL, 'CRT', NULL, 'per event', 0, NULL, FALSE, TRUE, NULL, 'S.51',
    'Court Leave : temps necessaire pour convocation judiciaire officielle. Tous salaries, paye.',
    FALSE, FALSE, FALSE, TRUE),
  (NULL, 'MAT', 112, 'per event', 12, NULL, FALSE, TRUE, NULL, 'S.52',
    'Maternity Leave : 16 semaines (112 jours) apres 12 mois de service. 18 semaines si multiple ou prematuree. Allocation 3 000 MUR a la naissance.',
    TRUE, FALSE, FALSE, FALSE),
  (NULL, 'PAT', 28, 'per event', 12, NULL, FALSE, TRUE, NULL, 'S.53',
    'Paternity Leave : 4 semaines (28 jours) consecutives. Paye si >= 12 mois de service, sinon non paye.',
    FALSE, TRUE, FALSE, FALSE),
  (NULL, 'UL', NULL, 'libre', 0, NULL, FALSE, FALSE, NULL, NULL,
    'Unpaid Leave : conge sans solde, accord employeur requis. Pratique interne, pas dans le WRA.',
    FALSE, FALSE, FALSE, FALSE),
  (NULL, 'SANS_SOLDE', NULL, 'libre', 0, NULL, FALSE, FALSE, NULL, NULL,
    'Alias legacy de UL (retro-compat).',
    FALSE, FALSE, FALSE, FALSE),
  (NULL, 'COM', NULL, 'libre', 0, NULL, FALSE, TRUE, NULL, NULL,
    'Compensatory Leave : recuperation heures supplementaires. Pratique interne, pas dans le WRA.',
    FALSE, FALSE, FALSE, FALSE)
ON CONFLICT (type_conge) WHERE societe_id IS NULL DO NOTHING;

-- ─── 4. Fonction get_conge_regle : override société > globale ────────
CREATE OR REPLACE FUNCTION public.get_conge_regle(
  p_societe_id UUID,
  p_type_conge TEXT
) RETURNS TABLE (
  jours_par_cycle NUMERIC,
  unite_cycle TEXT,
  anciennete_min_mois INTEGER,
  basic_salary_max NUMERIC,
  exclu_migrant BOOLEAN,
  paye BOOLEAN,
  deductible_de TEXT[],
  reference_wra TEXT,
  description TEXT,
  requiert_certificat_medical BOOLEAN,
  requiert_acte_naissance BOOLEAN,
  requiert_acte_deces BOOLEAN,
  requiert_convocation BOOLEAN,
  source TEXT
) LANGUAGE plpgsql STABLE AS $fn$
DECLARE
  v_rec RECORD;
BEGIN
  -- 1. Tenter règle spécifique société
  IF p_societe_id IS NOT NULL THEN
    SELECT * INTO v_rec FROM public.conges_regles cr
    WHERE cr.societe_id = p_societe_id AND cr.type_conge = p_type_conge AND cr.actif = TRUE
    LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT
        v_rec.jours_par_cycle, v_rec.unite_cycle, v_rec.anciennete_min_mois,
        v_rec.basic_salary_max, v_rec.exclu_migrant, v_rec.paye, v_rec.deductible_de,
        v_rec.reference_wra, v_rec.description,
        v_rec.requiert_certificat_medical, v_rec.requiert_acte_naissance,
        v_rec.requiert_acte_deces, v_rec.requiert_convocation,
        'societe'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 2. Fallback règle globale
  SELECT * INTO v_rec FROM public.conges_regles cr
  WHERE cr.societe_id IS NULL AND cr.type_conge = p_type_conge AND cr.actif = TRUE
  LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT
      v_rec.jours_par_cycle, v_rec.unite_cycle, v_rec.anciennete_min_mois,
      v_rec.basic_salary_max, v_rec.exclu_migrant, v_rec.paye, v_rec.deductible_de,
      v_rec.reference_wra, v_rec.description,
      v_rec.requiert_certificat_medical, v_rec.requiert_acte_naissance,
      v_rec.requiert_acte_deces, v_rec.requiert_convocation,
      'global'::TEXT;
  END IF;
END $fn$;

COMMENT ON FUNCTION public.get_conge_regle(UUID, TEXT) IS
  'G4 — Retourne la regle applicable pour un type de conge. Priorite : regle societe > regle globale Maurice.';
