import { NextRequest, NextResponse } from 'next/server'
import { verifyHmac } from '@/lib/security/hmac-auth'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { callLexoraHeaders, getLexoraBaseUrl } from '@/lib/lexora-internal-auth'
import { sendTelegramDocumentBuffer, sendTelegramMessage } from '@/lib/telegram/auth'

/**
 * POST /api/telegram/internal/payroll-bank-file
 *
 * Génère le(s) fichier(s) de virement bancaire des salaires pour une période
 * et les envoie en pièces jointes Telegram. Pilote /api/rh/exports/virement.
 *
 * Rôle minimum : direction (sensible : RIB + montants).
 * Body : { periode: 'YYYY-MM' }
 *
 * Prérequis : période verrouillée (cf. payroll-lock).
 * Sortie : un fichier par banque + un récap CSV des employés sans coordonnées.
 */
export async function POST(req: NextRequest) {
  const __hmac = await verifyHmac(req)
  if (!__hmac.ok) {
    return NextResponse.json(
      { status: 'error', error_msg: `hmac_failed:${__hmac.reason}`, result: null },
      { status: 403 },
    )
  }

  return withTelegramAuth(req, 'payroll.bank_file', async (ctx, body) => {
    if (!hasRole(ctx, 'direction')) {
      return { result: null, status: 'denied', error_msg: 'Génération des virements salaires réservée à la direction' }
    }
    const periode = String(body?.periode || '').slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      return { result: null, status: 'error', error_msg: 'periode YYYY-MM requise' }
    }

    const baseUrl = getLexoraBaseUrl()
    const res = await fetch(`${baseUrl}/api/rh/exports/virement`, {
      method: 'POST',
      headers: callLexoraHeaders(ctx.user_id),
      body: JSON.stringify({
        societe_id: ctx.societe_id,
        periode,
        format: 'json',
      }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { result: null, status: 'error', error_msg: j?.error || `HTTP ${res.status}` }
    }

    const fichiers: Array<{ filename: string; content: string; banque: string; nb_employes: number; montant_total: number; devise: string }> =
      j?.recap?.fichiers || j?.fichiers || []
    if (fichiers.length === 0) {
      return { result: null, status: 'error', error_msg: 'Aucun fichier généré (aucun bulletin verrouillé ?).' }
    }

    // Récap d'abord
    const recap = j.recap || {}
    const recapMsg =
      `💼 <b>Virements salaires ${periode}</b>\n` +
      `${recap.nb_bulletins_total ?? '?'} bulletins · ${recap.nb_banques ?? fichiers.length} banque(s)\n` +
      `Total MUR : ${(recap.montant_total_mur || 0).toLocaleString('fr-FR')}\n` +
      (recap.nb_employes_sans_banque ? `⚠️ ${recap.nb_employes_sans_banque} employé(s) sans coord. bancaires\n` : '') +
      `\n📎 ${fichiers.length} fichier(s) à transmettre à ta banque :`
    try { await sendTelegramMessage(ctx.chat_id, recapMsg) } catch { /* noop */ }

    // Envoie chaque fichier
    let sent = 0
    const errors: string[] = []
    for (const f of fichiers) {
      try {
        await sendTelegramDocumentBuffer(
          ctx.chat_id,
          Buffer.from(f.content, 'utf-8'),
          f.filename,
          f.filename.endsWith('.xml') ? 'application/xml' : 'text/csv',
          `🏦 ${f.banque} · ${f.devise} · ${f.nb_employes} employé(s) · ${Number(f.montant_total || 0).toLocaleString('fr-FR')}`,
        )
        sent++
      } catch (e: any) {
        errors.push(`${f.filename}: ${e.message}`)
      }
    }

    return {
      result: {
        periode,
        nb_fichiers_envoyes: sent,
        nb_fichiers_attendus: fichiers.length,
        nb_employes_sans_banque: recap.nb_employes_sans_banque || 0,
        total_mur: recap.montant_total_mur || 0,
        errors: errors.length > 0 ? errors : undefined,
      },
    }
  })
}
