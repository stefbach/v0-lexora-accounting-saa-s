"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CalendarDays, Lock } from "lucide-react"
import { useExerciceActive } from "@/components/client/ExerciceActiveProvider"

/**
 * Sélecteur d'exercice fiscal GLOBAL (bandeau comptable). Choisit l'exercice
 * actif une fois ; les écrans de reporting lisent useExerciceActive() pour
 * filtrer. Discret : ne s'affiche que si un exercice est disponible.
 */
export function ExerciceSelector({ className }: { className?: string }) {
  const ctx = useExerciceActive()
  if (!ctx || ctx.exercices.length === 0 || !ctx.exercice) return null

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
      <span className="text-xs text-muted-foreground hidden sm:inline">Exercice</span>
      <Select value={ctx.exercice} onValueChange={ctx.setExercice}>
        <SelectTrigger className="h-8 w-[150px]" aria-label="Exercice fiscal actif">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ctx.exercices.map((e) => (
            <SelectItem key={e.annee} value={e.annee}>
              <span className="inline-flex items-center gap-1.5">
                {e.statut !== "ouvert" && (
                  <Lock
                    className={`h-3 w-3 ${e.statut === "cloture" ? "text-amber-600" : "text-orange-500"}`}
                    aria-hidden="true"
                  />
                )}
                {e.annee}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
