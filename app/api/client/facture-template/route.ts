import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { assertSocieteAccess, mapSocieteAccessError } from '@/lib/supabase/assert-societe-access'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
export const runtime = 'nodejs'

// Limits
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB
const MAX_TOKENS = 8192

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
      const consignes = String(formData.get('consignes') || '').trim()
      if (!file) return NextResponse.json({ error: 'Fichier requis' }, { status: 400 })
      if (!societe_id) {
        return NextResponse.json({ error: 'societe_id requis — plus de templates globaux' }, { status: 400 })
      }
      await assertSocieteAccess(getAdminClient(), user.id, societe_id)

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({
          error: `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum ${MAX_FILE_SIZE / 1024 / 1024} MB.`,
        }, { status: 413 })
      }

      if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json({
          error: 'ANTHROPIC_API_KEY manquante côté serveur. Contactez l\'administrateur.',
        }, { status: 503 })
      }

      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

      const buffer = await file.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
      const mimeFromHeader = (file.type || '').toLowerCase()

      // Détection robuste : on privilégie le MIME type fourni par le navigateur
      // puis on retombe sur l'extension. Les fichiers .xlsx renommés en .pdf
      // sont rejetés avant d'atteindre Claude.
      const isPdf = mimeFromHeader === 'application/pdf' || ext === 'pdf'
      const isPng = mimeFromHeader === 'image/png' || ext === 'png'
      const isJpeg = mimeFromHeader === 'image/jpeg' || mimeFromHeader === 'image/jpg' || ['jpg', 'jpeg'].includes(ext)
      const isWebp = mimeFromHeader === 'image/webp' || ext === 'webp'

      // Sanity check sur les magic bytes
      const head = Buffer.from(buffer).subarray(0, 8)
      const headHex = head.toString('hex')
      const isPdfMagic = headHex.startsWith('25504446') // %PDF
      const isPngMagic = headHex.startsWith('89504e47')
      const isJpegMagic = headHex.startsWith('ffd8ff')
      const isWebpMagic = head.subarray(0, 4).toString('ascii') === 'RIFF'

      console.log(`[facture-template] file=${file.name} size=${file.size} mime=${mimeFromHeader} ext=${ext} magic=${headHex.substring(0, 8)}`)

      // Construit le prompt d'analyse en intégrant les consignes libres de
      // l'utilisateur (le cas échéant). Les consignes sont une information
      // de premier ordre : si elles contredisent ce que l'IA aurait deviné,
      // elles prévalent (couleurs, format de numéro, mentions, etc.).
      const analyzePromptWithConsignes = consignes
        ? `${ANALYZE_PROMPT}\n\nCONSIGNES UTILISATEUR (à respecter en priorité, elles prévalent sur ce que tu déduirais du document) :\n${consignes}`
        : ANALYZE_PROMPT

      let content: any[]
      if (isPdf && isPdfMagic) {
        content = [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: analyzePromptWithConsignes },
        ]
      } else if ((isPng && isPngMagic) || (isJpeg && isJpegMagic) || (isWebp && isWebpMagic)) {
        const media_type = isPng ? 'image/png' : isWebp ? 'image/webp' : 'image/jpeg'
        content = [
          { type: 'image', source: { type: 'base64', media_type, data: base64 } },
          { type: 'text', text: analyzePromptWithConsignes },
        ]
      } else if (isPdf && !isPdfMagic) {
        return NextResponse.json({
          error: `Le fichier porte l'extension .pdf mais n'est pas un vrai PDF (magic bytes: ${headHex.substring(0, 8)}). Est-ce un Excel/Word renommé ?`,
        }, { status: 400 })
      } else {
        return NextResponse.json({
          error: `Format non supporté. Utilisez PDF, JPG, PNG ou WebP. (mime=${mimeFromHeader}, ext=${ext})`,
        }, { status: 400 })
      }

      console.log(`[facture-template] Calling Claude (model=claude-sonnet-4-6, max_tokens=${MAX_TOKENS})...`)
      let msg: any
      const t0 = Date.now()
      try {
        // Use create() instead of stream() — simpler, no overhead, respects timeout
        msg = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: MAX_TOKENS,
          temperature: 0,
          messages: [{ role: 'user', content }],
        })
      } catch (aiErr: any) {
        const dt = Date.now() - t0
        console.error(`[facture-template] AI call failed after ${dt}ms:`, aiErr.message, aiErr.status, aiErr.error)
        return NextResponse.json({
          error: 'Erreur IA: ' + (aiErr.message || 'Appel Claude échoué'),
          status: aiErr.status || null,
          details: aiErr.error?.message || aiErr.error || null,
          duration_ms: dt,
        }, { status: 500 })
      }
      const dt = Date.now() - t0
      console.log(`[facture-template] Claude responded in ${dt}ms, stop_reason=${msg.stop_reason}, usage=${JSON.stringify(msg.usage)}`)

      const text = (msg.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
      if (!text) {
        return NextResponse.json({
          error: 'Réponse IA vide (aucun bloc texte).',
          stop_reason: msg.stop_reason,
          content_blocks: (msg.content || []).map((b: any) => b.type),
        }, { status: 500 })
      }

      // Parser robuste : supprime les fences markdown puis isole le premier
      // objet JSON équilibré au lieu d'un .match() gourmand.
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
        // Stop reason == 'max_tokens' → troncature, message spécifique
        const truncated = msg?.stop_reason === 'max_tokens'
        return NextResponse.json({
          error: truncated
            ? `Réponse IA tronquée (max_tokens=${MAX_TOKENS} atteint). Essayez un template plus simple ou contactez l'administrateur.`
            : 'Erreur analyse IA: ' + (parseErr.message || 'JSON invalide'),
          raw: cleaned.substring(0, 2000),
          stop_reason: msg?.stop_reason,
          truncated,
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
      const { data: existing } = await existsQuery.eq('societe_id', societe_id).maybeSingle()

      if (existing) {
        const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
        nom = `${baseName} (${stamp})`
      }

      const payload = {
        societe_id,
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
        consignes_ia: consignes || null,
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
      const societe_id: string | undefined = body.societe_id
      if (!societe_id) {
        return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
      }
      const supabase = getAdminClient()
      await assertSocieteAccess(supabase, user.id, societe_id)
      const { data, error } = await supabase
        .from('facture_templates')
        .select('*')
        .eq('societe_id', societe_id)
        .eq('actif', true)
        .order('created_at', { ascending: false })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ templates: data || [] })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (e: unknown) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    console.error('[facture-template]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

// DELETE — Suppression douce (actif=false) d'un template IA.
// Body : { id: string, societe_id: string }
export async function DELETE(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const { id, societe_id } = await request.json()
    if (!id || !societe_id) {
      return NextResponse.json({ error: 'id et societe_id requis' }, { status: 400 })
    }

    const supabase = getAdminClient()
    await assertSocieteAccess(supabase, user.id, societe_id)

    const { error } = await supabase
      .from('facture_templates')
      .update({ actif: false })
      .eq('id', id)
      .eq('societe_id', societe_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: true })
  } catch (e: unknown) {
    const mapped = mapSocieteAccessError(e)
    if (mapped) return NextResponse.json(mapped.body, { status: mapped.status })
    console.error('[facture-template DELETE]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}

const ANALYZE_PROMPT = `Analyse cette facture et extrais UNIQUEMENT les métadonnées de mise en page — PAS les données (montants, clients, lignes).

Retourne UNIQUEMENT un objet JSON valide (pas de texte avant ou après, pas de markdown) avec ces champs :

{
  "nom_template": "Template basé sur [nom entreprise détecté]",
  "couleur_primaire": "#hex",
  "couleur_secondaire": "#hex",
  "logo_position": "top-left|top-center|top-right",
  "format_numero": "INV-{YYYY}-{NNN}",
  "devise": "MUR|EUR|USD|GBP",
  "taux_tva": 15,
  "colonnes": ["description", "quantite", "prix_unitaire", "montant"],
  "entete_html": "<div>...court template HTML <500 chars avec placeholders {{nom_societe}}, {{adresse}}, {{brn}}, {{tva_number}}, {{telephone}}, {{email}}...</div>",
  "pied_page_html": "<div>...court <500 chars avec {{conditions_paiement}}, {{mentions_legales}}, {{coordonnees_bancaires}}</div>",
  "mentions_legales": "texte court <300 chars",
  "conditions_paiement": "ex: Net 30 jours",
  "style": {
    "police": "nom de police",
    "taille_titre": "18px",
    "taille_corps": "12px",
    "bordures_tableau": true,
    "alternance_lignes": true,
    "fond_entete_tableau": "#hex"
  }
}

CONTRAINTES STRICTES :
- Réponse uniquement en JSON, AUCUN texte avant ou après
- Pas de commentaires JS, pas de virgule finale, pas de markdown
- entete_html et pied_page_html doivent rester COURTS (<500 chars chacun)
- Utilise UNIQUEMENT des placeholders {{variable}}, pas de vraies données
- Si une info n'est pas détectable, utilise une valeur par défaut raisonnable (pas de null)`
