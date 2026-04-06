-- ═══════════════════════════════════════════════════════════════════
-- Migration 115: Payroll Lock Workflow
-- Adds verrouillage (locking) system to bulletins_paie
-- Once locked, bulletins cannot be modified
-- ═══════════════════════════════════════════════════════════════════

-- Add lock fields to bulletins_paie
ALTER TABLE bulletins_paie ADD COLUMN IF NOT EXISTS verrouille BOOLEAN DEFAULT FALSE;
ALTER TABLE bulletins_paie ADD COLUMN IF NOT EXISTS date_verrouillage TIMESTAMPTZ;
ALTER TABLE bulletins_paie ADD COLUMN IF NOT EXISTS verrouille_par UUID;
ALTER TABLE bulletins_paie ADD COLUMN IF NOT EXISTS date_validation TIMESTAMPTZ;
ALTER TABLE bulletins_paie ADD COLUMN IF NOT EXISTS valide_par UUID;

-- Payroll period lock table — locks an entire period for a société
CREATE TABLE IF NOT EXISTS paie_periodes_lock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES societes(id),
  periode DATE NOT NULL,
  -- Workflow steps
  planning_valide BOOLEAN DEFAULT FALSE,
  pointage_valide BOOLEAN DEFAULT FALSE,
  ot_valide BOOLEAN DEFAULT FALSE,
  primes_validees BOOLEAN DEFAULT FALSE,
  bulletins_generes BOOLEAN DEFAULT FALSE,
  bulletins_valides BOOLEAN DEFAULT FALSE,
  verrouille BOOLEAN DEFAULT FALSE,
  -- Post-lock
  virements_generes BOOLEAN DEFAULT FALSE,
  mra_declare BOOLEAN DEFAULT FALSE,
  comptabilise BOOLEAN DEFAULT FALSE,
  -- Audit
  date_verrouillage TIMESTAMPTZ,
  verrouille_par UUID,
  date_creation TIMESTAMPTZ DEFAULT NOW(),
  date_modification TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  UNIQUE(societe_id, periode)
);

-- Audit log for payroll actions
CREATE TABLE IF NOT EXISTS paie_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL,
  periode DATE NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'calcul', 'validation', 'verrouillage', 'deverrouillage', 'export_banque', 'export_mra', 'comptabilisation'
  user_id UUID,
  user_email TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_paie_periodes_lock_societe ON paie_periodes_lock(societe_id, periode);
CREATE INDEX IF NOT EXISTS idx_paie_audit_log_societe ON paie_audit_log(societe_id, periode);
CREATE INDEX IF NOT EXISTS idx_bulletins_verrouille ON bulletins_paie(verrouille) WHERE verrouille = TRUE;
