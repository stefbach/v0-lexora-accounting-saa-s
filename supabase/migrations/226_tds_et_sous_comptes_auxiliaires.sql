-- ============================================================================
-- Migration 226 — Module TDS Maurice + sous-comptes auxiliaires 411x/401x
-- ============================================================================
--
-- Findings audit P1 :
--   • Module TDS (Tax Deducted at Source — ITA Section 111A) absent.
--     Aucune détection auto sur factures fournisseurs (loyer 5%, services
--     pro 3%, contractors 0,75%).
--   • Comptes 411 et 401 globaux (un compte unique pour tous les tiers).
--     Norme PCM Maurice : sous-compte par tiers (411-XXXX, 401-XXXX) pour
--     traçabilité, lettrage et rapprochement.
--
-- Stratégie :
--   • Table `tds_taux_par_categorie` : taux TDS par catégorie de paiement
--   • Table `tiers_categories_tds` : mapping tiers → catégorie (apprend)
--   • RPC `get_or_create_compte_auxiliaire` : génère ou retourne 411-<hash6>
--     ou 401-<hash6> pour un tiers donné, et l'inscrit dans plan_comptable
--   • Table `tds_declarations_mensuelles` : déclaration TDS Form mensuel
--
-- Approche backward compatible : tant que `comptes_auxiliaires_actif=false`
-- côté société, createEcrituresForFacture continue d'écrire sur 411/401
-- globaux (comportement actuel). Activable société par société.
--
-- IDEMPOTENTE.
-- ============================================================================

-- ── 1. Catégories de paiement et taux TDS Maurice ────────────────────────
CREATE TABLE IF NOT EXISTS public.tds_taux_par_categorie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  libelle TEXT NOT NULL,
  taux_pct NUMERIC(5,2) NOT NULL,
  compte_charge TEXT NOT NULL,        -- 6356, 6357, etc.
  description TEXT,
  actif BOOLEAN DEFAULT TRUE
);

INSERT INTO public.tds_taux_par_categorie (code, libelle, taux_pct, compte_charge, description) VALUES
  ('LOYER_RES',         'Loyer résidentiel',                       5.00, '6356', 'Section 111A(1)(a)'),
  ('LOYER_COMM',        'Loyer commercial',                        7.50, '6356', 'Section 111A(1)(b)'),
  ('SERVICES_PRO',      'Services professionnels (consulting)',    3.00, '6357', 'Section 111A(1)(c)'),
  ('CONTRACTORS',       'Contractors / sous-traitance',            0.75, '6357', 'Section 111A(1)(d)'),
  ('ROYALTIES',         'Royalties',                              10.00, '6357', 'Section 111A(1)(e)'),
  ('INTERETS',          'Intérêts versés',                         3.00, '6357', 'Section 111A(1)(f)'),
  ('SECURITY',          'Services de sécurité',                    3.00, '6357', 'Section 111A(1)(g)'),
  ('NETTOYAGE',         'Services de nettoyage',                   3.00, '6357', 'Section 111A(1)(h)'),
  ('TRAITEUR',          'Services traiteur',                       3.00, '6357', 'Section 111A(1)(i)'),
  ('PUBLICITE',         'Publicité',                               3.00, '6357', 'Section 111A(1)(j)'),
  ('TRANSPORT',         'Transport',                               3.00, '6357', 'Section 111A(1)(k)')
ON CONFLICT (code) DO UPDATE
  SET libelle = EXCLUDED.libelle,
      taux_pct = EXCLUDED.taux_pct,
      compte_charge = EXCLUDED.compte_charge,
      description = EXCLUDED.description;

-- ── 2. Mapping tiers → catégorie TDS (apprend de l'utilisateur) ─────────
CREATE TABLE IF NOT EXISTS public.tiers_categories_tds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  tiers_pattern TEXT NOT NULL,          -- nom (LIKE) ou tiers_id
  categorie_code TEXT NOT NULL REFERENCES public.tds_taux_par_categorie(code),
  appliquer_auto BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, tiers_pattern)
);

ALTER TABLE public.tiers_categories_tds ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tiers_categories_tds'
                   AND policyname = 'tiers_categ_tds_tenant_select') THEN
    CREATE POLICY tiers_categ_tds_tenant_select ON public.tiers_categories_tds
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY tiers_categ_tds_tenant_modify ON public.tiers_categories_tds
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- ── 3. Activation sous-comptes auxiliaires côté société ────────────────
ALTER TABLE public.societes
  ADD COLUMN IF NOT EXISTS comptes_auxiliaires_actif BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.societes.comptes_auxiliaires_actif IS
  'Si TRUE, createEcrituresForFacture utilise des sous-comptes 411-<hash> '
  '/ 401-<hash> par tiers au lieu des comptes globaux. Migration des '
  'écritures historiques manuelle (script à part).';

-- ── 4. RPC : retourne ou crée le sous-compte auxiliaire d'un tiers ──────
CREATE OR REPLACE FUNCTION public.get_or_create_compte_auxiliaire(
  p_societe_id UUID,
  p_tiers TEXT,
  p_type_facture TEXT             -- 'client' ou 'fournisseur'
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_aux_actif BOOLEAN;
  v_compte_parent TEXT;
  v_hash TEXT;
  v_compte_aux TEXT;
  v_libelle_aux TEXT;
BEGIN
  -- Vérifier si la société a activé les sous-comptes
  SELECT comptes_auxiliaires_actif INTO v_aux_actif
  FROM public.societes WHERE id = p_societe_id;

  IF NOT COALESCE(v_aux_actif, FALSE) THEN
    -- Mode classique : retourne le compte parent global
    RETURN CASE WHEN p_type_facture = 'fournisseur' THEN '401' ELSE '411' END;
  END IF;

  v_compte_parent := CASE WHEN p_type_facture = 'fournisseur' THEN '401' ELSE '411' END;
  -- Hash 6 chars du tiers + société (stable, déterministe)
  v_hash := UPPER(SUBSTR(MD5(LOWER(TRIM(p_tiers)) || p_societe_id::TEXT), 1, 6));
  v_compte_aux := v_compte_parent || v_hash;
  v_libelle_aux := CASE WHEN p_type_facture = 'fournisseur' THEN 'Fournisseur ' ELSE 'Client ' END || p_tiers;

  -- Insérer dans plan_comptable si pas déjà présent
  INSERT INTO public.plan_comptable (compte, libelle, type_compte, sens_normal, compte_parent, niveau)
  VALUES (v_compte_aux, LEFT(v_libelle_aux, 200),
          CASE WHEN p_type_facture = 'fournisseur' THEN 'passif' ELSE 'actif' END,
          CASE WHEN p_type_facture = 'fournisseur' THEN 'C' ELSE 'D' END,
          v_compte_parent, 5)
  ON CONFLICT (compte) DO NOTHING;

  RETURN v_compte_aux;
END;
$$;

COMMENT ON FUNCTION public.get_or_create_compte_auxiliaire IS
  'Si la société a activé les sous-comptes auxiliaires, retourne (et crée '
  'au besoin) le compte 411<HASH6> ou 401<HASH6> spécifique au tiers. '
  'Sinon retourne 411 ou 401 global. À utiliser dans createEcrituresForFacture.';

-- ── 5. Table déclarations TDS mensuelles ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tds_declarations_mensuelles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  periode TEXT NOT NULL,                -- 'YYYY-MM'
  date_limite DATE NOT NULL,            -- 20 du mois suivant
  total_tds_retenu NUMERIC(15, 2) DEFAULT 0,
  nb_factures INT DEFAULT 0,
  detail_par_categorie JSONB,           -- { "LOYER_RES": 1500, "SERVICES_PRO": 3200 }
  statut TEXT DEFAULT 'a_declarer',     -- a_declarer / declare / paye
  date_declaration DATE,
  date_paiement DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (societe_id, periode)
);

ALTER TABLE public.tds_declarations_mensuelles ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tds_declarations_mensuelles'
                   AND policyname = 'tds_decl_tenant_select') THEN
    CREATE POLICY tds_decl_tenant_select ON public.tds_declarations_mensuelles
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY tds_decl_tenant_modify ON public.tds_declarations_mensuelles
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- ── 6. RPC : agrégation TDS du mois ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agreger_tds_mensuel(
  p_societe_id UUID,
  p_periode TEXT             -- 'YYYY-MM'
) RETURNS public.tds_declarations_mensuelles
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_date_debut DATE;
  v_date_fin DATE;
  v_date_limite DATE;
  v_total NUMERIC := 0;
  v_nb INT := 0;
  v_detail JSONB := '{}'::jsonb;
  v_result public.tds_declarations_mensuelles;
BEGIN
  v_date_debut := (p_periode || '-01')::DATE;
  v_date_fin := (v_date_debut + INTERVAL '1 month - 1 day')::DATE;
  v_date_limite := (v_date_fin + INTERVAL '20 days')::DATE;

  -- Agréger TDS retenus depuis ecritures sur compte 4471
  SELECT
    COALESCE(SUM(credit_mur), 0),
    COUNT(DISTINCT ref_folio)
  INTO v_total, v_nb
  FROM public.ecritures_comptables_v2
  WHERE societe_id = p_societe_id
    AND numero_compte = '4471'
    AND date_ecriture BETWEEN v_date_debut AND v_date_fin;

  -- Upsert dans tds_declarations_mensuelles
  INSERT INTO public.tds_declarations_mensuelles
    (societe_id, periode, date_limite, total_tds_retenu, nb_factures, detail_par_categorie)
  VALUES
    (p_societe_id, p_periode, v_date_limite, v_total, v_nb, v_detail)
  ON CONFLICT (societe_id, periode) DO UPDATE
    SET total_tds_retenu = EXCLUDED.total_tds_retenu,
        nb_factures = EXCLUDED.nb_factures,
        date_limite = EXCLUDED.date_limite,
        updated_at = NOW()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.agreger_tds_mensuel IS
  'Agrège les écritures 4471 (TDS retenu à reverser) du mois et upsert '
  'dans tds_declarations_mensuelles. À appeler en clôture mensuelle ou '
  'à la demande.';

-- ── 7. Champs TDS sur factures ──────────────────────────────────────────
ALTER TABLE public.factures
  ADD COLUMN IF NOT EXISTS tds_categorie TEXT REFERENCES public.tds_taux_par_categorie(code) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tds_taux_pct NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS tds_montant NUMERIC(15, 2);

COMMENT ON COLUMN public.factures.tds_categorie IS
  'Catégorie TDS appliquée. Si renseigné, createEcrituresForFacture génère '
  'une ligne supplémentaire 4471 (TDS retenu).';

DO $$
DECLARE
  v_cat INT;
BEGIN
  SELECT COUNT(*) INTO v_cat FROM public.tds_taux_par_categorie;
  RAISE NOTICE '✓ Migration 226 — % catégories TDS Maurice référencées', v_cat;
  RAISE NOTICE '✓ get_or_create_compte_auxiliaire() pour sous-comptes 411/401 par tiers';
  RAISE NOTICE '✓ agreger_tds_mensuel() pour déclaration TDS Form';
  RAISE NOTICE '  Activer par société : UPDATE societes SET comptes_auxiliaires_actif=TRUE WHERE id=...';
END $$;
