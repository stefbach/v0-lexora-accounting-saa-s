-- ============================================================
-- Migration 151 — Correction du mapping sémantique statut contrats
--
-- CONTEXTE :
--   La migration 150 a converti `signe_employe` (legacy : signé par
--   l'employé) → `signe_employeur` (nouveau : signé par l'employeur).
--   C'est un mapping technique mais SÉMANTIQUEMENT OPPOSÉ : les deux
--   états désignent la partie inverse.
--
-- DÉCISION :
--   Dans l'ancien flow, `signe_employe` était le DERNIER état avant
--   `signe` (les deux parties ont signé) — donc le contrat était en
--   réalité presque terminé. Pour préserver cette sémantique si des
--   données historiques arrivent (import, rollback, etc.), on mappe
--   vers `signe_complet` plutôt que vers l'état intermédiaire
--   `signe_employeur`.
--
-- IMPACT :
--   Aucune ligne en prod actuellement ne contient `signe_employe`
--   (150 les a toutes converties en `signe_employeur`, et de toute
--   façon il n'y avait que 1 contrat en `brouillon`). Cette migration
--   est donc une correction DÉFENSIVE pour les scénarios d'import
--   futurs — elle est idempotente et 0-row-impact en l'état.
--
-- Idempotent par nature (UPDATE WHERE statut = 'signe_employe').
-- Le CHECK constraint interdit déjà `signe_employe` → toute ligne
-- qui aurait ce statut serait injectée hors contrainte.
-- ============================================================

UPDATE public.contrats_employes
SET statut = 'signe_complet'
WHERE statut = 'signe_employe';
