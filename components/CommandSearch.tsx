"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Search, Users, FileText, Zap, ArrowRight,
  Calendar, DollarSign, Briefcase, Clock, PlaneTakeoff,
} from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface SearchResult {
  id: string
  label: string
  category: "employes" | "pages" | "actions"
  href: string
  icon: React.ReactNode
  keywords: string[]
}

const PAGES: SearchResult[] = [
  { id: "p-dashboard", label: "Tableau de bord", category: "pages", href: "/rh", icon: <FileText className="h-4 w-4" />, keywords: ["dashboard", "accueil", "tableau"] },
  { id: "p-employes", label: "Employés", category: "pages", href: "/rh/employes", icon: <Users className="h-4 w-4" />, keywords: ["employes", "salaries", "liste"] },
  { id: "p-planning", label: "Planning", category: "pages", href: "/rh/planning", icon: <Calendar className="h-4 w-4" />, keywords: ["planning", "horaires", "shifts"] },
  { id: "p-paie", label: "Paie", category: "pages", href: "/rh/paie", icon: <DollarSign className="h-4 w-4" />, keywords: ["paie", "salaire", "bulletins"] },
  { id: "p-conges", label: "Congés", category: "pages", href: "/rh/conges", icon: <PlaneTakeoff className="h-4 w-4" />, keywords: ["conges", "vacances", "absence"] },
  { id: "p-pointage", label: "Pointage", category: "pages", href: "/rh/pointage", icon: <Clock className="h-4 w-4" />, keywords: ["pointage", "presence", "horloge"] },
  { id: "p-societe", label: "Paramètres société", category: "pages", href: "/rh/societe", icon: <Briefcase className="h-4 w-4" />, keywords: ["societe", "parametres", "configuration", "settings"] },
  { id: "p-heures-sup", label: "Heures supplémentaires", category: "pages", href: "/rh/heures-sup", icon: <Clock className="h-4 w-4" />, keywords: ["heures", "supplementaires", "overtime"] },
  { id: "p-primes", label: "Primes", category: "pages", href: "/rh/primes", icon: <DollarSign className="h-4 w-4" />, keywords: ["primes", "bonus", "gratification"] },
  { id: "p-jours-feries", label: "Jours fériés", category: "pages", href: "/rh/jours-feries", icon: <Calendar className="h-4 w-4" />, keywords: ["feries", "holidays", "conges"] },
]

const ACTIONS: SearchResult[] = [
  { id: "a-calc-paie", label: "Calculer la paie", category: "actions", href: "/rh/paie", icon: <Zap className="h-4 w-4" />, keywords: ["calculer", "paie", "salaire", "bulletin"] },
  { id: "a-new-conge", label: "Nouveau congé", category: "actions", href: "/rh/conges", icon: <Zap className="h-4 w-4" />, keywords: ["nouveau", "conge", "demande", "absence"] },
  { id: "a-new-employe", label: "Nouvel employé", category: "actions", href: "/rh/employes", icon: <Zap className="h-4 w-4" />, keywords: ["nouveau", "employe", "ajouter", "creer"] },
  { id: "a-export-paie", label: "Exporter la paie", category: "actions", href: "/rh/paie", icon: <Zap className="h-4 w-4" />, keywords: ["exporter", "paie", "csv", "excel"] },
  { id: "a-planning", label: "Gérer le planning", category: "actions", href: "/rh/planning", icon: <Zap className="h-4 w-4" />, keywords: ["gerer", "planning", "shifts", "horaires"] },
]

const CATEGORY_LABELS: Record<string, string> = {
  employes: "Employés",
  pages: "Pages",
  actions: "Actions",
}

const CATEGORY_ORDER: string[] = ["employes", "pages", "actions"]

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: GOLD, fontWeight: 600 }}>{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function CommandSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [employees, setEmployees] = useState<SearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  // Load employees once
  useEffect(() => {
    fetch("/api/rh/employes")
      .then((r) => r.json())
      .then((d) => {
        const emps: SearchResult[] = (d.employes || []).slice(0, 100).map((e: any) => ({
          id: `e-${e.id}`,
          label: `${e.prenom} ${e.nom}`,
          category: "employes" as const,
          href: `/rh/employes/${e.id}`,
          icon: <Users className="h-4 w-4" />,
          keywords: [e.nom?.toLowerCase(), e.prenom?.toLowerCase(), e.code?.toLowerCase()].filter(Boolean),
        }))
        setEmployees(emps)
      })
      .catch(() => {})
  }, [])

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  // Filter results
  const allItems = [...employees, ...PAGES, ...ACTIONS]
  const filtered = query.trim()
    ? allItems.filter((item) => {
        const q = query.toLowerCase()
        return (
          item.label.toLowerCase().includes(q) ||
          item.keywords.some((k) => k.includes(q))
        )
      })
    : [...PAGES, ...ACTIONS]

  // Group by category
  const grouped: Record<string, SearchResult[]> = {}
  for (const item of filtered) {
    if (!grouped[item.category]) grouped[item.category] = []
    grouped[item.category].push(item)
  }

  // Flat list for keyboard navigation
  const flatResults: SearchResult[] = []
  for (const cat of CATEGORY_ORDER) {
    if (grouped[cat]) flatResults.push(...grouped[cat])
  }

  // Reset index when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const navigate = useCallback(
    (item: SearchResult) => {
      setOpen(false)
      setQuery("")
      router.push(item.href)
    },
    [router]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, flatResults.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && flatResults[selectedIndex]) {
      e.preventDefault()
      navigate(flatResults[selectedIndex])
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery("") }}>
      <DialogContent
        className="sm:max-w-[560px] p-0 gap-0 overflow-hidden"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Recherche rapide</DialogTitle>
        {/* Search input */}
        <div className="flex items-center border-b px-4 py-3">
          <Search className="h-5 w-5 mr-3 shrink-0 opacity-50" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Rechercher un employé, une page, une action..."
            className="border-0 shadow-none focus-visible:ring-0 px-0 text-sm h-auto"
            style={{ color: NAVY }}
            autoFocus
          />
          <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground ml-2">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[360px] overflow-y-auto py-2">
          {flatResults.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">
              Aucun résultat pour &ldquo;{query}&rdquo;
            </div>
          ) : (
            CATEGORY_ORDER.map((cat) => {
              const items = grouped[cat]
              if (!items || items.length === 0) return null
              return (
                <div key={cat}>
                  <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {CATEGORY_LABELS[cat]}
                  </div>
                  {items.map((item) => {
                    const globalIdx = flatResults.indexOf(item)
                    const isSelected = globalIdx === selectedIndex
                    return (
                      <button
                        key={item.id}
                        onClick={() => navigate(item)}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                          isSelected ? "bg-gray-100" : "hover:bg-gray-50"
                        }`}
                        style={{ color: NAVY }}
                      >
                        <span className="shrink-0 opacity-60">{item.icon}</span>
                        <span className="flex-1 text-left truncate">
                          {highlightMatch(item.label, query)}
                        </span>
                        <ArrowRight
                          className={`h-3.5 w-3.5 shrink-0 transition-opacity ${
                            isSelected ? "opacity-60" : "opacity-0"
                          }`}
                        />
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-4 py-2 text-[11px] text-gray-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border bg-muted px-1 font-mono">↑</kbd>
              <kbd className="rounded border bg-muted px-1 font-mono">↓</kbd>
              naviguer
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border bg-muted px-1 font-mono">↵</kbd>
              ouvrir
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-muted px-1 font-mono">⌘</kbd>
            <kbd className="rounded border bg-muted px-1 font-mono">K</kbd>
            basculer
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
