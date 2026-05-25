// Server Component shell — fetches initial document data on the server,
// then hands off interactivity to <DocumentDetailClient />.
// Migration RSC V4-33 : remplace l'ancienne page "use client" qui faisait
// un fetch côté navigateur après mount. Le TTFB est amélioré (pas de
// waterfall fetch -> render) et le HTML initial contient déjà le document.
//
// L'auth / access control reste géré par /api/documents/[id] (lui-même
// branché sur le serveur Supabase) — on l'appelle côté serveur en
// forwardant les cookies de la requête entrante.

import { headers } from "next/headers"
import DocumentDetailClient from "./DocumentDetailClient"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ id: string }>
}

async function fetchInitialDocument(docId: string): Promise<{ document: any | null; error: string | null }> {
  try {
    const h = await headers()
    const cookie = h.get("cookie") || ""
    const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000"
    const proto = h.get("x-forwarded-proto") || "https"
    const baseUrl = `${proto}://${host}`

    const res = await fetch(`${baseUrl}/api/documents/${docId}`, {
      headers: { cookie },
      cache: "no-store",
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { document: null, error: body?.error || `HTTP ${res.status}` }
    }

    const data = await res.json()
    return { document: data.document || null, error: null }
  } catch (err: any) {
    return { document: null, error: err?.message || "Erreur de chargement" }
  }
}

export default async function DocumentDetailPage({ params }: PageProps) {
  const { id } = await params
  const { document, error } = await fetchInitialDocument(id)

  return (
    <DocumentDetailClient
      docId={id}
      initialDocument={document}
      initialError={error}
    />
  )
}
