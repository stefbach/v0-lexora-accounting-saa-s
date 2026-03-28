-- ============================================================
-- LEXORA — Migration 021: Grand Livre, Balance, États Financiers
-- Sprint 4 — Vues comptables + Table exercices fiscaux
-- ============================================================

-- ============================================================
-- 1. TABLE EXERCICES FISCAUX
-- ============================================================
CREATE TABLE IF NOT EXISTS public.exercices_fiscaux (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID REFERENCES public.societes(id) ON DELETE CASCADE NOT NULL,
  annee TEXT NOT NULL,                     -- ex: FY2024-2025
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  statut TEXT DEFAULT 'ouvert' CHECK (statut IN ('ouvert', 'cloture')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(societe_id, annee)
);

CREATE INDEX IF NOT EXISTS idx_exercices_societe ON public.exercices_fiscaux(societe_id);
CREATE INDEX IF NOT EXISTS idx_exercices_statut  ON public.exercices_fiscaux(statut);

ALTER TABLE public.exercices_fiscaux ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage exercices" ON public.exercices_fiscaux FOR ALL
  USING (public.get_my_role() IN ('admin'));

CREATE POLICY "Comptables manage exercices" ON public.exercices_fiscaux FOR ALL
  USING (public.get_my_role() IN ('comptable', 'comptable_dedie'));

-- ============================================================
-- 2. VUE GRAND LIVRE V2
-- Agrège ecritures_comptables_v2 avec solde cumulatif par compte
-- ============================================================
DROP VIEW IF EXISTS public.grand_livre_v2 CASCADE;

CREATE OR REPLACE VIEW public.grand_livre_v2 AS
SELECT
  e.id,
  e.societe_id,
  e.date_ecriture,
  e.journal,
  e.ref_folio,
  e.numero_compte,
  COALESCE(e.nom_compte, pc.libelle, e.numero_compte) AS libelle,
  e.description,
  e.debit_mur,
  e.credit_mur,
  e.document_id,
  e.exercice,
  -- Solde cumulatif par compte, trié par date puis par id (stabilité)
  SUM(e.debit_mur - e.credit_mur) OVER (
    PARTITION BY e.societe_id, e.numero_compte
    ORDER BY e.date_ecriture, e.id
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS solde_cumulatif,
  -- Solde total du compte (pour détecter sens anormal)
  SUM(e.debit_mur - e.credit_mur) OVER (
    PARTITION BY e.societe_id, e.numero_compte
  ) AS solde_compte,
  COALESCE(pc.type_compte,
    CASE
      WHEN LEFT(e.numero_compte, 1) IN ('1','2','3','4','5') THEN 'bilan'
      WHEN LEFT(e.numero_compte, 1) = '6' THEN 'charge'
      WHEN LEFT(e.numero_compte, 1) = '7' THEN 'produit'
      ELSE 'autre'
    END
  ) AS type_compte,
  COALESCE(pc.sens_normal,
    CASE
      WHEN LEFT(e.numero_compte, 1) IN ('1','4','5') THEN 'C'
      WHEN LEFT(e.numero_compte, 1) IN ('2','3','6') THEN 'D'
      WHEN LEFT(e.numero_compte, 1) = '7' THEN 'C'
      ELSE 'D'
    END
  ) AS sens_normal
FROM public.ecritures_comptables_v2 e
LEFT JOIN public.plan_comptable pc
  ON pc.compte = e.numero_compte
  AND (pc.societe_id = e.societe_id OR pc.societe_id IS NULL);

-- ============================================================
-- 3. VUE BALANCE COMPTES
-- Agrège par numero_compte → total_debit, total_credit, solde, type
-- ============================================================
DROP VIEW IF EXISTS public.balance_comptes CASCADE;

CREATE OR REPLACE VIEW public.balance_comptes AS
SELECT
  e.societe_id,
  e.numero_compte,
  COALESCE(pc.libelle, e.nom_compte, e.numero_compte) AS libelle,
  LEFT(e.numero_compte, 1)                             AS classe,
  CASE LEFT(e.numero_compte, 1)
    WHEN '1' THEN 'Capitaux propres'
    WHEN '2' THEN 'Immobilisations'
    WHEN '3' THEN 'Stocks'
    WHEN '4' THEN 'Tiers'
    WHEN '5' THEN 'Finances'
    WHEN '6' THEN 'Charges'
    WHEN '7' THEN 'Produits'
    ELSE 'Autres'
  END                                                  AS libelle_classe,
  COALESCE(pc.type_compte,
    CASE
      WHEN LEFT(e.numero_compte, 1) IN ('1','2','3','4','5') THEN 'bilan'
      WHEN LEFT(e.numero_compte, 1) = '6' THEN 'charge'
      WHEN LEFT(e.numero_compte, 1) = '7' THEN 'produit'
      ELSE 'autre'
    END
  )                                                    AS type_compte,
  COALESCE(pc.sens_normal,
    CASE
      WHEN LEFT(e.numero_compte, 1) IN ('1','4','5') THEN 'C'
      WHEN LEFT(e.numero_compte, 1) IN ('2','3','6') THEN 'D'
      WHEN LEFT(e.numero_compte, 1) = '7' THEN 'C'
      ELSE 'D'
    END
  )                                                    AS sens_normal,
  SUM(e.debit_mur)                                     AS total_debit,
  SUM(e.credit_mur)                                    AS total_credit,
  SUM(e.debit_mur) - SUM(e.credit_mur)                AS solde,
  TO_CHAR(e.date_ecriture, 'YYYY-MM')                  AS periode
FROM public.ecritures_comptables_v2 e
LEFT JOIN public.plan_comptable pc
  ON pc.compte = e.numero_compte
  AND (pc.societe_id = e.societe_id OR pc.societe_id IS NULL)
GROUP BY
  e.societe_id,
  e.numero_compte,
  pc.libelle,
  e.nom_compte,
  pc.type_compte,
  pc.sens_normal,
  TO_CHAR(e.date_ecriture, 'YYYY-MM');

-- ============================================================
-- 4. VUE P&L MENSUEL
-- CA (comptes 7xx) vs Charges (comptes 6xx) par mois
-- ============================================================
DROP VIEW IF EXISTS public.pnl_mensuel CASCADE;

CREATE OR REPLACE VIEW public.pnl_mensuel AS
WITH monthly AS (
  SELECT
    societe_id,
    TO_CHAR(date_ecriture, 'YYYY-MM') AS periode,
    -- CA : comptes 70x-75x (produits d'exploitation) → sens créditeur
    SUM(CASE WHEN LEFT(numero_compte, 2) BETWEEN '70' AND '75'
             THEN credit_mur - debit_mur ELSE 0 END) AS ca,
    -- Charges exploitation : comptes 60x-65x
    SUM(CASE WHEN LEFT(numero_compte, 2) BETWEEN '60' AND '65'
             THEN debit_mur - credit_mur ELSE 0 END) AS charges_exploitation,
    -- Dotations amortissements : comptes 68x
    SUM(CASE WHEN LEFT(numero_compte, 2) = '68'
             THEN debit_mur - credit_mur ELSE 0 END) AS dotations_amortissements,
    -- Produits financiers : comptes 76x-77x
    SUM(CASE WHEN LEFT(numero_compte, 2) BETWEEN '76' AND '77'
             THEN credit_mur - debit_mur ELSE 0 END) AS produits_financiers,
    -- Charges financières : comptes 66x-67x
    SUM(CASE WHEN LEFT(numero_compte, 2) BETWEEN '66' AND '67'
             THEN debit_mur - credit_mur ELSE 0 END) AS charges_financieres,
    -- IS : comptes 69x
    SUM(CASE WHEN LEFT(numero_compte, 2) = '69'
             THEN debit_mur - credit_mur ELSE 0 END) AS impot_societes
  FROM public.ecritures_comptables_v2
  GROUP BY societe_id, TO_CHAR(date_ecriture, 'YYYY-MM')
)
SELECT
  *,
  ca - charges_exploitation                              AS resultat_exploitation,
  ca - charges_exploitation + dotations_amortissements  AS ebitda,
  CASE WHEN ca > 0
       THEN ROUND(((ca - charges_exploitation) / ca) * 100, 2)
       ELSE 0
  END                                                    AS marge_exploitation_pct,
  ca - charges_exploitation + produits_financiers
    - charges_financieres - impot_societes               AS resultat_net
FROM monthly;

-- ============================================================
-- 5. VUE BILAN COMPTABLE
-- Actif (1xx-5xx solde débiteur) vs Passif+CP (solde créditeur)
-- ============================================================
DROP VIEW IF EXISTS public.bilan_comptable CASCADE;

CREATE OR REPLACE VIEW public.bilan_comptable AS
WITH agregats AS (
  SELECT
    societe_id,
    -- ACTIF NON COURANT
    SUM(CASE WHEN LEFT(numero_compte, 3) BETWEEN '210' AND '218'
             THEN debit_mur - credit_mur ELSE 0 END) AS immo_corporelles,
    SUM(CASE WHEN LEFT(numero_compte, 3) BETWEEN '200' AND '209'
             THEN debit_mur - credit_mur ELSE 0 END) AS immo_incorporelles,
    SUM(CASE WHEN LEFT(numero_compte, 3) BETWEEN '280' AND '289'
             THEN credit_mur - debit_mur ELSE 0 END) AS amortissements,
    SUM(CASE WHEN LEFT(numero_compte, 2) = '26' OR LEFT(numero_compte, 2) = '27'
             THEN debit_mur - credit_mur ELSE 0 END) AS immo_financieres,
    -- ACTIF COURANT
    SUM(CASE WHEN LEFT(numero_compte, 1) = '3'
             THEN debit_mur - credit_mur ELSE 0 END) AS stocks,
    SUM(CASE WHEN LEFT(numero_compte, 2) = '41'
             THEN debit_mur - credit_mur ELSE 0 END) AS creances_clients,
    SUM(CASE WHEN LEFT(numero_compte, 3) BETWEEN '408' AND '419'
             OR LEFT(numero_compte, 2) = '42'
             OR LEFT(numero_compte, 2) = '43'
             OR LEFT(numero_compte, 2) = '44'
             OR LEFT(numero_compte, 2) = '45'
             OR LEFT(numero_compte, 2) = '46'
             OR LEFT(numero_compte, 2) = '47'
             THEN debit_mur - credit_mur ELSE 0 END) AS autres_creances,
    SUM(CASE WHEN LEFT(numero_compte, 1) = '5'
             THEN debit_mur - credit_mur ELSE 0 END) AS tresorerie,
    -- CAPITAUX PROPRES
    SUM(CASE WHEN LEFT(numero_compte, 2) BETWEEN '10' AND '15'
             THEN credit_mur - debit_mur ELSE 0 END) AS capitaux_propres,
    -- DETTES LT
    SUM(CASE WHEN LEFT(numero_compte, 2) BETWEEN '16' AND '18'
             THEN credit_mur - debit_mur ELSE 0 END) AS dettes_lt,
    -- DETTES CT
    SUM(CASE WHEN LEFT(numero_compte, 2) = '40'
             THEN credit_mur - debit_mur ELSE 0 END) AS fournisseurs,
    SUM(CASE WHEN LEFT(numero_compte, 2) IN ('42','43','44','45')
             THEN credit_mur - debit_mur ELSE 0 END) AS dettes_fiscales_sociales,
    SUM(CASE WHEN LEFT(numero_compte, 2) IN ('46','47','48')
             THEN credit_mur - debit_mur ELSE 0 END) AS autres_dettes_ct
  FROM public.ecritures_comptables_v2
  GROUP BY societe_id
)
SELECT
  *,
  immo_corporelles + immo_incorporelles - amortissements + immo_financieres
                                                          AS total_actif_non_courant,
  stocks + creances_clients + autres_creances + tresorerie AS total_actif_courant,
  immo_corporelles + immo_incorporelles - amortissements + immo_financieres
    + stocks + creances_clients + autres_creances + tresorerie
                                                          AS total_actif,
  capitaux_propres + dettes_lt + fournisseurs + dettes_fiscales_sociales + autres_dettes_ct
                                                          AS total_passif
FROM agregats;
