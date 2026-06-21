import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { PvPdf, type PvPdfData } from '@/lib/juridique/pv-pdf'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** POST /api/juridique/societe/pv/pdf — rend un PV/acte de gouvernance en PDF. */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const data = (await request.json().catch(() => null)) as PvPdfData | null
    if (!data?.corps || !data?.titre || !data?.societe?.nom) {
      return NextResponse.json({ error: "Données de l'acte incomplètes" }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(PvPdf({ data }) as any)
    const slug = (data.titre || 'pv').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${slug || 'pv'}.pdf"`,
      },
    })
  } catch (e) {
    console.error('[juridique/societe/pv/pdf]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur PDF' }, { status: 500 })
  }
}
