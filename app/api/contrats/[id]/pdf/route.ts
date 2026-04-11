import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/contrats/[id]/pdf — Exporter le contrat (retourne le HTML pour impression)
// Note: Pour la génération PDF réelle, intégrer une lib comme Puppeteer ou wkhtmltopdf
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { data: contrat, error } = await supabase
      .from('contrats_clients')
      .select('contenu_html, titre, reference')
      .eq('id', id)
      .single()

    if (error || !contrat?.contenu_html) {
      return NextResponse.json({ error: 'Contrat ou contenu introuvable' }, { status: 404 })
    }

    // Retourner le HTML avec headers pour le browser (impression/save as PDF)
    return new Response(contrat.contenu_html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${contrat.reference || contrat.titre}.html"`,
      },
    })
  } catch (error) {
    console.error('POST /api/contrats/[id]/pdf:', error)
    return NextResponse.json({ error: 'Erreur export' }, { status: 500 })
  }
}
