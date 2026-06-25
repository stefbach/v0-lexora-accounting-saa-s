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
import { t, getLocale } from "@/lib/i18n"

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

const TYPE_CORRECTION_VALUES = [
  "erreur_calcul",
  "modif_salaire",
  "correction_prorata",
  "correction_conges",
  "correction_primes",
  "autre",
] as const

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
  const locale = getLocale()

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
          t('cdlg.decompta.err_refused', locale),
          data?.error || `HTTP ${res.status}`,
        )
        setSubmitting(false)
        return
      }
      notifySuccess(
        data?.requires_admin_approval
          ? t('cdlg.decompta.ok_admin', locale)
          : t('cdlg.decompta.ok_normal', locale),
      )
      setOpen(false)
      reset()
      onSuccess?.()
    } catch (e: any) {
      notifyError(t('cdlg.decompta.err_network', locale), e?.message || "")
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
      {t('cdlg.decompta.trigger', locale)}
    </Button>
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>
      <DialogContent className="max-w-lg" aria-describedby={warningId}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#0B0F2E]">
            <Undo2 className="w-5 h-5 text-amber-600" />
            {t('cdlg.decompta.title', locale)}
          </DialogTitle>
          <DialogDescription>
            {t('cdlg.decompta.subtitle', locale)}
          </DialogDescription>
        </DialogHeader>

        {/* Récap bulletin */}
        <div className="rounded-md border bg-gray-50 p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">{t('cdlg.decompta.employee', locale)}</span>
            <span className="font-medium">{bulletin.employe_nom || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t('cdlg.decompta.period', locale)}</span>
            <span className="font-medium capitalize">
              {fmtPeriode(bulletin.periode)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t('cdlg.decompta.brut', locale)}</span>
            <span className="font-mono">{fmtMUR(bulletin.salaire_brut)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t('cdlg.decompta.net', locale)}</span>
            <span className="font-mono font-semibold text-emerald-700">
              {fmtMUR(bulletin.salaire_net)}
            </span>
          </div>
          {bulletin.ecriture_id && (
            <div className="flex justify-between">
              <span className="text-gray-500">{t('cdlg.decompta.linked_entry', locale)}</span>
              <span className="font-mono text-xs text-gray-700">
                {bulletin.ecriture_id.slice(0, 8)}…
              </span>
            </div>
          )}
          {bulletin.comptabilise_at && (
            <div className="flex justify-between">
              <span className="text-gray-500">{t('cdlg.decompta.accounted_on', locale)}</span>
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
            <p className="font-semibold">{t('cdlg.decompta.warning_title', locale)}</p>
            <p className="text-xs mt-0.5">
              {t('cdlg.decompta.warning_desc_1', locale)}{" "}
              <strong>{t('cdlg.decompta.warning_recompta', locale)}</strong>{" "}
              {t('cdlg.decompta.warning_desc_2', locale)}
            </p>
          </div>
        </div>

        {/* Type de correction */}
        <div className="space-y-1.5">
          <Label htmlFor="decompta-type" className="text-sm">
            {t('cdlg.decompta.type_label', locale)}
          </Label>
          <Select
            value={typeCorrection}
            onValueChange={setTypeCorrection}
            disabled={submitting}
          >
            <SelectTrigger id="decompta-type">
              <SelectValue placeholder={t('cdlg.decompta.type_placeholder', locale)} />
            </SelectTrigger>
            <SelectContent>
              {TYPE_CORRECTION_VALUES.map((v) => (
                <SelectItem key={v} value={v}>
                  {t(`cdlg.decompta.type.${v}`, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Raison */}
        <div className="space-y-1.5">
          <Label htmlFor="decompta-raison" className="text-sm">
            {t('cdlg.decompta.reason_label', locale)}{" "}
            <span className="text-red-500">*</span>
          </Label>
          <Textarea
            id="decompta-raison"
            value={raison}
            onChange={(e) => setRaison(e.target.value.slice(0, 500))}
            placeholder={t('cdlg.decompta.reason_placeholder', locale)}
            rows={3}
            disabled={submitting}
            aria-required="true"
            aria-invalid={raison.length > 0 && !raisonValide}
          />
          <div className="flex justify-between text-[11px] text-gray-500">
            <span>
              {raison.trim().length < 5
                ? `${t('cdlg.decompta.reason_min', locale)} ${raison.trim().length}).`
                : t('cdlg.decompta.reason_ok', locale)}
            </span>
            <span>{remaining} {t('cdlg.decompta.remaining', locale)}</span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            {t('cdlg.decompta.cancel', locale)}
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
            {t('cdlg.decompta.confirm', locale)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default DecomptabilisationDialog
