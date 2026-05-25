-- =====================================================================
-- Migration 431 — Fix trigger clôture : OLD.journal_code → OLD.journal
-- =====================================================================
-- BUG : la migration 421 référence OLD.journal_code / NEW.journal_code dans
-- la fonction trigger, mais la colonne réelle de ecritures_comptables_v2
-- est nommée "journal" (cf. mig 007 ligne 28). Résultat en prod :
--   ERROR: record "old" has no field "journal_code"
-- déclenchée à toute tentative de DELETE/UPDATE/INSERT sur une écriture.
--
-- FIX : CREATE OR REPLACE de la fonction avec la bonne colonne (journal).
-- La table cloture_lock_overrides conserve sa colonne journal_code (c'est
-- juste un nom de colonne d'audit, indépendant de la source).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.check_ecriture_in_closed_exercice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_societe_id  UUID;
  v_date        DATE;
  v_journal     TEXT;
  v_ecriture_id UUID;
  v_exercice    TEXT;
  v_is_admin    BOOLEAN;
  v_role        TEXT;
BEGIN
  -- Sélection des valeurs selon le type d'opération
  IF TG_OP = 'DELETE' THEN
    v_societe_id  := OLD.societe_id;
    v_date        := OLD.date_ecriture;
    v_journal     := OLD.journal;    -- FIX 431 : OLD.journal_code → OLD.journal
    v_ecriture_id := OLD.id;
  ELSE
    v_societe_id  := NEW.societe_id;
    v_date        := NEW.date_ecriture;
    v_journal     := NEW.journal;    -- FIX 431 : NEW.journal_code → NEW.journal
    v_ecriture_id := NEW.id;
  END IF;

  -- 1) Bypass : journaux techniques de clôture / à-nouveaux
  IF v_journal IN ('CL', 'AN') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- 2) Date pas dans un exercice clôturé → pass-through
  IF NOT public.is_in_closed_exercice(v_societe_id, v_date) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- 3) Exercice clôturé : override admin ?
  v_is_admin := public._cloture_is_admin_override();
  v_role     := public._cloture_current_role();

  IF v_is_admin THEN
    SELECT ef.annee INTO v_exercice
      FROM public.exercices_fiscaux ef
     WHERE ef.societe_id = v_societe_id
       AND ef.statut     = 'cloture'
       AND v_date BETWEEN ef.date_debut AND ef.date_fin
     LIMIT 1;

    INSERT INTO public.cloture_lock_overrides (
      societe_id, exercice, action, ecriture_id, date_ecriture,
      journal_code, user_id, user_role, payload
    ) VALUES (
      v_societe_id,
      v_exercice,
      TG_OP,
      v_ecriture_id,
      v_date,
      v_journal,   -- on stocke la valeur dans la colonne d'audit journal_code (nom interne audit)
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
      v_role,
      CASE
        WHEN TG_OP = 'DELETE' THEN jsonb_build_object('old', to_jsonb(OLD))
        WHEN TG_OP = 'INSERT' THEN jsonb_build_object('new', to_jsonb(NEW))
        ELSE jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
      END
    );

    RAISE NOTICE
      '[cloture-lock] Override admin (% / %) sur écriture % (journal %, date %, société %)',
      v_role, auth.uid(), v_ecriture_id, v_journal, v_date, v_societe_id;

    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- 4) Rejet non-admin
  RAISE EXCEPTION
    'Écriture rejetée : exercice clôturé (date %, société %, journal %, op %). '
    'Seuls les journaux CL/AN ou un admin Lexora peuvent écrire dans cet exercice.',
    v_date, v_societe_id, v_journal, TG_OP
    USING ERRCODE = 'check_violation',
          HINT    = 'Passer par une écriture de l''exercice ouvert ou contacter un administrateur.';
END;
$$;

DO $$ BEGIN
  RAISE NOTICE '[431] Trigger clôture corrigé : utilise désormais OLD.journal / NEW.journal au lieu de journal_code';
END $$;
