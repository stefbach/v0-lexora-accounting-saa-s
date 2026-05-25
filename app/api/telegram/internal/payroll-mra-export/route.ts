import { NextRequest, NextResponse } from 'next/server'
import { verifyHmac } from '@/lib/security/hmac-auth'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { callLexoraHeaders, getLexoraBaseUrl } from '@/lib/lexora-internal-auth'
import { sendTelegramDocumentBuffer, sendTelegramMessage } from '@/lib/telegram/auth'

/**
 * POST /api/telegram/internal/payroll-mra-export
 *
 * Génère les exports MRA (PAYE, CSG/NSF, PRGF, VAT) pour une période et les
 * envoie en PJ Telegram. Pilote les endpoints Lexora existants.
 *
 * Body : { periode: 'YYYY-MM', type: 'paye' | 'csg' | 'prgf' | 'vat' | 'all' }
 * Rôle minimum : rh (ou comptable).
 *
 * Prérequis : période verrouillée (pour paye/csg/prgf). VAT scrape les factures.
 */

const MAP: Record<string, { path: string; label: string; method: 'POST' | 'GET_CSV' }> = {
  paye: { path: '/api/rh/exports/paye-mra', label: 'PAYE', method: 'POST' },
  csg:  { path: '/api/rh/exports/csg-mra',  label: 'CSG/NSF', method: 'POST' },
  prgf: { path: '/api/rh/exports/prgf-mra', label: 'PRGF', method: 'POST' },
  vat:  { path: '/api/comptable/tva/export', label: 'VAT', method: 'GET_CSV' },
}

async function generateOne(
  baseUrl: string,
  user_id: string,
  societe_id: string,
  periode: string,
  type: keyof typeof MAP,
): Promise<{ ok: boolean; files?: Array<{ filename: string; content: string }>; error?: string }> {
  const cfg = MAP[type]

  if (cfg.method === 'POST') {
    const res = await fetch(`${baseUrl}${cfg.path}`, {
      method: 'POST',
      headers: callLexoraHeaders(user_id),
      body: JSON.stringify({ societe_id, periode }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: j?.error || `HTTP ${res.status}` }
    const files: Array<{ filename: string; content: string }> = []
    if (j.recap_csv && j.filename_recap) files.push({ filename: j.filename_recap, content: j.recap_csv })
    if (j.detail_csv && j.filename_detail) files.push({ filename: j.filename_detail, content: j.detail_csv })
    if (j.xml && j.filename_xml) files.push({ filename: j.filename_xml, content: j.xml })
    if (j.files && Array.isArray(j.files)) for (const f of j.files) files.push(f)
    return { ok: true, files }
  }

  // GET_CSV : VAT — 2 fichiers (sales + purchases) à récupérer en CSV
  const files: Array<{ filename: string; content: string }> = []
  for (const fmt of ['sales_csv', 'purchases_csv'] as const) {
    const url = `${baseUrl}${cfg.path}?societe_id=${encodeURIComponent(societe_id)}&periode=${encodeURIComponent(periode)}&format=${fmt}`
    const res = await fetch(url, {
      method: 'GET',
      headers: callLexoraHeaders(user_id),
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      return { ok: false, error: `VAT ${fmt} HTTP ${res.status}: ${errBody.slice(0, 150)}` }
    }
    const cd = res.headers.get('content-disposition') || ''
    const filenameMatch = cd.match(/filename="?([^"]+)"?/)
    const filename = filenameMatch?.[1] || `TVA_${fmt}_${periode}.csv`
    const content = await res.text()
    files.push({ filename, content })
  }
  return { ok: true, files }
}

export async function POST(req: NextRequest) {
  const __hmac = await verifyHmac(req)
  if (!__hmac.ok) {
    return NextResponse.json(
      { status: 'error', error_msg: `hmac_failed:${__hmac.reason}`, result: null },
      { status: 403 },
    )
  }

  return withTelegramAuth(req, 'payroll.mra_export', async (ctx, body) => {
    if (!hasRole(ctx, 'rh')) {
      return { result: null, status: 'denied', error_msg: 'Exports MRA réservés aux rôles RH/comptable et plus' }
    }
    const periode = String(body?.periode || '').slice(0, 7)
    const type = String(body?.type || 'all').toLowerCase()
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      return { result: null, status: 'error', error_msg: 'periode YYYY-MM requise' }
    }
    if (type !== 'all' && !MAP[type]) {
      return { result: null, status: 'error', error_msg: `type doit être paye, csg, prgf, vat ou all` }
    }

    const baseUrl = getLexoraBaseUrl()
    const types: Array<keyof typeof MAP> = type === 'all'
      ? ['paye', 'csg', 'prgf', 'vat']
      : [type as any]
    const results: Record<string, any> = {}
    let totalFiles = 0
    let totalSent = 0

    for (const t of types) {
      const r = await generateOne(baseUrl, ctx.user_id, ctx.societe_id, periode, t)
      results[t] = r
      if (!r.ok || !r.files) continue
      totalFiles += r.files.length
      try {
        await sendTelegramMessage(ctx.chat_id, `📊 <b>Déclaration ${MAP[t].label}</b> — ${periode} (${r.files.length} fichier(s))`)
      } catch { /* noop */ }
      for (const f of r.files) {
        try {
          await sendTelegramDocumentBuffer(
            ctx.chat_id,
            Buffer.from(f.content, 'utf-8'),
            f.filename,
            f.filename.endsWith('.xml') ? 'application/xml' : 'text/csv',
            `${MAP[t].label} · ${periode}`,
          )
          totalSent++
        } catch (e: any) {
          results[t].errors = results[t].errors || []
          results[t].errors.push(`${f.filename}: ${e.message}`)
        }
      }
    }

    return {
      result: {
        periode,
        types: Object.keys(results),
        nb_fichiers_envoyes: totalSent,
        nb_fichiers_attendus: totalFiles,
        details: results,
      },
    }
  })
}
