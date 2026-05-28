import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function dateLimiteFromPeriode(periode: string): string {
  const [y, m] = periode.split('-').map(Number)
  const mm = m === 12 ? 1 : m + 1
  const yy = m === 12 ? y + 1 : y
  return `${yy}-${String(mm).padStart(2, '0')}-20`
}

interface PeriodeInput {
  periode: string            // YYYY-MM (mois, ou mois de fin du trimestre)
  trimestre?: string | null  // YYYY-Qn (trimestriel)
  type?: 'mensuel' | 'trimestriel'
  date_declaration?: string  // YYYY-MM-DD
  reference_mra?: string
  montant_declare?: number   // TVA nette déclarée à la MRA
}

// Marque en lot des périodes comme déclarées / payées. Sert au
// rattrapage et à la reprise de comptabilité (saisie de l'historique
// déclaratif, y compris années antérieures sans écritures).
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const societe_id: string = body.societe_id
    const statut: string = body.statut === 'paye' ? 'paye' : 'declare'
    const isRattrapage: boolean = !!body.is_rattrapage
    const periodes: PeriodeInput[] = Array.isArray(body.periodes) ? body.periodes : []

    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    if (periodes.length === 0) return NextResponse.json({ error: 'Aucune période fournie' }, { status: 400 })

    const { data: societe, error: socErr } = await supabase
      .from('societes')
      .select('client_id, nom')
      .eq('id', societe_id)
      .single()
    if (socErr || !societe) return NextResponse.json({ error: 'Société introuvable' }, { status: 404 })

    const today = new Date().toISOString().slice(0, 10)
    const rows = periodes
      .filter(p => p.periode && /^\d{4}-\d{2}$/.test(p.periode))
      .map(p => {
        const row: Record<string, any> = {
          client_id: societe.client_id,
          societe_id,
          societe: societe.nom,
          periode: p.periode,
          date_limite: dateLimiteFromPeriode(p.periode),
          statut_declaration: statut,
          date_declaration: p.date_declaration || today,
          date_soumission: p.date_declaration || today,
          source_saisie: 'manuel',
          is_rattrapage: isRattrapage,
          updated_at: new Date().toISOString(),
        }
        if (p.trimestre) {
          row.trimestre = p.trimestre
          row.type_declaration = 'vat4'
          row.mode_declaration = 'trimestriel'
        }
        if (p.reference_mra) {
          row.reference_mra = p.reference_mra
          row.reference_declaration_mra = p.reference_mra
        }
        if (p.montant_declare != null && !Number.isNaN(Number(p.montant_declare))) {
          row.montant_declare_mra = Math.round(Number(p.montant_declare) * 100) / 100
        }
        return row
      })

    if (rows.length === 0) return NextResponse.json({ error: 'Périodes invalides (format YYYY-MM attendu)' }, { status: 400 })

    // Upsert résilient : si la migration 446 n'est pas appliquée, on retire les
    // colonnes qu'elle introduit (source_saisie, is_rattrapage, montant_declare_mra)
    // et on réessaie. Le marquage de statut reste fonctionnel sans elle.
    let { data, error } = await supabase
      .from('tva_mensuelle')
      .upsert(rows, { onConflict: 'client_id,societe_id,periode' })
      .select('id, periode, statut_declaration')

    let migration446 = true
    if (error) {
      migration446 = false
      const fallbackRows = rows.map(({ source_saisie, is_rattrapage, montant_declare_mra, ...rest }) => rest)
      const retry = await supabase
        .from('tva_mensuelle')
        .upsert(fallbackRows, { onConflict: 'client_id,societe_id,periode' })
        .select('id, periode, statut_declaration')
      data = retry.data
      error = retry.error
    }

    if (error) throw error

    return NextResponse.json({ success: true, nb: data?.length || 0, records: data, migration_446: migration446 })
  } catch (e: any) {
    console.error('[tva/rattrapage/marquer]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 })
  }
}
