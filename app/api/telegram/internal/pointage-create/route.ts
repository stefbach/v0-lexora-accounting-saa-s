import { NextRequest, NextResponse } from 'next/server'
import { verifyHmac } from '@/lib/security/hmac-auth'
import { withTelegramAuth } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  ouvrirSession,
  fermerSession,
  getResumeJour,
  getSessionEnCours,
} from '@/lib/rh/pointage-sessions'

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
 * Délègue à lib/rh/pointage-sessions :
 *   - type='in'  → ouvrirSession(type='travail')
 *   - type='out' → fermerSession(session_en_cours)
 *
 * Spécificités Telegram (non couvertes par les helpers web) :
 *   - Anti-spam 120s sur l'audit telegram_actions
 *   - forgot_out_warning si une session 'travail' antérieure (jour précédent)
 *     est encore ouverte (oubli /out la veille)
 *   - cross-day pour type='out' : si la session ouverte date d'un jour
 *     différent, on flag cross_day=true et on log dans notes la durée réelle
 *     (la trigger duree_minutes côté DB calcule TIME-TIME du même jour).
 *
 * NB : on conserve le calcul UTC (existant) pour la date d'ancrage du
 * pointage, et non todayDateMU(), pour préserver la sémantique historique
 * du bot et éviter une migration de données déjà créées.
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
  const __hmac = await verifyHmac(req)
  if (!__hmac.ok) {
    return NextResponse.json(
      { status: 'error', error_msg: `hmac_failed:${__hmac.reason}`, result: null },
      { status: 403 },
    )
  }

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
      // Sécurité : pas de session "travail" déjà ouverte aujourd'hui.
      // getSessionEnCours retourne la dernière session ouverte du JOUR donné
      // (limit=1, order by heure_debut desc) — équivalent au check existant.
      const enCoursAujourd = await getSessionEnCours(admin, ctx.employe_id, dateStr)
      if (enCoursAujourd && enCoursAujourd.type_session === 'travail') {
        return {
          result: null,
          status: 'denied',
          error_msg: `Une session est déjà ouverte aujourd'hui (depuis ${String(enCoursAujourd.heure_debut).slice(0, 5)}). Faites /out d'abord.`,
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

      // Ouvre la session 'travail' via helper (date/heure overrides pour ts custom)
      const opened = await ouvrirSession(admin, ctx.employe_id, 'travail', {
        date: dateStr,
        heure: heureStr,
        notes: 'Pointage Telegram',
        latitude: lat,
        longitude: lng,
        createdBy: ctx.user_id,
      })
      if (!opened.ok || !opened.session) {
        return { result: null, status: 'error', error_msg: `INSERT session: ${opened.error || 'inconnue'}` }
      }

      return {
        result: {
          type: 'in',
          session_id: opened.session.id,
          date: opened.session.date_pointage,
          heure: String(opened.session.heure_debut).slice(0, 5),
          source: 'telegram',
          forgot_out_warning: forgotOutWarning,
        },
      }
    }

    // --- type='out' -----------------------------------------------------------
    // Cherche la session 'travail' ouverte la plus récente (peut être hier en
    // cas d'oubli). On ne peut pas utiliser getSessionEnCours(date) qui filtre
    // au jour ; on lit directement.
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

    // Cross-day : si la session a été ouverte un jour différent, on ferme avec
    // l'heure courante mais on indique cross_day=true pour info caller.
    const crossDay = session.date_pointage !== dateStr

    // Durée réelle (cross-day inclus) — utile pour log + réponse LLM.
    const dtIn = new Date(`${session.date_pointage}T${session.heure_debut}Z`)
    const dureeMs = ts.getTime() - dtIn.getTime()
    const dureeMin = Math.max(0, Math.round(dureeMs / 60000))

    // Fermeture via helper (set heure_fin uniquement). On UPDATE ensuite les
    // colonnes notes/lat/lng manuellement car fermerSession ne les touche pas.
    const closed = await fermerSession(admin, session.id, heureStr)
    if (!closed.ok) {
      return { result: null, status: 'error', error_msg: `UPDATE session: ${closed.error}` }
    }
    // Patch notes/lat/lng (info Telegram + audit cross-day)
    await admin
      .from('pointages_sessions')
      .update({
        notes: crossDay
          ? `Telegram out (cross-day, durée réelle ${dureeMin} min)`
          : 'Pointage Telegram',
        latitude: lat,
        longitude: lng,
      })
      .eq('id', session.id)

    // Cumul jour via helper (somme des durees_minutes des sessions travail du
    // jour calendrier de la session fermée).
    const resume = await getResumeJour(admin, ctx.employe_id, session.date_pointage)
    const cumulMin = resume.total_travail_minutes

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
