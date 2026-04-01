import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

interface Anomalie {
  employe_id: string
  employe_nom: string
  type: string
  message: string
  severite: 'erreur' | 'avertissement'
}

// POST /api/rh/paie/validate
// Body: { societe_id, periode (YYYY-MM) }
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { societe_id, periode } = body

    if (!societe_id || !periode) {
      return NextResponse.json({ error: 'societe_id et periode (YYYY-MM) requis' }, { status: 400 })
    }

    const [annee, mois] = periode.split('-').map(Number)
    const nbJours = new Date(annee, mois, 0).getDate()
    const dateDebut = `${periode}-01`
    const dateFin = `${periode}-${String(nbJours).padStart(2, '0')}`

    // ── Fetch all active employees for the société ──────────────────────────
    const { data: employes, error: empErr } = await supabase
      .from('employes')
      .select('id, nom, prenom, poste, salaire_base, nic_number, bank_account, date_embauche, date_depart')
      .eq('societe_id', societe_id)
      .is('date_depart', null)
      .order('nom')

    if (empErr) throw empErr

    if (!employes || employes.length === 0) {
      return NextResponse.json({
        anomalies: [],
        nb_employes: 0,
        nb_anomalies: 0,
        statut: 'ok',
        message: 'Aucun employé actif trouvé',
      })
    }

    const empIds = employes.map(e => e.id)

    // ── Fetch pointages for the period ──────────────────────────────────────
    const { data: pointages } = await supabase
      .from('pointages')
      .select('employe_id, date_pointage, heure_entree, heure_sortie, heures_ot_1_5x, heures_ot_2x')
      .in('employe_id', empIds)
      .gte('date_pointage', dateDebut)
      .lte('date_pointage', dateFin)

    // ── Fetch unapproved leave requests overlapping the period ──────────────
    const { data: congesNonApprouves } = await supabase
      .from('demandes_conges')
      .select('employe_id, type_conge, date_debut, date_fin, statut')
      .in('employe_id', empIds)
      .in('statut', ['en_attente', 'soumis'])
      .lte('date_debut', dateFin)
      .gte('date_fin', dateDebut)

    // ── Fetch unapproved primes for the period ──────────────────────────────
    const { data: primesNonApprouvees } = await supabase
      .from('primes_variables_mois')
      .select('employe_id, montant, approuve')
      .in('employe_id', empIds)
      .eq('periode', dateDebut)
      .eq('approuve', false)

    // ── Run validation checks for each employee ─────────────────────────────
    const anomalies: Anomalie[] = []

    for (const emp of employes) {
      const nomComplet = `${emp.prenom || ''} ${emp.nom || ''}`.trim()

      // 1. salaire_base > 0
      if (!emp.salaire_base || Number(emp.salaire_base) <= 0) {
        anomalies.push({
          employe_id: emp.id,
          employe_nom: nomComplet,
          type: 'salaire_base',
          message: 'Salaire de base manquant ou égal à 0',
          severite: 'erreur',
        })
      }

      // 2. Pointage exists for the period (at least 1 record)
      const ptEmp = (pointages || []).filter(p => p.employe_id === emp.id)
      if (ptEmp.length === 0) {
        anomalies.push({
          employe_id: emp.id,
          employe_nom: nomComplet,
          type: 'pointage_manquant',
          message: `Aucun pointage trouvé pour la période ${periode}`,
          severite: 'erreur',
        })
      }

      // 3. No unapproved leave requests overlapping
      const congesEmp = (congesNonApprouves || []).filter(c => c.employe_id === emp.id)
      if (congesEmp.length > 0) {
        anomalies.push({
          employe_id: emp.id,
          employe_nom: nomComplet,
          type: 'conge_non_approuve',
          message: `${congesEmp.length} demande(s) de congé non approuvée(s) sur la période`,
          severite: 'avertissement',
        })
      }

      // 4. All mandatory fields filled (nom, prenom, nic_number, bank_account)
      const champsMissing: string[] = []
      if (!emp.nom) champsMissing.push('nom')
      if (!emp.prenom) champsMissing.push('prenom')
      if (!emp.nic_number) champsMissing.push('nic_number')
      if (!emp.bank_account) champsMissing.push('bank_account')
      if (champsMissing.length > 0) {
        anomalies.push({
          employe_id: emp.id,
          employe_nom: nomComplet,
          type: 'champs_obligatoires',
          message: `Champs obligatoires manquants: ${champsMissing.join(', ')}`,
          severite: 'erreur',
        })
      }

      // 5. OT hours reasonable (< 60h/month)
      const totalOT = ptEmp.reduce((sum, p) => {
        return sum + (Number(p.heures_ot_1_5x) || 0) + (Number(p.heures_ot_2x) || 0)
      }, 0)
      if (totalOT >= 60) {
        anomalies.push({
          employe_id: emp.id,
          employe_nom: nomComplet,
          type: 'heures_sup_excessives',
          message: `Heures supplémentaires excessives: ${Math.round(totalOT * 100) / 100}h (seuil: 60h)`,
          severite: 'avertissement',
        })
      }

      // 6. Primes approved
      const primesEmp = (primesNonApprouvees || []).filter(p => p.employe_id === emp.id)
      if (primesEmp.length > 0) {
        const totalNonApprouve = primesEmp.reduce((s, p) => s + (Number(p.montant) || 0), 0)
        anomalies.push({
          employe_id: emp.id,
          employe_nom: nomComplet,
          type: 'primes_non_approuvees',
          message: `${primesEmp.length} prime(s) non approuvée(s) pour un total de ${Math.round(totalNonApprouve * 100) / 100} Rs`,
          severite: 'avertissement',
        })
      }
    }

    const statut = anomalies.some(a => a.severite === 'erreur') ? 'erreurs' : anomalies.length > 0 ? 'avertissements' : 'ok'

    // ── Save validation result to payroll_validations table ─────────────────
    try {
      await supabase.from('payroll_validations').insert({
        societe_id,
        periode: dateDebut,
        nb_employes: employes.length,
        nb_anomalies: anomalies.length,
        anomalies,
        statut,
        valide_par: user.id,
        created_at: new Date().toISOString(),
      })
    } catch (_) {
      // Table may not exist yet — validation results still returned in response
    }

    return NextResponse.json({
      anomalies,
      nb_employes: employes.length,
      nb_anomalies: anomalies.length,
      statut,
      periode,
      societe_id,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
