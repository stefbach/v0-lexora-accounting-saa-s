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

const MOIS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]

export function MraDeadlineAlert() {
  const now = new Date()
  const jour = now.getDate()
  if (jour > 20) return null

  const joursRestants = 20 - jour
  const moisLabel = MOIS_FR[now.getMonth()]
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
        <span className="font-semibold">Deadline MRA :</span> déclarations CSG/NSF/PAYE dues avant le 20 {moisLabel} {annee}.
        {joursRestants === 0
          ? <span className="font-bold"> Dernier jour !</span>
          : <span> {joursRestants} jour{joursRestants > 1 ? "s" : ""} restant{joursRestants > 1 ? "s" : ""}.</span>}
      </div>
    </div>
  )
}
