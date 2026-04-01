import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase admin credentials')
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** Normalize fournisseur name: uppercase, remove legal suffixes, trim */
function normalizeFournisseur(name: string): string {
  return name
    .toUpperCase()
    .replace(/\b(LTD|LIMITED|SARL|SAS|SA|EURL|SNC|GIE|INC|CORP|LLC|PLC|CO\.?\s*LTD)\b/gi, '')
    .replace(/[.,;:!?]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function GET(request: NextRequest) {
  const supabase = getAdminClient()

  try {
    const { searchParams } = new URL(request.url)
    const societeId = searchParams.get('societe_id')

    if (!societeId) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('affectations_comptables')
      .select('*')
      .eq('societe_id', societeId)
      .order('fournisseur', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ affectations: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const supabase = getAdminClient()

  try {
    const body = await request.json()
    const { action } = body

    // ── CHERCHER: find matching affectation for a fournisseur name ──
    if (action === 'chercher') {
      const { societe_id, fournisseur } = body
      if (!societe_id || !fournisseur) {
        return NextResponse.json({ error: 'societe_id et fournisseur requis' }, { status: 400 })
      }

      const normalized = normalizeFournisseur(fournisseur)

      // 1. Exact match on normalized fournisseur name
      const { data: exact } = await supabase
        .from('affectations_comptables')
        .select('*')
        .eq('societe_id', societe_id)
        .eq('fournisseur', normalized)
        .limit(1)
        .maybeSingle()

      if (exact) {
        return NextResponse.json({ found: true, affectation: exact })
      }

      // 2. Pattern match: check if any pattern is contained in the fournisseur name
      const { data: allAff } = await supabase
        .from('affectations_comptables')
        .select('*')
        .eq('societe_id', societe_id)

      if (allAff && allAff.length > 0) {
        for (const aff of allAff) {
          // Check if the fournisseur name contains the stored fournisseur name
          if (normalized.includes(aff.fournisseur) || aff.fournisseur.includes(normalized)) {
            return NextResponse.json({ found: true, affectation: aff })
          }
          // Check patterns array
          if (Array.isArray(aff.fournisseur_patterns)) {
            for (const pattern of aff.fournisseur_patterns) {
              const p = pattern.toUpperCase().trim()
              if (p && normalized.includes(p)) {
                return NextResponse.json({ found: true, affectation: aff })
              }
            }
          }
        }
      }

      return NextResponse.json({ found: false })
    }

    // ── AFFECTER: create or update an affectation rule ──
    if (action === 'affecter') {
      const { societe_id, fournisseur, fournisseur_patterns, compte, libelle_compte, journal, auto_lettrage, recurrent, tva_deductible, notes } = body
      if (!societe_id || !fournisseur || !compte) {
        return NextResponse.json({ error: 'societe_id, fournisseur et compte requis' }, { status: 400 })
      }

      const normalized = normalizeFournisseur(fournisseur)
      const patterns = Array.isArray(fournisseur_patterns)
        ? fournisseur_patterns.map((p: string) => p.toUpperCase().trim()).filter(Boolean)
        : []

      const { data, error } = await supabase
        .from('affectations_comptables')
        .upsert({
          societe_id,
          fournisseur: normalized,
          fournisseur_patterns: patterns,
          compte,
          libelle_compte: libelle_compte || null,
          journal: journal || 'ACH',
          auto_lettrage: auto_lettrage || false,
          recurrent: recurrent || false,
          tva_deductible: tva_deductible !== false,
          notes: notes || null,
        }, { onConflict: 'societe_id,fournisseur' })
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, affectation: data })
    }

    // ── SUPPRIMER: delete an affectation ──
    if (action === 'supprimer') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

      const { error } = await supabase
        .from('affectations_comptables')
        .delete()
        .eq('id', id)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
