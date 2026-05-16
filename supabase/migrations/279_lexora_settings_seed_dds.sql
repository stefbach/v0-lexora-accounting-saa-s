-- ============================================================================
-- 279 — Auto-population de lexora_settings depuis la fiche société DDS Ltd
-- ============================================================================
--
-- Au lieu de saisir BRN / VAT / IBAN à la main dans /admin/lexora-billing/
-- parametres, on récupère ces infos depuis la fiche société existante de
-- Digital Data Solutions Ltd (id 1826dde7-7b41-4d14-bc75-d8d22dfc75fb).
--
-- Les champs vides dans `societes` resteront NULL dans lexora_settings et
-- pourront être complétés ensuite via l'UI admin. L'opération est idempotente
-- (UPDATE ciblé sur le singleton id=1) et n'écrase pas les champs déjà
-- renseignés manuellement (COALESCE).
-- ============================================================================

BEGIN;

-- 1) S'assure que le singleton existe
INSERT INTO public.lexora_settings (id, raison_sociale)
VALUES (1, 'Digital Data Solutions Ltd')
ON CONFLICT (id) DO NOTHING;

-- 2) Pull depuis la fiche société DDS
WITH dds AS (
  SELECT *
    FROM public.societes
   WHERE id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'::uuid
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
     raison_sociale = COALESCE(ls.raison_sociale, dds.nom, 'Digital Data Solutions Ltd'),
     brn            = COALESCE(ls.brn, dds.brn),
     vat_number     = COALESCE(ls.vat_number, dds.numero_tva_mra),
     capital_mur    = COALESCE(ls.capital_mur, dds.capital_social),
     adresse        = COALESCE(ls.adresse, dds.adresse, dds.registered_office),
     ville          = COALESCE(ls.ville, dds.ville, 'Port-Louis'),
     pays           = COALESCE(ls.pays, dds.pays, 'Mauritius'),
     telephone      = COALESCE(ls.telephone, dds.telephone),
     email          = COALESCE(ls.email, dds.email),
     -- Bancaire
     banque_nom     = COALESCE(ls.banque_nom, dds.bank_name),
     iban           = COALESCE(ls.iban, dds.iban),
     numero_compte  = COALESCE(ls.numero_compte, dds.bank_account_number),
     -- Lien intégration compta
     societe_id     = COALESCE(ls.societe_id, '1826dde7-7b41-4d14-bc75-d8d22dfc75fb'::uuid),
     dossier_id     = COALESCE(ls.dossier_id, (SELECT dossier_id FROM dds_dossier)),
     updated_at     = NOW()
  FROM dds
 WHERE ls.id = 1;

COMMIT;

NOTIFY pgrst, 'reload schema';
