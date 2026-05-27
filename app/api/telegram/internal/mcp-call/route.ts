/**
 * POST /api/telegram/internal/mcp-call
 *
 * Pont générique qui expose les 20 outils MCP Lexora (originellement exposés à
 * Claude Desktop via `mcp-lexora`) au bot Telegram. Le bot peut désormais
 * appeler des outils de comptabilité fine (grand livre, écritures, lettrage,
 * etc.) qui ne sont PAS encore couverts par les 47 endpoints
 * `/api/telegram/internal/*`.
 *
 * Body :
 *   - tool   : string (un des ALLOWED_TOOLS)
 *   - params : Record<string, any> (paramètres du tool — societe_id auto-injecté
 *              depuis le ctx Telegram s'il manque)
 *
 * Sécurité :
 *   - HMAC SHA-256 (verifyHmac) — même que tous les endpoints telegram/internal
 *   - withTelegramAuth résout user_id + societe_id + role depuis chat_id
 *   - Whitelist stricte : seuls les 20 tools listés ci-dessous sont appelables
 *   - L'appel interne est fait via callLexoraHeaders → spoof l'auth de l'user
 *     Telegram sur le endpoint cible, ce qui propage l'isolation tenant
 *     (assertSocieteAccess + RLS) au niveau de chaque endpoint client.
 *
 * Réponse :
 *   - status: 'success' + tool + result (JSON brut du endpoint cible)
 *   - status: 'error' + error_msg + details éventuels (HTTP 200 toujours, pour
 *     que le LLM voit le payload même quand axios discarde les 4xx/5xx)
 */
import { NextRequest, NextResponse } from 'next/server'
import { verifyHmac } from '@/lib/security/hmac-auth'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { callLexoraHeaders, getLexoraBaseUrl } from '@/lib/lexora-internal-auth'

export const dynamic = 'force-dynamic'

/* -------------------------------------------------------------------------- */
/*  Whitelist des 20 outils MCP exposés à Telegram                            */
/* -------------------------------------------------------------------------- */
const ALLOWED_TOOLS = [
  'list_societes',
  'get_financial_summary',
  'list_factures',
  'list_factures_clients',
  'list_factures_fournisseurs',
  'list_devis',
  'list_avoirs',
  'list_alertes',
  'list_releves_bancaires',
  'get_taux_change',
  'list_comptes_bancaires',
  'list_ecritures',
  'get_grand_livre',
  'get_rapprochement_status',
  'list_tiers',
  'list_documents',
  'list_employes',
  'list_bulletins_paie',
  'get_plan_comptable',
  'list_lettrage_non_lettrees',
] as const

type AllowedTool = (typeof ALLOWED_TOOLS)[number]

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** Filtre les params null/undefined/'' puis encode en query string. */
function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    sp.set(k, String(v))
  }
  return sp.toString()
}

/* -------------------------------------------------------------------------- */
/*  Mapping tool → endpoint Lexora                                            */
/* -------------------------------------------------------------------------- */
const TOOL_TO_ENDPOINT: Record<AllowedTool, (p: Record<string, any>) => string> = {
  list_societes:                () => `/api/client/societes`,
  get_financial_summary:        (p) => `/api/client/financial?${qs(p)}`,
  list_factures:                (p) => `/api/client/factures?${qs(p)}`,
  list_factures_clients:        (p) => `/api/client/factures?${qs({ ...p, type_facture: 'client' })}`,
  list_factures_fournisseurs:   (p) => `/api/client/factures?${qs({ ...p, type_facture: 'fournisseur' })}`,
  list_devis:                   (p) => `/api/client/factures?${qs({ ...p, type_document: 'devis' })}`,
  list_avoirs:                  (p) => `/api/client/factures?${qs({ ...p, type_document: 'avoir' })}`,
  list_alertes:                 (p) => `/api/client/alertes?${qs(p)}`,
  list_releves_bancaires:       (p) => `/api/client/releves-bancaires?${qs(p)}`,
  // /api/taux-change est public (BOM) ; /api/comptable/taux-change exige session
  get_taux_change:              (p) => `/api/taux-change?${qs(p)}`,
  list_comptes_bancaires:       (p) => `/api/client/comptes-bancaires?${qs(p)}`,
  list_ecritures:               (p) => `/api/client/ecritures?${qs(p)}`,
  get_grand_livre:              (p) => `/api/comptable/grand-livre?${qs(p)}`,
  get_rapprochement_status:     (p) => `/api/comptable/rapprochement/kpis?${qs(p)}`,
  // Pas de route /api/comptable/tiers — on tape factures-contacts (annuaire tiers)
  list_tiers:                   (p) => `/api/client/factures-contacts?${qs(p)}`,
  list_documents:               (p) => `/api/client/documents?${qs(p)}`,
  list_employes:                (p) => `/api/rh/employes?${qs(p)}`,
  list_bulletins_paie:          (p) => `/api/rh/paie?${qs(p)}`,
  get_plan_comptable:           (p) => `/api/client/plan-comptable?${qs(p)}`,
  list_lettrage_non_lettrees:   (p) => `/api/comptable/lettrage?${qs(p)}`,
}

/* -------------------------------------------------------------------------- */
/*  Handler                                                                   */
/* -------------------------------------------------------------------------- */
export async function POST(req: NextRequest) {
  const hmac = await verifyHmac(req)
  if (!hmac.ok) {
    return NextResponse.json(
      { status: 'error', error_msg: `hmac_failed:${hmac.reason}`, result: null },
      { status: 403 },
    )
  }

  return withTelegramAuth(req, 'mcp.call', async (ctx, body) => {
    const tool = String(body?.tool || '') as AllowedTool
    const params: Record<string, any> =
      body?.params && typeof body.params === 'object' ? { ...body.params } : {}

    if (!ALLOWED_TOOLS.includes(tool)) {
      return {
        status: 'error',
        error_msg: `unknown_tool:${tool || '(missing)'}`,
        result: { allowed_tools: ALLOWED_TOOLS },
      }
    }

    // Inject le societe_id depuis le ctx Telegram si l'AI ne l'a pas fourni.
    // Préserve les tools cross-société comme list_societes (qui ne le prend pas).
    if (!params.societe_id && ctx.societe_id && tool !== 'list_societes' && tool !== 'get_taux_change') {
      params.societe_id = ctx.societe_id
    }

    const endpoint = TOOL_TO_ENDPOINT[tool](params)
    const url = `${getLexoraBaseUrl()}${endpoint}`

    let res: Response
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: callLexoraHeaders(ctx.user_id),
        // jamais de cache : KPIs/grand livre sont temps-réel
        cache: 'no-store',
      })
    } catch (e) {
      return {
        status: 'error',
        error_msg: `tool_call_network_error:${e instanceof Error ? e.message : 'unknown'}`,
        result: { tool, endpoint },
      }
    }

    if (!res.ok) {
      const details = await res.text().catch(() => '')
      return {
        status: 'error',
        error_msg: `tool_call_failed:${res.status}`,
        result: {
          tool,
          endpoint,
          http_status: res.status,
          details: details.slice(0, 500),
        },
      }
    }

    let data: any
    try {
      data = await res.json()
    } catch {
      return {
        status: 'error',
        error_msg: 'tool_call_invalid_json',
        result: { tool, endpoint },
      }
    }

    return {
      status: 'success',
      result: {
        tool,
        endpoint,
        data,
      },
    }
  })
}

/** GET pour discovery — n8n / dev peuvent lister les tools dispo. */
export async function GET(req: NextRequest) {
  const hmac = await verifyHmac(req)
  if (!hmac.ok) {
    return NextResponse.json(
      { status: 'error', error_msg: `hmac_failed:${hmac.reason}`, result: null },
      { status: 403 },
    )
  }
  return NextResponse.json({
    status: 'success',
    result: {
      tools: ALLOWED_TOOLS,
      count: ALLOWED_TOOLS.length,
      usage: {
        method: 'POST',
        body: { tool: '<tool_name>', params: { '...': '...' } },
        note: 'societe_id auto-injecté depuis le ctx Telegram s\'il manque.',
      },
    },
  })
}
