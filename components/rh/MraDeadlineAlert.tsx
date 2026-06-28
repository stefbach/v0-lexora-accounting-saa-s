"use client"

/**
 * Sprint 15 FIX 8 — Alerte deadline MRA (20 du mois).
 *
 * Affiche un bandeau coloré entre le 1er et le 20 de chaque mois rappelant
 * la date limite de soumission CSG/NSF/PAYE au MRA. Disparaît après le 20.
 *
 * Couleurs :
 *   - 🔴 rouge  : < 5 jours restants
 *   - 🟠 orange : 5-10 jours restants
 *   - 🔵 bleu   : > 10 jours restants
 */

import { Calendar, AlertTriangle } from "lucide-react"
import { t, getLocale } from "@/lib/i18n"

export function MraDeadlineAlert() {
  const locale = getLocale()
  const now = new Date()
  const jour = now.getDate()
  if (jour > 20) return null

  const joursRestants = 20 - jour
  const moisLabel = t(`scrh.mda_month_${String(now.getMonth() + 1).padStart(2, '0')}`, locale)
  const annee = now.getFullYear()

  let borderColor: string, bgColor: string, textColor: string, iconColor: string
  if (joursRestants < 5) {
    borderColor = "border-red-300"; bgColor = "bg-red-50"; textColor = "text-red-900"; iconColor = "text-red-600"
  } else if (joursRestants <= 10) {
    borderColor = "border-orange-300"; bgColor = "bg-orange-50"; textColor = "text-orange-900"; iconColor = "text-orange-600"
  } else {
    borderColor = "border-blue-200"; bgColor = "bg-blue-50"; textColor = "text-blue-900"; iconColor = "text-blue-500"
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border ${borderColor} ${bgColor}`}>
      {joursRestants < 5
        ? <AlertTriangle className={`w-5 h-5 ${iconColor} shrink-0`} />
        : <Calendar className={`w-5 h-5 ${iconColor} shrink-0`} />}
      <div className={`text-sm ${textColor}`}>
        <span className="font-semibold">{t('scrh.mda_deadline_label', locale)}</span>{" "}
        {t('scrh.mda_message', locale).replace('{mois}', moisLabel).replace('{annee}', String(annee))}
        {joursRestants === 0
          ? <span className="font-bold"> {t('scrh.mda_last_day', locale)}</span>
          : <span> {(joursRestants > 1 ? t('scrh.mda_days_left', locale) : t('scrh.mda_day_left', locale)).replace('{n}', String(joursRestants))}</span>}
      </div>
    </div>
  )
}
