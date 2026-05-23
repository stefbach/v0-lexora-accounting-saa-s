# Integration Guide: Phase 2, Task 2C — Invoice Extraction Agent

**Purpose:** Instructions for integrating the Invoice Extraction Agent into your Lexora deployment workflow.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Lexora SaaS (Next.js)                     │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐   │
│  │  /app/api/*    │  │  /lib/export   │  │  /scripts    │   │
│  │  (endpoints)   │  │  (helpers)     │  │  (extraction)│   │
│  └────────────────┘  └────────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
            ┌───────▼─────────┐  ┌──────▼──────────┐
            │  Supabase       │  │   Node.js       │
            │  (PostgreSQL)   │  │  (ts-node)      │
            │                 │  │                 │
            │ factures        │  │ Extraction      │
            │ factures_...    │  │ Scripts         │
            │ ecritures...    │  │                 │
            └─────────────────┘  └─────────────────┘
                    │                     │
                    └──────────┬──────────┘
                               │
                        ┌──────▼──────┐
                        │  /exports   │
                        │  (CSV/XLSX) │
                        └─────────────┘
```

---

## Integration Steps

### Step 1: Install Dependencies (Already Done)

The project already includes all required dependencies:

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.x",
    "xlsx": "^0.18.x"
  },
  "devDependencies": {
    "typescript": "^5.x"
  }
}
```

No additional package installation needed.

### Step 2: Configure Environment Variables

Ensure these are in your `.env.local`:

```bash
# Supabase (required for extraction)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # Service role key (not anon)
```

These are already used by the FEC export endpoint, so they should already be configured.

### Step 3: Test Database Connectivity

Before running extractions, verify database access:

```bash
# Test Supabase connection
npx ts-node -e "
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
supabase.from('factures').select('count()').then(r => {
  if (r.error) console.error('Error:', r.error)
  else console.log('✓ Database connected')
})
"
```

### Step 4: Run First Extraction

```bash
bash scripts/phase2-invoice-extraction/run-all.sh
```

Monitor the output:
- Script logs progress for each of 4 tasks
- Creates `/exports` directory
- Outputs 4 files (CSV, 2×XLSX, Markdown)

---

## API Integration Points

### Existing FEC Export Endpoint

The project already has `/api/comptable/export-fec` which:
- Uses same Supabase client patterns
- Queries same GL tables (ecritures_comptables_v2)
- Uses xlsx helper functions

**Our extraction scripts follow the same patterns** for consistency.

### Adding New Extraction Endpoint (Optional)

To expose extractions via API instead of CLI:

```typescript
// /app/api/comptable/invoice-extraction/route.ts
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const auth = await createServerClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const task = searchParams.get('task') // 'register' | 'traceability' | 'mra' | 'aging'

  // Call the appropriate extraction function
  // Return file buffer with proper headers
}
```

---

## Scheduling & Automation

### Option 1: Manual (Current)

Run extractions on-demand:
```bash
bash scripts/phase2-invoice-extraction/run-all.sh
```

### Option 2: Scheduled (Cron Jobs)

Set up Vercel cron jobs to run monthly:

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/invoice-extraction",
      "schedule": "0 1 1 * *"  // 1 AM on 1st of month
    }
  ]
}
```

Create the cron endpoint:
```typescript
// /app/api/cron/invoice-extraction/route.ts
export async function GET(request: Request) {
  // Verify secret
  if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    // Run all 4 extractions
    // Store results in database or send via email
    return NextResponse.json({ success: true, timestamp: new Date() })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

### Option 3: n8n Workflow (Recommended for SaaS)

Since Lexora uses n8n for automation:

```yaml
# n8n workflow: "Invoice Extraction Agent"
triggers:
  - type: webhook
    path: /invoice-extraction
  - type: cron
    schedule: "0 1 1 * *"  # Monthly

nodes:
  - name: Run Extract Register
    type: http
    url: ${LEXORA_BASE_URL}/api/cron/extract-register
    
  - name: Run Extract GL Traceability
    type: http
    url: ${LEXORA_BASE_URL}/api/cron/extract-gl-traceability
    
  - name: Run MRA Compliance Check
    type: http
    url: ${LEXORA_BASE_URL}/api/cron/check-mra
    
  - name: Run Aging Analysis
    type: http
    url: ${LEXORA_BASE_URL}/api/cron/extract-aging
    
  - name: Email Results
    type: send_email
    to: finance@company.com
    subject: "Invoice Extraction Report - ${DATE}"
    attachments: [
      "${EXPORTS_DIR}/INVOICE_REGISTER_COMPLETE.csv",
      "${EXPORTS_DIR}/INVOICE_GL_TRACEABILITY_50_SAMPLE.xlsx",
      "${EXPORTS_DIR}/INVOICE_MRA_COMPLIANCE.md",
      "${EXPORTS_DIR}/AGING_ANALYSIS.xlsx"
    ]
```

---

## Quality Assurance

### Pre-Launch Checklist

- [ ] Environment variables configured and tested
- [ ] Database connectivity verified
- [ ] First extraction run successful
- [ ] All 4 output files created
- [ ] File sizes reasonable (CSV >1KB, XLSX >10KB, etc.)
- [ ] CSV can be opened in Excel
- [ ] XLSX sheets are readable
- [ ] Markdown report is well-formatted
- [ ] No data privacy issues in exports

### Validation Steps

1. **Check Complete Register:**
   ```bash
   # Verify CSV structure
   head -5 exports/INVOICE_REGISTER_COMPLETE.csv
   wc -l exports/INVOICE_REGISTER_COMPLETE.csv
   ```

2. **Check GL Traceability:**
   - Open XLSX in Excel
   - Verify summary sheet shows all 50 invoices
   - Check reconciliation column (all "YES" ideally)

3. **Check MRA Compliance:**
   ```bash
   # View compliance report
   cat exports/INVOICE_MRA_COMPLIANCE.md
   ```
   - Verify all checks passed
   - Note any warnings

4. **Check Aging Analysis:**
   - Open XLSX in Excel
   - Verify aging buckets are populated
   - Check collection strategy recommendations

---

## Monitoring & Logging

### Script Output

Each script logs:
- Start/end timestamps
- Record counts
- Summary statistics
- Success/error status

Example:
```
✓ Found 450 invoices in past 12 months
✓ Complete invoice register exported to: /exports/INVOICE_REGISTER_COMPLETE.csv
  Total invoices: 450
  Date range: 2025-05-22 to 2026-05-22
  Breakdown:
    - client: 275
    - fournisseur: 175
  Status breakdown:
    - en_attente: 45
    - partiel: 15
    - paye: 380
    - retard: 10
```

### Error Handling

Scripts include:
- Connection error handling
- Query error handling
- File I/O error handling
- Data validation errors

All errors are logged with:
- Error type
- Error message
- Context (which record, if applicable)
- Remediation suggestions

### Logging to Database (Optional)

Add audit logging:

```typescript
// Track all extraction runs
interface ExtractionAudit {
  id: UUID
  task: string // 'register' | 'traceability' | 'mra' | 'aging'
  started_at: TIMESTAMPTZ
  completed_at: TIMESTAMPTZ
  record_count: INT
  status: 'success' | 'partial' | 'failed'
  error_message?: TEXT
  file_path?: TEXT
  file_size?: INT
  created_by: UUID
}
```

---

## Performance Optimization

### For Large Datasets (>10k invoices)

1. **Add Pagination to Complete Register:**
   ```typescript
   const limit = 1000
   for (let offset = 0; offset < totalCount; offset += limit) {
     const { data } = await supabase
       .from('factures')
       .select(...)
       .range(offset, offset + limit - 1)
     // Process batch
   }
   ```

2. **Reduce GL Traceability Sample:**
   ```typescript
   const sampleSize = 20 // Instead of 50
   ```

3. **Date Range Filtering:**
   ```bash
   # Only extract recent months if needed
   npx ts-node ... --from 2026-01-01 --to 2026-05-22
   ```

4. **Parallel Processing:**
   ```typescript
   // Process multiple invoices in parallel
   const batches = chunk(invoices, 10)
   for (const batch of batches) {
     await Promise.all(batch.map(inv => processInvoice(inv)))
   }
   ```

---

## Testing

### Unit Tests (Optional)

Test validation helpers:

```typescript
// test/validation-helpers.test.ts
import { validateInvoiceNumber, validateVATRate } from '../scripts/phase2-invoice-extraction/validation-helpers'

describe('Invoice Validation', () => {
  test('should reject missing invoice number', () => {
    const result = validateInvoiceNumber(null, null)
    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('Invoice number is required')
  })

  test('should accept valid VAT rate', () => {
    const result = validateVATRate(19)
    expect(result.isValid).toBe(true)
  })

  test('should reject invalid VAT rate', () => {
    const result = validateVATRate(25)
    expect(result.isValid).toBe(false)
  })
})
```

Run tests:
```bash
npm test -- validation-helpers
```

### Integration Tests

Test against test database:

```bash
# Create test data
npm run db:seed:invoices:test

# Run extractions
bash scripts/phase2-invoice-extraction/run-all.sh

# Validate outputs
npm run validate:extractions

# Clean up
npm run db:clean:test
```

---

## Troubleshooting

### Common Issues

**Issue:** "No invoices found"
- **Cause:** No invoices in past 12 months
- **Solution:** Create test invoices or adjust date range

**Issue:** "GL mismatch"
- **Cause:** Missing GL entries for an invoice
- **Solution:** Check createEcrituresForPayment logic, create missing entries

**Issue:** "Permission denied writing to /exports"
- **Cause:** Directory permissions
- **Solution:** `chmod 755 /path/to/exports`

**Issue:** "Database connection timeout"
- **Cause:** Network issue, wrong credentials
- **Solution:** Verify NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY

### Debug Mode

Run with verbose logging:

```bash
# In scripts, uncomment:
// if (EXTRACTION_CONFIG.verbose) console.log(...)

# Or set env var:
export DEBUG=lexora:*
bash scripts/phase2-invoice-extraction/run-all.sh
```

---

## Deployment Checklist

- [ ] Scripts tested locally with real data
- [ ] Environment variables configured in Vercel
- [ ] Cron jobs configured (if using scheduled)
- [ ] Email notifications configured
- [ ] Monitoring/alerting set up
- [ ] Backup of extraction results
- [ ] Access controls for export files
- [ ] Data retention policy defined

---

## Maintenance

### Monthly
- Run extractions
- Review outputs
- Monitor file sizes
- Check error logs

### Quarterly
- Review and optimize performance
- Test new Supabase schema changes
- Update validation rules if needed
- Test disaster recovery

### Annually
- Audit all extracted data
- Verify compliance with MRA updates
- Update documentation
- Plan for Lexora updates

---

## Support Resources

- **Script Documentation:** `/scripts/phase2-invoice-extraction/README.md`
- **Configuration:** `/scripts/phase2-invoice-extraction/config.ts`
- **Validation Rules:** `/scripts/phase2-invoice-extraction/validation-helpers.ts`
- **Deliverables Summary:** `/PHASE2_TASK2C_DELIVERABLES.md`

---

**Last Updated:** 2026-05-22  
**Version:** 1.0
