-- ============================================================
-- Migration 172 : Figer le taux de change sur chaque écriture comptable
-- ============================================================
-- Ajoute taux_change_applique sur ecritures_comptables_v2
-- Permet de figer le taux EUR/USD/etc → MUR utilisé au moment de la création
-- de l'écriture. Au reporting, on recalcule jamais avec le taux du jour :
-- on multiplie debit_mur/credit_mur (déjà en MUR) ou on utilise la colonne
-- pour retrouver le montant d'origine.
--
-- Pendant le rapprochement bancaire, le taux figé sur la transaction
-- (releves_bancaires.transactions_json[*].taux_change_applique) doit être
-- propagé ici via createEcrituresForPayment. Cf. docs/TX_JSON_SCHEMA.md.
-- ============================================================

ALTER TABLE public.ecritures_comptables_v2
  ADD COLUMN IF NOT EXISTS taux_change_applique NUMERIC(12, 6),
  ADD COLUMN IF NOT EXISTS devise_origine TEXT,
  ADD COLUMN IF NOT EXISTS montant_origine NUMERIC(15, 2);

COMMENT ON COLUMN public.ecritures_comptables_v2.taux_change_applique IS
  'Taux de change ORIGINE→MUR figé au moment de la création de l''écriture. '
  'Immutable. Utilisé pour re-dérouler le calcul si besoin. NULL = écriture en MUR natif.';
COMMENT ON COLUMN public.ecritures_comptables_v2.devise_origine IS
  'Devise d''origine de la transaction (EUR, USD, etc.). NULL = MUR natif.';
COMMENT ON COLUMN public.ecritures_comptables_v2.montant_origine IS
  'Montant d''origine dans la devise avant conversion MUR. debit_mur ou credit_mur '
  '= montant_origine × taux_change_applique quand devise_origine != MUR.';

-- Backfill des écritures existantes issues de factures :
-- on peut dériver taux_change_applique depuis factures.taux_change
UPDATE public.ecritures_comptables_v2 e
SET taux_change_applique = f.taux_change,
    devise_origine = f.devise,
    montant_origine = CASE
      WHEN f.devise != 'MUR' AND f.taux_change > 0 THEN
        GREATEST(e.debit_mur, e.credit_mur) / f.taux_change
      ELSE NULL
    END
FROM public.factures f
WHERE e.facture_id = f.id
  AND e.taux_change_applique IS NULL
  AND f.taux_change IS NOT NULL
  AND f.taux_change > 0;

DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.ecritures_comptables_v2
  WHERE taux_change_applique IS NOT NULL;
  RAISE NOTICE 'Migration 172 : % écritures backfillées avec taux_change_applique', v_count;
END $$;
