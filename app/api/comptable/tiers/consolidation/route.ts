import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { resolveUserAuth } from '@/lib/supabase/auth-resolver'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Normalisation d un nom de tiers pour detection de variantes
function normalize(s: string): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .replace(/\b(ltd|limited|sarl|sa|co|inc|pvt|private|mauritius|\(mauritius\)|mau|corp|corporation|sas)\b\.?/gi, '')
    .replace(/\b(mr|mrs|ms|mme|monsieur|madame|m\.|sir)\b\.?/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Similarite entre 2 chaines normalisees (0-1, 1 = identique)
function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.length < 3 || b.length < 3) return 0
  if (a.includes(b) || b.includes(a)) return 0.9
  const wA = new Set(a.split(/\s+/).filter(w => w.length > 2))
  const wB = new Set(b.split(/\s+/).filter(w => w.length > 2))
  if (wA.size === 0 || wB.size === 0) return 0
  const inter = [...wA].filter(w => wB.has(w)).length
  const union = new Set([...wA, ...wB]).size
  return inter / union
}

/**
 * GET /api/comptable/tiers/suggestions?societe_id=xxx&min_similarity=0.65
 *   Detecte les groupes de variantes (nom similaire) a consolider.
 *   Scanne : factures.tiers + comptes_courants_associes.nom
 */
export async function GET(request: Request) {
  try {
    // FIX MCP : resolveUserAuth pour outil MCP `list_tiers` (annuaire consolidé).
    const user = await resolveUserAuth(request)
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const minSim = parseFloat(searchParams.get('min_similarity') || '0.65')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()

    // Collecter tous les tiers utilises
    const [{ data: factures }, { data: ccas }] = await Promise.all([
      supabase.from('factures').select('tiers, type_facture, montant_ttc').eq('societe_id', societe_id),
      supabase.from('comptes_courants_associes').select('nom, type, solde').eq('societe_id', societe_id),
    ])

    type TiersInfo = {
      raw: string
      normalized: string
      sources: { kind: 'facture' | 'cca'; type?: string; count: number; total?: number }[]
    }

    const byNorm: Record<string, TiersInfo> = {}
    for (const f of factures || []) {
      const raw = (f.tiers || '').trim()
      if (!raw) continue
      const norm = normalize(raw)
      if (!norm) continue
      if (!byNorm[raw]) {
        byNorm[raw] = { raw, normalized: norm, sources: [] }
      }
      const exSrc = byNorm[raw].sources.find(s => s.kind === 'facture' && s.type === f.type_facture)
      if (exSrc) {
        exSrc.count++
        exSrc.total = (exSrc.total || 0) + (Number(f.montant_ttc) || 0)
      } else {
        byNorm[raw].sources.push({
          kind: 'facture',
          type: f.type_facture,
          count: 1,
          total: Number(f.montant_ttc) || 0,
        })
      }
    }
    for (const c of ccas || []) {
      const raw = (c.nom || '').trim()
      if (!raw) continue
      const norm = normalize(raw)
      if (!norm) continue
      if (!byNorm[raw]) {
        byNorm[raw] = { raw, normalized: norm, sources: [] }
      }
      const exSrc = byNorm[raw].sources.find(s => s.kind === 'cca')
      if (exSrc) {
        exSrc.count++
        exSrc.total = (exSrc.total || 0) + (Number(c.solde) || 0)
      } else {
        byNorm[raw].sources.push({
          kind: 'cca',
          type: c.type,
          count: 1,
          total: Number(c.solde) || 0,
        })
      }
    }

    const items = Object.values(byNorm)

    // Grouper par similarite
    const visited = new Set<string>()
    const groups: Array<{
      key: string
      canonical: string // nom propose (le plus long/complet)
      variants: TiersInfo[]
      similarities: number[]
    }> = []

    for (let i = 0; i < items.length; i++) {
      const a = items[i]
      if (visited.has(a.raw)) continue
      const group = [a]
      const sims = [1]
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j]
        if (visited.has(b.raw)) continue
        const s = similarity(a.normalized, b.normalized)
        if (s >= minSim) {
          group.push(b)
          sims.push(s)
          visited.add(b.raw)
        }
      }
      if (group.length >= 2) {
        visited.add(a.raw)
        // Canonique : le plus long (suppose etre le plus complet)
        const canonical = group.map(g => g.raw).sort((x, y) => y.length - x.length)[0]
        groups.push({
          key: a.normalized,
          canonical,
          variants: group,
          similarities: sims,
        })
      }
    }

    return NextResponse.json({
      societe_id,
      groups,
      total_groups: groups.length,
      total_tiers_scanned: items.length,
    })
  } catch (e: any) {
    console.error('[tiers suggestions]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * POST /api/comptable/tiers/consolidate
 *   body: { societe_id, canonical_name, variants: string[] }
 *   Remplace toutes les occurrences des variants par canonical_name
 *   dans factures + comptes_courants_associes.
 */
export async function POST(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 })

    const body = await request.json()
    const { societe_id, canonical_name, variants } = body
    if (!societe_id || !canonical_name || !Array.isArray(variants) || variants.length === 0) {
      return NextResponse.json({
        error: 'societe_id, canonical_name et variants[] requis',
      }, { status: 400 })
    }

    const supabase = getAdminClient()
    const toReplace = variants.filter(v => v && v !== canonical_name)
    if (toReplace.length === 0) {
      return NextResponse.json({ success: true, message: 'Aucune variante a consolider' })
    }

    // Factures : renommer tiers
    const { data: facturesUpd, error: factErr } = await supabase
      .from('factures')
      .update({ tiers: canonical_name })
      .eq('societe_id', societe_id)
      .in('tiers', toReplace)
      .select('id')
    if (factErr) return NextResponse.json({ error: `Factures : ${factErr.message}` }, { status: 500 })

    // CCA : fusionner les comptes courants avec memes variantes
    // 1. Trouver le compte courant canonique (existant ou a creer)
    let { data: canonicalCca } = await supabase
      .from('comptes_courants_associes')
      .select('id, solde')
      .eq('societe_id', societe_id)
      .ilike('nom', canonical_name)
      .limit(1)
      .maybeSingle()

    // 2. Lister les CCAs des variantes
    const { data: ccasVariants } = await supabase
      .from('comptes_courants_associes')
      .select('id, nom, solde')
      .eq('societe_id', societe_id)
      .in('nom', toReplace)

    let mergedCcaCount = 0
    let mergedMvtCount = 0
    if (ccasVariants && ccasVariants.length > 0) {
      // Creer le canonique si absent
      if (!canonicalCca) {
        const { data: newCca } = await supabase
          .from('comptes_courants_associes')
          .insert({ societe_id, nom: canonical_name, type: 'associe', solde: 0 })
          .select('id, solde')
          .single()
        canonicalCca = newCca
      }
      if (canonicalCca) {
        const canonicalId = canonicalCca.id
        let newSolde = Number(canonicalCca.solde || 0)
        for (const v of ccasVariants) {
          // Migrer les mouvements
          const { data: mvts } = await supabase
            .from('mouvements_compte_courant')
            .update({ compte_courant_id: canonicalId })
            .eq('compte_courant_id', v.id)
            .select('id')
          mergedMvtCount += (mvts?.length || 0)
          newSolde += Number(v.solde || 0)
          // Supprimer le CCA variant
          await supabase.from('comptes_courants_associes').delete().eq('id', v.id)
          mergedCcaCount++
        }
        // Maj du solde canonique
        await supabase
          .from('comptes_courants_associes')
          .update({ solde: Math.round(newSolde * 100) / 100, updated_at: new Date().toISOString() })
          .eq('id', canonicalId)
      }
    }

    return NextResponse.json({
      success: true,
      canonical_name,
      factures_renamed: facturesUpd?.length || 0,
      cca_merged: mergedCcaCount,
      mouvements_migrated: mergedMvtCount,
    })
  } catch (e: any) {
    console.error('[tiers consolidate]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
