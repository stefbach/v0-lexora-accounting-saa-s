import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { callLexoraHeaders, getLexoraBaseUrl } from '@/lib/lexora-internal-auth'
import { submitMraDeclaration } from '@/lib/telegram/mra-robot'
import { sendTelegramDocumentBuffer, sendTelegramMessage } from '@/lib/telegram/auth'

/**
 * POST /api/telegram/internal/payroll-mra-submit
 *
 * Workflow complet de soumission MRA pour une déclaration :
 *  1. Génère les fichiers (PAYE/CSG/PRGF) via /api/rh/exports/*
 *  2. Tente la soumission auto via robot Playwright (lib/telegram/mra-robot.ts)
 *  3. Si auto impossible (CAPTCHA / 2FA / stub) → envoie les fichiers en PJ
 *     Telegram pour soumission manuelle, et marque last_submit_status='manual_needed'
 *  4. Si succès → message confirmation + référence MRA + screenshot accusé
 *
 * Rôle minimum : direction.
 * Body : { type: 'paye'|'csg'|'prgf', periode: 'YYYY-MM', confirm: true }
 */
const TYPE_INFO: Record<string, { label: string; path: string; method?: 'POST' | 'GET_CSV' }> = {
  paye: { label: 'PAYE', path: '/api/rh/exports/paye-mra' },
  csg:  { label: 'CSG/NSF', path: '/api/rh/exports/csg-mra' },
  prgf: { label: 'PRGF', path: '/api/rh/exports/prgf-mra' },
  vat:  { label: 'VAT', path: '/api/comptable/tva/export', method: 'GET_CSV' },
}

export async function POST(req: NextRequest) {
  return withTelegramAuth(req, 'payroll.mra_submit', async (ctx, body) => {
    if (!hasRole(ctx, 'direction')) {
      return { result: null, status: 'denied', error_msg: 'Soumission MRA réservée à la direction' }
    }
    const type = String(body?.type || '').toLowerCase() as keyof typeof TYPE_INFO
    const periode = String(body?.periode || '').slice(0, 7)
    if (!TYPE_INFO[type]) {
      return { result: null, status: 'error', error_msg: 'type doit être paye | csg | prgf' }
    }
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      return { result: null, status: 'error', error_msg: 'periode YYYY-MM requise' }
    }
    if (body?.confirm !== true) {
      return {
        result: {
          requires_confirm: true,
          message: `Soumettre la déclaration ${TYPE_INFO[type].label} ${periode} à la MRA ? ` +
            `Le robot tentera la soumission auto avec les credentials configurées. Confirme avec confirm:true.`,
        },
      }
    }

    // 1. Génère les fichiers (méthode différente selon le type)
    const baseUrl = getLexoraBaseUrl()
    const files: Array<{ filename: string; content: string }> = []
    const cfg = TYPE_INFO[type]

    if (cfg.method === 'GET_CSV') {
      // VAT : 2 CSVs (sales + purchases)
      for (const fmt of ['sales_csv', 'purchases_csv'] as const) {
        const url = `${baseUrl}${cfg.path}?societe_id=${encodeURIComponent(ctx.societe_id)}&periode=${encodeURIComponent(periode)}&format=${fmt}`
        const res = await fetch(url, { method: 'GET', headers: callLexoraHeaders(ctx.user_id) })
        if (!res.ok) {
          const err = await res.text().catch(() => '')
          return { result: null, status: 'error', error_msg: `VAT ${fmt} HTTP ${res.status}: ${err.slice(0, 150)}` }
        }
        const cd = res.headers.get('content-disposition') || ''
        const m = cd.match(/filename="?([^"]+)"?/)
        files.push({ filename: m?.[1] || `TVA_${fmt}_${periode}.csv`, content: await res.text() })
      }
    } else {
      const genRes = await fetch(`${baseUrl}${cfg.path}`, {
        method: 'POST',
        headers: callLexoraHeaders(ctx.user_id),
        body: JSON.stringify({ societe_id: ctx.societe_id, periode }),
      })
      const j = await genRes.json().catch(() => ({}))
      if (!genRes.ok) {
        return { result: null, status: 'error', error_msg: j?.error || `Échec génération fichiers : HTTP ${genRes.status}` }
      }
      if (j.recap_csv && j.filename_recap) files.push({ filename: j.filename_recap, content: j.recap_csv })
      if (j.detail_csv && j.filename_detail) files.push({ filename: j.filename_detail, content: j.detail_csv })
      if (j.xml && j.filename_xml) files.push({ filename: j.filename_xml, content: j.xml })
    }

    if (files.length === 0) {
      return { result: null, status: 'error', error_msg: 'Aucun fichier généré.' }
    }

    // 2. Tente la soumission auto
    const submission = await submitMraDeclaration({
      societe_id: ctx.societe_id,
      type: type as any,
      periode,
      files,
    })

    // 3. Si manual_needed ou failed → envoie les fichiers en PJ pour soumission manuelle
    if (submission.status !== 'success') {
      try {
        await sendTelegramMessage(
          ctx.chat_id,
          `⚠️ <b>${TYPE_INFO[type].label} ${periode} — Soumission manuelle requise</b>\n${submission.message}\n\nFichiers à uploader sur https://eservices.mra.mu :`,
        )
        for (const f of files) {
          await sendTelegramDocumentBuffer(
            ctx.chat_id,
            Buffer.from(f.content, 'utf-8'),
            f.filename,
            f.filename.endsWith('.xml') ? 'application/xml' : 'text/csv',
            `${TYPE_INFO[type].label} · ${periode}`,
          )
        }
      } catch {}
      return {
        result: {
          status: submission.status,
          message: submission.message,
          nb_files_sent: files.length,
        },
      }
    }

    // 4. Success
    try {
      await sendTelegramMessage(
        ctx.chat_id,
        `✅ <b>${TYPE_INFO[type].label} ${periode} soumis à la MRA</b>\n` +
        (submission.ack_ref ? `Référence : <code>${submission.ack_ref}</code>` : ''),
      )
      if (submission.screenshot_b64) {
        await sendTelegramDocumentBuffer(
          ctx.chat_id,
          Buffer.from(submission.screenshot_b64, 'base64'),
          `mra_ack_${type}_${periode}.png`,
          'image/png',
          'Accusé de réception MRA',
        )
      }
    } catch {}

    return {
      result: {
        status: 'success',
        ack_ref: submission.ack_ref,
        message: submission.message,
      },
    }
  })
}
