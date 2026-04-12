import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * GET /api/comptable/rapprochement/aliases?societe_id=...
 * Returns all aliases for a société (own + global)
 */
export async function GET(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from('supplier_aliases')
      .select('*')
      .or(`societe_id.eq.${societe_id},societe_id.is.null`)
      .order('canonical')

    if (error) {
      if ((error.message || '').includes('does not exist')) {
        return NextResponse.json({ aliases: [], migrated: false })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ aliases: data || [], migrated: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * POST /api/comptable/rapprochement/aliases
 * Actions: add | delete | learn_from_match
 */
export async function POST(request: Request) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const body = await request.json()
    const { action } = body

    // ── Add a manual alias ──
    if (action === 'add') {
      const { societe_id, canonical, alias } = body
      if (!canonical || !alias) {
        return NextResponse.json({ error: 'canonical et alias requis' }, { status: 400 })
      }

      const norm = (alias as string).toLowerCase().replace(/[^a-z0-9\s.]/g, '').trim()
      const canon = (canonical as string).toLowerCase().replace(/[^a-z0-9\s.]/g, '').trim()

      const { data, error } = await supabase
        .from('supplier_aliases')
        .upsert({
          societe_id: societe_id || null,
          canonical: canon,
          alias: norm,
          source: 'manual',
          confidence: 1.0,
          created_by: user.id,
        }, { onConflict: 'societe_id,alias' })
        .select()
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ alias: data })
    }

    // ── Delete an alias ──
    if (action === 'delete') {
      const { alias_id } = body
      if (!alias_id) return NextResponse.json({ error: 'alias_id requis' }, { status: 400 })
      const { error } = await supabase.from('supplier_aliases').delete().eq('id', alias_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ deleted: true })
    }

    // ── Auto-learn: called after a match is validated ──
    if (action === 'learn_from_match') {
      const { societe_id, bank_name, facture_name } = body
      if (!societe_id || !bank_name || !facture_name) {
        return NextResponse.json({ error: 'societe_id, bank_name, facture_name requis' }, { status: 400 })
      }

      const bankNorm = (bank_name as string).toLowerCase().replace(/[^a-z0-9\s.]/g, '').trim()
      const factNorm = (facture_name as string).toLowerCase().replace(/[^a-z0-9\s.]/g, '').trim()

      // Skip if they're already the same
      if (bankNorm === factNorm) return NextResponse.json({ skipped: true })

      // Check if an alias already exists for this bank name
      const { data: existing } = await supabase
        .from('supplier_aliases')
        .select('id, nb_used')
        .or(`societe_id.eq.${societe_id},societe_id.is.null`)
        .eq('alias', bankNorm)
        .maybeSingle()

      if (existing) {
        // Just increment usage counter
        await supabase.from('supplier_aliases')
          .update({ nb_used: (existing.nb_used || 0) + 1 })
          .eq('id', existing.id)
        return NextResponse.json({ updated: true, id: existing.id })
      }

      // Create new auto-learned alias
      const { data, error } = await supabase
        .from('supplier_aliases')
        .insert({
          societe_id,
          canonical: factNorm,
          alias: bankNorm,
          source: 'auto_learned',
          confidence: 0.8,
          nb_used: 1,
          created_by: user.id,
        })
        .select()
        .single()

      if (error) {
        // Might be a unique constraint violation — safe to ignore
        if (error.code === '23505') return NextResponse.json({ skipped: true })
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ learned: true, alias: data })
    }

    return NextResponse.json({ error: `Action inconnue: ${action}` }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
