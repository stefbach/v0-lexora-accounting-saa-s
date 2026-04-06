import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()

    const { societe_id, periode } = await request.json()
    if (!societe_id || !periode) return NextResponse.json({ error: 'societe_id et periode requis' }, { status: 400 })

    // LOCK CHECK
    const { data: unlockedBuls } = await supabase.from('bulletins_paie')
      .select('id').eq('societe_id', societe_id)
      .gte('periode', `${periode}-01`).lte('periode', `${periode}-31`)
      .or('verrouille.is.null,verrouille.eq.false')
      .limit(1)
    if (unlockedBuls && unlockedBuls.length > 0) {
      return NextResponse.json({ error: 'Periode non verrouillee. Verrouillez la paie avant de declarer au MRA.' }, { status: 403 })
    }

    // Récupérer la société (inclut ern et tan_societe)
    const { data: societe } = await supabase.from('societes').select('*').eq('id', societe_id).single()

    // Fetch bulletins (no FK join — avoids schema cache issues)
    const { data: bulletins, error } = await supabase
      .from('bulletins_paie')
      .select('*')
      .eq('societe_id', societe_id)
      .gte('periode', `${periode}-01`)
      .lte('periode', `${periode}-31`)

    if (error) {
      console.error('[csg-mra] DB error bulletins:', error.message, error.details)
      return NextResponse.json({ error: `Erreur DB bulletins: ${error.message}`, debug_details: error.details }, { status: 500 })
    }
    if (!bulletins || bulletins.length === 0) return NextResponse.json({ error: `Aucun bulletin pour ${periode}. Importez ou calculez d'abord.` }, { status: 404 })

    // Fetch employee data separately
    const empIds = [...new Set(bulletins.map(b => b.employe_id).filter(Boolean))]
    const { data: employes } = empIds.length > 0
      ? await supabase.from('employes').select('*').in('id', empIds)
      : { data: [] }
    const empMap = new Map((employes || []).map((e: any) => [e.id, e]))

    // Calculs totaux
    let total_masse_salariale = 0, total_csg_sal = 0, total_csg_pat = 0
    let total_nsf_sal = 0, total_nsf_pat = 0, total_training = 0, total_prgf = 0

    // CSV Détail par employé
    const detailLines: string[] = [
      'Code;Nom;Prénom;NIC;Salaire_Brut;CSG_Sal;CSG_Pat;NSF_Sal;NSF_Pat;Training_Levy;PRGF'
    ]

    for (const b of bulletins) {
      const emp = empMap.get(b.employe_id)
      // Skip employees excluded from MRA (hors champs)
      if (emp?.exclure_mra) continue
      const sb = Number(b.salaire_brut) || 0
      const csg_sal = Number(b.csg_salarie) || 0
      const csg_bon = Number(b.csg_bonus) || 0
      const csg_pat = Number(b.csg_patronal) || 0
      const csg_pat_bon = Number(b.csg_patronal_bonus) || 0
      const nsf_sal = Number(b.nsf_salarie) || 0
      const nsf_pat = Number(b.nsf_patronal) || 0
      const training = Number(b.training_levy) || 0
      const prgf = Number(b.prgf) || 0

      total_masse_salariale += sb
      total_csg_sal += csg_sal + csg_bon
      total_csg_pat += csg_pat + csg_pat_bon
      total_nsf_sal += nsf_sal
      total_nsf_pat += nsf_pat
      total_training += training
      total_prgf += prgf

      detailLines.push([
        emp?.code || '',
        emp?.nom || '',
        emp?.prenom || '',
        emp?.nic_number || '',
        sb.toFixed(2),
        (csg_sal + csg_bon).toFixed(2),
        (csg_pat + csg_pat_bon).toFixed(2),
        nsf_sal.toFixed(2),
        nsf_pat.toFixed(2),
        training.toFixed(2),
        prgf.toFixed(2),
      ].join(';'))
    }

    const total_mra = total_csg_sal + total_csg_pat + total_nsf_sal + total_nsf_pat + total_training + total_prgf

    // ERN : fallback explicite avec BRN si ERN manquant
    const ern_csv = societe?.ern || `[ERN_MANQUANT_-_BRN:${societe?.brn || '?'}]`
    const ernComment = !societe?.ern ? ' # ATTENTION: ERN manquant — à renseigner dans la fiche société' : ''

    // CSV Récapitulatif
    const recapLines = [
      'ERN;Période;Nb_Employés;Masse_Salariale;CSG_Salarié;CSG_Patronal;NSF_Salarié;NSF_Patronal;Training_Levy;PRGF;Total_MRA',
      [
        ern_csv + ernComment,
        periode,
        bulletins.length,
        total_masse_salariale.toFixed(2),
        total_csg_sal.toFixed(2),
        total_csg_pat.toFixed(2),
        total_nsf_sal.toFixed(2),
        total_nsf_pat.toFixed(2),
        total_training.toFixed(2),
        total_prgf.toFixed(2),
        total_mra.toFixed(2),
      ].join(';')
    ]

    // Sauvegarder dans declarations_csg_mensuelle si la table existe
    try {
      await supabase.from('declarations_csg_mensuelle').upsert({
        societe_id, periode: `${periode}-01`,
        nb_employes: bulletins.length,
        masse_salariale: total_masse_salariale,
        csg_salarie: total_csg_sal,
        csg_patronal: total_csg_pat,
        nsf_salarie: total_nsf_sal,
        nsf_patronal: total_nsf_pat,
        training_levy: total_training,
        prgf: total_prgf,
        total_mra,
      }, { onConflict: 'societe_id,periode' })
    } catch (_) { /* Table peut ne pas exister */ }

    return NextResponse.json({
      recap_csv: recapLines.join('\n'),
      detail_csv: detailLines.join('\n'),
      totaux: { total_masse_salariale, total_csg_sal, total_csg_pat, total_nsf_sal, total_nsf_pat, total_training, total_prgf, total_mra },
      nb_employes: bulletins.length,
      societe: societe?.nom,
      periode,
      filename_recap: `CSG_NSF_Recap_${societe?.nom?.replace(/\s+/g, '_')}_${periode}.csv`,
      filename_detail: `CSG_NSF_Detail_${societe?.nom?.replace(/\s+/g, '_')}_${periode}.csv`,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur CSG'
    const stack = e instanceof Error ? e.stack?.split('\n').slice(0, 3).join(' | ') : ''
    console.error('[csg-mra] CRASH:', msg, stack)
    return NextResponse.json({ error: msg, debug_stack: stack }, { status: 500 })
  }
}
