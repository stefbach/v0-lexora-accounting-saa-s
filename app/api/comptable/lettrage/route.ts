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

async function requireAllowedRole() {
  const supabaseAuth = await createServerClient()
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
  if (!user || authError) return null
  const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'super_admin', 'comptable', 'comptable_dedie', 'client_admin'].includes(profile.role)) return null
  return user
}

export async function GET(request: Request) {
  try {
    const user = await requireAllowedRole()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    // ⚠️ V2 ONLY (mig 230). V1 ecritures_comptables est une vue sur V2 — on lit
    // V2 directement. Avant cette migration le code lisait V1 PUIS V2 puis
    // mergeait : ça doublait les écritures pour les sociétés multi-dossiers.
    const { data: v2Data } = await supabase
      .from('ecritures_comptables_v2')
      .select('id, numero_compte, nom_compte, description, libelle, debit_mur, credit_mur, date_ecriture, journal, lettre, date_lettrage, lettrage_auto, ref_folio')
      .eq('societe_id', societe_id)
      .is('lettre', null)
      .order('numero_compte').order('date_ecriture')
      .limit(500)

    // Aliases V1→V2 pour compat avec le code aval qui lit `compte`/`debit`/`credit`
    const ecritures = (v2Data || []).map(e => ({
      ...e,
      compte: e.numero_compte,
      libelle: e.libelle || e.description || e.nom_compte,
      debit: Number(e.debit_mur) || 0,
      credit: Number(e.credit_mur) || 0,
      piece_justificative: e.ref_folio,
    }))

    // Group by account for display
    const byCompte: Record<string, any[]> = {}
    ecritures.forEach(e => {
      const c = e.numero_compte || '?'
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
    const user = await requireAllowedRole()
    if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { action, societe_id, ecriture_ids, lettre } = body

    // ⚠️ V2 ONLY (mig 230) — toutes les opérations ci-dessous lisent/écrivent V2 directement.
    if (action === 'auto') {
      // Auto-lettrage: match debits ↔ credits on same account with same amount
      const { data: entries } = await supabase
        .from('ecritures_comptables_v2')
        .select('id, numero_compte, debit_mur, credit_mur')
        .eq('societe_id', societe_id)
        .is('lettre', null)
        .order('numero_compte').order('date_ecriture')

      if (!entries || entries.length === 0) {
        return NextResponse.json({ nb_lettres: 0, message: 'Aucune écriture non lettrée' })
      }

      // Group by account
      const byCompte: Record<string, any[]> = {}
      entries.forEach(e => {
        const c = e.numero_compte
        if (!byCompte[c]) byCompte[c] = []
        byCompte[c].push(e)
      })

      let matchCount = 0
      let lettreIdx = 0
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

      function genLettre() {
        const idx = lettreIdx++
        if (idx < 26) return alphabet[idx]
        return alphabet[Math.floor(idx / 26) - 1] + alphabet[idx % 26]
      }

      for (const [, items] of Object.entries(byCompte)) {
        const debits = items.filter(e => (Number(e.debit_mur) || 0) > 0)
        const credits = items.filter(e => (Number(e.credit_mur) || 0) > 0)
        const usedCredits = new Set<string>()

        for (const d of debits) {
          const dAmount = Number(d.debit_mur) || 0
          const matchingCredit = credits.find(c => {
            if (usedCredits.has(c.id)) return false
            const cAmount = Number(c.credit_mur) || 0
            return Math.abs(dAmount - cAmount) < 0.01
          })
          if (matchingCredit) {
            const code = genLettre()
            const today = new Date().toISOString().split('T')[0]
            await supabase.from('ecritures_comptables_v2')
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
      await supabase.from('ecritures_comptables_v2')
        .update({ lettre, date_lettrage: today, lettrage_auto: false })
        .in('id', ecriture_ids)
      return NextResponse.json({ message: `${ecriture_ids.length} écritures lettrées avec ${lettre}` })
    }

    if (action === 'delettrer') {
      if (!ecriture_ids?.length) return NextResponse.json({ error: 'ecriture_ids requis' }, { status: 400 })
      await supabase.from('ecritures_comptables_v2')
        .update({ lettre: null, date_lettrage: null, lettrage_auto: false })
        .in('id', ecriture_ids)
      return NextResponse.json({ message: 'Lettrage supprimé' })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
