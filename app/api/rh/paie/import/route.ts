import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const MONTHS: Record<string, string> = {
  jan: '01', january: '01', janvier: '01', feb: '02', february: '02', fevrier: '02', février: '02',
  mar: '03', march: '03', mars: '03', apr: '04', april: '04', avril: '04',
  may: '05', mai: '05', jun: '06', june: '06', juin: '06',
  jul: '07', july: '07', juillet: '07', aug: '08', august: '08', aout: '08', août: '08',
  sep: '09', sept: '09', september: '09', septembre: '09', oct: '10', october: '10', octobre: '10',
  nov: '11', november: '11', novembre: '11', dec: '12', december: '12', decembre: '12', décembre: '12',
}

// Extract period (YYYY-MM) from any text (filename, title row, sheet name)
function extractPeriod(texts: string[]): string | null {
  for (const text of texts) {
    if (!text) continue
    const s = text.toLowerCase()

    // "Jul 2025", "July 2025", "Juillet 2025"
    for (const [name, num] of Object.entries(MONTHS)) {
      const re = new RegExp(`${name}\\w*\\s*(\\d{4})`, 'i')
      const m = s.match(re)
      if (m) return `${m[1]}-${num}`
    }
    // "2025-07", "07/2025", "07-2025"
    const ymd = s.match(/(\d{4})[-/](\d{2})/)
    if (ymd) return `${ymd[1]}-${ymd[2]}`
    const dmy = s.match(/(\d{2})[-/](\d{4})/)
    if (dmy) return `${dmy[2]}-${dmy[1]}`
  }
  return null
}

// Normalize column name to our field
function normalizeHeader(h: string, prevRowCell?: string): string {
  let label = String(h || '').trim()
  // If header empty, use cell from row above
  if (!label && prevRowCell) label = String(prevRowCell).trim()
  // If previous row has [ER] prefix, combine
  const prev = String(prevRowCell || '').trim()
  if (prev.match(/^\[?ER\]?\s/i) || prev.match(/^\d{4}$/)) {
    label = prev.replace(/[[\]]/g, '') + (label ? ' ' + label : '')
  }

  const s = label.toLowerCase().replace(/\s+/g, '_').replace(/[()@.#[\]]/g, '').replace(/__+/g, '_').replace(/^_|_$/g, '')

  const MAP: Record<string, string> = {
    'code': 'code', 'employee_code': 'code', 'employe_code': 'code', 'emp_code': 'code',
    'last_name': 'nom', 'lastname': 'nom', 'nom': 'nom', 'name': 'nom', 'family_name': 'nom',
    'first_name': 'prenom', 'firstname': 'prenom', 'prenom': 'prenom',
    'job': 'poste', 'poste': 'poste', 'position': 'poste',
    'department': 'departement', 'departement': 'departement',
    'arr_date': 'date_arrivee', 'arrival_date': 'date_arrivee', 'date_arrivee': 'date_arrivee',
    'dep_date': 'date_depart', 'departure_date': 'date_depart',
    'basic_salary': 'salaire_base', 'salaire_base': 'salaire_base', 'salary': 'salaire_base', 'base_salary': 'salaire_base',
    // Earnings
    'overtime': 'heures_sup', 'overtime_15x': 'heures_sup', 'ot': 'heures_sup', 'heures_sup': 'heures_sup',
    'special_allowance': 'special_allowance_1', 'allowance': 'special_allowance_1',
    'internet_allowance': 'internet_allowance', 'internet': 'internet_allowance',
    'prime_production': 'prime_production', 'production': 'prime_production',
    'on_call_allowance': 'on_call_allowance', 'on_call': 'on_call_allowance',
    'prime_tl': 'prime_tl',
    'electricity_allowance': 'electricity_allowance', 'electricity': 'electricity_allowance',
    'meal_allowance': 'meal_allowance', 'meal': 'meal_allowance',
    // Totals
    'total_payments': 'salaire_brut', 'salaire_brut': 'salaire_brut', 'gross': 'salaire_brut', 'gross_pay': 'salaire_brut',
    'absence_deductions': 'montant_absence', 'absence': 'montant_absence', 'deductions_absence': 'montant_absence',
    'total_deductions': 'total_deductions',
    // Employee deductions
    'csg': 'csg_salarie', 'csg_salarie': 'csg_salarie',
    'nsf': 'nsf_salarie', 'nsf_salarie': 'nsf_salarie',
    'paye': 'paye', 'tax': 'paye', 'income_tax': 'paye',
    'net_pay': 'salaire_net', 'netpay': 'salaire_net', 'net': 'salaire_net', 'salaire_net': 'salaire_net',
    // Employer contributions (ER columns)
    'er_4010': 'csg_patronal', 'er_4010_csg': 'csg_patronal', '4010': 'csg_patronal', 'csg_patronal': 'csg_patronal', 'er_csg': 'csg_patronal',
    'er_4100': 'nsf_patronal', 'er_4100_nsf': 'nsf_patronal', '4100': 'nsf_patronal', 'nsf_patronal': 'nsf_patronal', 'er_nsf': 'nsf_patronal',
    'er_4200': 'training_levy', 'er_4200_levy': 'training_levy', '4200': 'training_levy', 'training_levy': 'training_levy', 'er_levy': 'training_levy', 'levy': 'training_levy',
    'er_7900': 'prgf', 'er_7900_prgf': 'prgf', '7900': 'prgf', 'prgf': 'prgf', 'er_prgf': 'prgf',
    'total_er_contributions': 'total_charges_patronales', 'total_charges_patronales': 'total_charges_patronales', 'er_total': 'total_charges_patronales',
    // Numeric columns that are amounts (1000, 1100, 3010, etc.)
    '1000': 'col_1000', '1100': 'col_1100', '3010': 'col_3010', '3170': 'col_3170',
    '3200': 'col_3200', '3220': 'col_3220', '3230': 'col_3230', '3250': 'col_3250',
    '3510': 'col_3510', '3900': 'col_3900', '5000': 'col_5000',
  }

  // Try direct match first
  if (MAP[s]) return MAP[s]
  // Try partial match
  for (const [key, val] of Object.entries(MAP)) {
    if (s.includes(key) && key.length > 3) return val
  }
  return s
}

function parseNumber(val: any): number {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return val
  const n = parseFloat(String(val).replace(/\s/g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}

function parseDate(val: any): string | null {
  if (!val) return null
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400 * 1000)
    return d.toISOString().split('T')[0]
  }
  if (val instanceof Date) return val.toISOString().split('T')[0]
  const s = String(val).trim()
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10)
  return null
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const societe_id = formData.get('societe_id') as string | null
    const periodeOverride = formData.get('periode') as string | null

    if (!file) return NextResponse.json({ error: 'Fichier requis' }, { status: 400 })
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const fileArrayBuffer = await file.arrayBuffer()
    const ext = file.name.split('.').pop()?.toLowerCase()
    let rawRows: Record<string, any>[] = []
    let headers: string[] = []
    let titleTexts: string[] = [file.name] // for period detection
    let sheetName = ''

    if (ext === 'xlsx' || ext === 'xls') {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(fileArrayBuffer, { type: 'array', cellDates: true, cellText: false })
      sheetName = wb.SheetNames[0]
      titleTexts.push(sheetName)
      const ws = wb.Sheets[sheetName]
      const allRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      // Scan first rows for title text (period info) and header row
      let headerRowIdx = -1
      for (let i = 0; i < Math.min(allRows.length, 10); i++) {
        const rowStrs = allRows[i].map((c: any) => String(c).toLowerCase())

        // Collect title text for period detection
        const rowText = allRows[i].map((c: any) => String(c || '')).join(' ')
        titleTexts.push(rowText)

        // Find header row: contains "Code" or "Last name" or "Nom" or "Basic Salary"
        if (headerRowIdx < 0 && rowStrs.some(c =>
          c === 'code' || c.includes('last name') || c === 'nom' ||
          c.includes('basic salary') || c.includes('salaire') || c.includes('first name') || c === 'prenom'
        )) {
          headerRowIdx = i
        }
      }

      if (headerRowIdx < 0) {
        // Last resort: use first non-empty row as header
        headerRowIdx = allRows.findIndex(r => r && r.some((c: any) => String(c).trim()))
        if (headerRowIdx < 0) return NextResponse.json({ error: 'Impossible de trouver les en-têtes dans le fichier', title_texts: titleTexts }, { status: 400 })
      }

      // Build headers — merge with row above if multi-line headers
      const headerRow = allRows[headerRowIdx] || []
      const prevRow = headerRowIdx > 0 ? allRows[headerRowIdx - 1] : []

      headers = headerRow.map((h: any, idx: number) => normalizeHeader(String(h || ''), prevRow[idx] ? String(prevRow[idx]) : undefined))

      // Data rows
      for (let i = headerRowIdx + 1; i < allRows.length; i++) {
        const row = allRows[i]
        if (!row || row.length === 0) continue
        const firstCell = String(row[0] || '').trim()
        if (!firstCell || firstCell.toLowerCase() === 'total') continue

        const obj: Record<string, any> = {}
        headers.forEach((h, idx) => { if (h) obj[h] = row[idx] })
        rawRows.push(obj)
      }
    } else {
      // CSV
      const text = Buffer.from(fileArrayBuffer).toString('utf-8')
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) return NextResponse.json({ error: 'Fichier vide' }, { status: 400 })

      // Collect all lines for period detection
      lines.slice(0, 5).forEach(l => titleTexts.push(l))

      const sep = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ','

      // Find header row
      let headerRowIdx = 0
      for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const lower = lines[i].toLowerCase()
        if (lower.includes('code') || lower.includes('nom') || lower.includes('salary') || lower.includes('last name')) {
          headerRowIdx = i
          break
        }
      }

      headers = lines[headerRowIdx].split(sep).map(h => normalizeHeader(h.replace(/"/g, '')))

      for (let i = headerRowIdx + 1; i < lines.length; i++) {
        const vals = lines[i].split(sep).map(v => v.trim().replace(/"/g, ''))
        if (vals.length < 2) continue
        const firstCell = vals[0]?.trim()
        if (!firstCell || firstCell.toLowerCase() === 'total') continue

        const obj: Record<string, any> = {}
        headers.forEach((h, idx) => { if (h) obj[h] = vals[idx] || '' })
        rawRows.push(obj)
      }
    }

    if (rawRows.length === 0) {
      return NextResponse.json({ error: 'Aucune ligne de données trouvée', headers_detected: headers, title_texts: titleTexts.slice(0, 5) }, { status: 400 })
    }

    // Determine period
    let periode = periodeOverride || ''
    if (!periode) {
      periode = extractPeriod(titleTexts) || ''
    }
    if (periode && periode.length === 7) periode = `${periode}-01`
    if (periode && !/^\d{4}-\d{2}/.test(periode)) periode = ''

    // Fetch existing employees
    const { data: employes } = await supabase
      .from('employes').select('id, code, nom, prenom').eq('societe_id', societe_id)

    const empByCode = new Map<string, any>()
    const empByName = new Map<string, any>()
    for (const e of employes || []) {
      if (e.code) empByCode.set(e.code.trim().toLowerCase(), e)
      const key = `${(e.nom || '').trim()} ${(e.prenom || '').trim()}`.toLowerCase().trim()
      if (key) empByName.set(key, e)
    }

    const imported: string[] = []
    const created: string[] = []
    const errors: string[] = []

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i]
      const lineNum = i + 1
      const code = String(row.code || '').trim()
      const nom = String(row.nom || '').trim()
      const prenom = String(row.prenom || '').trim()

      // Find or create employee
      let emp = code ? empByCode.get(code.toLowerCase()) : null
      if (!emp && nom) emp = empByName.get(`${nom} ${prenom}`.toLowerCase().trim())

      if (!emp && (nom || prenom)) {
        // Auto-create employee
        const newCode = code || `IMP${String(i + 1).padStart(3, '0')}`
        const newEmp: Record<string, any> = {
          societe_id, code: newCode,
          nom: nom || 'INCONNU', prenom: prenom || '',
          poste: String(row.poste || '').trim() || null,
          salaire_base: parseNumber(row.salaire_base),
          devise_salaire: 'MUR',
          date_arrivee: parseDate(row.date_arrivee) || new Date().toISOString().split('T')[0],
        }
        const { data: created_emp, error: empErr } = await supabase
          .from('employes').insert(newEmp).select('id, code, nom, prenom').single()
        if (empErr) {
          errors.push(`Ligne ${lineNum} (${nom} ${prenom}): création employé échouée — ${empErr.message}`)
          continue
        }
        emp = created_emp
        empByCode.set(newCode.toLowerCase(), emp)
        created.push(`${nom} ${prenom} (${newCode})`)
      }

      if (!emp) {
        errors.push(`Ligne ${lineNum}: employé non trouvé (code="${code}", nom="${nom} ${prenom}")`)
        continue
      }

      if (!periode) {
        errors.push(`Ligne ${lineNum}: période non détectée — renseignez-la dans le formulaire`)
        continue
      }

      // Build bulletin with ALL available fields
      const salaire_base = parseNumber(row.salaire_base)
      const heures_sup = parseNumber(row.heures_sup)
      const special1 = parseNumber(row.special_allowance_1)
      const internet = parseNumber(row.internet_allowance)
      const primeProd = parseNumber(row.prime_production)
      const onCall = parseNumber(row.on_call_allowance)
      const electricity = parseNumber(row.electricity_allowance)
      const meal = parseNumber(row.meal_allowance)
      const primeTl = parseNumber(row.prime_tl)

      const salaire_brut = parseNumber(row.salaire_brut) ||
        (salaire_base + heures_sup + special1 + internet + primeProd + onCall + electricity + meal + primeTl)

      const montant_absence = parseNumber(row.montant_absence)
      const csg_salarie = parseNumber(row.csg_salarie)
      const nsf_salarie = parseNumber(row.nsf_salarie)
      const paye = parseNumber(row.paye)
      const salaire_net = parseNumber(row.salaire_net) || (salaire_brut - montant_absence - csg_salarie - nsf_salarie - paye)

      const csg_patronal = parseNumber(row.csg_patronal)
      const nsf_patronal = parseNumber(row.nsf_patronal)
      const training_levy = parseNumber(row.training_levy)
      const prgf = parseNumber(row.prgf)
      const total_charges = parseNumber(row.total_charges_patronales) || (csg_patronal + nsf_patronal + training_levy + prgf)

      const bulletin: Record<string, any> = {
        employe_id: emp.id,
        societe_id,
        periode,
        salaire_base,
        salaire_brut,
        salaire_net,
        heures_sup_montant: heures_sup,
        special_allowance_1: special1,
        montant_absence,
        csg_salarie, csg_patronal,
        nsf_salarie, nsf_patronal,
        paye, training_levy,
        total_deductions: csg_salarie + nsf_salarie + paye + montant_absence,
        total_charges_patronales: total_charges,
        cout_total_employeur: salaire_brut + total_charges,
        statut: 'brouillon',
        notes: `Importé depuis ${file.name} | ${nom} ${prenom}`,
      }

      const { error: bulErr } = await supabase
        .from('bulletins_paie').upsert(bulletin, { onConflict: 'employe_id,periode' })

      if (bulErr) {
        errors.push(`Ligne ${lineNum} (${nom} ${prenom}): ${bulErr.message}`)
      } else {
        imported.push(`${code || ''} ${nom} ${prenom}`.trim())
      }
    }

    return NextResponse.json({
      imported: imported.length,
      created_employees: created.length,
      created_employees_list: created,
      imported_list: imported,
      errors,
      total_rows: rawRows.length,
      periode_detected: periode || 'non détectée',
      headers_detected: headers,
      source_info: { filename: file.name, sheet: sheetName || 'CSV', title_texts: titleTexts.slice(0, 3) },
    })
  } catch (e: any) {
    console.error('[paie/import]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
