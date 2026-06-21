import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { ContratPdf, type ContratPdfData } from '@/lib/juridique/contrat-pdf'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * /api/generate-contract/pdf — rend un contrat généré en PDF professionnel.
 * Body: ContratPdfData (type, corps, employeur, contractant, sources...).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const data = (await request.json().catch(() => null)) as ContratPdfData | null
    if (!data?.corps || !data?.type) {
      return NextResponse.json({ error: 'Données du contrat incomplètes' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(ContratPdf({ data }) as any)
    const slug = (data.type || 'contrat').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${slug || 'contrat'}.pdf"`,
      },
    })
  } catch (e) {
    console.error('[generate-contract/pdf]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur PDF' }, { status: 500 })
  }
}
