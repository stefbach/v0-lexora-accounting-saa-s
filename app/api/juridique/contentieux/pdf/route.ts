import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { ActePdf, type ActePdfData } from '@/lib/juridique/acte-pdf'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * /api/juridique/contentieux/pdf — rend un acte juridique en PDF professionnel.
 * Body: ActePdfData (titre, corps, emetteur, destinataire, objet, montant...).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const data = (await request.json().catch(() => null)) as ActePdfData | null
    if (!data?.corps || !data?.emetteur?.nom || !data?.destinataire?.nom) {
      return NextResponse.json({ error: 'Données de l’acte incomplètes' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(ActePdf({ data }) as any)
    const slug = (data.titre || 'acte').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${slug || 'acte-juridique'}.pdf"`,
      },
    })
  } catch (e) {
    console.error('[juridique/contentieux/pdf]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur PDF' }, { status: 500 })
  }
}
