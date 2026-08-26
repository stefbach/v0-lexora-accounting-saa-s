"use client"

/**
 * ClientPicker — sélecteur de client (optionnel) pour l'encaissement POS.
 *
 * Recherche dans l'annuaire clients existant (factures_contacts) via
 * /api/client/factures-contacts?q=… et renvoie l'id + libellé choisi. Aucune
 * table dédiée : réutilise les contacts de facturation.
 */

import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { User, X, Search } from "lucide-react"

export interface ClientChoisi {
  id: string
  label: string
}

interface Contact {
  id: string
  nom: string | null
  entreprise: string | null
}

const libelle = (c: Contact): string => c.entreprise || c.nom || "Client"

export function ClientPicker({
  societeId,
  value,
  onChange,
}: {
  societeId: string | null | undefined
  value: ClientChoisi | null
  onChange: (v: ClientChoisi | null) => void
}) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!societeId || value) {
      setResults([])
      return
    }
    const term = q.trim()
    if (timer.current) clearTimeout(timer.current)
    if (term.length < 2) {
      setResults([])
      return
    }
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/client/factures-contacts?societe_id=${societeId}&q=${encodeURIComponent(term)}`,
        )
        const data = await res.json()
        setResults(res.ok ? (data.items || []).slice(0, 8) : [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [q, societeId, value])

  if (value) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="gap-1">
          <User className="h-3 w-3" /> {value.label}
        </Badge>
        <button
          type="button"
          className="text-muted-foreground hover:text-red-600"
          onClick={() => onChange(null)}
          aria-label="Retirer le client"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        className="pl-8"
        placeholder="Rechercher un client (nom, entreprise)…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        aria-label="Rechercher un client"
      />
      {open && (results.length > 0 || loading) && (
        <div className="absolute z-20 mt-1 w-full rounded-md border bg-white shadow-md">
          {loading && <div className="px-3 py-2 text-xs text-muted-foreground">Recherche…</div>}
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => {
                onChange({ id: c.id, label: libelle(c) })
                setQ("")
                setOpen(false)
              }}
            >
              <span className="font-medium">{libelle(c)}</span>
              {c.entreprise && c.nom && <span className="text-muted-foreground"> · {c.nom}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
