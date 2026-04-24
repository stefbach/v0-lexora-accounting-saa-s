"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

/**
 * RHSocieteActiveProvider — Context "société active" pour l'espace /rh/*.
 *
 * Copie stricte du pattern SocieteActiveProvider (client). Partage le
 * même cookie `active_societe_id` pour que la navigation croisée
 * /client/* ↔ /rh/* conserve automatiquement la société active.
 *
 * Mono-société : un seul cookie, pas de "toutes les sociétés", pas de
 * flag parallèle. Si `societeId` est null → middleware redirige vers
 * /rh/select-societe.
 */

export const ACTIVE_SOCIETE_COOKIE = "active_societe_id"
export const ACTIVE_SOCIETE_STORAGE_KEY = "lexora_active_societe"
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

export interface Societe {
  id: string
  nom: string
  brn?: string | null
  ern?: string | null
  numero_tva_mra?: string | null
  statut_tva?: boolean | null
  secteur_activite?: string | null
  adresse?: string | null
  telephone?: string | null
  email?: string | null
  modules_actifs?: Record<string, boolean> | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}

export interface RHSocieteActiveContextValue {
  societeId: string | null
  societe: Societe | null
  societes: Societe[]
  loading: boolean
  error: string | null
  switchSociete: (id: string) => void
  clearSociete: () => void
  refresh: () => Promise<void>
}

const RHSocieteActiveContext = createContext<RHSocieteActiveContextValue | null>(null)

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const prefix = `${name}=`
  for (const raw of document.cookie.split(";")) {
    const c = raw.trim()
    if (c.startsWith(prefix)) return decodeURIComponent(c.slice(prefix.length))
  }
  return null
}

function writeCookie(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === "undefined") return
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=lax`
}

function deleteCookie(name: string) {
  if (typeof document === "undefined") return
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`
}

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null
  try { return window.localStorage.getItem(key) } catch { return null }
}

function writeStorage(key: string, value: string) {
  if (typeof window === "undefined") return
  try { window.localStorage.setItem(key, value) } catch { /* quota */ }
}

function deleteStorage(key: string) {
  if (typeof window === "undefined") return
  try { window.localStorage.removeItem(key) } catch { /* ignore */ }
}

function readInitialSocieteId(): string | null {
  return readCookie(ACTIVE_SOCIETE_COOKIE) || readStorage(ACTIVE_SOCIETE_STORAGE_KEY)
}

export function RHSocieteActiveProvider({ children }: { children: ReactNode }) {
  const [societes, setSocietes] = useState<Societe[]>([])
  const [societeId, setSocieteId] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const hasLoadedOnce = useRef<boolean>(false)

  const loadSocietes = useCallback(async () => {
    try {
      const res = await fetch("/api/comptable/societes", { cache: "no-store" })
      if (!res.ok) {
        setError("Impossible de charger la liste des sociétés.")
        setSocietes([])
        return
      }
      const data = await res.json()
      const list: Societe[] = Array.isArray(data?.societes) ? data.societes : []
      setSocietes(list)
      setError(null)
    } catch {
      setError("Erreur réseau lors du chargement des sociétés.")
      setSocietes([])
    } finally {
      setLoading(false)
      hasLoadedOnce.current = true
    }
  }, [])

  useEffect(() => {
    setSocieteId(readInitialSocieteId())
    void loadSocietes()
  }, [loadSocietes])

  // Reconcile persisted id with loaded list. If saved id is no longer
  // accessible, drop it (middleware renverra vers /rh/select-societe).
  useEffect(() => {
    if (!hasLoadedOnce.current) return
    if (!societeId) return
    if (societes.length === 0) return
    const stillAccessible = societes.some((s) => s.id === societeId)
    if (!stillAccessible) {
      deleteCookie(ACTIVE_SOCIETE_COOKIE)
      deleteStorage(ACTIVE_SOCIETE_STORAGE_KEY)
      setSocieteId(null)
    }
  }, [societeId, societes])

  const switchSociete = useCallback(
    (id: string) => {
      if (!id) return
      const match = societes.find((s) => s.id === id)
      if (!match) {
        setError("Société non accessible.")
        return
      }
      writeCookie(ACTIVE_SOCIETE_COOKIE, id, COOKIE_MAX_AGE_SECONDS)
      writeStorage(ACTIVE_SOCIETE_STORAGE_KEY, id)
      setSocieteId(id)
      setError(null)
    },
    [societes],
  )

  const clearSociete = useCallback(() => {
    deleteCookie(ACTIVE_SOCIETE_COOKIE)
    deleteStorage(ACTIVE_SOCIETE_STORAGE_KEY)
    setSocieteId(null)
  }, [])

  const societe = useMemo<Societe | null>(
    () => (societeId ? societes.find((s) => s.id === societeId) ?? null : null),
    [societeId, societes],
  )

  const value = useMemo<RHSocieteActiveContextValue>(
    () => ({
      societeId,
      societe,
      societes,
      loading,
      error,
      switchSociete,
      clearSociete,
      refresh: loadSocietes,
    }),
    [societeId, societe, societes, loading, error, switchSociete, clearSociete, loadSocietes],
  )

  return (
    <RHSocieteActiveContext.Provider value={value}>
      {children}
    </RHSocieteActiveContext.Provider>
  )
}

export function useRHSocieteActive(): RHSocieteActiveContextValue {
  const ctx = useContext(RHSocieteActiveContext)
  if (!ctx) {
    throw new Error(
      "useRHSocieteActive must be used inside <RHSocieteActiveProvider>. " +
        "Check that app/rh/layout.tsx wraps the tree.",
    )
  }
  return ctx
}
