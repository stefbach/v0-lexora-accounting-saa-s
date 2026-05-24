"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader2, Paperclip, ArrowRight } from "lucide-react"
import {
  CATEGORIE_LABELS, formaterTaille, getIconeMimeType,
  type DocumentRH,
} from "@/lib/rh/documents-rh"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

/**
 * DOC1 — Widget dashboard RH : docs reçus de l'employé NON LUS (pending).
 *
 * Fetch les 10 premiers docs avec :
 *   direction = employe_vers_rh
 *   vu_par_destinataire_le = NULL
 *   archive = false
 *
 * On passe par /api/documents-rh?archive=false puis on filtre côté client
 * (l'API n'expose pas un filtre 'non_vus', mais le volume est faible).
 */
export function DocumentsEnAttenteWidget() {
  const [docs, setDocs] = useState<DocumentRH[]>([])
  const [loading, setLoading] = useState(true)
  const [empMap, setEmpMap] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    // Fetch tous les docs actifs (RLS limite à ceux de la société RH).
    fetch('/api/documents-rh?archive=false')
      .then(r => r.ok ? r.json() : { documents: [] })
      .then(async d => {
        if (cancelled) return
        const all = (d?.documents || []) as DocumentRH[]
        const enAttente = all
          .filter(x => x.direction === 'employe_vers_rh' && !x.vu_par_destinataire_le)
          .slice(0, 10)
        setDocs(enAttente)

        // Résoudre les noms des employés.
        const ids = Array.from(new Set(enAttente.map(x => x.employe_id)))
        if (ids.length > 0) {
          try {
            const params = new URLSearchParams({ ids: ids.join(',') })
            const er = await fetch(`/api/rh/employes?${params.toString()}`)
            if (er.ok) {
              const ej = await er.json()
              const map: Record<string, string> = {}
              for (const e of (ej?.employes || []) as any[]) {
                if (e?.id) map[e.id] = `${e.prenom || ''} ${e.nom || ''}`.trim() || e.email || e.id
              }
              if (!cancelled) setEmpMap(map)
            }
          } catch { /* noop */ }
        }
      })
      .catch(() => { if (!cancelled) setDocs([]) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement des documents…
        </CardContent>
      </Card>
    )
  }

  if (docs.length === 0) return null // Silencieux si rien à afficher

  return (
    <Card className="border-2 border-amber-200 bg-amber-50/50 shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold text-sm flex items-center gap-2" style={{ color: NAVY }}>
            <Paperclip className="h-4 w-4" style={{ color: GOLD }} />
            Documents reçus non lus
            <Badge className="bg-red-500 text-white text-[10px]">{docs.length}</Badge>
          </p>
          <Link href="/rh/employes">
            <Button variant="outline" size="sm" className="text-xs h-7">
              Voir tout <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
        <ul className="space-y-1.5">
          {docs.map(d => {
            const empNom = empMap[d.employe_id] || '—'
            return (
              <li key={d.id}>
                <Link href={`/rh/employes/${d.employe_id}#documents`} className="block">
                  <div className="flex items-center gap-2 text-xs hover:bg-white rounded-md px-2 py-1.5 transition-colors">
                    <span className="text-base shrink-0">{getIconeMimeType(d.mime_type)}</span>
                    <span className="font-semibold text-gray-700 truncate" title={d.nom_fichier_original}>
                      {CATEGORIE_LABELS[d.categorie]}
                    </span>
                    <span className="text-gray-500 truncate">— {empNom}</span>
                    <span className="ml-auto text-[10px] text-gray-400 shrink-0">
                      {formaterTaille(d.taille_octets)}
                    </span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
