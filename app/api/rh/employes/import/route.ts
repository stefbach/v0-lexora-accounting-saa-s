import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase admin credentials')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

export const dynamic = 'force-dynamic'

interface RowData {
  nom?: string
  prenom?: string
  email?: string
  poste?: string
  salaire_base?: string | number
  devise_salaire?: string
  date_arrivee?: string
  nic?: string
  bank_name?: string
  bank_account?: string
  telephone?: string
  role?: string
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()

    const formData = await request.formData()
    const file = formData.get('file') as File
    const societe_id = formData.get('societe_id') as string

    if (!file) return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 })
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const fileName = file.name.toLowerCase()

    let rows: RowData[] = []

    if (fileName.endsWith('.csv')) {
      // Parse CSV
      const text = buffer.toString('utf-8')
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) return NextResponse.json({ error: 'Fichier vide ou sans données' }, { status: 400 })

      const headers = lines[0].split(/[;,]/).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(/[;,]/).map(v => v.trim())
        const row: any = {}
        headers.forEach((h, idx) => { row[h] = values[idx] || '' })
        rows.push(row)
      }
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      // Parse XLSX
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet)
      rows = jsonData.map(row => {
        const normalized: any = {}
        for (const key of Object.keys(row)) {
          normalized[key.trim().toLowerCase().replace(/\s+/g, '_')] = row[key]
        }
        return normalized
      })
    } else {
      return NextResponse.json({ error: 'Format non supporté. Utilisez .csv ou .xlsx' }, { status: 400 })
    }

    if (rows.length === 0) return NextResponse.json({ error: 'Aucune ligne de données trouvée' }, { status: 400 })

    // Get current employee count for code generation
    const { count: currentCount } = await supabase
      .from('employes')
      .select('*', { count: 'exact', head: true })
      .eq('societe_id', societe_id)

    let imported = 0
    const errors: { row: number; message: string }[] = []
    let codeCounter = (currentCount || 0) + 1

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNum = i + 2 // +2 because row 1 is header, and we're 1-indexed

      // Validate required fields
      if (!row.nom || !row.prenom) {
        errors.push({ row: rowNum, message: `nom et prenom requis (nom="${row.nom || ''}", prenom="${row.prenom || ''}")` })
        continue
      }

      const salaire = parseFloat(String(row.salaire_base || '0'))
      if (!salaire || isNaN(salaire)) {
        errors.push({ row: rowNum, message: `salaire_base invalide: "${row.salaire_base}"` })
        continue
      }

      const code = String(codeCounter).padStart(6, '0')

      const record: Record<string, any> = {
        societe_id,
        code,
        nom: String(row.nom).trim(),
        prenom: String(row.prenom).trim(),
        salaire_base: salaire,
        actif: true,
      }

      if (row.email) record.email = String(row.email).trim()
      if (row.poste) record.poste = String(row.poste).trim()
      if (row.devise_salaire) record.devise_salaire = String(row.devise_salaire).trim().toUpperCase()
      if (row.date_arrivee) record.date_arrivee = String(row.date_arrivee).trim()
      if (row.nic) record.nic = String(row.nic).trim()
      if (row.bank_name) record.bank_name = String(row.bank_name).trim()
      if (row.bank_account) record.bank_account = String(row.bank_account).trim()
      if (row.telephone) record.telephone = String(row.telephone).trim()
      if (row.role) record.role = String(row.role).trim()

      const { error } = await supabase.from('employes').insert(record)
      if (error) {
        errors.push({ row: rowNum, message: error.message })
      } else {
        imported++
        codeCounter++
      }
    }

    return NextResponse.json({ imported, errors, total_rows: rows.length })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur import' }, { status: 500 })
  }
}
