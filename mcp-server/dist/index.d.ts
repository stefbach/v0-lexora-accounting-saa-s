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
export {};
