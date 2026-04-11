"use client"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useState, useEffect } from "react"
import {
  LayoutDashboard, Building2, Users, FileText, BookOpen,
  Calculator, Receipt, BarChart3, Scale, Clock, CreditCard,
  Settings, LogOut, ChevronDown, ChevronRight, UserCog,
  Banknote, FileSpreadsheet, Gavel, MessageSquare, TrendingUp,
  ClipboardList, AlertCircle, AlertTriangle, Globe
} from "lucide-react"

const MENU = [
  {
    section: "Administration",
    items: [
      { href: "/admin", label: "Tableau de bord", icon: LayoutDashboard, exact: true },
      { href: "/admin/societes", label: "Sociétés", icon: Building2 },
      { href: "/admin/users", label: "Utilisateurs", icon: Users },
      { href: "/admin/comptables", label: "Comptables", icon: UserCog },
      { href: "/admin/parametres", label: "Paramètres", icon: Settings },
    ]
  },
  {
    section: "Comptabilité",
    items: [
      { href: "/comptable", label: "Dashboard Compta", icon: LayoutDashboard, exact: true },
      { href: "/comptable/mes-clients", label: "Mes Clients", icon: Users },
      { href: "/comptable/documents", label: "Documents & OCR", icon: FileText },
      { href: "/comptable/banque", label: "Banque & Rapprochement", icon: Banknote },
      { href: "/comptable/tva", label: "TVA MRA", icon: Receipt },
      { href: "/comptable/charges-sociales", label: "Charges sociales", icon: Calculator },
      { href: "/comptable/interco", label: "INTERCO", icon: Globe },
      { href: "/comptable/rapports", label: "Rapports", icon: BarChart3 },
      { href: "/comptable/alertes", label: "Alertes", icon: AlertTriangle, badge: true },
    ]
  },
  {
    section: "États Financiers",
    items: [
      { href: "/comptable/clients", label: "Grand Livre / Balance", icon: BookOpen },
      { href: "/comptable/factures-clients", label: "Factures clients", icon: FileSpreadsheet },
      { href: "/comptable/fournisseurs", label: "Fournisseurs", icon: FileSpreadsheet },
    ]
  },
  {
    section: "RH & Paie",
    items: [
      { href: "/rh", label: "Dashboard RH", icon: LayoutDashboard, exact: true },
      { href: "/rh/employes", label: "Employés", icon: Users },
      { href: "/rh/pointage", label: "Pointage", icon: Clock },
      { href: "/rh/conges", label: "Absences & Congés", icon: ClipboardList },
      { href: "/rh/paie", label: "Paie & Bulletins", icon: CreditCard },
      { href: "/rh/paie/primes", label: "Primes & OT", icon: TrendingUp },
      { href: "/rh/paie/exports-mra", label: "Exports MRA", icon: FileText },
      { href: "/client/declarations-sociales", label: "Declarations Sociales", icon: FileText },
      { href: "/client/demandes-rh", label: "Demandes RH", icon: ClipboardList },
      { href: "/rh/exports/virement", label: "Virements bancaires", icon: Banknote },
      { href: "/rh/juridique", label: "Juridique", icon: Gavel },
      { href: "/juridique/contrats", label: "Générateur contrats IA", icon: Gavel },
      { href: "/rh/paie/edf", label: "EDF Annuel", icon: Receipt },
      { href: "/rh/paie/parametres", label: "Paramètres paie", icon: Settings },
    ]
  },
  {
    section: "Fiscal MRA",
    items: [
      { href: "/comptable/clients", label: "IT Form 3", icon: Scale },
      { href: "/comptable/clients", label: "FAR / Annual Allowance", icon: Calculator },
      { href: "/comptable/clients", label: "Annual Return ROC", icon: FileText },
    ]
  },
  {
    section: "Direction",
    items: [
      { href: "/direction", label: "Dashboard Direction", icon: BarChart3 },
      { href: "/client/previsionnel", label: "Prévisionnel", icon: TrendingUp },
    ]
  },
  {
    section: "Portails",
    items: [
      { href: "/client/tableau-de-bord", label: "Portail Client", icon: Building2 },
      { href: "/salarie", label: "Portail Salarié", icon: Users },
    ]
  },
]

export function AdminSidebarUnified() {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [criticalAlertCount, setCriticalAlertCount] = useState(0)

  useEffect(() => {
    async function fetchAlertCount() {
      try {
        const res = await fetch("/api/comptable/alertes")
        if (res.ok) {
          const data = await res.json()
          setCriticalAlertCount(data.counts?.critical || 0)
        }
      } catch {
        // Silently fail — badge simply won't show
      }
    }
    fetchAlertCount()
    const interval = setInterval(fetchAlertCount, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const toggleSection = (section: string) => {
    setCollapsed(prev => prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section])
  }

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <aside className="w-64 bg-[#0B0F2E] min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-40 overflow-y-auto">
      {/* Logo */}
      <div className="p-4 border-b border-white/10 flex-shrink-0">
        <Link href="/admin" className="flex items-center gap-2">
          <div className="flex flex-col">
            <div className="flex items-baseline">
              <span className="text-base font-bold" style={{ color: "#E8EAFC", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}>LE</span>
              <span className="text-base font-bold" style={{ color: "#D4AF37", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}>X</span>
              <span className="text-base font-bold" style={{ color: "#E8EAFC", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}>ORA</span>
            </div>
            <span className="text-[10px] font-light tracking-wider" style={{ color: "#4A5490" }}>Comptabilité IA Maurice</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {MENU.map(({ section, items }) => {
          const isCollapsed = collapsed.includes(section)
          const hasActive = items.some(i => isActive(i.href, i.exact))
          return (
            <div key={section} className="mb-1">
              <button
                onClick={() => toggleSection(section)}
                className={cn(
                  "w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wider rounded transition-colors",
                  hasActive ? "text-[#D4AF37]" : "text-white/40 hover:text-white/70"
                )}
              >
                <span>{section}</span>
                {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {!isCollapsed && (
                <div className="space-y-0.5 ml-1">
                  {items.map(item => {
                    const Icon = item.icon
                    const active = isActive(item.href, (item as any).exact)
                    const showBadge = (item as any).badge && criticalAlertCount > 0
                    return (
                      <Link
                        key={item.href + item.label}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                          active
                            ? "bg-[#D4AF37] text-[#0B0F2E] font-semibold"
                            : "text-white/70 hover:bg-white/10 hover:text-white"
                        )}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{item.label}</span>
                        {showBadge && (
                          <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                            {criticalAlertCount > 99 ? "99+" : criticalAlertCount}
                          </span>
                        )}
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
      <div className="p-3 border-t border-white/10 flex-shrink-0 space-y-1">
        <Link href="/profil" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-white/50 hover:bg-white/10 hover:text-white text-sm transition-colors">
          <Settings className="w-4 h-4" />
          <span>Mon profil</span>
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-white/50 hover:bg-red-500/20 hover:text-red-400 text-sm transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Déconnexion</span>
        </button>
      </div>
    </aside>
  )
}
