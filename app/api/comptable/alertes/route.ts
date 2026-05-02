import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface Alerte {
  id: string
  type: 'fiscal' | 'comptable' | 'social'
  severity: 'critical' | 'warning' | 'info'
  client_name: string
  societe_name: string
  societe_id: string
  title: string
  message: string
  deadline: string | null
  created_at: string
}

// ── GET: Generate and return alerts for a comptable's clients ────────────────
export async function GET() {
  try {
    // Auth check
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const supabase = getAdminClient()

    // Check comptable role
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, full_name')
      .eq('id', user.id)
      .single()

    if (!profile || !['comptable', 'comptable_dedie', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Acces reserve aux comptables' }, { status: 403 })
    }

    // Get all societes assigned to this comptable (via dossiers or direct)
    const { data: dossiers } = await supabase
      .from('dossiers')
      .select('societe_id, client_id, societe:societes(id, nom, statut_tva, client_id, date_cloture_exercice)')
      .eq('comptable_id', user.id)

    const { data: directSocietes } = await supabase
      .from('societes')
      .select('id, nom, statut_tva, client_id, date_cloture_exercice, comptable_id')
      .eq('comptable_id', user.id)

    // Build unique societes map
    const societesMap = new Map<string, any>()
    for (const d of dossiers || []) {
      if (d.societe) {
        const s = d.societe as any
        societesMap.set(s.id, { ...s, client_id: d.client_id || s.client_id })
      }
    }
    for (const s of directSocietes || []) {
      if (!societesMap.has(s.id)) {
        societesMap.set(s.id, s)
      }
    }

    // If admin, also get all societes
    if (profile.role === 'admin' && societesMap.size === 0) {
      const { data: allSocietes } = await supabase
        .from('societes')
        .select('id, nom, statut_tva, client_id, date_cloture_exercice')
      for (const s of allSocietes || []) {
        societesMap.set(s.id, s)
      }
    }

    const societes = Array.from(societesMap.values())
    if (societes.length === 0) {
      return NextResponse.json({ alertes: [], counts: { critical: 0, warning: 0, info: 0 } })
    }

    const societeIds = societes.map((s: any) => s.id)

    // Fetch client names
    const clientIds = [...new Set(societes.map((s: any) => s.client_id).filter(Boolean))]
    const clientMap = new Map<string, string>()
    if (clientIds.length > 0) {
      const { data: clients } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', clientIds)
      for (const c of clients || []) {
        clientMap.set(c.id, c.full_name || 'Client')
      }
    }

    const now = new Date()
    const alertes: Alerte[] = []
    let alertIdCounter = 0
    const nextId = () => `alert-${++alertIdCounter}`

    // ══════════════════════════════════════════════════════════════════════════
    // A) FISCAL DEADLINES (MRA Mauritius)
    // ══════════════════════════════════════════════════════════════════════════

    for (const societe of societes) {
      const clientName = clientMap.get(societe.client_id) || 'Client'
      const societeName = societe.nom || 'Societe'

      // ── A1: TVA — due 20th of following month ─────────────────────────────
      if (societe.statut_tva) {
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const periode = prevMonth.toISOString().slice(0, 7)
        const deadline = new Date(now.getFullYear(), now.getMonth(), 20)
        const dayOfMonth = now.getDate()

        const { data: tvaDec } = await supabase
          .from('tva_mensuelle')
          .select('id, statut_declaration')
          .eq('societe_id', societe.id)
          .eq('periode', periode)
          .maybeSingle()

        const tvaNotDone = !tvaDec || tvaDec.statut_declaration === 'a_faire'

        if (tvaNotDone && now > deadline) {
          const joursRetard = Math.ceil((now.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24))
          alertes.push({
            id: nextId(), type: 'fiscal', severity: 'critical',
            client_name: clientName, societe_name: societeName, societe_id: societe.id,
            title: `TVA ${periode} non declaree`,
            message: `La declaration TVA de ${societeName} pour ${periode} est en retard de ${joursRetard} jour(s). Penalite MRA applicable: 5% + 1%/mois.`,
            deadline: deadline.toISOString().slice(0, 10),
            created_at: now.toISOString(),
          })
        } else if (tvaNotDone && dayOfMonth >= 15 && dayOfMonth <= 20) {
          alertes.push({
            id: nextId(), type: 'fiscal', severity: 'warning',
            client_name: clientName, societe_name: societeName, societe_id: societe.id,
            title: `TVA ${periode} a declarer avant le 20`,
            message: `Date limite TVA pour ${societeName}: le ${deadline.toISOString().slice(0, 10)}. Declaration non soumise.`,
            deadline: deadline.toISOString().slice(0, 10),
            created_at: now.toISOString(),
          })
        }
      }

      // ── A2: CSG/NSF — due 15th of following month ─────────────────────────
      {
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const periodeCSG = prevMonth.toISOString().slice(0, 7)
        const deadlineCSG = new Date(now.getFullYear(), now.getMonth(), 15)

        const { data: csgDec } = await supabase
          .from('declarations_annuelles')
          .select('id')
          .eq('societe_id', societe.id)
          .gte('created_at', new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString())
          .lte('created_at', new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString())
          .maybeSingle()

        if (!csgDec && now > deadlineCSG) {
          alertes.push({
            id: nextId(), type: 'fiscal', severity: 'critical',
            client_name: clientName, societe_name: societeName, societe_id: societe.id,
            title: `CSG/NSF ${periodeCSG} en retard`,
            message: `Declarations CSG/NSF de ${societeName} non soumises. Echeance depassee le ${deadlineCSG.toISOString().slice(0, 10)}.`,
            deadline: deadlineCSG.toISOString().slice(0, 10),
            created_at: now.toISOString(),
          })
        } else if (!csgDec && now.getDate() >= 10 && now <= deadlineCSG) {
          alertes.push({
            id: nextId(), type: 'fiscal', severity: 'warning',
            client_name: clientName, societe_name: societeName, societe_id: societe.id,
            title: `CSG/NSF ${periodeCSG} a declarer`,
            message: `Echeance CSG/NSF pour ${societeName}: le ${deadlineCSG.toISOString().slice(0, 10)}.`,
            deadline: deadlineCSG.toISOString().slice(0, 10),
            created_at: now.toISOString(),
          })
        }
      }

      // ── A3: PAYE — due 20th of following month ────────────────────────────
      {
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const periodePAYE = prevMonth.toISOString().slice(0, 7)
        const deadlinePAYE = new Date(now.getFullYear(), now.getMonth(), 20)

        const { data: bulletins } = await supabase
          .from('bulletins_paie')
          .select('id')
          .eq('societe_id', societe.id)
          .eq('periode', periodePAYE)
          .limit(1)

        const { data: employes } = await supabase
          .from('employes')
          .select('id')
          .eq('societe_id', societe.id)
          .eq('actif', true)
          .limit(1)

        const hasEmployees = employes && employes.length > 0
        const payeNotDone = hasEmployees && (!bulletins || bulletins.length === 0)

        if (payeNotDone && now > deadlinePAYE) {
          alertes.push({
            id: nextId(), type: 'fiscal', severity: 'critical',
            client_name: clientName, societe_name: societeName, societe_id: societe.id,
            title: `PAYE ${periodePAYE} en retard`,
            message: `Declarations PAYE de ${societeName} non soumises. Penalite MRA applicable.`,
            deadline: deadlinePAYE.toISOString().slice(0, 10),
            created_at: now.toISOString(),
          })
        } else if (payeNotDone && now.getDate() >= 15) {
          alertes.push({
            id: nextId(), type: 'fiscal', severity: 'warning',
            client_name: clientName, societe_name: societeName, societe_id: societe.id,
            title: `PAYE ${periodePAYE} a preparer`,
            message: `Echeance PAYE pour ${societeName}: le ${deadlinePAYE.toISOString().slice(0, 10)}.`,
            deadline: deadlinePAYE.toISOString().slice(0, 10),
            created_at: now.toISOString(),
          })
        }
      }

      // ── A4: IT Form 3 — due 6 months after year-end ──────────────────────
      if (societe.date_cloture_exercice) {
        const yearEnd = new Date(societe.date_cloture_exercice)
        const itDeadline = new Date(yearEnd)
        itDeadline.setMonth(itDeadline.getMonth() + 6)

        const daysUntilIT = Math.ceil((itDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

        if (daysUntilIT < 0) {
          alertes.push({
            id: nextId(), type: 'fiscal', severity: 'critical',
            client_name: clientName, societe_name: societeName, societe_id: societe.id,
            title: `IT Form 3 en retard`,
            message: `Annual Return of Income de ${societeName} est en retard de ${Math.abs(daysUntilIT)} jour(s). Echeance: ${itDeadline.toISOString().slice(0, 10)}.`,
            deadline: itDeadline.toISOString().slice(0, 10),
            created_at: now.toISOString(),
          })
        } else if (daysUntilIT <= 30) {
          alertes.push({
            id: nextId(), type: 'fiscal', severity: 'warning',
            client_name: clientName, societe_name: societeName, societe_id: societe.id,
            title: `IT Form 3 dans ${daysUntilIT} jour(s)`,
            message: `Echeance IT Form 3 pour ${societeName}: ${itDeadline.toISOString().slice(0, 10)}.`,
            deadline: itDeadline.toISOString().slice(0, 10),
            created_at: now.toISOString(),
          })
        }
      }

      // ── A5: APS (Advance Payment System) — quarterly ─────────────────────
      {
        const month = now.getMonth() // 0-indexed
        // APS quarters: Aug (month 7), Nov (month 10), Feb (month 1)
        const apsMonths = [7, 10, 1]
        const isApsMonth = apsMonths.includes(month)
        const isPreApsMonth = apsMonths.includes(month + 1 > 11 ? 0 : month + 1)

        if (isApsMonth) {
          alertes.push({
            id: nextId(), type: 'fiscal', severity: 'warning',
            client_name: clientName, societe_name: societeName, societe_id: societe.id,
            title: `APS trimestriel a payer`,
            message: `Acompte IS trimestriel pour ${societeName} est du ce mois (si CA > 10M MUR).`,
            deadline: new Date(now.getFullYear(), month, 28).toISOString().slice(0, 10),
            created_at: now.toISOString(),
          })
        } else if (isPreApsMonth) {
          alertes.push({
            id: nextId(), type: 'fiscal', severity: 'info',
            client_name: clientName, societe_name: societeName, societe_id: societe.id,
            title: `APS trimestriel mois prochain`,
            message: `Preparer l'acompte IS trimestriel pour ${societeName} (si CA > 10M MUR).`,
            deadline: null,
            created_at: now.toISOString(),
          })
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // B) ACCOUNTING ANOMALIES
    // ══════════════════════════════════════════════════════════════════════════

    // ── B1: Bank not reconciled ─────────────────────────────────────────────
    {
      const { data: releves } = await supabase
        .from('releves_bancaires')
        .select('id, societe_id, periode, date_fin')
        .in('societe_id', societeIds)
        .order('date_fin', { ascending: false })

      // Check for rapprochements
      const { data: rapprochements } = await supabase
        .from('rapprochements_bancaires')
        .select('id, societe_id, statut')
        .in('societe_id', societeIds)

      const reconciled = new Set(
        (rapprochements || [])
          .filter((r: any) => r.statut === 'equilibre')
          .map((r: any) => r.societe_id)
      )

      const unreconciledBySociete = new Map<string, number>()
      for (const r of releves || []) {
        if (!reconciled.has(r.societe_id)) {
          unreconciledBySociete.set(r.societe_id, (unreconciledBySociete.get(r.societe_id) || 0) + 1)
        }
      }

      for (const [sId, count] of unreconciledBySociete) {
        const societe = societesMap.get(sId)
        if (!societe) continue
        alertes.push({
          id: nextId(), type: 'comptable', severity: 'warning',
          client_name: clientMap.get(societe.client_id) || 'Client',
          societe_name: societe.nom, societe_id: sId,
          title: `Rapprochement bancaire incomplet`,
          message: `${count} releve(s) de ${societe.nom} non rapproche(s). Risque d'ecart en comptabilite.`,
          deadline: null,
          created_at: now.toISOString(),
        })
      }

      // ── B1b: Ecart detected in rapprochement ─────────────────────────────
      const ecarts = (rapprochements || []).filter((r: any) => r.statut === 'ecart')
      for (const r of ecarts) {
        const societe = societesMap.get(r.societe_id)
        if (!societe) continue
        alertes.push({
          id: nextId(), type: 'comptable', severity: 'critical',
          client_name: clientMap.get(societe.client_id) || 'Client',
          societe_name: societe.nom, societe_id: r.societe_id,
          title: `Ecart de rapprochement bancaire`,
          message: `Un ecart a ete detecte dans le rapprochement bancaire de ${societe.nom}. Verifier les transactions.`,
          deadline: null,
          created_at: now.toISOString(),
        })
      }
    }

    // ── B2: Unlettered entries > 30 days old ────────────────────────────────
    {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

      // Get dossier IDs for our societes
      const { data: comptaDossiers } = await supabase
        .from('dossiers')
        .select('id, societe_id')
        .in('societe_id', societeIds)

      if (comptaDossiers && comptaDossiers.length > 0) {
        // ⚠️ V2 ONLY (mig 230). V1 ecritures_comptables est une vue sur V2 — on lit V2 directement.
        // V2 a societe_id directement → on filtre par societe_id (évite la duplication LEFT JOIN dossiers).
        const { data: unlettered } = await supabase
          .from('ecritures_comptables_v2')
          .select('id, societe_id, date_ecriture, lettrage')
          .in('societe_id', societeIds)
          .lt('date_ecriture', thirtyDaysAgo)
          .is('lettrage', null)

        // Group by societe
        const unletteredBySociete = new Map<string, number>()
        for (const e of unlettered || []) {
          const sId = e.societe_id
          if (sId) unletteredBySociete.set(sId, (unletteredBySociete.get(sId) || 0) + 1)
        }

        for (const [sId, count] of unletteredBySociete) {
          if (count < 5) continue // Only alert if significant
          const societe = societesMap.get(sId)
          if (!societe) continue
          alertes.push({
            id: nextId(), type: 'comptable', severity: 'warning',
            client_name: clientMap.get(societe.client_id) || 'Client',
            societe_name: societe.nom, societe_id: sId,
            title: `${count} ecritures non lettrees > 30 jours`,
            message: `${societe.nom} a ${count} ecritures comptables non lettrees datant de plus de 30 jours. Lettrage recommande.`,
            deadline: null,
            created_at: now.toISOString(),
          })
        }
      }
    }

    // ── B3: Missing documents (pending > 48h) ──────────────────────────────
    {
      const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()

      const { data: pendingDocs } = await supabase
        .from('documents')
        .select('id, nom_fichier, societe_id, created_at')
        .in('societe_id', societeIds)
        .eq('statut', 'en_attente')
        .lt('created_at', twoDaysAgo)

      // Group by societe
      const pendingBySociete = new Map<string, number>()
      for (const d of pendingDocs || []) {
        if (d.societe_id) pendingBySociete.set(d.societe_id, (pendingBySociete.get(d.societe_id) || 0) + 1)
      }

      for (const [sId, count] of pendingBySociete) {
        const societe = societesMap.get(sId)
        if (!societe) continue
        alertes.push({
          id: nextId(), type: 'comptable', severity: 'warning',
          client_name: clientMap.get(societe.client_id) || 'Client',
          societe_name: societe.nom, societe_id: sId,
          title: `${count} document(s) en attente > 48h`,
          message: `${count} document(s) uploade(s) pour ${societe.nom} en attente de traitement depuis plus de 48 heures.`,
          deadline: null,
          created_at: now.toISOString(),
        })
      }
    }

    // ── B4: Balance desequilibree (debit != credit) ─────────────────────────
    {
      const { data: comptaDossiers } = await supabase
        .from('dossiers')
        .select('id, societe_id')
        .in('societe_id', societeIds)

      if (comptaDossiers && comptaDossiers.length > 0) {
        // ⚠️ V2 ONLY (mig 230). V1 ecritures_comptables est une vue sur V2 — on lit V2 directement.
        // On itère par société (V2 a societe_id) plutôt que par dossier pour éviter de compter plusieurs fois sur une société multi-dossiers.
        const societesUniques = Array.from(new Set(comptaDossiers.map(d => d.societe_id)))
        for (const sIdLoop of societesUniques) {
          const { data: ecritures } = await supabase
            .from('ecritures_comptables_v2')
            .select('debit_mur, credit_mur')
            .eq('societe_id', sIdLoop)

          if (ecritures && ecritures.length > 0) {
            let totalDebit = 0
            let totalCredit = 0
            for (const e of ecritures) {
              totalDebit += Number(e.debit_mur) || 0
              totalCredit += Number(e.credit_mur) || 0
            }
            const ecart = Math.abs(totalDebit - totalCredit)
            if (ecart > 0.01) {
              const societe = societesMap.get(sIdLoop)
              if (!societe) continue
              alertes.push({
                id: nextId(), type: 'comptable', severity: 'critical',
                client_name: clientMap.get(societe.client_id) || 'Client',
                societe_name: societe.nom, societe_id: sIdLoop,
                title: `Balance desequilibree`,
                message: `Ecart de ${ecart.toFixed(2)} MUR entre debits et credits pour ${societe.nom}. Total debit: ${totalDebit.toFixed(2)}, total credit: ${totalCredit.toFixed(2)}.`,
                deadline: null,
                created_at: now.toISOString(),
              })
            }
          }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // C) SOCIAL / HR
    // ══════════════════════════════════════════════════════════════════════════

    for (const societe of societes) {
      const clientName = clientMap.get(societe.client_id) || 'Client'
      const societeName = societe.nom || 'Societe'

      // ── C1: Bulletins de paie not generated for current month ─────────────
      {
        const currentPeriode = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

        const { data: employes } = await supabase
          .from('employes')
          .select('id')
          .eq('societe_id', societe.id)
          .eq('actif', true)

        if (employes && employes.length > 0 && now.getDate() >= 20) {
          const { data: bulletins } = await supabase
            .from('bulletins_paie')
            .select('id')
            .eq('societe_id', societe.id)
            .eq('periode', currentPeriode)
            .limit(1)

          if (!bulletins || bulletins.length === 0) {
            alertes.push({
              id: nextId(), type: 'social', severity: 'warning',
              client_name: clientName, societe_name: societeName, societe_id: societe.id,
              title: `Bulletins de paie ${currentPeriode} non generes`,
              message: `Les bulletins de paie de ${societeName} pour ${currentPeriode} n'ont pas encore ete generes. ${employes.length} employe(s) concerne(s).`,
              deadline: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
              created_at: now.toISOString(),
            })
          }
        }
      }

      // ── C2: CSG declarations overdue (social context) ────────────────────
      // Already covered in fiscal section above

      // ── C3: Employee contracts expiring within 30 days ───────────────────
      {
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        const today = now.toISOString().slice(0, 10)

        const { data: expiringContracts } = await supabase
          .from('employes')
          .select('id, nom, prenom, date_fin_contrat')
          .eq('societe_id', societe.id)
          .eq('actif', true)
          .not('date_fin_contrat', 'is', null)
          .lte('date_fin_contrat', thirtyDaysFromNow)
          .gte('date_fin_contrat', today)

        if (expiringContracts && expiringContracts.length > 0) {
          const names = expiringContracts
            .slice(0, 3)
            .map((e: any) => `${e.prenom || ''} ${e.nom || ''}`.trim())
            .join(', ')
          const suffix = expiringContracts.length > 3 ? ` et ${expiringContracts.length - 3} autre(s)` : ''

          alertes.push({
            id: nextId(), type: 'social', severity: 'warning',
            client_name: clientName, societe_name: societeName, societe_id: societe.id,
            title: `${expiringContracts.length} contrat(s) expirant sous 30 jours`,
            message: `Contrats arrivant a echeance pour ${societeName}: ${names}${suffix}.`,
            deadline: expiringContracts[0]?.date_fin_contrat || null,
            created_at: now.toISOString(),
          })
        }
      }

      // ── C4: Leave balance negative ───────────────────────────────────────
      {
        const { data: negativeLeave } = await supabase
          .from('employes')
          .select('id, nom, prenom, solde_conges')
          .eq('societe_id', societe.id)
          .eq('actif', true)
          .lt('solde_conges', 0)

        if (negativeLeave && negativeLeave.length > 0) {
          const names = negativeLeave
            .slice(0, 3)
            .map((e: any) => `${e.prenom || ''} ${e.nom || ''}`.trim())
            .join(', ')
          const suffix = negativeLeave.length > 3 ? ` et ${negativeLeave.length - 3} autre(s)` : ''

          alertes.push({
            id: nextId(), type: 'social', severity: 'info',
            client_name: clientName, societe_name: societeName, societe_id: societe.id,
            title: `${negativeLeave.length} solde(s) de conges negatif(s)`,
            message: `Employes avec solde de conges negatif chez ${societeName}: ${names}${suffix}.`,
            deadline: null,
            created_at: now.toISOString(),
          })
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Sort: critical first, then by deadline (nearest first)
    // ══════════════════════════════════════════════════════════════════════════
    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 }

    alertes.sort((a, b) => {
      const sevDiff = severityOrder[a.severity] - severityOrder[b.severity]
      if (sevDiff !== 0) return sevDiff

      // Sort by deadline (nearest first, null last)
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
      if (a.deadline && !b.deadline) return -1
      if (!a.deadline && b.deadline) return 1
      return 0
    })

    const counts = {
      critical: alertes.filter(a => a.severity === 'critical').length,
      warning: alertes.filter(a => a.severity === 'warning').length,
      info: alertes.filter(a => a.severity === 'info').length,
    }

    return NextResponse.json({ alertes, counts })
  } catch (error) {
    console.error('[alertes/comptable] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur interne' },
      { status: 500 }
    )
  }
}
