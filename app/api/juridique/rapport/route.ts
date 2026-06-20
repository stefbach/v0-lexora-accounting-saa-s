import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { RapportPdf, type RapportData } from '@/lib/juridique/rapport-pdf'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * /api/juridique/rapport — compile une consultation (questions/analyses/sources)
 * en rapport PDF professionnel à en-tête cabinet.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const data = (await request.json().catch(() => null)) as RapportData | null
    if (!data?.exchanges?.length) {
      return NextResponse.json({ error: 'Aucun échange à compiler' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(RapportPdf({ data }) as any)
    const slug = (data.title || 'rapport-juridique').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${slug || 'rapport'}.pdf"`,
      },
    })
  } catch (e) {
    console.error('[juridique/rapport]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur PDF' }, { status: 500 })
  }
}
