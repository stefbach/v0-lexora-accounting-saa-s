import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// ── Helpers période ──────────────────────────────────────────
function ym(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

// Date limite MRA : 20 du mois qui suit la fin de la période
function dateLimite(year: number, endMonth: number): string {
  const m = endMonth === 12 ? 1 : endMonth + 1
  const y = endMonth === 12 ? year + 1 : year
  return `${y}-${String(m).padStart(2, '0')}-20`
}

interface PeriodeAttendue {
  periode: string          // YYYY-MM (mois, ou mois de fin du trimestre)
  trimestre: string | null // YYYY-Qn pour le trimestriel
  label: string            // libellé lisible
  type: 'mensuel' | 'trimestriel'
  mois: string[]           // mois YYYY-MM couverts (1 ou 3)
  date_limite: string
}

// Génère la liste des périodes attendues entre deux mois inclus
function genererPeriodes(
  startY: number, startM: number,
  endY: number, endM: number,
  frequence: 'mensuelle' | 'trimestrielle',
): PeriodeAttendue[] {
  const out: PeriodeAttendue[] = []
  if (frequence === 'mensuelle') {
    let y = startY, m = startM
    while (y < endY || (y === endY && m <= endM)) {
      out.push({
        periode: ym(y, m),
        trimestre: null,
        label: ym(y, m),
        type: 'mensuel',
        mois: [ym(y, m)],
        date_limite: dateLimite(y, m),
      })
      m++; if (m > 12) { m = 1; y++ }
    }
  } else {
    // Trimestriel : on parcourt par trimestre calendaire
    // Q1=jan-mar, Q2=avr-juin, Q3=juil-sep, Q4=oct-déc
    let y = startY
    let q = Math.floor((startM - 1) / 3) + 1
    const endQ = Math.floor((endM - 1) / 3) + 1
    while (y < endY || (y === endY && q <= endQ)) {
      const endMonthQ = q * 3
      const mois = [endMonthQ - 2, endMonthQ - 1, endMonthQ].map(mm => ym(y, mm))
      out.push({
        periode: ym(y, endMonthQ),
        trimestre: `${y}-Q${q}`,
        label: `${y}-Q${q}`,
        type: 'trimestriel',
        mois,
        date_limite: dateLimite(y, endMonthQ),
      })
      q++; if (q > 4) { q = 1; y++ }
    }
  }
  return out
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const dateDebutParam = searchParams.get('date_debut') // YYYY-MM (optionnel)
    const dateFinParam = searchParams.get('date_fin')     // YYYY-MM (optionnel)

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    // ── Société : fréquence TVA, date de début, nom ──────────
    const { data: societe, error: socErr } = await supabase
      .from('societes')
      .select('id, nom, frequence_tva, tva_date_debut, assujetti_tva')
      .eq('id', societe_id)
      .single()
    if (socErr || !societe) {
      return NextResponse.json({ error: 'Société introuvable' }, { status: 404 })
    }

    const frequence: 'mensuelle' | 'trimestrielle' =
      societe.frequence_tva === 'trimestrielle' ? 'trimestrielle' : 'mensuelle'

    // ── Bornes de la timeline ────────────────────────────────
    const now = new Date()
    const fin = dateFinParam && /^\d{4}-\d{2}$/.test(dateFinParam)
      ? dateFinParam
      : ym(now.getFullYear(), now.getMonth() + 1)

    // Début : param > tva_date_debut société > 12 mois en arrière
    let debut: string
    if (dateDebutParam && /^\d{4}-\d{2}$/.test(dateDebutParam)) {
      debut = dateDebutParam
    } else if (societe.tva_date_debut) {
      debut = String(societe.tva_date_debut).slice(0, 7)
    } else {
      const d = new Date(now.getFullYear(), now.getMonth() - 11, 1)
      debut = ym(d.getFullYear(), d.getMonth() + 1)
    }

    const [startY, startM] = debut.split('-').map(Number)
    const [endY, endM] = fin.split('-').map(Number)
    if (startY > endY || (startY === endY && startM > endM)) {
      return NextResponse.json({ error: 'date_debut postérieure à date_fin' }, { status: 400 })
    }

    const periodes = genererPeriodes(startY, startM, endY, endM, frequence)

    // ── Enregistrements TVA existants sur la plage ───────────
    const { data: records } = await supabase
      .from('tva_mensuelle')
      .select('id, periode, trimestre, statut_declaration, tva_nette, montant_declare_mra, date_soumission, date_declaration, reference_mra, reference_declaration_mra, penalites_retard, interets_retard, is_rattrapage, source_saisie')
      .eq('societe_id', societe_id)
    const recByPeriode = new Map<string, any>()
    for (const r of records || []) {
      recByPeriode.set(r.periode, r)
      if (r.trimestre) recByPeriode.set(r.trimestre, r)
    }

    // ── Estimation rapide de la TVA nette par mois (écritures) ─
    // Pour les périodes SANS enregistrement persistant, on calcule
    // une estimation depuis les comptes de TVA afin d'afficher un
    // montant approximatif à régulariser. Source de vérité réelle =
    // le calcul complet via /api/comptable/tva/calculer.
    const dateDebutSql = `${debut}-01`
    const [fy, fm] = fin.split('-').map(Number)
    const lastDay = new Date(fy, fm, 0).getDate()
    const dateFinSql = `${fin}-${String(lastDay).padStart(2, '0')}`

    const { data: ecritures } = await supabase
      .from('ecritures_comptables_v2')
      .select('numero_compte, debit_mur, credit_mur, date_ecriture')
      .eq('societe_id', societe_id)
      .gte('date_ecriture', dateDebutSql)
      .lte('date_ecriture', dateFinSql)

    // Bucket par mois : { collectee, deductible }
    const parMois = new Map<string, { collectee: number; deductible: number }>()
    for (const e of ecritures || []) {
      const c: string = e.numero_compte || ''
      const mois = String(e.date_ecriture).slice(0, 7)
      const debit = e.debit_mur || 0
      const credit = e.credit_mur || 0
      let b = parMois.get(mois)
      if (!b) { b = { collectee: 0, deductible: 0 }; parMois.set(mois, b) }
      // TVA collectée (output) : 4457 + reverse charge output 44520/44521
      if (c.startsWith('4457') || c.startsWith('44520') || c.startsWith('44521')) {
        b.collectee += credit - debit
      }
      // TVA déductible (input) : 4456 + reverse charge input 44522/44523
      else if (c.startsWith('4456') || c.startsWith('44522') || c.startsWith('44523')) {
        b.deductible += debit - credit
      }
    }

    // ── Construire les lignes du suivi ───────────────────────
    const aujourdhui = now
    let totalARegulariser = 0
    let totalPenalites = 0
    let nbDeclarees = 0
    let nbNonDeclarees = 0
    let nbEnRetard = 0

    const lignes = periodes.map(p => {
      const rec = recByPeriode.get(p.trimestre || p.periode) || recByPeriode.get(p.periode)
      const declaree = !!rec && (rec.statut_declaration === 'declare' || rec.statut_declaration === 'paye')

      // Montant net : enregistré si présent, sinon estimation écritures
      let tvaNette: number
      let estimation = false
      if (rec && rec.tva_nette != null) {
        tvaNette = Number(rec.tva_nette) || 0
      } else {
        let collectee = 0, deductible = 0
        for (const m of p.mois) {
          const b = parMois.get(m)
          if (b) { collectee += b.collectee; deductible += b.deductible }
        }
        tvaNette = Math.round((collectee - deductible) * 100) / 100
        estimation = true
      }

      const limite = new Date(p.date_limite)
      const enRetard = !declaree && aujourdhui > limite

      if (declaree) {
        nbDeclarees++
      } else {
        nbNonDeclarees++
        if (tvaNette > 0) totalARegulariser += tvaNette
        if (enRetard) {
          nbEnRetard++
          // Pénalité MRA estimée : 5% one-shot + 0,5%/mois (VAT Act §24)
          if (tvaNette > 0) {
            const moisRetard = Math.max(
              1,
              Math.ceil((aujourdhui.getTime() - limite.getTime()) / (1000 * 60 * 60 * 24 * 30)),
            )
            totalPenalites += Math.round((tvaNette * 0.05 + tvaNette * 0.005 * moisRetard) * 100) / 100
          }
        }
      }

      return {
        periode: p.periode,
        trimestre: p.trimestre,
        label: p.label,
        type: p.type,
        record_id: rec?.id || null,
        statut_declaration: rec?.statut_declaration || 'a_faire',
        declaree,
        en_retard: enRetard,
        date_limite: p.date_limite,
        date_declaration: rec?.date_declaration || rec?.date_soumission || null,
        reference_mra: rec?.reference_declaration_mra || rec?.reference_mra || null,
        tva_nette: tvaNette,
        montant_declare_mra: rec?.montant_declare_mra ?? null,
        estimation,
        is_rattrapage: rec?.is_rattrapage || false,
        source_saisie: rec?.source_saisie || null,
      }
    })

    return NextResponse.json({
      societe: { id: societe.id, nom: societe.nom, frequence_tva: frequence, assujetti_tva: societe.assujetti_tva },
      plage: { debut, fin },
      lignes,
      synthese: {
        nb_periodes: periodes.length,
        nb_declarees: nbDeclarees,
        nb_non_declarees: nbNonDeclarees,
        nb_en_retard: nbEnRetard,
        total_a_regulariser: Math.round(totalARegulariser * 100) / 100,
        penalites_estimees: Math.round(totalPenalites * 100) / 100,
      },
    })
  } catch (e: any) {
    console.error('[tva/rattrapage]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}
