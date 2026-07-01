import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'
import { callClaudeDocumentJSON } from '@/lib/claude'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(String(v).replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

type FinExtract = {
  year?: number | string; currency?: string
  revenue?: unknown; gross_profit?: unknown; operating_profit?: unknown; net_profit?: unknown
  total_assets?: unknown; current_assets?: unknown; cash?: unknown
  total_liabilities?: unknown; current_liabilities?: unknown
  equity?: unknown; share_capital?: unknown; retained_earnings?: unknown
}

/**
 * POST /api/client/societes/import-financials
 * Body : { societe_id, pdf_base64 }
 * Numérise des états financiers (bilan + compte de résultat) et enregistre
 * les éléments de l'exercice dans societe_financials.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY manquant' }, { status: 503 })

  const b = await req.json().catch(() => null) as { societe_id?: string; pdf_base64?: string } | null
  if (!b?.societe_id || !b.pdf_base64) return NextResponse.json({ error: 'societe_id et pdf_base64 requis' }, { status: 400 })

  const admin = getAdminClient()
  try { await assertSocieteAccess(admin, user.id, b.societe_id) }
  catch { return NextResponse.json({ error: 'Accès société refusé' }, { status: 403 }) }

  const pdf = b.pdf_base64.includes(',') ? b.pdf_base64.split(',')[1] : b.pdf_base64
  const system = `Tu numérises des états financiers annuels (Statement of Financial Position / Balance Sheet + Statement of Profit or Loss) et tu extrais les montants de l'exercice le plus récent présenté. Réponds STRICTEMENT en JSON :
{
  "year": 0, "currency": "",
  "revenue": null, "gross_profit": null, "operating_profit": null, "net_profit": null,
  "total_assets": null, "current_assets": null, "cash": null,
  "total_liabilities": null, "current_liabilities": null,
  "equity": null, "share_capital": null, "retained_earnings": null
}
Règles : n'invente RIEN (null si absent). Montants en nombres (sans séparateur de milliers, les parenthèses = négatif). "year" = année de clôture de l'exercice principal.`

  let fx: FinExtract = {}
  try {
    fx = await callClaudeDocumentJSON<FinExtract>(system, "Extrais les éléments financiers de l'exercice.", pdf, 2048)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Numérisation échouée' }, { status: 502 })
  }

  const year = Number(String(fx.year || '').replace(/[^\d]/g, '')) || new Date().getFullYear() - 1
  const row = {
    societe_id: b.societe_id, year, currency: fx.currency || 'MUR',
    revenue: num(fx.revenue), gross_profit: num(fx.gross_profit), operating_profit: num(fx.operating_profit), net_profit: num(fx.net_profit),
    total_assets: num(fx.total_assets), current_assets: num(fx.current_assets), cash: num(fx.cash),
    total_liabilities: num(fx.total_liabilities), current_liabilities: num(fx.current_liabilities),
    equity: num(fx.equity), share_capital: num(fx.share_capital), retained_earnings: num(fx.retained_earnings),
    details_json: fx as unknown as Record<string, unknown>, source: 'financial_statements', updated_at: new Date().toISOString(),
  }
  const { error } = await admin.from('societe_financials').upsert(row, { onConflict: 'societe_id,year' })
  if (error) return NextResponse.json({ error: `Enregistrement échoué : ${error.message}` }, { status: 500 })
  return NextResponse.json({ ok: true, year, financials: row })
}
