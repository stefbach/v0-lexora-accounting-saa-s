#!/bin/bash

##############################################################################
# Intercompany Reconciliation CLI
# PHASE 5B - Weeks 9-10
#
# Usage:
#   ./run-intercompany-reconciliation.sh [start_date] [end_date] [export_dir]
#
# Examples:
#   # Full year 2025
#   ./run-intercompany-reconciliation.sh 2025-01-01 2025-12-31
#
#   # Specific period, export to custom directory
#   ./run-intercompany-reconciliation.sh 2025-01-01 2025-06-30 /tmp/audit
#
#   # Current year to date (auto)
#   ./run-intercompany-reconciliation.sh
#
##############################################################################

set -e

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3000}"
START_DATE="${1:-$(date -d "$(date +%Y)-01-01" '+%Y-%m-%d')}"
END_DATE="${2:-$(date '+%Y-%m-%d')}"
EXPORT_DIR="${3:-./exports}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Ensure export directory exists
mkdir -p "$EXPORT_DIR"

echo -e "${BLUE}==============================================================================${NC}"
echo -e "${BLUE}LEXORA Intercompany Reconciliation Agent${NC}"
echo -e "${BLUE}PHASE 5B - Weeks 9-10${NC}"
echo -e "${BLUE}==============================================================================${NC}"
echo ""
echo -e "Period: ${YELLOW}$START_DATE${NC} to ${YELLOW}$END_DATE${NC}"
echo -e "Export Directory: ${YELLOW}$EXPORT_DIR${NC}"
echo ""

# Check for authentication token
if [ -z "$AUTH_TOKEN" ]; then
  echo -e "${YELLOW}Warning: AUTH_TOKEN not set${NC}"
  echo "Set it with: export AUTH_TOKEN=<your-jwt-token>"
  echo ""
fi

# File types to download
declare -a FILE_TYPES=(
  "transaction_map_csv"
  "reconciliation_csv"
  "settlement_history_md"
  "related_party_disclosure_md"
  "compliance_check_md"
)

# Step 1: Generate full report package
echo -e "${BLUE}[1/2] Generating full report package...${NC}"
GENERATE_URL="${BASE_URL}/api/audit/intercompany-reconciliation/generate?start=${START_DATE}&end=${END_DATE}"

GENERATE_RESPONSE=$(curl -s -X GET "$GENERATE_URL" \
  ${AUTH_TOKEN:+-H "Authorization: Bearer $AUTH_TOKEN"})

# Check if generation was successful
if echo "$GENERATE_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✓ Report generation successful${NC}"

  # Display summary
  echo ""
  echo -e "${BLUE}Summary:${NC}"
  echo "$GENERATE_RESPONSE" | grep -o '"total_transactions":[0-9]*' | head -1
  echo "$GENERATE_RESPONSE" | grep -o '"total_amount_mur":[0-9.]*' | head -1
  echo "$GENERATE_RESPONSE" | grep -o '"is_4411_4412_balanced":[a-z]*' | head -1
  echo "$GENERATE_RESPONSE" | grep -o '"variance_mur":[0-9.]*' | head -1
  echo "$GENERATE_RESPONSE" | grep -o '"compliance_status":"[^"]*"' | head -1
  echo ""
else
  echo -e "${RED}✗ Report generation failed${NC}"
  echo "$GENERATE_RESPONSE" | head -20
  exit 1
fi

# Step 2: Download individual files
echo -e "${BLUE}[2/2] Downloading reconciliation files...${NC}"
echo ""

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
SUCCESS_COUNT=0
FAIL_COUNT=0

for file_type in "${FILE_TYPES[@]}"; do
  DOWNLOAD_URL="${BASE_URL}/api/audit/intercompany-reconciliation/download?file=${file_type}&start=${START_DATE}&end=${END_DATE}"

  # Determine file extension and output filename
  case $file_type in
    *_csv)
      extension="csv"
      ;;
    *_md)
      extension="md"
      ;;
    *)
      extension="txt"
      ;;
  esac

  output_file="${EXPORT_DIR}/${TIMESTAMP}_${file_type}.${extension}"

  echo -n "  Downloading $file_type... "

  if curl -s -X GET "$DOWNLOAD_URL" \
    ${AUTH_TOKEN:+-H "Authorization: Bearer $AUTH_TOKEN"} \
    -o "$output_file"; then

    # Check if file has content and is not an error response
    if [ -s "$output_file" ] && ! head -1 "$output_file" | grep -q '"error"'; then
      file_size=$(du -h "$output_file" | cut -f1)
      echo -e "${GREEN}✓${NC} ($file_size)"
      SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
      echo -e "${RED}✗${NC} (empty or error response)"
      rm -f "$output_file"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
  else
    echo -e "${RED}✗${NC} (network error)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done

echo ""
echo -e "${BLUE}==============================================================================${NC}"
echo -e "${BLUE}Results${NC}"
echo -e "${BLUE}==============================================================================${NC}"
echo -e "Files Downloaded: ${GREEN}${SUCCESS_COUNT}${NC} success, ${FAIL_COUNT:+${RED}${FAIL_COUNT}${NC} }failed"
echo -e "Export Directory: ${YELLOW}$EXPORT_DIR${NC}"
echo ""

# List downloaded files
if [ $SUCCESS_COUNT -gt 0 ]; then
  echo -e "${BLUE}Downloaded Files:${NC}"
  ls -lh "$EXPORT_DIR"/${TIMESTAMP}_*.* 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
  echo ""
fi

# Display next steps
echo -e "${BLUE}Next Steps:${NC}"
echo "  1. Review INTERCOMPANY_TRANSACTION_MAP for completeness"
echo "  2. Verify 4411/4412 reconciliation (check variance column)"
if grep -q "Balanced?: NO" "$EXPORT_DIR"/${TIMESTAMP}_*.csv 2>/dev/null; then
  echo "     ⚠️ WARNING: Reconciliation shows variance - investigation required"
fi
echo "  3. Review settlement history for pending items"
echo "  4. Check compliance report for any findings"
echo "  5. Submit all files to Big 4 auditor"
echo ""
echo -e "${GREEN}Intercompany reconciliation complete!${NC}"
echo ""
