import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getUserSocieteIds, userHasAccessToSociete } from '@/lib/rh/access'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

const COL_PATTERNS: Record<string, string[]> = {
  code: ['code', 'employee code', 'emp code', 'no.', 'no '],
  nom: ['last name', 'last_name', 'nom', 'surname', 'family name'],
  prenom: ['first name', 'first_name', 'prenom', 'prénom', 'given name'],
  poste: ['job', 'poste', 'position', 'titre', 'fonction'],
  departement: ['department', 'departement', 'département', 'dept', 'service'],
  date_arrivee: ['arr. date', 'arr date', 'arr.date', 'date arrivee', 'hire date', 'joined', 'date embauche'],
  date_depart: ['dep. date', 'dep date', 'dep.date', 'date depart', 'departure', 'leaving'],
  salaire_base: ['basic salary', 'salaire base', 'basic', '1000 basic', '1000'],
  overtime_1_5x: ['overtime @1.5', 'overtime', '@1.5x', '1100 overtime', '1100'],
  overtime_2x: ['overtime @2', '@2x', '1150 overtime', '1150'],
  special_allowance: ['special allowance', 'special', '3010 special', '3010'],
  internet_allowance: ['internet allowance', 'internet', '3170 internet', '3170'],
  prime_production: ['prime production', 'prime', 'production', '3200 prime', '3200'],
  on_call: ['on call', '3220'],
  prime_tl: ['prime tl', '3230'],
  electricity: ['electricity allowance', 'electricity', 'electricite', '3250 elec', '3250'],
  meal_allowance: ['meal allowance', 'meal', 'repas', '3510 meal', '3510'],
  total_payments: ['total payments', 'total pay', 'gross', 'brut total'],
  absence_deductions: ['absence deductions', 'absence', '3900 absence', '3900'],
  csg: ['4010 csg', 'csg', '4010'],
  nsf: ['4100 nsf', 'nsf', '4100'],
  paye: ['5000 paye', 'paye', '5000'],
  total_deductions: ['total deductions', 'total ded'],
  er_csg: ['[er] 4010', 'er] csg', 'er csg', 'er] 4010'],
  er_nsf: ['[er] 4100', 'er] nsf', 'er nsf', 'er] 4100'],
  er_levy: ['[er] 4200', 'er] 4200', 'er levy', 'er] levy', 'levy'],
  er_prgf: ['[er] 7900', 'er] 7900', 'er prgf', 'prgf'],
  total_er: ['total er contributions', 'total er', 'total employer'],
  net_pay: ['net pay', 'net_pay', 'salaire net', 'net'],
}

function detectColumns(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {}
  const lower = headers.map(h => String(h).toLowerCase().trim())
  for (const [field, patterns] of Object.entries(COL_PATTERNS)) {
    for (let i = 0; i < lower.length; i++) {
      if (mapping[field] !== undefined) break
      if (patterns.some(p => lower[i].includes(p))) mapping[field] = i
    }
  }
  return mapping
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    if (action === 'history') {
      // Multi-tenant: filter by accessible societes
      const accessibleIds = await getUserSocieteIds(user.id)
      if (accessibleIds.length === 0) return NextResponse.json({ history: [] })

      const { data } = await supabase.from('bulletins_paie').select('periode, salaire_base, salaire_net, total_charges_patronales').eq('source', 'import_excel').in('societe_id', accessibleIds).order('periode', { ascending: false })
      const groups: Record<string, any> = {}
      for (const b of data || []) {
        const p = b.periode
        if (!groups[p]) groups[p] = { periode: p, nb: 0, total_brut: 0, total_net: 0, total_charges: 0 }
        groups[p].nb++
        groups[p].total_brut += Number(b.salaire_base) || 0
        groups[p].total_net += Number(b.salaire_net) || 0
        groups[p].total_charges += Number(b.total_charges_patronales) || 0
      }
      return NextResponse.json({ history: Object.values(groups) })
    }

    if (action === 'detail') {
      const periode = searchParams.get('periode')
      if (!periode) return NextResponse.json({ error: 'periode requis' }, { status: 400 })
      // Multi-tenant: filter by accessible societes
      const accessibleIdsDetail = await getUserSocieteIds(user.id)
      if (accessibleIdsDetail.length === 0) return NextResponse.json({ bulletins: [] })
      const { data } = await supabase.from('bulletins_paie').select('*').eq('source', 'import_excel').eq('periode', periode).in('societe_id', accessibleIdsDetail)
      const empIds = [...new Set((data || []).map(b => b.employe_id))]
      let empMap: Record<string, any> = {}
      if (empIds.length > 0) {
        const { data: emps } = await supabase.from('employes').select('id, nom, prenom, poste').in('id', empIds)
        for (const e of emps || []) empMap[e.id] = e
      }
      return NextResponse.json({ bulletins: (data || []).map(b => ({ ...b, employe: empMap[b.employe_id] || null })) })
    }

    return NextResponse.json({ error: 'action requis' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const supabase = getAdminClient()
    const contentType = request.headers.get('content-type') || ''

    // PARSE Excel
    if (contentType.includes('multipart')) {
      const formData = await request.formData()
      const file = formData.get('file') as File
      if (!file) return NextResponse.json({ error: 'Fichier requis' }, { status: 400 })
      console.log(`[import-paie] Parsing file: ${file.name}, size: ${file.size}, type: ${file.type}`)

      let XLSX: any
      try {
        XLSX = await import('xlsx')
      } catch (xlsxErr: any) {
        console.error('[import-paie] xlsx import failed:', xlsxErr)
        return NextResponse.json({ error: 'Erreur chargement librairie Excel: ' + (xlsxErr.message || 'xlsx non disponible') }, { status: 500 })
      }

      let wb: any, ws: any, rows: any[][]
      try {
        const buffer = await file.arrayBuffer()
        wb = XLSX.read(buffer, { type: 'array', cellText: true, cellDates: true })
        ws = wb.Sheets[wb.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]
        console.log(`[import-paie] Parsed ${rows.length} rows from sheet "${wb.SheetNames[0]}"`)
      } catch (parseErr: any) {
        console.error('[import-paie] Excel parse error:', parseErr)
        return NextResponse.json({ error: 'Erreur lecture fichier Excel: ' + (parseErr.message || 'Format invalide') }, { status: 400 })
      }

      // Find header row(s) — payroll Excel often has 2 header rows:
      // Row A: numeric codes (1000, 1100, 3010, 4010, [ER] 4010...)
      // Row B: labels (Basic Salary, Overtime @1.5x, CSG, NSF, PAYE...)
      // We also need the row with Last name/First name/Code columns

      let hIdx = -1
      let nameRowIdx = -1

      // Find row with salary codes/keywords
      for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const rowStr = rows[i].map((c: any) => String(c).toLowerCase()).join(' ')
        if (rowStr.match(/salary|basic|net pay|1000|4010|paye/)) { hIdx = i; break }
      }

      // Find row with name columns (Code, Last name, First name)
      for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const rowStr = rows[i].map((c: any) => String(c).toLowerCase()).join(' ')
        if (rowStr.match(/last name|nom|first name|prenom|code.*name|employee/)) { nameRowIdx = i; break }
      }

      // If we found name row but not salary row, use name row
      if (hIdx < 0 && nameRowIdx >= 0) hIdx = nameRowIdx
      if (hIdx < 0) return NextResponse.json({ error: `En-tête non trouvé dans les 15 premières lignes. Lignes scannées: ${rows.slice(0, 5).map((r, i) => `[${i}] ${r.slice(0, 5).join(', ')}`).join(' | ')}` }, { status: 400 })

      // Merge multiple header rows: combine the header row with adjacent rows
      // (handles payroll reports with codes on one row and labels on another)
      const mergedHeaders: string[] = []
      const headerRow = rows[hIdx]
      const prevRow = hIdx > 0 ? rows[hIdx - 1] : []
      const nextRow = hIdx + 1 < rows.length ? rows[hIdx + 1] : []

      // Also check if nameRowIdx is different from hIdx
      const nameRow = nameRowIdx >= 0 && nameRowIdx !== hIdx ? rows[nameRowIdx] : []

      for (let i = 0; i < Math.max(headerRow.length, prevRow.length, nextRow.length, nameRow.length); i++) {
        const parts = [
          String(headerRow[i] || '').trim(),
          String(prevRow[i] || '').trim(),
          String(nextRow[i] || '').trim(),
          String(nameRow[i] || '').trim(),
        ].filter(p => p && p !== '0' && p !== 'undefined')
        mergedHeaders.push(parts.join(' '))
      }

      console.log(`[import-paie] Header row: ${hIdx}, Name row: ${nameRowIdx}, Merged headers: ${mergedHeaders.slice(0, 10).join(' | ')}`)

      const colMap = detectColumns(mergedHeaders)
      console.log(`[import-paie] Column mapping: ${JSON.stringify(colMap)}`)

      // Determine data start row (after ALL header rows)
      const dataStartRow = Math.max(hIdx, nameRowIdx) + 1
      // If the row right after headers looks like another header (contains labels), skip it too
      let skipExtra = 0
      if (dataStartRow < rows.length) {
        const firstDataRow = rows[dataStartRow]
        const firstDataStr = firstDataRow.map((c: any) => String(c).toLowerCase()).join(' ')
        if (firstDataStr.match(/^.*(?:last name|basic salary|overtime|net pay|code).*$/)) skipExtra = 1
      }

      const headers = mergedHeaders
      const getVal = (row: any[], f: string) => colMap[f] !== undefined ? Number(String(row[colMap[f]] || '0').replace(/[^\d.-]/g, '')) || 0 : 0
      const getStr = (row: any[], f: string) => colMap[f] !== undefined ? String(row[colMap[f]] || '').trim() : ''

      const employes = rows.slice(dataStartRow + skipExtra)
        .filter(r => r.some(c => c !== '' && c !== null))
        .filter(r => {
          const n = getStr(r, 'nom') || getStr(r, 'prenom')
          return n && !n.toLowerCase().match(/^(total|nom|last name|name)$/)
        })
        .map(r => ({
          code: getStr(r, 'code'), nom: getStr(r, 'nom'), prenom: getStr(r, 'prenom'),
          poste: getStr(r, 'poste'), departement: getStr(r, 'departement'),
          date_arrivee: getStr(r, 'date_arrivee'), date_depart: getStr(r, 'date_depart'),
          salaire_base: getVal(r, 'salaire_base'), overtime_1_5x: getVal(r, 'overtime_1_5x'), overtime_2x: getVal(r, 'overtime_2x'),
          special_allowance: getVal(r, 'special_allowance'), internet_allowance: getVal(r, 'internet_allowance'),
          prime_production: getVal(r, 'prime_production'), electricity: getVal(r, 'electricity'), meal_allowance: getVal(r, 'meal_allowance'),
          total_payments: getVal(r, 'total_payments'), absence_deductions: getVal(r, 'absence_deductions'),
          csg: getVal(r, 'csg'), nsf: getVal(r, 'nsf'), paye: getVal(r, 'paye'), total_deductions: getVal(r, 'total_deductions'),
          er_csg: getVal(r, 'er_csg'), er_nsf: getVal(r, 'er_nsf'), er_levy: getVal(r, 'er_levy'), er_prgf: getVal(r, 'er_prgf'),
          total_er: getVal(r, 'total_er'), net_pay: getVal(r, 'net_pay'),
        }))

      console.log(`[import-paie] Found ${employes.length} employees. First: ${employes[0]?.nom || 'none'} ${employes[0]?.prenom || ''}`)

      // If no employees found, return debug info
      if (employes.length === 0) {
        return NextResponse.json({
          error: `Aucun employé détecté. Colonnes trouvées: ${Object.keys(colMap).join(', ')}. En-têtes fusionnés: ${mergedHeaders.slice(0, 15).join(' | ')}. Lignes de données: ${rows.length - dataStartRow - skipExtra}`,
          columns: Object.entries(colMap).map(([f, i]) => ({ field: f, index: i })),
          headers: mergedHeaders.slice(0, 20),
          debug: { hIdx, nameRowIdx, dataStartRow, skipExtra, totalRows: rows.length },
        }, { status: 400 })
      }

      const monthMap: Record<string, string> = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' }
      const pm = file.name.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*[\s_-]*(\d{4})/i)
      const periode = pm ? `${pm[2]}-${monthMap[pm[1].toLowerCase().slice(0,3)]}` : ''

      return NextResponse.json({ columns: Object.entries(colMap).map(([f, i]) => ({ field: f, header: headers[i], index: i })), employes, periode_detected: periode, nb_rows: employes.length })
    }

    // IMPORT
    const body = await request.json()
    if (body.action === 'import') {
      const { societe_id, periode, employes } = body
      if (!societe_id || !periode || !employes?.length) return NextResponse.json({ error: 'Données manquantes' }, { status: 400 })

      // Multi-tenant: verify user has access to this société
      const hasAccessImport = await userHasAccessToSociete(user.id, societe_id)
      if (!hasAccessImport) return NextResponse.json({ error: 'Accès refusé à cette société' }, { status: 403 })
      const periodeDate = `${periode}-01`
      let created = 0, updated = 0, errors: string[] = []
      const { data: dossier } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()

      for (const emp of employes) {
        try {
          const nom = (emp.nom || '').toUpperCase().trim()
          if (!nom) continue
          let employeId: string | null = null
          const { data: ex } = await supabase.from('employes').select('id, salaire_base').eq('societe_id', societe_id).ilike('nom', `%${nom}%`).limit(1).maybeSingle()
          if (ex) { employeId = ex.id; if (emp.salaire_base > 0 && emp.salaire_base !== Number(ex.salaire_base)) await supabase.from('employes').update({ salaire_base: emp.salaire_base }).eq('id', ex.id); updated++ }
          else { const { data: n } = await supabase.from('employes').insert({ societe_id, nom, prenom: emp.prenom || '', code_employe: emp.code || null, poste: emp.poste || null, departement: emp.departement || null, salaire_base: emp.salaire_base || 0, date_arrivee: emp.date_arrivee || null }).select('id').single(); if (n) { employeId = n.id; created++ } }
          if (!employeId) continue
          await supabase.from('bulletins_paie').upsert({ employe_id: employeId, societe_id, periode: periodeDate, salaire_base: emp.salaire_base || 0, heures_sup_montant: (emp.overtime_1_5x || 0) + (emp.overtime_2x || 0), special_allowance_1: emp.special_allowance || 0, salaire_net: emp.net_pay || 0, csg_salarie: emp.csg || 0, csg_patronal: emp.er_csg || 0, nsf_salarie: emp.nsf || 0, nsf_patronal: emp.er_nsf || 0, paye: emp.paye || 0, training_levy: emp.er_levy || 0, prgf: emp.er_prgf || 0, total_deductions: emp.total_deductions || 0, total_charges_patronales: emp.total_er || 0, statut: 'valide', source: 'import_excel' }, { onConflict: 'employe_id,periode' }).catch(() => {})
        } catch (e: any) { errors.push(`${emp.nom}: ${e.message}`) }
      }

      if (dossier) {
        const t = employes.reduce((s: any, e: any) => ({ brut: s.brut + (e.total_payments || e.salaire_base || 0), net: s.net + (e.net_pay || 0), csg: s.csg + (e.csg || 0) + (e.er_csg || 0), paye: s.paye + (e.paye || 0), levy: s.levy + (e.er_levy || 0), charges: s.charges + (e.total_er || 0) }), { brut: 0, net: 0, csg: 0, paye: 0, levy: 0, charges: 0 })
        await supabase.from('ecritures_comptables').insert([
          { dossier_id: dossier.id, date_ecriture: periodeDate, journal: 'SAL', compte: '641', libelle: `Rémunérations ${periode}`, debit: Math.round(t.brut), credit: 0 },
          { dossier_id: dossier.id, date_ecriture: periodeDate, journal: 'SAL', compte: '645', libelle: `Charges patronales ${periode}`, debit: Math.round(t.charges), credit: 0 },
          { dossier_id: dossier.id, date_ecriture: periodeDate, journal: 'SAL', compte: '421', libelle: `Net à payer ${periode}`, debit: 0, credit: Math.round(t.net) },
          { dossier_id: dossier.id, date_ecriture: periodeDate, journal: 'SAL', compte: '431', libelle: `CSG ${periode}`, debit: 0, credit: Math.round(t.csg) },
          { dossier_id: dossier.id, date_ecriture: periodeDate, journal: 'SAL', compte: '444', libelle: `PAYE ${periode}`, debit: 0, credit: Math.round(t.paye) },
          { dossier_id: dossier.id, date_ecriture: periodeDate, journal: 'SAL', compte: '432', libelle: `Training Levy ${periode}`, debit: 0, credit: Math.round(t.levy) },
        ].filter(e => e.debit > 0 || e.credit > 0)).catch(() => {})
      }

      return NextResponse.json({ created, updated, errors, total: employes.length })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
