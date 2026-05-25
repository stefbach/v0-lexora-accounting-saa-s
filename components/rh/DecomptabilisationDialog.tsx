"use client"
import { useState, useId } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AlertTriangle, Undo2, Loader2 } from "lucide-react"
import { notifySuccess, notifyError } from "@/lib/utils/toast"

/**
 * FIX-DECOMPTA — Modale réutilisable de décomptabilisation d'un bulletin.
 *
 * Couvre les pages :
 *   - /rh/paie (liste bulletins du mois)
 *   - /rh/historique-paie (consultation par mois)
 *
 * UX :
 *   - Trigger : bouton ambre/rouge "🔓 Décomptabiliser" (override possible
 *     par la prop `trigger`).
 *   - Modal : récap bulletin, avertissement traçabilité, raison obligatoire
 *     (5–500 chars), type de correction optionnel, confirmation.
 *
 * A11y :
 *   - Radix Dialog gère le focus trap, l'esc et le restore-focus.
 *   - L'avertissement est référencé via `aria-describedby` sur le titre.
 *   - Le bouton "Confirmer" est disabled tant que la raison < 5 chars.
 */

const TYPE_CORRECTIONS: { value: string; label: string }[] = [
  { value: "erreur_calcul", label: "Erreur de calcul" },
  { value: "modif_salaire", label: "Modification du salaire" },
  { value: "correction_prorata", label: "Correction prorata / entrée-sortie" },
  { value: "correction_conges", label: "Correction congés / absences" },
  { value: "correction_primes", label: "Correction primes / OT" },
  { value: "autre", label: "Autre" },
]

interface DecomptaBulletinSummary {
  id: string
  /** Pré-calculé côté parent : "Prénom Nom" */
  employe_nom: string
  /** "YYYY-MM" ou "YYYY-MM-DD" */
  periode: string
  salaire_brut: number
  salaire_net: number
  ecriture_id: string | null
  comptabilise_at: string | null
}

interface Props {
  bulletinId: string
  bulletin: DecomptaBulletinSummary
  onSuccess?: () => void
  /**
   * Optionnel : remplace le bouton par défaut. Quand fourni, le composant
   * parent gère son propre déclencheur ; le DialogTrigger devient
   * `asChild` autour de ce nœud.
   */
  trigger?: React.ReactNode
}

function fmtMUR(n: number): string {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "MUR",
      maximumFractionDigits: 0,
    }).format(n || 0)
  } catch {
    return `${Math.round(n || 0)} MUR`
  }
}

function fmtPeriode(p: string): string {
  // "YYYY-MM" ou "YYYY-MM-DD" → "mai 2026"
  if (!p) return "—"
  const ym = p.slice(0, 7)
  const d = new Date(`${ym}-01T12:00:00`)
  if (Number.isNaN(d.getTime())) return p
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
}

export function DecomptabilisationDialog({
  bulletinId,
  bulletin,
  onSuccess,
  trigger,
}: Props) {
  const [open, setOpen] = useState(false)
  const [raison, setRaison] = useState("")
  const [typeCorrection, setTypeCorrection] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)
  const warningId = useId()

  const reset = () => {
    setRaison("")
    setTypeCorrection("")
    setSubmitting(false)
  }

  const handleOpenChange = (v: boolean) => {
    if (submitting) return // ne pas fermer pendant la requête
    setOpen(v)
    if (!v) reset()
  }

  const raisonValide = raison.trim().length >= 5 && raison.trim().length <= 500
  const remaining = 500 - raison.length

  const confirmer = async () => {
    if (!raisonValide || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/rh/paie/${bulletinId}/decomptabiliser`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raison: raison.trim(),
          type_correction: typeCorrection || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        notifyError(
          "Décomptabilisation refusée",
          data?.error || `HTTP ${res.status}`,
        )
        setSubmitting(false)
        return
      }
      notifySuccess(
        data?.requires_admin_approval
          ? "Bulletin décomptabilisé — action tracée. Pensez à recomptabiliser après modification (validation admin recommandée)."
          : "Bulletin décomptabilisé — modifiable à nouveau. Pensez à contre-passer les écritures comptables liées.",
      )
      setOpen(false)
      reset()
      onSuccess?.()
    } catch (e: any) {
      notifyError("Décomptabilisation — erreur réseau", e?.message || "")
      setSubmitting(false)
    }
  }

  const defaultTrigger = (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
    >
      <Undo2 className="w-3 h-3" />
      Décomptabiliser
    </Button>
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>
      <DialogContent className="max-w-lg" aria-describedby={warningId}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#0B0F2E]">
            <Undo2 className="w-5 h-5 text-amber-600" />
            Décomptabiliser le bulletin
          </DialogTitle>
          <DialogDescription>
            Cette action déverrouille le bulletin pour permettre une
            modification. Elle est tracée dans l’audit (WORM).
          </DialogDescription>
        </DialogHeader>

        {/* Récap bulletin */}
        <div className="rounded-md border bg-gray-50 p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Employé</span>
            <span className="font-medium">{bulletin.employe_nom || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Période</span>
            <span className="font-medium capitalize">
              {fmtPeriode(bulletin.periode)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Salaire brut</span>
            <span className="font-mono">{fmtMUR(bulletin.salaire_brut)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Salaire net</span>
            <span className="font-mono font-semibold text-emerald-700">
              {fmtMUR(bulletin.salaire_net)}
            </span>
          </div>
          {bulletin.ecriture_id && (
            <div className="flex justify-between">
              <span className="text-gray-500">Écriture liée</span>
              <span className="font-mono text-xs text-gray-700">
                {bulletin.ecriture_id.slice(0, 8)}…
              </span>
            </div>
          )}
          {bulletin.comptabilise_at && (
            <div className="flex justify-between">
              <span className="text-gray-500">Comptabilisé le</span>
              <span className="text-xs">
                {new Date(bulletin.comptabilise_at).toLocaleDateString("fr-FR")}
              </span>
            </div>
          )}
        </div>

        {/* Avertissement */}
        <div
          id={warningId}
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Cette action est tracée.</p>
            <p className="text-xs mt-0.5">
              L’écriture comptable liée sera marquée pour reprise manuelle —
              vous devrez la contre-passer (OD) ou la supprimer côté comptable.
              Vous devrez ensuite <strong>recomptabiliser</strong> le bulletin
              après modification.
            </p>
          </div>
        </div>

        {/* Type de correction */}
        <div className="space-y-1.5">
          <Label htmlFor="decompta-type" className="text-sm">
            Type de correction (optionnel)
          </Label>
          <Select
            value={typeCorrection}
            onValueChange={setTypeCorrection}
            disabled={submitting}
          >
            <SelectTrigger id="decompta-type">
              <SelectValue placeholder="Sélectionner…" />
            </SelectTrigger>
            <SelectContent>
              {TYPE_CORRECTIONS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Raison */}
        <div className="space-y-1.5">
          <Label htmlFor="decompta-raison" className="text-sm">
            Raison de la décomptabilisation{" "}
            <span className="text-red-500">*</span>
          </Label>
          <Textarea
            id="decompta-raison"
            value={raison}
            onChange={(e) => setRaison(e.target.value.slice(0, 500))}
            placeholder="Ex: Erreur de prorata détectée après vérification du contrat — recalcul nécessaire."
            rows={3}
            disabled={submitting}
            aria-required="true"
            aria-invalid={raison.length > 0 && !raisonValide}
          />
          <div className="flex justify-between text-[11px] text-gray-500">
            <span>
              {raison.trim().length < 5
                ? `Minimum 5 caractères (actuellement ${raison.trim().length}).`
                : "OK — raison suffisante."}
            </span>
            <span>{remaining} restants</span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={confirmer}
            disabled={!raisonValide || submitting}
            className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
          >
            {submitting && (
              <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden />
            )}
            Confirmer la décomptabilisation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default DecomptabilisationDialog
