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

      console.log(`[facture-template] Analyzing file: ${file.name}, size: ${file.size}`)
      let msg: any
      try {
        const stream = anthropic.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 8192,
          temperature: 0,
          messages: [{ role: 'user', content }],
        })
        msg = await stream.finalMessage()
      } catch (aiErr: any) {
        console.error('[facture-template] AI call failed:', aiErr.message)
        return NextResponse.json({ error: 'Erreur IA: ' + (aiErr.message || 'Appel Claude échoué') }, { status: 500 })
      }
      const text = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')

      // Parser robuste : supprime les fences markdown, les commentaires JS (//, /* */)
      // puis isole le premier objet JSON équilibré au lieu d'un .match() gourmand.
      const cleaned = text
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim()

      function extractFirstJsonObject(raw: string): string | null {
        const start = raw.indexOf('{')
        if (start < 0) return null
        let depth = 0
        let inString = false
        let escape = false
        for (let i = start; i < raw.length; i++) {
          const ch = raw[i]
          if (escape) { escape = false; continue }
          if (ch === '\\') { escape = true; continue }
          if (ch === '"') { inString = !inString; continue }
          if (inString) continue
          if (ch === '{') depth++
          else if (ch === '}') {
            depth--
            if (depth === 0) return raw.slice(start, i + 1)
          }
        }
        return null
      }

      let template: any
      try {
        const jsonStr = extractFirstJsonObject(cleaned)
        if (!jsonStr) throw new Error('Aucun objet JSON trouvé dans la réponse IA')
        template = JSON.parse(jsonStr)
      } catch (parseErr: any) {
        console.error('[facture-template] JSON parse failed:', parseErr.message)
        console.error('[facture-template] Raw text (first 2000 chars):', cleaned.substring(0, 2000))
        return NextResponse.json({
          error: 'Erreur analyse IA: ' + (parseErr.message || 'JSON invalide'),
          raw: cleaned.substring(0, 2000),
          stop_reason: msg?.stop_reason,
        }, { status: 500 })
      }

      // Sauvegarder le template
      const supabase = getAdminClient()

      // Nettoyage / sanitation des valeurs retournées par l'IA
      const baseName = (template.nom_template && String(template.nom_template).trim())
        || `Template ${file.name.replace(/\.[^.]+$/, '')}`

      // Parser tva_defaut proprement (l'IA peut retourner "15", "15%", 15, null, etc.)
      let tvaDefaut = 15
      const rawTva = template.taux_tva
      if (rawTva !== undefined && rawTva !== null) {
        const n = typeof rawTva === 'number'
          ? rawTva
          : parseFloat(String(rawTva).replace(/[^0-9.]/g, ''))
        if (!isNaN(n) && n >= 0 && n <= 100) tvaDefaut = n
      }

      // Générer un nom unique si un template avec ce nom existe déjà pour cette société
      let nom = baseName
      const existsQuery = supabase
        .from('facture_templates')
        .select('id, nom')
        .eq('nom', baseName)
        .limit(1)
      const { data: existing } = societe_id
        ? await existsQuery.eq('societe_id', societe_id).maybeSingle()
        : await existsQuery.is('societe_id', null).maybeSingle()

      if (existing) {
        const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
        nom = `${baseName} (${stamp})`
      }

      const payload = {
        societe_id: societe_id || null,
        nom,
        couleur_primaire: template.couleur_primaire || '#0B0F2E',
        couleur_secondaire: template.couleur_secondaire || '#D4AF37',
        logo_position: template.logo_position || 'top-left',
        entete_html: template.entete_html || '',
        pied_page_html: template.pied_page_html || '',
        colonnes: Array.isArray(template.colonnes) && template.colonnes.length
          ? template.colonnes
          : ['description', 'quantite', 'prix_unitaire', 'montant'],
        mentions_legales: template.mentions_legales || '',
        conditions_paiement: template.conditions_paiement || '',
        devise_defaut: template.devise || 'MUR',
        tva_defaut: tvaDefaut,
        format_numero: template.format_numero || 'INV-{YYYY}-{NNN}',
        style: template.style && typeof template.style === 'object' ? template.style : {},
        source_fichier: file.name,
        created_by: user.id,
        actif: true,
      }

      const { data, error } = await supabase
        .from('facture_templates')
        .insert(payload)
        .select()
        .single()

      if (error) {
        console.error('[facture-template] DB save failed:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        })
        return NextResponse.json({
          error: 'Sauvegarde en base échouée: ' + error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          template,
          saved: false,
        }, { status: 500 })
      }

      return NextResponse.json({ template: data, saved: true })
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
