import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface ParsedRow {
  employe_code: string
  periode: string
  salaire_brut: number
  salaire_net: number
  csg_salarie: number
  csg_patronal: number
  nsf_salarie: number
  nsf_patronal: number
  paye: number
  training_levy: number
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  // Detect separator
  const sep = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/"/g, ''))

  const rows: ParsedRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(sep).map(v => v.trim().replace(/"/g, ''))
    if (vals.length < headers.length) continue

    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => { obj[h] = vals[idx] || '' })

    rows.push({
      employe_code: obj.employe_code || obj.code || '',
      periode: obj.periode || '',
      salaire_brut: parseFloat(obj.salaire_brut) || 0,
      salaire_net: parseFloat(obj.salaire_net) || 0,
      csg_salarie: parseFloat(obj.csg_salarie) || 0,
      csg_patronal: parseFloat(obj.csg_patronal) || 0,
      nsf_salarie: parseFloat(obj.nsf_salarie) || 0,
      nsf_patronal: parseFloat(obj.nsf_patronal) || 0,
      paye: parseFloat(obj.paye) || 0,
      training_levy: parseFloat(obj.training_levy) || 0,
    })
  }
  return rows
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autoris\u00e9' }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const societe_id = formData.get('societe_id') as string | null
    const periodeOverride = formData.get('periode') as string | null

    if (!file) return NextResponse.json({ error: 'Fichier requis' }, { status: 400 })
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const text = await file.text()
    const rows = parseCSV(text)

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Aucune ligne valide dans le fichier' }, { status: 400 })
    }

    // Fetch all employees for the societe to match by code
    const { data: employes } = await supabase
      .from('employes')
      .select('id, code')
      .eq('societe_id', societe_id)

    const empMap = new Map<string, string>()
    for (const e of employes || []) {
      if (e.code) empMap.set(e.code.trim().toLowerCase(), e.id)
    }

    const imported: string[] = []
    const errors: string[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const lineNum = i + 2 // 1-indexed + header

      if (!row.employe_code) {
        errors.push(`Ligne ${lineNum}: employe_code manquant`)
        continue
      }

      const empId = empMap.get(row.employe_code.trim().toLowerCase())
      if (!empId) {
        errors.push(`Ligne ${lineNum}: employ\u00e9 "${row.employe_code}" non trouv\u00e9`)
        continue
      }

      // Use periode from row or override
      let periode = row.periode || periodeOverride || ''
      if (!periode) {
        errors.push(`Ligne ${lineNum}: periode manquante`)
        continue
      }

      // Normalize periode to YYYY-MM-01
      if (periode.length === 7) periode = `${periode}-01`
      if (!/^\d{4}-\d{2}-\d{2}$/.test(periode)) {
        errors.push(`Ligne ${lineNum}: periode invalide "${row.periode}"`)
        continue
      }

      const totalDeductions = row.csg_salarie + row.nsf_salarie + row.paye
      const totalChargesPatronales = row.csg_patronal + row.nsf_patronal + row.training_levy

      const bulletin = {
        employe_id: empId,
        societe_id,
        periode,
        salaire_base: row.salaire_brut, // Use brut as base for imported data
        salaire_brut: row.salaire_brut,
        salaire_net: row.salaire_net,
        csg_salarie: row.csg_salarie,
        csg_patronal: row.csg_patronal,
        nsf_salarie: row.nsf_salarie,
        nsf_patronal: row.nsf_patronal,
        paye: row.paye,
        training_levy: row.training_levy,
        total_deductions: totalDeductions,
        total_charges_patronales: totalChargesPatronales,
        cout_total_employeur: row.salaire_brut + totalChargesPatronales,
        statut: 'brouillon',
        notes: 'Import\u00e9 depuis fichier CSV',
      }

      const { error } = await supabase
        .from('bulletins_paie')
        .upsert(bulletin, { onConflict: 'employe_id,periode' })

      if (error) {
        errors.push(`Ligne ${lineNum}: ${error.message}`)
      } else {
        imported.push(row.employe_code)
      }
    }

    return NextResponse.json({
      imported: imported.length,
      imported_codes: imported,
      errors,
      total_rows: rows.length,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
