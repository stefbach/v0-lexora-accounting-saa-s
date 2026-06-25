/**
 * AGENT FIX-ALICIA — POST /api/rh/paie/[id]/restore-from-archive
 *
 * Restaure une version archivée d'un bulletin (mig 425). Cas réel : Alicia
 * Désiré — un recalcul "solde tout compte" a écrasé un bulletin "mois
 * entier" qui contenait des retenues manuelles. L'ancien existe encore en
 * `is_archived=true`.
 *
 * Algorithme :
 *   1. Charge le bulletin actif (paramètre `id`).
 *   2. Refuse si comptabilisé (verrou immutable mig 427) → 409.
 *   3. Cherche la version archivée à restaurer :
 *      a. Priorité 1 : un archivé tel que `superseded_by = id`.
 *      b. Priorité 2 : le plus récent archivé avec même (employe_id, periode).
 *   4. Si trouvé : inverse les rôles
 *      - actuel → is_archived=true, superseded_by=<archive_id>
 *      - archive → is_archived=false, superseded_by=NULL
 *   5. Audit log.
 *
 * GET en preview : retourne l'archive trouvée sans la restaurer.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = [
  'admin',
  'super_admin',
  'rh',
  'rh_manager',
  'direction',
  'client_admin',
] as const

type AllowedRole = (typeof ALLOWED_ROLES)[number]

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function authorize(): Promise<
  | { ok: true; userId: string; userEmail: string | null; role: AllowedRole }
  | { ok: false; resp: NextResponse }
> {
  const supabaseAuth = await createServerClient()
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser()
  if (!user) {
    return {
      ok: false,
      resp: NextResponse.json({ error: 'Non autorisé' }, { status: 401 }),
    }
  }
  const supabase = getAdminClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const role = (profile as any)?.role as string | undefined
  if (!role || !ALLOWED_ROLES.includes(role as AllowedRole)) {
    return {
      ok: false,
      resp: NextResponse.json(
        {
          error: 'Action réservée aux rôles RH, direction ou admin.',
          role_actuel: role || 'inconnu',
        },
        { status: 403 },
      ),
    }
  }
  return {
    ok: true,
    userId: user.id,
    userEmail: user.email ?? null,
    role: role as AllowedRole,
  }
}

async function findArchiveCandidate(
  supabase: ReturnType<typeof getAdminClient>,
  active: { id: string; employe_id: string; periode: string },
) {
  // Priorité 1 : archive qui pointe explicitement vers l'actif
  const { data: bySuperseded } = await supabase
    .from('bulletins_paie')
    .select(
      'id, employe_id, periode, salaire_net, salaire_base, paye, nsf_salarie, csg_salarie, is_archived, archived_at, archive_reason, notes',
    )
    .eq('superseded_by', active.id)
    .eq('is_archived', true)
    .order('archived_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (bySuperseded) return bySuperseded

  // Priorité 2 : même (employe_id, periode), archivé, le plus récent
  const { data: byPair } = await supabase
    .from('bulletins_paie')
    .select(
      'id, employe_id, periode, salaire_net, salaire_base, paye, nsf_salarie, csg_salarie, is_archived, archived_at, archive_reason, notes',
    )
    .eq('employe_id', active.employe_id)
    .eq('periode', active.periode)
    .eq('is_archived', true)
    .neq('id', active.id)
    .order('archived_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return byPair ?? null
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    if (!id) {
      return NextResponse.json({ error: 'bulletin_id manquant' }, { status: 400 })
    }
    const auth = await authorize()
    if (!auth.ok) return auth.resp
    const supabase = getAdminClient()

    const { data: active, error: aErr } = await supabase
      .from('bulletins_paie')
      .select('id, employe_id, periode, comptabilise, is_archived, salaire_net, salaire_base, paye, nsf_salarie, csg_salarie')
      .eq('id', id)
      .maybeSingle()
    if (aErr || !active) {
      return NextResponse.json(
        { error: 'Bulletin introuvable', details: aErr?.message },
        { status: 404 },
      )
    }

    const archive = await findArchiveCandidate(supabase, active as any)
    return NextResponse.json({
      success: true,
      mode: 'preview',
      active,
      archive,
      restorable: !!archive && !(active as any).comptabilise,
      reason_blocked: (active as any).comptabilise
        ? 'Bulletin actuel comptabilisé — décomptabiliser d\'abord.'
        : !archive
          ? 'Aucune version archivée trouvée pour ce bulletin.'
          : null,
    })
  } catch (e: any) {
    console.error('[restore-from-archive GET] EXCEPTION:', e?.message)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    )
  }
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    if (!id) {
      return NextResponse.json({ error: 'bulletin_id manquant' }, { status: 400 })
    }

    const auth = await authorize()
    if (!auth.ok) return auth.resp
    const supabase = getAdminClient()

    // 1. Charger actif
    const { data: active, error: aErr } = await supabase
      .from('bulletins_paie')
      .select('id, employe_id, periode, comptabilise, is_archived')
      .eq('id', id)
      .maybeSingle()
    if (aErr || !active) {
      return NextResponse.json(
        { error: 'Bulletin introuvable', details: aErr?.message },
        { status: 404 },
      )
    }

    if ((active as any).is_archived) {
      return NextResponse.json(
        { error: 'Le bulletin fourni est déjà archivé.' },
        { status: 400 },
      )
    }

    // 2. Refuser si comptabilisé
    if ((active as any).comptabilise) {
      return NextResponse.json(
        {
          error:
            'Bulletin verrouillé (comptabilisé). Décomptabiliser d\'abord via /api/rh/paie/[id]/decomptabiliser.',
          bulletin_id: id,
        },
        { status: 409 },
      )
    }

    // 3. Trouver l'archive
    const archive = await findArchiveCandidate(supabase, active as any)
    if (!archive) {
      return NextResponse.json(
        {
          error:
            'Aucune version archivée trouvée pour ce bulletin. Essayer la reconstruction depuis le grand livre.',
        },
        { status: 404 },
      )
    }

    const nowIso = new Date().toISOString()

    // 4a. Archiver l'actuel
    const { error: archErr } = await supabase
      .from('bulletins_paie')
      .update({
        is_archived: true,
        archived_at: nowIso,
        archive_reason: `Restauration archive ${(archive as any).id} par ${auth.userEmail || auth.userId}`,
        superseded_by: (archive as any).id,
      })
      .eq('id', id)
    if (archErr) {
      return NextResponse.json(
        { error: 'Échec archivage bulletin actuel', details: archErr.message },
        { status: 500 },
      )
    }

    // 4b. Restaurer l'archive (devient actif)
    const { data: restored, error: restErr } = await supabase
      .from('bulletins_paie')
      .update({
        is_archived: false,
        archived_at: null,
        archive_reason: null,
        superseded_by: null,
      })
      .eq('id', (archive as any).id)
      .select('id, employe_id, periode, salaire_net, is_archived')
      .single()
    if (restErr) {
      // Rollback
      await supabase
        .from('bulletins_paie')
        .update({
          is_archived: false,
          archived_at: null,
          archive_reason: null,
          superseded_by: null,
        })
        .eq('id', id)
      return NextResponse.json(
        {
          error: 'Échec restauration archive — rollback effectué.',
          details: restErr.message,
        },
        { status: 500 },
      )
    }

    // 5. Audit log
    await supabase.from('bulletin_decomptabilisation_log').insert({
      bulletin_id: (restored as any).id,
      ecriture_id_avant: null,
      action: 'rh_restore_from_archive',
      user_id: auth.userId,
      raison: `Restauration archive ${(archive as any).id}. Bulletin précédent ${id} archivé.`,
      metadata: {
        nouveau_actif_id: (restored as any).id,
        ancien_actif_id: id,
        role_acteur: auth.role,
      },
    })

    console.warn(
      `[restore-from-archive] OK ancien_actif=${id} nouveau_actif=${(restored as any).id} par=${auth.userEmail || auth.userId}`,
    )

    return NextResponse.json({
      success: true,
      ancien_actif_id: id,
      bulletin_restaure: restored,
      message:
        'Bulletin restauré depuis archive. Vérifier les retenues manuelles et recomptabiliser si nécessaire.',
    })
  } catch (e: any) {
    console.error('[restore-from-archive POST] EXCEPTION:', e?.message, e?.stack)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    )
  }
}
