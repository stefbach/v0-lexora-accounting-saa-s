/**
 * POST /api/rh/provisions/conges/comptabiliser — sprint G8 Phase 1.
 *
 * 1. Extourne le snapshot précédent (mois-1) si comptabilisé
 * 2. Calcule et upserte le snapshot du mois
 * 3. Génère les 2 écritures comptables (6417 D / 4287 C)
 *
 * Auth : admin uniquement (sensible).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  calculerProvisionSociete,
  sauvegarderSnapshot,
  genererEcrituresComptables,
  extournerSnapshot,
  getSnapshot,
  finDeMois,
  moisPrecedent,
} from '@/lib/rh/ias19-provisions'

export const dynamic = 'force-dynamic'

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
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (prof as any)?.role || ''
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Comptabilisation réservée admin' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const societeId = String(body.societe_id || '').trim()
    if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (!body.date_snapshot) return NextResponse.json({ error: 'date_snapshot requis' }, { status: 400 })

    const dateSnapshot = finDeMois(String(body.date_snapshot).slice(0, 10))

    // 0. Vérifier si le mois courant est déjà comptabilisé
    const existant = await getSnapshot(supabase, societeId, dateSnapshot)
    if (existant && existant.statut === 'comptabilise') {
      return NextResponse.json({
        error: `Déjà comptabilisé le ${String(existant.updated_at || '').slice(0, 10)}. Annulez le snapshot avant de relancer.`,
      }, { status: 409 })
    }

    // 1. Extourner le mois précédent s'il est comptabilisé
    const datePrecedente = moisPrecedent(dateSnapshot)
    const snapshotPrecedent = await getSnapshot(supabase, societeId, datePrecedente)
    let extourneIds: { debitId: string; creditId: string } | null = null
    if (snapshotPrecedent && snapshotPrecedent.statut === 'comptabilise' && snapshotPrecedent.id) {
      const ext = await extournerSnapshot(supabase, snapshotPrecedent.id, dateSnapshot)
      if (!ext.ok) {
        return NextResponse.json({ error: `Extourne échouée : ${ext.erreur}` }, { status: 500 })
      }
      extourneIds = { debitId: ext.debitId, creditId: ext.creditId }
    }

    // 2. Calcul + sauvegarde
    const snapshot = await calculerProvisionSociete(supabase, societeId, dateSnapshot)
    const save = await sauvegarderSnapshot(supabase, snapshot, user.id)
    if (!save.ok) {
      return NextResponse.json({ error: `Sauvegarde échouée : ${save.erreur}` }, { status: 500 })
    }

    // 3. Écritures comptables (si provision > 0)
    let ecritures: { debitId: string; creditId: string } | null = null
    if (snapshot.provision_total_mur > 0) {
      const gen = await genererEcrituresComptables(supabase, save.id)
      if (!gen.ok) {
        return NextResponse.json({ error: `Écritures échouées : ${gen.erreur}` }, { status: 500 })
      }
      ecritures = { debitId: gen.debitId, creditId: gen.creditId }
    } else {
      await supabase
        .from('ias19_provisions_conges_snapshots')
        .update({ statut: 'comptabilise' })
        .eq('id', save.id)
    }

    return NextResponse.json({
      success: true,
      snapshot_id: save.id,
      provision_total_mur: snapshot.provision_total_mur,
      ecritures,
      extourne_precedent: extourneIds,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
