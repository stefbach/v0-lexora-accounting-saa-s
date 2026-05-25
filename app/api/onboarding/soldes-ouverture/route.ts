/**
 * POST /api/onboarding/soldes-ouverture
 *
 * Onboarding — saisie initiale des soldes d'ouverture (banques, clients,
 * fournisseurs, immobilisations) pour une nouvelle société cliente.
 *
 * Au moment de la soumission, on appelle la RPC `enregistrer_soldes_ouverture`
 * (cf. migration 301) qui génère des écritures équilibrées dans
 * `ecritures_comptables_v2` avec journal='AN' (À-Nouveaux), à la date du
 * début d'exercice de la société.
 *
 * Idempotent : si une saisie existe déjà pour (societe_id, exercice), la
 * route renvoie 409 avec le diff, sans dupliquer.
 *
 * Roles autorisés : admin, super_admin, comptable, comptable_dedie,
 *                   client_admin. La société doit être accessible via
 *                   getUserSocieteIds().
 *
 * GET ?societe_id=&exercice=  → retourne l'état de la saisie (déjà fait ?).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getUserSocieteIds } from '@/lib/rh/access'

export const dynamic = 'force-dynamic'

type LigneSolde = {
  compte: string
  nom_tiers?: string
  montant_mur: number
  devise_origine?: string | null
  montant_origine?: number | null
  section: 'banque' | 'client' | 'fournisseur' | 'immobilisation'
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function requireUserWithRole() {
  const supabaseAuth = await createServerClient()
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
  if (!user || authError) return { user: null, role: null }
  const { data: profile } = await supabaseAuth
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const role = profile?.role ?? null
  const allowed = ['admin', 'super_admin', 'comptable', 'comptable_dedie', 'client_admin']
  if (!role || !allowed.includes(role)) return { user: null, role }
  return { user, role }
}

export async function GET(request: Request) {
  try {
    const { user } = await requireUserWithRole()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const exercice = searchParams.get('exercice')
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    // Role-gate : la société doit être accessible
    const accessibleIds = await getUserSocieteIds(user.id)
    if (!accessibleIds.includes(societe_id)) {
      return NextResponse.json({ error: 'Accès refusé pour cette société' }, { status: 403 })
    }

    const supabase = getAdminClient()

    const { data: societe } = await supabase
      .from('societes')
      .select('id, nom, date_debut_exercice, date_fin_exercice')
      .eq('id', societe_id)
      .maybeSingle()
    if (!societe) {
      return NextResponse.json({ error: 'Société introuvable' }, { status: 404 })
    }

    let saisie: unknown = null
    if (exercice) {
      const { data } = await supabase
        .from('soldes_ouverture_saisie')
        .select('*')
        .eq('societe_id', societe_id)
        .eq('exercice', exercice)
        .maybeSingle()
      saisie = data ?? null
    }

    return NextResponse.json({ societe, saisie })
  } catch (e: any) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur inconnue' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const { user } = await requireUserWithRole()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({} as any))
    const societe_id = body.societe_id as string | undefined
    const exercice = body.exercice as string | undefined
    const lignesRaw = body.lignes as LigneSolde[] | undefined
    const compte_contrepartie =
      typeof body.compte_contrepartie === 'string' && body.compte_contrepartie.trim() !== ''
        ? (body.compte_contrepartie as string)
        : '110'
    const dryRun = body.dry_run === true

    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }
    if (!exercice) {
      return NextResponse.json({ error: 'exercice requis (ex: 2025-2026)' }, { status: 400 })
    }
    if (!Array.isArray(lignesRaw) || lignesRaw.length === 0) {
      return NextResponse.json({ error: 'lignes doit être un tableau non vide' }, { status: 400 })
    }

    // Role-gate société
    const accessibleIds = await getUserSocieteIds(user.id)
    if (!accessibleIds.includes(societe_id)) {
      return NextResponse.json({ error: 'Accès refusé pour cette société' }, { status: 403 })
    }

    // Validation lignes
    const lignes: LigneSolde[] = []
    for (const l of lignesRaw) {
      if (!l || typeof l !== 'object') continue
      const compte = String((l as LigneSolde).compte ?? '').trim()
      const montant = Number((l as LigneSolde).montant_mur ?? 0)
      const section = (l as LigneSolde).section
      if (!compte || !montant || !section) continue
      if (!['banque', 'client', 'fournisseur', 'immobilisation'].includes(section)) {
        continue
      }
      lignes.push({
        compte,
        nom_tiers: String((l as LigneSolde).nom_tiers ?? '').trim(),
        montant_mur: Math.round(montant * 100) / 100,
        devise_origine: ((l as LigneSolde).devise_origine ?? null) || null,
        montant_origine:
          (l as LigneSolde).montant_origine != null
            ? Number((l as LigneSolde).montant_origine)
            : null,
        section,
      })
    }

    if (lignes.length === 0) {
      return NextResponse.json(
        { error: 'Aucune ligne valide (compte, montant, section requis)' },
        { status: 400 }
      )
    }

    const supabase = getAdminClient()

    // Pré-check idempotence : déjà saisi ?
    const { data: existing } = await supabase
      .from('soldes_ouverture_saisie')
      .select('*')
      .eq('societe_id', societe_id)
      .eq('exercice', exercice)
      .maybeSingle()

    if (existing && !dryRun) {
      // Calcul du diff : nouvelles lignes vs saisie existante
      const total_demande = lignes.reduce((acc, l) => acc + l.montant_mur, 0)
      return NextResponse.json(
        {
          status: 'deja_saisi',
          deja_existante: true,
          saisie_existante: existing,
          diff: {
            nb_lignes_existantes: existing.nb_lignes,
            nb_lignes_demandees: lignes.length,
            total_existant_debit: existing.total_debit_mur,
            total_existant_credit: existing.total_credit_mur,
            total_demande,
            ecart_par_rapport_existant:
              Number(total_demande) - Number(existing.total_debit_mur ?? 0),
          },
          message:
            "Soldes d'ouverture déjà saisis pour cet exercice. Aucune écriture créée.",
        },
        { status: 409 }
      )
    }

    // Appel RPC
    const { data: rpcResult, error: rpcErr } = await supabase.rpc(
      'enregistrer_soldes_ouverture',
      {
        p_societe_id: societe_id,
        p_exercice: exercice,
        p_lignes: lignes,
        p_user_id: user.id,
        p_compte_contrepartie: compte_contrepartie,
        p_dry_run: dryRun,
      }
    )

    if (rpcErr) {
      return NextResponse.json(
        { error: 'RPC error: ' + rpcErr.message, details: rpcErr },
        { status: 500 }
      )
    }

    return NextResponse.json({ status: 'ok', result: rpcResult })
  } catch (e: any) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur inconnue' },
      { status: 500 }
    )
  }
}
