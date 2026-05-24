"use client"

/**
 * Modal d'historique de versions d'un relevé bancaire.
 *
 * Ouverte au clic sur le badge `v{N}` affiché sur les pages /comptable/banque
 * et /client/banque pour les relevés ré-uploadés (version > 1).
 *
 * Charge la chaîne complète des versions via
 *   GET /api/banque/releves/[id]/history
 * et affiche chaque version (active vs supersédée) avec sa source d'upload.
 */

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle2, Archive } from "lucide-react"

export interface ReleveVersion {
  id: string
  version: number
  created_at: string | null
  superseded_at: string | null
  superseded_by_id: string | null
  uploaded_by: string | null
  upload_source: string | null
  is_active: boolean
}

interface Props {
  releveId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function fmtDateTime(d: string | null): string {
  if (!d) return "—"
  try {
    return new Date(d).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return d
  }
}

export function ReleveVersionHistory({ releveId, open, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [versions, setVersions] = useState<ReleveVersion[]>([])

  useEffect(() => {
    if (!open || !releveId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/banque/releves/${releveId}/history`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
        return d
      })
      .then((d) => {
        if (!cancelled) setVersions(d.versions || [])
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Erreur de chargement")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, releveId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Historique des versions du relevé</DialogTitle>
          <DialogDescription>
            Chaque ré-upload d'un même relevé (compte + période) crée une
            nouvelle version. Seule la plus récente est active.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-red-600">{error}</p>
        ) : versions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucune version trouvée.
          </p>
        ) : (
          <div className="divide-y rounded border">
            {versions.map((v) => (
              <div
                key={v.id}
                className={`flex items-start justify-between gap-3 p-3 ${
                  v.is_active ? "bg-emerald-50/50" : "bg-muted/20"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      className={
                        v.is_active
                          ? "bg-emerald-600 text-white"
                          : "bg-gray-200 text-gray-700"
                      }
                    >
                      v{v.version}
                    </Badge>
                    {v.is_active ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Version active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Archive className="h-3.5 w-3.5" />
                        Supersédée
                      </span>
                    )}
                    {v.upload_source && (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono"
                      >
                        {v.upload_source}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                    <div>
                      <span className="font-medium">Importé :</span>{" "}
                      {fmtDateTime(v.created_at)}
                    </div>
                    {v.superseded_at && (
                      <div>
                        <span className="font-medium">Supersédée le :</span>{" "}
                        {fmtDateTime(v.superseded_at)}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-[10px] font-mono text-muted-foreground shrink-0">
                  {v.id.slice(0, 8)}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
