/**
 * GET /api/rh/paie/export-dsn
 *
 * Export officiel DSN (Déclaration Sociale Nominative) MRA — scaffold XML
 * contenant le détail par employé des cotisations CSG/NSF/PAYE/PRGF et
 * les totaux récapitulatifs pour la période.
 *
 * ⚠️ SCAFFOLD — Le format ci-dessous (namespace http://mra.mu/dsn/v1,
 *    liste des balises, formats de dates/montants) est une approximation
 *    basée sur la structure type des déclarations sociales MRA. Les
 *    balises exactes, l'espace de noms XML, les champs obligatoires et
 *    les règles de validation DOIVENT être validés avec la spec
 *    officielle MRA/DSN avant toute soumission réelle.
 *
 * Query params :
 *   - societe_id (UUID, requis)
 *   - periode    (YYYY-MM, requis)
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
  addUtf8Bom,
} from '@/lib/exports/mra-format-helpers'
import { lastDayOfMonth } from '@/lib/rh/period'

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
  salaire_brut: number | string | null
  csg_salarie: number | string | null
  csg_bonus: number | string | null
  csg_patronal: number | string | null
  csg_patronal_bonus: number | string | null
  nsf_salarie: number | string | null
  nsf_patronal: number | string | null
  paye: number | string | null
  prgf: number | string | null
  nit_credit?: number | string | null
}

interface EmployeRow {
  id: string
  nom: string | null
  prenom: string | null
  code: string | null
  nic_number: string | null
  nic: string | null
}

function toNumber(v: unknown): number {
  if (v == null) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function sanitizeFilename(s: string): string {
  return (s || 'Societe').replace(/[^a-zA-Z0-9_-]/g, '_')
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
    const periode = searchParams.get('periode') // YYYY-MM

    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }
    if (!periode || !/^\d{4}-\d{2}$/.test(periode)) {
      return NextResponse.json({ error: 'periode (YYYY-MM) requise' }, { status: 400 })
    }

    const admin = getAdminClient()

    // Access control
    try {
      await assertSocieteAccess(admin, user.id, societe_id)
    } catch (e) {
      const mapped = mapSocieteAccessError(e)
      if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
      throw e
    }

    // 1) Fetch société pour ERN / TAN / Nom
    const { data: societe } = await admin
      .from('societes')
      .select('nom, ern, numero_tva_mra, brn')
      .eq('id', societe_id)
      .maybeSingle()

    const societeNom = sanitizeFilename(String(societe?.nom || 'Societe'))
    const ern = String(societe?.ern || '')
    // Pas de colonne `tan` dédiée société — on retombe sur le numéro TVA
    // MRA, souvent équivalent en pratique (à reconfirmer avec la spec).
    const tan = String(societe?.numero_tva_mra || '')

    // 2) Fetch bulletins de la période (fallback gracieux si vide)
    const { data: bulletinsRaw, error: bErr } = await admin
      .from('bulletins_paie')
      .select(
        'employe_id, salaire_brut, csg_salarie, csg_bonus, csg_patronal, csg_patronal_bonus, nsf_salarie, nsf_patronal, paye, prgf',
      )
      .eq('societe_id', societe_id)
      .gte('periode', `${periode}-01`)
      .lte('periode', lastDayOfMonth(periode))

    if (bErr) {
      return NextResponse.json(
        { error: `Erreur bulletins_paie: ${bErr.message}` },
        { status: 500 },
      )
    }

    const bulletins: BulletinRow[] = (bulletinsRaw || []) as BulletinRow[]

    // Robustesse : refuser de générer une DSN vide. Un XML avec
    // `<Employees></Employees>` serait accepté par le parseur mais rejeté
    // par le contrôle métier MRA ; autant surfacer l'erreur au caller.
    if (bulletins.length === 0) {
      return NextResponse.json(
        {
          error: `Aucun bulletin de paie trouvé pour la période ${periode}.`,
          code: 'no_bulletins_found',
        },
        { status: 400 },
      )
    }

    // 3) Fetch employés référencés
    const empIds = [...new Set(bulletins.map((b) => b.employe_id).filter(Boolean))]
    let empMap = new Map<string, EmployeRow>()
    if (empIds.length > 0) {
      const { data: emps } = await admin
        .from('employes')
        .select('id, nom, prenom, code, nic_number, nic')
        .in('id', empIds)
      for (const e of (emps || []) as EmployeRow[]) {
        empMap.set(e.id, e)
      }
    }

    // 4) Construction XML
    const employeeBlocks: string[] = []
    let totalCsgSal = 0
    let totalCsgPat = 0
    let totalNsfSal = 0
    let totalNsfPat = 0
    let totalPaye = 0
    let totalPrgf = 0
    let totalBrut = 0

    for (const b of bulletins) {
      const emp = empMap.get(b.employe_id)
      const brut = toNumber(b.salaire_brut)
      const csgSal = toNumber(b.csg_salarie) + toNumber(b.csg_bonus)
      const csgPat = toNumber(b.csg_patronal) + toNumber(b.csg_patronal_bonus)
      const nsfSal = toNumber(b.nsf_salarie)
      const nsfPat = toNumber(b.nsf_patronal)
      const paye = toNumber(b.paye)
      const prgf = toNumber(b.prgf)
      const nitCredit = toNumber(b.nit_credit)

      totalBrut += brut
      totalCsgSal += csgSal
      totalCsgPat += csgPat
      totalNsfSal += nsfSal
      totalNsfPat += nsfPat
      totalPaye += paye
      totalPrgf += prgf

      const nic = emp?.nic_number || emp?.nic || ''
      const fullName = [emp?.prenom, emp?.nom].filter(Boolean).join(' ').trim() || (emp?.code || '')

      employeeBlocks.push(
        `    <Employee>\n` +
        `      <NIC>${escapeXml(nic)}</NIC>\n` +
        `      <Name>${escapeXml(fullName)}</Name>\n` +
        `      <GrossSalary>${formatAmountMra(brut)}</GrossSalary>\n` +
        `      <CSGEmployee>${formatAmountMra(csgSal)}</CSGEmployee>\n` +
        `      <CSGEmployer>${formatAmountMra(csgPat)}</CSGEmployer>\n` +
        `      <NSFEmployee>${formatAmountMra(nsfSal)}</NSFEmployee>\n` +
        `      <NSFEmployer>${formatAmountMra(nsfPat)}</NSFEmployer>\n` +
        `      <PAYE>${formatAmountMra(paye)}</PAYE>\n` +
        `      <PRGF>${formatAmountMra(prgf)}</PRGF>\n` +
        `      <NITCredit>${formatAmountMra(nitCredit)}</NITCredit>\n` +
        `    </Employee>\n`,
      )
    }

    const xmlBody =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<DSN xmlns="http://mra.mu/dsn/v1">\n` +
      `  <Employer>\n` +
      `    <TAN>${escapeXml(tan)}</TAN>\n` +
      `    <Name>${escapeXml(societe?.nom || '')}</Name>\n` +
      `    <ERN>${escapeXml(ern)}</ERN>\n` +
      `  </Employer>\n` +
      `  <Period>${escapeXml(periode)}</Period>\n` +
      `  <Employees>\n` +
      employeeBlocks.join('') +
      `  </Employees>\n` +
      `  <Totals>\n` +
      `    <EmployeeCount>${bulletins.length}</EmployeeCount>\n` +
      `    <TotalGrossSalary>${formatAmountMra(totalBrut)}</TotalGrossSalary>\n` +
      `    <TotalCSGEmployee>${formatAmountMra(totalCsgSal)}</TotalCSGEmployee>\n` +
      `    <TotalCSGEmployer>${formatAmountMra(totalCsgPat)}</TotalCSGEmployer>\n` +
      `    <TotalNSFEmployee>${formatAmountMra(totalNsfSal)}</TotalNSFEmployee>\n` +
      `    <TotalNSFEmployer>${formatAmountMra(totalNsfPat)}</TotalNSFEmployer>\n` +
      `    <TotalPAYE>${formatAmountMra(totalPaye)}</TotalPAYE>\n` +
      `    <TotalPRGF>${formatAmountMra(totalPrgf)}</TotalPRGF>\n` +
      `  </Totals>\n` +
      `</DSN>\n`

    const payload = addUtf8Bom(xmlBody)
    return new NextResponse(payload, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="DSN_${societeNom}_${periode}.xml"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur serveur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
