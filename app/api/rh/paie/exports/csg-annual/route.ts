/**
 * GET /api/rh/paie/exports/csg-annual
 *
 * Export officiel MRA — CSG Annual Reconciliation.
 *
 * Récapitule, par employé, le total CSG collecté (salarié + patronal)
 * sur l'année fiscale mauricienne (juillet → juin), avec le détail mois
 * par mois.
 *
 * ⚠️ SCAFFOLD — Le format ci-dessous (namespace http://mra.mu/csg/v1,
 *    libellés CSV, balises XML) est une approximation. Le format, les
 *    champs obligatoires et les règles de validation DOIVENT être validés
 *    avec la spec officielle MRA/CSG avant toute soumission réelle.
 *
 * Query params :
 *   - societe_id     (UUID, requis)
 *   - annee_fiscale  (number, requis ; année de début de l'exercice)
 *   - format         ('csv' | 'xml' — défaut 'csv')
 */
import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  assertSocieteAccess,
  mapSocieteAccessError,
} from '@/lib/supabase/assert-societe-access'
import {
  formatAmountMra,
  escapeXml,
  escapeCsv,
  addUtf8Bom,
  anneeFiscaleBounds,
} from '@/lib/exports/mra-format-helpers'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getAdminClient(): SupabaseClient {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

interface BulletinRow {
  employe_id: string
  periode: string | null
  csg_salarie: number | string | null
  csg_bonus: number | string | null
  csg_patronal: number | string | null
  csg_patronal_bonus: number | string | null
}

interface EmployeRow {
  id: string
  nom: string | null
  prenom: string | null
  code: string | null
  nic_number: string | null
  nic?: string | null
}

function toNumber(v: unknown): number {
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function sanitizeFilename(s: string): string {
  return (s || 'Societe').replace(/[^a-zA-Z0-9_-]/g, '_')
}

function monthKey(d: string | Date | null): string {
  if (!d) return ''
  const dt = typeof d === 'string' ? new Date(d) : d
  if (!(dt instanceof Date) || isNaN(dt.getTime())) return ''
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

interface EmployeeAgg {
  emp: EmployeRow | null
  totalCsgEmp: number
  totalCsgEmployer: number
  monthlyEmp: Map<string, number>
  monthlyEmployer: Map<string, number>
  monthsContrib: number
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = await createServerClient()
    const {
      data: { user },
    } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const anneeFiscaleRaw = searchParams.get('annee_fiscale')
    const format = (searchParams.get('format') || 'csv').toLowerCase()

    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }
    if (!anneeFiscaleRaw || !/^\d{4}$/.test(anneeFiscaleRaw)) {
      return NextResponse.json(
        { error: 'annee_fiscale (YYYY) requise (ex: 2025 pour FY 2025-2026)' },
        { status: 400 },
      )
    }
    if (!['csv', 'xml'].includes(format)) {
      return NextResponse.json(
        { error: "format invalide (valeurs acceptées: 'csv', 'xml')" },
        { status: 400 },
      )
    }

    const anneeFiscale = parseInt(anneeFiscaleRaw, 10)
    const { debut, fin } = anneeFiscaleBounds(anneeFiscale)

    const admin = getAdminClient()

    try {
      await assertSocieteAccess(admin, user.id, societe_id)
    } catch (e) {
      const mapped = mapSocieteAccessError(e)
      if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
      throw e
    }

    const { data: societe } = await admin
      .from('societes')
      .select('nom, ern, numero_tva_mra, tan_societe')
      .eq('id', societe_id)
      .maybeSingle()

    const societeNom = sanitizeFilename(String(societe?.nom || 'Societe'))
    const tan = String(societe?.tan_societe || societe?.numero_tva_mra || '').trim()
    const ern = String(societe?.ern || '').trim()

    // La déclaration CSG MRA utilise l'ERN comme identifiant principal.
    if (!ern && !tan) {
      return NextResponse.json(
        {
          error:
            `ERN ou TAN manquant pour "${societe?.nom || 'société inconnue'}". ` +
            `À renseigner dans /rh/societe avant export CSG annuel.`,
          code: 'missing_ern_or_tan',
        },
        { status: 400 },
      )
    }

    const { data: bulletinsRaw, error: bErr } = await admin
      .from('bulletins_paie')
      .select('employe_id, periode, csg_salarie, csg_bonus, csg_patronal, csg_patronal_bonus')
      .eq('societe_id', societe_id)
      .gte('periode', debut)
      .lte('periode', fin)

    if (bErr) {
      return NextResponse.json(
        { error: `Erreur bulletins_paie: ${bErr.message}` },
        { status: 500 },
      )
    }

    const bulletins: BulletinRow[] = (bulletinsRaw || []) as BulletinRow[]

    if (bulletins.length === 0) {
      return NextResponse.json(
        {
          error:
            `Aucun bulletin de paie trouvé pour l'année fiscale ${anneeFiscale}-${anneeFiscale + 1} ` +
            `(${debut} → ${fin}).`,
          code: 'no_bulletins_found',
        },
        { status: 400 },
      )
    }

    const empIds = [...new Set(bulletins.map((b) => b.employe_id).filter(Boolean))]
    const empMap = new Map<string, EmployeRow>()
    if (empIds.length > 0) {
      const { data: emps } = await admin
        .from('employes')
        .select('id, nom, prenom, code, nic_number, nic')
        .in('id', empIds)
      for (const e of (emps || []) as EmployeRow[]) {
        empMap.set(e.id, e)
      }
    }

    // Colonnes mois (12 mois de l'année fiscale)
    const monthColumns: string[] = []
    for (let i = 0; i < 12; i++) {
      const m = ((6 + i) % 12) + 1
      const y = i < 6 ? anneeFiscale : anneeFiscale + 1
      monthColumns.push(`${y}-${String(m).padStart(2, '0')}`)
    }

    const aggByEmp = new Map<string, EmployeeAgg>()
    for (const b of bulletins) {
      const key = monthKey(b.periode)
      const current =
        aggByEmp.get(b.employe_id) ||
        ({
          emp: empMap.get(b.employe_id) || null,
          totalCsgEmp: 0,
          totalCsgEmployer: 0,
          monthlyEmp: new Map<string, number>(),
          monthlyEmployer: new Map<string, number>(),
          monthsContrib: 0,
        } as EmployeeAgg)

      const csgEmp = toNumber(b.csg_salarie) + toNumber(b.csg_bonus)
      const csgEmployer = toNumber(b.csg_patronal) + toNumber(b.csg_patronal_bonus)

      current.totalCsgEmp += csgEmp
      current.totalCsgEmployer += csgEmployer
      current.monthlyEmp.set(key, (current.monthlyEmp.get(key) || 0) + csgEmp)
      current.monthlyEmployer.set(key, (current.monthlyEmployer.get(key) || 0) + csgEmployer)
      if (csgEmp > 0 || csgEmployer > 0) current.monthsContrib += 1
      aggByEmp.set(b.employe_id, current)
    }

    let totalEmpCompany = 0
    let totalEmployerCompany = 0
    for (const [, a] of aggByEmp) {
      totalEmpCompany += a.totalCsgEmp
      totalEmployerCompany += a.totalCsgEmployer
    }

    const period = `${anneeFiscale}-${anneeFiscale + 1}`

    // --- CSV ---
    if (format === 'csv') {
      const header = [
        'ERN_Employer',
        'TAN_Employer',
        'NIC',
        'Nom',
        'Prenom',
        ...monthColumns.flatMap((m) => [`${m}_CSG_Sal`, `${m}_CSG_Pat`]),
        'Total_CSG_Salarie',
        'Total_CSG_Patronal',
        'Total_CSG',
        'Mois_Contribution',
        'Periode_Debut',
        'Periode_Fin',
      ].join(';')
      const lines: string[] = [header]
      for (const [, agg] of aggByEmp) {
        const emp = agg.emp
        const nic = emp?.nic_number || emp?.nic || ''
        const monthlyValues: string[] = []
        for (const m of monthColumns) {
          monthlyValues.push(escapeCsv(formatAmountMra(agg.monthlyEmp.get(m) || 0)))
          monthlyValues.push(escapeCsv(formatAmountMra(agg.monthlyEmployer.get(m) || 0)))
        }
        lines.push(
          [
            escapeCsv(ern),
            escapeCsv(tan),
            escapeCsv(nic),
            escapeCsv(emp?.nom || ''),
            escapeCsv(emp?.prenom || ''),
            ...monthlyValues,
            escapeCsv(formatAmountMra(agg.totalCsgEmp)),
            escapeCsv(formatAmountMra(agg.totalCsgEmployer)),
            escapeCsv(formatAmountMra(agg.totalCsgEmp + agg.totalCsgEmployer)),
            escapeCsv(agg.monthsContrib),
            escapeCsv(debut),
            escapeCsv(fin),
          ].join(';'),
        )
      }
      // Ligne totaux
      const totalPairs: string[] = []
      for (const m of monthColumns) {
        let tE = 0
        let tP = 0
        for (const [, a] of aggByEmp) {
          tE += a.monthlyEmp.get(m) || 0
          tP += a.monthlyEmployer.get(m) || 0
        }
        totalPairs.push(escapeCsv(formatAmountMra(tE)))
        totalPairs.push(escapeCsv(formatAmountMra(tP)))
      }
      lines.push(
        [
          'TOTAL',
          '',
          '',
          '',
          '',
          ...totalPairs,
          escapeCsv(formatAmountMra(totalEmpCompany)),
          escapeCsv(formatAmountMra(totalEmployerCompany)),
          escapeCsv(formatAmountMra(totalEmpCompany + totalEmployerCompany)),
          '',
          '',
          '',
        ].join(';'),
      )
      const csv = addUtf8Bom(lines.join('\n') + '\n')
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="CSG_Annual_${societeNom}_${period}.csv"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    // --- XML ---
    const employeeBlocks: string[] = []
    for (const [, agg] of aggByEmp) {
      const emp = agg.emp
      const nic = emp?.nic_number || emp?.nic || ''
      const fullName = [emp?.prenom, emp?.nom].filter(Boolean).join(' ').trim() || emp?.code || ''
      const monthlyBlocks = monthColumns
        .map(
          (m) =>
            `        <Month key="${escapeXml(m)}">\n` +
            `          <CSGEmployee>${formatAmountMra(agg.monthlyEmp.get(m) || 0)}</CSGEmployee>\n` +
            `          <CSGEmployer>${formatAmountMra(agg.monthlyEmployer.get(m) || 0)}</CSGEmployer>\n` +
            `        </Month>`,
        )
        .join('\n')
      employeeBlocks.push(
        `    <Employee>\n` +
        `      <NIC>${escapeXml(nic)}</NIC>\n` +
        `      <Name>${escapeXml(fullName)}</Name>\n` +
        `      <Monthly>\n` +
        `${monthlyBlocks}\n` +
        `      </Monthly>\n` +
        `      <TotalCSGEmployee>${formatAmountMra(agg.totalCsgEmp)}</TotalCSGEmployee>\n` +
        `      <TotalCSGEmployer>${formatAmountMra(agg.totalCsgEmployer)}</TotalCSGEmployer>\n` +
        `      <TotalCSG>${formatAmountMra(agg.totalCsgEmp + agg.totalCsgEmployer)}</TotalCSG>\n` +
        `      <MonthsContribution>${agg.monthsContrib}</MonthsContribution>\n` +
        `    </Employee>\n`,
      )
    }
    const xmlBody =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<CSGAnnual xmlns="http://mra.mu/csg/v1">\n` +
      `  <Employer>\n` +
      `    <TAN>${escapeXml(tan)}</TAN>\n` +
      `    <ERN>${escapeXml(ern)}</ERN>\n` +
      `    <Name>${escapeXml(societe?.nom || '')}</Name>\n` +
      `    <Period>${escapeXml(period)}</Period>\n` +
      `  </Employer>\n` +
      `  <Employees>\n` +
      employeeBlocks.join('') +
      `  </Employees>\n` +
      `  <Totals>\n` +
      `    <EmployeeCount>${aggByEmp.size}</EmployeeCount>\n` +
      `    <TotalCSGEmployee>${formatAmountMra(totalEmpCompany)}</TotalCSGEmployee>\n` +
      `    <TotalCSGEmployer>${formatAmountMra(totalEmployerCompany)}</TotalCSGEmployer>\n` +
      `    <TotalCSG>${formatAmountMra(totalEmpCompany + totalEmployerCompany)}</TotalCSG>\n` +
      `  </Totals>\n` +
      `</CSGAnnual>\n`
    const payload = addUtf8Bom(xmlBody)
    return new NextResponse(payload, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="CSG_Annual_${societeNom}_${period}.xml"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur serveur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
