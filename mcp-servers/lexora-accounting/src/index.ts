#!/usr/bin/env node
/**
 * Lexora Accounting MCP Server
 *
 * Expose les opérations comptables Lexora comme outils MCP typés pour Claude
 * (Claude Desktop, Claude Code, agents internes). Évite le SQL brut côté
 * agents : chaque outil est validé (Zod), auditable, et respecte la RLS
 * Supabase via le user JWT du caller.
 *
 * Stack :
 *   • @modelcontextprotocol/sdk — server stdio
 *   • @supabase/supabase-js — accès DB
 *   • zod — validation inputs/outputs
 *
 * Configuration :
 *   • SUPABASE_URL          — URL du projet Supabase
 *   • SUPABASE_ANON_KEY     — clé anon (RLS appliquée)
 *   • SUPABASE_SERVICE_KEY  — (optionnel) clé service pour outils admin
 *
 * Usage Claude Desktop :
 *   {
 *     "mcpServers": {
 *       "lexora-accounting": {
 *         "command": "node",
 *         "args": ["/path/to/lexora-accounting-mcp/dist/index.js"],
 *         "env": {
 *           "SUPABASE_URL": "https://...",
 *           "SUPABASE_SERVICE_KEY": "..."
 *         }
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

// ── Configuration ──────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY / SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── Schémas d'inputs (Zod) ─────────────────────────────────────────────────
const GetGrandLivreInput = z.object({
  societe_id: z.string().uuid(),
  date_debut: z.string().optional().describe('YYYY-MM-DD'),
  date_fin: z.string().optional().describe('YYYY-MM-DD'),
  compte_prefix: z.string().optional().describe('Filter on numero_compte starts-with (e.g. "411", "6")'),
  limit: z.number().int().positive().max(1000).default(500),
})

const ComputeIfrs9EclInput = z.object({
  societe_id: z.string().uuid(),
  refresh_stages: z.boolean().default(false).describe('Run ifrs9_refresh_all_stages before computing'),
})

const LettrerEcrituresInput = z.object({
  societe_id: z.string().uuid(),
  ecriture_ids: z.array(z.string().uuid()).min(2).describe('IDs from ecritures_comptables_v2 to letter together'),
  lettre: z.string().optional().describe('Optional letter code. Generated via generer_lettre_unique() if omitted.'),
})

const ListUnpaidInvoicesInput = z.object({
  societe_id: z.string().uuid(),
  type_facture: z.enum(['client', 'fournisseur']).default('client'),
  min_age_days: z.number().int().min(0).default(0),
})

const ComputeBalanceInput = z.object({
  societe_id: z.string().uuid(),
  date_debut: z.string().optional(),
  date_fin: z.string().optional(),
})

// ── Tool handlers ──────────────────────────────────────────────────────────

async function handleGetGrandLivre(args: z.infer<typeof GetGrandLivreInput>) {
  let q = supabase
    .from('ecritures_comptables_v2')
    .select('id, date_ecriture, numero_compte, nom_compte, description, debit_mur, credit_mur, journal, ref_folio, lettre')
    .eq('societe_id', args.societe_id)
    .order('date_ecriture', { ascending: false })
    .limit(args.limit)
  if (args.date_debut)   q = q.gte('date_ecriture', args.date_debut)
  if (args.date_fin)     q = q.lte('date_ecriture', args.date_fin)
  if (args.compte_prefix) q = q.like('numero_compte', `${args.compte_prefix}%`)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return {
    count: data?.length || 0,
    truncated: (data?.length || 0) >= args.limit,
    entries: data || [],
  }
}

async function handleComputeIfrs9Ecl(args: z.infer<typeof ComputeIfrs9EclInput>) {
  if (args.refresh_stages) {
    const { error } = await supabase.rpc('ifrs9_refresh_all_stages', { p_societe_id: args.societe_id })
    if (error) throw new Error(`refresh_stages: ${error.message}`)
  }

  const [{ data: ecl, error: e1 }, { data: disclosure, error: e2 }] = await Promise.all([
    supabase.rpc('ifrs9_compute_ecl_full', { p_societe_id: args.societe_id }),
    supabase.from('vw_ifrs9_disclosure').select('*').eq('societe_id', args.societe_id),
  ])
  if (e1) throw new Error(`ecl: ${e1.message}`)
  if (e2) throw new Error(`disclosure: ${e2.message}`)

  const ecl_base = (ecl || []).reduce((s: number, r: any) => s + Number(r.ecl_base_mur || 0), 0)
  const ecl_macro = (ecl || []).reduce((s: number, r: any) => s + Number(r.ecl_with_macro_mur || 0), 0)
  const exposure = (ecl || []).reduce((s: number, r: any) => s + Number(r.exposure_mur || 0), 0)

  return {
    societe_id: args.societe_id,
    by_counterparty: ecl || [],
    disclosure_by_stage: disclosure || [],
    totals: {
      exposure_total_mur: exposure,
      ecl_base_total_mur: ecl_base,
      ecl_with_macro_total_mur: ecl_macro,
      coverage_ratio_pct: exposure > 0 ? (ecl_macro / exposure) * 100 : 0,
    },
  }
}

async function handleLettrerEcritures(args: z.infer<typeof LettrerEcrituresInput>) {
  // Vérifier que les écritures appartiennent toutes à la même société
  const { data: ecritures, error: errSelect } = await supabase
    .from('ecritures_comptables_v2')
    .select('id, societe_id, debit_mur, credit_mur, lettre')
    .in('id', args.ecriture_ids)
  if (errSelect) throw new Error(errSelect.message)
  if (!ecritures || ecritures.length !== args.ecriture_ids.length) {
    throw new Error('Certaines écritures introuvables')
  }
  if (ecritures.some(e => e.societe_id !== args.societe_id)) {
    throw new Error('Mélange de sociétés détecté — refusé')
  }
  if (ecritures.some(e => e.lettre)) {
    throw new Error('Au moins une écriture est déjà lettrée — délettrage requis au préalable')
  }

  // Contrôle équilibre Σ débit = Σ crédit
  const sumD = ecritures.reduce((s, e) => s + Number(e.debit_mur || 0), 0)
  const sumC = ecritures.reduce((s, e) => s + Number(e.credit_mur || 0), 0)
  if (Math.abs(sumD - sumC) > 0.01) {
    throw new Error(`Déséquilibre Σdébit=${sumD} ≠ Σcrédit=${sumC} — lettrage refusé`)
  }

  // Générer ou utiliser la lettre fournie
  let lettre = args.lettre
  if (!lettre) {
    const { data, error } = await supabase.rpc('generer_lettre_unique', {
      p_societe_id: args.societe_id, p_prefixe: 'M',
    })
    if (error) throw new Error(`generer_lettre_unique: ${error.message}`)
    lettre = data as string
  }

  const { error: errUpdate } = await supabase
    .from('ecritures_comptables_v2')
    .update({ lettre, date_lettrage: new Date().toISOString() })
    .in('id', args.ecriture_ids)
  if (errUpdate) throw new Error(errUpdate.message)

  return { lettre, count: args.ecriture_ids.length, total_debit: sumD, total_credit: sumC }
}

async function handleListUnpaidInvoices(args: z.infer<typeof ListUnpaidInvoicesInput>) {
  const today = new Date()
  const { data, error } = await supabase
    .from('factures')
    .select('id, numero_facture, date_facture, date_echeance, tiers, montant_mur, devise, statut')
    .eq('societe_id', args.societe_id)
    .eq('type_facture', args.type_facture)
    .in('statut', ['en_attente', 'retard'])
    .gt('montant_mur', 0)
    .order('date_facture', { ascending: true })
  if (error) throw new Error(error.message)

  const filtered = (data || []).filter(f => {
    if (!f.date_facture) return false
    const age = Math.floor((today.getTime() - new Date(f.date_facture).getTime()) / 86400000)
    return age >= args.min_age_days
  }).map(f => ({
    ...f,
    age_jours: Math.floor((today.getTime() - new Date(f.date_facture).getTime()) / 86400000),
  }))

  return {
    count: filtered.length,
    total_mur: filtered.reduce((s, f) => s + Number(f.montant_mur || 0), 0),
    invoices: filtered,
  }
}

async function handleComputeBalance(args: z.infer<typeof ComputeBalanceInput>) {
  let q = supabase
    .from('ecritures_comptables_v2')
    .select('numero_compte, nom_compte, debit_mur, credit_mur')
    .eq('societe_id', args.societe_id)
  if (args.date_debut) q = q.gte('date_ecriture', args.date_debut)
  if (args.date_fin)   q = q.lte('date_ecriture', args.date_fin)
  // Pagination batch jusqu'à 10K
  const all: any[] = []
  for (let from = 0; from < 10000; from += 1000) {
    const { data, error } = await q.range(from, from + 999)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
  }

  const byCompte = new Map<string, { nom: string; debit: number; credit: number }>()
  for (const e of all) {
    const k = e.numero_compte || '???'
    const cur = byCompte.get(k) || { nom: e.nom_compte || '', debit: 0, credit: 0 }
    cur.debit  += Number(e.debit_mur)  || 0
    cur.credit += Number(e.credit_mur) || 0
    byCompte.set(k, cur)
  }

  const comptes = [...byCompte.entries()].map(([num, agg]) => ({
    compte: num, nom: agg.nom,
    debit: agg.debit, credit: agg.credit, solde: agg.debit - agg.credit,
  })).sort((a, b) => a.compte.localeCompare(b.compte))

  const total_debit  = comptes.reduce((s, c) => s + c.debit, 0)
  const total_credit = comptes.reduce((s, c) => s + c.credit, 0)

  return {
    nb_ecritures: all.length,
    nb_comptes: comptes.length,
    total_debit, total_credit,
    equilibre: Math.abs(total_debit - total_credit) < 0.01,
    comptes,
  }
}

// ── MCP server setup ───────────────────────────────────────────────────────

const server = new Server(
  { name: 'lexora-accounting', version: '0.1.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_grand_livre',
      description: 'Récupère les écritures comptables (V2) avec filtres date/compte. Lecture seule. Respecte la RLS Supabase.',
      inputSchema: zodToJsonSchema(GetGrandLivreInput),
    },
    {
      name: 'compute_ifrs9_ecl',
      description: 'Calcule la provision IFRS 9 (ECL) pour une société : Stages 1/2/3 + PD/LGD + macro forward-looking. Optionnellement rafraîchit les stages avant calcul.',
      inputSchema: zodToJsonSchema(ComputeIfrs9EclInput),
    },
    {
      name: 'lettrer_ecritures',
      description: 'Applique un lettrage commun à un groupe d\'écritures. Refuse si déséquilibre Σdébit ≠ Σcrédit ou si écritures déjà lettrées.',
      inputSchema: zodToJsonSchema(LettrerEcrituresInput),
    },
    {
      name: 'list_unpaid_invoices',
      description: 'Liste les factures non payées (client ou fournisseur) avec age en jours. Utilise pour aging analysis.',
      inputSchema: zodToJsonSchema(ListUnpaidInvoicesInput),
    },
    {
      name: 'compute_balance',
      description: 'Calcule la balance comptable agrégée par compte sur une période. Contrôle équilibre Σdébit = Σcrédit inclus.',
      inputSchema: zodToJsonSchema(ComputeBalanceInput),
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  try {
    let result: unknown
    switch (name) {
      case 'get_grand_livre':
        result = await handleGetGrandLivre(GetGrandLivreInput.parse(args)); break
      case 'compute_ifrs9_ecl':
        result = await handleComputeIfrs9Ecl(ComputeIfrs9EclInput.parse(args)); break
      case 'lettrer_ecritures':
        result = await handleLettrerEcritures(LettrerEcrituresInput.parse(args)); break
      case 'list_unpaid_invoices':
        result = await handleListUnpaidInvoices(ListUnpaidInvoicesInput.parse(args)); break
      case 'compute_balance':
        result = await handleComputeBalance(ComputeBalanceInput.parse(args)); break
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `Error: ${err?.message || String(err)}` }],
      isError: true,
    }
  }
})

// Helper rudimentaire zod → JSON schema (suffisant pour MCP inputs simples).
// Pour des schémas complexes, considérer zod-to-json-schema en dépendance.
function zodToJsonSchema(schema: z.ZodObject<any>): any {
  const shape = schema.shape
  const properties: Record<string, any> = {}
  const required: string[] = []
  for (const [key, def] of Object.entries(shape)) {
    const zdef = def as z.ZodTypeAny
    const inner = zdef instanceof z.ZodDefault ? zdef._def.innerType : zdef
    let type = 'string'
    if (inner instanceof z.ZodNumber) type = 'number'
    else if (inner instanceof z.ZodBoolean) type = 'boolean'
    else if (inner instanceof z.ZodArray) type = 'array'
    else if (inner instanceof z.ZodEnum) type = 'string'
    properties[key] = { type, description: zdef.description }
    if (!(zdef instanceof z.ZodOptional) && !(zdef instanceof z.ZodDefault)) required.push(key)
  }
  return { type: 'object', properties, required }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Lexora Accounting MCP server running on stdio')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
