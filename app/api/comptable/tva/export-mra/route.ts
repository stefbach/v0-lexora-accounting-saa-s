/**
 * GET /api/comptable/tva/export-mra
 *
 * Export officiel VAT3 MRA — scaffold CSV/XML des 9 boxes TVA.
 *
 * ⚠️ SCAFFOLD — Le format ci-dessous est une approximation basée sur la
 *    structure attendue par la MRA. Les balises exactes, l'espace de noms
 *    XML, la liste des champs obligatoires et l'ordre des colonnes CSV
 *    DOIVENT être validés avec la spec officielle MRA (VAT3 return)
 *    avant toute mise en production ou soumission réelle.
 *
 * Query params :
 *   - societe_id (UUID, requis)
 *   - periode    (YYYY-MM, requis)
 *   - format     (csv | xml, default csv)
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
  formatDateMra,
  escapeXml,
  escapeCsv,
  addUtf8Bom,
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

interface TvaBoxes {
  box1_output_standard: number
  box2_exports_taxable: number
  box3_exempt_supplies: number
  box4_reverse_charge_output: number
  box5_reverse_charge_input: number
  box6_exports_zero_rated: number
  box7_capital_goods: number
  box8_bad_debt_relief: number
  box9_input_other: number
  tva_collectee: number
  tva_deductible: number
  tva_nette: number
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
    const format = (searchParams.get('format') || 'csv').toLowerCase()

    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }
    if (!periode || !/^\d{4}-\d{2}$/.test(periode)) {
      return NextResponse.json({ error: 'periode (YYYY-MM) requise' }, { status: 400 })
    }
    if (format !== 'csv' && format !== 'xml') {
      return NextResponse.json({ error: 'format doit être csv ou xml' }, { status: 400 })
    }

    const admin = getAdminClient()

    // Access control — même règle que pour le reste du module société.
    try {
      await assertSocieteAccess(admin, user.id, societe_id)
    } catch (e) {
      const mapped = mapSocieteAccessError(e)
      if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
      throw e
    }

    // 1) Fetch la déclaration TVA pour la période
    const { data: tvaRow, error: tvaErr } = await admin
      .from('tva_mensuelle')
      .select('*')
      .eq('societe_id', societe_id)
      .eq('periode', periode)
      .maybeSingle()

    if (tvaErr) {
      return NextResponse.json(
        { error: `Erreur tva_mensuelle: ${tvaErr.message}` },
        { status: 500 },
      )
    }

    // Fallback gracieux : si pas de ligne, on génère un fichier avec boxes à 0
    // pour que l'export ne crash pas (le comptable peut ainsi récupérer un
    // squelette même avant calcul).
    const boxes: TvaBoxes = {
      box1_output_standard: toNumber(tvaRow?.box1_output_standard ?? tvaRow?.tva_collectee),
      box2_exports_taxable: toNumber(tvaRow?.box2_exports_taxable),
      box3_exempt_supplies: toNumber(tvaRow?.box3_exempt_supplies),
      box4_reverse_charge_output: toNumber(tvaRow?.box4_reverse_charge_output),
      box5_reverse_charge_input: toNumber(tvaRow?.box5_reverse_charge_input),
      box6_exports_zero_rated: toNumber(tvaRow?.box6_exports_zero_rated),
      box7_capital_goods: toNumber(tvaRow?.box7_capital_goods),
      box8_bad_debt_relief: toNumber(tvaRow?.box8_bad_debt_relief),
      box9_input_other: toNumber(tvaRow?.box9_input_other ?? tvaRow?.tva_deductible),
      tva_collectee: toNumber(tvaRow?.tva_collectee),
      tva_deductible: toNumber(tvaRow?.tva_deductible),
      tva_nette: toNumber(tvaRow?.tva_nette),
    }

    // 2) Fetch société (VAT number + TAN + nom)
    const { data: societe } = await admin
      .from('societes')
      .select('nom, numero_tva_mra, brn, ern')
      .eq('id', societe_id)
      .maybeSingle()

    // Robustesse : refuser de générer un export vide si la société n'a
    // aucun identifiant MRA. Un VAT3 sans VATNumber/TAN/ERN serait rejeté
    // côté MRA, autant rendre l'erreur visible au caller.
    if (!societe?.numero_tva_mra && !societe?.ern && !societe?.brn) {
      return NextResponse.json(
        {
          error:
            'La société doit avoir au moins un identifiant MRA (VAT number, ERN ou BRN) pour générer un export VAT3.',
          code: 'missing_mra_identifier',
        },
        { status: 400 },
      )
    }

    const societeNom = sanitizeFilename(String(societe?.nom || 'Societe'))
    const vatNumber = String(societe?.numero_tva_mra || '')
    // Pas de colonne TAN dédiée sur `societes` — on retombe sur ERN puis BRN
    // (le TAN MRA peut être distinct ; à ajuster quand la colonne existera).
    const tan = String(societe?.ern || societe?.brn || '')
    const declarationDate = formatDateMra(new Date())

    // NetVAT = output - input (formule standard VAT3 simplifiée)
    const netVat =
      boxes.box1_output_standard + boxes.box4_reverse_charge_output -
      boxes.box5_reverse_charge_input -
      boxes.box7_capital_goods -
      boxes.box8_bad_debt_relief -
      boxes.box9_input_other

    // 3) Génération du fichier selon le format
    if (format === 'xml') {
      const xmlBody =
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<VATReturn xmlns="http://mra.mu/vat3">\n` +
        `  <VATNumber>${escapeXml(vatNumber)}</VATNumber>\n` +
        `  <TAN>${escapeXml(tan)}</TAN>\n` +
        `  <Period>${escapeXml(periode)}</Period>\n` +
        `  <Box1_OutputVAT>${formatAmountMra(boxes.box1_output_standard)}</Box1_OutputVAT>\n` +
        `  <Box2_Exports>${formatAmountMra(boxes.box2_exports_taxable)}</Box2_Exports>\n` +
        `  <Box3_ExemptSupplies>${formatAmountMra(boxes.box3_exempt_supplies)}</Box3_ExemptSupplies>\n` +
        `  <Box4_ReverseChargeOutput>${formatAmountMra(boxes.box4_reverse_charge_output)}</Box4_ReverseChargeOutput>\n` +
        `  <Box5_ReverseChargeInput>${formatAmountMra(boxes.box5_reverse_charge_input)}</Box5_ReverseChargeInput>\n` +
        `  <Box6_ZeroRated>${formatAmountMra(boxes.box6_exports_zero_rated)}</Box6_ZeroRated>\n` +
        `  <Box7_CapitalGoods>${formatAmountMra(boxes.box7_capital_goods)}</Box7_CapitalGoods>\n` +
        `  <Box8_BadDebtRelief>${formatAmountMra(boxes.box8_bad_debt_relief)}</Box8_BadDebtRelief>\n` +
        `  <Box9_OtherInputVAT>${formatAmountMra(boxes.box9_input_other)}</Box9_OtherInputVAT>\n` +
        `  <NetVAT>${formatAmountMra(netVat)}</NetVAT>\n` +
        `  <Declaration_Date>${escapeXml(declarationDate)}</Declaration_Date>\n` +
        `</VATReturn>\n`
      const payload = addUtf8Bom(xmlBody)
      return new NextResponse(payload, {
        status: 200,
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Content-Disposition': `attachment; filename="VAT3_${societeNom}_${periode}.xml"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    // format === 'csv' (séparateur `;` pour FR/MU, compatible Excel)
    const header = [
      'VATNumber',
      'TAN',
      'Period',
      'Box1_OutputVAT',
      'Box2_Exports',
      'Box3_ExemptSupplies',
      'Box4_ReverseChargeOutput',
      'Box5_ReverseChargeInput',
      'Box6_ZeroRated',
      'Box7_CapitalGoods',
      'Box8_BadDebtRelief',
      'Box9_OtherInputVAT',
      'NetVAT',
      'Declaration_Date',
    ]
    const row = [
      vatNumber,
      tan,
      periode,
      formatAmountMra(boxes.box1_output_standard),
      formatAmountMra(boxes.box2_exports_taxable),
      formatAmountMra(boxes.box3_exempt_supplies),
      formatAmountMra(boxes.box4_reverse_charge_output),
      formatAmountMra(boxes.box5_reverse_charge_input),
      formatAmountMra(boxes.box6_exports_zero_rated),
      formatAmountMra(boxes.box7_capital_goods),
      formatAmountMra(boxes.box8_bad_debt_relief),
      formatAmountMra(boxes.box9_input_other),
      formatAmountMra(netVat),
      declarationDate,
    ]

    const csvBody =
      header.map(escapeCsv).join(';') + '\n' +
      row.map(escapeCsv).join(';') + '\n'
    const payload = addUtf8Bom(csvBody)
    return new NextResponse(payload, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="VAT3_${societeNom}_${periode}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur serveur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
