import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { fetchDocText, chunkLoi } from '@/lib/juridique/rag/ingest-loi'
import { embedText, toPgvector, embeddingProvider } from '@/lib/juridique/rag/embeddings'
import {
  LISTINGS_JURISPRUDENCE,
  ARRETS_JURISPRUDENCE,
  getListingJurisprudence,
} from '@/lib/juridique/rag/sources-jurisprudence'
import {
  discoverJudgmentPdfUrls,
  detectCitation,
  keyFromPdfUrl,
} from '@/lib/juridique/rag/jurisprudence-crawl'
import type { DomaineJuridique } from '@/lib/juridique/referentielMauricien'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Garde-fous : limites raisonnables par appel pour rester sous maxDuration.
const MAX_JUGEMENTS = 12
const MAX_CHUNKS = 200

/**
 * /api/juridique/rag/crawl-jurisprudence — découvre puis ingère des jugements
 * mauriciens (Cour suprême / Industrial / Intermediate / District Court) dans
 * juridique_rag_corpus. Réservé admin/super_admin.
 *
 * Modes (body JSON) :
 *   { listingKey: 'jp-scm-recents' }   → crawle un listing du registre
 *   { listingUrl: 'https://…' }        → crawle un listing arbitraire
 *   { urls: ['https://…/x.pdf', …] }   → ingère des PDF de jugements donnés
 *   { arrets: true }                   → ingère les arrêts de référence du registre
 *   { source?: 'Jurisprudence', domaine?: 'procedure' } → métadonnées par défaut
 *
 * Pipeline par jugement : fetchDocText → chunkLoi → embedText → upsert.
 * Idempotent (delete slug LIKE prefix avant upsert). Résilient (try/catch par
 * jugement, rapport des erreurs).
 */
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    const { data: profile } = await supabaseAuth.from('profiles').select('role').eq('id', user.id).single()
    if (!['admin', 'super_admin'].includes(profile?.role || '')) {
      return NextResponse.json({ error: 'Réservé aux administrateurs' }, { status: 403 })
    }

    const b = await request.json().catch(() => ({})) as {
      listingKey?: string
      listingUrl?: string
      urls?: string[]
      arrets?: boolean
      source?: string
      domaine?: DomaineJuridique
    }

    const sourceDefaut = b.source || 'Jurisprudence'
    let domaineDefaut: DomaineJuridique = b.domaine || 'procedure'

    // 1) Détermine la liste des PDF de jugements à ingérer.
    let pdfUrls: string[] = []
    let mode = ''

    if (Array.isArray(b.urls) && b.urls.length > 0) {
      mode = 'urls'
      pdfUrls = b.urls.filter((u) => typeof u === 'string' && u.startsWith('http'))
    } else if (b.arrets) {
      mode = 'arrets'
      pdfUrls = ARRETS_JURISPRUDENCE.map((a) => a.url)
    } else {
      // Crawl d'un listing : depuis le registre (listingKey) ou URL arbitraire.
      const listing = b.listingKey ? getListingJurisprudence(b.listingKey) : undefined
      const listingUrl = listing?.listingUrl || b.listingUrl
      if (!listingUrl) {
        return NextResponse.json(
          {
            error: 'Fournir listingKey, listingUrl, urls[] ou arrets:true',
            listings: LISTINGS_JURISPRUDENCE.map((l) => l.key),
          },
          { status: 400 },
        )
      }
      mode = `listing:${listing?.key || listingUrl}`
      if (listing?.domaine) domaineDefaut = b.domaine || listing.domaine

      const res = await fetch(listingUrl, {
        headers: {
          // UA navigateur : certains sites gouvernementaux filtrent les bots.
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        },
      })
      if (!res.ok) {
        return NextResponse.json({ error: `Listing inaccessible (HTTP ${res.status})`, listingUrl }, { status: 502 })
      }
      const html = await res.text()
      pdfUrls = discoverJudgmentPdfUrls(html)
    }

    // Dédoublonnage + plafond.
    pdfUrls = [...new Set(pdfUrls)].slice(0, MAX_JUGEMENTS)
    if (pdfUrls.length === 0) {
      return NextResponse.json({ error: 'Aucun jugement découvert', mode }, { status: 404 })
    }

    // 2) Ingestion résiliente, jugement par jugement.
    const supabase = getAdminClient()
    const provider = embeddingProvider()
    const rapport: Array<{ key: string; reference?: string; chunks?: number; embedded?: number; erreur?: string }> = []

    for (const url of pdfUrls) {
      const key = keyFromPdfUrl(url)
      try {
        const text = await fetchDocText(url)
        const reference = detectCitation(text) || 'extrait'
        const chunks = chunkLoi(text).slice(0, MAX_CHUNKS)
        if (chunks.length === 0) {
          rapport.push({ key, erreur: 'aucun passage extrait' })
          continue
        }

        // Titre lisible dérivé du nom de fichier (sans l'extension).
        const fileTitre = (url.split('/').pop() || key)
          .replace(/\.pdf$/i, '')
          .replace(/[-_]+/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .trim()
        const titre = `${fileTitre} (${reference})`

        // Refresh : on supprime les anciens passages de ce jugement.
        await supabase.from('juridique_rag_corpus').delete().like('slug', `${key}#%`)

        let embedded = 0
        const rows: Record<string, unknown>[] = []
        for (let i = 0; i < chunks.length; i++) {
          const c = chunks[i]
          // Référence du passage : citation neutre du jugement + repère interne.
          const refPassage = chunks.length > 1 ? `${reference} — ${c.reference}` : reference
          const emb = await embedText(`${titre} ${refPassage}. ${c.texte}`, 'document')
          if (emb) embedded++
          const row: Record<string, unknown> = {
            slug: `${key}#${i + 1}`,
            domaine: domaineDefaut,
            source: sourceDefaut,
            reference: refPassage,
            titre: `${titre} — ${c.reference}`,
            texte: c.texte,
            url,
            maj: new Date().toISOString().slice(0, 7),
            updated_at: new Date().toISOString(),
          }
          const v = toPgvector(emb)
          if (v) row.embedding = v
          rows.push(row)
        }

        for (let i = 0; i < rows.length; i += 50) {
          const { error } = await supabase
            .from('juridique_rag_corpus')
            .upsert(rows.slice(i, i + 50), { onConflict: 'slug' })
          if (error) throw new Error(error.message)
        }
        rapport.push({ key, reference, chunks: chunks.length, embedded })
      } catch (err) {
        rapport.push({ key, erreur: err instanceof Error ? err.message : 'échec' })
      }
    }

    return NextResponse.json({
      ok: true,
      mode,
      jugements: pdfUrls.length,
      provider: provider || 'aucun (mode lexical)',
      rapport,
    })
  } catch (e) {
    console.error('[rag/crawl-jurisprudence]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur' }, { status: 500 })
  }
}
