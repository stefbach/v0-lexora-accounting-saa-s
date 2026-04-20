import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { userHasAccessToSociete } from '@/lib/rh/access'
import { DEFAULT_CONFIG, DEFAULT_REGLES_WRA } from '@/types/planning'

export const dynamic = 'force-dynamic'

// Rôles autorisés — mêmes que le layout app/rh/planning/regles/layout.tsx.
const ALLOWED_ROLES = [
  'admin',
  'super_admin',
  'rh',
  'rh_manager',
  'client_admin',
  'direction',
]

async function getUserRole(userId: string): Promise<string> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('profiles').select('role').eq('id', userId).maybeSingle()
  return data?.role || ''
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ─── Schémas Zod ─────────────────────────────────────────────────────

const JOUR = z.enum(['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'])
const HH_MM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format HH:MM requis')
const HEX_COLOR = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur hex #RRGGBB requise')

const ShiftSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1).max(3),
  label: z.string().min(1),
  type: z.enum(['normal', 'nuit', 'ferie', 'astreinte', 'teletravail', 'garde', 'repos']),
  debut: HH_MM.nullable(),
  fin: HH_MM.nullable(),
  flexible: z.boolean(),
  debut_min: HH_MM.optional(),
  debut_max: HH_MM.optional(),
  pause_minutes: z.number().int().min(0).max(240),
  heures_requises: z.number().min(0).max(24),
  jours: z.array(JOUR).min(1, 'Au moins un jour requis'),
  couleur: HEX_COLOR,
  actif: z.boolean(),
})

const ShiftsArraySchema = z.array(ShiftSchema).superRefine((arr, ctx) => {
  // Unicité du code dans la société
  const seen = new Map<string, number>()
  arr.forEach((s, idx) => {
    const k = s.code.toUpperCase()
    if (seen.has(k)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [idx, 'code'],
        message: `Code "${s.code}" déjà utilisé par un autre créneau`,
      })
    } else {
      seen.set(k, idx)
    }
  })
})

const ConfigSchema = z.object({
  jours_travailles: z.array(JOUR).min(0),
  semaine_type: z.enum(['5j', '5.5j', '6j']),
  jour_repos_principal: JOUR,
  type_rotation: z.enum(['fixe', 'tournante', 'mixte']),
})

const ReglesLegalesSchema = z.array(z.object({
  key: z.string().min(1),
  type: z.enum(['number', 'boolean', 'time', 'percent']),
  unit: z.string(),
  label: z.string(),
  value: z.union([z.number(), z.boolean(), z.string()]),
  wraRef: z.string(),
  enabled: z.boolean(),
  category: z.enum(['heures', 'repos', 'ot', 'equipe']),
}))

const PutBodySchema = z.object({
  societe_id: z.string().uuid(),
  shifts_planning: ShiftsArraySchema.optional(),
  config_planning: ConfigSchema.optional(),
  regles_planning: ReglesLegalesSchema.optional(),
})

// ─── GET ──────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const role = await getUserRole(user.id)
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    if (!(await userHasAccessToSociete(user.id, societe_id))) {
      return NextResponse.json({ error: 'Forbidden — société hors périmètre' }, { status: 403 })
    }

    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('societes')
      .select('regles_planning, shifts_planning, config_planning')
      .eq('id', societe_id)
      .maybeSingle()

    if (error) {
      console.error('[planning/regles GET] DB error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Normalisation + défauts si colonnes vides / absentes
    const regles_planning = Array.isArray(data?.regles_planning)
      ? data!.regles_planning
      : DEFAULT_REGLES_WRA
    const shifts_planning = Array.isArray(data?.shifts_planning)
      ? data!.shifts_planning
      : []
    const config_planning = (data?.config_planning && typeof data.config_planning === 'object')
      ? { ...DEFAULT_CONFIG, ...data.config_planning }
      : DEFAULT_CONFIG

    // Rétrocompat pour les vieux callers qui lisent data.regles.shifts
    // (app/rh/planning/page.tsx). On expose une vue legacy par-dessus.
    return NextResponse.json({
      regles_planning,
      shifts_planning,
      config_planning,
      regles: {
        shifts: shifts_planning,
        jours_travailles: config_planning.jours_travailles,
      },
    })
  } catch (e: any) {
    console.error('[planning/regles GET] exception:', e)
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}

// ─── PUT — update partiel (nouveaux champs) ──────────────────────────

export async function PUT(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const role = await getUserRole(user.id)
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const raw = await request.json().catch(() => null)
    if (!raw) return NextResponse.json({ error: 'Body JSON requis' }, { status: 400 })

    const parsed = PutBodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({
        error: 'Validation échouée',
        issues: parsed.error.issues.map(i => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      }, { status: 400 })
    }

    const { societe_id, shifts_planning, config_planning, regles_planning } = parsed.data

    if (!(await userHasAccessToSociete(user.id, societe_id))) {
      return NextResponse.json({ error: 'Forbidden — société hors périmètre' }, { status: 403 })
    }

    // Cohérence horaire par shift (avertissement non-bloquant via `warnings`).
    const warnings: string[] = []
    for (const s of shifts_planning || []) {
      if (s.type !== 'repos' && s.debut && s.fin) {
        const [dh, dm] = s.debut.split(':').map(Number)
        const [fh, fm] = s.fin.split(':').map(Number)
        let delta = (fh * 60 + fm) - (dh * 60 + dm)
        if (delta <= 0) delta += 24 * 60 // shift de nuit
        const netMin = delta - s.pause_minutes
        const netH = Math.round((netMin / 60) * 100) / 100
        if (Math.abs(netH - s.heures_requises) > 0.25) {
          warnings.push(`Shift "${s.label}" : heures_requises=${s.heures_requises}h incohérent avec début/fin/pause (≈${netH}h nettes)`)
        }
      }
    }

    const supabase = getAdminClient()
    const update: Record<string, unknown> = {}
    if (shifts_planning !== undefined) update.shifts_planning = shifts_planning
    if (config_planning !== undefined) update.config_planning = config_planning
    if (regles_planning !== undefined) update.regles_planning = regles_planning

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('societes')
      .update(update)
      .eq('id', societe_id)
      .select('regles_planning, shifts_planning, config_planning')
      .single()

    if (error) {
      console.error('[planning/regles PUT] DB error:', error)
      if (error.code === '42703') {
        return NextResponse.json({
          error: 'Colonnes shifts_planning / config_planning manquantes. Appliquez la migration 148.',
          code: error.code,
        }, { status: 500 })
      }
      return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
    }

    return NextResponse.json({ success: true, warnings, data })
  } catch (e: any) {
    console.error('[planning/regles PUT] exception:', e)
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}

// ─── POST — compat legacy (body: {regles: {...}}) ────────────────────
// Conservé pour /rh/planning/page.tsx (persistCreneaux) qui envoie
// { societe_id, regles: { shifts, jours_travailles } } en mode merge.

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const role = await getUserRole(user.id)
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Body JSON requis' }, { status: 400 })
    const { societe_id, regles } = body || {}

    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }
    if (!(await userHasAccessToSociete(user.id, societe_id))) {
      return NextResponse.json({ error: 'Forbidden — société hors périmètre' }, { status: 403 })
    }

    const supabase = getAdminClient()
    const update: Record<string, unknown> = {}

    // Legacy body: regles peut être soit un array (PlanningRule[] pur), soit
    // un objet { shifts, jours_travailles, ...règles à plat }, soit le
    // nouveau format ReglesPlanningComplet.
    if (Array.isArray(regles)) {
      // Array de règles WRA — va dans regles_planning
      update.regles_planning = regles
    } else if (regles && typeof regles === 'object') {
      if (Array.isArray(regles.shifts)) update.shifts_planning = regles.shifts
      if (Array.isArray(regles.jours_travailles)) {
        // Lire config courante pour merger jours_travailles sans écraser
        // le reste (semaine_type, type_rotation, etc.).
        const { data: cur } = await supabase
          .from('societes').select('config_planning').eq('id', societe_id).maybeSingle()
        const merged = {
          ...(cur?.config_planning && typeof cur.config_planning === 'object'
            ? cur.config_planning
            : DEFAULT_CONFIG),
          jours_travailles: regles.jours_travailles,
        }
        update.config_planning = merged
      }
      if (Array.isArray(regles.regles_planning)) update.regles_planning = regles.regles_planning
      if (Array.isArray(regles.shifts_planning)) update.shifts_planning = regles.shifts_planning
      if (regles.config_planning && typeof regles.config_planning === 'object') {
        update.config_planning = regles.config_planning
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Aucune donnée à persister' }, { status: 400 })
    }

    const { error } = await supabase.from('societes').update(update).eq('id', societe_id)
    if (error) {
      console.error('[planning/regles POST] DB error:', error.message)
      return NextResponse.json({ error: error.message, code: error.code }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('[planning/regles POST] exception:', e)
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}
