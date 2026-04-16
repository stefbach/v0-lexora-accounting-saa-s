"use client"
import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { t, getLocale } from "@/lib/i18n"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import MonEspaceSalarieLink from "@/components/rh/MonEspaceSalarieLink"
import {
  Clock, Users, Calendar, CreditCard, TrendingUp, Banknote,
  Settings, LogOut, ArrowLeft, Menu, X, CalendarDays, Car, Bot, CheckCircle, Upload, UserMinus, Megaphone, MapPin, Route, Shield, FilePen
} from "lucide-react"

interface NavLink {
  href: string
  label: string
  labelKey?: string
  icon: any
  exact?: boolean
  roles?: string[] // if set, only show for these roles. If not set, show for all.
}

const ALL_LINKS: NavLink[] = [
  { href: '/rh', label: 'Tableau de bord', labelKey: 'nav.dashboard', icon: Clock, exact: true, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin', 'comptable', 'comptable_dedie'] },
  { href: '/rh/manager', label: 'Mon équipe', icon: Users, exact: true, roles: ['manager'] },
  { href: '/rh/employes', label: 'Employés', labelKey: 'hr.employees', icon: Users, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin'] },
  { href: '/rh/juridique', label: 'Contrats Travail', icon: FilePen, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin', 'direction'] },
  { href: '/rh/groupes', label: 'Groupes / Équipes', icon: Users, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin'] },
  { href: '/rh/depart', label: 'Gestion départs', icon: UserMinus, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin'] },
  { href: '/rh/planning', label: 'Planning', icon: CalendarDays, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin', 'manager'] },
  // Sprint 5 FIX 7 — lien "Regles planning" supprimé du menu : la page
  // /rh/planning a déjà un bouton "Règles" intégré, le lien sidebar était
  // redondant et créait de la confusion. La route reste accessible via
  // le bouton interne de /rh/planning et par URL directe.
  { href: '/rh/geolocalisation', label: 'Carte collaborateurs', icon: MapPin, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin', 'manager'] },
  { href: '/rh/pointage', label: 'Pointage', labelKey: 'hr.time_clock', icon: Clock },
  { href: '/rh/conges', label: 'Absences & Congés', labelKey: 'rh.absences_leave', icon: Calendar },
  { href: '/rh/conges/parametres', label: 'Règles congés', icon: Settings, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin'] },
  { href: '/rh/jours-feries', label: 'Jours fériés', icon: Calendar, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin'] },
  { href: '/rh/paie', label: 'Paie & Bulletins', labelKey: 'hr.payslips', icon: CreditCard, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin', 'comptable', 'comptable_dedie'] },
  { href: '/rh/paie/validation', label: 'Contrôle pré-paie', icon: CheckCircle, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin'] },
  { href: '/rh/paie/primes', label: 'Primes & OT', labelKey: 'rh.bonuses_ot', icon: TrendingUp },
  { href: '/rh/frais-km', label: 'Frais kilométriques', icon: Car },
  { href: '/rh/trajets-km', label: 'Trajets GPS / IK', icon: Route, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin'] },
  { href: '/rh/exports/paie', label: 'Exports Paie & MRA', icon: Banknote, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin', 'comptable', 'comptable_dedie'] },
  { href: '/rh/import-paie', label: 'Import Paie Excel', icon: Upload, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin'] },
  { href: '/rh/historique-paie', label: 'Historique Paie', icon: Calendar, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin', 'comptable', 'comptable_dedie'] },
  { href: '/rh/annonces', label: 'Annonces', icon: Megaphone, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin'] },
  { href: '/rh/chat', label: 'CLARA — Assistant IA', icon: Bot },
  // Sprint 2 — hub central de paramètres en plus des sous-pages spécifiques.
  { href: '/rh/parametres', label: 'Paramètres (hub)', icon: Settings, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin'] },
  { href: '/rh/societe', label: 'Paramètres société', icon: Settings, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin'] },
  { href: '/rh/paie/parametres', label: 'Paramètres paie', labelKey: 'rh.payroll_settings', icon: Settings, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin'] },
]

export function RHSidebarDedicated() {
  const pathname = usePathname()
  const router = useRouter()
  const locale = getLocale()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userRole, setUserRole] = useState<string>('')

  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Fetch user role
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('role').eq('id', user.id).single().then(({ data }) => {
        if (data?.role) setUserRole(data.role)
      })
    })
  }, [])

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  // Filter links by role
  const visibleLinks = ALL_LINKS.filter(l => {
    if (!l.roles) return true
    if (!userRole) return true // show all while loading
    return l.roles.includes(userRole)
  })

  const isManager = userRole === 'manager'
  const subtitle = isManager ? 'Espace Manager' : t('rh.module_title', locale)

  return (
    <>
      {/* Mobile trigger */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Ouvrir la navigation RH"
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

      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
        />
      )}

      <aside
        className={`w-60 min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-50 overflow-y-auto transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
        style={{
          background:
            "radial-gradient(ellipse 140% 50% at 50% 0%, rgba(65,145,255,0.10) 0%, transparent 70%), radial-gradient(ellipse 140% 40% at 50% 100%, rgba(212,175,55,0.08) 0%, transparent 70%), #0B0F2E",
          borderRight: "1px solid rgba(212,175,55,0.12)",
          fontFamily: "'Poppins', sans-serif",
        }}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 md:hidden text-white/60 hover:text-white z-10"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Logo block with live dot */}
        <div
          className="p-5 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(232,234,252,0.06)" }}
        >
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
              style={{ background: "linear-gradient(90deg, #D4AF37 0%, transparent 100%)" }}
            />
            <span
              className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em]"
              style={{ color: "#A8AFC7" }}
            >
              {subtitle}
            </span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {/* Back to client space */}
          {['client_admin', 'client_user', 'comptable', 'comptable_dedie', 'admin', 'super_admin'].includes(userRole) && (
            <>
              <Link
                href="/client/tableau-de-bord"
                className="group relative flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-colors mb-3"
                style={{
                  color: "#D4AF37",
                  border: "1px solid rgba(212,175,55,0.30)",
                  background:
                    "linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(212,175,55,0.02) 100%)",
                }}
              >
                <ArrowLeft className="w-4 h-4 flex-shrink-0" />
                <span>Retour espace client</span>
              </Link>
            </>
          )}

          {visibleLinks.map(l => {
            const Icon = l.icon
            const active = isActive(l.href, l.exact)
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200",
                  active ? "text-[#0B0F2E] font-semibold" : "text-white/70 hover:text-white"
                )}
                style={
                  active
                    ? {
                        background: "linear-gradient(135deg, #D4AF37 0%, #E4C547 100%)",
                        boxShadow:
                          "0 8px 24px -8px rgba(212,175,55,0.55), inset 0 1px 0 rgba(255,255,255,0.4)",
                      }
                    : undefined
                }
              >
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
                  style={{ color: active ? "#0B0F2E" : undefined }}
                />
                <span className="truncate relative">{l.labelKey ? t(l.labelKey, locale) : l.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* TÂCHE 8 — lien vers /salarie si l'user RH a une fiche employé liée.
            Le composant détecte tout seul ; rend null sinon. */}
        <MonEspaceSalarieLink compact />

        <div
          className="px-3 py-4 flex-shrink-0 space-y-1"
          style={{ borderTop: "1px solid rgba(232,234,252,0.06)" }}
        >
          <div className="flex justify-center mb-2">
            <LanguageSwitcher />
          </div>
          <Link
            href="/profil"
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-white/60 hover:text-white text-sm transition-all"
            style={{ backgroundColor: "transparent" }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(232,234,252,0.06)" }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent" }}
          >
            <Settings className="w-4 h-4" />
            <span>{t('account.my_profile', locale)}</span>
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all"
            style={{ color: "#A8AFC7" }}
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
