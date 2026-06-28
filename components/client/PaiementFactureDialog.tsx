"use client"

/**
 * PaiementFactureDialog — Dialog pour enregistrer un paiement sur une facture.
 *
 * Utilisé depuis /client/factures (liste) et /client/factures/[id] (détail).
 * Appelle POST /api/client/factures/[id]/paiements puis notifie le parent
 * via onSuccess(facture).
 */

import { useEffect, useMemo, useState } from "react"
import { Loader2, BanknoteIcon } from "lucide-react"
import { t, getLocale } from "@/lib/i18n"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type ModePaiement = "virement" | "cheque" | "espece" | "carte" | "prelevement" | "autre"

export interface PaiementFactureFacture {
  id: string
  numero_facture: string | null
  tiers: string | null
  type_facture: "client" | "fournisseur" | null
  devise: string | null
  montant_ttc: number
  montant_mur: number | null
  solde_non_paye: number | null
  statut: string | null
}

interface Props {
  facture: PaiementFactureFacture | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (facture: any) => void
}

const MODES: { value: ModePaiement; labelKey: string }[] = [
  { value: "virement", labelKey: "scp.pay_mode_virement" },
  { value: "cheque", labelKey: "scp.pay_mode_cheque" },
  { value: "espece", labelKey: "scp.pay_mode_espece" },
  { value: "carte", labelKey: "scp.pay_mode_carte" },
  { value: "prelevement", labelKey: "scp.pay_mode_prelevement" },
  { value: "autre", labelKey: "scp.pay_mode_autre" },
]

function fmt(n: number, dev = "MUR"): string {
  return (
    n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    " " +
    dev
  )
}

export function PaiementFactureDialog({ facture, open, onOpenChange, onSuccess }: Props) {
  const locale = getLocale()
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [montant, setMontant] = useState<string>("")
  const [date, setDate] = useState<string>(today)
  const [mode, setMode] = useState<ModePaiement>("virement")
  const [reference, setReference] = useState<string>("")
  const [notes, setNotes] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset à l'ouverture
  useEffect(() => {
    if (open && facture) {
      const devise = facture.devise || "MUR"
      const totalDevise = Number(facture.montant_ttc) || 0
      // On affiche par défaut le reste à payer en devise (approx via ratio MUR)
      const totalMur = Number(facture.montant_mur) || totalDevise
      const soldeMur = facture.solde_non_paye == null ? totalMur : Number(facture.solde_non_paye)
      const ratio = totalMur > 0 ? totalDevise / totalMur : 1
      const resteDevise = Math.max(0, Math.round(soldeMur * ratio * 100) / 100)
      setMontant(resteDevise > 0 ? String(resteDevise) : "")
      setDate(today)
      setMode("virement")
      setReference("")
      setNotes("")
      setError(null)
    }
  }, [open, facture, today])

  if (!facture) return null

  const devise = facture.devise || "MUR"
  const totalMur = Number(facture.montant_mur) || Number(facture.montant_ttc) || 0
  const soldeMur = facture.solde_non_paye == null ? totalMur : Number(facture.solde_non_paye)
  const pctPaye = totalMur > 0 ? Math.round(((totalMur - soldeMur) / totalMur) * 100) : 0

  async function handleSubmit() {
    setError(null)
    const m = Number(montant)
    if (!Number.isFinite(m) || m <= 0) {
      setError(t('scp.pay_err_invalid_amount', locale))
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError(t('scp.pay_err_invalid_date', locale))
      return
    }
    setSubmitting(true)
    try {
      if (!facture) return
      const res = await fetch(`/api/client/factures/${facture.id}/paiements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          montant: m,
          date_paiement: date,
          mode_paiement: mode,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || "Erreur enregistrement")
        return
      }
      onSuccess?.(data?.facture)
      onOpenChange(false)
    } catch (e: any) {
      setError(e?.message || t('scp.pay_err_network', locale))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BanknoteIcon className="h-5 w-5 text-emerald-600" />
            {t('scp.pay_title', locale)}
          </DialogTitle>
          <DialogDescription>
            {t('scp.pay_invoice_word', locale)} <span className="font-mono font-medium">{facture.numero_facture || facture.id.slice(0, 8)}</span>
            {" — "}
            <span>{facture.tiers || "—"}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Récap solde */}
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('scp.pay_total_invoice', locale)}</span>
              <span className="font-mono">{fmt(Number(facture.montant_ttc) || 0, devise)}</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-muted-foreground">{t('scp.pay_already_paid', locale)}</span>
              <span className="font-mono">{fmt(totalMur - soldeMur, "MUR")} ({pctPaye}%)</span>
            </div>
            <div className="flex justify-between mt-1 font-medium">
              <span>{t('scp.pay_remaining', locale)}</span>
              <span className="font-mono text-emerald-700">{fmt(soldeMur, "MUR")}</span>
            </div>
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-600 transition-all"
                style={{ width: `${pctPaye}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="paiement-montant">{t('scp.pay_amount', locale)} ({devise})</Label>
              <Input
                id="paiement-montant"
                type="number"
                step="0.01"
                min="0.01"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="paiement-date">{t('scp.pay_date', locale)}</Label>
              <Input
                id="paiement-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="paiement-mode">{t('scp.pay_payment_mode', locale)}</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as ModePaiement)}>
              <SelectTrigger id="paiement-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {t(m.labelKey, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="paiement-ref">{t('scp.pay_ref_label', locale)}</Label>
            <Input
              id="paiement-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={t('scp.pay_optional', locale)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="paiement-notes">{t('scp.pay_notes', locale)}</Label>
            <Textarea
              id="paiement-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={t('scp.pay_optional', locale)}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('cui.cancel', locale)}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('cui.save', locale)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
