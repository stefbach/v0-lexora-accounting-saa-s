/**
 * Helper pour le pointage par sessions multiples — sprint PO1.
 *
 * Modèle : l'employé peut avoir N sessions `travail` + M sessions `pause`
 * dans la même journée. La table legacy `pointages` est maintenue à jour
 * automatiquement via trigger DB (reconcile_pointages_sessions_to_pointage).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export type TypeSession = 'travail' | 'pause'

export interface PointageSession {
  id: string
  employe_id: string
  date_pointage: string
  type_session: TypeSession
  heure_debut: string // 'HH:MM:SS'
  heure_fin: string | null
  duree_minutes: number | null
  notes?: string | null
  latitude?: number | null
  longitude?: number | null
  correction?: boolean
  correction_motif?: string | null
  created_at?: string
  created_by?: string | null
  corrected_by?: string | null
}

export interface SessionsDuJour {
  sessions: PointageSession[]
  total_travail_minutes: number
  total_pause_minutes: number
  session_en_cours: PointageSession | null
}

/** Renvoie la date locale (Maurice UTC+4) au format YYYY-MM-DD. */
export function todayDateMU(): string {
  const now = new Date()
  // UTC+4 sans DST.
  const mu = new Date(now.getTime() + 4 * 60 * 60 * 1000)
  return mu.toISOString().slice(0, 10)
}

/** Renvoie l'heure locale (Maurice UTC+4) au format HH:MM:SS. */
export function nowTimeMU(): string {
  const now = new Date()
  const mu = new Date(now.getTime() + 4 * 60 * 60 * 1000)
  return mu.toISOString().slice(11, 19)
}

/**
 * Renvoie toutes les sessions du jour pour un employé, triées par
 * heure_debut ascendante.
 */
export async function getSessionsDuJour(
  supabase: SupabaseLike,
  employeId: string,
  date: string,
): Promise<PointageSession[]> {
  const { data } = await supabase
    .from('pointages_sessions')
    .select('*')
    .eq('employe_id', employeId)
    .eq('date_pointage', date)
    .order('heure_debut', { ascending: true })
  return (data || []) as PointageSession[]
}

/**
 * Renvoie la session actuellement ouverte (travail OU pause, heure_fin NULL)
 * pour un employé. On limite au jour courant : une session oubliée de la
 * veille ne remonte pas ici.
 */
export async function getSessionEnCours(
  supabase: SupabaseLike,
  employeId: string,
  date: string = todayDateMU(),
): Promise<PointageSession | null> {
  const { data } = await supabase
    .from('pointages_sessions')
    .select('*')
    .eq('employe_id', employeId)
    .eq('date_pointage', date)
    .is('heure_fin', null)
    .order('heure_debut', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as PointageSession) || null
}

/**
 * Ferme une session : renseigne heure_fin. duree_minutes est calculé par
 * le trigger BEFORE côté DB (trg_sessions_calc_duree).
 */
export async function fermerSession(
  supabase: SupabaseLike,
  sessionId: string,
  heureFin: string = nowTimeMU(),
): Promise<{ ok: boolean; error?: string }> {
  // count: 'exact' permet de vérifier que l'UPDATE a réellement modifié une
  // ligne — sans ça, un .is('heure_fin', null) qui ne matche rien renvoie
  // { error: null, count: 0 } et la session reste ouverte sans signaler
  // d'erreur (bug observé : clic « fin de pause » qui semble réussir mais
  // la pause reste ouverte).
  const { error, count } = await supabase
    .from('pointages_sessions')
    .update({ heure_fin: heureFin }, { count: 'exact' })
    .eq('id', sessionId)
    .is('heure_fin', null) // évite de re-fermer une session déjà close
  if (error) return { ok: false, error: error.message }
  if (!count || count === 0) {
    return { ok: false, error: 'Session déjà fermée ou introuvable — réessayer après rafraîchissement.' }
  }
  return { ok: true }
}

/**
 * Ouvre une nouvelle session. Règles métier :
 *   - Si une session `travail` est en cours et qu'on demande `pause` :
 *     fermer le travail, ouvrir la pause.
 *   - Si une session `pause` est en cours et qu'on demande `travail` :
 *     fermer la pause, ouvrir le travail.
 *   - Si le MÊME type est déjà en cours : no-op, retourner la session
 *     existante (idempotence contre double-clics).
 */
export async function ouvrirSession(
  supabase: SupabaseLike,
  employeId: string,
  type: TypeSession,
  opts: {
    date?: string
    heure?: string
    notes?: string | null
    latitude?: number | null
    longitude?: number | null
    createdBy?: string | null
  } = {},
): Promise<{ ok: boolean; session?: PointageSession; error?: string }> {
  const date = opts.date || todayDateMU()
  const heure = opts.heure || nowTimeMU()

  const enCours = await getSessionEnCours(supabase, employeId, date)

  if (enCours) {
    if (enCours.type_session === type) {
      return { ok: true, session: enCours }
    }
    const { ok, error } = await fermerSession(supabase, enCours.id, heure)
    if (!ok) return { ok: false, error }
  }

  const { data, error } = await supabase
    .from('pointages_sessions')
    .insert({
      employe_id: employeId,
      date_pointage: date,
      type_session: type,
      heure_debut: heure,
      notes: opts.notes ?? null,
      latitude: opts.latitude ?? null,
      longitude: opts.longitude ?? null,
      created_by: opts.createdBy ?? null,
    })
    .select('*')
    .single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, session: data as PointageSession }
}

/**
 * Termine la pause en cours et ouvre immédiatement une nouvelle session
 * `travail` (raccourci "Reprendre" en un clic).
 */
export async function reprendreTravail(
  supabase: SupabaseLike,
  employeId: string,
  opts: {
    date?: string
    heure?: string
    createdBy?: string | null
  } = {},
): Promise<{ ok: boolean; session?: PointageSession; error?: string }> {
  const date = opts.date || todayDateMU()
  const heure = opts.heure || nowTimeMU()
  const enCours = await getSessionEnCours(supabase, employeId, date)
  if (enCours && enCours.type_session === 'pause') {
    const { ok, error } = await fermerSession(supabase, enCours.id, heure)
    if (!ok) return { ok: false, error }
  }
  return ouvrirSession(supabase, employeId, 'travail', {
    date,
    heure,
    createdBy: opts.createdBy,
  })
}

/** Somme des durées des sessions travail terminées. */
export function calculerTotalTravailJour(sessions: PointageSession[]): number {
  return sessions
    .filter(s => s.type_session === 'travail' && s.duree_minutes != null)
    .reduce((sum, s) => sum + (Number(s.duree_minutes) || 0), 0)
}

/** Somme des durées des sessions pause terminées. */
export function calculerTotalPauseJour(sessions: PointageSession[]): number {
  return sessions
    .filter(s => s.type_session === 'pause' && s.duree_minutes != null)
    .reduce((sum, s) => sum + (Number(s.duree_minutes) || 0), 0)
}

/**
 * Formate une durée en minutes vers "Xh YYmin" / "YYmin" / "Xh".
 * formaterDuree(0) -> "0min"
 */
export function formaterDuree(minutes: number): string {
  const m = Math.max(0, Math.round(minutes || 0))
  if (m === 0) return '0min'
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${r}min`
  if (r === 0) return `${h}h`
  return `${h}h ${String(r).padStart(2, '0')}min`
}

/**
 * Renvoie la vue complète de la journée : sessions + totaux + session
 * actuellement en cours. Un seul roundtrip DB + calculs locaux.
 */
export async function getResumeJour(
  supabase: SupabaseLike,
  employeId: string,
  date: string = todayDateMU(),
): Promise<SessionsDuJour> {
  const sessions = await getSessionsDuJour(supabase, employeId, date)
  const total_travail_minutes = calculerTotalTravailJour(sessions)
  const total_pause_minutes = calculerTotalPauseJour(sessions)
  const session_en_cours = sessions.find(s => s.heure_fin === null) || null
  return { sessions, total_travail_minutes, total_pause_minutes, session_en_cours }
}
