import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { CourrierPdf, type CourrierPdfData } from '@/lib/redaction/courrier-pdf'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** POST /api/redaction/pdf — rend un courrier professionnel en PDF. */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const data = (await request.json().catch(() => null)) as CourrierPdfData | null
    if (!data?.corps) return NextResponse.json({ error: 'Corps du courrier requis' }, { status: 400 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(CourrierPdf({ data }) as any)
    const slug = (data.objet || 'courrier').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${slug || 'courrier'}.pdf"`,
      },
    })
  } catch (e) {
    console.error('[redaction/pdf]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur PDF' }, { status: 500 })
  }
}
