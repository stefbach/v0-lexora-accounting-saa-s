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
 * Partage le MÊME cookie `active_societe_id` que le provider client
 * (`components/client/SocieteActiveProvider.tsx`). Cela permet à un user
 * (client_admin, admin, rh, comptable, …) de naviguer entre /client/* et
 * /rh/* sans perdre sa société active.
 *
 * Différences avec le provider client :
 *   - societeId peut être `null` = mode "toutes les sociétés" (pour admin /
 *     super_admin qui veulent un dashboard consolidé). Le provider client
 *     force une société unique, pas celui-ci.
 *   - Charge les sociétés via /api/comptable/societes qui applique déjà le
 *     filtrage par rôle (getUserSocieteIds) — comptables voient leurs
 *     clients, client_admin voit ses sociétés, admin voit tout.
 *
 * Usage dans une page /rh/* :
 *   const { societeId, societe, societes } = useRHSocieteActive()
 *   // societeId = null → l'utilisateur veut voir toutes ses sociétés
 */

export const ACTIVE_SOCIETE_COOKIE = "active_societe_id"
export const ACTIVE_SOCIETE_STORAGE_KEY = "lexora_active_societe"
/**
 * Cookie distinct pour marquer "l'utilisateur a fait un choix RH".
 * Nécessaire pour distinguer :
 *   - user frais (pas de cookie) → middleware redirige vers /rh/select-societe
 *   - user qui a choisi "Toutes les sociétés" (active_societe_id vide) → pas de redirect
 * Ne touche pas le cookie active_societe_id (partagé avec /client/* qui lui
 * est mono-société strict).
 */
export const RH_CHOICE_COOKIE = "rh_societe_choice_made"
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
  /** null = mode "toutes les sociétés" (vue consolidée). */
  societeId: string | null
  societe: Societe | null
  societes: Societe[]
  loading: boolean
  error: string | null
  switchSociete: (id: string) => void
  /** Bascule en mode "toutes les sociétés" (societeId = null). */
  selectAll: () => void
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

  // First mount : read persisted id + fetch sociétés list
  useEffect(() => {
    setSocieteId(readInitialSocieteId())
    void loadSocietes()
  }, [loadSocietes])

  // Reconcile persisted id with loaded list. If saved id is no longer
  // accessible (role change, revocation, …), drop it and fall back to
  // "toutes sociétés" (null).
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
      writeCookie(RH_CHOICE_COOKIE, "true", COOKIE_MAX_AGE_SECONDS)
      writeStorage(ACTIVE_SOCIETE_STORAGE_KEY, id)
      setSocieteId(id)
      setError(null)
    },
    [societes],
  )

  const selectAll = useCallback(() => {
    // Mode "toutes les sociétés" : on retire le cookie active_societe_id
    // (pour que /client/* repasse en sélection manuelle au prochain passage)
    // MAIS on pose rh_societe_choice_made=true pour que le middleware ne
    // nous renvoie pas sur /rh/select-societe.
    deleteCookie(ACTIVE_SOCIETE_COOKIE)
    deleteStorage(ACTIVE_SOCIETE_STORAGE_KEY)
    writeCookie(RH_CHOICE_COOKIE, "true", COOKIE_MAX_AGE_SECONDS)
    setSocieteId(null)
  }, [])

  const clearSociete = useCallback(() => {
    deleteCookie(ACTIVE_SOCIETE_COOKIE)
    deleteCookie(RH_CHOICE_COOKIE)
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
      selectAll,
      clearSociete,
      refresh: loadSocietes,
    }),
    [societeId, societe, societes, loading, error, switchSociete, selectAll, clearSociete, loadSocietes],
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
