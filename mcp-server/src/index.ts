#!/usr/bin/env node
/**
 * Lexora MCP Server — Model Context Protocol pour Claude Desktop, n8n, API.
 *
 * Permet à Claude (et autres clients MCP) d'utiliser Lexora comme un outil
 * natif. Read-only par défaut — pas d'écriture en compta sans approbation
 * humaine côté Lexora UI.
 *
 * AUTH : header `X-Lexora-Api-Key` (mig 308 — user_api_keys).
 * La clé est générée par l'utilisateur dans Lexora :
 *   /client/direction/mcp-setup → "Créer une nouvelle clé"
 * Elle est liée à son user_id, révocable, et hashée en DB.
 *
 * ENV CÔTÉ MCP (à mettre dans claude_desktop_config.json) :
 *   LEXORA_API_URL    URL de l'instance Lexora (ex: https://lexora.vercel.app)
 *   LEXORA_API_KEY    Clé générée dans Lexora (format "lex_...")
 *
 * USAGE Claude Desktop (~/.config/Claude/claude_desktop_config.json) :
 *   {
 *     "mcpServers": {
 *       "lexora": {
 *         "command": "node",
 *         "args": ["/chemin/absolu/v0-lexora-accounting-saa-s/mcp-server/dist/index.js"],
 *         "env": {
 *           "LEXORA_API_URL": "https://ton-instance.vercel.app",
 *           "LEXORA_API_KEY": "lex_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 *         }
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const LEXORA_API_URL = (process.env.LEXORA_API_URL || 'http://localhost:3000').replace(/\/$/, '')
const LEXORA_API_KEY = process.env.LEXORA_API_KEY ?? ''

if (!LEXORA_API_KEY) {
  console.error('[lexora-mcp] LEXORA_API_KEY est requis dans l\'env (format "lex_...")')
  console.error('[lexora-mcp] Génère-en une depuis Lexora → Direction → Connecter à Claude Desktop')
  process.exit(1)
}

if (!LEXORA_API_KEY.startsWith('lex_')) {
  console.error('[lexora-mcp] LEXORA_API_KEY doit commencer par "lex_" — clé invalide')
  process.exit(1)
}

async function lexoraFetch(path: string, init: RequestInit = {}) {
  const url = `${LEXORA_API_URL}${path.startsWith('/') ? path : '/' + path}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Lexora-Api-Key': LEXORA_API_KEY,
    ...(init.headers as Record<string, string> | undefined),
  }

  const res = await fetch(url, { ...init, headers })
  const contentType = res.headers.get('content-type') || ''
  const body = contentType.includes('json') ? await res.json() : await res.text()
  if (!res.ok) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body)
    throw new Error(`Lexora ${res.status} sur ${path}: ${detail}`)
  }
  return body
}

const server = new Server(
  { name: 'lexora-mcp', version: '0.3.0' },
  { capabilities: { tools: {} } },
)

// ============================================================
// Liste des outils exposés à Claude
// ============================================================
const TOOLS = [
  {
    name: 'list_societes',
    description:
      'Liste les sociétés accessibles à l\'utilisateur Lexora connecté. Retourne id, nom, BRN, VAT, devise, régime fiscal.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_financial_summary',
    description:
      'Synthèse financière d\'une société pour une période : revenus, dépenses, TVA, masse salariale, trésorerie, créances, dettes. Source identique au Dashboard et P&L Lexora.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string', description: 'UUID de la société (cf. list_societes)' },
        exercice: { type: 'string', description: 'Exercice fiscal mauricien (Jul-Jun), ex: "2025-2026". Optionnel.' },
        date_debut: { type: 'string', description: 'Début période YYYY-MM-DD, alternative à exercice' },
        date_fin: { type: 'string', description: 'Fin période YYYY-MM-DD' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_factures',
    description:
      'Liste les factures (clients et fournisseurs) d\'une société. Filtres optionnels par type, statut, période.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
        type_facture: { type: 'string', enum: ['client', 'fournisseur'], description: 'Filtre par type. Par défaut : tous.' },
        statut: { type: 'string', enum: ['brouillon', 'en_attente', 'paye', 'retard', 'annule'] },
        limit: { type: 'number', description: 'Max résultats. Défaut 50.' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'list_alertes',
    description:
      'Alertes financières et de conformité actives pour une société : TVA en retard, créances anciennes, ratio liquidité dégradé, échéances MRA à venir, etc.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        societe_id: { type: 'string' },
      },
      required: ['societe_id'],
    },
  },
  {
    name: 'get_taux_change',
    description:
      'Taux de change actuels MUR vers devises étrangères (USD, EUR, GBP, JPY, AUD, CAD, CNY, INR, ZAR...). Source : Bank of Mauritius officielle, fallback ExchangeRate-API.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
]

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  const a = (args || {}) as Record<string, unknown>

  try {
    switch (name) {
      case 'list_societes': {
        const data = await lexoraFetch('/api/client/societes')
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'get_financial_summary': {
        const params = new URLSearchParams()
        if (a.societe_id) params.set('societe_id', String(a.societe_id))
        if (a.exercice) params.set('exercice', String(a.exercice))
        if (a.date_debut) params.set('date_debut', String(a.date_debut))
        if (a.date_fin) params.set('date_fin', String(a.date_fin))
        const data = await lexoraFetch(`/api/client/financial?${params}`)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_factures': {
        const params = new URLSearchParams()
        if (a.societe_id) params.set('societe_id', String(a.societe_id))
        if (a.type_facture) params.set('type', String(a.type_facture))
        if (a.statut) params.set('statut', String(a.statut))
        if (a.limit) params.set('limit', String(a.limit))
        const data = await lexoraFetch(`/api/client/factures?${params}`)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'list_alertes': {
        const params = new URLSearchParams()
        if (a.societe_id) params.set('societe_id', String(a.societe_id))
        const data = await lexoraFetch(`/api/client/alertes?${params}`)
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      case 'get_taux_change': {
        const data = await lexoraFetch('/api/taux-change')
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }

      default:
        return {
          content: [{ type: 'text', text: `Outil inconnu : ${name}` }],
          isError: true,
        }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      content: [{ type: 'text', text: `Erreur : ${msg}` }],
      isError: true,
    }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('[lexora-mcp] Server started (v0.3.0) — 5 tools: list_societes, get_financial_summary, list_factures, list_alertes, get_taux_change')
