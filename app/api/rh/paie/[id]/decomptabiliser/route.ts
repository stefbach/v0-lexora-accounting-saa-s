import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/rh/paie/[id]/decomptabiliser
 *
 * FIX-IMMUTABLE (mig 427) + FIX-DECOMPTA UI — décomptabilisation d'un bulletin
 * accessible aux rôles RH + direction (et plus seulement admin).
 *
 * Règle scalable : un bulletin comptabilisé est immuable. Le SEUL moyen
 * de le re-modifier est de passer par cette route, qui :
 *
 *   1. Vérifie le rôle (whitelist élargie) — sinon 403.
 *   2. Lit le bulletin + écriture liée pour audit.
 *   3. Insère une ligne WORM dans bulletin_decomptabilisation_log.
 *   4. UPDATE bulletin : comptabilise=FALSE, comptabilise_at=NULL,
 *      ecriture_id=NULL, comptabilise_by=NULL.
 *      (Le trigger trg_bulletin_immutable_update reconnaît la transition
 *      TRUE→FALSE comme décomptabilisation explicite et autorise.)
 *
 * NE SUPPRIME PAS les écritures liées : c'est la responsabilité du
 * comptable (qui devra passer une OD de contre-passation ou supprimer
 * manuellement). Cela préserve la piste d'audit comptable.
 *
 * Body attendu : { raison: string, type_correction?: string }
 *
 * Retour : `requires_admin_approval` = true si le rôle acteur n'est pas
 * admin/super_admin — placeholder pour un futur workflow d'approbation.
 */
const ALLOWED_ROLES = [
  'admin',
  'super_admin',
  'rh',
  'rh_manager',
  'direction',
  'client_admin',
] as const

type AllowedRole = (typeof ALLOWED_ROLES)[number]
const ADMIN_ROLES: AllowedRole[] = ['admin', 'super_admin']

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: bulletin_id } = await ctx.params
    if (!bulletin_id) {
      return NextResponse.json({ error: 'bulletin_id manquant' }, { status: 400 })
    }

    // Auth — session user (pas internal token : décompta est manuelle)
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const supabase = getAdminClient()

    // 1. Vérifier rôle admin / super_admin
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (profileErr) {
      console.error('[decomptabiliser] profile lookup error:', profileErr.message)
      return NextResponse.json({ error: 'Erreur contrôle rôle' }, { status: 500 })
    }
    const role = (profile as any)?.role as string | null | undefined
    if (!role || !ALLOWED_ROLES.includes(role as AllowedRole)) {
      return NextResponse.json({
        error: 'Action réservée aux rôles RH, direction ou admin.',
        role_actuel: role || 'inconnu',
        roles_autorises: ALLOWED_ROLES,
      }, { status: 403 })
    }
    const isAdmin = ADMIN_ROLES.includes(role as AllowedRole)

    // 2. Lire body (raison obligatoire pour traçabilité)
    const body = await request.json().catch(() => ({}))
    const raison: string = (body?.raison || '').trim()
    const typeCorrection: string | null = body?.type_correction
      ? String(body.type_correction).slice(0, 80)
      : null
    if (!raison || raison.length < 5) {
      return NextResponse.json({
        error: 'Raison obligatoire (5 caractères min) — traçabilité audit.',
      }, { status: 400 })
    }
    if (raison.length > 500) {
      return NextResponse.json({
        error: 'Raison trop longue (max 500 caractères).',
      }, { status: 400 })
    }

    // 3. Lire le bulletin actuel
    const { data: bulletin, error: bErr } = await supabase
      .from('bulletins_paie')
      .select('id, employe_id, periode, comptabilise, ecriture_id, comptabilise_at, verrouille')
      .eq('id', bulletin_id)
      .maybeSingle()

    if (bErr || !bulletin) {
      return NextResponse.json({
        error: 'Bulletin introuvable',
        details: bErr?.message,
      }, { status: 404 })
    }

    if (!(bulletin as any).comptabilise) {
      return NextResponse.json({
        error: 'Bulletin pas (ou plus) comptabilisé — rien à décomptabiliser.',
        bulletin_id,
      }, { status: 409 })
    }

    // 4. INSERT audit WORM (avant l'UPDATE pour ne rien perdre en cas
    //    de crash entre les deux étapes).
    const { error: auditErr } = await supabase
      .from('bulletin_decomptabilisation_log')
      .insert({
        bulletin_id: bulletin.id,
        ecriture_id_avant: (bulletin as any).ecriture_id,
        action: isAdmin ? 'admin_decomptabilisation' : 'rh_decomptabilisation',
        user_id: user.id,
        raison,
        metadata: {
          comptabilise_at_avant: (bulletin as any).comptabilise_at,
          verrouille: (bulletin as any).verrouille,
          role_acteur: role,
          type_correction: typeCorrection,
          requires_admin_approval: !isAdmin,
        },
      })

    if (auditErr) {
      console.error('[decomptabiliser] audit insert failed:', auditErr.message)
      return NextResponse.json({
        error: 'Échec écriture audit — décomptabilisation annulée pour préserver la piste.',
        details: auditErr.message,
      }, { status: 500 })
    }

    // 5. UPDATE bulletin (trigger immutable autorise la transition TRUE→FALSE)
    const { data: updated, error: uErr } = await supabase
      .from('bulletins_paie')
      .update({
        comptabilise: false,
        comptabilise_at: null,
        ecriture_id: null,
        comptabilise_by: null,
      })
      .eq('id', bulletin_id)
      .select('id, employe_id, periode, comptabilise')
      .single()

    if (uErr) {
      console.error('[decomptabiliser] UPDATE failed:', uErr.message)
      return NextResponse.json({
        error: 'Échec décomptabilisation',
        details: uErr.message,
      }, { status: 500 })
    }

    // 6. Supprimer les écritures de paie liées (BP-<id>) pour ne pas laisser
    //    d'écritures ORPHELINES au grand livre. C'est la cause des
    //    déséquilibres "valider/dévalider sans aller au bout" constatés :
    //    avant ce fix, décomptabiliser laissait les écritures BP-* en place.
    //    La piste d'audit est préservée par bulletin_decomptabilisation_log
    //    (étape 4) + le log applicatif ci-dessous. La re-comptabilisation
    //    régénère des écritures propres (RPC mig 449, équilibre garanti).
    const piece = `BP-${bulletin_id}`
    const { error: ecrDelErr, count: ecrDeleted } = await supabase
      .from('ecritures_comptables_v2')
      .delete({ count: 'exact' })
      .eq('journal', 'OD-PAIE')
      .or(`ref_folio.eq.${piece},numero_piece.eq.${piece}`)
    if (ecrDelErr) {
      // Non bloquant : le bulletin est déjà décomptabilisé. On signale pour
      // que le comptable puisse nettoyer manuellement si besoin.
      console.error('[decomptabiliser] suppression écritures BP échouée:', ecrDelErr.message)
    }

    console.log(
      `[decomptabiliser] OK bulletin=${bulletin_id} ` +
      `ecriture_avant=${(bulletin as any).ecriture_id || 'n/a'} ` +
      `ecritures_supprimees=${ecrDeleted ?? '?'} ` +
      `par=${user.email || user.id} raison="${raison.slice(0, 80)}"`,
    )

    return NextResponse.json({
      success: true,
      bulletin: updated,
      ecritures_supprimees: ecrDeleted ?? null,
      message: 'Bulletin décomptabilisé et écritures de paie liées supprimées. Re-comptabiliser après correction pour régénérer le grand livre.',
      ecriture_id_avant: (bulletin as any).ecriture_id,
      role_acteur: role,
      requires_admin_approval: !isAdmin,
    })
  } catch (e: any) {
    console.error('[decomptabiliser] EXCEPTION:', e?.message, e?.stack)
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'Erreur',
    }, { status: 500 })
  }
}
