-- 435_heures_travaillees_periode_paiement.sql
--
-- Découple la date réelle d'une OT du mois de bulletin où elle est payée.
-- Avant : une OT du 15 mai allait forcément sur le bulletin de mai.
-- Après : l'utilisateur choisit librement le bulletin cible (mai, juin,
--         juillet…) sans changer la date réelle de l'OT.
--
-- L'unicité reste sur (employe_id, date) : une OT pour un jour donné
-- ne peut être inscrite qu'une fois, mais peut être basculée d'un
-- bulletin à un autre en mettant à jour periode_paiement.

ALTER TABLE public.heures_travaillees
  ADD COLUMN IF NOT EXISTS periode_paiement DATE;

-- Backfill : les OT existantes sont rattachées au bulletin du mois de
-- leur `date` réelle. Préserve le comportement legacy.
UPDATE public.heures_travaillees
SET periode_paiement = date_trunc('month', date)::date
WHERE periode_paiement IS NULL AND date IS NOT NULL;

-- Pour les lignes "agrégat" (pointage_id NULL, voir lib/rh/ot-aggregate.ts)
-- qui n'ont parfois pas de `date` mais ont une `periode` text → fallback.
UPDATE public.heures_travaillees
SET periode_paiement = (periode || '-01')::date
WHERE periode_paiement IS NULL
  AND periode ~ '^\d{4}-\d{2}$';

UPDATE public.heures_travaillees
SET periode_paiement = periode::date
WHERE periode_paiement IS NULL
  AND periode ~ '^\d{4}-\d{2}-\d{2}$';

CREATE INDEX IF NOT EXISTS idx_heures_travaillees_employe_periode_paiement
  ON public.heures_travaillees(employe_id, periode_paiement);

COMMENT ON COLUMN public.heures_travaillees.periode_paiement IS
  'Mois (1er du mois, YYYY-MM-01) du bulletin de paie où cette ligne d''OT est intégrée. Indépendant de `date` (la date réelle de l''OT) : permet de payer une OT de mai sur le bulletin de juin.';
