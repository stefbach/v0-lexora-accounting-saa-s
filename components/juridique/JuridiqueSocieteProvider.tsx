"use client"
/**
 * JuridiqueSocieteProvider — contexte de société active pour le Département Juridique.
 *
 * Charge les sociétés accessibles (client + comptable), mémorise la sélection,
 * et expose un hook + un sélecteur réutilisable. Monté dans app/juridique/layout.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Building2 } from "lucide-react"

export interface SocieteLite {
  id: string
  nom: string
  brn?: string | null
  adresse?: string | null
}

interface Ctx {
  societes: SocieteLite[]
  societeId: string
  setSocieteId: (id: string) => void
  societe: SocieteLite | null
  loading: boolean
}

const STORAGE_KEY = "lexora_juridique_societe"
const JuridiqueSocieteContext = createContext<Ctx | null>(null)

export function JuridiqueSocieteProvider({ children }: { children: React.ReactNode }) {
  const [societes, setSocietes] = useState<SocieteLite[]>([])
  const [societeId, setSocieteIdState] = useState<string>("")
  const [loading, setLoading] = useState(true)

  const setSocieteId = (id: string) => {
    setSocieteIdState(id)
    try { localStorage.setItem(STORAGE_KEY, id) } catch { /* noop */ }
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch("/api/client/societes").then((r) => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/comptable/societes").then((r) => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      if (cancelled) return
      const merged: SocieteLite[] = [...(d1.societes || []), ...(d2.societes || [])]
      const seen = new Set<string>()
      const unique = merged.filter((s) => s?.id && !seen.has(s.id) && seen.add(s.id))
      setSocietes(unique)
      let stored = ""
      try { stored = localStorage.getItem(STORAGE_KEY) || "" } catch { /* noop */ }
      const initial = unique.find((s) => s.id === stored)?.id || unique[0]?.id || ""
      setSocieteIdState(initial)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const societe = useMemo(() => societes.find((s) => s.id === societeId) ?? null, [societes, societeId])

  return (
    <JuridiqueSocieteContext.Provider value={{ societes, societeId, setSocieteId, societe, loading }}>
      {children}
    </JuridiqueSocieteContext.Provider>
  )
}

export function useJuridiqueSociete(): Ctx {
  const ctx = useContext(JuridiqueSocieteContext)
  if (!ctx) throw new Error("useJuridiqueSociete must be used inside <JuridiqueSocieteProvider>")
  return ctx
}

/** Sélecteur de société réutilisable (header des pages juridiques). */
export function SocieteSelector({ className = "" }: { className?: string }) {
  const { societes, societeId, setSocieteId } = useJuridiqueSociete()
  if (societes.length === 0) return null
  if (societes.length === 1) {
    return (
      <div className={`flex items-center gap-2 text-sm text-gray-600 ${className}`}>
        <Building2 className="w-4 h-4 text-[#D4AF37]" />
        <span className="font-medium text-[#0B0F2E]">{societes[0].nom}</span>
      </div>
    )
  }
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Building2 className="w-4 h-4 text-[#D4AF37]" />
      <Select value={societeId} onValueChange={setSocieteId}>
        <SelectTrigger className="w-[220px] h-9 bg-white">
          <SelectValue placeholder="Choisir une société" />
        </SelectTrigger>
        <SelectContent>
          {societes.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
