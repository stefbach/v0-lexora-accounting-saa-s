import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    // Get dossiers for this société
    const { data: dossiers } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id)
    const dossierIds = (dossiers || []).map((d: any) => d.id)

    let ecritures: any[] = []

    // Try v1 (ecritures_comptables) which has lettrage support
    if (dossierIds.length > 0) {
      const { data } = await supabase
        .from('ecritures_comptables')
        .select('id, compte, libelle, date_ecriture, debit, credit, lettre, date_lettrage, lettrage_auto, piece_justificative')
        .in('dossier_id', dossierIds)
        .is('lettre', null)
        .order('compte').order('date_ecriture')
        .limit(500)
      ecritures = (data || []).map(e => ({
        ...e,
        numero_compte: e.compte,
        debit_mur: Number(e.debit) || 0,
        credit_mur: Number(e.credit) || 0,
        source: 'v1',
      }))
    }

    // Also try v2
    const { data: v2Data } = await supabase
      .from('ecritures_comptables_v2')
      .select('id, numero_compte, nom_compte, description, debit_mur, credit_mur, date_ecriture, journal, lettre, date_lettrage')
      .eq('societe_id', societe_id)
      .is('lettre', null)
      .order('numero_compte').order('date_ecriture')
      .limit(500)

    if (v2Data && v2Data.length > 0) {
      ecritures = [...ecritures, ...(v2Data || []).map(e => ({
        ...e,
        compte: e.numero_compte,
        libelle: e.description || e.nom_compte,
        debit: Number(e.debit_mur) || 0,
        credit: Number(e.credit_mur) || 0,
        source: 'v2',
      }))]
    }

    // Group by account for display
    const byCompte: Record<string, any[]> = {}
    ecritures.forEach(e => {
      const c = e.numero_compte || e.compte || '?'
      if (!byCompte[c]) byCompte[c] = []
      byCompte[c].push(e)
    })

    return NextResponse.json({
      ecritures_non_lettrees: ecritures,
      par_compte: byCompte,
      nb: ecritures.length,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { action, societe_id, ecriture_ids, lettre } = body

    if (action === 'auto') {
      // Auto-lettrage: match debits ↔ credits on same account with same amount
      const { data: dossiers } = await supabase.from('dossiers').select('id').eq('societe_id', societe_id)
      const dossierIds = (dossiers || []).map((d: any) => d.id)
      if (!dossierIds.length) return NextResponse.json({ nb_lettres: 0, message: 'Aucun dossier trouvé' })

      // Get non-lettered entries
      const { data: entries } = await supabase
        .from('ecritures_comptables')
        .select('id, compte, debit, credit')
        .in('dossier_id', dossierIds)
        .is('lettre', null)
        .order('compte').order('date_ecriture')

      if (!entries || entries.length === 0) {
        return NextResponse.json({ nb_lettres: 0, message: 'Aucune écriture non lettrée' })
      }

      // Group by account
      const byCompte: Record<string, any[]> = {}
      entries.forEach(e => {
        if (!byCompte[e.compte]) byCompte[e.compte] = []
        byCompte[e.compte].push(e)
      })

      let matchCount = 0
      let lettreIdx = 0
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

      function genLettre() {
        const idx = lettreIdx++
        if (idx < 26) return alphabet[idx]
        return alphabet[Math.floor(idx / 26) - 1] + alphabet[idx % 26]
      }

      for (const [compte, items] of Object.entries(byCompte)) {
        const debits = items.filter(e => (Number(e.debit) || 0) > 0)
        const credits = items.filter(e => (Number(e.credit) || 0) > 0)
        const usedCredits = new Set<string>()

        for (const d of debits) {
          const dAmount = Number(d.debit) || 0
          const matchingCredit = credits.find(c => {
            if (usedCredits.has(c.id)) return false
            const cAmount = Number(c.credit) || 0
            return Math.abs(dAmount - cAmount) < 0.01
          })
          if (matchingCredit) {
            const code = genLettre()
            const today = new Date().toISOString().split('T')[0]
            await supabase.from('ecritures_comptables')
              .update({ lettre: code, date_lettrage: today, lettrage_auto: true })
              .in('id', [d.id, matchingCredit.id])
            usedCredits.add(matchingCredit.id)
            matchCount += 2
          }
        }
      }

      return NextResponse.json({ nb_lettres: matchCount, message: `${matchCount} écritures lettrées automatiquement` })
    }

    if (action === 'manuel') {
      if (!ecriture_ids?.length || !lettre) return NextResponse.json({ error: 'ecriture_ids et lettre requis' }, { status: 400 })
      const today = new Date().toISOString().split('T')[0]
      await supabase.from('ecritures_comptables')
        .update({ lettre, date_lettrage: today, lettrage_auto: false })
        .in('id', ecriture_ids)
      return NextResponse.json({ message: `${ecriture_ids.length} écritures lettrées avec ${lettre}` })
    }

    if (action === 'delettrer') {
      if (!ecriture_ids?.length) return NextResponse.json({ error: 'ecriture_ids requis' }, { status: 400 })
      await supabase.from('ecritures_comptables')
        .update({ lettre: null, date_lettrage: null, lettrage_auto: false })
        .in('id', ecriture_ids)
      return NextResponse.json({ message: 'Lettrage supprimé' })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
