"use client"

/**
 * InterSocieteRow — composant ligne pour la page de validation des
 * virements inter-sociétés (miroirs auto-générés DDS↔OCC).
 *
 * Affiche : date / émettrice → destinataire / montant / libellé / statut
 * Actions : Valider (read-only, marque comme contrôlé) — Reclasser (placeholder
 * V1 : pointe vers le grand-livre pour édition manuelle) — Supprimer
 * (placeholder V1 : non destructif côté DB tant qu'une procédure dédiée
 * n'est pas livrée, sinon dangereux pour l'intégrité comptable).
 *
 * V1 : actions purement informatives — la suppression d'un miroir doit
 * être faite via une route dédiée (à livrer en V2) pour garantir que la
 * paire source/miroir reste cohérente.
 */

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { Check, Pencil, Trash2, ArrowRight } from "lucide-react"
import { t, getLocale } from "@/lib/i18n"

export interface InterSocietePaire {
  key: string
  miroir_ids: string[]
  miroir: {
    id: string
    societe_id: string
    ref_folio: string
    date_ecriture: string
    journal: string
    numero_compte: string
    libelle: string
    debit_mur: number
    credit_mur: number
    statut: string | null
    lignes?: Array<{
      id: string
      numero_compte: string
      debit_mur: number
      credit_mur: number
    }>
  }
  source: {
    id: string
    societe_id: string
    ref_folio: string
    date_ecriture: string
    libelle: string
    numero_compte: string
    debit_mur: number
    credit_mur: number
  } | null
  date: string
  montant: number
  libelle: string
  societe_emettrice: { id: string; nom: string } | null
  societe_destinataire: { id: string; nom: string }
  statut: "auto" | "valide" | string
}

function fmt(n: number): string {
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDate(d: string): string {
  if (!d) return "—"
  try {
    return new Date(d).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  } catch {
    return d
  }
}

interface Props {
  paire: InterSocietePaire
  onValider: (paire: InterSocietePaire) => void
  onReclasser: (paire: InterSocietePaire) => void
  onSupprimer: (paire: InterSocietePaire) => void
  busy?: boolean
}

export function InterSocieteRow({
  paire,
  onValider,
  onReclasser,
  onSupprimer,
  busy = false,
}: Props) {
  const locale = getLocale()
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const isValide = paire.statut === "valide"
  const compteGroupe =
    (paire.miroir.lignes || []).find((l) => String(l.numero_compte).startsWith("451"))
      ?.numero_compte || paire.miroir.numero_compte

  return (
    <>
      <tr className="border-b hover:bg-muted/40 transition-colors text-sm">
        <td className="py-2 px-3 whitespace-nowrap">{formatDate(paire.date)}</td>

        <td className="py-2 px-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-normal">
              {paire.societe_emettrice?.nom || (
                <span className="text-muted-foreground italic">{t('samsc.inter_source_not_found', locale)}</span>
              )}
            </Badge>
            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
            <Badge variant="secondary" className="font-normal">
              {paire.societe_destinataire.nom}
            </Badge>
          </div>
        </td>

        <td className="py-2 px-3 text-right font-mono whitespace-nowrap">
          {fmt(paire.montant)}{" "}
          <span className="text-xs text-muted-foreground">MUR</span>
        </td>

        <td className="py-2 px-3 max-w-[420px]">
          <div className="truncate" title={paire.libelle}>
            {paire.libelle}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
            {paire.miroir.ref_folio} · cpte {compteGroupe}
          </div>
        </td>

        <td className="py-2 px-3 whitespace-nowrap">
          {isValide ? (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              {t('samsc.inter_validated', locale)}
            </Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
              {t('samsc.inter_auto_to_check', locale)}
            </Badge>
          )}
          {!paire.source && (
            <Badge
              variant="outline"
              className="ml-2 border-rose-300 text-rose-700"
              title={t('samsc.inter_source_tooltip', locale)}
            >
              {t('samsc.inter_source_badge', locale)}
            </Badge>
          )}
        </td>

        <td className="py-2 px-3 whitespace-nowrap">
          <div className="flex items-center gap-1 justify-end">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || isValide}
              onClick={() => onValider(paire)}
              title={t('samsc.inter_validate_tooltip', locale)}
            >
              <Check className="h-4 w-4 mr-1" />
              <span className="hidden md:inline">{t('samsc.inter_validate', locale)}</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => onReclasser(paire)}
              title={t('samsc.inter_reclassify_tooltip', locale)}
            >
              <Pencil className="h-4 w-4 mr-1" />
              <span className="hidden md:inline">{t('samsc.inter_reclassify', locale)}</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-rose-700 hover:text-rose-800 hover:bg-rose-50"
              disabled={busy}
              onClick={() => setConfirmOpen(true)}
              title={t('samsc.inter_delete_tooltip', locale)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              <span className="hidden md:inline">{t('cui.delete', locale)}</span>
            </Button>
          </div>
        </td>
      </tr>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('scp.delete_intercompany_mirror', locale)}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {(() => {
                    const tpl = t('samsc.inter_dialog_intro', locale)
                    const [before, restRaw] = tpl.split('{ref}')
                    const [middle, after] = (restRaw ?? '').split('{societe}')
                    return (
                      <>
                        {before}
                        <span className="font-mono">{paire.miroir.ref_folio}</span>
                        {middle}
                        <strong>{paire.societe_destinataire.nom}</strong>
                        {after}
                      </>
                    )
                  })()}
                </p>
                <p className="text-amber-700">
                  {t('samsc.inter_dialog_warn', locale).replace('{societe}', paire.societe_emettrice?.nom || t('samsc.inter_emettrice_fallback', locale))}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('samsc.inter_dialog_note', locale)}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cui.cancel', locale)}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false)
                onSupprimer(paire)
              }}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {t('samsc.inter_confirm_delete', locale)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default InterSocieteRow
