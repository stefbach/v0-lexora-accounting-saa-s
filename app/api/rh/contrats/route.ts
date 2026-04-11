import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// ── GET /api/rh/contrats ─────────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const url = new URL(request.url)
    const societe_id = url.searchParams.get('societe_id')
    const type_contrat = url.searchParams.get('type_contrat')
    const statut = url.searchParams.get('statut')
    const employe_id = url.searchParams.get('employe_id')

    let query = supabase
      .from('contrats_employes')
      .select(`
        id,
        type_contrat,
        secteur,
        date_debut,
        date_fin,
        salaire_brut,
        statut,
        date_signature,
        notes,
        created_at,
        employe:employes (
          id,
          prenom,
          nom,
          poste,
          email,
          societe_id,
          societe:societes ( id, nom )
        )
      `)
      .order('created_at', { ascending: false })

    if (employe_id) query = query.eq('employe_id', employe_id)
    if (type_contrat) query = query.eq('type_contrat', type_contrat)
    if (statut) query = query.eq('statut', statut)
    if (societe_id) query = query.eq('employe.societe_id', societe_id)

    const { data: contrats, error } = await query
    if (error) throw error
    return NextResponse.json({ contrats: contrats ?? [] })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// ── POST /api/rh/contrats ────────────────────────────────────────────────────
// Body : { employe_id, type_contrat, secteur, date_debut, date_fin?, salaire_brut?, poste?, html_content?, notes? }
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { employe_id, type_contrat, secteur, date_debut, date_fin, salaire_brut, poste, html_content, notes } = body

    if (!employe_id || !type_contrat || !date_debut) {
      return NextResponse.json({ error: 'Champs obligatoires manquants : employe_id, type_contrat, date_debut' }, { status: 400 })
    }

    // Récupérer societe_id depuis l'employé
    const { data: employe, error: empErr } = await supabase
      .from('employes')
      .select('societe_id')
      .eq('id', employe_id)
      .single()

    if (empErr || !employe) return NextResponse.json({ error: 'Employé introuvable' }, { status: 404 })

    const { data: contrat, error } = await supabase
      .from('contrats_employes')
      .insert({
        employe_id,
        societe_id: employe.societe_id,
        type_contrat,
        secteur: secteur || 'general',
        date_debut,
        date_fin: date_fin || null,
        salaire_brut: salaire_brut || null,
        poste: poste || null,
        html_content: html_content || null,
        notes: notes || null,
        statut: 'brouillon',
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ contrat }, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
