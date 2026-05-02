import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const date_debut = searchParams.get('date_debut')
    const date_fin   = searchParams.get('date_fin')
    const exercice   = searchParams.get('exercice')

    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    // Résoudre les dates depuis l'exercice
    let dDebut = date_debut
    let dFin   = date_fin

    if (exercice && !dDebut && !dFin) {
      const { data: ex } = await supabase
        .from('exercices_fiscaux')
        .select('date_debut, date_fin')
        .eq('societe_id', societe_id)
        .eq('annee', exercice)
        .single()
      if (ex) { dDebut = ex.date_debut; dFin = ex.date_fin }
    }

    // Récupérer toutes les écritures — boucle pagination 1000 (cap PostgREST
    // par défaut). Sans cette boucle, une société avec >1000 lignes voit sa
    // balance silencieusement tronquée → débit ≠ crédit.
    const ecritures: any[] = []
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      let q = supabase
        .from('ecritures_comptables_v2')
        .select('numero_compte, debit_mur, credit_mur, nom_compte')
        .eq('societe_id', societe_id)
        .range(from, from + PAGE - 1)
        .order('id')
      if (dDebut) q = q.gte('date_ecriture', dDebut)
      if (dFin)   q = q.lte('date_ecriture', dFin)
      const { data: page, error } = await q
      if (error) throw error
      if (!page || page.length === 0) break
      ecritures.push(...page)
      if (page.length < PAGE) break
    }

    // Charger aussi la table V1 (legacy) avec dedup composite contre V2.
    // V1 et V2 ont souvent les MÊMES lignes (mig 120) avec des ids
    // différents — sans dedup composite, masse salariale + fournisseurs
    // sont DOUBLÉS dans la balance.
    {
      const { data: dossiers } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id)
      const dIds = (dossiers || []).map((d: any) => d.id)
      if (dIds.length > 0) {
        const fp = (numero_compte: string, date_ecriture: string, debit: number, credit: number, libelle: string) =>
          `${date_ecriture}|${numero_compte}|${debit}|${credit}|${(libelle || '').slice(0, 40)}`
        const seenV2 = new Set(ecritures.map(e =>
          fp(e.numero_compte, (e as any).date_ecriture || '', Number(e.debit_mur)||0, Number(e.credit_mur)||0, (e.nom_compte || ''))
        ))
        for (let from = 0; ; from += PAGE) {
          let q = supabase
            .from('ecritures_comptables')
            .select('compte, debit, credit, libelle, date_ecriture')
            .in('dossier_id', dIds)
            .range(from, from + PAGE - 1)
            .order('id')
          if (dDebut) q = q.gte('date_ecriture', dDebut)
          if (dFin)   q = q.lte('date_ecriture', dFin)
          const { data: page, error } = await q
          if (error) break
          if (!page || page.length === 0) break
          for (const e of page) {
            const numero = (e as any).compte
            const debit = Number((e as any).debit) || 0
            const credit = Number((e as any).credit) || 0
            const libelle = (e as any).libelle || null
            const k = fp(numero, (e as any).date_ecriture || '', debit, credit, libelle || '')
            if (seenV2.has(k)) continue   // Déjà compté en V2
            seenV2.add(k)
            ecritures.push({
              numero_compte: numero,
              debit_mur: debit,
              credit_mur: credit,
              nom_compte: libelle,
            })
          }
          if (page.length < PAGE) break
        }
      }
    }

    if (ecritures.length === 0) {
      return NextResponse.json({
        comptes: [], par_classe: {}, total_debit: 0, total_credit: 0,
        equilibre: true, message: 'Aucune écriture comptabilisée',
      })
    }

    // Plan comptable pour les libellés
    const compteNums = [...new Set(ecritures.map(e => e.numero_compte))]
    const { data: planComptable } = await supabase
      .from('plan_comptable')
      .select('compte, libelle, type_compte, sens_normal')
      .in('compte', compteNums)

    const planMap: Record<string, { libelle: string; type_compte: string; sens_normal: string }> = {}
    for (const pc of planComptable || []) {
      planMap[pc.compte] = { libelle: pc.libelle, type_compte: pc.type_compte, sens_normal: pc.sens_normal }
    }

    const classeLabels: Record<string, string> = {
      '1': 'Capitaux propres', '2': 'Immobilisations', '3': 'Stocks',
      '4': 'Tiers', '5': 'Finances', '6': 'Charges', '7': 'Produits',
    }

    // Agréger par compte
    const aggregat: Record<string, {
      numero_compte: string; libelle: string; type_compte: string
      sens_normal: string; classe: string; libelle_classe: string
      total_debit: number; total_credit: number; solde: number
      solde_debiteur: number; solde_crediteur: number
    }> = {}

    for (const e of ecritures) {
      const c = e.numero_compte
      if (!aggregat[c]) {
        const pc = planMap[c]
        const classe = c[0] || '?'
        // Priorité : plan_comptable (libellé canonique) > nom_compte (souvent pollué par
        // le libellé du parent, ex « Rémunérations du personnel » sur 6411/6412/6413/…)
        // > fallback « Compte <code> » pour éviter les libellés trompeurs.
        const libelleResolved = pc?.libelle
          || (e.nom_compte && e.nom_compte !== 'Rémunérations du personnel' ? e.nom_compte : null)
          || `Compte ${c}`
        aggregat[c] = {
          numero_compte: c,
          libelle: libelleResolved,
          type_compte: pc?.type_compte || (['6'].includes(classe) ? 'charge' : ['7'].includes(classe) ? 'produit' : 'bilan'),
          sens_normal: pc?.sens_normal || (['1','4','5','7'].includes(classe) ? 'C' : 'D'),
          classe,
          libelle_classe: classeLabels[classe] || 'Autres',
          total_debit: 0, total_credit: 0, solde: 0,
          solde_debiteur: 0, solde_crediteur: 0,
        }
      }
      aggregat[c].total_debit  += e.debit_mur  || 0
      aggregat[c].total_credit += e.credit_mur || 0
      aggregat[c].solde         = aggregat[c].total_debit - aggregat[c].total_credit
      aggregat[c].solde_debiteur  = Math.max(0,  aggregat[c].solde)
      aggregat[c].solde_crediteur = Math.max(0, -aggregat[c].solde)
    }

    const comptes = Object.values(aggregat).sort((a, b) => a.numero_compte.localeCompare(b.numero_compte))

    const total_debit  = comptes.reduce((s, c) => s + c.total_debit,  0)
    const total_credit = comptes.reduce((s, c) => s + c.total_credit, 0)
    const delta        = Math.abs(total_debit - total_credit)
    const equilibre    = delta < 0.01

    const par_classe: Record<string, typeof comptes> = {}
    for (const c of comptes) {
      if (!par_classe[c.classe]) par_classe[c.classe] = []
      par_classe[c.classe].push(c)
    }

    return NextResponse.json({
      comptes, par_classe, total_debit, total_credit,
      equilibre, delta_desequilibre: equilibre ? 0 : delta,
      nb_comptes: comptes.length,
      periode: { date_debut: dDebut, date_fin: dFin, exercice },
    })
  } catch (e: unknown) {
    console.error('[balance]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}
