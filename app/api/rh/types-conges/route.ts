// app/api/rh/types-conges/route.ts
//
// CRUD pour les types de congés (table `conges_regles` mig 170).
// Remplace les anciennes données localStorage `rh_leave_types`.
//
// Modèle conges_regles : societe_id NULL = règle globale Maurice (seed WRA),
// societe_id rempli = override par société. Le GET retourne la fusion :
//   - règles globales NON overridées par la société courante
//   - règles de la société courante (overrides + types custom)
//
// GET   ?societe_id=<uuid>             → liste fusionnée des types actifs
// POST  { action: 'creer'|'modifier'|'supprimer', ... }
//
// Le payload d'API expose les champs UI :
//   code (= type_conge), nom (= description courte), daysPerYear (= jours_par_cycle),
//   requiresCertificate (= requiert_certificat_medical), paid (= paye).

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

const ALLOWED_ROLES = ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin']

type RegleRow = {
  id: string
  societe_id: string | null
  type_conge: string
  jours_par_cycle: number | null
  paye: boolean | null
  requiert_certificat_medical: boolean | null
  description: string | null
  reference_wra: string | null
  actif: boolean | null
}

function rowToUi(row: RegleRow) {
  return {
    id: row.id,
    code: row.type_conge,
    nom: row.description || row.type_conge,
    daysPerYear: row.jours_par_cycle ?? 0,
    paid: row.paye ?? true,
    requiresCertificate: row.requiert_certificat_medical ?? false,
    reference_wra: row.reference_wra,
    societe_id: row.societe_id,
    is_global: row.societe_id === null,
  }
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) {
      return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('conges_regles')
      .select('id, societe_id, type_conge, jours_par_cycle, paye, requiert_certificat_medical, description, reference_wra, actif')
      .or(`societe_id.is.null,societe_id.eq.${societe_id}`)
      .eq('actif', true)
      .order('type_conge')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Fusion : override société remplace global pour un même type_conge.
    const byCode = new Map<string, RegleRow>()
    for (const r of (data || []) as RegleRow[]) {
      const existing = byCode.get(r.type_conge)
      if (!existing) {
        byCode.set(r.type_conge, r)
      } else if (existing.societe_id === null && r.societe_id !== null) {
        byCode.set(r.type_conge, r)
      }
    }
    const merged = Array.from(byCode.values()).map(rowToUi)

    return NextResponse.json({ types_conges: merged })
  } catch (e: any) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const body = await request.json()
    const { action } = body

    if (action === 'creer') {
      const { societe_id, code, nom, daysPerYear, paid, requiresCertificate } = body
      if (!societe_id || !code || !nom) {
        return NextResponse.json(
          { error: 'societe_id, code et nom requis' },
          { status: 400 }
        )
      }
      const { data, error } = await supabase
        .from('conges_regles')
        .insert({
          societe_id,
          type_conge: String(code).trim().toUpperCase(),
          jours_par_cycle: daysPerYear !== undefined ? Number(daysPerYear) : null,
          unite_cycle: '12 months',
          paye: paid !== undefined ? !!paid : true,
          requiert_certificat_medical: !!requiresCertificate,
          description: String(nom).trim(),
          actif: true,
        })
        .select()
        .single()
      if (error) {
        if (error.code === '23505') {
          return NextResponse.json(
            { error: 'Un type de congé avec ce code existe déjà pour cette société' },
            { status: 409 }
          )
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, type_conge: rowToUi(data as RegleRow) })
    }

    if (action === 'modifier') {
      const { id, societe_id, code, nom, daysPerYear, paid, requiresCertificate } = body
      if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

      // Si la ligne est globale (societe_id NULL), on NE la modifie pas :
      // on crée un override pour la société courante.
      const { data: existing, error: e0 } = await supabase
        .from('conges_regles')
        .select('id, societe_id, type_conge')
        .eq('id', id)
        .maybeSingle()
      if (e0) return NextResponse.json({ error: e0.message }, { status: 500 })
      if (!existing) return NextResponse.json({ error: 'Type de congé introuvable' }, { status: 404 })

      const newCode = code !== undefined ? String(code).trim().toUpperCase() : existing.type_conge
      const updatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }
      if (code !== undefined) updatePayload.type_conge = newCode
      if (nom !== undefined) updatePayload.description = String(nom).trim()
      if (daysPerYear !== undefined) updatePayload.jours_par_cycle = Number(daysPerYear)
      if (paid !== undefined) updatePayload.paye = !!paid
      if (requiresCertificate !== undefined) updatePayload.requiert_certificat_medical = !!requiresCertificate

      if (existing.societe_id === null) {
        // Création d'un override : besoin du societe_id côté payload.
        if (!societe_id) {
          return NextResponse.json(
            { error: 'societe_id requis pour overrider une règle globale' },
            { status: 400 }
          )
        }
        const insertRow: Record<string, unknown> = {
          societe_id,
          type_conge: newCode,
          unite_cycle: '12 months',
          actif: true,
          ...updatePayload,
        }
        delete insertRow.updated_at
        const { data, error } = await supabase
          .from('conges_regles')
          .insert(insertRow)
          .select()
          .single()
        if (error) {
          if (error.code === '23505') {
            return NextResponse.json(
              { error: 'Un override existe déjà pour ce type de congé' },
              { status: 409 }
            )
          }
          return NextResponse.json({ error: error.message }, { status: 500 })
        }
        return NextResponse.json({ success: true, type_conge: rowToUi(data as RegleRow) })
      }

      // Override existant : update direct.
      const { data, error } = await supabase
        .from('conges_regles')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .maybeSingle()
      if (error) {
        if (error.code === '23505') {
          return NextResponse.json(
            { error: 'Code déjà utilisé pour cette société' },
            { status: 409 }
          )
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, type_conge: data ? rowToUi(data as RegleRow) : null })
    }

    if (action === 'supprimer') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

      // Bloquer la suppression d'une règle globale (seed WRA).
      const { data: existing, error: e0 } = await supabase
        .from('conges_regles')
        .select('societe_id')
        .eq('id', id)
        .maybeSingle()
      if (e0) return NextResponse.json({ error: e0.message }, { status: 500 })
      if (!existing) return NextResponse.json({ error: 'Type de congé introuvable' }, { status: 404 })
      if (existing.societe_id === null) {
        return NextResponse.json(
          { error: 'Impossible de supprimer une règle globale Maurice (WRA 2019). Vous pouvez la masquer en créant un override.' },
          { status: 400 }
        )
      }

      const { error } = await supabase
        .from('conges_regles')
        .update({ actif: false, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur' },
      { status: 500 }
    )
  }
}
