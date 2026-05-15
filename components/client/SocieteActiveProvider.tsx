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
 * SocieteActiveProvider — mono-société Context for the /client space.
 *
 * A dirigeant with multiple sociétés picks ONE active at a time (like a
 * comptable opening a client's folder). The active ID is persisted in:
 *   - cookie `active_societe_id` (readable by the middleware)
 *   - localStorage `lexora_active_societe` (client fallback)
 *
 * Must wrap ONLY the part of the tree reserved to client_admin /
 * client_user / client_assistant roles. Comptables have their own flow
 * via /comptable/clients/[clientId]/[societeId].
 */

export const ACTIVE_SOCIETE_COOKIE = "active_societe_id"
export const ACTIVE_SOCIETE_STORAGE_KEY = "lexora_active_societe"
// Sprint 3 — Cookie spécifique au mode "Acting as client" pour un
// comptable. Quand présent, il a priorité absolue sur le cookie normal :
// l'expérience /client/* est alors celle du client cible, sans toucher
// à la société active "personnelle" du comptable.
export const ACTING_AS_SOCIETE_COOKIE = "lexora_acting_as_societe"
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
  [key: string]: unknown
}

export interface SocieteActiveContextValue {
  societeId: string | null
  societe: Societe | null
  societes: Societe[]
  loading: boolean
  error: string | null
  switchSociete: (id: string) => void
  clearSociete: () => void
  /** Force a refresh of the sociétés list (e.g. after creating a new one). */
  refresh: () => Promise<void>
}

const SocieteActiveContext = createContext<SocieteActiveContextValue | null>(null)

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
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* ignore quota errors */
  }
}

function deleteStorage(key: string) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

function readInitialSocieteId(): string | null {
  // Sprint 3 — Si un cookie acting_as est posé, il a priorité absolue.
  // Le comptable qui entre dans le dossier d'un client doit voir cette
  // société active dans /client/*, indépendamment de sa session normale.
  return readCookie(ACTING_AS_SOCIETE_COOKIE)
    || readCookie(ACTIVE_SOCIETE_COOKIE)
    || readStorage(ACTIVE_SOCIETE_STORAGE_KEY)
}

export function SocieteActiveProvider({ children }: { children: ReactNode }) {
  const [societes, setSocietes] = useState<Societe[]>([])
  const [societeId, setSocieteId] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  // Prevent clearing the cookie during the first render, before the sociétés
  // list has loaded — otherwise a fresh visit would always drop the cookie.
  const hasLoadedOnce = useRef<boolean>(false)

  const loadSocietes = useCallback(async () => {
    try {
      const res = await fetch("/api/client/societes", { cache: "no-store" })
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

  // First mount: read persisted id + fetch sociétés list
  useEffect(() => {
    setSocieteId(readInitialSocieteId())
    void loadSocietes()
  }, [loadSocietes])

  // Reconcile the persisted id with the loaded list. If the saved id is not
  // in the user's sociétés anymore (e.g. access was revoked), drop it.
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

  const value = useMemo<SocieteActiveContextValue>(
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
    <SocieteActiveContext.Provider value={value}>
      {children}
    </SocieteActiveContext.Provider>
  )
}

export function useSocieteActive(): SocieteActiveContextValue {
  const ctx = useContext(SocieteActiveContext)
  if (!ctx) {
    throw new Error(
      "useSocieteActive must be used inside <SocieteActiveProvider>. " +
        "Check that app/client/layout.tsx wraps the tree for the current role.",
    )
  }
  return ctx
}
