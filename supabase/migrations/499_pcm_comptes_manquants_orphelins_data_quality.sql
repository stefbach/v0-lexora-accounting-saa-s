-- =====================================================================
-- Migration 499 — Data-quality PCM : comptes manquants (écritures orphelines)
-- =====================================================================
-- Chantier 2 (audit PCM — nettoyage données). Des écritures réelles
-- (ecritures_comptables_v2) référencent des numéros de compte ABSENTS du
-- plan comptable global (`plan_comptable`, template unique societe_id IS NULL).
-- Ces « écritures orphelines » cassent les rollups IFRS, l'export valorisé et
-- le garde-fou postable. On DÉFINIT ici les comptes manquants légitimes —
-- 100 % ADDITIF : aucune écriture n'est modifiée, seuls des comptes de
-- référence sont créés (les écritures existantes se résolvent désormais).
--
-- Comptes orphelins constatés (tous sociétés confondues) et traitement :
--   1101  À-Nouveaux (contrepartie, mig 322)      → défini (RAN / capitaux)
--   1811  Créance interco (société liée)          → défini (famille 18 créée)
--   451   Comptes courants groupe (interco)       → défini (partie liée)
--   4551  CCA associé (apports/avances)           → défini (partie liée)
--   4091  Fournisseurs divers — avances versées   → défini
--   4671  CCA dirigeant (dans 467, à consolider)  → défini (partie liée)
--   5811  Virements internes (transit bancaire)   → défini
--   656   Écart de change réalisé (perte)         → NON défini ici : c'est un
--         MAUVAIS compte (le bon est 666). Reclassement d'écriture = décision
--         comptable, documenté dans docs (voir PR) — on ne crée pas de doublon
--         de 666.
--
-- Le libellé du 6454 (Training Levy HRDC) est corrigé « 1% » → « 1,5% » pour
-- refléter le taux réellement appliqué par le moteur de paie (PARAMS_MRA_DEFAUT
-- training_levy = 0.015, effective 2021-07-01).
-- =====================================================================

BEGIN;

-- NB : `classe` est une colonne GÉNÉRÉE (dérivée du 1er chiffre de `compte`) —
-- ne jamais l'insérer explicitement.

-- ── Famille 18 — Comptes de liaison / inter-sociétés (parties liées) ────────
INSERT INTO public.plan_comptable
  (societe_id, compte, libelle, type_compte, sens_normal, compte_parent,
   niveau, postable, related_party, categorie_ifrs, sous_categorie_ifrs, poste_etat_financier_ifrs)
SELECT * FROM (VALUES
  (NULL::uuid, '18',  'COMPTES DE LIAISON / INTER-SOCIÉTÉS',    'actif', 'D', NULL,   2, false, true,  NULL::varchar,  NULL::varchar,             NULL::varchar),
  (NULL::uuid, '181', 'Comptes de liaison inter-sociétés',     'actif', 'D', '18',   3, false, true,  NULL,           NULL,                      NULL),
  (NULL::uuid, '1811','Créances sur sociétés liées (interco)', 'actif', 'D', '181',  4, true,  true,  'actif_courant','clients_et_autres_creances','SOFP.ActifsCourants.ClientsEtAutresCreances')
) AS v(societe_id, compte, libelle, type_compte, sens_normal, compte_parent,
       niveau, postable, related_party, categorie_ifrs, sous_categorie_ifrs, poste_etat_financier_ifrs)
WHERE NOT EXISTS (SELECT 1 FROM public.plan_comptable p WHERE p.compte = v.compte AND p.societe_id IS NULL);

-- ── 1101 — À-Nouveaux (contrepartie bilan d'ouverture), sous 110 / RAN ──────
INSERT INTO public.plan_comptable
  (societe_id, compte, libelle, type_compte, sens_normal, compte_parent,
   niveau, postable, related_party, categorie_ifrs, sous_categorie_ifrs, poste_etat_financier_ifrs)
SELECT NULL, '1101', 'Report à nouveau — solde d''ouverture (contrepartie À-Nouveaux)',
       'capitaux', 'C', '110', 4, true, false,
       'capitaux_propres', 'resultat_non_distribue', 'SOFP.CapitauxPropres.ResultatsNonDistribues'
WHERE NOT EXISTS (SELECT 1 FROM public.plan_comptable p WHERE p.compte = '1101' AND p.societe_id IS NULL);

-- ── 451 — Comptes courants groupe (trésorerie interco), sous 45 (partie liée)
INSERT INTO public.plan_comptable
  (societe_id, compte, libelle, type_compte, sens_normal, compte_parent,
   niveau, postable, related_party, categorie_ifrs, sous_categorie_ifrs, poste_etat_financier_ifrs)
SELECT NULL, '451', 'Comptes courants — groupe (trésorerie inter-sociétés)',
       'actif', 'D', '45', 3, true, true,
       'actif_courant', 'clients_et_autres_creances', 'SOFP.ActifsCourants.ClientsEtAutresCreances'
WHERE NOT EXISTS (SELECT 1 FROM public.plan_comptable p WHERE p.compte = '451' AND p.societe_id IS NULL);

-- ── 4551 — Compte courant associé (apports/avances), sous 455 (partie liée) ─
INSERT INTO public.plan_comptable
  (societe_id, compte, libelle, type_compte, sens_normal, compte_parent,
   niveau, postable, related_party, categorie_ifrs, sous_categorie_ifrs, poste_etat_financier_ifrs)
SELECT NULL, '4551', 'Compte courant associé — apports et avances',
       'passif', 'C', '455', 4, true, true,
       'passif_courant', 'fournisseurs_et_charges_a_payer', 'SOFP.PassifsCourants.FournisseursEtAutresDettes'
WHERE NOT EXISTS (SELECT 1 FROM public.plan_comptable p WHERE p.compte = '4551' AND p.societe_id IS NULL);

-- ── 4091 — Fournisseurs divers, avances et acomptes versés, sous 409 ────────
INSERT INTO public.plan_comptable
  (societe_id, compte, libelle, type_compte, sens_normal, compte_parent,
   niveau, postable, related_party, categorie_ifrs, sous_categorie_ifrs, poste_etat_financier_ifrs)
SELECT NULL, '4091', 'Fournisseurs divers — avances et acomptes versés',
       'actif', 'D', '409', 4, true, false,
       'actif_courant', 'clients_et_autres_creances', 'SOFP.ActifsCourants.ClientsEtAutresCreances'
WHERE NOT EXISTS (SELECT 1 FROM public.plan_comptable p WHERE p.compte = '4091' AND p.societe_id IS NULL);

-- ── 4671 — CCA dirigeant logé dans 467 (à consolider en 455), partie liée ──
INSERT INTO public.plan_comptable
  (societe_id, compte, libelle, type_compte, sens_normal, compte_parent,
   niveau, postable, related_party, categorie_ifrs, sous_categorie_ifrs, poste_etat_financier_ifrs)
SELECT NULL, '4671', 'Compte courant associé/dirigeant (à reclasser en 455)',
       'passif', 'C', '467', 4, true, true,
       'passif_courant', 'fournisseurs_et_charges_a_payer', 'SOFP.PassifsCourants.FournisseursEtAutresDettes'
WHERE NOT EXISTS (SELECT 1 FROM public.plan_comptable p WHERE p.compte = '4671' AND p.societe_id IS NULL);

-- ── 5811 — Virements internes (transit bancaire), sous 581 ─────────────────
INSERT INTO public.plan_comptable
  (societe_id, compte, libelle, type_compte, sens_normal, compte_parent,
   niveau, postable, related_party, categorie_ifrs, sous_categorie_ifrs, poste_etat_financier_ifrs)
SELECT NULL, '5811', 'Virements internes — comptes bancaires (transit)',
       'actif', 'D', '581', 4, true, false,
       'actif_courant', 'tresorerie_equivalents', 'SOFP.ActifsCourants.TresorerieEtEquivalents'
WHERE NOT EXISTS (SELECT 1 FROM public.plan_comptable p WHERE p.compte = '5811' AND p.societe_id IS NULL);

-- ── Correction libellé 6454 : taux HRDC réel 1,5 % (aligné moteur de paie) ──
UPDATE public.plan_comptable
   SET libelle = 'Training Levy HRDC (1,5%)'
 WHERE compte = '6454' AND societe_id IS NULL AND libelle = 'Training Levy HRDC (1%)';

COMMIT;
