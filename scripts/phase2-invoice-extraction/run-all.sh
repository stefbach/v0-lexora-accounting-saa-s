#!/bin/bash
###############################################################################
# PHASE 2, Task 2C — Invoice Extraction Agent — Master Runner
#
# Exécute les 4 extractions de factures dans l'ordre:
# 1. Complete Invoice Register (12 months)
# 2. Invoice-to-GL Traceability (50-sample test)
# 3. MRA Invoice Compliance Check
# 4. Outstanding Invoices Aging Analysis
#
# Usage: bash scripts/phase2-invoice-extraction/run-all.sh
###############################################################################

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "PHASE 2, Task 2C — Invoice Extraction Agent"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check environment variables
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "ERROR: Missing environment variables:"
  echo "  - NEXT_PUBLIC_SUPABASE_URL"
  echo "  - SUPABASE_SERVICE_ROLE_KEY"
  echo ""
  echo "Please set these in your .env.local and export them:"
  echo "  export NEXT_PUBLIC_SUPABASE_URL=..."
  echo "  export SUPABASE_SERVICE_ROLE_KEY=..."
  exit 1
fi

# Create exports directory
mkdir -p exports

echo "📋 [1/4] Extracting Complete Invoice Register (12 months)..."
npx ts-node scripts/phase2-invoice-extraction/extract-complete-register.ts
echo ""

echo "📊 [2/4] Extracting GL Traceability (50-sample test)..."
npx ts-node scripts/phase2-invoice-extraction/extract-gl-traceability.ts
echo ""

echo "✓ [3/4] Checking MRA Invoice Compliance..."
npx ts-node scripts/phase2-invoice-extraction/check-mra-compliance.ts
echo ""

echo "📅 [4/4] Extracting Outstanding Invoices Aging Analysis..."
npx ts-node scripts/phase2-invoice-extraction/extract-aging-analysis.ts
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "✓ All extractions completed successfully!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Exported files:"
ls -lh exports/INVOICE_* exports/AGING_* 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
echo ""
echo "Next steps:"
echo "  1. Review all exported files in the /exports directory"
echo "  2. Validate GL traceability in Excel workbook"
echo "  3. Address any MRA compliance issues found"
echo "  4. Develop collection strategy for aging invoices"
echo ""
