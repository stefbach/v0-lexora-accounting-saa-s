"use client"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FolderOpen, Loader2, Download, FileText, CreditCard, ShieldCheck } from "lucide-react"
import { NAVY, GOLD, BLUE, GREEN } from "../shared/constants"

type SalarieDocument = {
  id: string
  source_id: string
  categorie: 'contrat' | 'bulletin'
  type: string
  titre: string
  date: string | null
  statut: string
  url: string
  periode?: string
  salaire_net?: number
}

// Sprint salarie V1.5 — lecture seule des documents aggregés par
// /api/salarie/documents (contrats signés + bulletins de paie validés).
// L'upload côté salarié sera une phase ultérieure.
export function DocumentsTab({ employe: _employe }: { employe: any }) {
  const [docs, setDocs] = useState<SalarieDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch("/api/salarie/documents")
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(data.error || "Impossible de charger les documents")
          setDocs([])
        } else {
          setDocs(data.documents || [])
        }
      } catch {
        if (!cancelled) setError("Erreur réseau")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const contrats = docs.filter(d => d.categorie === 'contrat')
  const bulletins = docs.filter(d => d.categorie === 'bulletin')

  return (
    <div className="space-y-4">
      <Card className="rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
            <FolderOpen className="h-4 w-4" style={{ color: GOLD }} />
            Mes documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : error ? (
            <p className="text-sm text-red-600 text-center py-8">{error}</p>
          ) : docs.length === 0 ? (
            <p className="text-gray-400 text-center py-8 text-sm">Aucun document disponible.</p>
          ) : (
            <div className="space-y-5">
              {contrats.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5" style={{ color: GREEN }} />
                    Contrats
                  </p>
                  <div className="space-y-2">
                    {contrats.map(d => (
                      <DocumentRow key={d.id} doc={d} />
                    ))}
                  </div>
                </div>
              )}

              {bulletins.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-2">
                    <CreditCard className="h-3.5 w-3.5" style={{ color: BLUE }} />
                    Bulletins de paie
                  </p>
                  <div className="space-y-2">
                    {bulletins.map(d => (
                      <DocumentRow key={d.id} doc={d} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function DocumentRow({ doc }: { doc: SalarieDocument }) {
  const icon = doc.categorie === 'contrat'
    ? <FileText className="h-4 w-4" style={{ color: GREEN }} />
    : <CreditCard className="h-4 w-4" style={{ color: BLUE }} />
  const accent = doc.categorie === 'contrat' ? GREEN : BLUE
  const statutLabel: Record<string, string> = {
    signe: "Signé ✓✓",
    signe_employe: "En attente employeur",
    valide: "Validé",
    paye: "Payé",
    declare_mra: "Déclaré MRA",
  }
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border bg-white" style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}12` }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: NAVY }}>{doc.titre}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
          <Badge variant="outline" className="text-[10px] py-0 px-1.5" style={{ borderColor: accent, color: accent }}>
            {statutLabel[doc.statut] || doc.statut}
          </Badge>
          {doc.date && (
            <span>{new Date(doc.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</span>
          )}
        </div>
      </div>
      <a href={doc.url} target="_blank" rel="noopener noreferrer">
        <Button size="sm" variant="outline" className="shrink-0 text-xs h-8">
          <Download className="h-3 w-3 mr-1" /> PDF
        </Button>
      </a>
    </div>
  )
}
