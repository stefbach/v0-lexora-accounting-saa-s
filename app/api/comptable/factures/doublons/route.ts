import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// =============================================================================
// Détection des factures EN DOUBLON déjà présentes en base (pour régularisation).
//
// Critère de regroupement (indépendant du numéro, car le suffixe -2/-3 ajouté
// à la création masque les doublons) :
//     tiers (normalisé) + date_facture + montant_ttc (arrondi)
// Un groupe de 2+ factures = doublon probable. La plus ANCIENNE (created_at) est
// proposée « à conserver », les autres « à supprimer » — l'utilisateur tranche.
// Lecture seule : la suppression se fait via DELETE /api/comptable/factures/[id].
// =============================================================================

function normTiers(s: any): string {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const { data: factures, error } = await supabase
      .from('factures')
      .select('id, numero_facture, tiers, type_facture, date_facture, montant_ttc, montant_mur, devise, statut, document_id, created_at')
      .eq('societe_id', societe_id)
      .neq('statut', 'brouillon')
      .order('created_at', { ascending: true })
      .limit(5000)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Regroupement par (tiers normalisé + date + montant TTC arrondi)
    const groupes = new Map<string, any[]>()
    for (const f of factures || []) {
      const ttc = Math.round((Number(f.montant_ttc) || 0) * 100) / 100
      if (ttc === 0) continue // on ignore les montants nuls (peu fiables)
      const key = `${normTiers(f.tiers)}|${String(f.date_facture).slice(0, 10)}|${ttc.toFixed(2)}`
      if (!groupes.has(key)) groupes.set(key, [])
      groupes.get(key)!.push(f)
    }

    const doublons = [...groupes.entries()]
      .filter(([, arr]) => arr.length >= 2)
      .map(([key, arr]) => {
        // arr est déjà trié par created_at asc → [0] = à conserver
        const factures = arr.map((f, i) => ({
          id: f.id,
          numero_facture: f.numero_facture,
          tiers: f.tiers,
          type_facture: f.type_facture,
          date_facture: f.date_facture,
          montant_ttc: Number(f.montant_ttc) || 0,
          montant_mur: Number(f.montant_mur) || 0,
          devise: f.devise,
          statut: f.statut,
          document_id: f.document_id,
          created_at: f.created_at,
          role: i === 0 ? 'conserver' : 'doublon',
        }))
        return {
          key,
          tiers: arr[0].tiers,
          date_facture: String(arr[0].date_facture).slice(0, 10),
          montant_ttc: Number(arr[0].montant_ttc) || 0,
          count: arr.length,
          nb_doublons: arr.length - 1,
          factures,
        }
      })
      .sort((a, b) => b.count - a.count || (a.date_facture < b.date_facture ? 1 : -1))

    const nbDoublons = doublons.reduce((s, g) => s + g.nb_doublons, 0)
    const montantDoublons = Math.round(
      doublons.reduce((s, g) => s + g.montant_ttc * g.nb_doublons, 0) * 100,
    ) / 100

    return NextResponse.json({
      societe_id,
      nb_groupes: doublons.length,
      nb_doublons: nbDoublons,
      montant_ttc_doublons: montantDoublons,
      doublons,
    })
  } catch (e: any) {
    console.error('[factures/doublons]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}
