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
-- BACKFILL
-- ────────
-- Pas de backfill automatique : les allowances non-cotisables ne sont pas
-- discriminables à 100 % au niveau SQL (special_allowance_* peut être
-- cotisable ou non selon la nature). Les bulletins existants ont
-- base_csg_nsf = NULL et seront recalculés via le bouton "Recalculer
-- cette période" (lib/rh/paie.ts) au prochain run.
--
-- Côté générateur PACO : si base_csg_nsf IS NULL, fallback = salaire_base
-- avec un warning explicite dans la réponse API (l'utilisateur doit
-- recalculer la paie avant de générer un PACO de production).

ALTER TABLE public.bulletins_paie
  ADD COLUMN IF NOT EXISTS base_csg_nsf NUMERIC(12,2);

COMMENT ON COLUMN public.bulletins_paie.base_csg_nsf IS
  'Base de calcul CSG/NSF (Wage Bill MRA col 4 PACO). = salaire_base - absences - allowances non-cotisables. Persistée par le moteur paie. NULL = bulletin pas encore recalculé après mig 213.';

CREATE INDEX IF NOT EXISTS idx_bulletins_paie_base_csg_nsf
  ON public.bulletins_paie(societe_id, periode)
  WHERE base_csg_nsf IS NOT NULL;
