-- ============================================================================
-- 280 — Correctif 279 : accès défensif aux colonnes optionnelles
-- ============================================================================
--
-- La migration 279 référençait directement `societes.bank_name`,
-- `bank_account_number`, `iban`, `numero_tva_mra`, `capital_social`,
-- `registered_office` — colonnes ajoutées par des migrations ultérieures
-- (106, 024) potentiellement non appliquées sur certains environnements.
--
-- Solution : passer par `to_jsonb(dds.*)->>'col'` qui retourne NULL au lieu
-- d'échouer si la colonne n'existe pas.
-- ============================================================================

BEGIN;

INSERT INTO public.lexora_settings (id, raison_sociale)
VALUES (1, 'Digital Data Solutions Ltd')
ON CONFLICT (id) DO NOTHING;

WITH dds AS (
  SELECT to_jsonb(s.*) AS j
    FROM public.societes s
   WHERE s.id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'::uuid
   LIMIT 1
), dds_dossier AS (
  SELECT id AS dossier_id
    FROM public.dossiers
   WHERE societe_id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'::uuid
   ORDER BY created_at ASC NULLS LAST
   LIMIT 1
)
UPDATE public.lexora_settings ls
   SET
     raison_sociale = COALESCE(ls.raison_sociale, dds.j->>'nom', 'Digital Data Solutions Ltd'),
     brn            = COALESCE(ls.brn,            dds.j->>'brn'),
     vat_number     = COALESCE(ls.vat_number,     dds.j->>'numero_tva_mra'),
     capital_mur    = COALESCE(ls.capital_mur,    NULLIF(dds.j->>'capital_social','')::numeric),
     adresse        = COALESCE(ls.adresse,        dds.j->>'adresse', dds.j->>'registered_office'),
     ville          = COALESCE(ls.ville,          dds.j->>'ville', 'Port-Louis'),
     pays           = COALESCE(ls.pays,           dds.j->>'pays', 'Mauritius'),
     telephone      = COALESCE(ls.telephone,      dds.j->>'telephone'),
     email          = COALESCE(ls.email,          dds.j->>'email'),
     banque_nom     = COALESCE(ls.banque_nom,     dds.j->>'bank_name'),
     iban           = COALESCE(ls.iban,           dds.j->>'iban'),
     numero_compte  = COALESCE(ls.numero_compte,  dds.j->>'bank_account_number'),
     societe_id     = COALESCE(ls.societe_id,     '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'::uuid),
     dossier_id     = COALESCE(ls.dossier_id,     (SELECT dossier_id FROM dds_dossier)),
     updated_at     = NOW()
  FROM dds
 WHERE ls.id = 1;

COMMIT;

NOTIFY pgrst, 'reload schema';
