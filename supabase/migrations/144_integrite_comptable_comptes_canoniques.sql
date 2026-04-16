-- ============================================================================
-- Migration 144 : intégrité comptable — mapping vers PCM canonique + vues
-- ============================================================================
-- Objectif : remettre en conformité les écritures comptables avec le Plan
-- Comptable Mauricien (PCM) canonique défini en migration 018.
--
-- Le module RH paie écrivait historiquement des codes à 6 chiffres fantaisistes
-- (421000, 431000, 432100, 641100, 645300…) qui ne correspondent pas au PCM
-- canonique à 4 chiffres (4210, 4311, 4323, 6411, 6454…).
--
-- Conséquence : balance par compte peuplée de comptes dupliqués avec libellés
-- incohérents, totaux dispersés entre plusieurs sous-comptes, et pire :
-- certains codes « fantaisistes » sont tombés par hasard sur des sous-comptes
-- PCM avec une sémantique DIFFÉRENTE (ex: 432100 PRGF vs PCM 4321 CSG pat).
--
-- Cette migration fait un REMAP EXPLICITE des anciens codes vers le PCM, puis
-- ajoute les vues de diagnostic. Idempotente, rejouable sans effet de bord.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Table de mapping legacy → PCM canonique
-- ────────────────────────────────────────────────────────────────────────────
-- Source : confrontation du code `app/api/rh/import-paie/route.ts` (codes
-- écrits historiquement) vs `supabase/migrations/018_plan_comptable_paie.sql`
-- (PCM officiel). Corrige au passage l'inversion PRGF ↔ Training Levy sur
-- les côtés charge (645300/645400) et dette (432000/432100).
CREATE TABLE IF NOT EXISTS compte_remap_pcm (
  legacy_code TEXT PRIMARY KEY,
  pcm_code    TEXT NOT NULL,
  libelle     TEXT NOT NULL,
  note        TEXT
);

-- Remap complet (6-digit legacy → 4-digit PCM)
INSERT INTO compte_remap_pcm (legacy_code, pcm_code, libelle, note) VALUES
  -- Classe 6 : charges de personnel
  ('641100', '6411', 'Salaires et appointements bruts',       'Base paie'),
  ('641200', '6414', 'Heures supplémentaires',                 'Anciennement 641200'),
  ('641300', '6415', 'Primes et gratifications',               'Anciennement 641300 (allowances)'),
  ('641700', '6417', '13e mois EOY Bonus (25%)',               'Dept indemnité'),
  ('641900', '6419', 'Autres rémunérations (absences, etc.)',  'Retenues absences'),
  ('645100', '6451', 'CSG patronale',                          NULL),
  ('645200', '6452', 'NSF patronal',                           NULL),
  -- Inversion historique corrigée :
  ('645300', '6454', 'Training Levy HRDC (1%)',                'BUG PREEX: était PRGF dans paie'),
  ('645400', '6453', 'PRGF (Portable Retirement Gratuity)',    'BUG PREEX: était Levy dans paie'),
  -- Classe 4 : dettes
  ('421000', '4210', 'Salaires nets à payer',                  NULL),
  ('431000', '4311', 'CSG salarié à verser',                   'Agrégat sal+pat → remap sur CSG sal (compte principal)'),
  ('431100', '4312', 'NSF salarié à verser',                   NULL),
  ('432000', '4324', 'Training Levy HRDC à verser',            'Dette Training Levy'),
  ('432100', '4323', 'PRGF à verser',                          'Dette PRGF'),
  ('444000', '4330', 'PAYE à reverser à la MRA',               NULL)
ON CONFLICT (legacy_code) DO UPDATE
  SET pcm_code = EXCLUDED.pcm_code,
      libelle  = EXCLUDED.libelle,
      note     = EXCLUDED.note;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Fonction de remap (idempotente)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION remap_compte_pcm(p_compte TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_mapped TEXT;
BEGIN
  IF p_compte IS NULL OR TRIM(p_compte) = '' THEN RETURN p_compte; END IF;
  SELECT pcm_code INTO v_mapped FROM compte_remap_pcm WHERE legacy_code = TRIM(p_compte);
  IF v_mapped IS NOT NULL THEN RETURN v_mapped; END IF;
  -- Pas de mapping explicite → on laisse tel quel (ne corrompt pas les codes
  -- déjà corrects comme 401, 411, 512, 6411, 4457…)
  RETURN TRIM(p_compte);
END;
$$;

COMMENT ON FUNCTION remap_compte_pcm(TEXT) IS
  'Remap un numéro de compte legacy (ex 421000) vers son équivalent PCM '
  'canonique (4210). Renvoie le code tel quel si aucun mapping n''existe.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Backfill : corriger les écritures existantes
-- ────────────────────────────────────────────────────────────────────────────
-- On n'écrit que les lignes réellement impactées (économe, rejouable).
UPDATE ecritures_comptables_v2
SET numero_compte = remap_compte_pcm(numero_compte)
WHERE numero_compte IS NOT NULL
  AND numero_compte IN (SELECT legacy_code FROM compte_remap_pcm);

-- Idem sur plan_comptable_client si la table existe
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'plan_comptable_client'
  ) THEN
    EXECUTE $sql$
      UPDATE plan_comptable_client
      SET numero_compte = remap_compte_pcm(numero_compte)
      WHERE numero_compte IN (SELECT legacy_code FROM compte_remap_pcm)
    $sql$;
  END IF;
END $$;

-- Idem sur ecritures_comptables (vue ou table legacy v1) si encore présente
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ecritures_comptables'
      AND table_type = 'BASE TABLE'
  ) THEN
    EXECUTE $sql$
      UPDATE ecritures_comptables
      SET compte = remap_compte_pcm(compte)
      WHERE compte IN (SELECT legacy_code FROM compte_remap_pcm)
    $sql$;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Trigger BEFORE INSERT/UPDATE — remap automatique des nouvelles écritures
-- ────────────────────────────────────────────────────────────────────────────
-- Filet de sécurité : si du code legacy écrit encore un ancien code, on le
-- remappe à l'insertion. Cela évite toute régression future sans bloquer
-- les comptes valides (qui passent par le chemin « retourne tel quel »).
CREATE OR REPLACE FUNCTION trg_remap_compte_pcm()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.numero_compte := remap_compte_pcm(NEW.numero_compte);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_ecritures_canonicalize_compte ON ecritures_comptables_v2;
DROP TRIGGER IF EXISTS tr_ecritures_remap_pcm ON ecritures_comptables_v2;
CREATE TRIGGER tr_ecritures_remap_pcm
  BEFORE INSERT OR UPDATE OF numero_compte ON ecritures_comptables_v2
  FOR EACH ROW
  EXECUTE FUNCTION trg_remap_compte_pcm();

-- Nettoyage de l'ancienne fonction canonicalize_compte (remplacée)
DROP FUNCTION IF EXISTS canonicalize_compte(TEXT);
DROP FUNCTION IF EXISTS trg_canonicalize_numero_compte() CASCADE;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Vue v_ecritures_desequilibre — surfacer les folios non équilibrés
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_ecritures_desequilibre AS
SELECT
  societe_id,
  ref_folio,
  COUNT(*)                                                   AS nb_lignes,
  SUM(COALESCE(debit_mur, 0))                                AS total_debit,
  SUM(COALESCE(credit_mur, 0))                               AS total_credit,
  SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0)) AS ecart,
  MIN(date_ecriture)                                         AS date_debut,
  MAX(date_ecriture)                                         AS date_fin
FROM ecritures_comptables_v2
WHERE ref_folio IS NOT NULL
GROUP BY societe_id, ref_folio
HAVING ABS(SUM(COALESCE(debit_mur, 0)) - SUM(COALESCE(credit_mur, 0))) > 0.01;

COMMENT ON VIEW v_ecritures_desequilibre IS
  'Folios dont les débits ne matchent pas les crédits (écart > 0,01 MUR). '
  'Détecte les écritures orphelines après déplacement/suppression de facture.';

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Vue v_ecritures_sans_ref_folio — écritures legacy sans ref_folio
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_ecritures_sans_ref_folio AS
SELECT
  societe_id,
  journal,
  COUNT(*)                         AS nb_lignes,
  SUM(COALESCE(debit_mur, 0))      AS total_debit,
  SUM(COALESCE(credit_mur, 0))     AS total_credit,
  MIN(date_ecriture)               AS date_debut,
  MAX(date_ecriture)               AS date_fin
FROM ecritures_comptables_v2
WHERE ref_folio IS NULL
GROUP BY societe_id, journal;

COMMENT ON VIEW v_ecritures_sans_ref_folio IS
  'Écritures sans ref_folio (legacy). Échappent au reset classique basé sur ref_folio.';
