"use client"

/**
 * AGENT FIX-ALICIA — Dialog de récupération d'un bulletin perdu.
 *
 * Deux mécanismes, chacun dans sa Card :
 *
 *   1. Restaurer depuis archive (mig 425) — réutilise la version "is_archived=true"
 *      qui a été superseded par l'actuelle. Cas typique : un recalcul a
 *      écrasé les retenues manuelles, mais l'ancien bulletin existe encore.
 *
 *   2. Reconstituer depuis grand livre — lit `ecritures_comptables_v2` via
 *      `numero_piece = 'BP-<bulletin_id>'`, agrège par compte (cf. mapping
 *      dans `lib/rh/reconstruct-bulletin-from-ecritures.ts`), et propose
 *      de remplacer le bulletin actuel par les valeurs reconstituées.
 *
 * Verrou : si le bulletin est comptabilisé (mig 427), les deux actions
 * sont bloquées — la décomptabilisation doit être faite préalablement
 * via DecomptabilisationDialog.
 */

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Archive, BookOpen, Loader2, Search, Wrench } from "lucide-react"
import { notifyError, notifySuccess } from "@/lib/utils/toast"

interface BulletinSummary {
  id: string
  employe_nom: string
  periode: string
  salaire_net: number
  is_comptabilise?: boolean
}

interface Props {
  bulletin: BulletinSummary
  onSuccess?: () => void
  trigger?: React.ReactNode
}

type ArchivePreview = {
  active: { id: string; salaire_net: number | null } | null
  archive:
    | {
        id: string
        salaire_net: number | null
        archived_at: string | null
        archive_reason: string | null
      }
    | null
  restorable: boolean
  reason_blocked: string | null
}

type ReconstructPreview = {
  reconstructed: {
    salaire_brut: number
    paye_total: number
    nsf_total: number
    csg_total: number
    retenues_manuelles: number
    salaire_net: number
    ecritures_sources: Array<{ compte: string; libelle: string; debit: number; credit: number }>
    notes: string
  }
  current?: { id: string; salaire_net: number | null; comptabilise: boolean } | null
}

function fmtMUR(n: number | null | undefined): string {
  if (n == null) return "—"
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "MUR",
      maximumFractionDigits: 0,
    }).format(n)
  } catch {
    return `${Math.round(n)} MUR`
  }
}

function fmtDate(s: string | null): string {
  if (!s) return "—"
  try {
    return new Date(s).toLocaleString("fr-FR")
  } catch {
    return s
  }
}

export function BulletinRecoveryDialog({ bulletin, onSuccess, trigger }: Props) {
  const [open, setOpen] = useState(false)

  // Archive flow state
  const [checkingArchive, setCheckingArchive] = useState(false)
  const [archivePreview, setArchivePreview] = useState<ArchivePreview | null>(null)
  const [restoring, setRestoring] = useState(false)

  // Reconstruct flow state
  const [previewingReconstruct, setPreviewingReconstruct] = useState(false)
  const [reconstructPreview, setReconstructPreview] = useState<ReconstructPreview | null>(null)
  const [replacing, setReplacing] = useState(false)

  const resetAll = () => {
    setArchivePreview(null)
    setReconstructPreview(null)
    setCheckingArchive(false)
    setRestoring(false)
    setPreviewingReconstruct(false)
    setReplacing(false)
  }

  const handleOpenChange = (v: boolean) => {
    if (restoring || replacing) return
    setOpen(v)
    if (!v) resetAll()
  }

  // === Mécanisme A : restore depuis archive ===
  const checkArchives = async () => {
    setCheckingArchive(true)
    try {
      const res = await fetch(`/api/rh/paie/${bulletin.id}/restore-from-archive`, {
        method: "GET",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        notifyError("Vérification archive échouée", data?.error || `HTTP ${res.status}`)
        setArchivePreview(null)
      } else {
        setArchivePreview({
          active: data.active,
          archive: data.archive,
          restorable: !!data.restorable,
          reason_blocked: data.reason_blocked ?? null,
        })
      }
    } catch (e: any) {
      notifyError("Erreur réseau", e?.message || "")
    } finally {
      setCheckingArchive(false)
    }
  }

  const restoreArchive = async () => {
    setRestoring(true)
    try {
      const res = await fetch(`/api/rh/paie/${bulletin.id}/restore-from-archive`, {
        method: "POST",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        notifyError("Restauration refusée", data?.error || `HTTP ${res.status}`)
      } else {
        notifySuccess(
          "Bulletin restauré depuis l'archive — pensez à recomptabiliser si nécessaire.",
        )
        setOpen(false)
        resetAll()
        onSuccess?.()
      }
    } catch (e: any) {
      notifyError("Erreur réseau", e?.message || "")
    } finally {
      setRestoring(false)
    }
  }

  // === Mécanisme B : reconstruction depuis grand livre ===
  const previewReconstruct = async () => {
    setPreviewingReconstruct(true)
    try {
      const res = await fetch("/api/rh/paie/reconstruct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulletin_id: bulletin.id, replace_active: false }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        notifyError("Reconstruction échouée", data?.error || `HTTP ${res.status}`)
        setReconstructPreview(null)
      } else {
        setReconstructPreview({
          reconstructed: data.reconstructed,
          current: data.current,
        })
      }
    } catch (e: any) {
      notifyError("Erreur réseau", e?.message || "")
    } finally {
      setPreviewingReconstruct(false)
    }
  }

  const replaceWithReconstruct = async () => {
    if (!confirm("Remplacer le bulletin actuel par la version reconstituée ? L'actuel sera archivé.")) {
      return
    }
    setReplacing(true)
    try {
      const res = await fetch("/api/rh/paie/reconstruct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulletin_id: bulletin.id, replace_active: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        notifyError("Remplacement refusé", data?.error || `HTTP ${res.status}`)
      } else {
        notifySuccess(
          "Bulletin reconstitué et activé — pensez à recomptabiliser le bulletin reconstitué.",
        )
        setOpen(false)
        resetAll()
        onSuccess?.()
      }
    } catch (e: any) {
      notifyError("Erreur réseau", e?.message || "")
    } finally {
      setReplacing(false)
    }
  }

  const defaultTrigger = (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs gap-1 border-blue-300 text-blue-700 hover:bg-blue-50"
    >
      <Wrench className="w-3 h-3" />
      Récupérer
    </Button>
  )

  const blockedByComptabilise = !!bulletin.is_comptabilise

  // Comparaison tableau pour la reconstruction
  const compareRow = (label: string, current: number | null | undefined, reconstructed: number) => {
    const cur = Number(current ?? 0)
    const diff = reconstructed - cur
    const hasDiff = Math.abs(diff) >= 0.5
    return (
      <tr key={label} className={hasDiff ? "bg-amber-50" : ""}>
        <td className="px-2 py-1.5 font-medium">{label}</td>
        <td className="px-2 py-1.5 text-right font-mono">{fmtMUR(cur)}</td>
        <td className="px-2 py-1.5 text-right font-mono">{fmtMUR(reconstructed)}</td>
        <td
          className={`px-2 py-1.5 text-right font-mono ${
            hasDiff ? "text-red-600 font-bold" : "text-gray-400"
          }`}
        >
          {hasDiff ? (diff > 0 ? "+" : "") + fmtMUR(diff) : "—"}
        </td>
      </tr>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#0B0F2E]">
            <Wrench className="w-5 h-5 text-blue-600" />
            Récupération du bulletin
          </DialogTitle>
          <DialogDescription>
            Restauration depuis archive ou reconstitution depuis le grand livre.
          </DialogDescription>
        </DialogHeader>

        {/* Récap bulletin */}
        <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <div>
              <span className="text-gray-500">Salarié&nbsp;: </span>
              <span className="font-semibold">{bulletin.employe_nom || "—"}</span>
            </div>
            <div>
              <span className="text-gray-500">Période&nbsp;: </span>
              <span className="font-semibold">{bulletin.periode}</span>
            </div>
            <div>
              <span className="text-gray-500">Net actuel&nbsp;: </span>
              <span className="font-semibold">{fmtMUR(bulletin.salaire_net)}</span>
            </div>
            {bulletin.is_comptabilise && (
              <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">
                Comptabilisé
              </Badge>
            )}
          </div>
        </div>

        {/* Avertissement bulletin comptabilisé */}
        {blockedByComptabilise && (
          <Alert variant="destructive" className="border-amber-300 bg-amber-50 text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Bulletin verrouillé (comptabilisé)</AlertTitle>
            <AlertDescription>
              Décomptabilisez le bulletin d'abord via{" "}
              <code className="text-xs">/rh/audit-decomptabilisation</code> ou le bouton{" "}
              <em>Décomptabiliser</em> dans la liste avant toute récupération.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* CARD 1 — Restore archive */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Archive className="w-4 h-4 text-purple-600" />
                Restaurer depuis archive
              </CardTitle>
              <CardDescription>
                Restaure la version précédente du bulletin (avant régénération).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                size="sm"
                variant="outline"
                onClick={checkArchives}
                disabled={checkingArchive || blockedByComptabilise}
                className="w-full"
              >
                {checkingArchive ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Recherche…
                  </>
                ) : (
                  <>
                    <Search className="w-3 h-3 mr-1" /> Vérifier les archives
                  </>
                )}
              </Button>

              {archivePreview && (
                <div className="text-xs space-y-2">
                  {archivePreview.archive ? (
                    <div className="bg-purple-50 border border-purple-200 rounded p-2 space-y-1">
                      <div className="font-medium text-purple-900">Archive trouvée</div>
                      <div>
                        <span className="text-gray-500">Net archivé&nbsp;:</span>{" "}
                        <span className="font-mono font-semibold">
                          {fmtMUR(archivePreview.archive.salaire_net)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Archivé le&nbsp;:</span>{" "}
                        {fmtDate(archivePreview.archive.archived_at)}
                      </div>
                      {archivePreview.archive.archive_reason && (
                        <div className="text-gray-600 italic">
                          {archivePreview.archive.archive_reason}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-gray-500 italic">
                      Aucune archive trouvée pour ce bulletin.
                    </div>
                  )}

                  {archivePreview.restorable && archivePreview.archive && (
                    <Button
                      size="sm"
                      onClick={restoreArchive}
                      disabled={restoring}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      {restoring ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Restauration…
                        </>
                      ) : (
                        "Restaurer ce bulletin"
                      )}
                    </Button>
                  )}

                  {archivePreview.reason_blocked && (
                    <div className="text-red-600 text-[11px] italic">
                      {archivePreview.reason_blocked}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* CARD 2 — Reconstruct from ledger */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-600" />
                Reconstituer depuis grand livre
              </CardTitle>
              <CardDescription>
                Reconstruit le bulletin à partir des écritures comptables liées.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                size="sm"
                variant="outline"
                onClick={previewReconstruct}
                disabled={previewingReconstruct || blockedByComptabilise}
                className="w-full"
              >
                {previewingReconstruct ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Lecture grand livre…
                  </>
                ) : (
                  <>
                    <Search className="w-3 h-3 mr-1" /> Prévisualiser
                  </>
                )}
              </Button>

              {reconstructPreview && (
                <div className="text-xs space-y-2">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-1 text-left">Champ</th>
                          <th className="px-2 py-1 text-right">Actuel</th>
                          <th className="px-2 py-1 text-right">Reconstitué</th>
                          <th className="px-2 py-1 text-right">Diff</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {compareRow(
                          "Salaire brut",
                          null,
                          reconstructPreview.reconstructed.salaire_brut,
                        )}
                        {compareRow("PAYE", null, reconstructPreview.reconstructed.paye_total)}
                        {compareRow("NSF", null, reconstructPreview.reconstructed.nsf_total)}
                        {compareRow("CSG", null, reconstructPreview.reconstructed.csg_total)}
                        {compareRow(
                          "Retenues manuelles",
                          null,
                          reconstructPreview.reconstructed.retenues_manuelles,
                        )}
                        {compareRow(
                          "Salaire net",
                          reconstructPreview.current?.salaire_net ?? bulletin.salaire_net,
                          reconstructPreview.reconstructed.salaire_net,
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="text-[11px] text-gray-500">
                    {reconstructPreview.reconstructed.ecritures_sources.length} écritures sources lues.
                  </div>

                  <Button
                    size="sm"
                    onClick={replaceWithReconstruct}
                    disabled={replacing || blockedByComptabilise}
                    className="w-full bg-red-600 hover:bg-red-700 text-white"
                  >
                    {replacing ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Remplacement…
                      </>
                    ) : (
                      "Remplacer le bulletin actif"
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default BulletinRecoveryDialog
