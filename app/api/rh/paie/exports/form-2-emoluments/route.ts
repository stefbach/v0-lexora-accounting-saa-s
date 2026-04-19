/**
 * GET /api/rh/paie/exports/form-2-emoluments
 *
 * Export officiel MRA — Form 2 (Statement of Emoluments).
 *
 * Form 2 MRA = récapitulatif annuel des émoluments par employé pour
 * l'année fiscale mauricienne (1er juillet → 30 juin). Sert de base à
 * la remise au salarié pour sa déclaration personnelle.
 *
 * ⚠️ SCAFFOLD — Le format ci-dessous (namespace http://mra.mu/form2/v1,
 *    libellés CSV, balises XML) est une approximation basée sur la
 *    structure type des Statements of Emoluments MRA. Le format, les
 *    champs obligatoires et les règles de validation DOIVENT être validés
 *    avec la spec officielle MRA Form 2 avant toute soumission réelle.
 *
 * Query params :
 *   - societe_id     (UUID, requis)
 *   - annee_fiscale  (number, requis ; année de début de l'exercice.
 *                     Ex : 2025 = FY juillet 2025 → juin 2026)
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
  salaire_base: number | string | null
  transport_allowance: number | string | null
  petrol_allowance: number | string | null
  special_allowance_1: number | string | null
  special_allowance_2: number | string | null
  special_allowance_3: number | string | null
  heures_sup_montant: number | string | null
  eoy_bonus: number | string | null
  other_refund: number | string | null
  increment_salaire: number | string | null
  departure_notice: number | string | null
  salaire_brut: number | string | null
  csg_salarie: number | string | null
  csg_bonus: number | string | null
  nsf_salarie: number | string | null
  paye: number | string | null
  salaire_net: number | string | null
}

interface EmployeRow {
  id: string
  nom: string | null
  prenom: string | null
  code: string | null
  nic_number: string | null
  nic?: string | null
  adresse: string | null
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
  salaireBase: number
  transport: number
  petrol: number
  phone: number
  specialAllowance1: number
  specialAllowance2: number
  specialAllowance3: number
  otPaye: number
  eoyBonus: number
  primesVariables: number
  totalEmoluments: number
  csgSalarie: number
  nsfSalarie: number
  paye: number
  netAnnuel: number
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

    if (!tan) {
      return NextResponse.json(
        {
          error:
            `TAN (Tax Account Number) manquant pour "${societe?.nom || 'société inconnue'}". ` +
            `À renseigner dans /rh/societe avant export Form 2 Emoluments.`,
          code: 'missing_tan',
        },
        { status: 400 },
      )
    }

    const { data: bulletinsRaw, error: bErr } = await admin
      .from('bulletins_paie')
      .select(
        'employe_id, periode, salaire_base, transport_allowance, petrol_allowance, ' +
          'special_allowance_1, special_allowance_2, special_allowance_3, ' +
          'heures_sup_montant, eoy_bonus, other_refund, increment_salaire, departure_notice, ' +
          'salaire_brut, csg_salarie, csg_bonus, nsf_salarie, paye, salaire_net',
      )
      .eq('societe_id', societe_id)
      .gte('periode', debut)
      .lte('periode', fin)

    if (bErr) {
      return NextResponse.json(
        { error: `Erreur bulletins_paie: ${bErr.message}` },
        { status: 500 },
      )
    }

    const bulletins: BulletinRow[] = (bulletinsRaw || []) as unknown as BulletinRow[]

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
        .select('id, nom, prenom, code, nic_number, nic, adresse')
        .in('id', empIds)
      for (const e of (emps || []) as EmployeRow[]) {
        empMap.set(e.id, e)
      }
    }

    // Convention :
    // - "phone allowance" n'a pas de colonne dédiée dans bulletins_paie ;
    //   on mappe sur `special_allowance_3` par convention (à confirmer avec
    //   le paramétrage de la société).
    // - "primes variables" = increment_salaire + other_refund + departure_notice.
    const aggByEmp = new Map<string, EmployeeAgg>()
    for (const b of bulletins) {
      const current =
        aggByEmp.get(b.employe_id) ||
        ({
          emp: empMap.get(b.employe_id) || null,
          salaireBase: 0,
          transport: 0,
          petrol: 0,
          phone: 0,
          specialAllowance1: 0,
          specialAllowance2: 0,
          specialAllowance3: 0,
          otPaye: 0,
          eoyBonus: 0,
          primesVariables: 0,
          totalEmoluments: 0,
          csgSalarie: 0,
          nsfSalarie: 0,
          paye: 0,
          netAnnuel: 0,
          monthsWorked: 0,
        } as EmployeeAgg)

      current.salaireBase += toNumber(b.salaire_base)
      current.transport += toNumber(b.transport_allowance)
      current.petrol += toNumber(b.petrol_allowance)
      current.specialAllowance1 += toNumber(b.special_allowance_1)
      current.specialAllowance2 += toNumber(b.special_allowance_2)
      current.specialAllowance3 += toNumber(b.special_allowance_3)
      current.phone += toNumber(b.special_allowance_3) // alias convention
      current.otPaye += toNumber(b.heures_sup_montant)
      current.eoyBonus += toNumber(b.eoy_bonus)
      current.primesVariables +=
        toNumber(b.increment_salaire) + toNumber(b.other_refund) + toNumber(b.departure_notice)
      current.totalEmoluments += toNumber(b.salaire_brut)
      current.csgSalarie += toNumber(b.csg_salarie) + toNumber(b.csg_bonus)
      current.nsfSalarie += toNumber(b.nsf_salarie)
      current.paye += toNumber(b.paye)
      current.netAnnuel += toNumber(b.salaire_net)
      current.monthsWorked += 1

      aggByEmp.set(b.employe_id, current)
    }

    const period = `${anneeFiscale}-${anneeFiscale + 1}`

    // --- CSV ---
    if (format === 'csv') {
      const header = [
        'TAN_Employer',
        'NIC',
        'Nom',
        'Prenom',
        'Adresse',
        'Salaire_Base_Annuel',
        'Transport_Allowance',
        'Petrol_Allowance',
        'Phone_Allowance',
        'Special_Allowance_1',
        'Special_Allowance_2',
        'Special_Allowance_3',
        'OT_Paye',
        'EOY_Bonus',
        'Primes_Variables',
        'Total_Emoluments',
        'CSG_Salarie',
        'NSF_Salarie',
        'PAYE_Retenu',
        'Net_Annuel',
        'Mois_Travailles',
        'Periode_Debut',
        'Periode_Fin',
      ].join(';')

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
            escapeCsv(emp?.adresse || ''),
            escapeCsv(formatAmountMra(agg.salaireBase)),
            escapeCsv(formatAmountMra(agg.transport)),
            escapeCsv(formatAmountMra(agg.petrol)),
            escapeCsv(formatAmountMra(agg.phone)),
            escapeCsv(formatAmountMra(agg.specialAllowance1)),
            escapeCsv(formatAmountMra(agg.specialAllowance2)),
            escapeCsv(formatAmountMra(agg.specialAllowance3)),
            escapeCsv(formatAmountMra(agg.otPaye)),
            escapeCsv(formatAmountMra(agg.eoyBonus)),
            escapeCsv(formatAmountMra(agg.primesVariables)),
            escapeCsv(formatAmountMra(agg.totalEmoluments)),
            escapeCsv(formatAmountMra(agg.csgSalarie)),
            escapeCsv(formatAmountMra(agg.nsfSalarie)),
            escapeCsv(formatAmountMra(agg.paye)),
            escapeCsv(formatAmountMra(agg.netAnnuel)),
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
          'Content-Disposition': `attachment; filename="Form2_Emoluments_${societeNom}_${period}.csv"`,
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
      employeeBlocks.push(
        `    <Employee>\n` +
        `      <NIC>${escapeXml(nic)}</NIC>\n` +
        `      <Name>${escapeXml(fullName)}</Name>\n` +
        `      <Address>${escapeXml(emp?.adresse || '')}</Address>\n` +
        `      <Emoluments>\n` +
        `        <BaseSalary>${formatAmountMra(agg.salaireBase)}</BaseSalary>\n` +
        `        <TransportAllowance>${formatAmountMra(agg.transport)}</TransportAllowance>\n` +
        `        <PetrolAllowance>${formatAmountMra(agg.petrol)}</PetrolAllowance>\n` +
        `        <PhoneAllowance>${formatAmountMra(agg.phone)}</PhoneAllowance>\n` +
        `        <SpecialAllowance1>${formatAmountMra(agg.specialAllowance1)}</SpecialAllowance1>\n` +
        `        <SpecialAllowance2>${formatAmountMra(agg.specialAllowance2)}</SpecialAllowance2>\n` +
        `        <SpecialAllowance3>${formatAmountMra(agg.specialAllowance3)}</SpecialAllowance3>\n` +
        `        <OvertimePaid>${formatAmountMra(agg.otPaye)}</OvertimePaid>\n` +
        `        <EOYBonus>${formatAmountMra(agg.eoyBonus)}</EOYBonus>\n` +
        `        <VariableBonuses>${formatAmountMra(agg.primesVariables)}</VariableBonuses>\n` +
        `        <TotalEmoluments>${formatAmountMra(agg.totalEmoluments)}</TotalEmoluments>\n` +
        `      </Emoluments>\n` +
        `      <Deductions>\n` +
        `        <CSGEmployee>${formatAmountMra(agg.csgSalarie)}</CSGEmployee>\n` +
        `        <NSFEmployee>${formatAmountMra(agg.nsfSalarie)}</NSFEmployee>\n` +
        `        <PAYE>${formatAmountMra(agg.paye)}</PAYE>\n` +
        `      </Deductions>\n` +
        `      <NetAnnual>${formatAmountMra(agg.netAnnuel)}</NetAnnual>\n` +
        `      <MonthsWorked>${agg.monthsWorked}</MonthsWorked>\n` +
        `    </Employee>\n`,
      )
    }
    const xmlBody =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<Form2 xmlns="http://mra.mu/form2/v1">\n` +
      `  <Employer>\n` +
      `    <TAN>${escapeXml(tan)}</TAN>\n` +
      `    <Name>${escapeXml(societe?.nom || '')}</Name>\n` +
      `    <ERN>${escapeXml(ern)}</ERN>\n` +
      `    <Period>${escapeXml(period)}</Period>\n` +
      `  </Employer>\n` +
      `  <Employees>\n` +
      employeeBlocks.join('') +
      `  </Employees>\n` +
      `</Form2>\n`
    const payload = addUtf8Bom(xmlBody)
    return new NextResponse(payload, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="Form2_Emoluments_${societeNom}_${period}.xml"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur serveur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
