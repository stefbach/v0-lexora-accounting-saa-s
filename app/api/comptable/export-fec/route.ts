import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * GET /api/comptable/export-fec?societe_id=xxx&date_debut=YYYY-MM-DD&date_fin=YYYY-MM-DD&format=fec|csv|balance
 *
 * Formats :
 *   - fec : Fichier des Ecritures Comptables (FR), CSV TAB-separated
 *   - csv : CSV simple (toutes les ecritures)
 *   - balance : CSV balance par compte
 */
export async function GET(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const date_debut = searchParams.get('date_debut')
    const date_fin = searchParams.get('date_fin')
    const format = searchParams.get('format') || 'csv'
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const { data: dossier } = await supabase
      .from('dossiers').select('id').eq('societe_id', societe_id).limit(1).maybeSingle()
    if (!dossier) return new NextResponse('Aucun dossier', { status: 404 })

    const { data: societe } = await supabase
      .from('societes').select('nom, brn, vat_number').eq('id', societe_id).maybeSingle()
    const societeNom = (societe?.nom || 'Societe').replace(/[^a-zA-Z0-9_]/g, '_')

    let query = supabase
      .from('ecritures_comptables_v2')
      .select('id, numero_compte, libelle, debit_mur, credit_mur, lettre, date_ecriture, journal, ref_folio, created_at')
      .eq('dossier_id', dossier.id)
      .order('date_ecriture', { ascending: true })
      .order('created_at', { ascending: true })
    if (date_debut) query = query.gte('date_ecriture', date_debut)
    if (date_fin) query = query.lte('date_ecriture', date_fin)

    const { data: ecritures, error } = await query
    if (error) return new NextResponse(`Erreur: ${error.message}`, { status: 500 })

    // === Format BALANCE ===
    if (format === 'balance') {
      const map: Record<string, { compte: string; libelle: string; debit: number; credit: number }> = {}
      for (const e of ecritures || []) {
        const c = String(e.numero_compte || '')
        if (!map[c]) map[c] = { compte: c, libelle: e.libelle || '', debit: 0, credit: 0 }
        map[c].debit += Number(e.debit_mur) || 0
        map[c].credit += Number(e.credit_mur) || 0
      }
      const rows = Object.values(map).sort((a, b) => a.compte.localeCompare(b.compte))
      const lines = ['"Compte","Libelle","Debit","Credit","Solde"']
      let totalD = 0, totalC = 0
      for (const r of rows) {
        const solde = r.debit - r.credit
        totalD += r.debit
        totalC += r.credit
        lines.push(`"${r.compte}","${r.libelle.replace(/"/g, '""')}","${r.debit.toFixed(2)}","${r.credit.toFixed(2)}","${solde.toFixed(2)}"`)
      }
      lines.push(`"TOTAL","","${totalD.toFixed(2)}","${totalC.toFixed(2)}","${(totalD - totalC).toFixed(2)}"`)
      const csv = lines.join('\n')
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="balance_${societeNom}_${date_debut || 'all'}_${date_fin || 'now'}.csv"`,
        },
      })
    }

    // === Format FEC (français) ===
    if (format === 'fec') {
      // FEC exige 18 colonnes standard, separees par TAB
      const header = [
        'JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib',
        'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate', 'EcritureLib',
        'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise',
      ].join('\t')
      const lines = [header]
      for (const e of ecritures || []) {
        const line = [
          e.journal || 'OD', e.journal || 'OD',
          e.ref_folio || String(e.id).substring(0, 12),
          String(e.date_ecriture || '').replace(/-/g, ''),
          e.numero_compte || '',
          (e.libelle || '').substring(0, 60),
          '', '', // pas de comptes auxiliaires distincts
          e.ref_folio || '',
          String(e.date_ecriture || '').replace(/-/g, ''),
          (e.libelle || '').replace(/\t/g, ' '),
          (Number(e.debit_mur) || 0).toFixed(2).replace('.', ','),
          (Number(e.credit_mur) || 0).toFixed(2).replace('.', ','),
          e.lettre || '', '',
          String(e.date_ecriture || '').replace(/-/g, ''),
          '', '',
        ].join('\t')
        lines.push(line)
      }
      const fec = lines.join('\n')
      return new NextResponse(fec, {
        status: 200,
        headers: {
          'Content-Type': 'text/tab-separated-values; charset=utf-8',
          'Content-Disposition': `attachment; filename="FEC_${societeNom}_${date_debut || 'all'}_${date_fin || 'now'}.txt"`,
        },
      })
    }

    // === Format CSV simple (defaut) ===
    const lines = ['"Date","Journal","Compte","Libelle","Debit","Credit","Lettre","Reference"']
    for (const e of ecritures || []) {
      lines.push([
        String(e.date_ecriture || ''),
        e.journal || '',
        e.numero_compte || '',
        (e.libelle || '').replace(/"/g, '""'),
        (Number(e.debit_mur) || 0).toFixed(2),
        (Number(e.credit_mur) || 0).toFixed(2),
        e.lettre || '',
        e.ref_folio || '',
      ].map(v => `"${v}"`).join(','))
    }
    const csv = lines.join('\n')
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ecritures_${societeNom}_${date_debut || 'all'}_${date_fin || 'now'}.csv"`,
      },
    })
  } catch (e: any) {
    return new NextResponse(`Erreur: ${e.message}`, { status: 500 })
  }
}
