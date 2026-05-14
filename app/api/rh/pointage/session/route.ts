/**
 * API Sessions de pointage — sprint PO1.
 *
 * POST /api/rh/pointage/session?action=entree
 *      body { employe_id?, notes?, latitude?, longitude? }
 *      -> ouvre session 'travail' (ferme pause en cours si besoin).
 * POST /api/rh/pointage/session?action=pause
 *      -> ouvre session 'pause' (ferme travail en cours).
 * POST /api/rh/pointage/session?action=fin-pause  (alias: reprendre)
 *      -> ferme pause + ouvre nouvelle session travail.
 * POST /api/rh/pointage/session?action=sortie
 *      -> ferme la session travail en cours (ne verrouille PAS la journée).
 *
 * GET  /api/rh/pointage/session?date=YYYY-MM-DD&employe_id=...
 *      -> { sessions, total_travail_minutes, total_pause_minutes, session_en_cours }
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { resolveOwnership, canManageEmploye } from '@/lib/rh/ownership'
import {
  getResumeJour,
  ouvrirSession,
  fermerSession,
  reprendreTravail,
  getSessionEnCours,
  todayDateMU,
} from '@/lib/rh/pointage-sessions'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function ensurePointageActif(
  supabase: ReturnType<typeof getAdminClient>,
  employe_id: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data: emp } = await supabase
    .from('employes')
    .select('societe_id')
    .eq('id', employe_id)
    .maybeSingle()
  if (!emp?.societe_id) return { ok: true }
  const { data: soc } = await supabase
    .from('societes')
    .select('pointage_actif')
    .eq('id', emp.societe_id)
    .maybeSingle()
  if (soc?.pointage_actif === false) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()
    const bypass = ['admin', 'super_admin', 'rh', 'rh_manager', 'manager', 'team_leader']
    if (!prof || !bypass.includes((prof as any).role)) {
      return {
        ok: false,
        status: 403,
        error: 'Le pointage n\'est pas activé pour cette société.',
      }
    }
  }
  return { ok: true }
}

async function ensureNotOnConge(
  supabase: ReturnType<typeof getAdminClient>,
  employe_id: string,
  date: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  // demi_journee=true → pointage autorisé (l'employé travaille l'autre demi).
  // Seul un congé pleine journée bloque le pointage.
  const { data: conges } = await supabase
    .from('demandes_conges')
    .select('id, type_conge, demi_journee')
    .eq('employe_id', employe_id)
    .eq('statut', 'approuve')
    .lte('date_debut', date)
    .gte('date_fin', date)
    .limit(1)
  if (conges && conges.length > 0 && conges[0].demi_journee !== true) {
    return {
      ok: false,
      status: 409,
      error: `En congé approuvé (${conges[0].type_conge}) ce jour. Pointage non requis.`,
    }
  }
  return { ok: true }
}

// ─── POST handler ─────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const url = new URL(request.url)
    const action = (url.searchParams.get('action') || '').toLowerCase()
    const body = await request.json().catch(() => ({} as any))

    const supabase = getAdminClient()
    const ownership = await resolveOwnership(supabase, user.id)
    const employe_id = body.employe_id || ownership.employe_id
    if (!employe_id) {
      return NextResponse.json({ error: 'employe_id requis' }, { status: 400 })
    }

    // RH/Admin tous, Manager/Team Leader scope groupe, sinon self.
    const canManage = await canManageEmploye(supabase, ownership, employe_id)
    if (!canManage) {
      const msg = ownership.isManagerScoped
        ? 'Accès refusé — cet employé n\'appartient pas à votre équipe.'
        : 'Accès refusé — vous ne pouvez pointer que pour vous-même.'
      return NextResponse.json({ error: msg }, { status: 403 })
    }

    // Guards (pointage_actif, congés).
    const actifCheck = await ensurePointageActif(supabase, employe_id, user.id)
    if (!actifCheck.ok) return NextResponse.json({ error: actifCheck.error }, { status: actifCheck.status })

    const date = body.date || todayDateMU()
    const congeCheck = await ensureNotOnConge(supabase, employe_id, date)
    if (!congeCheck.ok) return NextResponse.json({ error: congeCheck.error }, { status: congeCheck.status })

    const opts = {
      date,
      heure: body.heure || undefined,
      notes: body.notes ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      createdBy: user.id,
    }

    switch (action) {
      case 'entree': {
        const r = await ouvrirSession(supabase, employe_id, 'travail', opts)
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
        const resume = await getResumeJour(supabase, employe_id, date)
        return NextResponse.json({ session: r.session, ...resume })
      }
      case 'pause': {
        const r = await ouvrirSession(supabase, employe_id, 'pause', opts)
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
        const resume = await getResumeJour(supabase, employe_id, date)
        return NextResponse.json({ session: r.session, ...resume })
      }
      case 'fin-pause':
      case 'reprendre': {
        const r = await reprendreTravail(supabase, employe_id, {
          date,
          heure: body.heure || undefined,
          createdBy: user.id,
        })
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
        const resume = await getResumeJour(supabase, employe_id, date)
        return NextResponse.json({ session: r.session, ...resume })
      }
      case 'sortie': {
        const enCours = await getSessionEnCours(supabase, employe_id, date)
        if (!enCours) {
          return NextResponse.json(
            { error: 'Aucune session en cours à fermer.' },
            { status: 409 },
          )
        }
        if (enCours.type_session !== 'travail') {
          return NextResponse.json(
            { error: 'Une pause est en cours. Terminez la pause avant de sortir.' },
            { status: 409 },
          )
        }
        const r = await fermerSession(supabase, enCours.id, body.heure || undefined)
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
        const resume = await getResumeJour(supabase, employe_id, date)
        return NextResponse.json(resume)
      }
      default:
        return NextResponse.json(
          { error: 'action inconnue (attendue: entree | pause | fin-pause | sortie)' },
          { status: 400 },
        )
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Erreur serveur' },
      { status: 500 },
    )
  }
}

// ─── GET handler : résumé journée ─────────────────────────────────
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const url = new URL(request.url)
    const dateParam = url.searchParams.get('date') || todayDateMU()
    const empParam = url.searchParams.get('employe_id')

    const supabase = getAdminClient()
    const ownership = await resolveOwnership(supabase, user.id)
    const employe_id = empParam || ownership.employe_id
    if (!employe_id) {
      return NextResponse.json({ error: 'employe_id requis' }, { status: 400 })
    }
    if (!ownership.isRH && ownership.employe_id !== employe_id) {
      return NextResponse.json(
        { error: 'Accès refusé — vous ne pouvez consulter que vos propres sessions.' },
        { status: 403 },
      )
    }

    const resume = await getResumeJour(supabase, employe_id, dateParam)
    return NextResponse.json(resume)
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Erreur serveur' },
      { status: 500 },
    )
  }
}
