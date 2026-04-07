-- Add aliases column to societes table for OCR name matching
ALTER TABLE societes ADD COLUMN IF NOT EXISTS aliases text[] DEFAULT '{}';

-- Populate known aliases for existing sociétés
UPDATE societes SET aliases = ARRAY[
  'Digital Data', 'DDS',
  'DIGITAL DATA SOL LTD',
  'DIGITAL DATA SOLUTION LTD',
  'DIGITAL DATA SOLUTIONS'
] WHERE brn = 'C20173522' AND (aliases IS NULL OR aliases = '{}');

UPDATE societes SET aliases = ARRAY[
  'Obesity Care', 'OCC',
  'OBESITY CARE CLINIC',
  'OBESITY CARE CLINIC LTD'
] WHERE brn = 'C22187118' AND (aliases IS NULL OR aliases = '{}');
