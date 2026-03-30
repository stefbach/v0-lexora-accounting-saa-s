"use client"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useState, useEffect } from "react"
import {
  LayoutDashboard, Building2, FileText, BookOpen, Banknote,
  Receipt, Calculator, BarChart3, TrendingUp, Target,
  Users, Clock, CreditCard, Gavel, Scale, Bell,
  Settings, LogOut, ChevronDown, ChevronRight, FileSpreadsheet,
  UserCog, Globe, Lightbulb, ClipboardList, Download, Upload, Calendar,
  CalendarDays, FilePlus2, SlidersHorizontal, Menu, X
} from "lucide-react"

/* ------------------------------------------------------------------ */
/*  Module-gated section type                                          */
/* ------------------------------------------------------------------ */
interface MenuSection {
  section: string
  requiredModule?: "comptabilite" | "rh" | "juridique" | "facturation" | "documents"
  items: { href: string; label: string; icon: any }[]
}

interface ActiveModules {
  comptabilite: boolean
  rh: boolean
  juridique: boolean
  facturation: boolean
  documents: boolean
}

const DEFAULT_MODULES: ActiveModules = {
  comptabilite: true,
  rh: true,
  juridique: true,
  facturation: true,
  documents: true,
}

const MENU: MenuSection[] = [
  {
    section: "Mon Espace",
    items: [
      { href: "/client/tableau-de-bord", label: "Tableau de bord", icon: LayoutDashboard },
      { href: "/client/societes", label: "Mes Sociétés", icon: Building2 },
      { href: "/client/documents", label: "Documents & OCR", icon: FileText },
      { href: "/client/utilisateurs", label: "Utilisateurs", icon: Users },
      { href: "/client/equipe", label: "Mon Équipe", icon: UserCog },
      { href: "/client/alertes", label: "Alertes", icon: Bell },
      { href: "/client/assistant", label: "Espace Assistant", icon: Upload },
    ]
  },
  {
    section: "Facturation",
    requiredModule: "facturation",
    items: [
      { href: "/client/factures", label: "Mes Factures", icon: Receipt },
      { href: "/client/nouvelle-facture", label: "Nouvelle Facture", icon: FilePlus2 },
      { href: "/client/facturation-settings", label: "Paramètres Facturation", icon: SlidersHorizontal },
    ]
  },
  {
    section: "Comptabilité",
    requiredModule: "comptabilite",
    items: [
      { href: "/client/banque", label: "Banque", icon: Banknote },
      { href: "/client/rapprochement", label: "Rapprochement & Lettrage", icon: CreditCard },
      { href: "/client/tresorerie", label: "Trésorerie", icon: Banknote },
      { href: "/client/fournisseurs", label: "Fournisseurs", icon: FileSpreadsheet },
      { href: "/client/compte-courant", label: "Comptes Courants Associés", icon: Users },
      { href: "/client/finances", label: "Mes Chiffres", icon: BarChart3 },
    ]
  },
  {
    section: "États Financiers",
    requiredModule: "comptabilite",
    items: [
      { href: "/client/bilan", label: "Bilan & P&L", icon: BookOpen },
      { href: "/client/grand-livre", label: "Grand Livre", icon: BookOpen },
      { href: "/client/exercices", label: "Exercices", icon: Calendar },
      { href: "/client/previsionnel", label: "Prévisionnel", icon: TrendingUp },
      { href: "/client/echeances", label: "Échéances", icon: CalendarDays },
      { href: "/client/simulations", label: "Simulations", icon: Target },
      { href: "/client/conseils", label: "Conseils IA", icon: Lightbulb },
    ]
  },
  {
    section: "Fiscal MRA",
    requiredModule: "comptabilite",
    items: [
      { href: "/client/tva", label: "TVA MRA", icon: Receipt },
      { href: "/client/charges-sociales", label: "CSG / NSF / PAYE", icon: Calculator },
      { href: "/client/annual-return", label: "Annual Return (ROC)", icon: ClipboardList },
      { href: "/client/it-form3", label: "IT Form 3 (MRA)", icon: FileText },
    ]
  },
  {
    section: "RH & Paie",
    requiredModule: "rh",
    items: [
      { href: "/client/elaboration-paie", label: "Elaboration Paie", icon: Calculator },
      { href: "/client/salaires", label: "Paie & Bulletins", icon: CreditCard },
      { href: "/client/rapports-paie", label: "Rapports Statutaires", icon: FileSpreadsheet },
      { href: "/client/declarations-sociales", label: "Déclarations Sociales", icon: FileText },
      { href: "/client/exports-rh", label: "Exports & Virements", icon: Download },
      { href: "/client/employes", label: "Employés", icon: Users },
      { href: "/client/pointage", label: "Pointage", icon: Clock },
      { href: "/client/conges", label: "Congés", icon: Scale },
      { href: "/client/demandes-rh", label: "Demandes RH", icon: ClipboardList },
      { href: "/client/parametres-rh", label: "Paramètres RH", icon: Settings },
      { href: "/client/primes", label: "Gestion Primes", icon: Target },
      { href: "/client/planning", label: "Planning", icon: CalendarDays },
    ]
  },
  {
    section: "Mon Compte",
    items: [
      { href: "/client/profil", label: "Mon Profil", icon: Settings },
    ]
  },
]

export function ClientSidebarFull() {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [activeModules, setActiveModules] = useState<ActiveModules>(DEFAULT_MODULES)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close sidebar on navigation
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Fetch modules_actifs from the user's first societe
  useEffect(() => {
    const loadModules = async () => {
      try {
        const res = await fetch("/api/client/societes")
        if (!res.ok) return
        const data = await res.json()
        const societes = data.societes || []
        if (societes.length > 0 && societes[0].modules_actifs) {
          const m = societes[0].modules_actifs
          setActiveModules({
            comptabilite: m.comptabilite !== false,
            rh: m.rh !== false,
            juridique: m.juridique !== false,
            facturation: m.facturation !== false,
            documents: m.documents !== false,
          })
        }
      } catch {
        // Keep defaults if fetch fails
      }
    }
    loadModules()
  }, [])

  const toggle = (s: string) =>
    setCollapsed(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/")

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  // Filter menu sections based on active modules
  const visibleMenu = MENU.filter(section => {
    if (!section.requiredModule) return true
    return activeModules[section.requiredModule]
  })

  return (
    <>
      {/* Mobile hamburger */}
      <button onClick={() => setMobileOpen(true)} className="fixed top-4 left-4 z-50 md:hidden bg-[#1E2A4A] text-white p-2 rounded-lg shadow-lg">
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && <div onClick={() => setMobileOpen(false)} className="fixed inset-0 bg-black/50 z-40 md:hidden" />}

    <aside className={`w-64 bg-[#1E2A4A] min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-50 overflow-y-auto transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
      {/* Mobile close button */}
      <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-4 md:hidden text-white/60 hover:text-white z-10">
        <X className="w-5 h-5" />
      </button>

      {/* Logo */}
      <div className="p-4 border-b border-white/10 flex-shrink-0">
        <Link href="/client/tableau-de-bord" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#C9A84C] rounded-lg flex items-center justify-center">
            <span className="text-[#1E2A4A] font-black text-sm">L</span>
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight">LEXORA</p>
            <p className="text-white/40 text-xs">Espace Client</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {visibleMenu.map(({ section, items }) => {
          const isCollapsed = collapsed.includes(section)
          const hasActive = items.some(i => isActive(i.href))
          return (
            <div key={section} className="mb-1">
              <button
                onClick={() => toggle(section)}
                className={cn(
                  "w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wider rounded transition-colors",
                  hasActive ? "text-[#C9A84C]" : "text-white/40 hover:text-white/70"
                )}
              >
                <span>{section}</span>
                {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {!isCollapsed && (
                <div className="space-y-0.5 ml-1">
                  {items.map(item => {
                    const Icon = item.icon
                    const active = isActive(item.href)
                    return (
                      <Link key={item.href + item.label} href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                          active ? "bg-[#C9A84C] text-[#1E2A4A] font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white"
                        )}>
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-white/10 flex-shrink-0">
        <button onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-white/50 hover:bg-red-500/20 hover:text-red-400 text-sm transition-colors">
          <LogOut className="w-4 h-4" /><span>Déconnexion</span>
        </button>
      </div>
    </aside>
    </>
  )
}
