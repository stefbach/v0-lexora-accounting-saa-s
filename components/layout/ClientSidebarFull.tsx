"use client"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useProfile } from "@/hooks/use-profile"
import { useState, useEffect } from "react"
import { t, getLocale } from "@/lib/i18n"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import {
  LayoutDashboard, Building2, FileText, BookOpen, Banknote,
  Receipt, Calculator, BarChart3, Target,
  Users, Clock, CreditCard, Gavel, Scale, Bell,
  Settings, LogOut, ChevronDown, ChevronRight, FileSpreadsheet,
  Globe, Lightbulb, ClipboardList, Download, Upload, Calendar,
  CalendarDays, FilePlus2, SlidersHorizontal, Menu, X, FilePen, UserCircle
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
      { href: "/client/documents", label: "Documents & OCR", labelKey: "nav.documents", icon: FileText },
      { href: "/client/utilisateurs", label: "Mon Équipe", labelKey: "nav.team", icon: Users },
      { href: "/client/alertes", label: "Alertes", labelKey: "nav.alerts", icon: Bell },
      { href: "/client/assistant", label: "Espace Assistant", labelKey: "nav.assistant", icon: Upload, visibleForRoles: ["client_assistant"] } as any,
    ]
  },
  {
    section: "Facturation", sectionKey: "inv.invoicing",
    requiredModule: "facturation",
    items: [
      { href: "/client/factures", label: "Mes Factures", labelKey: "inv.my_invoices", icon: Receipt },
      { href: "/client/nouvelle-facture", label: "Nouvelle Facture", labelKey: "inv.new_invoice", icon: FilePlus2 },
      { href: "/comptable/contrats", label: "Contrats Clients", icon: FileText, visibleForRoles: ["client_admin", "direction"] } as any,
      { href: "/client/facturation-settings", label: "Paramètres Facturation", labelKey: "inv.settings", icon: SlidersHorizontal },
    ]
  },
  {
    section: "Comptabilité", sectionKey: "acc.accounting",
    requiredModule: "comptabilite",
    items: [
      { href: "/client/banque", label: "Banque", labelKey: "acc.bank", icon: Banknote },
      { href: "/client/rapprochement", label: "Rapprochement & Lettrage", labelKey: "acc.reconciliation", icon: CreditCard },
      { href: "/client/fournisseurs", label: "Fournisseurs", labelKey: "acc.suppliers", icon: FileSpreadsheet },
      { href: "/client/salaires-compta", label: "Salaires", icon: CreditCard },
      { href: "/client/compte-courant", label: "Comptes Courants Associés", labelKey: "acc.current_accounts", icon: Users },
    ]
  },
  {
    section: "États Financiers", sectionKey: "fin.financial_statements",
    requiredModule: "etats_financiers",
    items: [
      { href: "/client/bilan", label: "Bilan & P&L", labelKey: "fin.balance_sheet", icon: BookOpen },
      { href: "/client/grand-livre", label: "Grand Livre", labelKey: "fin.general_ledger", icon: BookOpen },
      { href: "/client/balance-agee", label: "Balance âgée", labelKey: "fin.aged_balance", icon: BookOpen },
      { href: "/client/echeances", label: "Échéances", labelKey: "fin.deadlines", icon: CalendarDays },
    ]
  },
  {
    section: "Fiscal MRA", sectionKey: "tax.fiscal_mra",
    requiredModule: "fiscal",
    items: [
      { href: "/client/tva", label: "TVA MRA", labelKey: "tax.vat", icon: Receipt },
      { href: "/client/annual-return", label: "Annual Return (ROC)", labelKey: "tax.annual_return", icon: ClipboardList },
      { href: "/client/it-form3", label: "IT Form 3 (MRA)", labelKey: "tax.it_form3", icon: FileText },
    ]
  },
  {
    section: "RH & Paie", sectionKey: "hr.hr_payroll",
    requiredModule: "rh",
    items: [
      { href: "/rh/employes", label: "Employés", icon: Users },
      { href: "/rh/juridique", label: "Contrats Travail", icon: FilePen, visibleForRoles: ["client_admin", "direction", "rh", "rh_manager"] } as any,
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
      { href: "/client/profil", label: "Mon Profil", labelKey: "account.my_profile", icon: Settings },
    ]
  },
]


export function ClientSidebarFull() {
  const pathname = usePathname()
  const router = useRouter()
  const { profile } = useProfile()
  const { societe, societes, societeId, clearSociete } = useSocieteActive()
  const locale = getLocale()
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [activeModules, setActiveModules] = useState<ActiveModules>(DEFAULT_MODULES)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close sidebar on navigation
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Re-compute active modules from the ACTIVE société (not societes[0])
  // intersected with the per-user permissions.
  useEffect(() => {
    // Step 1: société plan modules (what the active company's plan allows)
    let planModules: ActiveModules = { ...DEFAULT_MODULES }
    if (societe?.modules_actifs) {
      const m = societe.modules_actifs
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
  }, [profile, societe, societeId])

  const handleChangeSociete = () => {
    clearSociete()
    router.push("/client/select-societe")
  }

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
      ]
    : MENU.filter(section => {
        if (!section.requiredModule) return true
        return activeModules[section.requiredModule]
      })

  return (
    <>
      {/* Mobile hamburger — glassmorphic pill with gold dot indicator */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Ouvrir la navigation"
        className="fixed top-4 left-4 z-50 md:hidden inline-flex items-center gap-2 rounded-full px-3 py-2 text-white shadow-lg backdrop-blur"
        style={{
          backgroundColor: "rgba(16,24,71,0.85)",
          border: "1px solid rgba(212,175,55,0.35)",
          boxShadow: "0 8px 20px -8px rgba(0,0,0,0.5)",
        }}
      >
        <Menu className="w-4 h-4" />
        <span
          aria-hidden="true"
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: "#D4AF37", boxShadow: "0 0 8px #D4AF37" }}
        />
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
        />
      )}

      <aside data-lenis-prevent
        className={`w-64 min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-50 overflow-y-auto transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
        style={{
          // Multi-layer: base navy + subtle radial glows at top and bottom
          // for a "neural" feel without hurting readability of the menu.
          background:
            "radial-gradient(ellipse 140% 50% at 50% 0%, rgba(65,145,255,0.10) 0%, transparent 70%), radial-gradient(ellipse 140% 40% at 50% 100%, rgba(212,175,55,0.08) 0%, transparent 70%), #0B0F2E",
          borderRight: "1px solid rgba(212,175,55,0.12)",
          boxShadow: "inset -1px 0 0 rgba(232,234,252,0.03)",
          fontFamily: "'Poppins', sans-serif",
        }}
      >
        {/* Mobile close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 md:hidden text-white/60 hover:text-white z-10"
          aria-label="Fermer la navigation"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Logo block — with live status dot */}
        <div
          className="p-5 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(232,234,252,0.06)" }}
        >
          <Link href="/client/tableau-de-bord" className="flex items-center gap-3">
            <div className="flex flex-col">
              <div className="flex items-baseline">
                <span className="text-lg font-bold" style={{ color: "#E8EAFC", letterSpacing: "0.04em" }}>LE</span>
                <span className="text-lg font-bold" style={{ color: "#D4AF37", letterSpacing: "0.04em" }}>X</span>
                <span className="text-lg font-bold" style={{ color: "#E8EAFC", letterSpacing: "0.04em" }}>ORA</span>
                <span className="ml-2 relative flex h-2 w-2" aria-hidden="true">
                  <span
                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                    style={{ backgroundColor: "#2ECC8A" }}
                  />
                  <span
                    className="relative inline-flex h-2 w-2 rounded-full"
                    style={{ backgroundColor: "#2ECC8A", boxShadow: "0 0 6px #2ECC8A" }}
                  />
                </span>
              </div>
              <div
                className="mt-1 h-[2px] w-12 rounded-full"
                aria-hidden="true"
                style={{
                  background: "linear-gradient(90deg, #D4AF37 0%, transparent 100%)",
                }}
              />
              <span
                className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em]"
                style={{ color: "#A8AFC7" }}
              >
                {t('sidebar.client_space', locale)}
              </span>
            </div>
          </Link>
        </div>

        {/* Société active — bloc info + bouton "Changer" si ≥ 2 sociétés */}
        {societe && (
          <div
            className="mx-3 mt-3 p-3 rounded-xl flex-shrink-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(212,175,55,0.08) 0%, rgba(212,175,55,0.02) 100%)",
              border: "1px solid rgba(212,175,55,0.25)",
            }}
          >
            <div
              className="text-[9px] font-bold uppercase mb-1"
              style={{ color: "#D4AF37", letterSpacing: "0.18em" }}
            >
              Société active
            </div>
            <div
              className="text-sm font-semibold truncate"
              style={{ color: "#E8EAFC" }}
              title={societe.nom}
            >
              {societe.nom}
            </div>
            {societe.brn && (
              <div
                className="text-[10px] mt-0.5 font-mono truncate"
                style={{ color: "#A8AFC7" }}
              >
                BRN {societe.brn}
              </div>
            )}
            {societes.length > 1 && (
              <button
                type="button"
                onClick={handleChangeSociete}
                className="mt-2 w-full text-[11px] font-semibold py-1.5 px-2 rounded-md transition-colors"
                style={{
                  color: "#0B0F2E",
                  background: "linear-gradient(135deg, #D4AF37 0%, #E4C547 100%)",
                  boxShadow: "0 6px 14px -6px rgba(212,175,55,0.55)",
                }}
              >
                Changer de société →
              </button>
            )}
          </div>
        )}

        {/* Mode "aucune société active": on cache le menu et on invite à
            en sélectionner une. Affiché notamment sur /client/select-societe. */}
        {!societeId ? (
          <div className="flex-1 flex items-center justify-center px-6 py-10">
            <div className="text-center">
              <div
                aria-hidden="true"
                className="mx-auto mb-3 inline-flex items-center justify-center w-10 h-10 rounded-full"
                style={{
                  background: "rgba(232,234,252,0.04)",
                  border: "1px solid rgba(232,234,252,0.08)",
                  color: "#6B7390",
                }}
              >
                <Building2 className="w-5 h-5" />
              </div>
              <p
                className="text-[11px] leading-relaxed"
                style={{ color: "#6B7390" }}
              >
                Sélectionnez une société pour accéder à l&apos;espace
              </p>
            </div>
          </div>
        ) : (
          /* Navigation */
          <nav className="flex-1 px-3 py-4 space-y-3">
            {visibleMenu.map(({ section, sectionKey, items }) => {
              const sectionLabel = sectionKey ? t(sectionKey, locale) : section
              const isCollapsed = collapsed.includes(section)
              const hasActive = items.some(i => isActive(i.href))
              return (
                <div key={section}>
                  <button
                    onClick={() => toggle(section)}
                    aria-expanded={!isCollapsed}
                    className="group w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-bold uppercase rounded-md transition-colors"
                    style={{
                      color: hasActive ? "#D4AF37" : "#6B7390",
                      letterSpacing: "0.18em",
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-1 w-1 rounded-full transition-colors"
                        style={{
                          backgroundColor: hasActive ? "#D4AF37" : "rgba(212,175,55,0.28)",
                          boxShadow: hasActive ? "0 0 4px #D4AF37" : "none",
                        }}
                      />
                      {sectionLabel}
                    </span>
                    {isCollapsed ? (
                      <ChevronRight className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                  {!isCollapsed && (
                    <div className="mt-1 space-y-0.5">
                      {items.map(item => {
                        const vRoles = (item as any).visibleForRoles
                        if (vRoles && (!profile?.role || !vRoles.includes(profile.role))) return null
                      const Icon = item.icon
                      const active = isActive(item.href)
                      const itemLabel = item.labelKey ? t(item.labelKey, locale) : item.label
                      return (
                        <Link
                          key={item.href + item.label}
                          href={item.href}
                          className={cn(
                            "group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200",
                            active
                              ? "text-[#0B0F2E] font-semibold"
                              : "text-white/70 hover:text-white"
                          )}
                          style={
                            active
                              ? {
                                  background:
                                    "linear-gradient(135deg, #D4AF37 0%, #E4C547 100%)",
                                  boxShadow:
                                    "0 8px 24px -8px rgba(212,175,55,0.55), inset 0 1px 0 rgba(255,255,255,0.4)",
                                }
                              : undefined
                          }
                        >
                          {/* Inactive hover pill */}
                          {!active && (
                            <span
                              aria-hidden="true"
                              className="absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                              style={{
                                background:
                                  "linear-gradient(135deg, rgba(65,145,255,0.14) 0%, rgba(232,234,252,0.06) 100%)",
                              }}
                            />
                          )}
                          {/* Active left accent bar */}
                          {active && (
                            <span
                              aria-hidden="true"
                              className="absolute -left-1 top-1/2 -translate-y-1/2 h-5 w-1 rounded-full"
                              style={{
                                backgroundColor: "#0B0F2E",
                                boxShadow: "0 0 8px rgba(11,15,46,0.6)",
                              }}
                            />
                          )}
                          <Icon
                            className="w-4 h-4 flex-shrink-0 relative"
                            style={{
                              color: active ? "#0B0F2E" : undefined,
                            }}
                          />
                          <span className="truncate relative">{itemLabel}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
          </nav>
        )}

        {/* Entrée statique "Mon espace" — accès direct au portail salarié.
            Remplace MonEspaceSalarieLink dynamique par un lien toujours
            visible (cohérent avec RHSidebarDedicated). */}
        <div className="px-3 pt-3 mt-1 border-t flex-shrink-0" style={{ borderColor: "rgba(232,234,252,0.06)" }}>
          <Link
            href="/salarie"
            className={cn(
              "group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200",
              pathname?.startsWith("/salarie") ? "text-[#0B0F2E] font-semibold" : "text-white/70 hover:text-white",
            )}
            style={
              pathname?.startsWith("/salarie")
                ? {
                    background: "linear-gradient(135deg, #D4AF37 0%, #E4C547 100%)",
                    boxShadow: "0 8px 24px -8px rgba(212,175,55,0.55), inset 0 1px 0 rgba(255,255,255,0.4)",
                  }
                : undefined
            }
          >
            {!pathname?.startsWith("/salarie") && (
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-xl opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                style={{
                  background: "linear-gradient(135deg, rgba(65,145,255,0.14) 0%, rgba(232,234,252,0.06) 100%)",
                }}
              />
            )}
            <UserCircle className="w-4 h-4 flex-shrink-0 relative" style={{ color: pathname?.startsWith("/salarie") ? "#0B0F2E" : undefined }} />
            <span className="truncate relative">Mon espace</span>
          </Link>
        </div>

        {/* Footer — language + logout with refined hover */}
        <div
          className="px-3 py-4 flex-shrink-0 space-y-3"
          style={{ borderTop: "1px solid rgba(232,234,252,0.06)" }}
        >
          <div className="flex justify-center">
            <LanguageSwitcher />
          </div>
          <button
            onClick={handleLogout}
            className="group w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all"
            style={{
              color: "#A8AFC7",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.14)"
              e.currentTarget.style.color = "#FCA5A5"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent"
              e.currentTarget.style.color = "#A8AFC7"
            }}
          >
            <LogOut className="w-4 h-4" />
            <span>{t('common.logout', locale)}</span>
          </button>
        </div>
      </aside>
    </>
  )
}
