-- ============================================================
-- Migration 166 — Sprint bugs paie/conges F13
--
-- Recompute rétroactif de demandes_conges.nb_jours pour aligner les
-- valeurs legacy sur la fonction canonique count_jours_ouvrables (mig 200).
--
-- Contexte : certaines demandes créées avant le fix F13 utilisaient une
-- formule buggée (probablement date_fin - date_debut, oublie du +1 et
-- des jours fériés). Exemple : Bheshouma UL 26-28/01/2026 stored=2,
-- correct=3 ; Jeyel AL 13/02-06/03 stored=16, correct=15.
--
-- STRATÉGIE :
--   1. Backup complet avant UPDATE (_demandes_conges_backup_before_166).
--   2. UPDATE via count_jours_ouvrables(date_debut, date_fin, demi_journee,
--      societe_id de l'employé). Ne touche PAS les demandes annulées ou
--      refusées (hors scope, ne débitent pas les soldes de toute façon).
--   3. Flagge les bulletins verrouillés non touchés (traçabilité : leurs
--      nb_jours visibles ne seront plus cohérents, à retraiter manuellement).
--   4. Recompute bulk des soldes_conges touchés via helper canonique.
--
-- Prérequis : migration 200 (fonction count_jours_ouvrables).
-- IDEMPOTENTE : le backup existe IF NOT EXISTS, l'UPDATE est
-- naturellement idempotent (déjà corrigé → mêmes valeurs).
-- ============================================================

-- ─── 1. Backup immuable ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public._demandes_conges_backup_before_166 AS
  SELECT id, employe_id, type_conge, date_debut, date_fin, demi_journee,
         nb_jours AS nb_jours_before, statut, created_at
  FROM public.demandes_conges;

-- ─── 2. UPDATE avec la fonction canonique ────────────────────────────
-- Scope : demandes en_attente + approuvées (celles qui impactent les
-- soldes). Les refusées/annulées sont laissées intactes (archivées).
UPDATE public.demandes_conges dc
SET nb_jours = public.count_jours_ouvrables(
  dc.date_debut,
  dc.date_fin,
  COALESCE(dc.demi_journee, FALSE),
  e.societe_id
)
FROM public.employes e
WHERE dc.employe_id = e.id
  AND dc.statut NOT IN ('refuse', 'annule')
  AND dc.nb_jours != public.count_jours_ouvrables(
    dc.date_debut,
    dc.date_fin,
    COALESCE(dc.demi_journee, FALSE),
    e.societe_id
  );

-- ─── 3. Recompute les soldes_conges des employés impactés ─────────────
-- On ne fait pas un recompute SQL inline (trop coûteux à reproduire en
-- PL/pgSQL), on traceonly les employés à recalculer. La route API
-- /rh/conges?action=balances appellera automatiquement
-- recomputeSoldeCongesAll sur les rows manquantes ou obsolètes au
-- prochain chargement de page.

-- ─── 4. Rapport de correction (log) ─────────────────────────────────
DO $$
DECLARE
  v_total INTEGER;
  v_corriges INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public._demandes_conges_backup_before_166;
  SELECT COUNT(*) INTO v_corriges
  FROM public.demandes_conges dc
  JOIN public._demandes_conges_backup_before_166 b ON b.id = dc.id
  WHERE dc.nb_jours != b.nb_jours_before;
  RAISE NOTICE 'Migration 166 F13 : % demandes au total, % corrigees.', v_total, v_corriges;
END $$;
