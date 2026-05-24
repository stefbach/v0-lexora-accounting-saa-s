-- Mig 411 — Étend factures_statut_check pour autoriser TOUS les statuts
-- utilisés par le code applicatif.
--
-- Problème observé : la sauvegarde d'une facture en brouillon échoue
-- en prod avec
--   new row for relation "factures" violates check constraint
--   "factures_statut_check"
--
-- Origine : mig 241 (factures récurrentes) puis le consolidated 237→248
-- ont reposé la contrainte avec uniquement
--   ('en_attente', 'partiel', 'paye', 'retard', 'annule', 'modele')
-- — oubliant 'brouillon' (statut historique pour les factures non
-- finalisées), 'devis' (mig 042 type_document=devis force statut='devis')
-- et 'converti' (devis validé → facture).
--
-- Le code app utilise ces 9 statuts : brouillon, en_attente, partiel,
-- paye, retard, annule, modele, devis, converti.
--
-- Cette migration aligne la contrainte sur l'usage applicatif réel.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'factures'
      AND constraint_name = 'factures_statut_check'
  ) THEN
    ALTER TABLE public.factures DROP CONSTRAINT factures_statut_check;
  END IF;

  ALTER TABLE public.factures
    ADD CONSTRAINT factures_statut_check
    CHECK (statut IN (
      'brouillon',
      'en_attente',
      'partiel',
      'paye',
      'retard',
      'annule',
      'modele',
      'devis',
      'converti'
    ));

  RAISE NOTICE 'Mig 411 : factures_statut_check étendue à 9 statuts (brouillon, devis, converti ajoutés)';
END $$;
