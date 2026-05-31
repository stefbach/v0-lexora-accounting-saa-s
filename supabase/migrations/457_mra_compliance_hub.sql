-- =====================================================================
-- Migration 457 — MRA Compliance Hub (socle lifecycle + rappels)
-- =====================================================================
-- Centralise TOUTES les obligations fiscales MRA dans un seul cycle de vie
-- (AUTO → A_FAIRE → DECLARE → PAYE / RETARD), avec échéances, montants dus
-- calculés depuis la compta, et un moteur de rappels paramétrable
-- (Telegram / Email / Dashboard).
--
-- Réutilise l'existant :
--   • tds_categories_mra + tds_declarations_mensuelles_v2 (mig 259)
--   • ecritures_comptables_v2 (journal OD-PAIE) pour PAYE/CSG/NSF
--   • factures.tds_* pour le TDS
--
-- Types d'obligations gérés (colonne `type`) :
--   PAYE, CSG, NSF, TDS, TVA   (mensuelles)
--   CIT, APS, IT_FORM3         (annuelles / acomptes — alimentées plus tard)
-- =====================================================================

-- ── 1. Table lifecycle unifiée ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mra_declarations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id       UUID NOT NULL REFERENCES public.societes(id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN
                     ('PAYE','CSG','NSF','TDS','TVA','CIT','APS','IT_FORM3')),
  -- periode : 'YYYY-MM' pour mensuel, 'YYYY' pour annuel
  periode          TEXT NOT NULL,
  date_echeance    DATE NOT NULL,
  montant_du       NUMERIC(15,2) NOT NULL DEFAULT 0,
  montant_paye     NUMERIC(15,2) NOT NULL DEFAULT 0,
  statut           TEXT NOT NULL DEFAULT 'auto'
                   CHECK (statut IN ('auto','a_faire','declare','paye','retard','sans_objet')),
  date_declaration DATE,
  date_paiement    DATE,
  reference_mra    TEXT,                -- n° de remise / accusé MRA
  doc_url          TEXT,                -- bordereau généré
  ecriture_id      UUID,               -- écriture de paiement (lettrage auto)
  -- détail (ex: { csg_salarie, csg_patronal, nb_factures_tds, par_categorie… })
  meta             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (societe_id, type, periode)
);

CREATE INDEX IF NOT EXISTS idx_mra_decl_societe_echeance
  ON public.mra_declarations (societe_id, date_echeance);
CREATE INDEX IF NOT EXISTS idx_mra_decl_statut
  ON public.mra_declarations (societe_id, statut);

ALTER TABLE public.mra_declarations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mra_declarations' AND policyname='mra_decl_tenant_select') THEN
    CREATE POLICY mra_decl_tenant_select ON public.mra_declarations
      FOR SELECT USING (public.user_has_societe_access(societe_id));
    CREATE POLICY mra_decl_tenant_modify ON public.mra_declarations
      FOR ALL USING (public.is_global_admin() OR public.user_has_societe_access(societe_id))
      WITH CHECK (public.is_global_admin() OR public.user_has_societe_access(societe_id));
  END IF;
END $$;

-- ── 2. Règles de rappel paramétrables ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mra_reminder_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = s'applique à tous les types ; sinon un type précis
  type          TEXT,
  -- décalage en jours par rapport à l'échéance (négatif = avant, 0 = jour J, positif = après)
  offset_days   INT NOT NULL,
  canal         TEXT NOT NULL CHECK (canal IN ('telegram','email','dashboard')),
  actif         BOOLEAN NOT NULL DEFAULT TRUE,
  -- gabarit message ; placeholders {type} {periode} {montant} {echeance} {jours}
  message_tpl   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seeds : escalade progressive multi-canaux (idempotent).
INSERT INTO public.mra_reminder_rules (type, offset_days, canal, message_tpl) VALUES
  (NULL, -15, 'dashboard', '{type} {periode} à préparer — échéance {echeance} ({jours}j)'),
  (NULL,  -7, 'telegram',  '📌 {type} {periode} à déclarer dans {jours}j — {montant} MUR (échéance {echeance})'),
  (NULL,  -3, 'telegram',  '⏰ {type} {periode} : échéance {echeance} dans {jours}j — {montant} MUR'),
  (NULL,  -3, 'email',     'Rappel {type} {periode} — à reverser {montant} MUR avant le {echeance}'),
  (NULL,  -1, 'telegram',  '🚨 {type} {periode} : échéance DEMAIN ({echeance}) — {montant} MUR'),
  (NULL,   0, 'telegram',  '🚨 {type} {periode} : échéance AUJOURD''HUI — {montant} MUR'),
  (NULL,   1, 'telegram',  '⛔ {type} {periode} EN RETARD (échéance {echeance}) — {montant} MUR à régulariser'),
  (NULL,   3, 'email',     'URGENT — {type} {periode} en retard depuis le {echeance} ({montant} MUR)')
ON CONFLICT DO NOTHING;

-- ── 3. Journal d'envoi des rappels (anti-doublon) ────────────────────
CREATE TABLE IF NOT EXISTS public.mra_reminder_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  declaration_id  UUID NOT NULL REFERENCES public.mra_declarations(id) ON DELETE CASCADE,
  rule_id         UUID REFERENCES public.mra_reminder_rules(id) ON DELETE SET NULL,
  canal           TEXT NOT NULL,
  offset_days     INT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- un rappel donné (declaration + offset + canal) ne part qu'une fois
  UNIQUE (declaration_id, offset_days, canal)
);
CREATE INDEX IF NOT EXISTS idx_mra_reminder_log_decl
  ON public.mra_reminder_log (declaration_id);

-- ── 4. Helper : date d'échéance par type pour une période YYYY-MM ─────
CREATE OR REPLACE FUNCTION public.mra_echeance(p_type TEXT, p_periode TEXT)
RETURNS DATE LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_year INT; v_month INT; v_next DATE; v_last DATE;
BEGIN
  -- Annuel : périodes 'YYYY'
  IF p_type IN ('CIT','IT_FORM3','APS') THEN
    v_year := SPLIT_PART(p_periode, '-', 1)::INT;
    IF p_type = 'IT_FORM3' THEN RETURN make_date(v_year, 8, 15); END IF;     -- 15 août N+1
    IF p_type = 'CIT'      THEN RETURN make_date(v_year + 1, 6, 30); END IF; -- ~6 mois après clôture
    RETURN make_date(v_year, 12, 31);
  END IF;
  -- Mensuel : périodes 'YYYY-MM' → mois suivant
  v_year  := SPLIT_PART(p_periode, '-', 1)::INT;
  v_month := SPLIT_PART(p_periode, '-', 2)::INT;
  v_next  := make_date(v_year, v_month, 1) + INTERVAL '1 month';
  v_last  := (v_next + INTERVAL '1 month - 1 day')::DATE;  -- dernier jour du mois suivant
  -- PAYE / TDS / TVA : le 20 du mois suivant. CSG / NSF : fin du mois suivant.
  IF p_type IN ('PAYE','TDS','TVA') THEN
    RETURN (v_next + INTERVAL '19 days')::DATE;  -- le 20
  ELSE
    RETURN v_last;
  END IF;
END;
$$;

-- ── 5. RPC : (re)calcule les déclarations mensuelles d'une période ───
-- Upsert idempotent. Ne touche PAS le statut si déjà declare/paye (on ne
-- réécrit que montant_du tant que la déclaration est en auto/a_faire).
CREATE OR REPLACE FUNCTION public.mra_compute_period(p_societe_id UUID, p_periode TEXT)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_start DATE; v_end DATE; v_count INT := 0;
  v_paye NUMERIC; v_csg_sal NUMERIC; v_csg_pat NUMERIC;
  v_nsf_sal NUMERIC; v_nsf_pat NUMERIC;
  v_tds NUMERIC; v_tds_nb INT;
  v_tva NUMERIC;
BEGIN
  v_start := (p_periode || '-01')::DATE;
  v_end   := (v_start + INTERVAL '1 month - 1 day')::DATE;

  -- Montants paie depuis le journal OD-PAIE (crédits des comptes MRA)
  SELECT
    COALESCE(SUM(credit_mur) FILTER (WHERE numero_compte = '4330'), 0),
    COALESCE(SUM(credit_mur) FILTER (WHERE numero_compte = '4311'), 0),
    COALESCE(SUM(credit_mur) FILTER (WHERE numero_compte = '4321'), 0),
    COALESCE(SUM(credit_mur) FILTER (WHERE numero_compte = '4312'), 0),
    COALESCE(SUM(credit_mur) FILTER (WHERE numero_compte = '4322'), 0)
  INTO v_paye, v_csg_sal, v_csg_pat, v_nsf_sal, v_nsf_pat
  FROM public.ecritures_comptables_v2
  WHERE societe_id = p_societe_id
    AND journal = 'OD-PAIE'
    AND date_ecriture BETWEEN v_start AND v_end;

  -- TDS depuis les factures fournisseurs de la période de remise
  SELECT COALESCE(SUM(tds_amount_mur), 0), COUNT(*) FILTER (WHERE COALESCE(tds_amount_mur,0) > 0)
  INTO v_tds, v_tds_nb
  FROM public.factures
  WHERE societe_id = p_societe_id
    AND COALESCE(tds_period, TO_CHAR(date_facture, 'YYYY-MM')) = p_periode
    AND COALESCE(tds_amount_mur, 0) > 0;

  -- TVA : si une table tva_mensuelle existe (best-effort, ignore si absente)
  v_tva := 0;
  BEGIN
    EXECUTE format(
      'SELECT COALESCE(SUM(tva_nette), 0) FROM public.tva_mensuelle WHERE societe_id = $1 AND periode = $2'
    ) INTO v_tva USING p_societe_id, p_periode;
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_tva := 0;
  END;

  -- Upsert helper inline via VALUES list
  -- PAYE
  PERFORM public._mra_upsert(p_societe_id, 'PAYE', p_periode, v_paye,
    jsonb_build_object('source','OD-PAIE'));
  -- CSG (salarié + patronal)
  PERFORM public._mra_upsert(p_societe_id, 'CSG', p_periode, v_csg_sal + v_csg_pat,
    jsonb_build_object('csg_salarie', v_csg_sal, 'csg_patronal', v_csg_pat));
  -- NSF (salarié + patronal)
  PERFORM public._mra_upsert(p_societe_id, 'NSF', p_periode, v_nsf_sal + v_nsf_pat,
    jsonb_build_object('nsf_salarie', v_nsf_sal, 'nsf_patronal', v_nsf_pat));
  -- TDS
  PERFORM public._mra_upsert(p_societe_id, 'TDS', p_periode, v_tds,
    jsonb_build_object('nb_factures', v_tds_nb));
  -- TVA (seulement si > 0 pour éviter du bruit)
  IF v_tva <> 0 THEN
    PERFORM public._mra_upsert(p_societe_id, 'TVA', p_periode, v_tva,
      jsonb_build_object('source','tva_mensuelle'));
  END IF;

  v_count := 5;
  RETURN v_count;
END;
$$;

-- Helper d'upsert : crée/maj la déclaration, sans écraser un statut avancé.
CREATE OR REPLACE FUNCTION public._mra_upsert(
  p_societe_id UUID, p_type TEXT, p_periode TEXT, p_montant NUMERIC, p_meta JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_ech DATE;
BEGIN
  v_ech := public.mra_echeance(p_type, p_periode);
  INSERT INTO public.mra_declarations
    (societe_id, type, periode, date_echeance, montant_du, statut, meta)
  VALUES
    (p_societe_id, p_type, p_periode, v_ech, ROUND(p_montant, 2),
     CASE WHEN p_montant > 0 THEN 'a_faire' ELSE 'sans_objet' END, p_meta)
  ON CONFLICT (societe_id, type, periode) DO UPDATE SET
    -- On ne réécrit le montant/échéance/meta QUE si la déclaration n'est pas
    -- encore traitée (auto / a_faire / sans_objet). Si declare/paye/retard,
    -- on n'écrase rien (sauf échéance qui reste stable).
    montant_du   = CASE WHEN public.mra_declarations.statut IN ('auto','a_faire','sans_objet')
                        THEN ROUND(p_montant, 2) ELSE public.mra_declarations.montant_du END,
    date_echeance= v_ech,
    meta         = CASE WHEN public.mra_declarations.statut IN ('auto','a_faire','sans_objet')
                        THEN p_meta ELSE public.mra_declarations.meta END,
    statut       = CASE
                     WHEN public.mra_declarations.statut IN ('declare','paye') THEN public.mra_declarations.statut
                     WHEN p_montant > 0 THEN 'a_faire'
                     ELSE 'sans_objet'
                   END,
    updated_at   = NOW();
END;
$$;

-- ── 6. Vue statut de conformité (matrice mois × type) ────────────────
CREATE OR REPLACE VIEW public.vw_mra_compliance_status AS
SELECT
  d.*,
  (d.date_echeance - CURRENT_DATE) AS jours_restants,
  CASE
    WHEN d.statut IN ('paye','sans_objet') THEN d.statut
    WHEN d.statut = 'declare' AND d.date_echeance < CURRENT_DATE THEN 'declare'
    WHEN d.date_echeance < CURRENT_DATE THEN 'retard'
    WHEN d.date_echeance - CURRENT_DATE <= 3 THEN 'urgent'
    WHEN d.date_echeance - CURRENT_DATE <= 15 THEN 'bientot'
    ELSE 'futur'
  END AS priorite
FROM public.mra_declarations d;

DO $$ BEGIN
  RAISE NOTICE '[457] MRA Compliance Hub : mra_declarations + reminder_rules + reminder_log + mra_compute_period + vw_mra_compliance_status créés.';
END $$;
