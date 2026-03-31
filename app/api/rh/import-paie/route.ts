import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

const COL_PATTERNS: Record<string, string[]> = {
  code: ['code', 'employee code', 'no'],
  nom: ['last name', 'nom', 'name', 'surname'],
  prenom: ['first name', 'prenom', 'prénom'],
  poste: ['job', 'poste', 'position'],
  departement: ['department', 'departement', 'dept'],
  date_arrivee: ['arr. date', 'arr date', 'date arrivee', 'hire date', 'joined'],
  date_depart: ['dep. date', 'dep date', 'date depart', 'departure'],
  salaire_base: ['basic salary', 'salaire base', 'basic', '1000'],
  overtime_1_5x: ['overtime', '@1.5', '1100'],
  overtime_2x: ['@2x', '1150'],
  special_allowance: ['special', '3010'],
  internet_allowance: ['internet', '3170'],
  prime_production: ['prime', 'production', '3200'],
  electricity: ['electricity', '3250'],
  meal_allowance: ['meal', '3510'],
  total_payments: ['total payments', 'total pay'],
  absence_deductions: ['absence', '3900'],
  csg: ['csg', '4010'],
  nsf: ['nsf', '4100'],
  paye: ['paye', '5000'],
  total_deductions: ['total deductions'],
  er_csg: ['er] csg', 'er csg', '[er] 4010'],
  er_nsf: ['er] nsf', 'er nsf', '[er] 4100'],
  er_levy: ['er] 4200', 'er levy', '[er] levy'],
  er_prgf: ['er] 7900', 'er prgf', '[er] 7900'],
  total_er: ['total er', 'total employer'],
  net_pay: ['net pay', 'net', 'salaire net'],
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
      const { data } = await supabase.from('bulletins_paie').select('periode, salaire_base, salaire_net, total_charges_patronales').eq('source', 'import_excel').order('periode', { ascending: false })
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
      const { data } = await supabase.from('bulletins_paie').select('*').eq('source', 'import_excel').eq('periode', periode)
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
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellText: true, cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]

      const hIdx = rows.findIndex(r => r.some((c: any) => String(c).toLowerCase().match(/salary|basic|net pay|1000|4010/)))
      if (hIdx < 0) return NextResponse.json({ error: 'En-tête non trouvé' }, { status: 400 })

      const headers = rows[hIdx].map((c: any) => String(c).trim())
      const colMap = detectColumns(headers)
      const getVal = (row: any[], f: string) => colMap[f] !== undefined ? Number(String(row[colMap[f]] || '0').replace(/[^\d.-]/g, '')) || 0 : 0
      const getStr = (row: any[], f: string) => colMap[f] !== undefined ? String(row[colMap[f]] || '').trim() : ''

      const employes = rows.slice(hIdx + 1)
        .filter(r => r.some(c => c !== '' && c !== null))
        .filter(r => { const n = getStr(r, 'nom'); return n && n.toLowerCase() !== 'total' })
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
