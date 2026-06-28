import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@/lib/supabase/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { RegistrePdf, type RegistrePdfData } from '@/lib/juridique/registre-pdf'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** POST /api/juridique/societe/registre/pdf — rend un registre légal en PDF. */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const data = (await request.json().catch(() => null)) as RegistrePdfData | null
    if (!data?.titre || !data?.societe?.nom || !Array.isArray(data?.columns) || !Array.isArray(data?.rows)) {
      return NextResponse.json({ error: 'Données du registre incomplètes' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(RegistrePdf({ data }) as any)
    const slug = (data.titre || 'registre').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${slug || 'registre'}.pdf"`,
      },
    })
  } catch (e) {
    console.error('[juridique/societe/registre/pdf]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur PDF' }, { status: 500 })
  }
}
