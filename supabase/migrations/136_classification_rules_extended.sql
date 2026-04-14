-- ─────────────────────────────────────────────────────────────────────
-- Migration 136 — Règles de classification étendues
-- Ajoute les patterns manquants observés en production :
--   - MASTERCARD / MERCHANT DISCOUNT (frais carte)
--   - IB STANDARD PAYMENT avec MyT/CELLPLUS/MAURITIUS TELECOM (paiements fournisseurs)
--   - IB ACCOUNT TRANSFER EPAY (E-Payroll via IB transfer)
--   - INWARD TRANSFER sans ROC (encaissements génériques)
-- ─────────────────────────────────────────────────────────────────────

-- R02 étendu : frais bancaires + mastercard + merchant
INSERT INTO public.classification_rules (
  rule_code, priority, pattern_libelle, pattern_tiers,
  classification, compte_debit, compte_credit, libelle_template
) VALUES
  (
    'R02_MASTERCARD_FEES', 21,
    'merchant discount|mastercard.*fee|visa.*fee|card.*discount|card repayment|atm withdrawal charge',
    'mastercard|visa|mcb.*card|card',
    'Frais carte bancaire',
    '627100', '512',
    'Frais carte {{tiers}} — {{date}}'
  ),
  (
    'R02_STAMP_DUTY', 22,
    'stamp duty|droit de timbre',
    NULL,
    'Droits de timbre',
    '635100', '512',
    'Droits de timbre — {{date}}'
  ),
  (
    'R02_SWIFT_CHARGE', 23,
    'swift charge|outward transfer charge|bank charge|bank commission|cable charge',
    NULL,
    'Commissions bancaires (SWIFT)',
    '627200', '512',
    'Frais SWIFT — {{date}}'
  ),
  -- R04 étendu : E-Payroll via IB Transfer
  (
    'R04_EPAYROLL_IB', 44,
    'ib account transfer.*epay|ib standard payment.*epay',
    'e-payroll|epayroll|epay',
    'Charges sociales (E-Payroll via IB)',
    '431100', '512',
    'E-Payroll (IB) — {{date}}'
  ),
  -- R06 : paiements IB STANDARD PAYMENT avec fournisseur télécom/cloud identifié
  (
    'R06_IB_TELECOM', 60,
    'ib standard payment',
    'myt|mauritius telecom|cellplus|emtel',
    'Paiement fournisseur télécom',
    '401',  '512',
    'Paiement {{tiers}} — {{date}}'
  ),
  (
    'R06_IB_GOOGLE', 61,
    'ib standard payment|outward transfer',
    'google|amazon|microsoft|cloudflare',
    'Paiement fournisseur cloud',
    '401', '512',
    'Paiement {{tiers}} — {{date}}'
  )
ON CONFLICT (rule_code) DO NOTHING;
