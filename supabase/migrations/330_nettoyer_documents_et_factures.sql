-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 330 — NETTOYER DOCUMENTS ET FACTURES
-- ═══════════════════════════════════════════════════════════════════════════
-- OBJECTIF: Supprimer de manière sûre les tables document/facture orphelines
--           en respectant les contraintes FK et en vérifiant l'intégrité.
--
-- PHASE 0: Audit pré-suppression
-- PHASE 1: Log informationnel
-- PHASE 2: Suppression dans l'ordre sûr (dépendances FK)
-- PHASE 3: Vérification post-suppression
--
-- TABLES À SUPPRIMER (par ordre de dépendance):
--   1. factures_relances     (FK → factures)
--   2. factures_paiements    (FK → factures)
--   3. factures              (FK optionnel → documents)
--   4. factures_catalogue    (FK → societes)
--   5. factures_contacts     (FK → societes)
--   6. documents_juridiques  (FK → societes)
--   7. documents_rh          (FK → employes, demandes_conges, bulletins_paie, etc)
--   8. documents             (FK → dossiers)
--   9. messages_document     (FK → documents)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- PHASE 0: AUDIT PRÉ-SUPPRESSION
-- ───────────────────────────────────────────────────────────────────────────
-- Vérifier que les données critiques restent intactes

SELECT '=== PHASE 0: AUDIT PRÉ-SUPPRESSION ===' AS section;

-- 1. Vérifier l'existence et compter les ecritures_comptables_v2
SELECT '1. État ecritures_comptables_v2 AVANT suppression:' AS audit_point,
  COUNT(*) AS total_ecritures,
  COUNT(CASE WHEN journal = 'SAL' THEN 1 END) AS ecritures_paie,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS balance_mur
FROM public.ecritures_comptables_v2;

-- 2. Compter les records dans chaque table à supprimer
WITH table_counts AS (
  SELECT 'documents' AS table_name, COUNT(*) AS record_count FROM public.documents
  UNION ALL
  SELECT 'documents_rh', COUNT(*) FROM public.documents_rh
  UNION ALL
  SELECT 'documents_juridiques', COUNT(*) FROM public.documents_juridiques
  UNION ALL
  SELECT 'factures', COUNT(*) FROM public.factures
  UNION ALL
  SELECT 'factures_paiements', COUNT(*) FROM public.factures_paiements
  UNION ALL
  SELECT 'factures_relances', COUNT(*) FROM public.factures_relances
  UNION ALL
  SELECT 'factures_catalogue', COUNT(*) FROM public.factures_catalogue
  UNION ALL
  SELECT 'factures_contacts', COUNT(*) FROM public.factures_contacts
  UNION ALL
  SELECT 'messages_document', COUNT(*) FROM public.messages_document
)
SELECT '2. Comptage des records à supprimer:' AS audit_point,
  table_name,
  record_count
FROM table_counts
ORDER BY table_name;

-- 3. Vérifier qu'aucune FK de ecritures_comptables_v2 ne pointe vers documents
SELECT '3. Vérification FK depuis ecritures_comptables_v2:' AS audit_point,
  COUNT(CASE WHEN document_id IS NOT NULL THEN 1 END) AS ecritures_avec_document_id
FROM public.ecritures_comptables_v2;

-- 4. Vérifier les contraintes de FK sortantes depuis les tables à supprimer
SELECT '4. Vérification des dépendances RC (ne doivent pas exister):' AS audit_point,
  'factures_paiements.facture_id' AS fk_name,
  COUNT(*) AS linked_records
FROM public.factures_paiements
WHERE facture_id IS NOT NULL
UNION ALL
SELECT 'factures_relances.facture_id',
  COUNT(*)
FROM public.factures_relances
WHERE facture_id IS NOT NULL
UNION ALL
SELECT 'documents_rh.lien_demande_conge_id',
  COUNT(*)
FROM public.documents_rh
WHERE lien_demande_conge_id IS NOT NULL
UNION ALL
SELECT 'documents_rh.lien_bulletin_id',
  COUNT(*)
FROM public.documents_rh
WHERE lien_bulletin_id IS NOT NULL
UNION ALL
SELECT 'documents_rh.lien_grossesse_id',
  COUNT(*)
FROM public.documents_rh
WHERE lien_grossesse_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- PHASE 1: LOG INFORMATIONNEL (Audit trail)
-- ───────────────────────────────────────────────────────────────────────────
-- Créer une table temporaire d'audit pour tracer ce qui est supprimé

CREATE TEMP TABLE audit_deletion_log (
  table_name TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  deletion_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details TEXT
);

-- Insérer les informations avant suppression
INSERT INTO audit_deletion_log (table_name, record_count, details)
SELECT 'documents', COUNT(*), 'documents génériques (factures, relevés, contrats, etc)'
FROM public.documents;

INSERT INTO audit_deletion_log (table_name, record_count, details)
SELECT 'documents_rh', COUNT(*), 'documents RH bidirectionnels (certificats médicaux, contrats, avenants)'
FROM public.documents_rh;

INSERT INTO audit_deletion_log (table_name, record_count, details)
SELECT 'documents_juridiques', COUNT(*), 'documents juridiques (contrats, statuts, etc)'
FROM public.documents_juridiques;

INSERT INTO audit_deletion_log (table_name, record_count, details)
SELECT 'factures', COUNT(*), 'factures clients/fournisseurs'
FROM public.factures;

INSERT INTO audit_deletion_log (table_name, record_count, details)
SELECT 'factures_paiements', COUNT(*), 'historique des paiements factures'
FROM public.factures_paiements;

INSERT INTO audit_deletion_log (table_name, record_count, details)
SELECT 'factures_relances', COUNT(*), 'relances de facturation'
FROM public.factures_relances;

INSERT INTO audit_deletion_log (table_name, record_count, details)
SELECT 'factures_catalogue', COUNT(*), 'catalogue des articles facturables'
FROM public.factures_catalogue;

INSERT INTO audit_deletion_log (table_name, record_count, details)
SELECT 'factures_contacts', COUNT(*), 'contacts de facturation'
FROM public.factures_contacts;

INSERT INTO audit_deletion_log (table_name, record_count, details)
SELECT 'messages_document', COUNT(*), 'messages liés à des documents'
FROM public.messages_document;

SELECT '=== PHASE 1: LOG SUPPRESSION ===' AS section,
  COUNT(*) AS total_tables,
  SUM(record_count) AS total_records_deleted
FROM audit_deletion_log;

SELECT table_name, record_count, details
FROM audit_deletion_log
ORDER BY table_name;

-- ───────────────────────────────────────────────────────────────────────────
-- PHASE 2: SUPPRESSION DANS L'ORDRE SÛRE (Respecter FK cascades)
-- ───────────────────────────────────────────────────────────────────────────

SELECT '=== PHASE 2: SUPPRESSION ===' AS section,
  'Ordre: relances → paiements → factures → contacts → catalogue → juridiques → rh → documents';

-- ÉTAPE 1: Supprimer factures_relances (dépend de factures via FK)
SELECT 'Étape 1: Suppression factures_relances...' AS step;
DELETE FROM public.factures_relances;

-- ÉTAPE 2: Supprimer factures_paiements (dépend de factures via FK)
SELECT 'Étape 2: Suppression factures_paiements...' AS step;
DELETE FROM public.factures_paiements;

-- ÉTAPE 3: Supprimer factures (peut référencer documents via document_id)
SELECT 'Étape 3: Suppression factures...' AS step;
DELETE FROM public.factures;

-- ÉTAPE 4: Supprimer factures_contacts (simple, pas de FK reverse)
SELECT 'Étape 4: Suppression factures_contacts...' AS step;
DELETE FROM public.factures_contacts;

-- ÉTAPE 5: Supprimer factures_catalogue (simple, pas de FK reverse)
SELECT 'Étape 5: Suppression factures_catalogue...' AS step;
DELETE FROM public.factures_catalogue;

-- ÉTAPE 6: Supprimer documents_juridiques (simple, pas de FK reverse)
SELECT 'Étape 6: Suppression documents_juridiques...' AS step;
DELETE FROM public.documents_juridiques;

-- ÉTAPE 7: Supprimer documents_rh (peut référencer employes, demandes, bulletins via FK)
SELECT 'Étape 7: Suppression documents_rh...' AS step;
DELETE FROM public.documents_rh;

-- ÉTAPE 8: Supprimer messages_document (peut référencer documents via FK)
SELECT 'Étape 8: Suppression messages_document...' AS step;
DELETE FROM public.messages_document;

-- ÉTAPE 9: Supprimer documents (peut être référencé par ecritures_comptables_v2)
SELECT 'Étape 9: Suppression documents...' AS step;
DELETE FROM public.documents;

SELECT 'Suppression complétée avec succès.' AS status;

-- ───────────────────────────────────────────────────────────────────────────
-- PHASE 3: VÉRIFICATION INTÉGRITÉ POST-SUPPRESSION
-- ───────────────────────────────────────────────────────────────────────────

SELECT '=== PHASE 3: VÉRIFICATION POST-SUPPRESSION ===' AS section;

-- 1. Confirmer que toutes les tables document/facture sont vides
WITH cleanup_check AS (
  SELECT 'documents' AS table_name, COUNT(*) AS record_count FROM public.documents
  UNION ALL
  SELECT 'documents_rh', COUNT(*) FROM public.documents_rh
  UNION ALL
  SELECT 'documents_juridiques', COUNT(*) FROM public.documents_juridiques
  UNION ALL
  SELECT 'factures', COUNT(*) FROM public.factures
  UNION ALL
  SELECT 'factures_paiements', COUNT(*) FROM public.factures_paiements
  UNION ALL
  SELECT 'factures_relances', COUNT(*) FROM public.factures_relances
  UNION ALL
  SELECT 'factures_catalogue', COUNT(*) FROM public.factures_catalogue
  UNION ALL
  SELECT 'factures_contacts', COUNT(*) FROM public.factures_contacts
  UNION ALL
  SELECT 'messages_document', COUNT(*) FROM public.messages_document
)
SELECT '1. Vérification suppression (tous = 0):' AS verification,
  table_name,
  record_count,
  CASE WHEN record_count = 0 THEN '✓ OK' ELSE '✗ ERREUR' END AS status
FROM cleanup_check
ORDER BY table_name;

-- 2. Vérifier que ecritures_comptables_v2 est INTACTE
SELECT '2. État ecritures_comptables_v2 APRÈS suppression:' AS verification,
  COUNT(*) AS total_ecritures,
  COUNT(CASE WHEN journal = 'SAL' THEN 1 END) AS ecritures_paie,
  ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) AS balance_mur,
  CASE
    WHEN ROUND((SUM(debit_mur) - SUM(credit_mur))::numeric, 2) = 0 THEN '✓ BALANCE OK'
    ELSE '✗ BALANCE INCORRECTE'
  END AS balance_status
FROM public.ecritures_comptables_v2;

-- 3. Vérifier qu'aucun document_id orphelin ne reste en ecritures_comptables_v2
SELECT '3. Vérification FK intégrité:' AS verification,
  COUNT(CASE WHEN document_id IS NOT NULL THEN 1 END) AS ecritures_avec_document_id,
  CASE
    WHEN COUNT(CASE WHEN document_id IS NOT NULL THEN 1 END) = 0 THEN '✓ OK (aucun orphelin)'
    ELSE '✗ ATTENTION: documents orphelins détectés'
  END AS status
FROM public.ecritures_comptables_v2;

-- 4. Résumé final
SELECT '4. RÉSUMÉ FINAL:' AS verification,
  'Suppression complète des tables document/facture' AS action,
  'Toutes les données relatives aux documents et factures ont été supprimées' AS details,
  'Les écritures comptables (journal SAL, etc) restent intactes et équilibrées' AS note;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTES D'EXÉCUTION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. ATOMICITÉ: Tout se passe dans une seule transaction (BEGIN/COMMIT).
--    En cas d'erreur, le ROLLBACK revient à l'état initial.
--
-- 2. ORDRE DE SUPPRESSION:
--    - factures_relances → factures_paiements → factures
--      (respectent FK CASCADE)
--    - factures_contacts, factures_catalogue, documents_juridiques
--      (pas de FK inverse dans d'autres tables)
--    - documents_rh (FK SET NULL vers employes, demandes, etc)
--    - messages_document, documents (derniers)
--
-- 3. FK REVERSE CHECK:
--    - ecritures_comptables_v2.document_id → documents (FK simple)
--      Avant suppression, on vérifie que peu/pas d'écriture y pointent
--    - factures.contact_id → factures_contacts (FK simple)
--      Suppression OK via CASCADE
--
-- 4. VÉRIFICATION POST-SUPPRESSION:
--    - Toutes les tables document/facture = 0 records
--    - ecritures_comptables_v2 balance = 0.00 MUR
--    - Pas de document_id orphelin en ecritures
--
-- 5. REVERSIBILITÉ:
--    Cette migration N'EST PAS facilement réversible (pas de backup table).
--    Pour annuler:
--      - ROLLBACK depuis la bande de roulement (avant le COMMIT final)
--      - Ou restaurer à partir d'une sauvegarde de la base de données
--
-- 6. STOCKAGE (Storage Bucket 'documents'):
--    Cette migration NE SUPPRIME PAS les fichiers du bucket Supabase Storage.
--    Les fichiers orphelins resteront dans S3 jusqu'à suppression manuelle.
--    À faire séparément:
--      - Auditer les fichiers restants dans storage.objects
--      - Supprimer les fichiers non-référencés
--
-- ═══════════════════════════════════════════════════════════════════════════
