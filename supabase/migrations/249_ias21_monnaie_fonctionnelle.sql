-- ============================================================================
-- Migration 249 — Phase A.1 GBC : Monnaie fonctionnelle IAS 21 §38-49
-- ============================================================================
--
-- Problème actuel :
-- Lexora suppose MUR comme monnaie de tenue de comptes. Pour une Global
-- Business Company (GBC) qui opère en USD/EUR, c'est faux (IAS 21 §9-14).
-- La monnaie fonctionnelle est celle de l'environnement économique principal
-- de l'entité — pour une GBC1 holding internationale, c'est USD le plus
-- souvent.
--
-- Cette migration met en place le SOCLE technique pour gérer une monnaie
-- fonctionnelle ≠ MUR :
--
--   1. societes.devise_fonctionnelle (default 'MUR' — pas de breaking change)
--   2. Colonnes "fonctionnelle" sur ecritures_comptables_v2 :
--      • debit_fonctionnelle / credit_fonctionnelle = montant dans la
--        devise de l'entité (= comptabilité primaire)
--      • taux_fonct_vers_mur = taux utilisé pour traduire en MUR (reporting
--        fiscal MRA toujours en MUR)
--      • devise_origine = devise dans laquelle la transaction a eu lieu
--        (peut être différente de fonctionnelle si transaction tierce devise)
--   3. Compte 1078 — Écart de conversion (CTA = Cumulative Translation
--      Adjustment) pour comptabiliser les écarts de translation IAS 21 §39
--   4. RPC ias21_classify_account(numero_compte) → 'monetary' | 'non_monetary'
--      | 'pnl' | 'equity' pour appliquer le bon taux
--   5. RPC ias21_compute_cta(societe_id, exercice) qui calcule l'écart de
--      conversion à constater en OCI (Other Comprehensive Income)
--
-- BACKWARD COMPATIBLE : toutes les colonnes ajoutées sont NULLABLE. Les
-- sociétés existantes ont devise_fonctionnelle='MUR' → aucun impact sur
-- les calculs MUR existants.
--
-- IDEMPOTENTE : peut être rejouée sans effet de bord.
-- ============================================================================

-- ── 1. Colonne devise_fonctionnelle sur societes ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'societes' AND column_name = 'devise_fonctionnelle'
  ) THEN
    ALTER TABLE public.societes
      ADD COLUMN devise_fonctionnelle TEXT NOT NULL DEFAULT 'MUR';

    -- Contrainte : ISO 4217 (3 lettres uppercase) — accepte les principales
    -- devises GBC + extensibilité future.
    ALTER TABLE public.societes
      ADD CONSTRAINT societes_devise_fonctionnelle_check
      CHECK (devise_fonctionnelle ~ '^[A-Z]{3}$');
  END IF;
END $$;

COMMENT ON COLUMN public.societes.devise_fonctionnelle IS
  'Monnaie fonctionnelle de l''entité au sens IAS 21 §9 (devise de l''environnement '
  'économique principal). Par défaut MUR pour les PME domestiques. Pour les GBC, '
  'typiquement USD, EUR, GBP, ZAR. Code ISO 4217 (3 lettres).';

-- ── 2. Colonnes fonctionnelle sur ecritures_comptables_v2 ───────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecritures_comptables_v2' AND column_name = 'debit_fonctionnelle'
  ) THEN
    ALTER TABLE public.ecritures_comptables_v2
      ADD COLUMN debit_fonctionnelle  NUMERIC(15,2),
      ADD COLUMN credit_fonctionnelle NUMERIC(15,2),
      ADD COLUMN devise_origine       TEXT,
      ADD COLUMN taux_fonct_vers_mur  NUMERIC(15,8);

    -- Backfill : pour les sociétés MUR, fonctionnelle = MUR, taux = 1
    UPDATE public.ecritures_comptables_v2 e
       SET debit_fonctionnelle  = e.debit_mur,
           credit_fonctionnelle = e.credit_mur,
           devise_origine       = 'MUR',
           taux_fonct_vers_mur  = 1
      FROM public.societes s
     WHERE e.societe_id = s.id
       AND COALESCE(s.devise_fonctionnelle, 'MUR') = 'MUR';
  END IF;
END $$;

COMMENT ON COLUMN public.ecritures_comptables_v2.debit_fonctionnelle IS
  'Débit dans la monnaie fonctionnelle de la société (IAS 21). Pour une société '
  'MUR-only, égal à debit_mur. Pour une GBC USD, c''est le montant USD.';
COMMENT ON COLUMN public.ecritures_comptables_v2.credit_fonctionnelle IS
  'Crédit dans la monnaie fonctionnelle de la société (IAS 21).';
COMMENT ON COLUMN public.ecritures_comptables_v2.devise_origine IS
  'Devise dans laquelle la transaction a eu lieu (peut différer de la devise '
  'fonctionnelle, ex: GBC USD qui paie en EUR). Code ISO 4217.';
COMMENT ON COLUMN public.ecritures_comptables_v2.taux_fonct_vers_mur IS
  'Taux de change utilisé pour translater le montant fonctionnel vers MUR au '
  'moment de l''écriture (closing rate pour items monétaires, historique pour '
  'non-monétaires, transaction rate pour P&L). Voir ias21_classify_account().';

-- ── 3. Compte 1078 — Cumulative Translation Adjustment (CTA) ────────────────
INSERT INTO public.plan_comptable (compte, libelle, type_compte, sens_normal, compte_parent, niveau)
VALUES (
  '1078',
  'Écart de conversion (CTA) — IAS 21',
  'capitaux_propres',
  'C',
  '107',
  4
)
ON CONFLICT (compte) DO UPDATE
  SET libelle = EXCLUDED.libelle,
      type_compte = EXCLUDED.type_compte,
      sens_normal = EXCLUDED.sens_normal;

COMMENT ON TABLE public.plan_comptable IS
  'Plan Comptable Mauricien (PCM) avec extensions IFRS for SMEs / Full IFRS. '
  'Compte 1078 ajouté pour la translation IAS 21 (Phase A monnaie fonctionnelle GBC).';

-- ── 4. RPC : classification IAS 21 par numéro de compte ─────────────────────
CREATE OR REPLACE FUNCTION public.ias21_classify_account(p_numero_compte TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  -- IAS 21 §23 — Items monétaires (closing rate à la translation) :
  --   • Trésorerie : 51, 52, 53, 54
  --   • Créances : 41, 411, 416, 417, 418
  --   • Dettes commerciales : 40, 401, 403, 408, 409
  --   • Dettes fiscales / sociales : 43, 44
  --   • Emprunts : 16, 17
  --   • Comptes courants associés : 45, 46 (partiel — voir below)
  IF p_numero_compte LIKE '5%'  -- Trésorerie (classe 5 entière)
     OR p_numero_compte LIKE '40%' OR p_numero_compte LIKE '41%'
     OR p_numero_compte LIKE '42%' OR p_numero_compte LIKE '43%'
     OR p_numero_compte LIKE '44%'
     OR p_numero_compte LIKE '16%' OR p_numero_compte LIKE '17%'
     OR p_numero_compte LIKE '46%'
  THEN
    RETURN 'monetary';
  END IF;

  -- Capitaux propres (sauf 1078 lui-même) — taux historique
  IF p_numero_compte LIKE '10%' OR p_numero_compte LIKE '11%'
     OR p_numero_compte LIKE '12%' OR p_numero_compte LIKE '13%'
     OR p_numero_compte LIKE '14%' OR p_numero_compte LIKE '15%'
  THEN
    -- Le compte 1078 (CTA) lui-même est le résultat de la translation
    -- — on le traite comme "equity_cta" pour ne pas le re-translater
    IF p_numero_compte = '1078' THEN
      RETURN 'equity_cta';
    END IF;
    RETURN 'equity';
  END IF;

  -- IAS 21 §23 — Items non monétaires (taux historique à la translation) :
  --   • Immobilisations : 2
  --   • Stocks : 3
  --   • Charges constatées d'avance : 486
  --   • Produits constatés d'avance : 487
  IF p_numero_compte LIKE '2%' OR p_numero_compte LIKE '3%' THEN
    RETURN 'non_monetary';
  END IF;

  -- P&L (taux de transaction ou moyen) :
  --   • Charges : 6
  --   • Produits : 7
  --   • Comptes spéciaux 8 : généralement pas dans le P&L mais on les
  --     classe pnl par défaut
  IF p_numero_compte LIKE '6%' OR p_numero_compte LIKE '7%'
     OR p_numero_compte LIKE '8%'
  THEN
    RETURN 'pnl';
  END IF;

  -- Comptes d'attente / autres
  RETURN 'other';
END;
$$;

COMMENT ON FUNCTION public.ias21_classify_account IS
  'Classifie un compte du PCM selon IAS 21 §23 pour déterminer le taux de change '
  'à appliquer lors de la translation : monetary (closing rate), non_monetary '
  '(historical rate), pnl (transaction/average rate), equity (historical), '
  'equity_cta (résultat de la translation, pas re-translaté).';

-- ── 5. RPC : compute CTA — calcule l'écart de conversion à constater ────────
-- Pour une société dont la devise fonctionnelle ≠ MUR, après translation MUR
-- de tous les éléments à leur taux approprié (closing pour monétaires,
-- historique pour non-monétaires, transaction pour P&L), il subsiste un
-- écart parce que les taux ne sont pas tous identiques. Cet écart va en OCI
-- (Other Comprehensive Income) — compte 1078 — au lieu du P&L.
--
-- Note : cette RPC est un OUTIL DE CONTRÔLE / RECALCUL. La translation
-- réelle s'opère lors de la création des écritures (côté API). Cette fonction
-- détecte les déséquilibres après translation.
CREATE OR REPLACE FUNCTION public.ias21_compute_cta(
  p_societe_id UUID,
  p_date_cloture DATE DEFAULT CURRENT_DATE,
  p_closing_rate NUMERIC DEFAULT NULL  -- taux fonctionnelle→MUR au p_date_cloture
) RETURNS TABLE (
  total_debit_mur            NUMERIC,
  total_credit_mur           NUMERIC,
  ecart_translation_mur      NUMERIC,
  total_debit_fonctionnelle  NUMERIC,
  total_credit_fonctionnelle NUMERIC,
  ecart_fonctionnelle        NUMERIC,
  devise_fonctionnelle       TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_devise_fonct TEXT;
BEGIN
  SELECT s.devise_fonctionnelle INTO v_devise_fonct
    FROM public.societes s WHERE s.id = p_societe_id;

  IF v_devise_fonct IS NULL THEN
    RAISE EXCEPTION 'Société % introuvable', p_societe_id;
  END IF;

  -- Si MUR-only, pas de CTA possible (par définition)
  IF v_devise_fonct = 'MUR' THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 'MUR'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(e.debit_mur), 0)             AS total_debit_mur,
    COALESCE(SUM(e.credit_mur), 0)            AS total_credit_mur,
    -- En théorie, après translation correcte : debit_mur ≠ credit_mur en
    -- raison des taux différents par classe. Cet écart = CTA à constater.
    COALESCE(SUM(e.debit_mur) - SUM(e.credit_mur), 0) AS ecart_translation_mur,
    COALESCE(SUM(e.debit_fonctionnelle), 0)   AS total_debit_fonctionnelle,
    COALESCE(SUM(e.credit_fonctionnelle), 0)  AS total_credit_fonctionnelle,
    -- En fonctionnelle, la balance DOIT être à zéro (sinon erreur comptable)
    COALESCE(SUM(e.debit_fonctionnelle) - SUM(e.credit_fonctionnelle), 0) AS ecart_fonctionnelle,
    v_devise_fonct AS devise_fonctionnelle
  FROM public.ecritures_comptables_v2 e
  WHERE e.societe_id = p_societe_id
    AND e.date_ecriture <= p_date_cloture;
END;
$$;

COMMENT ON FUNCTION public.ias21_compute_cta IS
  'Calcule l''écart de conversion (CTA) pour une société à une date donnée. '
  'L''écart de translation MUR doit être passé en OCI sur le compte 1078. '
  'L''écart fonctionnelle doit être ~0 (sinon erreur comptable). À utiliser '
  'en clôture mensuelle ou annuelle pour générer l''écriture CTA.';

-- ── 6. Vue : santé des sociétés multi-devises ──────────────────────────────
CREATE OR REPLACE VIEW public.vw_ias21_societes_multi_devises AS
SELECT
  s.id               AS societe_id,
  s.raison_sociale,
  s.devise_fonctionnelle,
  COUNT(e.id)        AS nb_ecritures,
  ROUND(SUM(COALESCE(e.debit_fonctionnelle, 0)),  2) AS total_debit_fonctionnelle,
  ROUND(SUM(COALESCE(e.credit_fonctionnelle, 0)), 2) AS total_credit_fonctionnelle,
  ROUND(SUM(COALESCE(e.debit_fonctionnelle, 0)) - SUM(COALESCE(e.credit_fonctionnelle, 0)), 2) AS ecart_fonctionnelle,
  ROUND(SUM(COALESCE(e.debit_mur, 0)),  2)  AS total_debit_mur,
  ROUND(SUM(COALESCE(e.credit_mur, 0)), 2)  AS total_credit_mur,
  ROUND(SUM(COALESCE(e.debit_mur, 0)) - SUM(COALESCE(e.credit_mur, 0)), 2) AS cta_potentiel_mur,
  COUNT(DISTINCT e.devise_origine) AS nb_devises_origine
FROM public.societes s
LEFT JOIN public.ecritures_comptables_v2 e ON e.societe_id = s.id
WHERE COALESCE(s.devise_fonctionnelle, 'MUR') <> 'MUR'
GROUP BY s.id, s.raison_sociale, s.devise_fonctionnelle;

COMMENT ON VIEW public.vw_ias21_societes_multi_devises IS
  'Vue de monitoring pour les sociétés à monnaie fonctionnelle non-MUR (GBC). '
  'Permet de détecter rapidement les écarts CTA potentiels et les déséquilibres '
  'en monnaie fonctionnelle (qui devraient être à zéro).';

-- ── 7. Rapport ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_societes_mur INT;
  v_societes_fx  INT;
BEGIN
  SELECT COUNT(*) INTO v_societes_mur FROM public.societes WHERE devise_fonctionnelle = 'MUR';
  SELECT COUNT(*) INTO v_societes_fx  FROM public.societes WHERE devise_fonctionnelle <> 'MUR';

  RAISE NOTICE '──────────────────────────────────────────────────────';
  RAISE NOTICE '✓ Migration 249 — Phase A.1 monnaie fonctionnelle IAS 21';
  RAISE NOTICE '  • societes.devise_fonctionnelle ajoutée (default MUR)';
  RAISE NOTICE '  • % sociétés en MUR, % sociétés en devise étrangère', v_societes_mur, v_societes_fx;
  RAISE NOTICE '  • ecritures_comptables_v2 : 4 colonnes ajoutées (debit/credit_fonctionnelle, devise_origine, taux_fonct_vers_mur)';
  RAISE NOTICE '  • Compte 1078 (CTA) ajouté au plan_comptable';
  RAISE NOTICE '  • RPC : ias21_classify_account, ias21_compute_cta';
  RAISE NOTICE '  • Vue : vw_ias21_societes_multi_devises';
  RAISE NOTICE 'Backward compatible : pas d''impact sur les sociétés MUR-only.';
  RAISE NOTICE '──────────────────────────────────────────────────────';
END $$;
