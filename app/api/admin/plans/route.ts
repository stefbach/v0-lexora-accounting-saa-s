import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) return null
  return user
}

// Slugifie le code (kebab-case ASCII)
function toCode(s: string): string {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

const NORMALIZED_KEYS = [
  // Modules /tarifs
  'documents','comptabilite','facturation','rh','fiscal',
  'alertes_ia','tibok','telegram',
  // Sous-modules avancés internes
  'juridique','etats_financiers','employe_portal',
] as const

function normalizeModules(input: any): Record<string, boolean> {
  const src = (input && typeof input === 'object') ? input as Record<string, unknown> : {}
  const out: Record<string, boolean> = {}
  for (const k of NORMALIZED_KEYS) out[k] = src[k] === true
  return out
}

// GET — liste tous les plans (avec filtre optionnel type_cible)
export async function GET(req: Request) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const url = new URL(req.url)
  const type = url.searchParams.get('type_cible')
  const admin = getAdminClient()
  let q = admin.from('plans').select('*').order('type_cible', { ascending: true }).order('ordre', { ascending: true })
  if (type && type !== 'all') q = q.eq('type_cible', type)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plans: data || [] })
}

// POST — crée un plan
export async function POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))

  if (!body.nom || !body.type_cible) {
    return NextResponse.json({ error: 'nom et type_cible requis' }, { status: 400 })
  }
  if (!['dirigeant', 'comptable'].includes(body.type_cible)) {
    return NextResponse.json({ error: 'type_cible doit être dirigeant ou comptable' }, { status: 400 })
  }

  const code = body.code ? toCode(body.code) : toCode(body.nom)
  const admin = getAdminClient()
  const payload = {
    code,
    nom: String(body.nom).trim(),
    description: body.description || null,
    type_cible: body.type_cible,
    prix_mensuel_mur: Number(body.prix_mensuel_mur) || 0,
    prix_annuel_mur:  body.prix_annuel_mur != null ? Number(body.prix_annuel_mur) : null,
    modules_inclus: normalizeModules(body.modules_inclus),
    populaire: !!body.populaire,
    ordre: body.ordre != null ? Number(body.ordre) : 100,
    actif: body.actif !== false,
  }
  const { data, error } = await admin.from('plans').insert(payload).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plan: data })
}
