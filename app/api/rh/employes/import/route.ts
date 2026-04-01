import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase admin credentials')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function normalizeHeader(h: string): string {
  const s = h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[()@.#]/g, '').replace(/__+/g, '_').replace(/^_|_$/g, '')
  const MAP: Record<string, string> = {
    'code': 'code', 'employee_code': 'code', 'employe_code': 'code',
    'last_name': 'nom', 'lastname': 'nom', 'nom': 'nom', 'name': 'nom',
    'first_name': 'prenom', 'firstname': 'prenom', 'prenom': 'prenom',
    'email': 'email', 'mail': 'email',
    'job': 'poste', 'poste': 'poste', 'position': 'poste', 'title': 'poste',
    'department': 'departement', 'departement': 'departement',
    'basic_salary': 'salaire_base', 'salaire_base': 'salaire_base', 'salary': 'salaire_base',
    'devise': 'devise_salaire', 'devise_salaire': 'devise_salaire', 'currency': 'devise_salaire',
    'arr_date': 'date_arrivee', 'arrival_date': 'date_arrivee', 'date_arrivee': 'date_arrivee',
    'start_date': 'date_arrivee', 'hire_date': 'date_arrivee',
    'dep_date': 'date_depart', 'departure_date': 'date_depart',
    'nic': 'nic', 'nic_number': 'nic', 'national_id': 'nic',
    'bank_name': 'bank_name', 'banque': 'bank_name', 'bank': 'bank_name',
    'bank_account': 'bank_account', 'account_number': 'bank_account', 'iban': 'bank_account',
    'telephone': 'telephone', 'phone': 'telephone', 'mobile': 'telephone',
    'role': 'role',
  }
  return MAP[s] || s
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

export async function POST(request: NextRequest) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const formData = await request.formData()
    const file = formData.get('file') as File
    const societe_id = formData.get('societe_id') as string

    if (!file) return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 })
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const fileArrayBuffer = await file.arrayBuffer()
    const fileName = file.name.toLowerCase()
    let rawRows: Record<string, any>[] = []
    let detectedHeaders: string[] = []

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(fileArrayBuffer, { type: 'array', cellDates: true, cellText: false })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const allRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      let headerRowIdx = 0
      for (let i = 0; i < Math.min(allRows.length, 10); i++) {
        const row = allRows[i].map((c: any) => String(c).toLowerCase())
        if (row.some(c => c.includes('code') || c.includes('last name') || c.includes('nom') || c.includes('salary') || c.includes('prenom') || c.includes('first name'))) {
          headerRowIdx = i
          break
        }
      }

      const headerRow = allRows[headerRowIdx] || []
      detectedHeaders = headerRow.map((h: any) => normalizeHeader(String(h || '')))

      for (let i = headerRowIdx + 1; i < allRows.length; i++) {
        const row = allRows[i]
        if (!row || row.length === 0) continue
        const firstCell = String(row[0] || '').trim()
        if (!firstCell || firstCell.toLowerCase() === 'total') continue

        const obj: Record<string, any> = {}
        detectedHeaders.forEach((h, idx) => { if (h) obj[h] = row[idx] })
        rawRows.push(obj)
      }
    } else if (fileName.endsWith('.csv') || fileName.endsWith('.txt')) {
      const text = Buffer.from(fileArrayBuffer).toString('utf-8')
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) return NextResponse.json({ error: 'Fichier vide' }, { status: 400 })

      const sep = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ','
      detectedHeaders = lines[0].split(sep).map(h => normalizeHeader(h.replace(/"/g, '')))

      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(sep).map(v => v.trim().replace(/"/g, ''))
        if (vals.length < 2) continue
        const firstCell = vals[0]?.trim()
        if (!firstCell || firstCell.toLowerCase() === 'total') continue

        const obj: Record<string, any> = {}
        detectedHeaders.forEach((h, idx) => { if (h) obj[h] = vals[idx] || '' })
        rawRows.push(obj)
      }
    } else {
      return NextResponse.json({ error: 'Format non supporté. Utilisez .csv, .xlsx ou .xls' }, { status: 400 })
    }

    if (rawRows.length === 0) {
      return NextResponse.json({ error: 'Aucune ligne de données trouvée', headers_detected: detectedHeaders }, { status: 400 })
    }

    const { count: currentCount } = await supabase
      .from('employes').select('*', { count: 'exact', head: true }).eq('societe_id', societe_id)

    let imported = 0
    let codeCounter = (currentCount || 0) + 1
    const errors: { row: number; message: string }[] = []

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i]
      const rowNum = i + 2
      const nom = String(row.nom || '').trim()
      const prenom = String(row.prenom || '').trim()

      if (!nom && !prenom) {
        errors.push({ row: rowNum, message: 'nom et prenom manquants' })
        continue
      }

      const code = String(row.code || '').trim() || String(codeCounter).padStart(6, '0')
      const record: Record<string, any> = {
        societe_id, code,
        nom: nom || 'INCONNU', prenom: prenom || '',
        salaire_base: parseNumber(row.salaire_base) || 0,
      }

      if (row.email) record.email = String(row.email).trim()
      if (row.poste) record.poste = String(row.poste).trim()
      if (row.departement) record.departement = String(row.departement).trim()
      if (row.devise_salaire) record.devise_salaire = String(row.devise_salaire).trim().toUpperCase()
      const dateArr = parseDate(row.date_arrivee)
      if (dateArr) record.date_arrivee = dateArr
      const dateDep = parseDate(row.date_depart)
      if (dateDep) record.date_depart = dateDep
      if (row.nic) record.nic_number = String(row.nic).trim()
      if (row.bank_name) record.bank_name = String(row.bank_name).trim()
      if (row.bank_account) record.bank_account = String(row.bank_account).trim()
      if (row.telephone) record.telephone = String(row.telephone).trim()

      const { error } = await supabase.from('employes').insert(record)
      if (error) {
        errors.push({ row: rowNum, message: error.message })
      } else {
        imported++
        codeCounter++
      }
    }

    return NextResponse.json({ imported, errors, total_rows: rawRows.length, headers_detected: detectedHeaders })
  } catch (e: unknown) {
    console.error('[employes/import]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur import' }, { status: 500 })
  }
}
