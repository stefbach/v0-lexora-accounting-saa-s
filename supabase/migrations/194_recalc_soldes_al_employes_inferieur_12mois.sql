-- ═══════════════════════════════════════════════════════════════
-- Migration 194 — Recalcul soldes AL employés < 12 mois d'ancienneté
--
-- Après le fix WRA S.45 (migration 193), les soldes_conges.al_acquis /
-- al_droit des employés avec moins de 12 mois d'ancienneté restent
-- incohérents (écrits avec l'ancienne formule linéaire).
--
-- Ce script met à jour le cycle COURANT de chaque employé actif dont
-- l'ancienneté totale est < 12 mois à la date d'exécution.
--
-- Ne touche PAS :
--   - les employés ≥ 12 mois (al_droit=22 déjà correct)
--   - les cycles antérieurs (historique sacré)
--   - al_pris (les demandes restent inchangées — Mégane reclasse
--     manuellement les AL illégales si besoin)
--
-- IDEMPOTENT : rejouable sans effet si les soldes sont déjà conformes.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_emp RECORD;
  v_rpc RECORD;
  v_updated INTEGER := 0;
BEGIN
  FOR v_emp IN
    SELECT e.id, e.date_arrivee, e.prenom, e.nom
    FROM public.employes e
    WHERE e.date_arrivee IS NOT NULL
      AND (e.date_depart IS NULL OR e.date_depart > CURRENT_DATE)
      -- Uniquement ceux < 12 mois d'ancienneté
      AND e.date_arrivee > (CURRENT_DATE - INTERVAL '12 months')
  LOOP
    SELECT al_acquis, al_utilisable, sl_droit
      INTO v_rpc
    FROM public.get_conges_droits_v2(v_emp.date_arrivee, CURRENT_DATE);

    UPDATE public.soldes_conges sc
       SET al_acquis = v_rpc.al_acquis,
           al_droit  = v_rpc.al_acquis,  -- utilisable = acquis pour <12m
           sl_droit  = v_rpc.sl_droit,
           updated_at = NOW()
     WHERE sc.employe_id = v_emp.id
       AND sc.periode_debut <= CURRENT_DATE
       AND sc.periode_fin   >= CURRENT_DATE;

    IF FOUND THEN
      v_updated := v_updated + 1;
      RAISE NOTICE 'Recalc AL soldes — % % (arrivée %) : al_acquis=% sl_droit=%',
        v_emp.prenom, v_emp.nom, v_emp.date_arrivee, v_rpc.al_acquis, v_rpc.sl_droit;
    END IF;
  END LOOP;

  RAISE NOTICE 'Migration 194 — % soldes_conges mis à jour (employés <12 mois).', v_updated;
END $$;
