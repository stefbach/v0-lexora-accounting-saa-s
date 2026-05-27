-- Migration 440 — employes.pointage_exempt
--
-- Contexte : pointage_actif est un toggle au niveau SOCIÉTÉ (table societes).
-- Quand il est ON, le code paie compte les jours ouvrés sans pointage comme
-- absences injustifiées. Ce fonctionnement convient à la grande majorité du
-- personnel, mais pose problème pour les cadres / dirigeants / employés qui
-- ne pointent pas par nature de leur poste (ex. Juliana HAGGOO, dirigeante
-- DDS, salaire 79k MUR, 0 pointage sur tout le mois — l'ancien code la
-- flagait 22 jours d'absence injustifiée).
--
-- AVANT mig 440 : on avait une heuristique "0 pointage du mois = exempt".
-- Inconvénients :
--  - faux négatif : un vrai absent toute la période n'était plus détecté
--  - implicite : la RH ne pouvait pas voir / piloter qui est exempt
--
-- MAINTENANT (mig 440) : flag explicite `pointage_exempt` sur employes.
-- La RH coche la case dans /rh/employes pour les cadres. Le code paie
-- skip directement la boucle d'absences pour eux. Comportement déterministe,
-- visible, auditable.

BEGIN;

ALTER TABLE employes
  ADD COLUMN IF NOT EXISTS pointage_exempt BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN employes.pointage_exempt IS
  'Si true, l''employé est exempt du calcul automatique d''absences via pointage. '
  'Utile pour les cadres / dirigeants qui ne pointent pas. La RH peut toujours '
  'saisir manuellement jours_absence sur le bulletin si besoin.';

-- Index partiel : la majorité des employés ne sont PAS exempt, donc on
-- n'index que les rares (gain mémoire). Sera utilisé par le code paie qui
-- query soit la valeur du flag soit la liste des exempts par société.
CREATE INDEX IF NOT EXISTS employes_pointage_exempt_idx
  ON employes (societe_id)
  WHERE pointage_exempt = true;

-- Backfill : marquer les cadres/dirigeants connus de DDS comme exempt.
-- Critère pragmatique : employés actifs DDS avec salaire >= 50000 MUR
-- (typiquement les dirigeants) ET aucun pointage sur les 3 derniers mois.
-- Conservateur : on évite de marquer par erreur des employés qui pourraient
-- juste avoir oublié de pointer ce trimestre.
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH cadres_sans_pointage AS (
    SELECT e.id
    FROM employes e
    WHERE e.actif = true
      AND e.salaire_base >= 50000
      AND NOT EXISTS (
        SELECT 1 FROM pointages p
        WHERE p.employe_id = e.id
          AND p.heure_entree IS NOT NULL
          AND p.date_pointage >= (CURRENT_DATE - INTERVAL '3 months')
      )
  )
  UPDATE employes
     SET pointage_exempt = true
   WHERE id IN (SELECT id FROM cadres_sans_pointage);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Mig 440 backfill : % cadres marqués pointage_exempt=true', v_count;
END $$;

COMMIT;
