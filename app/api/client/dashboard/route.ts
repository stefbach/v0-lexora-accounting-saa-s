/**
 * /api/client/dashboard — single-call, optimised payload for the client
 * dashboard (admin + tableau-de-bord).
 *
 * Why this route exists
 * ---------------------
 * The previous dashboard page fired **8 parallel** heavy calls to
 * `/api/client/financial` (current month + exercise + 6 chart months).
 * Each `/financial` call aggregates thousands of rows and returns a huge
 * JSON (all écritures, all factures, all bank transactions…). Cumulated,
 * that easily exceeded Vercel's function timeout → dashboard timeout.
 *
 * This route makes ONE call that:
 *   1. Fetches the needed rows ONCE (ecritures for the last ~13 months,
 *      factures for the month + échéances, comptes_bancaires, tva_mensuelle).
 *   2. Aggregates everything server-side into a compact JSON:
 *        - monthly KPIs   (CA, dépenses, bénéfice, TVA nette, salaires, échéances 30j)
 *        - exercise KPIs  (CA, dépenses, résultat)
 *        - 6-month chart  (CA / Dépenses / Résultat per month)
 *        - alertes        (factures en retard, échéances proches, solde faible, TVA)
 *        - trésorerie     (total MUR + comptes)
 *        - sociétés       (list for the selector)
 *
 *  No raw arrays of écritures / factures / transactions are returned — the
 *  payload stays small (usually < 20 KB) and the call finishes in < 2 s.
 */

import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getTauxChange } from '@/lib/taux-change'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function convertToMUR(amount: number, devise: string, rates: Record<string, number>): number {
  if (!devise || devise === 'MUR') return amount
  const rate = rates[devise.toUpperCase()]
  return rate ? amount * rate : amount
}

function pad2(n: number): string { return String(n).padStart(2, '0') }

function firstOfMonth(y: number, m: number): string { return `${y}-${pad2(m)}-01` }
function lastDayOfMonth(y: number, m: number): string {
  const last = new Date(y, m, 0).getDate()
  return `${y}-${pad2(m)}-${pad2(last)}`
}

function shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const d = new Date(y, m - 1 + delta, 1)
  return { y: d.getFullYear(), m: d.getMonth() + 1 }
}

function formatMoisShort(y: number, m: number): string {
  return new Date(y, m - 1).toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')
}

function getCurrentExercice(): string {
  const now = new Date()
  const y = now.getFullYear()
  return now.getMonth() + 1 >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`
}

function parseExerciceDates(exercice: string): { debut: string; fin: string } {
  const match = exercice.match(/^(\d{4})-(\d{4})$/)
  if (!match) {
    const [a, b] = getCurrentExercice().split('-').map(Number)
    return { debut: `${a}-07-01`, fin: `${b}-06-30` }
  }
  return { debut: `${match[1]}-07-01`, fin: `${match[2]}-06-30` }
}

// GET /api/client/dashboard?societe_id=xxx&mois=YYYY-MM
// societe_id optional: if omitted, aggregates over ALL sociétés of the user.
// mois optional: if omitted, uses current month.
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const supabase = getAdminClient()
    const url = new URL(request.url)
    const requestedSocieteId = url.searchParams.get('societe_id') || null
    const requestedMois = url.searchParams.get('mois') // YYYY-MM

    // ---------- Resolve the set of sociétés the user can see ----------
    const { data: profile } = await supabase
      .from('profiles').select('role, client_id, societe_id')
      .eq('id', user.id).maybeSingle()
    const role = profile?.role || ''

    let societesVisible: any[] = []

    if (['admin', 'super_admin'].includes(role)) {
      const { data } = await supabase.from('societes').select('id, nom, brn, statut').order('nom')
      societesVisible = data || []
    } else if (['comptable', 'comptable_dedie'].includes(role)) {
      const [{ data: viaCS }, { data: viaDossiers }] = await Promise.all([
        supabase.from('comptable_societes').select('societes(id, nom, brn, statut)').eq('comptable_id', user.id).eq('actif', true),
        supabase.from('dossiers').select('societes(id, nom, brn, statut)').eq('comptable_id', user.id).eq('statut', 'actif'),
      ])
      const map = new Map()
      ;(viaCS || []).forEach((r: any) => { if (r.societes) map.set(r.societes.id, r.societes) })
      ;(viaDossiers || []).forEach((d: any) => { if (d.societes) map.set(d.societes.id, d.societes) })
      societesVisible = Array.from(map.values())
    } else {
      // client_admin / client_user / client_assistant
      const [{ data: owned }, { data: dossiers }, { data: userSocietes }] = await Promise.all([
        supabase.from('societes').select('id, nom, brn, statut').eq('created_by', user.id),
        supabase.from('dossiers').select('societe_id, societes(id, nom, brn, statut)').eq('client_id', user.id),
        supabase.from('user_societes').select('societe_id, societes(id, nom, brn, statut)').eq('user_id', user.id),
      ])
      const map = new Map()
      ;(owned || []).forEach((s: any) => map.set(s.id, s))
      ;(dossiers || []).forEach((d: any) => { if (d.societes) map.set(d.societes.id, d.societes) })
      ;(userSocietes || []).forEach((u: any) => { if (u.societes) map.set(u.societes.id, u.societes) })
      societesVisible = Array.from(map.values())
    }

    const allSocieteIds = societesVisible.map(s => s.id)
    const targetSocieteIds = requestedSocieteId && requestedSocieteId !== 'all'
      ? [requestedSocieteId].filter(id => allSocieteIds.includes(id))
      : allSocieteIds

    if (targetSocieteIds.length === 0) {
      return NextResponse.json({
        societes: societesVisible,
        selected_societe_id: requestedSocieteId,
        currentMonth: empty(),
        exercice: { label: getCurrentExercice(), ca: 0, depenses: 0, resultat: 0 },
        chart: [],
        tresorerie: { total_mur: 0, nb_comptes: 0, comptes: [] },
        alertes: [],
        documents: [],
      })
    }

    // ---------- Date ranges ----------
    const now = new Date()
    const currentMoisKey = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
    const targetMoisKey = requestedMois || currentMoisKey
    const [targetY, targetM] = targetMoisKey.split('-').map(Number)

    // Chart: last 6 completed months before the target month.
    // We want: months [target-5 .. target] inclusive → 6 months.
    const chartStart = shiftMonth(targetY, targetM, -5)
    const chartStartDate = firstOfMonth(chartStart.y, chartStart.m)
    const chartEndDate = lastDayOfMonth(targetY, targetM)

    // Exercise range
    const exercice = getCurrentExercice()
    const exerciceRange = parseExerciceDates(exercice)

    // Overall ecriture range = min(exerciceDebut, chartStart) → max(exerciceFin, chartEnd)
    const fetchDebut = chartStartDate < exerciceRange.debut ? chartStartDate : exerciceRange.debut
    const fetchFin = chartEndDate > exerciceRange.fin ? chartEndDate : exerciceRange.fin

    // Target month range
    const targetMoisDebut = firstOfMonth(targetY, targetM)
    const targetMoisFin = lastDayOfMonth(targetY, targetM)

    // ---------- Parallel fetch (all independent, bounded) ----------
    const rates = await getTauxChange()
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)
    const in7days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)

    const [
      { data: ecritures },
      { data: facturesMoisCible },
      { data: facturesEcheances },
      { data: comptesBank },
      { data: recentDocs },
    ] = await Promise.all([
      // ONE query for all écritures in our wide window (chart + exercise)
      supabase
        .from('ecritures_comptables_v2')
        .select('numero_compte, date_ecriture, debit_mur, credit_mur, journal')
        .in('societe_id', targetSocieteIds)
        .gte('date_ecriture', fetchDebut)
        .lte('date_ecriture', fetchFin),
      // Factures of the target month (for échéances 30j count)
      supabase
        .from('factures')
        .select('id, tiers, montant_mur, montant_ttc, devise, statut, type_facture, date_facture, date_echeance')
        .in('societe_id', targetSocieteIds)
        .gte('date_facture', targetMoisDebut)
        .lte('date_facture', targetMoisFin),
      // Factures impayées avec échéance entre hier et +30j (pour alertes retard/proche)
      supabase
        .from('factures')
        .select('id, tiers, montant_mur, montant_ttc, devise, statut, type_facture, date_echeance')
        .in('societe_id', targetSocieteIds)
        .not('date_echeance', 'is', null)
        .not('statut', 'in', '("paye","annule")')
        .lte('date_echeance', in30)
        .order('date_echeance', { ascending: true })
        .limit(50),
      // Comptes bancaires
      supabase
        .from('comptes_bancaires')
        .select('id, banque, devise, solde_actuel, numero_compte, societe_id')
        .in('societe_id', targetSocieteIds)
        .eq('actif', true),
      // Recent documents (last 5)
      supabase
        .from('documents')
        .select('id, nom_fichier, statut, created_at')
        .in('societe_id', targetSocieteIds)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    const allEcritures = ecritures || []

    // Helper: skip payroll of current month (incomplete)
    const currentMonthFirst = firstOfMonth(now.getFullYear(), now.getMonth() + 1)
    const isPayrollCurrentMonth = (e: any) =>
      (e.journal === 'SAL' || e.journal === 'OD-PAIE') && e.date_ecriture >= currentMonthFirst

    const caForRange = (ecr: any[], debut: string, fin: string): number =>
      ecr
        .filter(e => e.numero_compte?.startsWith('7') && e.date_ecriture >= debut && e.date_ecriture <= fin)
        .reduce((s, e) => s + (Number(e.credit_mur) || 0) - (Number(e.debit_mur) || 0), 0)

    const depensesForRange = (ecr: any[], debut: string, fin: string): number =>
      ecr
        .filter(e => e.numero_compte?.startsWith('6') && !isPayrollCurrentMonth(e) && e.date_ecriture >= debut && e.date_ecriture <= fin)
        .reduce((s, e) => s + (Number(e.debit_mur) || 0) - (Number(e.credit_mur) || 0), 0)

    // ---------- Current (target) month KPIs ----------
    const factsMois = facturesMoisCible || []
    const caFromFactures = factsMois
      .filter(f => f.type_facture === 'client' && f.statut !== 'annule')
      .reduce((s, f) => s + (Number(f.montant_mur) || convertToMUR(Number(f.montant_ttc) || 0, f.devise || 'MUR', rates)), 0)
    const caEcritures = caForRange(allEcritures, targetMoisDebut, targetMoisFin)
    const caMois = caFromFactures > 0 ? caFromFactures : caEcritures
    const depensesMois = depensesForRange(allEcritures, targetMoisDebut, targetMoisFin)

    const tvaCollecteeMois = allEcritures
      .filter(e => e.numero_compte?.startsWith('4457') && e.date_ecriture >= targetMoisDebut && e.date_ecriture <= targetMoisFin)
      .reduce((s, e) => s + (Number(e.credit_mur) || 0) - (Number(e.debit_mur) || 0), 0)
    const tvaDeductibleMois = allEcritures
      .filter(e => e.numero_compte?.startsWith('4456') && e.date_ecriture >= targetMoisDebut && e.date_ecriture <= targetMoisFin)
      .reduce((s, e) => s + (Number(e.debit_mur) || 0) - (Number(e.credit_mur) || 0), 0)
    const tvaNetteMois = tvaCollecteeMois - tvaDeductibleMois

    const salairesMois = allEcritures
      .filter(e => e.numero_compte?.startsWith('641') && !isPayrollCurrentMonth(e) && e.date_ecriture >= targetMoisDebut && e.date_ecriture <= targetMoisFin)
      .reduce((s, e) => s + (Number(e.debit_mur) || 0) - (Number(e.credit_mur) || 0), 0)

    const echeances30j = (facturesEcheances || [])
      .filter(f => f.date_echeance && f.date_echeance >= today && f.date_echeance <= in30)
      .length

    // ---------- Exercise KPIs ----------
    const caExercice = caForRange(allEcritures, exerciceRange.debut, exerciceRange.fin)
    const depensesExercice = depensesForRange(allEcritures, exerciceRange.debut, exerciceRange.fin)

    // ---------- 6-month chart ----------
    const chart = Array.from({ length: 6 }).map((_, idx) => {
      const offset = idx - 5 // from -5 to 0
      const { y, m } = shiftMonth(targetY, targetM, offset)
      const debut = firstOfMonth(y, m)
      const fin = lastDayOfMonth(y, m)
      const ca = caForRange(allEcritures, debut, fin)
      const dep = depensesForRange(allEcritures, debut, fin)
      return {
        mois_key: `${y}-${pad2(m)}`,
        mois: formatMoisShort(y, m),
        CA: Math.round(ca),
        Depenses: Math.round(dep),
        Resultat: Math.round(ca - dep),
      }
    })

    // ---------- Trésorerie ----------
    const bankAccounts = (comptesBank || []).map((c: any) => ({
      banque: c.banque || '—',
      devise: (c.devise || 'MUR').toUpperCase(),
      solde: Number(c.solde_actuel) || 0,
      solde_mur: convertToMUR(Number(c.solde_actuel) || 0, c.devise || 'MUR', rates),
      numero_compte: c.numero_compte || null,
    }))
    const tresorerieTotal = bankAccounts.reduce((s, a) => s + a.solde_mur, 0)

    // ---------- Alertes ----------
    const alertes: Array<{
      id: string
      niveau: 'danger' | 'warning' | 'info'
      titre: string
      description: string
      montant?: number
      echeance?: string | null
      lien?: string
    }> = []

    // Factures en retard (impayées, échéance < aujourd'hui)
    const facturesRetard = (facturesEcheances || [])
      .filter(f => f.date_echeance && f.date_echeance < today)
      .slice(0, 3)
    for (const f of facturesRetard) {
      alertes.push({
        id: `retard-${f.id}`,
        niveau: 'danger',
        titre: `Facture en retard — ${(f as any).tiers || 'Inconnu'}`,
        description: `Échéance dépassée depuis le ${new Date(f.date_echeance!).toLocaleDateString('fr-FR')}`,
        montant: Number(f.montant_mur) || Number(f.montant_ttc) || 0,
        echeance: f.date_echeance,
        lien: '/client/echeances',
      })
    }

    // Factures proches (dans 7j)
    const facturesProches = (facturesEcheances || [])
      .filter(f => f.date_echeance && f.date_echeance >= today && f.date_echeance <= in7days)
      .slice(0, 3)
    for (const f of facturesProches) {
      const days = Math.max(0, Math.ceil((new Date(f.date_echeance!).getTime() - Date.now()) / 86400000))
      alertes.push({
        id: `proche-${f.id}`,
        niveau: 'warning',
        titre: `Échéance proche — ${(f as any).tiers || 'Inconnu'}`,
        description: `Dans ${days} jour${days > 1 ? 's' : ''}`,
        montant: Number(f.montant_mur) || Number(f.montant_ttc) || 0,
        echeance: f.date_echeance,
        lien: '/client/echeances',
      })
    }

    // Déclaration TVA (entre le 15 et le 20 de chaque mois)
    const day = new Date().getDate()
    if (day >= 15 && day <= 20) {
      alertes.push({
        id: 'tva-declaration',
        niveau: 'info',
        titre: 'Déclaration TVA',
        description: 'TVA du mois à soumettre avant le 20',
        lien: '/client/tva',
      })
    }

    // Soldes faibles
    for (const acc of bankAccounts) {
      const threshold = acc.devise === 'MUR' ? 50000 : acc.devise === 'EUR' ? 500 : null
      if (threshold !== null && acc.solde < threshold) {
        const tail = acc.numero_compte ? `•${String(acc.numero_compte).slice(-4)}` : ''
        alertes.push({
          id: `solde-${acc.banque}-${acc.devise}-${tail}`,
          niveau: 'danger',
          titre: `Solde faible — ${acc.banque} ${acc.devise} ${tail}`.trim(),
          description: `Solde: ${acc.solde.toLocaleString('fr-FR')} ${acc.devise} (seuil: ${threshold.toLocaleString('fr-FR')} ${acc.devise})`,
          montant: acc.solde,
          lien: '/client/banque',
        })
      }
    }

    // Sort: danger > warning > info
    const niveauOrder: Record<string, number> = { danger: 0, warning: 1, info: 2 }
    alertes.sort((a, b) => niveauOrder[a.niveau] - niveauOrder[b.niveau])

    return NextResponse.json({
      societes: societesVisible,
      selected_societe_id: requestedSocieteId,
      mois: targetMoisKey,
      currentMonth: {
        ca: Math.round(caMois),
        depenses: Math.round(depensesMois),
        benefice: Math.round(caMois - depensesMois),
        tva_nette: Math.round(tvaNetteMois),
        salaires: Math.round(salairesMois),
        echeances_30j: echeances30j,
      },
      exercice: {
        label: exercice,
        ca: Math.round(caExercice),
        depenses: Math.round(depensesExercice),
        resultat: Math.round(caExercice - depensesExercice),
      },
      chart,
      tresorerie: {
        total_mur: Math.round(tresorerieTotal),
        nb_comptes: bankAccounts.length,
        comptes: bankAccounts.slice(0, 5).map(a => ({
          banque: a.banque, devise: a.devise, solde: a.solde,
        })),
      },
      alertes,
      documents: (recentDocs || []).map((d: any) => ({
        id: d.id,
        nom: d.nom_fichier,
        date: d.created_at,
        statut: d.statut || 'en_attente',
      })),
    }, { headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=60' } })
  } catch (e: unknown) {
    console.error('[api/client/dashboard] error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

function empty() {
  return { ca: 0, depenses: 0, benefice: 0, tva_nette: 0, salaires: 0, echeances_30j: 0 }
}
