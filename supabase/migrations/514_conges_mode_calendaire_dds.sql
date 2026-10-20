-- ============================================================
-- Migration 514 — DDS : renouvellement des congés au 1er janvier
--                 (mode "calendaire") + chargement des soldes RH
--
-- CONTEXTE
--   Digital Data Solutions Ltd (DDS, id 1826dde7-7b41-4d14-bc75-d8d22dfc75fb)
--   gère ses congés sur l'ANNÉE CIVILE (renouvellement au 1er janvier),
--   et non sur la date d'anniversaire d'embauche (comportement par défaut
--   WRA 2019 du reste de Lexora).
--
--   Cette migration :
--     1. Ajoute societes.conges_mode ('anniversaire' | 'calendaire').
--     2. Passe DDS en mode 'calendaire'.
--     3. Rend le trigger de nettoyage (mig 181) conscient du mode.
--     4. Consolide chaque salarié DDS actif sur UN SEUL cycle courant
--        = année civile 2026 (01/01 → 31/12), supprime les cycles
--        "anniversaire" qui se chevauchaient (bug maybeSingle), et
--        charge les soldes restants fournis par la RH (tableur
--        "Nbre de locals / Sicks restants DDS 2025-2026", colonne
--        "au 25 Sep 2026").
--
--   DÉCOMPOSITION DES SOLDES (colonnes générées :
--     al_solde = al_droit + al_reporte - al_pris
--     sl_solde = sl_droit + sl_accumule - sl_pris)
--   Pour rester STABLE face au recalcul applicatif (recomputeSoldeCongesAll,
--   qui réécrit al_droit = 22 / sl_droit = 15 et al_pris/sl_pris =
--   Σ demandes approuvées de la période, mais ne touche JAMAIS
--   al_reporte / sl_accumule), on fixe :
--     al_droit  = 22            (droit WRA ≥ 12 mois)
--     al_pris   = Σ AL approuvés 2026 (identique à ce que recompute produit)
--     al_reporte= solde_cible - 22 + al_pris   (report / correctif)
--     sl_droit  = 15
--     sl_pris   = Σ SL approuvés 2026
--     sl_accumule = solde_cible - 15 + sl_pris
--   => al_solde / sl_solde = soldes cibles du tableur RH, et le prochain
--      recalcul ne les modifie pas (mêmes al_droit/al_pris reproduits).
--      al_reporte / sl_accumule peuvent être négatifs : ils encodent les
--      congés réellement pris au-delà de ce que les demandes Lexora
--      enregistrent (le tableur RH fait foi).
--
--   IDEMPOTENTE autant que possible (ADD COLUMN IF NOT EXISTS, upserts
--   ciblés par employe_id + periode). Les DELETE de cycles obsolètes ne
--   sont pas ré-exécutables mais sont sauvegardés.
-- ============================================================

-- ─── 1. Colonne societes.conges_mode ────────────────────────────────
ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS conges_mode TEXT NOT NULL DEFAULT 'anniversaire';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'societes_conges_mode_chk'
  ) THEN
    ALTER TABLE public.societes
      ADD CONSTRAINT societes_conges_mode_chk
      CHECK (conges_mode IN ('anniversaire', 'calendaire'));
  END IF;
END $$;

COMMENT ON COLUMN public.societes.conges_mode IS
  'Mode de renouvellement des congés : anniversaire (défaut, cycle 12 mois
   ancré sur date_arrivee, WRA 2019) ou calendaire (année civile,
   renouvellement au 1er janvier — politique employeur, ex. DDS).';

-- ─── 2. DDS en mode calendaire ──────────────────────────────────────
UPDATE public.societes
SET conges_mode = 'calendaire'
WHERE id = '1826dde7-7b41-4d14-bc75-d8d22dfc75fb';

-- ─── 3. Trigger mig 181 conscient du mode ───────────────────────────
--   Quand date_arrivee change, le cycle courant attendu dépend du mode
--   de la société. On ne supprime plus aveuglément la ligne calendaire
--   d'un employé DDS.
CREATE OR REPLACE FUNCTION public.trg_employes_date_arrivee_changed()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE
  v_debut DATE;
  v_fin   DATE;
  v_mode  TEXT;
  v_ref   DATE := CURRENT_DATE;
BEGIN
  IF OLD.date_arrivee IS DISTINCT FROM NEW.date_arrivee AND NEW.date_arrivee IS NOT NULL THEN
    SELECT conges_mode INTO v_mode FROM public.societes WHERE id = NEW.societe_id;

    IF v_mode = 'calendaire' THEN
      -- Année civile courante, clampée à la date d'arrivée (1er cycle partiel).
      v_debut := GREATEST(make_date(EXTRACT(YEAR FROM v_ref)::int, 1, 1), NEW.date_arrivee);
      v_fin   := make_date(EXTRACT(YEAR FROM v_ref)::int, 12, 31);
    ELSE
      v_debut := public.get_conges_period_start(NEW.date_arrivee, v_ref);
      v_fin   := (v_debut + INTERVAL '1 year' - INTERVAL '1 day')::DATE;
    END IF;

    INSERT INTO public._soldes_conges_legacy_deleted_h10
    SELECT sc.*, NOW()::timestamptz, OLD.date_arrivee, NEW.date_arrivee
    FROM public.soldes_conges sc
    WHERE sc.employe_id = NEW.id
      AND sc.periode_debut <= v_ref
      AND sc.periode_fin >= v_ref
      AND (sc.periode_debut <> v_debut OR sc.periode_fin <> v_fin);

    DELETE FROM public.soldes_conges
    WHERE employe_id = NEW.id
      AND periode_debut <= v_ref
      AND periode_fin >= v_ref
      AND (periode_debut <> v_debut OR periode_fin <> v_fin);
  END IF;
  RETURN NEW;
END $fn$;

-- ─── 4. Backup des lignes qui vont être supprimées ──────────────────
CREATE TABLE IF NOT EXISTS public._soldes_conges_dds_calendaire_backup (
  LIKE public.soldes_conges INCLUDING ALL
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = '_soldes_conges_dds_calendaire_backup'
      AND column_name = 'backup_at'
  ) THEN
    ALTER TABLE public._soldes_conges_dds_calendaire_backup
      ADD COLUMN backup_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN backup_reason TEXT;
  END IF;
END $$;

-- Snapshot des cycles "anniversaire" chevauchant aujourd'hui qui seront
-- supprimés (consolidation sur la ligne calendaire 2026).
INSERT INTO public._soldes_conges_dds_calendaire_backup
SELECT sc.*, NOW()::timestamptz, 'mig514_consolidation_calendaire'
FROM public.soldes_conges sc
WHERE (sc.employe_id, sc.periode_debut) IN (
  ('56d69187-b291-4002-8036-561b82660fa1','2025-11-06'), -- Anaelle CANGY
  ('57493371-2aca-41a7-85a4-860712c8be1c','2026-09-12'), -- Eveline CHARLES
  ('b1b3703a-3290-4f44-95f4-f6f5129160c4','2026-10-02'), -- Elodie CHATON
  ('b130ae86-a6c3-4f5e-869d-f68333e69a23','2026-07-04'), -- Dooshila CHUKOORY
  ('ddf5bba2-e08b-49c9-a3b5-60d2edeb8540','2026-09-05'), -- Emilie HENRI-SATAI
  ('415e63a0-3020-417f-a349-b14317db26c5','2026-09-11'), -- Léa NEMDHARRY
  ('cae2ba36-3172-43f9-ac97-3732fca899a9','2025-11-06'), -- Sanjeevee PERLE
  ('33c523db-d527-4cb4-98ff-f488f750e61f','2025-11-06'), -- Fabiola PIERRE
  ('46376c5c-7590-466b-9ab7-d728090b1ff5','2026-07-08'), -- Annuella PRINTANIERE
  ('d029bc9d-2d16-4a4c-bfc5-e27f63e2c983','2026-09-12'), -- Ariffah RAMJEAN
  ('a58d70a9-b945-4d3f-aefb-c33dd0cfa324','2026-06-26'), -- Catty SEENIEN
  ('6025c374-5896-4923-9a42-beb16a6a09bb','2026-05-09')  -- Vanessa TOBEGNO
);

-- ─── 5. Suppression des cycles anniversaire obsolètes ───────────────
DELETE FROM public.soldes_conges
WHERE (employe_id, periode_debut) IN (
  ('56d69187-b291-4002-8036-561b82660fa1','2025-11-06'),
  ('57493371-2aca-41a7-85a4-860712c8be1c','2026-09-12'),
  ('b1b3703a-3290-4f44-95f4-f6f5129160c4','2026-10-02'),
  ('b130ae86-a6c3-4f5e-869d-f68333e69a23','2026-07-04'),
  ('ddf5bba2-e08b-49c9-a3b5-60d2edeb8540','2026-09-05'),
  ('415e63a0-3020-417f-a349-b14317db26c5','2026-09-11'),
  ('cae2ba36-3172-43f9-ac97-3732fca899a9','2025-11-06'),
  ('33c523db-d527-4cb4-98ff-f488f750e61f','2025-11-06'),
  ('46376c5c-7590-466b-9ab7-d728090b1ff5','2026-07-08'),
  ('d029bc9d-2d16-4a4c-bfc5-e27f63e2c983','2026-09-12'),
  ('a58d70a9-b945-4d3f-aefb-c33dd0cfa324','2026-06-26'),
  ('6025c374-5896-4923-9a42-beb16a6a09bb','2026-05-09')
);

-- ─── 6. Conversion des salariés sans ligne 2026 civile ──────────────
--   Wendy, Juliana : cycle → année civile complète 2026.
--   Julie (embauchée 05/05/2026) : 1er cycle clampé 05/05 → 31/12/2026.
UPDATE public.soldes_conges
SET periode_debut = '2026-01-01', periode_fin = '2026-12-31', annee = 2026,
    updated_at = NOW()
WHERE employe_id = '8da2dd96-04a0-44fd-9835-421b02fd84ff' -- Wendy COMPASSY
  AND periode_debut = '2026-03-07';

UPDATE public.soldes_conges
SET periode_debut = '2026-01-01', periode_fin = '2026-12-31', annee = 2026,
    updated_at = NOW()
WHERE employe_id = 'a2e61db7-5b81-44f2-aaba-e4dfe1a5ae74' -- Juliana HAGGOO (hors tableur, soldes inchangés)
  AND periode_debut = '2026-04-01';

UPDATE public.soldes_conges
SET periode_fin = '2026-12-31', annee = 2026, updated_at = NOW()
WHERE employe_id = 'fe67748b-4485-4528-936e-2ccc0f227cfc' -- Julie RENEVIER (clamp, soldes inchangés)
  AND periode_debut = '2026-05-05';

-- ─── 7. Chargement des soldes RH (tableur, "au 25 Sep 2026") ────────
--   Décomposition recompute-stable (cf. en-tête). Les salariés listés
--   sont ceux du tableur DDS. Juliana/Julie non concernés (hors tableur).
UPDATE public.soldes_conges AS sc
SET al_droit    = v.al_droit,
    al_pris     = v.al_pris,
    al_reporte  = v.al_reporte,
    sl_droit    = v.sl_droit,
    sl_pris     = v.sl_pris,
    sl_accumule = v.sl_accumule,
    updated_at  = NOW()
FROM (
  VALUES
  --  employe_id,                               al_droit, al_pris, al_reporte, sl_droit, sl_pris, sl_accumule
  ('56d69187-b291-4002-8036-561b82660fa1'::uuid, 22, 15.5,  9.0, 15, 13.0, -2.0), -- Anaelle CANGY        (AL 15.5 / SL 0)
  ('d029bc9d-2d16-4a4c-bfc5-e27f63e2c983'::uuid, 22, 20.0, 16.5, 15,  7.0, -2.0), -- Ariffah RAMJEAN      (AL 18.5 / SL 6)
  ('b130ae86-a6c3-4f5e-869d-f68333e69a23'::uuid, 22,  6.0, 25.5, 15, 11.0, -4.0), -- Dooshila CHUKOORY    (AL 41.5 / SL 0)
  ('ddf5bba2-e08b-49c9-a3b5-60d2edeb8540'::uuid, 22,  7.5, -5.5, 15,  9.0, -6.0), -- Emilie HENRI-SATAI   (AL 9 / SL 0)
  ('57493371-2aca-41a7-85a4-860712c8be1c'::uuid, 22, 16.0,  6.0, 15, 12.0, -2.0), -- Eveline CHARLES      (AL 12 / SL 1)
  ('33c523db-d527-4cb4-98ff-f488f750e61f'::uuid, 22,  8.0, 21.0, 15,  8.0,  0.0), -- Fabiola PIERRE       (AL 35 / SL 7)
  ('e52575e3-a23f-4f9e-a6cb-9bcc5fac1ed1'::uuid, 22, 13.5, 14.5, 15,  9.0,  0.0), -- Gavena CHINAN        (AL 23 / SL 6)
  ('415e63a0-3020-417f-a349-b14317db26c5'::uuid, 22,  7.0, -6.5, 15,  7.5, -7.5), -- Léa NEMDHARRY        (AL 8.5 / SL 0)
  ('cae2ba36-3172-43f9-ac97-3732fca899a9'::uuid, 22, 16.5, 13.0, 15, 12.0, -3.0), -- Sanjeevee PERLE      (AL 18.5 / SL 0)
  ('8da2dd96-04a0-44fd-9835-421b02fd84ff'::uuid, 22, 14.5, -3.0, 15,  3.5, -4.0), -- Wendy COMPASSY       (AL 4.5 / SL 7.5)
  ('46376c5c-7590-466b-9ab7-d728090b1ff5'::uuid, 22,  5.0, 14.5, 15,  8.5, -1.0), -- Annuella PRINTANIERE (AL 31.5 / SL 5.5)
  ('a58d70a9-b945-4d3f-aefb-c33dd0cfa324'::uuid, 22,  1.5,  9.5, 15,  2.0,  1.0), -- Catty SEENIEN        (AL 30 / SL 14)
  ('6025c374-5896-4923-9a42-beb16a6a09bb'::uuid, 22, 14.5,  9.0, 15,  3.0, -0.5), -- Vanessa TOBEGNO      (AL 16.5 / SL 11.5)
  ('b1b3703a-3290-4f44-95f4-f6f5129160c4'::uuid, 22,  9.0,  1.0, 15,  5.0, -3.0)  -- Elodie CHATON        (AL 14 / SL 7)
) AS v(employe_id, al_droit, al_pris, al_reporte, sl_droit, sl_pris, sl_accumule)
WHERE sc.employe_id = v.employe_id
  AND sc.periode_debut = '2026-01-01'
  AND sc.periode_fin   = '2026-12-31';
