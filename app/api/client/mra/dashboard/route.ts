/**
 * GET /api/client/mra/dashboard?societe_id=...&from=YYYY-MM&to=YYYY-MM
 *
 * Tableau de bord MRA unifié : (re)calcule les déclarations mensuelles sur la
 * fenêtre demandée (12 derniers mois par défaut) puis renvoie la matrice de
 * conformité (vw_mra_compliance_status) groupée par priorité.
 *
 * Auth : session OU clé API OU token interne (pour l'agent Telegram).
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createSupabase } from '@supabase/supabase-js'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'
import { assertSocieteAccess } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/** Liste des N derniers mois (YYYY-MM), du plus récent au plus ancien. */
function lastMonths(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  d.setDate(1)
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() - 1)
  }
  return out
}

export async function GET(request: Request) {
  try {
    const user = await resolveUserAuth(request)
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const admin = getAdminClient()
    await assertSocieteAccess(admin, user.id, societe_id)

    // Fenêtre de calcul : 12 derniers mois (couvre la déclaration du mois en cours).
    const months = lastMonths(13)

    // (Re)calcule chaque mois — idempotent, ne touche pas les statuts avancés.
    for (const periode of months) {
      try {
        await admin.rpc('mra_compute_period', { p_societe_id: societe_id, p_periode: periode })
      } catch {
        // best-effort : on continue si une période échoue
      }
    }

    // Lecture de la matrice de conformité.
    const { data: rows, error } = await admin
      .from('vw_mra_compliance_status')
      .select('*')
      .eq('societe_id', societe_id)
      .order('date_echeance', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const list = (rows || []) as any[]

    // Groupes par priorité (pour le dashboard) + KPIs.
    const groups: Record<string, any[]> = { retard: [], urgent: [], bientot: [], futur: [], done: [] }
    let total_du = 0
    let total_retard = 0
    for (const r of list) {
      const p = r.priorite
      if (p === 'paye' || p === 'sans_objet' || p === 'declare') groups.done.push(r)
      else if (groups[p]) groups[p].push(r)
      if (['retard', 'urgent', 'bientot', 'futur'].includes(p)) total_du += Number(r.montant_du) || 0
      if (p === 'retard') total_retard += Number(r.montant_du) || 0
    }

    // Prochaine échéance (la plus proche non traitée).
    const aTraiter = list
      .filter(r => ['retard', 'urgent', 'bientot', 'futur'].includes(r.priorite))
      .sort((a, b) => String(a.date_echeance).localeCompare(String(b.date_echeance)))
    const prochaine = aTraiter[0] || null

    return NextResponse.json({
      societe_id,
      declarations: list,
      groups,
      kpis: {
        total_a_traiter: list.filter(r => ['retard', 'urgent', 'bientot', 'futur'].includes(r.priorite)).length,
        nb_retard: groups.retard.length,
        montant_du: Math.round(total_du * 100) / 100,
        montant_retard: Math.round(total_retard * 100) / 100,
      },
      prochaine_echeance: prochaine,
    })
  } catch (e: any) {
    if (e?.name === 'SocieteAccessError') return NextResponse.json({ error: e.message }, { status: 403 })
    return NextResponse.json({ error: e?.message || 'Erreur' }, { status: 500 })
  }
}
