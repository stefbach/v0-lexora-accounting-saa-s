# Audit Trail API - Quick Start Guide

## 5-Minute Setup

### 1. Query Audit Trail

```bash
# Get all changes for a GL entry
curl "http://localhost:3000/api/audit/trail?table_name=ecritures_comptables_v2&row_id=uuid-123"

# Filter by date range
curl "http://localhost:3000/api/audit/trail?table_name=factures&start_date=2025-01-01&end_date=2025-12-31"

# Filter by action type
curl "http://localhost:3000/api/audit/trail?table_name=factures&action=APPROVE"

# Full-text search
curl "http://localhost:3000/api/audit/trail?table_name=ecritures_comptables_v2&description_search=reclassement"
```

### 2. Export Audit Trail

```bash
# Export as CSV
curl "http://localhost:3000/api/audit/trail?table_name=factures&format=csv" > audit.csv

# Export as Excel
curl "http://localhost:3000/api/audit/trail?table_name=ecritures_comptables_v2&format=excel" > audit.xlsx

# Use dedicated export endpoint
curl "http://localhost:3000/api/audit/trail/export?table_name=bulletins_paie&format=excel" > payroll_audit.xlsx
```

## Common Patterns

### TypeScript/JavaScript

```typescript
import { queryAuditTrail, getRecordWithAuditTrail } from '@/lib/audit/query-builder'
import { logApproval, logExport } from '@/lib/audit/log-entry'

// Query audit trail
const result = await queryAuditTrail(supabase, {
  table_name: 'ecritures_comptables_v2',
  row_id: glEntryId,
  limit: 50
})

// Get current values + history
const recordWithHistory = await getRecordWithAuditTrail(
  supabase,
  'factures',
  invoiceId
)

// Log approval
await logApproval(supabase, {
  table_name: 'factures',
  row_id: invoiceId,
  approved_by: userId,
  status: 'approved',
  comment: 'Invoice verified'
}, userId, userEmail, userRole)

// Log export
await logExport(supabase, {
  table_name: 'ecritures_comptables_v2',
  format: 'csv',
  row_count: 250
}, userId, userEmail, userRole)
```

## API Reference

### GET /api/audit/trail

Query audit trail with filters and pagination.

**Query Parameters:**
- `table_name` (required) - Table to audit (e.g., 'ecritures_comptables_v2', 'factures')
- `row_id` (optional) - Specific record UUID
- `user_id` (optional) - Filter by user ID
- `user_email` (optional) - Filter by email
- `start_date` (optional) - ISO 8601 date (e.g., '2025-01-01')
- `end_date` (optional) - ISO 8601 date
- `action` (optional) - CREATE, UPDATE, DELETE, READ, EXPORT, LOGIN, LOGOUT, APPROVE, REJECT
- `description_search` (optional) - Full-text search
- `field_name` (optional) - Filter by changed field (e.g., 'numero_compte')
- `limit` (optional) - Results per page (default 100, max 1000)
- `offset` (optional) - Pagination offset (default 0)
- `format` (optional) - json, csv, excel (default json)
- `include_record` (optional) - Include current record data (true/false)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "timestamp": "2025-01-16T14:30:00Z",
      "user_email": "comptable@lexora.mu",
      "user_role": "comptable",
      "action": "UPDATE",
      "table_name": "ecritures_comptables_v2",
      "row_id": "uuid",
      "old_values": {"numero_compte": "512100"},
      "new_values": {"numero_compte": "455"},
      "description": "Account reclassified"
    }
  ],
  "pagination": {
    "total": 156,
    "limit": 100,
    "offset": 0,
    "returned": 100
  }
}
```

### GET /api/audit/trail/export

Export audit trail as file.

**Query Parameters:**
- `table_name` (required)
- `format` (required) - csv or excel
- `row_id` (optional)
- `user_id` (optional)
- `start_date` (optional)
- `end_date` (optional)
- `action` (optional)

**Response:** File download with appropriate headers

## Tables Tracked

| Table | Tracked Fields | Auto-logged |
|-------|---|---|
| ecritures_comptables_v2 | All GL entry fields | ✓ Yes |
| factures | All invoice fields | ✓ Yes |
| bulletins_paie | All payroll fields | ✓ Yes |
| employes | All employee fields | ✓ Yes |

## Key Features

- **Immutable**: Audit logs cannot be updated or deleted (database-level enforcement)
- **Complete**: Tracks old and new values for all changes
- **Fast**: <500ms response time for typical queries
- **Secure**: Admin/auditor role required, RLS enforced
- **Auditable**: IP address, user agent, timestamp captured

## Permissions

Only users with these roles can access audit trail:
- `admin` - Full access to all audit data
- `auditor` - Access to audit trail (auditor role)

## Performance Tips

1. **Use date ranges** - Enables partition pruning
2. **Add row_id** - Narrows query scope
3. **Paginate** - Use limit/offset for large datasets
4. **Avoid full-text search** - Client-side filtering
5. **Index on (table_name, row_id, timestamp)**

## Troubleshooting

**No results returned?**
- Check table_name is correct
- Verify row_id format (UUID)
- Confirm date range includes activity

**Query is slow?**
- Add date range filter
- Reduce limit and paginate
- Check for full-text search

**Export file empty?**
- Verify query parameters
- Confirm records exist in date range
- Check user role (admin/auditor required)

## Testing

```bash
# Run full test suite
npm test -- lib/audit/audit-trail.test.ts

# Expected result: 31 tests passing in <1s
```

## Documentation

- Full API docs: `/lib/audit/README.md`
- Delivery report: `/AUDIT_API_DELIVERY.md`
- Tests: `/lib/audit/audit-trail.test.ts`

## Support

For issues:
1. Check database logs: `supabase logs postgres`
2. Verify audit table exists: `SELECT COUNT(*) FROM public.audit_trail`
3. Check triggers: `SELECT trigger_name FROM information_schema.triggers WHERE event_object_table LIKE 'audit%'`
4. Review RLS policies: `SELECT * FROM pg_policies WHERE tablename = 'audit_trail'`
