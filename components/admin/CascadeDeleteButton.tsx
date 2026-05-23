"use client"

import * as React from "react"
import { Trash2, AlertTriangle } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"

type CascadeType = "facture" | "banque" | "document"

const LABEL: Record<CascadeType, { singular: string; plural: string; cascade: string[] }> = {
  facture: {
    singular: "facture",
    plural: "factures",
    cascade: [
      "lignes de facture",
      "paiements et contacts liés",
      "écritures comptables générées par cette facture",
    ],
  },
  banque: {
    singular: "écriture banque",
    plural: "écritures banque",
    cascade: [
      "la contrepartie (même ref_folio) — sinon l'équilibre saute",
      "le lettrage des contreparties hors périmètre (remis à NULL)",
      "ligne de la table de staging transactions_bancaires si présente",
    ],
  },
  document: {
    singular: "document",
    plural: "documents",
    cascade: [
      "fichier PDF dans le bucket Supabase Storage",
      "références dans factures, écritures, relevés, transactions, dépenses, immobilisations",
    ],
  },
}

export interface CascadeDeleteButtonProps {
  type: CascadeType
  ids: string[]
  societeId: string
  /** Désactive le bouton si vide ou si !societeId. */
  disabled?: boolean
  /** Variante visuelle. */
  variant?: "destructive" | "outline" | "ghost"
  size?: "sm" | "default" | "icon"
  /** Texte du bouton. Par défaut: "Supprimer (cascade)". */
  label?: string
  /** Appelé après une suppression réussie avec le rapport renvoyé par l'API. */
  onDeleted?: (report: {
    deleted_ids: string[]
    failed: Array<{ id: string; error: string }>
    cascade_counts: Record<string, number>
  }) => void
}

export function CascadeDeleteButton({
  type, ids, societeId, disabled, variant = "destructive",
  size = "sm", label, onDeleted,
}: CascadeDeleteButtonProps) {
  const [open, setOpen] = React.useState(false)
  const [typed, setTyped] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const { toast } = useToast()

  const meta = LABEL[type]
  const n = ids.length
  const noun = n === 1 ? meta.singular : meta.plural

  const canSubmit = typed.trim().toUpperCase() === "SUPPRIMER" && n > 0 && !busy

  async function handleConfirm() {
    if (!canSubmit) return
    setBusy(true)
    try {
      const res = await fetch("/api/admin/cascade-delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type, ids, societe_id: societeId, confirm: "DELETE_HARD",
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({
          title: "Suppression refusée",
          description: json?.error || `HTTP ${res.status}`,
          variant: "destructive",
        })
        return
      }
      toast({
        title: `${json.deleted_ids?.length || 0} ${noun} supprimé(s)`,
        description: json.failed?.length
          ? `${json.failed.length} en échec — ouvrir la console pour le détail`
          : "Cascade terminée.",
      })
      if (json.failed?.length) console.warn("[cascade-delete] failed:", json.failed)
      onDeleted?.(json)
      setOpen(false)
      setTyped("")
    } catch (e: unknown) {
      toast({
        title: "Erreur réseau",
        description: e instanceof Error ? e.message : "Échec inconnu",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  const isDisabled = disabled || n === 0 || !societeId

  return (
    <>
      <Button
        variant={variant}
        size={size}
        disabled={isDisabled}
        onClick={() => setOpen(true)}
        title={isDisabled ? "Sélectionner au moins une ligne" : `Supprimer ${n} ${noun}`}
      >
        <Trash2 className="size-4" />
        {size !== "icon" && (
          <span className="ml-1">{label ?? `Supprimer (${n})`}</span>
        )}
      </Button>

      <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setTyped("") }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              Suppression définitive — {n} {noun}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Cette action est <strong>irréversible</strong>. Les données sont
                  effacées en dur (pas de soft delete, pas de corbeille).
                </p>
                <div>
                  <p className="font-medium text-foreground">Sera également supprimé en cascade :</p>
                  <ul className="mt-1 list-disc pl-5">
                    {meta.cascade.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                </div>
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2">
                  ⚠️ Mauritius Companies Act exige 7 ans de rétention. Utilise cette
                  fonction <strong>uniquement</strong> pour purger des données de test,
                  des doublons d'import, ou une saisie cassée.
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    Tapez <code className="text-foreground">SUPPRIMER</code> pour confirmer :
                  </label>
                  <Input
                    autoFocus
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder="SUPPRIMER"
                    className="font-mono"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirm() }}
              disabled={!canSubmit}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Suppression en cours…" : "Supprimer définitivement"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
