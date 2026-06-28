"use client"

import { Badge } from "@/components/ui/badge"
import { Lock, Unlock } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { t, getLocale } from "@/lib/i18n"

export interface ExerciceLockBadgeProps {
  statut: "ouvert" | "cloture"
  /** ISO date string (YYYY-MM-DD or full ISO) — date à laquelle l'exercice a été clôturé */
  dateCloture?: string | null
  /** ISO date string — date de génération du snapshot du bilan figé */
  snapshotDate?: string | null
  className?: string
}

function fmtDate(iso?: string | null): string {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

function fmtDateTime(iso?: string | null): string {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

/**
 * Badge réutilisable indiquant le statut d'un exercice fiscal.
 * - statut="ouvert" → badge gris discret avec icône cadenas ouvert.
 * - statut="cloture" → badge ambre "Clôturé le DD/MM/YYYY" avec icône cadenas.
 * - snapshotDate optionnel → tooltip "Bilan figé le DD/MM/YYYY HH:mm".
 *
 * Accessibilité : `role="status"` + `aria-label` complet (avec date de
 * clôture et snapshot le cas échéant) pour les lecteurs d'écran.
 */
export function ExerciceLockBadge({
  statut,
  dateCloture,
  snapshotDate,
  className,
}: ExerciceLockBadgeProps) {
  const locale = getLocale()
  const isLocked = statut === "cloture"
  const dateClotureFmt = fmtDate(dateCloture)
  const snapshotFmt = fmtDateTime(snapshotDate)

  const ariaLabel = isLocked
    ? `${t('sccl.exercice_closed_aria', locale)}${dateClotureFmt ? t('sccl.exercice_closed_on', locale).replace('{date}', dateClotureFmt) : ""}${
        snapshotFmt ? t('sccl.exercice_balance_frozen', locale).replace('{datetime}', snapshotFmt) : ""
      }`
    : t('sccl.exercice_open_aria', locale)

  const badge = isLocked ? (
    <Badge
      role="status"
      aria-label={ariaLabel}
      className={`border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 ${className ?? ""}`}
      variant="outline"
    >
      <Lock className="h-3 w-3" aria-hidden="true" />
      <span>
        {t('sccl.closed', locale)}{dateClotureFmt ? t('sccl.exercice_closed_on', locale).replace('{date}', dateClotureFmt) : ""}
      </span>
    </Badge>
  ) : (
    <Badge
      role="status"
      aria-label={ariaLabel}
      className={`border-gray-300 bg-gray-50 text-gray-600 hover:bg-gray-100 ${className ?? ""}`}
      variant="outline"
    >
      <Unlock className="h-3 w-3" aria-hidden="true" />
      <span>{t('sccl.open', locale)}</span>
    </Badge>
  )

  // Si on a une date de snapshot ET que l'exercice est clôturé, on enveloppe
  // dans un tooltip indiquant la date/heure du figement du bilan N-1.
  if (isLocked && snapshotFmt) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex">
              {badge}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">{t('sccl.balance_frozen_on', locale).replace('{datetime}', snapshotFmt)}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return badge
}

export default ExerciceLockBadge
