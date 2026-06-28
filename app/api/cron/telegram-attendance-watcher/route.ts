/**
 * Cron — Surveillance présence employés (toutes les 5 minutes).
 *
 * Pour chaque planning_assignment du jour :
 *   - Si l'employé devait commencer il y a > 10 min ET aucun pointage in
 *     ET aucune demande_conges approuvée pour aujourd'hui → alerte.
 *
 * Envois (best-effort) :
 *   - À l'employé (si chat Telegram lié) : "Tu es attendu depuis 10 min…"
 *     + boutons [✅ Je pointe maintenant] [🤒 Sick leave] [🌴 Congé urgent]
 *   - Au manager (via employes.manager_id → user_id) : "<Prénom Nom> n'est pas pointé…"
 *     + boutons [✅ Excusé] [⚠️ Marquer absent] [📞 Contacter]
 *
 * Idempotence : `telegram_attendance_alerts(employe_id, date_planning)` —
 *   max 3 alertes par jour par employé (champ alert_count).
 *
 * AUTH : Header 'Authorization: Bearer <CRON_SECRET>'.
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { verifyCronSecret } from '@/lib/claude'
import { sendTelegramInlineButtons, type InlineButton } from '@/lib/telegram/auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type ServiceClient = ReturnType<typeof getServiceClient>

const LATE_THRESHOLD_MIN = 15
const MAX_ALERTS_PER_DAY = 3
const MIN_GAP_BETWEEN_ALERTS_MIN = 30

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// Mauritius is permanently UTC+4 (no DST). Plannings stockent heure_debut
// en heure locale Maurice — il faut convertir pour comparer avec now() UTC.
const MU_OFFSET_HOURS = 4

function todayISO(): string {
  // "Aujourd'hui" du point de vue Maurice (pas UTC), pour matcher la
  // colonne planning_assignments.date qui est stockée en date locale.
  const muNow = new Date(Date.now() + MU_OFFSET_HOURS * 3600 * 1000)
  return muNow.toISOString().slice(0, 10)
}

/** Minutes écoulées depuis "HH:MM(:SS)" Maurice aujourd'hui. Retourne null si parse échoue. */
function minutesSinceStart(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(timeStr.trim())
  if (!m) return null
  const now = Date.now()
  // Construit "aujourd'hui (Maurice) à HH:MM Maurice" puis convertit en UTC.
  const muNow = new Date(now + MU_OFFSET_HOURS * 3600 * 1000)
  const startMuMs = Date.UTC(
    muNow.getUTCFullYear(),
    muNow.getUTCMonth(),
    muNow.getUTCDate(),
    Number(m[1]),
    Number(m[2]),
    0,
  )
  const startUtc = startMuMs - MU_OFFSET_HOURS * 3600 * 1000
  return Math.floor((now - startUtc) / 60000)
}

async function chatIdForUser(supabase: ServiceClient, user_id: string | null): Promise<number | null> {
  if (!user_id) return null
  const { data } = await supabase
    .from('telegram_users')
    .select('chat_id')
    .eq('user_id', user_id)
    .eq('verified', true)
    .maybeSingle()
  return data?.chat_id ?? null
}

async function audit(
  supabase: ServiceClient,
  chat_id: number,
  societe_id: string,
  status: 'success' | 'error',
  payload: Record<string, unknown>,
  error_msg?: string,
) {
  try {
    await supabase.from('telegram_actions').insert({
      chat_id,
      societe_id,
      intent: 'notify.attendance.no_show',
      status,
      payload,
      error_msg: error_msg?.slice(0, 500) ?? null,
    })
  } catch { /* best-effort */ }
}

async function safeSend(
  supabase: ServiceClient,
  chat_id: number,
  societe_id: string,
  text: string,
  buttons: InlineButton[][],
  payload: Record<string, unknown>,
): Promise<boolean> {
  try {
    await sendTelegramInlineButtons(chat_id, text, buttons)
    await audit(supabase, chat_id, societe_id, 'success', payload)
    return true
  } catch (e: any) {
    await audit(supabase, chat_id, societe_id, 'error', payload, e?.message)
    return false
  }
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return apiError('unauthorized', 401)
  }

  const supabase = getServiceClient()
  const today = todayISO()
  const stats = {
    assignments: 0,
    alerts_sent: 0,
    employees_alerted: 0,
    skipped_pointed: 0,
    skipped_on_leave: 0,
    skipped_cap_reached: 0,
    errors: 0,
  }

  // 1. Récupère les assignations actives du jour (planning publié)
  const { data: assignments, error: assignErr } = await supabase
    .from('planning_assignments')
    .select(`
      id,
      planning_id,
      employe_id,
      date,
      shift_code,
      heure_debut,
      heure_fin,
      est_repos,
      plannings!inner(id, societe_id, statut)
    `)
    .eq('date', today)
    .eq('est_repos', false)
    .eq('plannings.statut', 'publie')

  if (assignErr) {
    return NextResponse.json({ error: assignErr.message }, { status: 500 })
  }

  for (const a of (assignments || []) as any[]) {
    stats.assignments++
    const employe_id: string = a.employe_id
    const societe_id: string = a.plannings?.societe_id
    if (!societe_id) continue

    const elapsedMin = minutesSinceStart(a.heure_debut)
    if (elapsedMin === null) continue
    if (elapsedMin < LATE_THRESHOLD_MIN) continue

    // 2. A-t-il déjà pointé aujourd'hui ?
    const { data: pointage } = await supabase
      .from('pointages')
      .select('id, heure_entree')
      .eq('employe_id', employe_id)
      .eq('date_pointage', today)
      .not('heure_entree', 'is', null)
      .limit(1)
      .maybeSingle()
    if (pointage) { stats.skipped_pointed++; continue }

    // 3. A-t-il un congé approuvé couvrant aujourd'hui ?
    const { data: conge } = await supabase
      .from('demandes_conges')
      .select('id, type_conge, statut, date_debut, date_fin')
      .eq('employe_id', employe_id)
      .in('statut', ['approuve', 'approve', 'approved'])
      .lte('date_debut', today)
      .gte('date_fin', today)
      .limit(1)
      .maybeSingle()
    if (conge) { stats.skipped_on_leave++; continue }

    // 4. Charge / crée l'enregistrement d'alerte (idempotence)
    const { data: existing } = await supabase
      .from('telegram_attendance_alerts')
      .select('id, alert_count, last_alert_at, status')
      .eq('employe_id', employe_id)
      .eq('date_planning', today)
      .maybeSingle()

    if (existing && existing.status !== 'pending') continue
    if (existing && (existing.alert_count ?? 0) >= MAX_ALERTS_PER_DAY) {
      stats.skipped_cap_reached++; continue
    }
    if (existing?.last_alert_at) {
      const lastMs = new Date(existing.last_alert_at).getTime()
      if (Date.now() - lastMs < MIN_GAP_BETWEEN_ALERTS_MIN * 60_000) continue
    }

    // 5. Charge infos employé + manager
    const { data: emp } = await supabase
      .from('employes')
      .select('id, nom, prenom, user_id, manager_id')
      .eq('id', employe_id)
      .maybeSingle()
    if (!emp) continue

    const fullName = `${emp.prenom || ''} ${emp.nom || ''}`.trim() || 'Employé'
    const shiftLabel = a.shift_code || 'jour'
    const startStr = (a.heure_debut as string)?.slice(0, 5) || '--:--'

    const employeChat = await chatIdForUser(supabase, emp.user_id)

    let managerChat: number | null = null
    if (emp.manager_id) {
      const { data: mgr } = await supabase
        .from('employes')
        .select('user_id')
        .eq('id', emp.manager_id)
        .maybeSingle()
      managerChat = await chatIdForUser(supabase, mgr?.user_id ?? null)
    }

    let anySent = false

    // 6a. Push employé
    if (employeChat) {
      const empText =
        `⏰ <b>Tu es attendu depuis ${elapsedMin} min</b>\n` +
        `Planning ${shiftLabel} (début ${startStr}).\n` +
        `Tout va bien ? Justifie ton absence si besoin.`
      const empButtons: InlineButton[][] = [
        [
          { text: '✅ Je pointe maintenant', callback_data: `attendance.pointed:${emp.id}:${today}` },
        ],
        [
          { text: '🤒 Sick leave', callback_data: `attendance.sick:${emp.id}:${today}` },
          { text: '🌴 Congé urgent', callback_data: `attendance.leave:${emp.id}:${today}` },
        ],
      ]
      const ok = await safeSend(supabase, employeChat, societe_id, empText, empButtons, {
        employe_id: emp.id, target: 'employee', elapsed_min: elapsedMin, date: today,
      })
      if (ok) { stats.alerts_sent++; anySent = true } else stats.errors++
    }

    // 6b. Push manager
    if (managerChat) {
      const mgrText =
        `⚠️ <b>${fullName} n'est pas pointé</b>\n` +
        `Retard ${elapsedMin} min — Planning ${shiftLabel} (début ${startStr}).\n` +
        `Aucun congé ni sick leave déclaré.`
      const mgrButtons: InlineButton[][] = [
        [
          { text: '✅ Excusé',                 callback_data: `attendance.excused:${emp.id}:${today}` },
          { text: '⚠️ Marquer absent',         callback_data: `attendance.unjustified:${emp.id}:${today}` },
        ],
        [
          { text: '📞 Contacter',              callback_data: `attendance.contact:${emp.id}:${today}` },
        ],
      ]
      const ok = await safeSend(supabase, managerChat, societe_id, mgrText, mgrButtons, {
        employe_id: emp.id, target: 'manager', elapsed_min: elapsedMin, date: today,
      })
      if (ok) { stats.alerts_sent++; anySent = true } else stats.errors++
    }

    // 6c. Push RH / Direction / Client_admin / Client_assistant (rôles managériaux
    // de la société). Une alerte par personne par employé absent, mais
    // l'idempotence (max 3 alertes/jour, 30 min gap) s'applique au record
    // d'absence, pas par destinataire — ces rôles reçoivent UNIQUEMENT lors
    // de la première alerte du jour (alert_count == 0 avant cet incrément).
    const isFirstAlertOfDay = !existing || (existing.alert_count ?? 0) === 0
    if (isFirstAlertOfDay) {
      const { data: managerialUsers } = await supabase
        .from('user_societes')
        .select('user_id, role')
        .eq('societe_id', societe_id)
        .in('role', ['rh', 'direction', 'client_admin', 'client_assistant'])
      const recipientUserIds = new Set<string>()
      // Évite double-envoi : l'employé et son manager déjà notifiés ne reçoivent pas en plus
      for (const u of managerialUsers || []) {
        if (u.user_id === emp.user_id) continue
        recipientUserIds.add(u.user_id)
      }
      for (const uid of recipientUserIds) {
        const chat = await chatIdForUser(supabase, uid)
        if (!chat || chat === managerChat) continue
        const rhText =
          `🚨 <b>Absent : ${fullName}</b>\n` +
          `Retard ${elapsedMin} min — Planning ${shiftLabel} (début ${startStr}).\n` +
          `Aucun pointage, aucun congé déclaré.`
        const ok = await safeSend(supabase, chat, societe_id, rhText, [], {
          employe_id: emp.id, target: 'rh_direction', elapsed_min: elapsedMin, date: today,
        })
        if (ok) { stats.alerts_sent++; anySent = true } else stats.errors++
      }
    }

    // 7. Upsert idempotence
    if (anySent) {
      stats.employees_alerted++
      if (existing) {
        await supabase
          .from('telegram_attendance_alerts')
          .update({
            alert_count: (existing.alert_count ?? 0) + 1,
            last_alert_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
      } else {
        await supabase.from('telegram_attendance_alerts').insert({
          societe_id,
          employe_id: emp.id,
          date_planning: today,
          alert_count: 1,
          last_alert_at: new Date().toISOString(),
          status: 'pending',
        })
      }
    }
  }

  return NextResponse.json({ ok: true, stats })
}
