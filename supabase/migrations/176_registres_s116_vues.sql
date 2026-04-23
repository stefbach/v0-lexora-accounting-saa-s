-- ============================================================
-- Migration 176 — Sprint G6
--
-- Vues pour les 5 registres obligatoires Workers' Rights Act S.116.
--   v_registre_hours    : heures travaillées / normales / OT (mensuel)
--   v_registre_salary   : salaire brut / net / déductions (mensuel)
--   v_registre_leave    : soldes et prises AL/SL/VL/FML (cycle)
--   v_registre_overtime : OT tranche 1.5× et 2× (mensuel)
--   v_registre_absence  : absences justifiées / non (annuel)
--
-- Les vues agrègent sur les tables existantes (pointages, bulletins_paie,
-- soldes_conges, demandes_conges, heures_travaillees). Chaque vue est
-- filtrable côté applicatif via (societe_id, annee, mois?).
--
-- IDEMPOTENTE : CREATE OR REPLACE uniquement.
-- ============================================================

-- ─── 1. Hours Register ──────────────────────────────────────────────
-- Seuil OT = 9 h/jour (WRA 2019 S.20 par défaut). 540 min = 9 h.
CREATE OR REPLACE VIEW public.v_registre_hours AS
SELECT
  e.id                                     AS employe_id,
  TRIM(e.prenom || ' ' || e.nom)           AS employe_nom,
  e.societe_id,
  s.nom                                    AS societe_nom,
  EXTRACT(YEAR  FROM p.date_pointage)::int AS annee,
  EXTRACT(MONTH FROM p.date_pointage)::int AS mois,
  COUNT(*) FILTER (WHERE p.statut_jour = 'travaille')         AS jours_travailles,
  ROUND(COALESCE(SUM(p.duree_minutes), 0) / 60.0, 2)           AS heures_totales,
  ROUND(COALESCE(SUM(LEAST(COALESCE(p.duree_minutes, 0), 540)), 0) / 60.0, 2)
                                                               AS heures_normales,
  ROUND(COALESCE(SUM(GREATEST(COALESCE(p.duree_minutes, 0) - 540, 0)), 0) / 60.0, 2)
                                                               AS heures_supplementaires
FROM public.employes e
JOIN public.societes s ON s.id = e.societe_id
JOIN public.pointages p ON p.employe_id = e.id
GROUP BY e.id, e.prenom, e.nom, e.societe_id, s.nom,
         EXTRACT(YEAR  FROM p.date_pointage),
         EXTRACT(MONTH FROM p.date_pointage);

COMMENT ON VIEW public.v_registre_hours IS
  'G6 - WRA S.116 Hours Register. Agrégation mensuelle depuis pointages,
   seuil OT 9h/j (540 min). duree_minutes est maintenu à jour par le
   trigger pointages_sessions (PO1).';

-- ─── 2. Salary Register ─────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_registre_salary AS
SELECT
  e.id                                     AS employe_id,
  TRIM(e.prenom || ' ' || e.nom)           AS employe_nom,
  e.societe_id,
  s.nom                                    AS societe_nom,
  EXTRACT(YEAR  FROM b.periode)::int       AS annee,
  EXTRACT(MONTH FROM b.periode)::int       AS mois,
  b.periode                                AS periode,
  COALESCE(b.salaire_brut, 0)              AS salaire_brut,
  COALESCE(b.csg_salarie, 0)               AS csg_salarie,
  COALESCE(b.nsf_salarie, 0)               AS nsf_salarie,
  COALESCE(b.paye, 0)                      AS paye,
  COALESCE(b.total_deductions, 0)          AS total_deductions,
  COALESCE(b.montant_absence, 0)           AS montant_absence,
  COALESCE(b.heures_sup_montant, 0)        AS heures_sup_montant,
  COALESCE(b.salaire_net, 0)               AS salaire_net,
  b.statut,
  b.date_paiement
FROM public.employes e
JOIN public.societes s ON s.id = e.societe_id
JOIN public.bulletins_paie b ON b.employe_id = e.id;

COMMENT ON VIEW public.v_registre_salary IS
  'G6 - WRA S.116 Salary Register. Brut / net / déductions depuis bulletins_paie.';

-- ─── 3. Leave Register ──────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_registre_leave AS
SELECT
  e.id                                     AS employe_id,
  TRIM(e.prenom || ' ' || e.nom)           AS employe_nom,
  e.societe_id,
  s.nom                                    AS societe_nom,
  EXTRACT(YEAR FROM sc.periode_debut)::int AS annee_cycle,
  sc.periode_debut,
  sc.periode_fin,
  sc.al_droit, sc.al_pris, sc.al_solde,
  COALESCE(sc.al_acquis, 0)                AS al_acquis,
  sc.sl_droit, sc.sl_pris, sc.sl_solde,
  COALESCE(sc.vl_droit, 0)                 AS vl_droit,
  COALESCE(sc.vl_pris, 0)                  AS vl_pris,
  (
    SELECT COALESCE(SUM(dc.nb_jours), 0)
    FROM public.demandes_conges dc
    WHERE dc.employe_id = e.id
      AND dc.statut = 'approuve'
      AND dc.type_conge = 'FML'
      AND dc.date_debut >= sc.periode_debut
      AND dc.date_debut <= sc.periode_fin
  )                                        AS fml_utilises
FROM public.employes e
JOIN public.societes s ON s.id = e.societe_id
JOIN public.soldes_conges sc ON sc.employe_id = e.id;

COMMENT ON VIEW public.v_registre_leave IS
  'G6 - WRA S.116 Leave Register. Soldes et prises par cycle anniversaire
   (AL/SL/VL/FML). fml_utilises compté depuis demandes_conges approuvées
   car FML est déductible et n''a pas de colonne dédiée.';

-- ─── 4. Overtime Register ───────────────────────────────────────────
-- Source : table heures_travaillees (enregistrement journalier avec col
-- `date`). Agrège par mois (YYYY-MM extrait de la date).
CREATE OR REPLACE VIEW public.v_registre_overtime AS
SELECT
  e.id                                     AS employe_id,
  TRIM(e.prenom || ' ' || e.nom)           AS employe_nom,
  e.societe_id,
  s.nom                                    AS societe_nom,
  EXTRACT(YEAR  FROM ht.date)::int         AS annee,
  EXTRACT(MONTH FROM ht.date)::int         AS mois,
  ROUND(COALESCE(SUM(ht.heures_ot_1_5), 0)::numeric, 2) AS ot_tranche_1_heures,
  ROUND(COALESCE(SUM(ht.heures_ot_2),   0)::numeric, 2) AS ot_tranche_2_heures,
  ROUND(COALESCE(SUM(ht.ot15), 0)::numeric, 2)          AS ot_tranche_1_detail,
  ROUND(COALESCE(SUM(ht.ot2),  0)::numeric, 2)          AS ot_tranche_2_detail,
  ROUND(COALESCE(SUM(ht.montant_ot), 0)::numeric, 2)    AS ot_montant_total
FROM public.employes e
JOIN public.societes s ON s.id = e.societe_id
JOIN public.heures_travaillees ht ON ht.employe_id = e.id
GROUP BY e.id, e.prenom, e.nom, e.societe_id, s.nom,
         EXTRACT(YEAR FROM ht.date), EXTRACT(MONTH FROM ht.date);

COMMENT ON VIEW public.v_registre_overtime IS
  'G6 - WRA S.116 Overtime Register. Agrégation mensuelle depuis
   heures_travaillees (rows journalières, col date). Tranches 1.5x / 2x.';

-- ─── 5. Absence Register ────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_registre_absence AS
SELECT
  e.id                                     AS employe_id,
  TRIM(e.prenom || ' ' || e.nom)           AS employe_nom,
  e.societe_id,
  s.nom                                    AS societe_nom,
  EXTRACT(YEAR FROM p.date_pointage)::int  AS annee,
  COUNT(*) FILTER (
    WHERE p.statut_jour IN ('absent', 'absent_justifie')
      AND p.absent_justifie = true
  )                                        AS absences_justifiees,
  COUNT(*) FILTER (
    WHERE p.statut_jour = 'absent'
      AND COALESCE(p.absent_justifie, false) = false
  )                                        AS absences_non_justifiees,
  COUNT(*) FILTER (
    WHERE p.statut_jour IN ('absent', 'absent_justifie')
  )                                        AS absences_totales
FROM public.employes e
JOIN public.societes s ON s.id = e.societe_id
JOIN public.pointages p ON p.employe_id = e.id
WHERE e.date_depart IS NULL
GROUP BY e.id, e.prenom, e.nom, e.societe_id, s.nom,
         EXTRACT(YEAR FROM p.date_pointage);

COMMENT ON VIEW public.v_registre_absence IS
  'G6 - WRA S.116 Absence Register. Justifiées = absent_justifie=true ;
   non justifiées = statut absent sans flag justifié.';
