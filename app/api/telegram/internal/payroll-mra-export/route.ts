import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { callLexoraHeaders, getLexoraBaseUrl } from '@/lib/lexora-internal-auth'
import { sendTelegramDocumentBuffer, sendTelegramMessage } from '@/lib/telegram/auth'

/**
 * POST /api/telegram/internal/payroll-mra-export
 *
 * Génère les exports MRA (PAYE, CSG/NSF, PRGF) pour une période et les
 * envoie en PJ Telegram. Pilote /api/rh/exports/{paye,csg,prgf}-mra.
 *
 * Body : { periode: 'YYYY-MM', type: 'paye' | 'csg' | 'prgf' | 'all' }
 * Rôle minimum : rh (ou comptable).
 *
 * Prérequis : période verrouillée.
 */

const MAP: Record<string, { path: string; label: string }> = {
  paye: { path: '/api/rh/exports/paye-mra', label: 'PAYE' },
  csg: { path: '/api/rh/exports/csg-mra', label: 'CSG/NSF' },
  prgf: { path: '/api/rh/exports/prgf-mra', label: 'PRGF' },
}

async function generateOne(
  baseUrl: string,
  user_id: string,
  societe_id: string,
  periode: string,
  type: keyof typeof MAP,
): Promise<{ ok: boolean; files?: Array<{ filename: string; content: string }>; error?: string }> {
  const cfg = MAP[type]
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

export async function POST(req: NextRequest) {
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
      return { result: null, status: 'error', error_msg: `type doit être paye, csg, prgf ou all` }
    }

    const baseUrl = getLexoraBaseUrl()
    const types: Array<keyof typeof MAP> = type === 'all' ? ['paye', 'csg', 'prgf'] : [type as any]
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
      } catch {}
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
