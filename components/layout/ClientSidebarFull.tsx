"use client"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useState } from "react"
import {
  LayoutDashboard, Building2, FileText, BookOpen, Banknote,
  Receipt, Calculator, BarChart3, TrendingUp, Target,
  Users, Clock, CreditCard, Gavel, Scale, Bell,
  Settings, LogOut, ChevronDown, ChevronRight, FileSpreadsheet,
  UserCog, Globe, Lightbulb, ClipboardList, Download, Upload
} from "lucide-react"

const MENU = [
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
    section: "Comptabilité",
    items: [
      { href: "/client/banque", label: "Banque", icon: Banknote },
      { href: "/client/rapprochement", label: "Rapprochement & Lettrage", icon: CreditCard },
      { href: "/client/tresorerie", label: "Trésorerie", icon: Banknote },
      { href: "/client/factures", label: "Factures Clients", icon: Receipt },
      { href: "/client/fournisseurs", label: "Fournisseurs", icon: FileSpreadsheet },
      { href: "/client/finances", label: "Mes Chiffres", icon: BarChart3 },
    ]
  },
  {
    section: "États Financiers",
    items: [
      { href: "/client/bilan", label: "Bilan & P&L", icon: BookOpen },
      { href: "/client/grand-livre", label: "Grand Livre", icon: BookOpen },
      { href: "/client/previsionnel", label: "Prévisionnel", icon: TrendingUp },
      { href: "/client/simulations", label: "Simulations", icon: Target },
      { href: "/client/conseils", label: "Conseils IA", icon: Lightbulb },
    ]
  },
  {
    section: "Fiscal MRA",
    items: [
      { href: "/client/tva", label: "TVA MRA", icon: Receipt },
      { href: "/client/charges-sociales", label: "CSG / NSF / PAYE", icon: Calculator },
      { href: "/client/annual-return", label: "Annual Return (ROC)", icon: ClipboardList },
      { href: "/client/it-form3", label: "IT Form 3 (MRA)", icon: FileText },
    ]
  },
  {
    section: "RH & Paie",
    items: [
      { href: "/client/salaires", label: "Paie & Bulletins", icon: CreditCard },
      { href: "/rh/employes", label: "Employés", icon: Users },
      { href: "/rh/pointage", label: "Pointage", icon: Clock },
      { href: "/rh/conges", label: "Congés", icon: Scale },
      { href: "/client/exports-rh", label: "Exports & Virements", icon: Download },
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

  const toggle = (s: string) =>
    setCollapsed(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/")

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <aside className="w-64 bg-[#1E2A4A] min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-40 overflow-y-auto">
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
        {MENU.map(({ section, items }) => {
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
  )
}
