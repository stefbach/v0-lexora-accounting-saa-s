/**
 * Cron horaire — Alerte Telegram "santé PCM" en rouge.
 *
 * Surveille la vue `v_sante_pcm` (mig 303) et envoie une alerte Telegram
 * dès qu'une société passe en "rouge" : sante_couleur = 'rouge' OU
 * desequilibre_global > 1.00 MUR (sécurité — la vue applique déjà cette
 * règle, on la redouble côté API).
 *
 * Idempotence quotidienne (table `alertes_pcm_envoyees`, mig 305) :
 *   - On ne renvoie pas une alerte pour la même société dans la même
 *     journée si une alerte identique (même couleur) a déjà été loggée.
 *
 * Destinataires : direction + client_admin + admin + super_admin de la
 * société (via `chatIdsForRole` / `lib/telegram/notify.ts`).
 *
 * AUTH : Header `Authorization: Bearer <CRON_SECRET>` (verifyCronSecret).
 *
 * Schedule : "0 * * * *" (toutes les heures, cf. vercel.json).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyCronSecret } from '@/lib/claude'
import { chatIdsForRole, pushTo } from '@/lib/telegram/notify'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function fmtMUR(n: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n) + ' MUR'
}

type SanteRow = {
  societe_id: string
  total_d_global: number | string
  total_c_global: number | string
  desequilibre_global: number | string
  nb_journaux_desequilibres: number
  nb_folios_desequilibres: number
  nb_ecritures_orphelines: number
  nb_comptes_invalides: number
  nb_ecritures_total: number
  sante_score: number
  sante_couleur: 'vert' | 'orange' | 'rouge'
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const cronName = 'sante-pcm-alert'
  const errors: Array<{ societe_id?: string; message: string }> = []

  try {
    // 1. Sociétés en rouge depuis la vue
    const { data: rows, error: vErr } = await supabase
      .from('v_sante_pcm')
      .select('*')
      .or('sante_couleur.eq.rouge,desequilibre_global.gt.1.00,desequilibre_global.lt.-1.00')

    if (vErr) throw vErr

    const redSocietes = (rows || []) as SanteRow[]
    const nbRed = redSocietes.length

    if (!nbRed) {
      await supabase.from('cron_logs').insert({
        cron_name: cronName,
        statut: 'success',
        nb_societes_traitees: 0,
        nb_alertes_creees: 0,
        details: { nb_societes_red: 0 },
      }).then(() => {}, () => {})
      return NextResponse.json({
        nb_societes_red: 0,
        nb_alertes_envoyees: 0,
        errors: [],
      })
    }

    // 2. Lookup noms de sociétés (un seul round-trip)
    const societeIds = redSocietes.map(r => r.societe_id)
    const { data: societes } = await supabase
      .from('societes')
      .select('id, nom')
      .in('id', societeIds)
    const nomById = new Map<string, string>((societes || []).map((s: any) => [s.id, s.nom]))

    // 3. Lookup alertes déjà envoyées AUJOURD'HUI (idempotence)
    const startOfDay = new Date()
    startOfDay.setUTCHours(0, 0, 0, 0)
    const { data: alreadySent } = await supabase
      .from('alertes_pcm_envoyees')
      .select('societe_id, sante_couleur')
      .in('societe_id', societeIds)
      .gte('sent_at', startOfDay.toISOString())
    const sentToday = new Set<string>(
      (alreadySent || []).map((a: any) => `${a.societe_id}:${a.sante_couleur}`),
    )

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.LEXORA_BASE_URL ||
      `https://${process.env.VERCEL_URL || 'lexora.app'}`

    let nbAlertesEnvoyees = 0

    // 4. Pour chaque société en rouge, envoyer si pas encore envoyé aujourd'hui
    for (const row of redSocietes) {
      const key = `${row.societe_id}:${row.sante_couleur}`
      if (sentToday.has(key)) continue

      const nom = nomById.get(row.societe_id) || row.societe_id.slice(0, 8)
      const desequilibre = Number(row.desequilibre_global || 0)
      const score = row.sante_score
      const link = `${baseUrl.replace(/\/$/, '')}/comptable/sante-pcm`

      const text =
        `🚨 <b>Santé PCM en rouge — ${nom}</b>\n` +
        `Score : <b>${score}/100</b>\n` +
        `Déséquilibre global : <b>${fmtMUR(desequilibre)}</b>\n` +
        `Journaux déséquilibrés : ${row.nb_journaux_desequilibres}\n` +
        `Folios déséquilibrés : ${row.nb_folios_desequilibres}\n` +
        `Écritures orphelines : ${row.nb_ecritures_orphelines}\n` +
        `Comptes hors PCG : ${row.nb_comptes_invalides}\n\n` +
        `🔗 <a href="${link}">Ouvrir le tableau de bord</a>`

      let recipients: Awaited<ReturnType<typeof chatIdsForRole>> = []
      try {
        recipients = await chatIdsForRole(row.societe_id, [
          'direction',
          'client_admin',
          'admin',
          'super_admin',
        ])
      } catch (e: any) {
        errors.push({ societe_id: row.societe_id, message: `chatIdsForRole: ${e?.message || e}` })
      }

      let nbOk = 0
      let nbKo = 0
      for (const r of recipients) {
        const ok = await pushTo(r.chat_id, text, row.societe_id, 'notify.sante_pcm.rouge')
        if (ok) nbOk++
        else nbKo++
      }

      // 5. Log de l'envoi (même si 0 destinataires, pour bloquer le re-envoi)
      const { error: insErr } = await supabase.from('alertes_pcm_envoyees').insert({
        societe_id: row.societe_id,
        sante_couleur: row.sante_couleur,
        sante_score: score,
        desequilibre_global: desequilibre,
        nb_destinataires: recipients.length,
        nb_envois_ok: nbOk,
        nb_envois_ko: nbKo,
        details: {
          nb_journaux: row.nb_journaux_desequilibres,
          nb_folios: row.nb_folios_desequilibres,
          nb_orphelines: row.nb_ecritures_orphelines,
          nb_comptes_invalides: row.nb_comptes_invalides,
          recipients: recipients.map(r => r.user_id),
        },
      })
      if (insErr) {
        errors.push({ societe_id: row.societe_id, message: `insert log: ${insErr.message}` })
      }

      if (nbOk > 0) nbAlertesEnvoyees++
    }

    // 6. Log cron global
    await supabase.from('cron_logs').insert({
      cron_name: cronName,
      statut: errors.length ? 'partial' : 'success',
      nb_societes_traitees: nbRed,
      nb_alertes_creees: nbAlertesEnvoyees,
      details: { nb_societes_red: nbRed },
      erreurs: errors.length ? { errors } : null,
    }).then(() => {}, () => {})

    return NextResponse.json({
      nb_societes_red: nbRed,
      nb_alertes_envoyees: nbAlertesEnvoyees,
      errors,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur inconnue'
    await supabase.from('cron_logs').insert({
      cron_name: cronName,
      statut: 'error',
      erreurs: { message: msg },
    }).then(() => {}, () => {})
    return NextResponse.json(
      { nb_societes_red: 0, nb_alertes_envoyees: 0, errors: [{ message: msg }] },
      { status: 500 },
    )
  }
}
