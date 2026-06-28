import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
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
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const dateDebutParam = searchParams.get('date_debut') // YYYY-MM (optionnel)
    const dateFinParam = searchParams.get('date_fin')     // YYYY-MM (optionnel)
    const tout = searchParams.get('tout') === '1'         // toute la période (auto-détection)

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    // ── Société : fréquence TVA, nom ─────────────────────────
    const { data: societe, error: socErr } = await supabase
      .from('societes')
      .select('id, nom, frequence_tva, assujetti_tva')
      .eq('id', societe_id)
      .single()
    if (socErr || !societe) {
      return apiError('company_not_found', 404)
    }

    const frequence: 'mensuelle' | 'trimestrielle' =
      societe.frequence_tva === 'trimestrielle' ? 'trimestrielle' : 'mensuelle'

    const now = new Date()
    const fin = dateFinParam && /^\d{4}-\d{2}$/.test(dateFinParam)
      ? dateFinParam
      : ym(now.getFullYear(), now.getMonth() + 1)

    // ── Début de la timeline ─────────────────────────────────
    // Priorité : param explicite > (si "tout" ou pas de param) auto-détection
    // de la 1re donnée en base (facture la plus ancienne, sinon écriture) >
    // fallback 12 mois en arrière.
    let debut: string
    if (!tout && dateDebutParam && /^\d{4}-\d{2}$/.test(dateDebutParam)) {
      debut = dateDebutParam
    } else {
      // Auto-détection de la plus ancienne donnée
      const [{ data: f1 }, { data: e1 }] = await Promise.all([
        supabase.from('factures')
          .select('date_facture')
          .eq('societe_id', societe_id)
          .order('date_facture', { ascending: true })
          .limit(1),
        supabase.from('ecritures_comptables_v2')
          .select('date_ecriture')
          .eq('societe_id', societe_id)
          .order('date_ecriture', { ascending: true })
          .limit(1),
      ])
      const candidates: string[] = []
      if (f1?.[0]?.date_facture) candidates.push(String(f1[0].date_facture).slice(0, 7))
      if (e1?.[0]?.date_ecriture) candidates.push(String(e1[0].date_ecriture).slice(0, 7))
      if (candidates.length > 0) {
        debut = candidates.sort()[0]
      } else {
        const d = new Date(now.getFullYear(), now.getMonth() - 11, 1)
        debut = ym(d.getFullYear(), d.getMonth() + 1)
      }
    }

    const [startY, startM] = debut.split('-').map(Number)
    const [endY, endM] = fin.split('-').map(Number)
    if (startY > endY || (startY === endY && startM > endM)) {
      return NextResponse.json({ error: 'date_debut postérieure à date_fin' }, { status: 400 })
    }

    const periodes = genererPeriodes(startY, startM, endY, endM, frequence)

    const dateDebutSql = `${debut}-01`
    const [fy, fm] = fin.split('-').map(Number)
    const lastDay = new Date(fy, fm, 0).getDate()
    const dateFinSql = `${fin}-${String(lastDay).padStart(2, '0')}`

    // ── Enregistrements TVA persistés (source de vérité) ─────
    // Sélection résiliente : on tente avec les colonnes de la migration 446,
    // et on retombe sur les colonnes de base si elle n'est pas encore appliquée.
    const baseCols = 'id, periode, trimestre, statut_declaration, tva_collectee, tva_deductible, tva_nette, date_soumission, date_declaration, reference_mra, reference_declaration_mra, penalites_retard, interets_retard'
    let records: any[] | null = null
    let migration446 = true
    {
      const r = await supabase
        .from('tva_mensuelle')
        .select(`${baseCols}, montant_declare_mra, is_rattrapage, source_saisie`)
        .eq('societe_id', societe_id)
      if (r.error) {
        migration446 = false
        const r2 = await supabase
          .from('tva_mensuelle')
          .select(baseCols)
          .eq('societe_id', societe_id)
        records = r2.data || []
      } else {
        records = r.data || []
      }
    }
    const recByPeriode = new Map<string, any>()
    for (const r of records || []) {
      recByPeriode.set(r.periode, r)
      if (r.trimestre) recByPeriode.set(r.trimestre, r)
    }

    // ── Estimation par mois depuis les FACTURES (source réelle de la page) ─
    // La page /client/tva calcule la TVA depuis `factures`. On reproduit cette
    // logique pour estimer, mois par mois, la TVA nette des périodes non encore
    // déclarées/calculées.
    const { data: factures } = await supabase
      .from('factures')
      .select('type_facture, montant_tva, date_facture, devise, client_offshore, statut')
      .eq('societe_id', societe_id)
      .gte('date_facture', dateDebutSql)
      .lte('date_facture', dateFinSql)
      .neq('statut', 'brouillon')

    const parMoisFactures = new Map<string, { collectee: number; deductible: number; nb: number }>()
    for (const f of factures || []) {
      const mois = String(f.date_facture).slice(0, 7)
      let b = parMoisFactures.get(mois)
      if (!b) { b = { collectee: 0, deductible: 0, nb: 0 }; parMoisFactures.set(mois, b) }
      const tva = Number(f.montant_tva) || 0
      const isForeign = f.devise && f.devise !== 'MUR'
      if (f.type_facture === 'client') {
        // TVA collectée : ventes locales taxables (pas offshore, MUR)
        if (!f.client_offshore && !isForeign) b.collectee += tva
      } else if (f.type_facture === 'fournisseur') {
        // TVA déductible : fournisseurs locaux (MUR)
        if (!isForeign) b.deductible += tva
      }
      b.nb++
    }

    // ── Estimation de secours depuis les ÉCRITURES (clients en compta directe) ─
    const { data: ecritures } = await supabase
      .from('ecritures_comptables_v2')
      .select('numero_compte, debit_mur, credit_mur, date_ecriture')
      .eq('societe_id', societe_id)
      .gte('date_ecriture', dateDebutSql)
      .lte('date_ecriture', dateFinSql)

    const parMoisEcr = new Map<string, { collectee: number; deductible: number }>()
    for (const e of ecritures || []) {
      const c: string = e.numero_compte || ''
      const mois = String(e.date_ecriture).slice(0, 7)
      const debit = e.debit_mur || 0
      const credit = e.credit_mur || 0
      let b = parMoisEcr.get(mois)
      if (!b) { b = { collectee: 0, deductible: 0 }; parMoisEcr.set(mois, b) }
      if (c.startsWith('4457') || c.startsWith('44520') || c.startsWith('44521')) {
        b.collectee += credit - debit
      } else if (c.startsWith('4456') || c.startsWith('44522') || c.startsWith('44523')) {
        b.deductible += debit - credit
      }
    }

    // Net estimé pour un ensemble de mois : factures en priorité, sinon écritures
    function netteEstimee(mois: string[]): { net: number; nbFactures: number; source: 'factures' | 'ecritures' | 'aucune' } {
      let coll = 0, ded = 0, nbF = 0
      for (const m of mois) { const b = parMoisFactures.get(m); if (b) { coll += b.collectee; ded += b.deductible; nbF += b.nb } }
      if (nbF > 0) return { net: Math.round((coll - ded) * 100) / 100, nbFactures: nbF, source: 'factures' }
      let cE = 0, dE = 0, hasE = false
      for (const m of mois) { const b = parMoisEcr.get(m); if (b) { cE += b.collectee; dE += b.deductible; hasE = true } }
      if (hasE && (cE !== 0 || dE !== 0)) return { net: Math.round((cE - dE) * 100) / 100, nbFactures: 0, source: 'ecritures' }
      return { net: 0, nbFactures: 0, source: 'aucune' }
    }

    // ── Construire les lignes du suivi ───────────────────────
    const aujourdhui = now
    let totalARegulariser = 0
    let totalPenalites = 0
    let nbDeclarees = 0
    let nbNonDeclarees = 0
    let nbEnRetard = 0
    let nbAvecDonnees = 0

    const lignes = periodes.map(p => {
      const rec = recByPeriode.get(p.trimestre || p.periode) || recByPeriode.get(p.periode)
      const declaree = !!rec && (rec.statut_declaration === 'declare' || rec.statut_declaration === 'paye')

      let tvaNette: number
      let estimation = false
      let sourceData: string
      let nbFactures = 0
      if (rec && rec.tva_nette != null && rec.statut_declaration !== 'a_faire') {
        tvaNette = Number(rec.tva_nette) || 0
        sourceData = 'calcul'
      } else if (rec && rec.tva_nette != null) {
        // calculé mais pas encore déclaré
        tvaNette = Number(rec.tva_nette) || 0
        sourceData = 'calcul'
      } else {
        const est = netteEstimee(p.mois)
        tvaNette = est.net
        nbFactures = est.nbFactures
        sourceData = est.source
        estimation = true
      }
      if (sourceData !== 'aucune' || (rec && rec.tva_nette != null)) nbAvecDonnees++

      const limite = new Date(p.date_limite)
      const enRetard = !declaree && aujourdhui > limite

      if (declaree) {
        nbDeclarees++
      } else {
        nbNonDeclarees++
        if (tvaNette > 0) totalARegulariser += tvaNette
        if (enRetard && tvaNette > 0) {
          nbEnRetard++
          const moisRetard = Math.max(
            1,
            Math.ceil((aujourdhui.getTime() - limite.getTime()) / (1000 * 60 * 60 * 24 * 30)),
          )
          totalPenalites += Math.round((tvaNette * 0.05 + tvaNette * 0.005 * moisRetard) * 100) / 100
        } else if (enRetard) {
          nbEnRetard++
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
        nb_factures: nbFactures,
        montant_declare_mra: rec?.montant_declare_mra ?? null,
        estimation,
        source_data: sourceData,
        is_rattrapage: rec?.is_rattrapage || false,
        source_saisie: rec?.source_saisie || null,
      }
    })

    return NextResponse.json({
      societe: { id: societe.id, nom: societe.nom, frequence_tva: frequence, assujetti_tva: societe.assujetti_tva },
      plage: { debut, fin },
      migration_446: migration446,
      lignes,
      synthese: {
        nb_periodes: periodes.length,
        nb_declarees: nbDeclarees,
        nb_non_declarees: nbNonDeclarees,
        nb_en_retard: nbEnRetard,
        nb_avec_donnees: nbAvecDonnees,
        total_a_regulariser: Math.round(totalARegulariser * 100) / 100,
        penalites_estimees: Math.round(totalPenalites * 100) / 100,
      },
    })
  } catch (e: any) {
    console.error('[tva/rattrapage]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}
