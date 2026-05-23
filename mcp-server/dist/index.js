#!/usr/bin/env node
/**
 * Lexora MCP Server
 * Provides Claude AI direct access to Lexora accounting & HR functions.
 *
 * Tools exposed:
 *   - list_societes: List all companies the user has access to
 *   - get_balance: Get account balance for a period
 *   - get_chart_of_accounts: Retrieve full chart of accounts (PCM or SYSCOHADA)
 *   - search_journal_entries: Search GL entries with filters
 *   - post_journal_entry: Create a new GL entry (requires approval workflow)
 *   - get_employee: Get employee details
 *   - list_payslips: List recent payslips for an employee
 *   - calculate_payslip: Calculate a payslip (without saving)
 *   - get_invoice: Get invoice details
 *   - search_invoices: Search invoices with filters
 *   - generate_statement: Generate Bilan/CR/Cash Flow
 *   - get_forex_rate: Get real-time exchange rate
 *
 * Usage in Claude Desktop:
 * Add to claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "lexora": {
 *       "command": "npx",
 *       "args": ["@lexora/mcp-server"],
 *       "env": {
 *         "LEXORA_API_URL": "https://your-lexora.com",
 *         "LEXORA_API_KEY": "your-api-key"
 *       }
 *     }
 *   }
 * }
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, } from '@modelcontextprotocol/sdk/types.js';
const LEXORA_API_URL = process.env.LEXORA_API_URL ?? 'http://localhost:3000';
const LEXORA_API_KEY = process.env.LEXORA_API_KEY ?? '';
async function lexoraFetch(path, options = {}) {
    const url = `${LEXORA_API_URL}${path}`;
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LEXORA_API_KEY}`,
            ...options.headers,
        },
    });
    if (!response.ok) {
        throw new Error(`Lexora API error ${response.status}: ${await response.text()}`);
    }
    return response.json();
}
const server = new Server({ name: 'lexora-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });
// ============================================================================
// TOOLS REGISTRY
// ============================================================================
const tools = [
    {
        name: 'list_societes',
        description: 'List all companies (sociétés) accessible to the user.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'get_balance',
        description: 'Get account balance for a specific period. Returns balance in MUR or original currency.',
        inputSchema: {
            type: 'object',
            properties: {
                societeId: { type: 'string', description: 'UUID of the société' },
                accountNumber: { type: 'string', description: 'Account number (e.g., "411", "4210")' },
                startDate: { type: 'string', description: 'YYYY-MM-DD' },
                endDate: { type: 'string', description: 'YYYY-MM-DD' },
            },
            required: ['societeId', 'accountNumber'],
        },
    },
    {
        name: 'get_chart_of_accounts',
        description: 'Retrieve the chart of accounts (PCM Mauritius or SYSCOHADA).',
        inputSchema: {
            type: 'object',
            properties: {
                framework: { type: 'string', enum: ['PCM', 'SYSCOHADA'], description: 'Framework' },
                classNumber: { type: 'number', description: 'Optional class filter (1-9)' },
            },
        },
    },
    {
        name: 'search_journal_entries',
        description: 'Search GL entries with filters (date range, account, journal code, amount range).',
        inputSchema: {
            type: 'object',
            properties: {
                societeId: { type: 'string' },
                startDate: { type: 'string' },
                endDate: { type: 'string' },
                accountNumber: { type: 'string' },
                journalCode: { type: 'string', enum: ['VTE', 'ACH', 'BNQ', 'SAL', 'OD'] },
                minAmount: { type: 'number' },
                maxAmount: { type: 'number' },
                limit: { type: 'number', description: 'Max results (default 50)' },
            },
            required: ['societeId'],
        },
    },
    {
        name: 'post_journal_entry',
        description: 'Create a new GL entry. Requires balanced debits/credits. Goes through approval workflow.',
        inputSchema: {
            type: 'object',
            properties: {
                societeId: { type: 'string' },
                date: { type: 'string' },
                description: { type: 'string' },
                journalCode: { type: 'string', enum: ['VTE', 'ACH', 'BNQ', 'SAL', 'OD'] },
                lines: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            accountNumber: { type: 'string' },
                            debit: { type: 'number' },
                            credit: { type: 'number' },
                            description: { type: 'string' },
                        },
                        required: ['accountNumber', 'debit', 'credit'],
                    },
                },
            },
            required: ['societeId', 'date', 'description', 'journalCode', 'lines'],
        },
    },
    {
        name: 'list_employees',
        description: 'List employees for a société with optional filters.',
        inputSchema: {
            type: 'object',
            properties: {
                societeId: { type: 'string' },
                active: { type: 'boolean', description: 'Filter active employees only' },
            },
            required: ['societeId'],
        },
    },
    {
        name: 'calculate_payslip',
        description: 'Calculate a payslip preview (does NOT save). Returns gross→net breakdown with all deductions.',
        inputSchema: {
            type: 'object',
            properties: {
                jurisdictionCode: { type: 'string', description: 'MU, SN, CI, etc.' },
                employeeId: { type: 'string' },
                grossSalary: { type: 'number' },
                bonuses: { type: 'number' },
                familyDependents: { type: 'number' },
                period: {
                    type: 'object',
                    properties: {
                        year: { type: 'number' },
                        month: { type: 'number' }
                    }
                },
            },
            required: ['jurisdictionCode', 'employeeId', 'grossSalary'],
        },
    },
    {
        name: 'search_invoices',
        description: 'Search invoices with filters (status, customer, date range, amount).',
        inputSchema: {
            type: 'object',
            properties: {
                societeId: { type: 'string' },
                status: { type: 'string', enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'] },
                customerId: { type: 'string' },
                startDate: { type: 'string' },
                endDate: { type: 'string' },
            },
            required: ['societeId'],
        },
    },
    {
        name: 'generate_financial_statement',
        description: 'Generate Bilan, Compte de Résultat, or Cash Flow statement for a société.',
        inputSchema: {
            type: 'object',
            properties: {
                societeId: { type: 'string' },
                statementType: { type: 'string', enum: ['balance_sheet', 'income_statement', 'cash_flow', 'tafire', 'all'] },
                periodStart: { type: 'string' },
                periodEnd: { type: 'string' },
                comparativePeriod: { type: 'boolean' },
            },
            required: ['societeId', 'statementType', 'periodStart', 'periodEnd'],
        },
    },
    {
        name: 'get_forex_rate',
        description: 'Get real-time exchange rate between two currencies.',
        inputSchema: {
            type: 'object',
            properties: {
                base: { type: 'string', description: 'Base currency (e.g., EUR)' },
                quote: { type: 'string', description: 'Quote currency (e.g., MUR)' },
                date: { type: 'string', description: 'Optional historical date YYYY-MM-DD' },
            },
            required: ['base', 'quote'],
        },
    },
    {
        name: 'get_audit_trail',
        description: 'Retrieve audit log for a specific entity (invoice, journal entry, payslip).',
        inputSchema: {
            type: 'object',
            properties: {
                entityType: { type: 'string', enum: ['invoice', 'journal_entry', 'payslip', 'employee'] },
                entityId: { type: 'string' },
            },
            required: ['entityType', 'entityId'],
        },
    },
];
// ============================================================================
// HANDLER
// ============================================================================
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case 'list_societes': {
                const data = await lexoraFetch('/api/societes');
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'get_balance': {
                const params = new URLSearchParams(args);
                const data = await lexoraFetch(`/api/balance?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'get_chart_of_accounts': {
                const framework = args.framework ?? 'PCM';
                const data = await lexoraFetch(`/api/jurisdictions/chart-of-accounts?framework=${framework}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'search_journal_entries': {
                const params = new URLSearchParams(args);
                const data = await lexoraFetch(`/api/ecritures/search?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'post_journal_entry': {
                const data = await lexoraFetch('/api/ecritures', {
                    method: 'POST',
                    body: JSON.stringify(args),
                });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'list_employees': {
                const params = new URLSearchParams(args);
                const data = await lexoraFetch(`/api/employes?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'calculate_payslip': {
                const data = await lexoraFetch('/api/ohada/payroll/calculate', {
                    method: 'POST',
                    body: JSON.stringify(args),
                });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'search_invoices': {
                const params = new URLSearchParams(args);
                const data = await lexoraFetch(`/api/factures?${params}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'generate_financial_statement': {
                const data = await lexoraFetch('/api/ohada/statements', {
                    method: 'POST',
                    body: JSON.stringify({
                        ...args,
                        statementType: args.statementType === 'balance_sheet' ? 'bilan' :
                            args.statementType === 'income_statement' ? 'compte-resultat' :
                                args.statementType,
                    }),
                });
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'get_forex_rate': {
                const { base, quote, date } = args;
                const endpoint = date
                    ? `/api/forex/convert`
                    : `/api/forex/rates?base=${base}&quote=${quote}`;
                const opts = date
                    ? { method: 'POST', body: JSON.stringify({ amount: 1, from: base, to: quote, date }) }
                    : {};
                const data = await lexoraFetch(endpoint, opts);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            case 'get_audit_trail': {
                const { entityType, entityId } = args;
                const data = await lexoraFetch(`/api/audit/trail?entityType=${entityType}&entityId=${entityId}`);
                return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
            }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});
// ============================================================================
// START
// ============================================================================
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Lexora MCP Server running on stdio');
}
main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
