import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAllReglesGlobales, type ConfigConge } from '@/lib/rh/types-conges'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * GET /api/rh/conges/regles
 *   -> règles globales Maurice (source = 'global')
 * GET /api/rh/conges/regles?societe_id=<uuid>
 *   -> merge règles société (override) + fallback globales pour les types non surchargés
 */
export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const supabase = getAdminClient()
    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')

    const globales = await getAllReglesGlobales(supabase)
    const merged: Record<string, ConfigConge> = { ...globales }

    if (societe_id) {
      const { data } = await supabase
        .from('conges_regles')
        .select('*')
        .eq('societe_id', societe_id)
        .eq('actif', true)
      for (const r of (data || []) as any[]) {
        merged[r.type_conge] = {
          jours_par_cycle: r.jours_par_cycle === null ? null : Number(r.jours_par_cycle),
          unite_cycle: r.unite_cycle,
          anciennete_min_mois: Number(r.anciennete_min_mois) || 0,
          basic_salary_max: r.basic_salary_max === null ? null : Number(r.basic_salary_max),
          exclu_migrant: Boolean(r.exclu_migrant),
          paye: Boolean(r.paye),
          deductible_de: Array.isArray(r.deductible_de) ? r.deductible_de : null,
          reference_wra: r.reference_wra,
          description: r.description,
          requiert_certificat_medical: Boolean(r.requiert_certificat_medical),
          requiert_acte_naissance: Boolean(r.requiert_acte_naissance),
          requiert_acte_deces: Boolean(r.requiert_acte_deces),
          requiert_convocation: Boolean(r.requiert_convocation),
          source: 'societe',
        }
      }
    }

    return NextResponse.json({ regles: merged, total: Object.keys(merged).length })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
