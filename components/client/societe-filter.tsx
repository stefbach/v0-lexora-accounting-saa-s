"use client"

import { useState, useEffect, createContext, useContext, ReactNode } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Building2 } from "lucide-react"

interface Societe { id: string; nom: string }

interface SocieteContextType {
  selectedSocieteId: string | null
  setSelectedSocieteId: (id: string | null) => void
  societes: Societe[]
  loading: boolean
  financialUrl: string
}

const SocieteContext = createContext<SocieteContextType>({
  selectedSocieteId: null, setSelectedSocieteId: () => {}, societes: [], loading: true, financialUrl: "/api/client/financial"
})

export function useSocieteFilter() { return useContext(SocieteContext) }

export function SocieteFilterProvider({ children }: { children: ReactNode }) {
  const [selectedSocieteId, setSelectedSocieteId] = useState<string | null>(null)
  const [societes, setSocietes] = useState<Societe[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/client/financial")
      .then(r => r.json())
      .then(data => {
        const available = data.financial?.availableSocietes || []
        setSocietes(available)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const financialUrl = selectedSocieteId
    ? `/api/client/financial?societe_id=${selectedSocieteId}`
    : "/api/client/financial"

  return (
    <SocieteContext.Provider value={{ selectedSocieteId, setSelectedSocieteId, societes, loading, financialUrl }}>
      {children}
    </SocieteContext.Provider>
  )
}

export function SocieteSelector() {
  const { selectedSocieteId, setSelectedSocieteId, societes } = useSocieteFilter()

  if (societes.length <= 1) return null

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      <Select value={selectedSocieteId || "all"} onValueChange={(v) => setSelectedSocieteId(v === "all" ? null : v)}>
        <SelectTrigger className="w-[220px] h-9">
          <SelectValue placeholder="Toutes les sociétés" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Toutes les sociétés</SelectItem>
          {societes.map(s => (
            <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
