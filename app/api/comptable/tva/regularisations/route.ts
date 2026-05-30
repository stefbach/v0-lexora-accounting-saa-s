import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  isYM, round2, moisBornes,
  tvaFacture, normalizeLigne, totalInclus,
} from '@/lib/accounting/tva-regularisation'

export const dynamic = 'force-dynamic'

// =============================================================================
// Régularisations TVA période antérieure (mode éditable)
//
// GET  : détecte les écarts sur les périodes DÉJÀ déclarées et figées (mig 451)
//        — écart = TVA recalculée (tva_nette_recalculee, vrai recalcul depuis
//        les écritures via /calculer ; sinon estimation factures) − montant
//        déclaré MRA — avec le détail des factures ajoutées après le gel ;
//        renvoie aussi les lignes déjà enregistrées pour la période courante.
// PUT  : remplace le jeu de lignes (auto retenues + manuelles) de la période
//        courante de façon ATOMIQUE (RPC replace_tva_regularisations, mig 452)
//        et recâble le total sur tva_mensuelle.regularisation_anterieure.
//
// La compta reste à la vraie date, aucune écriture n'est créée.
// =============================================================================

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
      .select('id, nom, client_id')
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
    const periodesFigees = figees.map(f => f.periode).filter(isYM).sort()

    // ── Factures de ces périodes (1 requête) pour le détail + estimation ─────
    const parMois = new Map<string, any[]>()
    if (periodesFigees.length > 0) {
      const borneMin = moisBornes(periodesFigees[0]).debut
      const borneMax = moisBornes(periodesFigees[periodesFigees.length - 1]).fin
      const { data: factures } = await supabase
        .from('factures')
        .select('id, numero_facture, tiers, type_facture, montant_tva, date_facture, devise, client_offshore, statut, created_at')
        .eq('societe_id', societe_id)
        .gte('date_facture', borneMin)
        .lte('date_facture', borneMax)
        .neq('statut', 'brouillon')
      for (const f of factures || []) {
        const mois = String(f.date_facture).slice(0, 7)
        if (!parMois.has(mois)) parMois.set(mois, [])
        parMois.get(mois)!.push(f)
      }
    }

    const detectees: any[] = []
    for (const fig of figees) {
      const fs = parMois.get(fig.periode) || []

      // Écart : priorité au VRAI recalcul (tva_nette_recalculee, depuis les
      // écritures via /calculer) ; sinon estimation depuis les factures.
      const declare = Number(fig.montant_declare_mra ?? fig.tva_nette ?? 0)
      let recalc: number
      let source: 'recalcul' | 'estimation'
      if (fig.tva_nette_recalculee != null) {
        recalc = Number(fig.tva_nette_recalculee)
        source = 'recalcul'
      } else {
        let collectee = 0, deductible = 0
        for (const f of fs) {
          const t = tvaFacture(f)
          collectee += t.collectee; deductible += t.deductible
        }
        recalc = round2(collectee - deductible)
        source = 'estimation'
      }
      const ecart = round2(recalc - declare)
      if (Math.abs(ecart) < 0.01) continue

      // Factures ajoutées APRÈS le gel = à l'origine de l'écart
      const declareAt = fig.declare_at ? new Date(fig.declare_at).getTime() : 0
      const facturesOubliees = fs
        .filter(f => !declareAt || (f.created_at && new Date(f.created_at).getTime() > declareAt))
        .map(f => ({
          id: f.id, numero: f.numero_facture, tiers: f.tiers,
          type: f.type_facture, montant_tva: Number(f.montant_tva) || 0,
          date_facture: f.date_facture,
        }))

      detectees.push({
        periode_origine: fig.periode,
        tva_recalculee: recalc,
        montant_declare_mra: declare,
        ecart,
        source,
        libelle: `Régularisation TVA ${fig.periode} (écart déclaration MRA)`,
        factures_oubliees: facturesOubliees,
      })
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

    return NextResponse.json({
      societe: { id: societe.id, nom: societe.nom },
      periode,
      migration_452,
      nb_periodes_figees: figees.length,
      periodes_figees: periodesFigees,
      detectees,
      lignes,
      total_inclus: totalInclus(lignes),
    })
  } catch (e: any) {
    console.error('[tva/regularisations GET]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT — remplace le jeu de lignes de la période courante (atomique)
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

    // Normalisation/validation côté serveur (logique pure testée)
    const lignes = lignesIn
      .map(normalizeLigne)
      .filter((l): l is NonNullable<typeof l> => l !== null)

    // ── Voie nominale : RPC atomique (delete + insert + recâblage total) ─────
    const rpc = await supabase.rpc('replace_tva_regularisations', {
      p_societe: societe_id,
      p_client: societe.client_id ?? null,
      p_periode: periode,
      p_user: user.id,
      p_lignes: lignes,
    })

    if (!rpc.error) {
      return NextResponse.json({
        success: true, periode, atomic: true,
        nb: lignes.length,
        total_inclus: round2(Number(rpc.data) || 0),
      })
    }

    // ── Repli (migration 452 pas encore appliquée) : delete + insert ─────────
    const del = await supabase
      .from('tva_regularisations')
      .delete()
      .eq('societe_id', societe_id)
      .eq('periode_courante', periode)
    if (del.error) {
      return NextResponse.json({ error: `Échec suppression lignes existantes: ${del.error.message}` }, { status: 500 })
    }
    let inserted: any[] = []
    if (lignes.length > 0) {
      const ins = await supabase
        .from('tva_regularisations')
        .insert(lignes.map(l => ({
          societe_id, client_id: societe.client_id ?? null,
          periode_courante: periode, ...l, created_by: user.id,
        })))
        .select('id, montant, statut')
      if (ins.error) {
        return NextResponse.json({ error: `Échec enregistrement régularisations: ${ins.error.message}` }, { status: 500 })
      }
      inserted = ins.data || []
    }
    return NextResponse.json({
      success: true, periode, atomic: false,
      nb: inserted.length,
      total_inclus: totalInclus(inserted),
    })
  } catch (e: any) {
    console.error('[tva/regularisations PUT]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}
