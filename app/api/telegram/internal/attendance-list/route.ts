import { NextRequest } from 'next/server'
import { withTelegramAuth, hasRole } from '@/lib/telegram/internal-auth'
import { getAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/telegram/internal/attendance-list?chat_id=<n>&date=YYYY-MM-DD
 *
 * Liste pour la société active :
 *   - présents (ont pointé aujourd'hui)
 *   - absents non justifiés (planning non-repos sans pointage ni congé)
 *   - en congé (demandes_conges approuvée couvrant aujourd'hui)
 *   - en repos (planning marqué repos)
 *
 * Rôle minimum : manager (manager voit son équipe ; rh/direction/admin voient tout).
 * Date = par défaut aujourd'hui (heure Maurice UTC+4).
 */
const MU_OFFSET_HOURS = 4

function todayMauritius(): string {
  const muNow = new Date(Date.now() + MU_OFFSET_HOURS * 3600 * 1000)
  return muNow.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  return withTelegramAuth(req, 'attendance.list', async (ctx) => {
    if (!hasRole(ctx, 'manager')) {
      return { result: null, status: 'denied', error_msg: 'Réservé aux managers, RH et direction' }
    }

    const qDate = req.nextUrl.searchParams.get('date')
    const date = (qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate)) ? qDate : todayMauritius()

    const admin = getAdminClient()

    // 1. Planning du jour pour la société
    const { data: assignments } = await admin
      .from('planning_assignments')
      .select('employe_id, shift_code, heure_debut, heure_fin, est_repos, plannings!inner(societe_id, statut)')
      .eq('date', date)
      .eq('plannings.societe_id', ctx.societe_id)
      .eq('plannings.statut', 'publie')

    // Filtrage manager : son équipe uniquement
    const allowedEmpIds: Set<string> | null = ctx.role === 'manager'
      ? new Set(ctx.manager_employes)
      : null

    const planningByEmp = new Map<string, any>()
    for (const a of (assignments || []) as any[]) {
      if (allowedEmpIds && !allowedEmpIds.has(a.employe_id)) continue
      planningByEmp.set(a.employe_id, a)
    }

    // 2. Pointages du jour
    const { data: pointages } = await admin
      .from('pointages')
      .select('employe_id, heure_entree, heure_sortie')
      .eq('date_pointage', date)
      .not('heure_entree', 'is', null)
      .in('employe_id', Array.from(planningByEmp.keys()).length
        ? Array.from(planningByEmp.keys())
        : ['00000000-0000-0000-0000-000000000000'])
    const pointageByEmp = new Map<string, any>((pointages || []).map((p: any) => [p.employe_id, p]))

    // 3. Congés couvrant la date
    const empIds = Array.from(planningByEmp.keys())
    const { data: conges } = await admin
      .from('demandes_conges')
      .select('employe_id, type_conge, date_debut, date_fin')
      .in('statut', ['approuve', 'approve', 'approved'])
      .lte('date_debut', date)
      .gte('date_fin', date)
      .in('employe_id', empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000'])
    const congeByEmp = new Map<string, any>((conges || []).map((c: any) => [c.employe_id, c]))

    // 4. Infos employés
    const { data: employes } = await admin
      .from('employes')
      .select('id, prenom, nom, poste, telephone')
      .in('id', empIds.length ? empIds : ['00000000-0000-0000-0000-000000000000'])
    const empMap = new Map<string, any>((employes || []).map((e: any) => [e.id, e]))

    // 5. Catégorisation
    const presents: any[] = []
    const absents: any[] = []
    const en_conge: any[] = []
    const en_repos: any[] = []

    for (const [empId, plan] of planningByEmp.entries()) {
      const e = empMap.get(empId) || { prenom: '', nom: 'Inconnu', poste: null }
      const baseInfo = {
        employe_id: empId,
        nom: `${e.prenom || ''} ${e.nom || ''}`.trim() || 'Sans nom',
        poste: e.poste || null,
        telephone: e.telephone || null,
        shift: plan.shift_code || null,
        heure_debut: plan.heure_debut?.slice(0, 5) || null,
        heure_fin: plan.heure_fin?.slice(0, 5) || null,
      }

      if (plan.est_repos) {
        en_repos.push(baseInfo)
        continue
      }
      const conge = congeByEmp.get(empId)
      if (conge) {
        en_conge.push({ ...baseInfo, type_conge: conge.type_conge })
        continue
      }
      const pointage = pointageByEmp.get(empId)
      if (pointage) {
        presents.push({
          ...baseInfo,
          heure_entree: pointage.heure_entree?.slice(0, 5) || null,
          heure_sortie: pointage.heure_sortie?.slice(0, 5) || null,
        })
        continue
      }
      absents.push(baseInfo)
    }

    return {
      result: {
        date,
        societe_id: ctx.societe_id,
        scope: ctx.role === 'manager' ? 'mon_equipe' : 'societe',
        compteurs: {
          presents: presents.length,
          absents: absents.length,
          en_conge: en_conge.length,
          en_repos: en_repos.length,
          total_planifies: planningByEmp.size,
        },
        presents,
        absents,
        en_conge,
        en_repos,
      },
    }
  })
}
