/**
 * GET /api/rh/paie/exports/form-1-tds
 *
 * Export officiel MRA — Form 1 (Income Tax TDS / PAYE annuel).
 *
 * Form 1 MRA = déclaration annuelle de l'impôt sur le revenu retenu à la
 * source (PAYE) par employé, pour l'année fiscale mauricienne
 * (1er juillet → 30 juin).
 *
 * ⚠️ SCAFFOLD — Le format ci-dessous (namespace http://mra.mu/form1/v1,
 *    libellés CSV, balises XML, entêtes PDF) est une approximation basée
 *    sur la structure type des déclarations annuelles MRA. Le format, les
 *    champs obligatoires et les règles de validation DOIVENT être validés
 *    avec la spec officielle MRA Form 1 avant toute soumission réelle.
 *
 * Query params :
 *   - societe_id     (UUID, requis)
 *   - annee_fiscale  (number, requis ; année de début de l'exercice.
 *                     Ex : 2025 = FY juillet 2025 → juin 2026)
 *   - format         ('csv' | 'xml' | 'pdf' — défaut 'csv')
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
  salaire_brut: number | string | null
  eoy_bonus: number | string | null
  paye: number | string | null
}

interface EmployeRow {
  id: string
  nom: string | null
  prenom: string | null
  code: string | null
  nic_number: string | null
  nic?: string | null
  tan_number?: string | null
  tan?: string | null
}

function toNumber(v: unknown): number {
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function sanitizeFilename(s: string): string {
  return (s || 'Societe').replace(/[^a-zA-Z0-9_-]/g, '_')
}

interface EmployeeAgg {
  emp: EmployeRow | null
  totalGross: number
  totalPaye: number
  totalEoy: number
  monthsWorked: number
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
    if (!['csv', 'xml', 'pdf'].includes(format)) {
      return NextResponse.json(
        { error: "format invalide (valeurs acceptées: 'csv', 'xml', 'pdf')" },
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
      .select('nom, ern, numero_tva_mra, tan_societe, brn')
      .eq('id', societe_id)
      .maybeSingle()

    const societeNom = sanitizeFilename(String(societe?.nom || 'Societe'))
    const tan = String(societe?.tan_societe || societe?.numero_tva_mra || '').trim()
    const ern = String(societe?.ern || '').trim()

    // Refus strict : société sans TAN → impossible de produire le Form 1.
    if (!tan) {
      return NextResponse.json(
        {
          error:
            `TAN (Tax Account Number) manquant pour "${societe?.nom || 'société inconnue'}". ` +
            `À renseigner dans /rh/societe avant export Form 1 TDS.`,
          code: 'missing_tan',
        },
        { status: 400 },
      )
    }

    const { data: bulletinsRaw, error: bErr } = await admin
      .from('bulletins_paie')
      .select('employe_id, periode, salaire_brut, eoy_bonus, paye')
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

    // Agrégation par employé
    const empIds = [...new Set(bulletins.map((b) => b.employe_id).filter(Boolean))]
    const empMap = new Map<string, EmployeRow>()
    if (empIds.length > 0) {
      const { data: emps } = await admin
        .from('employes')
        .select('id, nom, prenom, code, nic_number, nic, tan_number, tan')
        .in('id', empIds)
      for (const e of (emps || []) as EmployeRow[]) {
        empMap.set(e.id, e)
      }
    }

    const aggByEmp = new Map<string, EmployeeAgg>()
    for (const b of bulletins) {
      const current = aggByEmp.get(b.employe_id) || {
        emp: empMap.get(b.employe_id) || null,
        totalGross: 0,
        totalPaye: 0,
        totalEoy: 0,
        monthsWorked: 0,
      }
      current.totalGross += toNumber(b.salaire_brut)
      current.totalPaye += toNumber(b.paye)
      current.totalEoy += toNumber(b.eoy_bonus)
      current.monthsWorked += 1
      aggByEmp.set(b.employe_id, current)
    }

    const period = `${anneeFiscale}-${anneeFiscale + 1}`

    // --- CSV ---
    if (format === 'csv') {
      const header =
        'TAN_Employer;NIC;Nom;Prenom;Total_Salaire_Brut;Total_PAYE;Mois_Travailles;Periode_Debut;Periode_Fin'
      const lines: string[] = [header]
      for (const [, agg] of aggByEmp) {
        const emp = agg.emp
        const nic = emp?.nic_number || emp?.nic || ''
        lines.push(
          [
            escapeCsv(tan),
            escapeCsv(nic),
            escapeCsv(emp?.nom || ''),
            escapeCsv(emp?.prenom || ''),
            escapeCsv(formatAmountMra(agg.totalGross)),
            escapeCsv(formatAmountMra(agg.totalPaye)),
            escapeCsv(agg.monthsWorked),
            escapeCsv(debut),
            escapeCsv(fin),
          ].join(';'),
        )
      }
      const csv = addUtf8Bom(lines.join('\n') + '\n')
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="Form1_TDS_${societeNom}_${period}.csv"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    // --- XML ---
    if (format === 'xml') {
      const employeeBlocks: string[] = []
      for (const [, agg] of aggByEmp) {
        const emp = agg.emp
        const nic = emp?.nic_number || emp?.nic || ''
        const fullName = [emp?.prenom, emp?.nom].filter(Boolean).join(' ').trim() || emp?.code || ''
        employeeBlocks.push(
          `    <Employee>\n` +
          `      <NIC>${escapeXml(nic)}</NIC>\n` +
          `      <Name>${escapeXml(fullName)}</Name>\n` +
          `      <TotalGrossSalary>${formatAmountMra(agg.totalGross)}</TotalGrossSalary>\n` +
          `      <TotalPAYE>${formatAmountMra(agg.totalPaye)}</TotalPAYE>\n` +
          `      <TotalEOYBonus>${formatAmountMra(agg.totalEoy)}</TotalEOYBonus>\n` +
          `      <MonthsWorked>${agg.monthsWorked}</MonthsWorked>\n` +
          `    </Employee>\n`,
        )
      }
      const xmlBody =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<Form1 xmlns="http://mra.mu/form1/v1">\n` +
        `  <Employer>\n` +
        `    <TAN>${escapeXml(tan)}</TAN>\n` +
        `    <Name>${escapeXml(societe?.nom || '')}</Name>\n` +
        `    <ERN>${escapeXml(ern)}</ERN>\n` +
        `    <Period>${escapeXml(period)}</Period>\n` +
        `  </Employer>\n` +
        `  <Employees>\n` +
        employeeBlocks.join('') +
        `  </Employees>\n` +
        `</Form1>\n`
      const payload = addUtf8Bom(xmlBody)
      return new NextResponse(payload, {
        status: 200,
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Content-Disposition': `attachment; filename="Form1_TDS_${societeNom}_${period}.xml"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    // --- PDF (placeholder texte — à remplacer par rendu PDF réel) ---
    // Aucune dépendance PDF disponible : on retourne un "PDF-like" texte
    // clair indiquant qu'il faut intégrer un moteur PDF (pdfkit, puppeteer)
    // pour générer le document officiel.
    const textLines: string[] = []
    textLines.push(`MRA — Form 1 (Income Tax TDS / PAYE annuel)`)
    textLines.push(`Société : ${societe?.nom || ''}`)
    textLines.push(`TAN : ${tan}`)
    textLines.push(`ERN : ${ern}`)
    textLines.push(`Période fiscale : ${period} (${debut} → ${fin})`)
    textLines.push(`Nombre d'employés : ${aggByEmp.size}`)
    textLines.push('')
    textLines.push('NIC;Nom;Brut annuel;PAYE retenu;Mois')
    for (const [, agg] of aggByEmp) {
      const emp = agg.emp
      textLines.push(
        `${emp?.nic_number || emp?.nic || ''};` +
          `${emp?.prenom || ''} ${emp?.nom || ''};` +
          `${formatAmountMra(agg.totalGross)};` +
          `${formatAmountMra(agg.totalPaye)};` +
          `${agg.monthsWorked}`,
      )
    }
    textLines.push('')
    textLines.push(
      '[SCAFFOLD] Rendu PDF non implémenté — intégrer pdfkit/puppeteer pour produire le Form 1 officiel.',
    )
    const body = addUtf8Bom(textLines.join('\n') + '\n')
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="Form1_TDS_${societeNom}_${period}.txt"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur serveur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
