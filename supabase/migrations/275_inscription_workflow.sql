-- ═══════════════════════════════════════════════════════════════════════
-- Migration 275 — Workflow inscription publique + Plans / Tarifs
--
-- Demande utilisateur :
--   "process pour la creation de compte on doit pouvoir faire une demande
--    en acceptant les conditions generale d'utilisations et de vente …
--    creer formulaire pour la demande inscription du module avec compte
--    client et societe en meme temps qui ensuite pourront etre valider
--    en mode administration on pourra definir le type d'abonnement avec
--    le module tarif"
--
-- Choix utilisateur :
--   - Les deux types de demandeurs : dirigeant ET comptable
--   - Plans visibles dans le formulaire (catalogue DB)
--   - Workflow email : confirmation prospect + notif admin + identifiants
--     après validation
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Table plans — Catalogue des offres
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT NOT NULL UNIQUE,
  nom                 TEXT NOT NULL,
  description         TEXT,
  type_cible          TEXT NOT NULL CHECK (type_cible IN ('dirigeant', 'comptable', 'tous')),
  prix_mensuel_mur    NUMERIC(12,2) NOT NULL DEFAULT 0,
  prix_annuel_mur     NUMERIC(12,2),  -- optionnel — typiquement remise vs mensuel
  devise              TEXT NOT NULL DEFAULT 'MUR',
  -- Modules inclus : JSONB qui mappe sur la structure modules_actifs
  -- de societes (comptabilite, facturation, rh, etc.) — true = inclus
  modules_inclus      JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Limites quantitatives optionnelles (nb factures/mois, nb sociétés, etc.)
  limites             JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Mise en avant UI
  populaire           BOOLEAN NOT NULL DEFAULT FALSE,
  ordre               INTEGER NOT NULL DEFAULT 0,
  actif               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plans_type_actif
  ON public.plans(type_cible, actif, ordre);

-- Accessible en lecture sans auth (catalogue public)
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plans_public_read" ON public.plans;
CREATE POLICY "plans_public_read" ON public.plans
  FOR SELECT USING (actif = TRUE);

DROP POLICY IF EXISTS "plans_admin_write" ON public.plans;
CREATE POLICY "plans_admin_write" ON public.plans
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- ─────────────────────────────────────────────────────────────────────
-- 2. Table demandes_inscription — Workflow de demande
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.demandes_inscription (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Profil demandeur
  type_demandeur      TEXT NOT NULL CHECK (type_demandeur IN ('dirigeant','comptable')),

  -- Compte utilisateur
  email               TEXT NOT NULL,
  prenom              TEXT NOT NULL,
  nom                 TEXT NOT NULL,
  telephone           TEXT,
  poste               TEXT,  -- fonction dans l'entreprise (CEO, CFO, DAF…)

  -- Société (si type_demandeur=dirigeant) — JSONB pour flexibilité
  -- Champs typiques : nom, brn, vat_number, secteur_activite, adresse,
  -- ville, pays, telephone, email, regime, nature_business, etc.
  societe_data        JSONB,

  -- Cabinet (si type_demandeur=comptable)
  -- Champs : nom_cabinet, brn, vat_number, adresse, telephone, etc.
  cabinet_data        JSONB,

  -- Plan choisi par le prospect (à la soumission) — admin pourra l'ajuster
  plan_id             UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  -- Périodicité : mensuelle / annuelle (impacte le tarif appliqué)
  periodicite         TEXT NOT NULL DEFAULT 'mensuelle'
                      CHECK (periodicite IN ('mensuelle','annuelle')),

  -- Acceptations légales
  accept_cgu          BOOLEAN NOT NULL DEFAULT FALSE,
  accept_cgv          BOOLEAN NOT NULL DEFAULT FALSE,
  accept_marketing    BOOLEAN NOT NULL DEFAULT FALSE,

  -- Message libre
  message             TEXT,

  -- Suivi
  statut              TEXT NOT NULL DEFAULT 'en_attente'
                      CHECK (statut IN ('en_attente','validee','refusee')),
  -- Plan effectivement attribué après validation admin (peut être ≠ plan_id
  -- choisi par le prospect)
  plan_attribue_id    UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  -- Modules effectivement activés (override possible du plan)
  modules_attribues   JSONB,
  -- Tarif final négocié (MUR mensuel)
  tarif_final_mur     NUMERIC(12,2),

  validated_at        TIMESTAMPTZ,
  validated_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejected_reason     TEXT,

  -- Liens vers les comptes créés post-validation
  created_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_societe_id  UUID REFERENCES public.societes(id) ON DELETE SET NULL,

  -- Suivi technique
  ip_address          TEXT,
  user_agent          TEXT,
  source              TEXT,  -- utm_source si présent

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demandes_inscription_statut_date
  ON public.demandes_inscription(statut, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demandes_inscription_email
  ON public.demandes_inscription(email);

ALTER TABLE public.demandes_inscription ENABLE ROW LEVEL SECURITY;

-- Insertion publique anonyme (formulaire d'inscription)
DROP POLICY IF EXISTS "demandes_public_insert" ON public.demandes_inscription;
CREATE POLICY "demandes_public_insert" ON public.demandes_inscription
  FOR INSERT WITH CHECK (TRUE);

-- Lecture/modification réservée admin
DROP POLICY IF EXISTS "demandes_admin_select" ON public.demandes_inscription;
CREATE POLICY "demandes_admin_select" ON public.demandes_inscription
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

DROP POLICY IF EXISTS "demandes_admin_modify" ON public.demandes_inscription;
CREATE POLICY "demandes_admin_modify" ON public.demandes_inscription
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','super_admin'))
  );

-- ─────────────────────────────────────────────────────────────────────
-- 3. Trigger : updated_at
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_inscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_plans_updated ON public.plans;
CREATE TRIGGER trg_plans_updated
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_inscription_updated_at();

DROP TRIGGER IF EXISTS trg_demandes_inscription_updated ON public.demandes_inscription;
CREATE TRIGGER trg_demandes_inscription_updated
  BEFORE UPDATE ON public.demandes_inscription
  FOR EACH ROW EXECUTE FUNCTION public.set_inscription_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- 4. Seed plans par défaut (à ajuster en admin/plans plus tard)
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO public.plans (code, nom, description, type_cible, prix_mensuel_mur, prix_annuel_mur, modules_inclus, populaire, ordre, actif)
VALUES
  -- Dirigeants
  ('starter',  'Starter',  'Pour démarrer en autonomie — facturation et documents.',
   'dirigeant', 1500, 15000,
   '{"facturation":true,"documents":true,"comptabilite":false,"rh":false,"fiscal":false,"etats_financiers":false,"juridique":false,"employe_portal":false}'::jsonb,
   FALSE, 10, TRUE),

  ('pro', 'Pro', 'Comptabilité complète + fiscal + paie pour PME.',
   'dirigeant', 4500, 45000,
   '{"facturation":true,"documents":true,"comptabilite":true,"rh":true,"fiscal":true,"etats_financiers":true,"juridique":false,"employe_portal":true}'::jsonb,
   TRUE, 20, TRUE),

  ('premium', 'Premium', 'Tous modules incluant juridique et IFRS avancé.',
   'dirigeant', 8500, 85000,
   '{"facturation":true,"documents":true,"comptabilite":true,"rh":true,"fiscal":true,"etats_financiers":true,"juridique":true,"employe_portal":true}'::jsonb,
   FALSE, 30, TRUE),

  -- Cabinets comptables
  ('cabinet_solo', 'Cabinet Solo', 'Pour un comptable indépendant — jusqu''à 10 clients.',
   'comptable', 3500, 35000,
   '{"facturation":true,"documents":true,"comptabilite":true,"rh":true,"fiscal":true,"etats_financiers":true,"juridique":true,"employe_portal":true}'::jsonb,
   FALSE, 10, TRUE),

  ('cabinet_team', 'Cabinet Équipe', 'Pour un cabinet avec collaborateurs — jusqu''à 50 clients.',
   'comptable', 9500, 95000,
   '{"facturation":true,"documents":true,"comptabilite":true,"rh":true,"fiscal":true,"etats_financiers":true,"juridique":true,"employe_portal":true}'::jsonb,
   TRUE, 20, TRUE),

  ('cabinet_enterprise', 'Cabinet Enterprise', 'Cabinets multi-associés sans limite, support dédié.',
   'comptable', 19500, 195000,
   '{"facturation":true,"documents":true,"comptabilite":true,"rh":true,"fiscal":true,"etats_financiers":true,"juridique":true,"employe_portal":true}'::jsonb,
   FALSE, 30, TRUE)
ON CONFLICT (code) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
