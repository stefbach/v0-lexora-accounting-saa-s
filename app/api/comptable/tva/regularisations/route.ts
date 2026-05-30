import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// =============================================================================
// Régularisations TVA période antérieure (mode éditable)
//
// GET  : détecte automatiquement les écarts sur les périodes DÉJÀ déclarées et
//        figées (mig 451) dont la TVA recalculée depuis les factures diffère du
//        montant déclaré à la MRA (= factures ajoutées après coup), avec le
//        détail des factures concernées ; renvoie aussi les lignes de
//        régularisation déjà enregistrées pour la période courante.
// PUT  : remplace le jeu de lignes de régularisation (auto retenues + manuelles)
//        de la période courante. Persistance dans tva_regularisations (mig 452).
//
// Principe : la compta reste à la vraie date, la régul est portée sur la
// période courante (prior-period adjustment MRA). Aucune écriture n'est créée.
// =============================================================================

const isYM = (s: any) => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s)

function moisBornes(periode: string) {
  const [y, m] = periode.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return { debut: `${periode}-01`, fin: `${periode}-${String(lastDay).padStart(2, '0')}` }
}

// TVA d'une facture selon sa nature (mêmes règles que /rattrapage)
function tvaFacture(f: any): { collectee: number; deductible: number } {
  const tva = Number(f.montant_tva) || 0
  const isForeign = f.devise && f.devise !== 'MUR'
  if (f.type_facture === 'client' && !f.client_offshore && !isForeign) {
    return { collectee: tva, deductible: 0 }
  }
  if (f.type_facture === 'fournisseur' && !isForeign) {
    return { collectee: 0, deductible: tva }
  }
  return { collectee: 0, deductible: 0 }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — détection + lignes enregistrées
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const periode = searchParams.get('periode') // période courante YYYY-MM

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (!isYM(periode)) return NextResponse.json({ error: 'periode (YYYY-MM) requise' }, { status: 400 })

    const { data: societe, error: socErr } = await supabase
      .from('societes')
      .select('id, nom, client_id, frequence_tva')
      .eq('id', societe_id)
      .single()
    if (socErr || !societe) return NextResponse.json({ error: 'Société introuvable' }, { status: 404 })

    // ── Périodes figées antérieures à la période courante ────────────────────
    let figees: any[] = []
    {
      const r = await supabase
        .from('tva_mensuelle')
        .select('id, periode, declaration_figee, montant_declare_mra, tva_nette, tva_nette_recalculee, declare_at')
        .eq('societe_id', societe_id)
        .eq('declaration_figee', true)
        .lt('periode', periode!)
      if (!r.error) figees = r.data || []
    }

    // ── Factures de toutes ces périodes (1 requête) pour recalcul + détail ────
    const detectees: any[] = []
    if (figees.length > 0) {
      const periodesFigees = figees.map(f => f.periode).filter(isYM).sort()
      const borneMin = moisBornes(periodesFigees[0]).debut
      const borneMax = moisBornes(periodesFigees[periodesFigees.length - 1]).fin

      const { data: factures } = await supabase
        .from('factures')
        .select('id, numero_facture, tiers, type_facture, montant_tva, date_facture, devise, client_offshore, statut, created_at')
        .eq('societe_id', societe_id)
        .gte('date_facture', borneMin)
        .lte('date_facture', borneMax)
        .neq('statut', 'brouillon')

      // Regroupe par mois
      const parMois = new Map<string, any[]>()
      for (const f of factures || []) {
        const mois = String(f.date_facture).slice(0, 7)
        if (!parMois.has(mois)) parMois.set(mois, [])
        parMois.get(mois)!.push(f)
      }

      for (const fig of figees) {
        const fs = parMois.get(fig.periode) || []
        let collectee = 0, deductible = 0
        for (const f of fs) {
          const t = tvaFacture(f)
          collectee += t.collectee
          deductible += t.deductible
        }
        const recalc = Math.round((collectee - deductible) * 100) / 100
        const declare = Number(fig.montant_declare_mra ?? fig.tva_nette ?? 0)
        const ecart = Math.round((recalc - declare) * 100) / 100
        if (Math.abs(ecart) < 0.01) continue

        // Factures ajoutées APRÈS le gel de la déclaration = à l'origine de l'écart
        const declareAt = fig.declare_at ? new Date(fig.declare_at).getTime() : 0
        const facturesOubliees = fs
          .filter(f => !declareAt || (f.created_at && new Date(f.created_at).getTime() > declareAt))
          .map(f => ({
            id: f.id,
            numero: f.numero_facture,
            tiers: f.tiers,
            type: f.type_facture,
            montant_tva: Number(f.montant_tva) || 0,
            date_facture: f.date_facture,
          }))

        detectees.push({
          periode_origine: fig.periode,
          tva_recalculee: recalc,
          montant_declare_mra: declare,
          ecart,
          libelle: `Régularisation TVA ${fig.periode} (écart déclaration MRA)`,
          factures_oubliees: facturesOubliees,
        })
      }
    }

    // ── Lignes de régularisation déjà enregistrées (mig 452) ─────────────────
    let lignes: any[] = []
    let migration_452 = true
    {
      const r = await supabase
        .from('tva_regularisations')
        .select('id, periode_origine, libelle, montant, sens, type, facture_id, motif, statut, created_at')
        .eq('societe_id', societe_id)
        .eq('periode_courante', periode!)
        .order('created_at', { ascending: true })
      if (r.error) migration_452 = false
      else lignes = r.data || []
    }

    const totalInclus = lignes
      .filter(l => l.statut === 'incluse')
      .reduce((s, l) => s + (Number(l.montant) || 0), 0)

    return NextResponse.json({
      societe: { id: societe.id, nom: societe.nom },
      periode,
      migration_452,
      nb_periodes_figees: figees.length,
      detectees,
      lignes,
      total_inclus: Math.round(totalInclus * 100) / 100,
    })
  } catch (e: any) {
    console.error('[tva/regularisations GET]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT — remplace le jeu de lignes de la période courante
// ─────────────────────────────────────────────────────────────────────────────
export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const societe_id: string = body.societe_id
    const periode: string = body.periode
    const lignesIn: any[] = Array.isArray(body.lignes) ? body.lignes : []

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (!isYM(periode)) return NextResponse.json({ error: 'periode (YYYY-MM) requise' }, { status: 400 })

    const { data: societe, error: socErr } = await supabase
      .from('societes')
      .select('client_id')
      .eq('id', societe_id)
      .single()
    if (socErr || !societe) return NextResponse.json({ error: 'Société introuvable' }, { status: 404 })

    const rows = lignesIn
      .filter(l => l && (l.libelle || '').trim().length > 0)
      .map(l => ({
        societe_id,
        client_id: societe.client_id ?? null,
        periode_courante: periode,
        periode_origine: isYM(l.periode_origine) ? l.periode_origine : null,
        libelle: String(l.libelle).slice(0, 300),
        montant: Math.round((Number(l.montant) || 0) * 100) / 100,
        sens: ['collectee', 'deductible', 'net'].includes(l.sens) ? l.sens : 'net',
        type: l.type === 'ecart_auto' ? 'ecart_auto' : 'manuel',
        facture_id: l.facture_id || null,
        motif: l.motif ? String(l.motif).slice(0, 500) : null,
        statut: ['proposee', 'incluse', 'ignoree'].includes(l.statut) ? l.statut : 'incluse',
        created_by: user.id,
        updated_at: new Date().toISOString(),
      }))

    // Remplace le jeu complet pour (société, période courante)
    const del = await supabase
      .from('tva_regularisations')
      .delete()
      .eq('societe_id', societe_id)
      .eq('periode_courante', periode)
    if (del.error) {
      return NextResponse.json({ error: `Échec suppression lignes existantes: ${del.error.message}` }, { status: 500 })
    }

    let inserted: any[] = []
    if (rows.length > 0) {
      const ins = await supabase
        .from('tva_regularisations')
        .insert(rows)
        .select('id, periode_origine, libelle, montant, sens, type, facture_id, motif, statut')
      if (ins.error) {
        return NextResponse.json({ error: `Échec enregistrement régularisations: ${ins.error.message}` }, { status: 500 })
      }
      inserted = ins.data || []
    }

    const totalInclus = inserted
      .filter(l => l.statut === 'incluse')
      .reduce((s, l) => s + (Number(l.montant) || 0), 0)

    return NextResponse.json({
      success: true,
      periode,
      nb: inserted.length,
      lignes: inserted,
      total_inclus: Math.round(totalInclus * 100) / 100,
    })
  } catch (e: any) {
    console.error('[tva/regularisations PUT]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}
