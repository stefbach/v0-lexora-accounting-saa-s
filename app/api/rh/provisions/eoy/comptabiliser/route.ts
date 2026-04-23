/**
 * POST /api/rh/provisions/eoy/comptabiliser — sprint G8 Phase 2.
 *
 * 1. Extourne le snapshot mois-1 si comptabilisé (reset cumul)
 * 2. Calcule et upsert le snapshot mois courant
 * 3. Génère les 2 écritures (64176 D / 4288 C) pour le delta
 *
 * Auth : admin uniquement. Mois 12 rejeté.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  calculerProvisionEoySociete,
  sauvegarderSnapshotEoy,
  genererEcrituresComptablesEoy,
  extournerSnapshotEoy,
  getSnapshotEoy,
  dateFinDeMois,
} from '@/lib/rh/ias19-eoy-provisions'

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
    const annee = Number(body.annee)
    const mois = Number(body.mois)
    if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (!Number.isFinite(annee) || !Number.isFinite(mois)) {
      return NextResponse.json({ error: 'annee/mois requis' }, { status: 400 })
    }
    if (mois === 12) {
      return NextResponse.json({
        error: 'Pas de provision en décembre (paiement réel via G11)',
      }, { status: 400 })
    }
    if (mois < 1 || mois > 11) {
      return NextResponse.json({ error: 'mois invalide (1-11)' }, { status: 400 })
    }

    // 0. Rejeter si déjà comptabilisé
    const existant = await getSnapshotEoy(supabase, societeId, annee, mois)
    if (existant && existant.statut === 'comptabilise') {
      return NextResponse.json({
        error: `Déjà comptabilisé le ${String(existant.updated_at || '').slice(0, 10)}. Annulez le snapshot avant de relancer.`,
      }, { status: 409 })
    }

    // 1. Extourne mois-1 si comptabilisé
    let extourneIds: { debitId: string; creditId: string } | null = null
    if (mois > 1) {
      const snapPrec = await getSnapshotEoy(supabase, societeId, annee, mois - 1)
      if (snapPrec && snapPrec.statut === 'comptabilise' && snapPrec.id) {
        const ext = await extournerSnapshotEoy(supabase, snapPrec.id, dateFinDeMois(annee, mois))
        if (!ext.ok) {
          return NextResponse.json({ error: `Extourne échouée : ${ext.erreur}` }, { status: 500 })
        }
        extourneIds = { debitId: ext.debitId, creditId: ext.creditId }
      }
    }

    // 2. Calcul + sauvegarde
    const snapshot = await calculerProvisionEoySociete(supabase, societeId, annee, mois)
    const save = await sauvegarderSnapshotEoy(supabase, snapshot, user.id)
    if (!save.ok) {
      return NextResponse.json({ error: `Sauvegarde échouée : ${save.erreur}` }, { status: 500 })
    }

    // 3. Écritures pour le cumul (pas juste le delta) — logique équivalente
    //    car l'extourne du mois précédent a remis à zéro. On comptabilise
    //    donc le nouveau cumul complet comme provision du mois.
    // NOTE : si pas d'extourne (mois 1 ou mois précédent non comptabilisé),
    //        on passe quand même le cumul complet, ce qui est correct
    //        (la charge totale depuis le début est ce qui doit apparaître).
    const montantACompta = snapshot.provision_cumulee_total
    let ecritures: { debitId: string; creditId: string } | null = null

    if (Math.abs(montantACompta) >= 0.01) {
      // Forcer le delta à être le cumul pour cette comptabilisation
      await supabase
        .from('ias19_provisions_eoy_snapshots')
        .update({ provision_du_mois_total: montantACompta })
        .eq('id', save.id)

      const gen = await genererEcrituresComptablesEoy(supabase, save.id)
      if (!gen.ok) {
        return NextResponse.json({ error: `Écritures échouées : ${gen.erreur}` }, { status: 500 })
      }
      ecritures = { debitId: gen.debitId, creditId: gen.creditId }
    } else {
      await supabase
        .from('ias19_provisions_eoy_snapshots')
        .update({ statut: 'comptabilise' })
        .eq('id', save.id)
    }

    return NextResponse.json({
      success: true,
      snapshot_id: save.id,
      provision_cumulee_total: snapshot.provision_cumulee_total,
      nb_employes_eligibles: snapshot.nb_employes_eligibles,
      ecritures,
      extourne_precedent: extourneIds,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur serveur' }, { status: 500 })
  }
}
