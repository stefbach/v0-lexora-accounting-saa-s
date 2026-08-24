-- 495 — Nettoyage des comptes doublons/legacy du plan comptable
--
-- Contexte : le plan_comptable (global, societe_id NULL) contient une poignée de
-- comptes DOUBLONS issus d'anciennes générations (codes 6 chiffres « 641100 »,
-- variantes TVA) qui coexistent avec leur jumeau canonique IFRS (code 4 chiffres
-- lié à comptes_ifrs via code_interne_ifrs). Ils polluent l'affichage du plan et
-- donnent l'impression « rien n'a changé » alors que le vrai plan mauricien/IFRS
-- est bien en place.
--
-- Sécurité — vérifié avant écriture (aucun DELETE, réversible) :
--   * les 10 comptes ci-dessous ont 0 écriture (ecritures_comptables + _v2) ;
--   * aucune règle classification_rules ne route vers eux (compte_debit/credit) ;
--   * chacun a un jumeau canonique CONSERVÉ (actif) indiqué en regard.
-- On DÉSACTIVE (actif=false) plutôt que supprimer : réversible d'un UPDATE, et
-- ne casse rien qui référencerait encore le numéro. La route client filtre
-- désormais actif=true (cf. app/api/client/plan-comptable/route.ts).

UPDATE public.plan_comptable
SET actif = false
WHERE societe_id IS NULL
  AND actif IS DISTINCT FROM false
  AND compte IN (
    -- code legacy      -- jumeau canonique conservé
    '512200',           -- Banque EUR            → 5122 (IFRS TRE-BANQUE-EUR)
    '512300',           -- Banque USD            → 5123 (IFRS TRE-BANQUE-USD)
    '641100',           -- Salaires bruts        → 6411 (IFRS CHG-SALAIRES-BRUTS)
    '641200',           -- Primes                → 6415 (Primes et gratifications)
    '641300',           -- 13ème mois            → 6416 (13e mois — EOY Bonus)
    '645100',           -- Cotisations CSG patr. → 6451 (IFRS CHG-CSG-PATRONALE)
    '645200',           -- Cotisations NSF patr. → 6452 (IFRS CHG-NSF-PATRONAL)
    '4451',             -- TVA à décaisser       → 4455 (IFRS TVA-A-DECAISSER)
    '4453',             -- TVA collectée (output)→ 4457 (IFRS TVA-COLLECTEE)
    '707'               -- Ventes de marchandises→ 701  (IFRS PROD-VENTES-MARCHANDISES)
  );
