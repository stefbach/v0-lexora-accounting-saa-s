import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Normalize header names to match our DB fields
function normalizeHeader(h: string): string {
  const s = h.trim().toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[()@.]/g, '')
    .replace(/\//g, '_')
    .replace(/__+/g, '_')
    .replace(/^_|_$/g, '')

  // Map common variations
  const MAP: Record<string, string> = {
    'code': 'code',
    'employee_code': 'code',
    'employe_code': 'code',
    'last_name': 'nom',
    'lastname': 'nom',
    'nom': 'nom',
    'first_name': 'prenom',
    'firstname': 'prenom',
    'prenom': 'prenom',
    'job': 'poste',
    'poste': 'poste',
    'department': 'departement',
    'arr_date': 'date_arrivee',
    'arrival_date': 'date_arrivee',
    'date_arrivee': 'date_arrivee',
    'dep_date': 'date_depart',
    'departure_date': 'date_depart',
    'basic_salary': 'salaire_base',
    'salaire_base': 'salaire_base',
    'salary': 'salaire_base',
    'overtime_15x': 'heures_sup',
    'overtime': 'heures_sup',
    'heures_sup': 'heures_sup',
    'special_allowance': 'special_allowance_1',
    'internet_allowance': 'internet_allowance',
    'prime_production': 'prime_production',
    'on_call_allowance': 'on_call_allowance',
    'prime_tl': 'prime_tl',
    'electricity_allowance': 'electricity_allowance',
    'meal_allowance': 'meal_allowance',
    'total_payments': 'salaire_brut',
    'salaire_brut': 'salaire_brut',
    'absence_deductions': 'montant_absence',
    'total_deductions': 'total_deductions',
    'csg': 'csg_salarie',
    'csg_salarie': 'csg_salarie',
    'nsf': 'nsf_salarie',
    'nsf_salarie': 'nsf_salarie',
    'paye': 'paye',
    'net_pay': 'salaire_net',
    'netpay': 'salaire_net',
    'salaire_net': 'salaire_net',
    'net': 'salaire_net',
    // Employer contributions
    'er_4010': 'csg_patronal',
    'csg_patronal': 'csg_patronal',
    'er_4100': 'nsf_patronal',
    'nsf_patronal': 'nsf_patronal',
    'er_4200': 'training_levy',
    'er_levy': 'training_levy',
    'training_levy': 'training_levy',
    'er_7900': 'prgf',
    'er_prgf': 'prgf',
    'prgf': 'prgf',
    'total_er_contributions': 'total_charges_patronales',
    'total_charges_patronales': 'total_charges_patronales',
  }

  return MAP[s] || s
}

function parseNumber(val: any): number {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return val
  // Remove spaces, replace comma with dot
  const cleaned = String(val).replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

function parseDate(val: any): string | null {
  if (!val) return null
  if (typeof val === 'number') {
    // Excel date serial number
    const d = new Date((val - 25569) * 86400 * 1000)
    return d.toISOString().split('T')[0]
  }
  const s = String(val).trim()
  // DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
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
    const mode = formData.get('mode') as string || 'paie' // 'paie' or 'employes'

    if (!file) return NextResponse.json({ error: 'Fichier requis' }, { status: 400 })
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    // Parse file (CSV or XLSX)
    const ext = file.name.split('.').pop()?.toLowerCase()
    let rawRows: Record<string, any>[] = []
    let headers: string[] = []

    if (ext === 'xlsx' || ext === 'xls') {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true, cellText: false })
      const ws = wb.Sheets[wb.SheetNames[0]]

      // Find header row (first row with "Code" or "Last name" or "Nom")
      const allRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      let headerRowIdx = 0
      for (let i = 0; i < Math.min(allRows.length, 5); i++) {
        const row = allRows[i].map((c: any) => String(c).toLowerCase())
        if (row.some(c => c.includes('code') || c.includes('last name') || c.includes('nom') || c.includes('basic salary'))) {
          headerRowIdx = i
          break
        }
      }

      // Merge multi-row headers if needed (row above + header row)
      const headerRow = allRows[headerRowIdx] || []
      const prevRow = headerRowIdx > 0 ? allRows[headerRowIdx - 1] : []

      headers = headerRow.map((h: any, idx: number) => {
        let label = String(h || '').trim()
        // If this header is empty but previous row has a value, use that
        if (!label && prevRow[idx]) label = String(prevRow[idx]).trim()
        // If previous row has a group label (like "[ER] 4010"), combine
        if (prevRow[idx] && String(prevRow[idx]).trim().startsWith('[ER]')) {
          label = String(prevRow[idx]).trim().replace(/[\[\]]/g, '') + (label ? ' ' + label : '')
        }
        return normalizeHeader(label)
      })

      // Parse data rows (after header)
      for (let i = headerRowIdx + 1; i < allRows.length; i++) {
        const row = allRows[i]
        if (!row || row.length === 0) continue
        // Skip empty rows and total row
        const firstCell = String(row[0] || '').trim()
        if (!firstCell || firstCell.toLowerCase() === 'total') continue

        const obj: Record<string, any> = {}
        headers.forEach((h, idx) => { if (h) obj[h] = row[idx] })
        rawRows.push(obj)
      }
    } else {
      // CSV parsing
      const text = await file.text()
      const lines = text.trim().split('\n')
      if (lines.length < 2) return NextResponse.json({ error: 'Fichier vide' }, { status: 400 })

      const sep = lines[0].includes(';') ? ';' : ','
      headers = lines[0].split(sep).map(h => normalizeHeader(h.replace(/"/g, '')))

      for (let i = 1; i < lines.length; i++) {
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
      return NextResponse.json({ error: 'Aucune ligne de données trouvée', headers_detected: headers }, { status: 400 })
    }

    // Fetch existing employees
    const { data: employes } = await supabase
      .from('employes').select('id, code, nom, prenom')
      .eq('societe_id', societe_id)
    const empByCode = new Map<string, string>()
    const empByName = new Map<string, string>()
    for (const e of employes || []) {
      if (e.code) empByCode.set(e.code.trim().toLowerCase(), e.id)
      const fullName = `${(e.nom || '').trim()} ${(e.prenom || '').trim()}`.toLowerCase()
      if (fullName.trim()) empByName.set(fullName, e.id)
    }

    const imported: string[] = []
    const created: string[] = []
    const errors: string[] = []

    // Determine period from form or file name
    let periode = periodeOverride || ''
    if (!periode) {
      // Try to extract from filename (e.g., "Payroll Report Jul 2025")
      const months: Record<string, string> = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
      }
      const match = file.name.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*(\d{4})/i)
      if (match) {
        const m = months[match[1].toLowerCase().substring(0, 3)]
        if (m) periode = `${match[2]}-${m}-01`
      }
    }
    if (periode && periode.length === 7) periode = `${periode}-01`

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i]
      const lineNum = i + 1

      // Find employee
      let empId: string | undefined
      const code = String(row.code || '').trim()
      const nom = String(row.nom || '').trim()
      const prenom = String(row.prenom || '').trim()

      if (code) empId = empByCode.get(code.toLowerCase())
      if (!empId && nom && prenom) {
        empId = empByName.get(`${nom} ${prenom}`.toLowerCase())
      }

      // Auto-create employee if not found
      if (!empId && (nom || prenom)) {
        const newEmp: Record<string, any> = {
          societe_id,
          code: code || `IMP${String(lineNum).padStart(3, '0')}`,
          nom: nom || 'INCONNU',
          prenom: prenom || '',
          poste: String(row.poste || '').trim() || null,
          salaire_base: parseNumber(row.salaire_base),
          devise_salaire: 'MUR',
          statut: 'actif',
          date_arrivee: parseDate(row.date_arrivee) || new Date().toISOString().split('T')[0],
        }
        const { data: newEmpData, error: empErr } = await supabase
          .from('employes').insert(newEmp).select('id').single()
        if (empErr) {
          errors.push(`Ligne ${lineNum} (${nom} ${prenom}): impossible de créer l'employé — ${empErr.message}`)
          continue
        }
        empId = newEmpData.id
        empByCode.set((newEmp.code as string).toLowerCase(), empId)
        created.push(`${nom} ${prenom} (${newEmp.code})`)
      }

      if (!empId) {
        errors.push(`Ligne ${lineNum}: employé non trouvé (code="${code}", nom="${nom} ${prenom}")`)
        continue
      }

      if (!periode) {
        errors.push(`Ligne ${lineNum}: période non déterminée — spécifiez-la dans le formulaire`)
        continue
      }

      // Build bulletin
      const salaire_base = parseNumber(row.salaire_base)
      const heures_sup = parseNumber(row.heures_sup)
      const special_allowance_1 = parseNumber(row.special_allowance_1)
      const internet = parseNumber(row.internet_allowance)
      const prime_prod = parseNumber(row.prime_production)
      const on_call = parseNumber(row.on_call_allowance)
      const electricity = parseNumber(row.electricity_allowance)
      const meal = parseNumber(row.meal_allowance)
      const salaire_brut = parseNumber(row.salaire_brut) || (salaire_base + heures_sup + special_allowance_1 + internet + prime_prod + on_call + electricity + meal)
      const montant_absence = parseNumber(row.montant_absence)
      const csg_salarie = parseNumber(row.csg_salarie)
      const nsf_salarie = parseNumber(row.nsf_salarie)
      const paye = parseNumber(row.paye)
      const salaire_net = parseNumber(row.salaire_net) || (salaire_brut - montant_absence - csg_salarie - nsf_salarie - paye)
      const csg_patronal = parseNumber(row.csg_patronal)
      const nsf_patronal = parseNumber(row.nsf_patronal)
      const training_levy = parseNumber(row.training_levy)
      const prgf = parseNumber(row.prgf)
      const total_charges = csg_patronal + nsf_patronal + training_levy + prgf

      const bulletin: Record<string, any> = {
        employe_id: empId,
        societe_id,
        periode,
        salaire_base,
        salaire_brut,
        salaire_net,
        heures_sup_montant: heures_sup,
        special_allowance_1,
        csg_salarie,
        csg_patronal,
        nsf_salarie,
        nsf_patronal,
        paye,
        training_levy,
        montant_absence,
        total_deductions: csg_salarie + nsf_salarie + paye + montant_absence,
        total_charges_patronales: total_charges,
        cout_total_employeur: salaire_brut + total_charges,
        statut: 'brouillon',
        notes: `Importé depuis ${file.name}`,
      }

      const { error: bulErr } = await supabase
        .from('bulletins_paie')
        .upsert(bulletin, { onConflict: 'employe_id,periode' })

      if (bulErr) {
        errors.push(`Ligne ${lineNum} (${nom} ${prenom}): ${bulErr.message}`)
      } else {
        imported.push(`${code || nom} ${prenom}`)
      }
    }

    return NextResponse.json({
      imported: imported.length,
      created_employees: created.length,
      created_employees_list: created,
      errors,
      total_rows: rawRows.length,
      periode_used: periode,
      headers_detected: headers,
    })
  } catch (e: unknown) {
    console.error('[paie/import]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
