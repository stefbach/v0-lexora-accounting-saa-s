-- 213_bulletins_paie_base_csg_nsf.sql
-- Ajoute la colonne base_csg_nsf à bulletins_paie pour stocker la base
-- de calcul CSG/NSF (= Wage Bill MRA, colonne 4 du fichier PACO).
--
-- DÉFINITION
-- ──────────
-- base_csg_nsf = salaire_base − montant_absence − allowances non-cotisables
--                                                  (transport, petrol, et
--                                                   special_allowance_* le
--                                                   cas échéant — selon
--                                                   nature de l'indemnité)
--
-- Diffère de salaire_brut (= base_csg_nsf + allowances cotisables) et
-- de salaire_base (= contrat sans déduction absence).
--
-- POURQUOI UNE COLONNE DÉDIÉE ?
-- ─────────────────────────────
-- Avant : Lexora calculait la base CSG/NSF à la volée dans le moteur
-- paie (lib/rh/paie.ts) sans la persister. Le générateur PACO MRA aurait
-- dû recalculer cette valeur côté export en re-soustrayant les allowances
-- non-cotisables, ce qui dupliquait la logique et risquait des écarts.
--
-- Maintenant : le moteur paie persiste base_csg_nsf au moment du calcul.
-- Le générateur PACO lit cette valeur directement (col 4 Wage Bill).
--
-- EXEMPLE (CHAVETIAN Stephano mars 2026 OCC, ref. validée MRA)
-- ───────────────────────────────────────────────────────────
--   salaire_base       = 41 805
--   montant_absence    = 0
--   allowances non-csg = 5 200      (special allowance électricité-like)
--   → base_csg_nsf     = 41 805
--   → salaire_brut     = 47 005     (incl. allowance non-csg)
--   PACO col 4  Wage Bill  = 41 805
--   PACO col 13 Emoluments = 47 005
--
-- BACKFILL CONSERVATEUR
-- ─────────────────────
-- Les bulletins SANS special_allowance_* (cas le plus fréquent, ~90% des
-- cas OCC mars-avril 2026) sont remplis avec :
--   base_csg_nsf = salaire_base - montant_absence
--
-- Les bulletins AVEC une special_allowance non-nulle restent à NULL : la
-- nature (cotisable/non-cotisable) varie selon l'allowance et n'est pas
-- discriminable au niveau SQL. Ces bulletins doivent être recalculés via
-- le bouton "Recalculer cette période" (livrable séparé).
--
-- Côté générateur PACO : si base_csg_nsf IS NULL, fallback =
-- salaire_base - montant_absence avec warning dans la réponse API listant
-- les bulletins concernés.

ALTER TABLE public.bulletins_paie
  ADD COLUMN IF NOT EXISTS base_csg_nsf NUMERIC(12,2);

COMMENT ON COLUMN public.bulletins_paie.base_csg_nsf IS
  'Base de calcul CSG/NSF (Wage Bill MRA col 4 PACO). = salaire_base - absences - allowances non-cotisables. Persistée par le moteur paie. NULL = bulletin avec special_allowance ambigu, à recalculer manuellement.';

-- Backfill conservateur : seulement les bulletins sans special_allowance_*.
UPDATE public.bulletins_paie
SET base_csg_nsf = COALESCE(salaire_base, 0) - COALESCE(montant_absence, 0)
WHERE base_csg_nsf IS NULL
  AND COALESCE(special_allowance_1, 0) = 0
  AND COALESCE(special_allowance_2, 0) = 0
  AND COALESCE(special_allowance_3, 0) = 0;

CREATE INDEX IF NOT EXISTS idx_bulletins_paie_base_csg_nsf
  ON public.bulletins_paie(societe_id, periode)
  WHERE base_csg_nsf IS NOT NULL;
