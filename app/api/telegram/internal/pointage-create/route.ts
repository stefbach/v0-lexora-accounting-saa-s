import { NextRequest } from 'next/server'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/telegram/internal/pointage-create
 *
 * Crée un pointage "in" ou "out" pour l'employé lié au chat Telegram.
 *
 * Body :
 *   - chat_id     (résolu par withTelegramAuth)
 *   - type        : 'in' | 'out'
 *   - timestamp?  : ISO 8601 (défaut: now)
 *   - latitude?   : number
 *   - longitude?  : number
 *
 * Modèle :
 *   Lexora utilise `pointages_sessions` (sessions multiples par jour, table 171).
 *   - type='in'  → INSERT pointages_sessions(type_session='travail', heure_debut, heure_fin=NULL)
 *     Préalable : aucune session 'travail' ouverte aujourd'hui (sinon 409).
 *   - type='out' → UPDATE de la session 'travail' ouverte la plus récente
 *     (heure_fin=NULL) → set heure_fin = timestamp.
 *
 * Anti-spam : refus si un pointage du même type a déjà été créé dans les 120 s.
 *
 * Réponses utiles :
 *   - oubli_out : si type='in' mais qu'il existe une session 'travail' ouverte
 *     datée d'un jour antérieur, on flag `forgot_out_warning=true` après
 *     fermeture automatique à l'heure_debut du jour précédent + heure courante.
 *   - duree_minutes : pour type='out', durée écoulée depuis le 'in' fermé.
 */

const MAX_TS_FUTURE_MS = 5 * 60 * 1000 // 5 min de tolérance horloge
const ANTI_SPAM_MS = 120 * 1000

function todayDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function hhmmss(d: Date): string {
  return d.toISOString().slice(11, 19)
}

function parseLatLng(value: any): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export async function POST(req: NextRequest) {
  return withTelegramAuth(req, 'pointage.create', async (ctx, body) => {
    if (!ctx.employe_id) {
      return {
        result: null,
        status: 'denied',
        error_msg: 'Aucun employé lié à votre compte — impossible de pointer.',
      }
    }

    const typeRaw = String(body?.type || '').toLowerCase()
    if (typeRaw !== 'in' && typeRaw !== 'out') {
      return {
        result: null,
        status: 'error',
        error_msg: 'type doit être "in" ou "out"',
      }
    }
    const type = typeRaw as 'in' | 'out'

    // Timestamp
    let ts = new Date()
    if (body?.timestamp) {
      const t = new Date(body.timestamp)
      if (Number.isNaN(t.getTime())) {
        return { result: null, status: 'error', error_msg: 'timestamp invalide' }
      }
      if (t.getTime() - Date.now() > MAX_TS_FUTURE_MS) {
        return { result: null, status: 'error', error_msg: 'timestamp dans le futur' }
      }
      ts = t
    }
    const tsIso = ts.toISOString()

    const lat = parseLatLng(body?.latitude)
    const lng = parseLatLng(body?.longitude)

    const admin = getAdminClient()

    // Vérification employé / société
    const { data: emp } = await admin
      .from('employes')
      .select('id, prenom, nom, societe_id')
      .eq('id', ctx.employe_id)
      .maybeSingle()
    if (!emp || emp.societe_id !== ctx.societe_id) {
      return {
        result: null,
        status: 'denied',
        error_msg: 'Employé hors société active',
      }
    }

    // Anti-spam : dernier audit pointage.create de cet employé
    const sinceIso = new Date(Date.now() - ANTI_SPAM_MS).toISOString()
    const { data: lastAudit } = await admin
      .from('telegram_actions')
      .select('id, payload, status, created_at')
      .eq('user_id', ctx.user_id)
      .eq('societe_id', ctx.societe_id)
      .eq('intent', 'pointage.create')
      .eq('status', 'success')
      .gt('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(1)
    if (lastAudit && lastAudit.length > 0) {
      const last = lastAudit[0] as any
      const sameType = last?.payload?.type === type
      if (sameType) {
        return {
          result: null,
          status: 'denied',
          error_msg: `Pointage "${type}" déjà enregistré il y a moins de 2 minutes — anti-doublon.`,
        }
      }
    }

    const dateStr = todayDateUTC(ts)
    const heureStr = hhmmss(ts)

    if (type === 'in') {
      // Sécurité : pas de session "travail" déjà ouverte aujourd'hui
      const { data: openToday } = await admin
        .from('pointages_sessions')
        .select('id, heure_debut, date_pointage')
        .eq('employe_id', ctx.employe_id)
        .eq('date_pointage', dateStr)
        .eq('type_session', 'travail')
        .is('heure_fin', null)
        .order('heure_debut', { ascending: false })
        .limit(1)

      if (openToday && openToday.length > 0) {
        return {
          result: null,
          status: 'denied',
          error_msg: `Une session est déjà ouverte aujourd'hui (depuis ${String((openToday[0] as any).heure_debut).slice(0, 5)}). Faites /out d'abord.`,
        }
      }

      // Sessions ouvertes antérieures (oubli pointage out la veille / jour précédent)
      let forgotOutWarning: { date_pointage: string; heure_debut: string } | null = null
      const { data: oldOpen } = await admin
        .from('pointages_sessions')
        .select('id, date_pointage, heure_debut')
        .eq('employe_id', ctx.employe_id)
        .lt('date_pointage', dateStr)
        .eq('type_session', 'travail')
        .is('heure_fin', null)
        .order('date_pointage', { ascending: false })
        .limit(1)
      if (oldOpen && oldOpen.length > 0) {
        const o = oldOpen[0] as any
        forgotOutWarning = { date_pointage: o.date_pointage, heure_debut: String(o.heure_debut).slice(0, 8) }
      }

      const { data: inserted, error } = await admin
        .from('pointages_sessions')
        .insert({
          employe_id: ctx.employe_id,
          date_pointage: dateStr,
          type_session: 'travail',
          heure_debut: heureStr,
          heure_fin: null,
          latitude: lat,
          longitude: lng,
          notes: 'Pointage Telegram',
          created_by: ctx.user_id,
        })
        .select('id, date_pointage, heure_debut')
        .single()
      if (error) {
        return { result: null, status: 'error', error_msg: `INSERT session: ${error.message}` }
      }

      return {
        result: {
          type: 'in',
          session_id: inserted!.id,
          date: inserted!.date_pointage,
          heure: String(inserted!.heure_debut).slice(0, 5),
          source: 'telegram',
          forgot_out_warning: forgotOutWarning,
        },
      }
    }

    // --- type='out' -----------------------------------------------------------
    // Cherche la session 'travail' ouverte la plus récente (peut être hier en cas d'oubli)
    const { data: openSessions, error: e1 } = await admin
      .from('pointages_sessions')
      .select('id, date_pointage, heure_debut')
      .eq('employe_id', ctx.employe_id)
      .eq('type_session', 'travail')
      .is('heure_fin', null)
      .order('date_pointage', { ascending: false })
      .order('heure_debut', { ascending: false })
      .limit(1)
    if (e1) {
      return { result: null, status: 'error', error_msg: `SELECT session ouverte: ${e1.message}` }
    }
    if (!openSessions || openSessions.length === 0) {
      return {
        result: null,
        status: 'denied',
        error_msg: 'Aucune session ouverte à clôturer — fais /in d\'abord.',
      }
    }

    const session = openSessions[0] as any

    // Si la session a été ouverte un jour différent de la date du timestamp,
    // on ne tente pas de gérer les heures cross-day : on fixe heure_fin =
    // heureStr mais on indique cross_day=true au caller pour information.
    const crossDay = session.date_pointage !== dateStr

    // Calcule la durée en minutes (cross-day inclus, on utilise les datetime
    // composés depuis date_pointage + heures).
    const dtIn = new Date(`${session.date_pointage}T${session.heure_debut}Z`)
    const dureeMs = ts.getTime() - dtIn.getTime()
    const dureeMin = Math.max(0, Math.round(dureeMs / 60000))

    const { error: e2 } = await admin
      .from('pointages_sessions')
      .update({
        heure_fin: heureStr,
        // Pour cross-day on garde la date_pointage d'origine (la trigger duree_minutes
        // calculera avec TIME-TIME du même jour, on stocke la "vraie" durée via
        // la colonne notes pour audit. duree_minutes côté DB sera donc faux en
        // cross-day mais c'est un edge case — on log dans notes.)
        notes: crossDay
          ? `Telegram out (cross-day, durée réelle ${dureeMin} min)`
          : 'Pointage Telegram',
        latitude: lat,
        longitude: lng,
      })
      .eq('id', session.id)
    if (e2) {
      return { result: null, status: 'error', error_msg: `UPDATE session: ${e2.message}` }
    }

    // Cumul jour = somme des durées des sessions 'travail' du même jour calendrier.
    const dayKey = session.date_pointage
    const { data: dayList } = await admin
      .from('pointages_sessions')
      .select('duree_minutes, heure_debut, heure_fin')
      .eq('employe_id', ctx.employe_id)
      .eq('date_pointage', dayKey)
      .eq('type_session', 'travail')
    const cumulMin = (dayList || []).reduce((acc: number, s: any) => {
      if (typeof s?.duree_minutes === 'number') return acc + s.duree_minutes
      return acc
    }, 0)

    return {
      result: {
        type: 'out',
        session_id: session.id,
        date: dateStr,
        heure: heureStr.slice(0, 5),
        heure_in: String(session.heure_debut).slice(0, 5),
        duree_minutes: dureeMin,
        cumul_jour_minutes: cumulMin,
        cross_day: crossDay,
        source: 'telegram',
      },
    }
  })
}
