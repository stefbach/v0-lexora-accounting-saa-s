"use client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Clock, Coffee, Copy, Pencil, Trash2 } from "lucide-react"
import type { PlanningShift } from "@/types/planning"

const JOURS_SHORT: Record<string, string> = {
  lun: "Lu", mar: "Ma", mer: "Me", jeu: "Je", ven: "Ve", sam: "Sa", dim: "Di",
}

interface Props {
  shift: PlanningShift
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}

export function ShiftRow({ shift, onEdit, onDuplicate, onDelete }: Props) {
  const joursLabel = shift.jours.length > 0
    ? shift.jours.map(j => JOURS_SHORT[j] || j).join(" · ")
    : "Aucun jour"

  return (
    <div className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors">
      {/* Pastille code couleur */}
      <div
        className="flex items-center justify-center w-12 h-12 rounded-lg font-bold text-white shrink-0 text-sm"
        style={{ backgroundColor: shift.couleur }}
        aria-label={`Créneau ${shift.code}`}
      >
        {shift.code}
      </div>

      {/* Infos principales */}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate" style={{ color: "#0B0F2E" }}>
          {shift.label}
          {!shift.actif && (
            <Badge variant="secondary" className="ml-2 text-[10px]">Inactif</Badge>
          )}
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-3 flex-wrap mt-0.5">
          {shift.debut && shift.fin ? (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {shift.debut} → {shift.fin}
              {shift.flexible && shift.debut_min && shift.debut_max && (
                <span className="text-blue-600"> (flex {shift.debut_min}–{shift.debut_max})</span>
              )}
            </span>
          ) : (
            <Badge variant="secondary" className="text-[10px]">Jour non travaillé</Badge>
          )}
          {shift.pause_minutes > 0 && (
            <span className="flex items-center gap-1">
              <Coffee className="w-3 h-3" />{shift.pause_minutes}min
            </span>
          )}
          {shift.heures_requises > 0 && (
            <span className="font-medium text-gray-700">{shift.heures_requises}h eff.</span>
          )}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">{joursLabel}</div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="sm" onClick={onEdit} title="Modifier" aria-label="Modifier">
          <Pencil className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onDuplicate} title="Dupliquer" aria-label="Dupliquer">
          <Copy className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          title="Supprimer"
          aria-label="Supprimer"
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
