-- ════════════════════════════════════════════════════════════════════════════
-- Migration 434 — Audit log « Solde Tout Compte » édité par l'utilisateur
-- ════════════════════════════════════════════════════════════════════════════
--
-- Contexte
-- --------
-- Lorsqu'un utilisateur RH calcule un solde de tout compte sur /rh/depart, le
-- backend retourne un breakdown automatique (calculer_solde). L'utilisateur
-- peut ensuite ÉDITER les montants et/ou AJOUTER des lignes extra (primes,
-- retenues manuelles) directement dans l'UI. Au confirmer_depart, c'est ce
-- breakdown ÉDITÉ qui doit primer et créer le bulletin.
--
-- Pour garder une traçabilité complète (audit, contestations, contrôles
-- fiscaux MRA), on enregistre dans cette table :
--   • le breakdown auto initial (ce que calculer_solde a retourné)
--   • le breakdown édité final (ce que l'utilisateur a confirmé)
--   • un objet `modifications` (diff calculé côté serveur)
--   • l'ID du bulletin créé, du user qui a édité, et la date
--
-- Idempotente : usage répété de CREATE TABLE IF NOT EXISTS / DROP POLICY IF
-- EXISTS pour permettre les ré-exécutions sans casse.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.stc_edition_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id      uuid NOT NULL,
  societe_id      uuid NOT NULL,
  user_id         uuid,
  date_edition    timestamptz NOT NULL DEFAULT now(),
  breakdown_auto  jsonb,                 -- ce que calculer_solde a retourné
  breakdown_edite jsonb,                 -- ce que l'utilisateur a confirmé
  modifications   jsonb,                 -- diff calculé { field: { auto, edite } }
  bulletin_id     uuid,                  -- bulletin_paie créé (peut être null si erreur)
  edited_by_user  boolean NOT NULL DEFAULT false,
  notes           text
);

-- Index utiles : consultation par employé / société / date
CREATE INDEX IF NOT EXISTS idx_stc_edition_log_employe_id
  ON public.stc_edition_log(employe_id);
CREATE INDEX IF NOT EXISTS idx_stc_edition_log_societe_id
  ON public.stc_edition_log(societe_id);
CREATE INDEX IF NOT EXISTS idx_stc_edition_log_bulletin_id
  ON public.stc_edition_log(bulletin_id);
CREATE INDEX IF NOT EXISTS idx_stc_edition_log_date_edition
  ON public.stc_edition_log(date_edition DESC);

-- ── FK soft (pas de CASCADE pour ne jamais perdre l'historique d'audit) ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'stc_edition_log'
      AND constraint_name = 'stc_edition_log_employe_id_fkey'
  ) THEN
    ALTER TABLE public.stc_edition_log
      ADD CONSTRAINT stc_edition_log_employe_id_fkey
      FOREIGN KEY (employe_id) REFERENCES public.employes(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- silencieux : si la table employes a un schéma différent on garde la table sans FK
  NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'stc_edition_log'
      AND constraint_name = 'stc_edition_log_bulletin_id_fkey'
  ) THEN
    ALTER TABLE public.stc_edition_log
      ADD CONSTRAINT stc_edition_log_bulletin_id_fkey
      FOREIGN KEY (bulletin_id) REFERENCES public.bulletins_paie(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ── RLS — accès basé sur user_has_employe_access(employe_id) (SEC-003) ──
ALTER TABLE public.stc_edition_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stc_edition_log_select ON public.stc_edition_log;
CREATE POLICY stc_edition_log_select
  ON public.stc_edition_log
  FOR SELECT
  USING (public.user_has_employe_access(employe_id));

DROP POLICY IF EXISTS stc_edition_log_insert ON public.stc_edition_log;
CREATE POLICY stc_edition_log_insert
  ON public.stc_edition_log
  FOR INSERT
  WITH CHECK (public.user_has_employe_access(employe_id));

-- Pas d'UPDATE/DELETE policy → ligne d'audit immuable côté client.
-- Le service role bypasse RLS (insertion serveur) — voir route.ts.

COMMENT ON TABLE  public.stc_edition_log         IS 'Audit log : éditions utilisateur du solde de tout compte (STC) avant confirmation. Mig 434.';
COMMENT ON COLUMN public.stc_edition_log.breakdown_auto  IS 'JSON renvoyé par calculer_solde (calcul auto initial).';
COMMENT ON COLUMN public.stc_edition_log.breakdown_edite IS 'JSON envoyé par /rh/depart lors du confirmer_depart (édité utilisateur).';
COMMENT ON COLUMN public.stc_edition_log.modifications  IS 'Diff calculé serveur { champ: { auto: x, edite: y } }.';
COMMENT ON COLUMN public.stc_edition_log.edited_by_user IS 'true ssi l''utilisateur a modifié au moins un champ ou ajouté une ligne extra.';
