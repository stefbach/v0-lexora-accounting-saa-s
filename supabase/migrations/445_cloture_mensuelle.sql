-- =============================================================================
-- Migration 445 — Clôture mensuelle comptable
-- =============================================================================
-- CONTEXTE :
--   Le module PCM (sprints 1-4) permet d'éditer le grand livre. Il faut
--   pouvoir geler une période mensuelle pour empêcher toute modification
--   après clôture. La clôture ANNUELLE existe déjà (mig 421-423, basée sur
--   les exercices fiscaux). Ici on ajoute la clôture MENSUELLE.
--
-- DÉCISION : clôture/déclôture autorisées aux rôles comptable + client
--   (utilisateur final de la société). Pas de restriction admin stricte —
--   le contrôle d'accès société (RLS) suffit.
--
-- MÉCANISME :
--   • Table cloture_mensuelle (societe_id, periode 'YYYY-MM-01', statut)
--   • Trigger BEFORE INSERT/UPDATE/DELETE sur ecritures_comptables_v2 qui
--     bloque toute écriture dont date_ecriture tombe dans une période close.
--   • Déclôture = repasser statut à 'ouvert' (tracé dans audit_log_pcm).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cloture_mensuelle (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id    UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  periode       DATE NOT NULL,                 -- 1er jour du mois clôturé (YYYY-MM-01)
  statut        TEXT NOT NULL DEFAULT 'cloture' CHECK (statut IN ('cloture', 'ouvert')),
  cloture_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cloture_par   UUID,
  decloture_at  TIMESTAMPTZ,
  decloture_par UUID,
  decloture_motif TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(societe_id, periode)
);

CREATE INDEX IF NOT EXISTS idx_cloture_mensuelle_societe
  ON public.cloture_mensuelle(societe_id, periode, statut);

-- Trigger updated_at (réutilise la fonction PCM de mig 444)
DROP TRIGGER IF EXISTS tg_cloture_mensuelle_updated_at ON public.cloture_mensuelle;
CREATE TRIGGER tg_cloture_mensuelle_updated_at
  BEFORE UPDATE ON public.cloture_mensuelle
  FOR EACH ROW EXECUTE FUNCTION public.tg_pcm_set_updated_at();

-- ============================================================================
-- Trigger de blocage des écritures sur période close
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_block_ecritures_periode_close()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_societe_id UUID;
  v_date       DATE;
  v_periode    DATE;
  v_closed     BOOLEAN;
BEGIN
  -- Déterminer société + date selon l'opération
  IF (TG_OP = 'DELETE') THEN
    v_societe_id := OLD.societe_id;
    v_date := OLD.date_ecriture;
  ELSE
    v_societe_id := NEW.societe_id;
    v_date := NEW.date_ecriture;
  END IF;

  IF v_date IS NULL OR v_societe_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_periode := date_trunc('month', v_date)::DATE;

  SELECT TRUE INTO v_closed
  FROM public.cloture_mensuelle
  WHERE societe_id = v_societe_id
    AND periode = v_periode
    AND statut = 'cloture'
  LIMIT 1;

  IF v_closed THEN
    RAISE EXCEPTION 'Période %-% clôturée pour cette société — modification interdite (déclôturer d''abord)',
      EXTRACT(YEAR FROM v_periode), LPAD(EXTRACT(MONTH FROM v_periode)::TEXT, 2, '0')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_block_ecritures_periode_close ON public.ecritures_comptables_v2;
CREATE TRIGGER tg_block_ecritures_periode_close
  BEFORE INSERT OR UPDATE OR DELETE ON public.ecritures_comptables_v2
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_ecritures_periode_close();

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.cloture_mensuelle ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cloture_mensuelle_select ON public.cloture_mensuelle;
CREATE POLICY cloture_mensuelle_select ON public.cloture_mensuelle
  FOR SELECT USING (public.user_has_societe_access(societe_id));

DROP POLICY IF EXISTS cloture_mensuelle_insert ON public.cloture_mensuelle;
CREATE POLICY cloture_mensuelle_insert ON public.cloture_mensuelle
  FOR INSERT WITH CHECK (public.user_has_societe_access(societe_id));

DROP POLICY IF EXISTS cloture_mensuelle_update ON public.cloture_mensuelle;
CREATE POLICY cloture_mensuelle_update ON public.cloture_mensuelle
  FOR UPDATE USING (public.user_has_societe_access(societe_id))
  WITH CHECK (public.user_has_societe_access(societe_id));

COMMENT ON TABLE public.cloture_mensuelle IS
'Clôture mensuelle comptable par société. Le trigger tg_block_ecritures_periode_close empêche toute écriture sur une période statut=cloture.';
