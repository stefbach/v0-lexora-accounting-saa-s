import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const contentType = request.headers.get('content-type') || ''

    // Upload ancienne facture → IA analyse et extrait le template
    if (contentType.includes('multipart')) {
      const formData = await request.formData()
      const file = formData.get('file') as File
      const societe_id = formData.get('societe_id') as string
      if (!file) return NextResponse.json({ error: 'Fichier requis' }, { status: 400 })

      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

      const buffer = await file.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
      const isPdf = ext === 'pdf'
      const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)

      let content: any[]
      if (isPdf) {
        content = [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: ANALYZE_PROMPT },
        ]
      } else if (isImage) {
        content = [
          { type: 'image', source: { type: 'base64', media_type: ext === 'png' ? 'image/png' : 'image/jpeg', data: base64 } },
          { type: 'text', text: ANALYZE_PROMPT },
        ]
      } else {
        return NextResponse.json({ error: 'Format non supporté. Utilisez PDF, JPG ou PNG.' }, { status: 400 })
      }

      const stream = anthropic.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: 'user', content }],
      })
      const msg = await stream.finalMessage()
      const text = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
      const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

      let template: any
      try {
        template = JSON.parse(cleaned.match(/\{[\s\S]*\}/)?.[0] || '{}')
      } catch {
        return NextResponse.json({ error: 'Erreur analyse IA', raw: cleaned.substring(0, 500) }, { status: 500 })
      }

      // Sauvegarder le template
      const supabase = getAdminClient()
      const { data, error } = await supabase.from('facture_templates').upsert({
        societe_id: societe_id || null,
        nom: template.nom_template || `Template ${file.name}`,
        couleur_primaire: template.couleur_primaire || '#1E2A4A',
        couleur_secondaire: template.couleur_secondaire || '#C9A84C',
        logo_position: template.logo_position || 'top-left',
        entete_html: template.entete_html || '',
        pied_page_html: template.pied_page_html || '',
        colonnes: template.colonnes || ['description', 'quantite', 'prix_unitaire', 'montant'],
        mentions_legales: template.mentions_legales || '',
        conditions_paiement: template.conditions_paiement || '',
        devise_defaut: template.devise || 'MUR',
        tva_defaut: template.taux_tva ?? 15,
        format_numero: template.format_numero || 'INV-{YYYY}-{NNN}',
        style: template.style || {},
        source_fichier: file.name,
        created_by: user.id,
      }, { onConflict: 'societe_id,nom' }).select().single()

      if (error) {
        // Table might not exist — return template without saving
        return NextResponse.json({ template, saved: false, message: 'Template analysé mais non sauvegardé: ' + error.message })
      }

      return NextResponse.json({ template: data || template, saved: true })
    }

    // JSON body — other actions
    const body = await request.json()

    if (body.action === 'list') {
      const supabase = getAdminClient()
      const { data } = await supabase.from('facture_templates').select('*').order('created_at', { ascending: false })
      return NextResponse.json({ templates: data || [] })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: any) {
    console.error('[facture-template]', e)
    return NextResponse.json({ error: e.message || 'Erreur' }, { status: 500 })
  }
}

const ANALYZE_PROMPT = `Analyse cette facture et extrais le TEMPLATE de mise en page (pas les données). Retourne UNIQUEMENT un JSON valide:

{
  "nom_template": "Template basé sur [nom entreprise]",
  "couleur_primaire": "#hex",
  "couleur_secondaire": "#hex",
  "logo_position": "top-left|top-center|top-right",
  "format_numero": "INV-{YYYY}-{NNN}",
  "devise": "MUR|EUR|USD",
  "taux_tva": 15,
  "colonnes": ["description", "quantite", "prix_unitaire", "montant"],
  "entete_html": "<div>...structure HTML de l'en-tête avec placeholders {{nom_societe}}, {{adresse}}, {{brn}}, {{tva_number}}, {{telephone}}, {{email}}...</div>",
  "pied_page_html": "<div>...pied de page avec {{conditions_paiement}}, {{mentions_legales}}, {{coordonnees_bancaires}}...</div>",
  "mentions_legales": "texte des mentions légales détecté",
  "conditions_paiement": "conditions de paiement détectées (ex: Net 30 jours)",
  "style": {
    "police": "nom de la police détectée",
    "taille_titre": "18px",
    "taille_corps": "12px",
    "bordures_tableau": true,
    "alternance_lignes": true,
    "fond_entete_tableau": "#hex"
  }
}

IMPORTANT:
- Analyse la MISE EN PAGE, pas les données
- Détecte les couleurs utilisées (en-tête, texte, bordures)
- Détecte la structure du tableau (colonnes, alignement)
- Détecte le format du numéro de facture
- Extrais les mentions légales et conditions de paiement
- Le HTML doit utiliser des placeholders {{variable}} pour les données dynamiques
- Le template doit être réutilisable pour générer de nouvelles factures`
