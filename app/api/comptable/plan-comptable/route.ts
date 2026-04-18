import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const classe = searchParams.get('classe')
    const type = searchParams.get('type')
    const q = searchParams.get('q')
    const societe_id = searchParams.get('societe_id')
    const include_inactive = searchParams.get('include_inactive') === '1'

    let query = supabase.from('plan_comptable').select('*').order('compte')
    if (!include_inactive) query = query.eq('actif', true)
    if (classe) query = query.eq('classe', parseInt(classe))
    if (type) query = query.eq('type_compte', type)
    if (q) query = query.or(`compte.ilike.${q}%,libelle.ilike.%${q}%`)
    if (societe_id) query = query.or(`societe_id.eq.${societe_id},societe_id.is.null`)

    const { data, error } = await query
    if (error) throw error

    const parClasse: Record<number, { comptes: typeof data }> = {}
    for (const c of data || []) {
      const cl = c.classe as number
      if (!parClasse[cl]) parClasse[cl] = { comptes: [] }
      parClasse[cl].comptes.push(c)
    }

    return NextResponse.json({ comptes: data, par_classe: parClasse, total: data?.length })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

function validatePayload(p: Record<string, unknown>) {
  const errs: string[] = []
  const compte = String(p.compte || '').trim()
  const libelle = String(p.libelle || '').trim()
  if (!/^[0-9]{2,10}$/.test(compte)) errs.push(`Compte invalide: ${compte || '(vide)'} — attendu 2 à 10 chiffres.`)
  if (libelle.length < 2) errs.push(`Libellé trop court pour ${compte}.`)
  const type = String(p.type_compte || '').toLowerCase()
  if (type && !['actif', 'passif', 'charge', 'produit', 'capitaux'].includes(type))
    errs.push(`type_compte invalide: ${type}`)
  const sens = String(p.sens_normal || 'D').toUpperCase()
  if (!['D', 'C'].includes(sens)) errs.push(`sens_normal invalide: ${sens}`)
  return { errs, normalized: { ...p, compte, libelle, type_compte: type || 'actif', sens_normal: sens } }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()

    // Bulk import: { comptes: [...] }
    if (Array.isArray(body?.comptes)) {
      const rows: Record<string, unknown>[] = []
      const errors: string[] = []
      for (const [idx, row] of (body.comptes as Record<string, unknown>[]).entries()) {
        const { errs, normalized } = validatePayload(row)
        if (errs.length) errors.push(`Ligne ${idx + 1}: ${errs.join('; ')}`)
        else rows.push(normalized)
      }
      if (errors.length && !body.ignore_errors) {
        return NextResponse.json({ error: 'Validation échouée', details: errors }, { status: 422 })
      }
      if (!rows.length) return NextResponse.json({ error: 'Aucune ligne valide' }, { status: 422 })
      const { data, error } = await supabase
        .from('plan_comptable')
        .upsert(rows, { onConflict: 'compte' })
        .select()
      if (error) throw error
      return NextResponse.json({ imported: data?.length || 0, skipped: errors.length, errors }, { status: 201 })
    }

    // Single insert/upsert
    const { errs, normalized } = validatePayload(body)
    if (errs.length) return NextResponse.json({ error: errs.join('; ') }, { status: 422 })
    const { data, error } = await supabase
      .from('plan_comptable')
      .upsert(normalized, { onConflict: 'compte' })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ compte: data }, { status: 201 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json()
    const { id, ...patch } = body || {}
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })

    // Disallow changing the compte number (would break references); create a new row instead.
    delete (patch as Record<string, unknown>).compte
    delete (patch as Record<string, unknown>).classe // generated column

    const { data, error } = await supabase
      .from('plan_comptable')
      .update(patch)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json({ compte: data })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const compte = searchParams.get('compte')
    if (!id && !compte) return NextResponse.json({ error: 'id ou compte requis' }, { status: 400 })

    // Safety: don't delete if used in ecritures. Soft-delete by setting actif=false.
    const compteToCheck = compte || (await (async () => {
      const { data } = await supabase.from('plan_comptable').select('compte').eq('id', id!).single()
      return data?.compte as string | undefined
    })())

    if (compteToCheck) {
      const { count: usedV1 } = await supabase
        .from('ecritures_comptables')
        .select('id', { head: true, count: 'exact' })
        .eq('compte', compteToCheck)
      const { count: usedV2 } = await supabase
        .from('ecritures_comptables_v2')
        .select('id', { head: true, count: 'exact' })
        .eq('numero_compte', compteToCheck)
      if ((usedV1 || 0) + (usedV2 || 0) > 0) {
        const q = id ? supabase.from('plan_comptable').update({ actif: false }).eq('id', id)
                     : supabase.from('plan_comptable').update({ actif: false }).eq('compte', compte!)
        const { error } = await q
        if (error) throw error
        return NextResponse.json({ soft_deleted: true, message: 'Compte utilisé — désactivé au lieu de supprimé.' })
      }
    }

    const q = id ? supabase.from('plan_comptable').delete().eq('id', id)
                 : supabase.from('plan_comptable').delete().eq('compte', compte!)
    const { error } = await q
    if (error) throw error
    return NextResponse.json({ deleted: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
