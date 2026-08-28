-- 510_backfill_solde_ouverture_bancaire.sql
--
-- BACKFILL — À-nouveaux du solde d'ouverture bancaire pour les relevés déjà
-- importés avant le correctif (cf. lib/accounting/bank-opening-balance.ts).
--
-- Le solde d'ouverture des relevés bancaires était stocké mais ne générait
-- aucune écriture → le compte de banque du grand-livre/bilan n'affichait que
-- les mouvements, jamais le solde de départ. On enregistre le solde
-- d'ouverture du relevé LE PLUS ANCIEN de chaque compte comme un à-nouveau
-- (journal AN), avec pour contrepartie le report à nouveau 1101.
--
--   solde ≥ 0 (avoir)     D 512xxx / C 1101
--   solde < 0 (découvert) D 1101   / C 512xxx   (valeur absolue)
--
-- Garde-fous (mêmes que le writer applicatif) :
--   • idempotence par ref_folio `ANBQ-<compte_bancaire_id>` ;
--   • anti double-comptage : aucun à-nouveau (onboarding) ne touche déjà le
--     compte de banque.
--
-- Idempotent : une réexécution n'insère rien (les à-nouveaux existent déjà).

WITH earliest AS (
  SELECT DISTINCT ON (r.compte_bancaire_id)
    r.compte_bancaire_id, r.societe_id, r.solde_ouverture, r.date_debut
  FROM releves_bancaires r
  WHERE r.superseded_by_id IS NULL AND r.date_debut IS NOT NULL
  ORDER BY r.compte_bancaire_id, r.date_debut ASC
),
cible AS (
  SELECT e.compte_bancaire_id, e.societe_id,
         round(e.solde_ouverture::numeric, 2) AS solde,
         e.date_debut,
         COALESCE(cb.compte_comptable, '512') AS gl,
         COALESCE(cb.nom_compte, cb.banque, 'Banque') AS nom_banque,
         (SELECT d.id FROM dossiers d WHERE d.societe_id = e.societe_id LIMIT 1) AS dossier_id
  FROM earliest e
  JOIN comptes_bancaires cb ON cb.id = e.compte_bancaire_id
  WHERE COALESCE(e.solde_ouverture, 0) <> 0
    AND NOT EXISTS (SELECT 1 FROM ecritures_comptables_v2 x
       WHERE x.societe_id = e.societe_id AND x.ref_folio = 'ANBQ-' || e.compte_bancaire_id)
    AND NOT EXISTS (SELECT 1 FROM ecritures_comptables_v2 x
       WHERE x.societe_id = e.societe_id AND x.journal = 'AN'
         AND x.numero_compte = COALESCE(cb.compte_comptable, '512'))
),
legs AS (
  SELECT societe_id, dossier_id, date_debut, 'ANBQ-' || compte_bancaire_id AS ref_folio,
         gl AS numero_compte, nom_banque AS nom_compte,
         CASE WHEN solde > 0 THEN abs(solde) ELSE 0 END AS debit_mur,
         CASE WHEN solde > 0 THEN 0 ELSE abs(solde) END AS credit_mur
  FROM cible
  UNION ALL
  SELECT societe_id, dossier_id, date_debut, 'ANBQ-' || compte_bancaire_id AS ref_folio,
         '1101' AS numero_compte, 'Report à nouveau — solde d''ouverture' AS nom_compte,
         CASE WHEN solde > 0 THEN 0 ELSE abs(solde) END AS debit_mur,
         CASE WHEN solde > 0 THEN abs(solde) ELSE 0 END AS credit_mur
  FROM cible
)
INSERT INTO ecritures_comptables_v2
  (societe_id, dossier_id, date_ecriture, journal, ref_folio, numero_compte, nom_compte,
   libelle, description, debit_mur, credit_mur, exercice)
SELECT societe_id, dossier_id, date_debut, 'AN', ref_folio, numero_compte, nom_compte,
       'Solde d''ouverture (à-nouveau) — ' || nom_compte,
       'Solde d''ouverture (à-nouveau) — ' || nom_compte,
       debit_mur, credit_mur, to_char(date_debut, 'YYYY')
FROM legs;
