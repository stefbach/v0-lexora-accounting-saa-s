/**
 * Pont entre l'agent comptable (et autres consommateurs internes) et Nylas.
 * Chaque fonction renvoie `null` si aucune boîte Nylas n'est connectée pour
 * l'utilisateur → le caller retombe alors sur l'implémentation Google.
 */
import { getAdminClient } from '@/lib/supabase/admin'
import { resolveNylasAccount } from '@/lib/nylas/account'
import {
  isNylasConfigured, listNylasCalendars, listNylasEvents, createNylasEvent,
  sendNylasEmail, type CalEvent,
} from '@/lib/nylas/client'

/** Vrai si l'utilisateur a au moins une boîte Nylas active. */
export async function hasNylas(userId: string, societeId?: string | null): Promise<boolean> {
  if (!isNylasConfigured()) return false
  const acc = await resolveNylasAccount(getAdminClient(), userId, societeId ?? null)
  return !!acc
}

async function grantFor(userId: string, societeId?: string | null) {
  if (!isNylasConfigured()) return null
  return resolveNylasAccount(getAdminClient(), userId, societeId ?? null)
}

async function primaryCalendarId(grantId: string): Promise<string | null> {
  const cals = await listNylasCalendars(grantId)
  return (cals.find((c) => c.isPrimary && !c.readOnly) || cals.find((c) => !c.readOnly) || cals[0])?.id || null
}

/**
 * Compte Nylas + calendrier primaire d'un utilisateur (ex. owner d'une page de
 * RDV). null si aucune boîte Nylas → le caller retombe sur Google.
 */
export async function nylasOwnerCalendar(userId: string): Promise<{ grantId: string; email: string; calendarId: string } | null> {
  const acc = await grantFor(userId, null)
  if (!acc) return null
  const calendarId = await primaryCalendarId(acc.grantId)
  if (!calendarId) return null
  return { grantId: acc.grantId, email: acc.account_email, calendarId }
}

export type NylasAgentEvent = { titre: string; debut: string | null; fin: string | null; lieu: string | null; meet: string | null }

/** Liste les événements à venir. null si pas de Nylas. */
export async function nylasListEvents(userId: string, societeId: string | null, jours: number, max: number): Promise<{ compte: string; evenements: NylasAgentEvent[] } | null> {
  const acc = await grantFor(userId, societeId)
  if (!acc) return null
  const calId = await primaryCalendarId(acc.grantId)
  if (!calId) return { compte: acc.account_email, evenements: [] }
  const now = Math.floor(Date.now() / 1000)
  const events = await listNylasEvents(acc.grantId, calId, now, now + jours * 86400)
  const mapped: NylasAgentEvent[] = events.slice(0, max).map((e: CalEvent) => ({
    titre: e.title, debut: e.start, fin: e.end, lieu: e.location || null, meet: e.conferenceUrl,
  }))
  return { compte: acc.account_email, evenements: mapped }
}

/** Crée un événement (avec Meet optionnel). null si pas de Nylas. */
export async function nylasCreateEvent(
  userId: string, societeId: string | null,
  args: { titre: string; debutMs: number; finMs: number; description?: string; invites?: string[]; avecMeet?: boolean },
): Promise<{ event_id: string; titre: string; debut: string | null; fin: string | null; meet: string | null; compte: string } | null> {
  const acc = await grantFor(userId, societeId)
  if (!acc) return null
  const calId = await primaryCalendarId(acc.grantId)
  if (!calId) throw new Error('Aucun calendrier Nylas modifiable')
  const event = await createNylasEvent(acc.grantId, {
    calendarId: calId, title: args.titre, description: args.description,
    startEpoch: Math.floor(args.debutMs / 1000), endEpoch: Math.floor(args.finMs / 1000),
    participants: args.invites, conferencing: args.avecMeet ? 'meet' : null,
  })
  return { event_id: event.id, titre: event.title, debut: event.start, fin: event.end, meet: event.conferenceUrl, compte: acc.account_email }
}

/** Envoie un email depuis la boîte Nylas. null si pas de Nylas. */
export async function nylasSend(
  userId: string, societeId: string | null,
  msg: { to: string[]; cc?: string[]; subject: string; html: string },
): Promise<{ message_id?: string; from: string } | null> {
  const acc = await grantFor(userId, societeId)
  if (!acc) return null
  const r = await sendNylasEmail(acc.grantId, msg)
  if (!r.ok) throw new Error(r.error || 'Échec envoi Nylas')
  return { message_id: r.message_id, from: acc.account_email }
}
