"use client"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useProfile } from "@/hooks/use-profile"
import { useState, useEffect } from "react"
import { t, getLocale } from "@/lib/i18n"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import {
  LayoutDashboard, Building2, FileText, BookOpen, Banknote,
  Receipt, Calculator, BarChart3, TrendingUp, Target,
  Users, Clock, CreditCard, Gavel, Scale, Bell,
  Settings, LogOut, ChevronDown, ChevronRight, FileSpreadsheet,
  Globe, Lightbulb, ClipboardList, Download, Upload, Calendar,
  CalendarDays, FilePlus2, SlidersHorizontal, Menu, X
} from "lucide-react"

/* ------------------------------------------------------------------ */
/*  Module-gated section type                                          */
/* ------------------------------------------------------------------ */
type ModuleKey = "comptabilite" | "rh" | "juridique" | "facturation" | "documents" | "fiscal" | "etats_financiers" | "employe_portal"

interface MenuSection {
  section: string
  sectionKey?: string
  requiredModule?: ModuleKey
  items: { href: string; label: string; labelKey?: string; icon: any }[]
}

interface ActiveModules {
  comptabilite: boolean
  rh: boolean
  juridique: boolean
  facturation: boolean
  documents: boolean
  fiscal: boolean
  etats_financiers: boolean
  employe_portal: boolean
}

interface UserModules {
  documents?: boolean
  comptabilite?: boolean
  facturation?: boolean
  rh?: boolean
  fiscal?: boolean
  etats_financiers?: boolean
  employe_portal?: boolean
}

function getUserDefaultModules(role: string): UserModules {
  switch (role) {
    case "client_admin":
    case "super_admin":
    case "admin":
      return { documents: true, comptabilite: true, facturation: true, rh: true, fiscal: true, etats_financiers: true, employe_portal: true }
    case "client_user":
      return { documents: true, comptabilite: true, facturation: true, rh: true, fiscal: true, etats_financiers: true, employe_portal: false }
    case "client_assistant":
      return { documents: true, comptabilite: false, facturation: false, rh: false, fiscal: false, etats_financiers: false, employe_portal: false }
    case "rh":
      return { documents: true, comptabilite: false, facturation: false, rh: true, fiscal: false, etats_financiers: false, employe_portal: false }
    case "comptable":
    case "comptable_dedie":
      return { documents: true, comptabilite: true, facturation: true, rh: false, fiscal: true, etats_financiers: true, employe_portal: false }
    case "employe":
      return { documents: false, comptabilite: false, facturation: false, rh: false, fiscal: false, etats_financiers: false, employe_portal: true }
    default:
      return { documents: true, comptabilite: false, facturation: false, rh: false, fiscal: false, etats_financiers: false, employe_portal: false }
  }
}

const DEFAULT_MODULES: ActiveModules = {
  comptabilite: true,
  rh: true,
  juridique: true,
  facturation: true,
  documents: true,
  fiscal: true,
  etats_financiers: true,
  employe_portal: true,
}

const MENU: MenuSection[] = [
  {
    section: "Mon Espace", sectionKey: "nav.my_space",
    items: [
      { href: "/client/tableau-de-bord", label: "Tableau de bord", labelKey: "nav.dashboard", icon: LayoutDashboard },
      { href: "/client/societes", label: "Mes Sociétés", labelKey: "nav.companies", icon: Building2 },
      { href: "/client/societe", label: "Fiche Société", icon: Settings },
      { href: "/client/documents", label: "Documents & OCR", labelKey: "nav.documents", icon: FileText },
      { href: "/client/utilisateurs", label: "Mon Équipe", labelKey: "nav.team", icon: Users },
      { href: "/client/alertes", label: "Alertes", labelKey: "nav.alerts", icon: Bell },
      { href: "/client/assistant", label: "Espace Assistant", labelKey: "nav.assistant", icon: Upload },
    ]
  },
  {
    section: "Facturation", sectionKey: "inv.invoicing",
    requiredModule: "facturation",
    items: [
      { href: "/client/factures", label: "Mes Factures", labelKey: "inv.my_invoices", icon: Receipt },
      { href: "/client/nouvelle-facture", label: "Nouvelle Facture", labelKey: "inv.new_invoice", icon: FilePlus2 },
      { href: "/client/facture-template", label: "Template IA", icon: Lightbulb },
      { href: "/client/facturation-settings", label: "Paramètres Facturation", labelKey: "inv.settings", icon: SlidersHorizontal },
    ]
  },
  {
    section: "Comptabilité", sectionKey: "acc.accounting",
    requiredModule: "comptabilite",
    items: [
      { href: "/client/banque", label: "Banque", labelKey: "acc.bank", icon: Banknote },
      { href: "/client/rapprochement", label: "Rapprochement & Lettrage", labelKey: "acc.reconciliation", icon: CreditCard },
      { href: "/client/tresorerie", label: "Trésorerie", labelKey: "acc.treasury", icon: Banknote },
      { href: "/client/fournisseurs", label: "Fournisseurs", labelKey: "acc.suppliers", icon: FileSpreadsheet },
      { href: "/client/affectations", label: "Affectations comptables", icon: Settings },
      { href: "/client/salaires-compta", label: "Salaires", icon: CreditCard },
      { href: "/client/compte-courant", label: "Comptes Courants Associés", labelKey: "acc.current_accounts", icon: Users },
      { href: "/client/finances", label: "Mes Chiffres", labelKey: "acc.my_figures", icon: BarChart3 },
    ]
  },
  {
    section: "États Financiers", sectionKey: "fin.financial_statements",
    requiredModule: "etats_financiers",
    items: [
      { href: "/client/bilan", label: "Bilan & P&L", labelKey: "fin.balance_sheet", icon: BookOpen },
      { href: "/client/grand-livre", label: "Grand Livre", labelKey: "fin.general_ledger", icon: BookOpen },
      { href: "/client/exercices", label: "Exercices", labelKey: "fin.fiscal_years", icon: Calendar },
      { href: "/client/previsionnel", label: "Prévisionnel", labelKey: "fin.forecast", icon: TrendingUp },
      { href: "/client/echeances", label: "Échéances", labelKey: "fin.deadlines", icon: CalendarDays },
    ]
  },
  {
    section: "Fiscal MRA", sectionKey: "tax.fiscal_mra",
    requiredModule: "fiscal",
    items: [
      { href: "/client/tva", label: "TVA MRA", labelKey: "tax.vat", icon: Receipt },
      { href: "/client/charges-sociales", label: "CSG / NSF / PAYE", labelKey: "tax.social_charges", icon: Calculator },
      { href: "/client/annual-return", label: "Annual Return (ROC)", labelKey: "tax.annual_return", icon: ClipboardList },
      { href: "/client/it-form3", label: "IT Form 3 (MRA)", labelKey: "tax.it_form3", icon: FileText },
    ]
  },
  {
    section: "RH & Paie", sectionKey: "hr.hr_payroll",
    requiredModule: "rh",
    items: [
      { href: "/rh/employes", label: "Employés", icon: Users },
      { href: "/rh/groupes", label: "Groupes / Équipes", icon: Users },
      { href: "/rh/planning", label: "Planning", icon: CalendarDays },
      { href: "/rh/pointage", label: "Pointage", icon: Clock },
      { href: "/rh/conges", label: "Congés", icon: Scale },
      { href: "/rh/conges/parametres", label: "Règles congés", icon: Settings },
      { href: "/rh/paie", label: "Paie & Bulletins", icon: CreditCard },
      { href: "/rh/paie/validation", label: "Contrôle pré-paie", icon: ClipboardList },
      { href: "/rh/paie/primes", label: "Primes & OT", icon: Target },
      { href: "/rh/frais-km", label: "Frais kilométriques", icon: Download },
      { href: "/rh/paie/exports-mra", label: "Exports MRA", icon: FileSpreadsheet },
      { href: "/rh/exports/paie", label: "Export Paie & Virements", icon: FileText },
      { href: "/rh/paie/parametres", label: "Paramètres paie", icon: Settings },
      { href: "/rh/chat", label: "CLARA — Assistant IA", icon: Lightbulb },
    ]
  },
  {
    section: "Mon Compte", sectionKey: "account.my_account",
    items: [
      { href: "/client/societe", label: "Paramètres société", icon: Settings },
      { href: "/client/profil", label: "Mon Profil", labelKey: "account.my_profile", icon: Settings },
    ]
  },
]


export function ClientSidebarFull() {
  const pathname = usePathname()
  const router = useRouter()
  const { profile } = useProfile()
  const locale = getLocale()
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [activeModules, setActiveModules] = useState<ActiveModules>(DEFAULT_MODULES)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close sidebar on navigation
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Fetch modules_actifs from the user's first societe, then intersect with user permissions
  useEffect(() => {
    const loadModules = async () => {
      try {
        const res = await fetch("/api/client/societes")
        if (!res.ok) return
        const data = await res.json()
        const societes = data.societes || []

        // Step 1: societe plan modules (what the company's plan allows)
        let planModules: ActiveModules = { ...DEFAULT_MODULES }
        if (societes.length > 0 && societes[0].modules_actifs) {
          const m = societes[0].modules_actifs
          planModules = {
            comptabilite: m.comptabilite !== false,
            rh: m.rh !== false,
            juridique: m.juridique !== false,
            facturation: m.facturation !== false,
            documents: m.documents !== false,
            fiscal: m.fiscal !== false,
            etats_financiers: m.etats_financiers !== false,
            employe_portal: m.employe_portal !== false,
          }
        }

        // Step 2: per-user permissions (from profile.modules_utilisateur)
        // If NULL, use role-based defaults; if set, use the explicit values
        const userModules: UserModules = profile?.modules_utilisateur
          ? profile.modules_utilisateur
          : getUserDefaultModules(profile?.role || "client_user")

        // Step 3: intersection — module visible only if BOTH plan allows AND user has permission
        setActiveModules({
          comptabilite: planModules.comptabilite && (userModules.comptabilite !== false),
          rh: planModules.rh && (userModules.rh !== false),
          juridique: planModules.juridique,
          facturation: planModules.facturation && (userModules.facturation !== false),
          documents: planModules.documents && (userModules.documents !== false),
          fiscal: planModules.fiscal && (userModules.fiscal !== false),
          etats_financiers: planModules.etats_financiers && (userModules.etats_financiers !== false),
          employe_portal: planModules.employe_portal && (userModules.employe_portal !== false),
        })
      } catch {
        // Keep defaults if fetch fails
      }
    }
    loadModules()
  }, [profile])

  const toggle = (s: string) =>
    setCollapsed(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s])

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/")

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  // For client_assistant: override to show ONLY Espace Assistant + Mon Profil
  const isAssistant = profile?.role === "client_assistant"

  const visibleMenu = isAssistant
    ? [
        {
          section: "Mon Espace",
          items: [
            { href: "/client/assistant", label: "Espace Assistant", icon: Upload },
          ],
        },
        {
          section: "Mon Compte",
          items: [
            { href: "/client/profil", label: "Mon Profil", icon: Settings },
          ],
        },
      ]
    : MENU.filter(section => {
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
            <p className="text-white/40 text-xs">{t('sidebar.client_space', locale)}</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {visibleMenu.map(({ section, sectionKey, items }) => {
          const sectionLabel = sectionKey ? t(sectionKey, locale) : section
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
                <span>{sectionLabel}</span>
                {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {!isCollapsed && (
                <div className="space-y-0.5 ml-1">
                  {items.map(item => {
                    const Icon = item.icon
                    const active = isActive(item.href)
                    const itemLabel = item.labelKey ? t(item.labelKey, locale) : item.label
                    return (
                      <Link key={item.href + item.label} href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                          active ? "bg-[#C9A84C] text-[#1E2A4A] font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white"
                        )}>
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{itemLabel}</span>
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
      <div className="p-3 border-t border-white/10 flex-shrink-0 space-y-2">
        <div className="flex justify-center">
          <LanguageSwitcher />
        </div>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-white/50 hover:bg-red-500/20 hover:text-red-400 text-sm transition-colors">
          <LogOut className="w-4 h-4" /><span>{t('common.logout', locale)}</span>
        </button>
      </div>
    </aside>
    </>
  )
}
