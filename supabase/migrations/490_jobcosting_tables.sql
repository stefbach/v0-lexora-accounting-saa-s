-- =====================================================================
-- Migration 490 — Socle Job Costing (Module D)
-- =====================================================================
-- Réf. spec : docs/roadmap/manufacturing-job-costing.md §2.2 / §2.4.
--
-- Tables créées :
--   • jobs                     — projets/mandats facturables (lien optionnel
--                                dossiers/contrats_clients/factures)
--   • couts_horaires_employes  — historique des taux chargés (snapshot, jamais
--                                recalculé rétroactivement, §2.5)
--   • imputations_temps        — table PARTAGÉE job / ordre de fabrication
--                                (job_id XOR ordre_fabrication_id), immuable
--                                une fois facturée
--   • depenses_job             — coûts non-salariaux imputés à un job (dont
--                                consommation de stock via la lib inventaire)
--
-- Extension additive de ecritures_comptables_v2 : colonnes analytiques
-- job_id / ordre_fabrication_id (nullable, aucun impact sur assertEquilibre
-- ni sur les écritures existantes, §2.4-1).
--
-- Extension additive du socle Inventaire (mig 481/487) : type de mouvement
-- 'sortie_job' + reference_type 'job' (consommation de stock imputée à un job).
--
-- RLS : SEC-003 — user_has_societe_access(societe_id) partout ;
-- user_has_employe_access(employe_id) sur imputations_temps.
-- Idempotente et additive.
-- =====================================================================

-- ── 1. jobs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jobs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id         UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  dossier_id         UUID REFERENCES public.dossiers(id) ON DELETE SET NULL,
  contrat_id         UUID REFERENCES public.contrats_clients(id) ON DELETE SET NULL,
  code               TEXT NOT NULL,
  libelle            TEXT NOT NULL,
  client_nom         TEXT,
  type_facturation   TEXT NOT NULL DEFAULT 'temps_materiel'
                       CHECK (type_facturation IN ('temps_materiel','forfait','abonnement')),
  statut             TEXT NOT NULL DEFAULT 'ouvert'
                       CHECK (statut IN ('ouvert','en_cours','en_pause','cloture','facture','annule')),
  responsable_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  date_debut         DATE,
  date_fin_prevue    DATE,
  date_cloture       DATE,
  budget_heures      NUMERIC(9,2),
  budget_montant     NUMERIC(15,2),
  devise             TEXT NOT NULL DEFAULT 'MUR',
  facture_id         UUID REFERENCES public.factures(id) ON DELETE SET NULL,
  -- Cumuls maintenus EXCLUSIVEMENT par les RPC (mig 492), jamais côté client.
  cout_temps_reel    NUMERIC(15,2) NOT NULL DEFAULT 0,
  cout_depenses_reel NUMERIC(15,2) NOT NULL DEFAULT 0,
  montant_facturable NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Figé à la facturation = montant_facturable au moment du gel (R6).
  montant_facture    NUMERIC(15,2),
  cree_par           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (societe_id, code)
);

CREATE INDEX IF NOT EXISTS idx_jobs_societe        ON public.jobs(societe_id);
CREATE INDEX IF NOT EXISTS idx_jobs_societe_statut ON public.jobs(societe_id, statut);
CREATE INDEX IF NOT EXISTS idx_jobs_dossier        ON public.jobs(dossier_id);

-- ── 2. couts_horaires_employes (snapshot périodique) ─────────────────
CREATE TABLE IF NOT EXISTS public.couts_horaires_employes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id          UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  employe_id          UUID NOT NULL REFERENCES public.employes(id) ON DELETE CASCADE,
  date_effet          DATE NOT NULL,
  cout_horaire_charge NUMERIC(10,4) NOT NULL CHECK (cout_horaire_charge >= 0),
  methode_calcul      TEXT NOT NULL DEFAULT 'auto_bulletin'
                        CHECK (methode_calcul IN ('auto_bulletin','manuel')),
  base_salaire        NUMERIC(15,2),
  charges_patronales_pct NUMERIC(6,4),
  heures_mensuelles   NUMERIC(8,2),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employe_id, date_effet)
);

CREATE INDEX IF NOT EXISTS idx_couts_horaires_employe
  ON public.couts_horaires_employes(employe_id, date_effet DESC);
CREATE INDEX IF NOT EXISTS idx_couts_horaires_societe
  ON public.couts_horaires_employes(societe_id);

-- ── 3. imputations_temps (partagée job / OF) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.imputations_temps (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id           UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  job_id               UUID REFERENCES public.jobs(id) ON DELETE CASCADE,
  ordre_fabrication_id UUID REFERENCES public.ordres_fabrication(id) ON DELETE CASCADE,
  employe_id           UUID NOT NULL REFERENCES public.employes(id) ON DELETE RESTRICT,
  pointage_id          UUID REFERENCES public.pointages(id) ON DELETE SET NULL,
  date_prestation      DATE NOT NULL,
  heures               NUMERIC(6,2) NOT NULL CHECK (heures > 0),
  type_heures          TEXT NOT NULL DEFAULT 'normale'
                         CHECK (type_heures IN ('normale','heures_sup','deplacement')),
  tache                TEXT,
  description          TEXT,
  facturable           BOOLEAN NOT NULL DEFAULT TRUE,
  taux_horaire_facture NUMERIC(10,2),
  cout_horaire_charge  NUMERIC(10,4) NOT NULL CHECK (cout_horaire_charge >= 0),
  cout_total           NUMERIC(15,2) GENERATED ALWAYS AS (ROUND(heures * cout_horaire_charge, 2)) STORED,
  statut_validation    TEXT NOT NULL DEFAULT 'brouillon'
                         CHECK (statut_validation IN ('brouillon','soumis','valide','rejete','facture')),
  valide_par           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  valide_at            TIMESTAMPTZ,
  saisi_par            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Exactement un rattachement : job OU ordre de fabrication (§2.2)
  CONSTRAINT imputations_temps_cible_unique
    CHECK (num_nonnulls(job_id, ordre_fabrication_id) = 1)
);

CREATE INDEX IF NOT EXISTS idx_imput_temps_societe_job_date
  ON public.imputations_temps(societe_id, job_id, date_prestation);
CREATE INDEX IF NOT EXISTS idx_imput_temps_of
  ON public.imputations_temps(ordre_fabrication_id);
CREATE INDEX IF NOT EXISTS idx_imput_temps_employe_date
  ON public.imputations_temps(employe_id, date_prestation);
CREATE INDEX IF NOT EXISTS idx_imput_temps_validation
  ON public.imputations_temps(societe_id, statut_validation);

-- ── 4. depenses_job ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.depenses_job (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id             UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  job_id                 UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  type_depense           TEXT NOT NULL DEFAULT 'autre'
                           CHECK (type_depense IN ('achat_materiel','sous_traitance','frais_deplacement','autre')),
  description            TEXT,
  montant_ht             NUMERIC(15,2) NOT NULL CHECK (montant_ht >= 0),
  devise                 TEXT NOT NULL DEFAULT 'MUR',
  facture_fournisseur_id UUID REFERENCES public.factures(id) ON DELETE SET NULL,
  note_frais_id          UUID REFERENCES public.notes_de_frais(id) ON DELETE SET NULL,
  -- Consommation de stock imputée au job (mouvement 'sortie_job', mig 492).
  mouvement_stock_id     UUID REFERENCES public.mouvements_stock(id) ON DELETE SET NULL,
  facturable             BOOLEAN NOT NULL DEFAULT TRUE,
  marge_refacturation_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  date_depense           DATE NOT NULL DEFAULT CURRENT_DATE,
  cree_par               UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_depenses_job_societe ON public.depenses_job(societe_id);
CREATE INDEX IF NOT EXISTS idx_depenses_job_job      ON public.depenses_job(job_id);

-- ── 5. Colonnes analytiques additives sur ecritures_comptables_v2 ────
-- Nullable, migration additive pure (§2.4-1) : permet de taguer une écriture
-- existante (ACH/SAL/OD) par job/OF sans générer d'écriture supplémentaire.
ALTER TABLE public.ecritures_comptables_v2
  ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES public.jobs(id) ON DELETE SET NULL;
ALTER TABLE public.ecritures_comptables_v2
  ADD COLUMN IF NOT EXISTS ordre_fabrication_id UUID REFERENCES public.ordres_fabrication(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ecritures_v2_job ON public.ecritures_comptables_v2(job_id) WHERE job_id IS NOT NULL;

-- ── 6. Extension mouvements_stock : consommation imputée à un job ────
ALTER TABLE public.mouvements_stock DROP CONSTRAINT IF EXISTS mouvements_stock_type_mouvement_check;
ALTER TABLE public.mouvements_stock ADD CONSTRAINT mouvements_stock_type_mouvement_check
  CHECK (type_mouvement IN (
    'entree_achat','sortie_vente',
    'ajustement_inventaire_plus','ajustement_inventaire_moins',
    'transfert_sortie','transfert_entree',
    'retour_client','retour_fournisseur','perte_casse',
    'sortie_fabrication','entree_production',
    'sortie_job'));

ALTER TABLE public.mouvements_stock DROP CONSTRAINT IF EXISTS mouvements_stock_reference_type_check;
ALTER TABLE public.mouvements_stock ADD CONSTRAINT mouvements_stock_reference_type_check
  CHECK (reference_type IN
    ('bon_reception','vente_pos','inventaire_physique','transfert','manuel','ordre_fabrication','job'));

-- ── 7. Immuabilité imputations_temps facturées (esprit R6) ───────────
CREATE OR REPLACE FUNCTION public.imputations_temps_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.statut_validation = 'facture' THEN
      RAISE EXCEPTION 'IMPUTATION_IMMUABLE: une imputation facturée ne peut être supprimée — ligne compensatoire requise';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.statut_validation = 'facture' THEN
    RAISE EXCEPTION 'IMPUTATION_IMMUABLE: une imputation facturée ne peut être modifiée — ligne compensatoire requise';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_imputations_temps_immutable ON public.imputations_temps;
CREATE TRIGGER trg_imputations_temps_immutable
  BEFORE UPDATE OR DELETE ON public.imputations_temps
  FOR EACH ROW EXECUTE FUNCTION public.imputations_temps_immutable();

-- ── 8. updated_at ────────────────────────────────────────────────────
-- Réutilise public.inventaire_touch_updated_at() (mig 481).
DROP TRIGGER IF EXISTS trg_jobs_touch ON public.jobs;
CREATE TRIGGER trg_jobs_touch BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.inventaire_touch_updated_at();

DROP TRIGGER IF EXISTS trg_imputations_temps_touch ON public.imputations_temps;
CREATE TRIGGER trg_imputations_temps_touch BEFORE UPDATE ON public.imputations_temps
  FOR EACH ROW EXECUTE FUNCTION public.inventaire_touch_updated_at();

-- ── 9. RLS — SEC-003 ─────────────────────────────────────────────────
ALTER TABLE public.jobs                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couts_horaires_employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imputations_temps       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depenses_job            ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='jobs' AND policyname='jobs_tenant_select') THEN
    CREATE POLICY jobs_tenant_select ON public.jobs
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY jobs_tenant_modify ON public.jobs
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='couts_horaires_employes' AND policyname='couts_horaires_tenant_select') THEN
    CREATE POLICY couts_horaires_tenant_select ON public.couts_horaires_employes
      FOR SELECT USING (public.user_has_employe_access(employe_id));
    CREATE POLICY couts_horaires_tenant_modify ON public.couts_horaires_employes
      FOR ALL USING (public.is_global_admin() OR public.user_has_employe_access(employe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_employe_access(employe_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='imputations_temps' AND policyname='imputations_temps_tenant_select') THEN
    -- SEC-003 : accès borné à la société de l'employé imputé (user_has_employe_access).
    CREATE POLICY imputations_temps_tenant_select ON public.imputations_temps
      FOR SELECT USING (public.user_has_employe_access(employe_id));
    CREATE POLICY imputations_temps_tenant_modify ON public.imputations_temps
      FOR ALL USING (public.is_global_admin() OR public.user_has_employe_access(employe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_employe_access(employe_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='depenses_job' AND policyname='depenses_job_tenant_select') THEN
    CREATE POLICY depenses_job_tenant_select ON public.depenses_job
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY depenses_job_tenant_modify ON public.depenses_job
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;
