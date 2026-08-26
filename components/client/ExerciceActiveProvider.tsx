"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { getCurrentExercice, getAvailableExercices } from "@/lib/fiscal-years"
import { exerciceDatesFromLabel, type ExerciceStatut } from "@/lib/accounting/exercices"

/**
 * ExerciceActiveProvider — exercice fiscal actif GLOBAL pour l'espace /client.
 *
 * Monté SOUS SocieteActiveProvider : l'exercice actif est propre à la société
 * active et persisté par société (localStorage). Expose le libellé + les bornes
 * de dates (date_debut..date_fin) que les écrans de reporting passent à leurs
 * API (?exercice= ou ?date_debut&date_fin), pour filtrer partout d'un seul geste.
 *
 * Source des exercices : l'API /api/comptable/exercices (lignes réelles avec
 * statut). Si aucune ligne (société non initialisée), on retombe sur la liste
 * dynamique lib/fiscal-years pour que le sélecteur reste utilisable.
 */

export interface ExerciceOption {
  annee: string
  date_debut: string
  date_fin: string
  statut: ExerciceStatut
}

export interface ExerciceActiveContextValue {
  exercice: string | null
  dateDebut: string | null
  dateFin: string | null
  statut: ExerciceStatut | null
  exercices: ExerciceOption[]
  loading: boolean
  setExercice: (annee: string) => void
  /** Recharge la liste des exercices (après init / clôture). */
  refresh: () => Promise<void>
}

const ExerciceActiveContext = createContext<ExerciceActiveContextValue | null>(null)

const storageKey = (societeId: string) => `lexora_active_exercice_${societeId}`

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null
  try { return window.localStorage.getItem(key) } catch { return null }
}
function writeStorage(key: string, value: string) {
  if (typeof window === "undefined") return
  try { window.localStorage.setItem(key, value) } catch { /* quota */ }
}

/** Liste de repli quand la société n'a pas encore d'exercices en base. */
function fallbackOptions(): ExerciceOption[] {
  return getAvailableExercices().map((annee) => {
    const d = exerciceDatesFromLabel(annee)
    return {
      annee,
      date_debut: d?.date_debut ?? "",
      date_fin: d?.date_fin ?? "",
      statut: "ouvert" as ExerciceStatut,
    }
  })
}

export function ExerciceActiveProvider({ children }: { children: ReactNode }) {
  const { societeId } = useSocieteActive()
  const [exercices, setExercices] = useState<ExerciceOption[]>([])
  const [exercice, setExerciceState] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)

  const loadExercices = useCallback(async () => {
    if (!societeId) { setExercices([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/comptable/exercices?societe_id=${societeId}`, { cache: "no-store" })
      const data = res.ok ? await res.json() : { exercices: [] }
      const rows: ExerciceOption[] = Array.isArray(data?.exercices) && data.exercices.length > 0
        ? data.exercices.map((e: any) => ({
            annee: e.annee,
            date_debut: e.date_debut ?? "",
            date_fin: e.date_fin ?? "",
            statut: (e.statut ?? "ouvert") as ExerciceStatut,
          }))
        : fallbackOptions()
      setExercices(rows)
    } catch {
      setExercices(fallbackOptions())
    } finally {
      setLoading(false)
    }
  }, [societeId])

  useEffect(() => { void loadExercices() }, [loadExercices])

  // (Re)sélectionne un exercice valide quand la liste ou la société change :
  // persistance société → défaut = exercice courant s'il existe → 1er de la liste.
  useEffect(() => {
    if (!societeId || exercices.length === 0) { setExerciceState(null); return }
    const persisted = readStorage(storageKey(societeId))
    const has = (a: string | null) => !!a && exercices.some((e) => e.annee === a)
    if (has(persisted)) { setExerciceState(persisted); return }
    const current = getCurrentExercice()
    if (has(current)) { setExerciceState(current); return }
    setExerciceState(exercices[0].annee)
  }, [societeId, exercices])

  const setExercice = useCallback((annee: string) => {
    if (!annee) return
    setExerciceState(annee)
    if (societeId) writeStorage(storageKey(societeId), annee)
  }, [societeId])

  const active = useMemo(
    () => exercices.find((e) => e.annee === exercice) ?? null,
    [exercices, exercice],
  )

  const value = useMemo<ExerciceActiveContextValue>(() => ({
    exercice,
    dateDebut: active?.date_debut || (exercice ? exerciceDatesFromLabel(exercice)?.date_debut ?? null : null),
    dateFin: active?.date_fin || (exercice ? exerciceDatesFromLabel(exercice)?.date_fin ?? null : null),
    statut: active?.statut ?? null,
    exercices,
    loading,
    setExercice,
    refresh: loadExercices,
  }), [exercice, active, exercices, loading, setExercice, loadExercices])

  return (
    <ExerciceActiveContext.Provider value={value}>
      {children}
    </ExerciceActiveContext.Provider>
  )
}

/** Hook non bloquant : renvoie null hors provider (les écrans hors compta l'ignorent). */
export function useExerciceActive(): ExerciceActiveContextValue | null {
  return useContext(ExerciceActiveContext)
}
