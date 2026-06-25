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
import { t, getLocale } from "@/lib/i18n"

type CascadeType = "facture" | "banque" | "document"

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
  const locale = getLocale()

  const cascadeLines: Record<CascadeType, string[]> = {
    facture: [t('cdlg.cascade.facture.l1', locale), t('cdlg.cascade.facture.l2', locale), t('cdlg.cascade.facture.l3', locale)],
    banque: [t('cdlg.cascade.banque.l1', locale), t('cdlg.cascade.banque.l2', locale), t('cdlg.cascade.banque.l3', locale)],
    document: [t('cdlg.cascade.document.l1', locale), t('cdlg.cascade.document.l2', locale)],
  }
  const n = ids.length
  const noun = n === 1 ? t(`cdlg.cascade.${type}.singular`, locale) : t(`cdlg.cascade.${type}.plural`, locale)

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
          title: t('cdlg.cascade.toast_refused_title', locale),
          description: json?.error || `HTTP ${res.status}`,
          variant: "destructive",
        })
        return
      }
      toast({
        title: `${json.deleted_ids?.length || 0} ${noun} ${t('cdlg.cascade.toast_deleted_suffix', locale)}`,
        description: json.failed?.length
          ? `${json.failed.length} ${t('cdlg.cascade.toast_failed', locale)}`
          : t('cdlg.cascade.toast_done', locale),
      })
      if (json.failed?.length) console.warn("[cascade-delete] failed:", json.failed)
      onDeleted?.(json)
      setOpen(false)
      setTyped("")
    } catch (e: unknown) {
      toast({
        title: t('cdlg.cascade.toast_network_title', locale),
        description: e instanceof Error ? e.message : t('cdlg.cascade.toast_network_unknown', locale),
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
        title={isDisabled ? t('cdlg.cascade.btn_select_one', locale) : `${t('cdlg.cascade.btn_delete_n', locale)} ${n} ${noun}`}
      >
        <Trash2 className="size-4" />
        {size !== "icon" && (
          <span className="ml-1">{label ?? `${t('cdlg.cascade.btn_label', locale)} (${n})`}</span>
        )}
      </Button>

      <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setTyped("") }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              {t('cdlg.cascade.dialog_title', locale)} {n} {noun}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  {t('cdlg.cascade.irreversible_1', locale)} <strong>{t('cdlg.cascade.irreversible_strong', locale)}</strong>{t('cdlg.cascade.irreversible_2', locale)}
                </p>
                <div>
                  <p className="font-medium text-foreground">{t('cdlg.cascade.also_deleted', locale)}</p>
                  <ul className="mt-1 list-disc pl-5">
                    {cascadeLines[type].map((line) => <li key={line}>{line}</li>)}
                  </ul>
                </div>
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2">
                  {t('cdlg.cascade.retention_1', locale)}{" "}
                  <strong>{t('cdlg.cascade.retention_strong', locale)}</strong>{" "}
                  {t('cdlg.cascade.retention_2', locale)}
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">
                    {t('cdlg.cascade.type_1', locale)} <code className="text-foreground">{t('cdlg.cascade.type_code', locale)}</code> {t('cdlg.cascade.type_2', locale)}
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
            <AlertDialogCancel disabled={busy}>{t('cdlg.cascade.cancel', locale)}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirm() }}
              disabled={!canSubmit}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? t('cdlg.cascade.deleting', locale) : t('cdlg.cascade.confirm_delete', locale)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
