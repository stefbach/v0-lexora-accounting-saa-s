/**
 * AGENT FIX-ALICIA — POST /api/rh/paie/reconstruct
 *
 * Reconstruit un bulletin de paie à partir du grand livre
 * (`ecritures_comptables_v2`). Deux modes :
 *
 *   - `replace_active = false` (défaut) → preview : retourne juste les
 *     valeurs reconstituées sans modifier le bulletin actuel. Utile pour
 *     le dialog "Prévisualiser".
 *
 *   - `replace_active = true` → action : archive le bulletin actif, crée
 *     une nouvelle ligne avec les valeurs reconstituées et marque les
 *     champs `notes` + `archive_reason`.
 *
 * Body :
 *   {
 *     bulletin_id?: string,    // si fourni, recherche par numero_piece BP-<id>
 *     employe_id?:  string,
 *     periode?:     string,    // YYYY-MM ou YYYY-MM-DD
 *     societe_id?:  string,
 *     replace_active?: boolean
 *   }
 *
 * Garde-fous :
 *   - 401 si non authentifié
 *   - 403 si rôle non autorisé (whitelist comme decomptabiliser)
 *   - 409 si replace_active=true ET bulletin actif comptabilisé
 *   - 404 si aucune écriture trouvée
 *   - Audit log via bulletin_decomptabilisation_log (action=rh_reconstruction)
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  reconstructBulletinFromEcritures,
  type ReconstructedBulletin,
} from '@/lib/rh/reconstruct-bulletin-from-ecritures'

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

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const supabase = getAdminClient()

    // Vérification rôle
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    const role = (profile as any)?.role as string | undefined
    if (!role || !ALLOWED_ROLES.includes(role as AllowedRole)) {
      return NextResponse.json(
        {
          error: 'Action réservée aux rôles RH, direction ou admin.',
          role_actuel: role || 'inconnu',
          roles_autorises: ALLOWED_ROLES,
        },
        { status: 403 },
      )
    }

    // Body
    const body = (await request.json().catch(() => ({}))) as {
      bulletin_id?: string
      employe_id?: string
      periode?: string
      societe_id?: string
      replace_active?: boolean
    }
    const {
      bulletin_id,
      employe_id,
      periode,
      societe_id,
      replace_active = false,
    } = body

    if (!bulletin_id && !(employe_id && periode)) {
      return NextResponse.json(
        {
          error:
            'Paramètres insuffisants : fournir bulletin_id OU (employe_id + periode).',
        },
        { status: 400 },
      )
    }

    // Si bulletin_id fourni, on lit le bulletin pour récupérer employe/societe/periode
    type ActiveBulletin = {
      id: string
      employe_id: string
      societe_id: string
      periode: string
      comptabilise: boolean
      is_archived: boolean
      salaire_net: number | null
    }
    let activeBulletin: ActiveBulletin | null = null

    if (bulletin_id) {
      const { data: b, error: bErr } = await supabase
        .from('bulletins_paie')
        .select('id, employe_id, societe_id, periode, comptabilise, is_archived, salaire_net')
        .eq('id', bulletin_id)
        .maybeSingle()
      if (bErr || !b) {
        return NextResponse.json(
          { error: 'Bulletin introuvable', details: bErr?.message },
          { status: 404 },
        )
      }
      activeBulletin = b as unknown as ActiveBulletin
    }

    // 1. Reconstituer depuis grand livre
    const reconstructed = await reconstructBulletinFromEcritures(supabase, {
      bulletin_id,
      employe_id: employe_id ?? activeBulletin?.employe_id,
      periode: periode ?? activeBulletin?.periode,
      societe_id: societe_id ?? activeBulletin?.societe_id,
    })

    if (!reconstructed) {
      return NextResponse.json(
        {
          error:
            'Aucune écriture trouvée dans le grand livre pour ce bulletin / cette période.',
          hint: 'Vérifier que le bulletin a bien été comptabilisé (numero_piece BP-<id>) ou élargir la recherche par employé + période.',
        },
        { status: 404 },
      )
    }

    // Mode preview : retourner les valeurs sans toucher la base.
    if (!replace_active) {
      return NextResponse.json({
        success: true,
        mode: 'preview',
        reconstructed,
        current:
          activeBulletin && {
            id: activeBulletin.id,
            salaire_net: activeBulletin.salaire_net,
            comptabilise: activeBulletin.comptabilise,
            is_archived: activeBulletin.is_archived,
          },
      })
    }

    // Mode replace : nécessite bulletin_id + bulletin non comptabilisé.
    if (!activeBulletin) {
      return NextResponse.json(
        {
          error:
            'replace_active=true exige bulletin_id (on ne peut remplacer que un bulletin connu).',
        },
        { status: 400 },
      )
    }

    if (activeBulletin.comptabilise) {
      return NextResponse.json(
        {
          error:
            'Bulletin verrouillé (comptabilisé). Décomptabiliser d\'abord via /api/rh/paie/[id]/decomptabiliser.',
          bulletin_id: activeBulletin.id,
        },
        { status: 409 },
      )
    }

    // 2. Archiver l'actuel (mig 425 — is_archived + archive_reason)
    const nowIso = new Date().toISOString()
    const { error: archErr } = await supabase
      .from('bulletins_paie')
      .update({
        is_archived: true,
        archived_at: nowIso,
        archive_reason: `Remplacé par reconstruction depuis grand livre (${reconstructed.ecritures_sources.length} écritures sources) — par ${user.email || user.id}`,
      })
      .eq('id', activeBulletin.id)

    if (archErr) {
      return NextResponse.json(
        { error: 'Échec archivage bulletin actif', details: archErr.message },
        { status: 500 },
      )
    }

    // 3. Insérer le nouveau bulletin reconstitué.
    const newRow: Record<string, unknown> = {
      employe_id: activeBulletin.employe_id,
      societe_id: activeBulletin.societe_id,
      periode: activeBulletin.periode,
      salaire_base: reconstructed.salaire_brut,
      paye: reconstructed.paye_total,
      nsf_salarie: reconstructed.nsf_total,
      csg_salarie: reconstructed.csg_total,
      salaire_net: reconstructed.salaire_net,
      total_deductions:
        reconstructed.paye_total +
        reconstructed.nsf_total +
        reconstructed.csg_total +
        reconstructed.retenues_manuelles,
      notes: reconstructed.notes,
      statut: 'reconstitue',
      is_archived: false,
      anomalies: [
        {
          type: 'reconstruction_grand_livre',
          retenues_manuelles_reconstituees: reconstructed.retenues_manuelles,
          ecritures_sources_count: reconstructed.ecritures_sources.length,
          source_bulletin_archive: activeBulletin.id,
          performed_by: user.id,
          performed_at: nowIso,
        },
      ],
    }

    const { data: inserted, error: insErr } = await supabase
      .from('bulletins_paie')
      .insert(newRow)
      .select('id, employe_id, periode, salaire_net, is_archived')
      .single()

    if (insErr) {
      // Rollback : restaurer l'actif (sortir de l'archive)
      await supabase
        .from('bulletins_paie')
        .update({ is_archived: false, archived_at: null, archive_reason: null })
        .eq('id', activeBulletin.id)
      return NextResponse.json(
        {
          error: 'Échec insertion bulletin reconstitué — archive rollback effectué.',
          details: insErr.message,
        },
        { status: 500 },
      )
    }

    // 4. Mettre à jour superseded_by croisé (mig 425)
    await supabase
      .from('bulletins_paie')
      .update({ superseded_by: (inserted as any).id })
      .eq('id', activeBulletin.id)

    // 5. Audit log (réutilise la table bulletin_decomptabilisation_log)
    await supabase.from('bulletin_decomptabilisation_log').insert({
      bulletin_id: (inserted as any).id,
      ecriture_id_avant: null,
      action: 'rh_reconstruction_grand_livre',
      user_id: user.id,
      raison: `Reconstruction bulletin depuis grand livre (${reconstructed.ecritures_sources.length} écritures sources). Bulletin actif précédent archivé: ${activeBulletin.id}.`,
      metadata: {
        bulletin_archive_id: activeBulletin.id,
        valeurs_reconstituees: {
          salaire_brut: reconstructed.salaire_brut,
          paye_total: reconstructed.paye_total,
          nsf_total: reconstructed.nsf_total,
          csg_total: reconstructed.csg_total,
          retenues_manuelles: reconstructed.retenues_manuelles,
          salaire_net: reconstructed.salaire_net,
        },
        role_acteur: role,
      },
    })

    console.log(
      `[paie/reconstruct] OK bulletin_archive=${activeBulletin.id} nouveau=${(inserted as any).id} ` +
        `par=${user.email || user.id} retenues_manuelles=${reconstructed.retenues_manuelles}`,
    )

    return NextResponse.json({
      success: true,
      mode: 'replace',
      reconstructed,
      bulletin_archive_id: activeBulletin.id,
      nouveau_bulletin: inserted,
    })
  } catch (e: any) {
    console.error('[paie/reconstruct] EXCEPTION:', e?.message, e?.stack)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 },
    )
  }
}

/** Preview-only GET pour aperçu rapide via query string (debug). */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const bulletin_id = url.searchParams.get('bulletin_id') ?? undefined
  const employe_id = url.searchParams.get('employe_id') ?? undefined
  const periode = url.searchParams.get('periode') ?? undefined
  const societe_id = url.searchParams.get('societe_id') ?? undefined

  // Reuse POST handler logic via internal forward
  const fakeReq = new Request(url.toString(), {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({
      bulletin_id,
      employe_id,
      periode,
      societe_id,
      replace_active: false,
    }),
  })
  return POST(fakeReq)
}

export type { ReconstructedBulletin }
