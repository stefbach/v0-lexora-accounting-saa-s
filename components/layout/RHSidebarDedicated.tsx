"use client"
import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { t, getLocale } from "@/lib/i18n"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import {
  Clock, Users, Calendar, CreditCard, TrendingUp, Banknote,
  Settings, LogOut, ArrowLeft, Menu, X, CalendarDays, Car, Bot, CheckCircle, Upload, UserMinus, Megaphone, MapPin, Route, Shield
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
  { href: '/rh/groupes', label: 'Groupes / Équipes', icon: Users, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin'] },
  { href: '/rh/depart', label: 'Gestion départs', icon: UserMinus, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin'] },
  { href: '/rh/planning', label: 'Planning', icon: CalendarDays },
  { href: '/rh/planning/regles', label: 'Regles planning', icon: Shield, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin'] },
  { href: '/rh/geolocalisation', label: 'Carte collaborateurs', icon: MapPin, roles: ['admin', 'super_admin', 'rh', 'rh_manager', 'client_admin'] },
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
      <button onClick={() => setMobileOpen(true)} className="fixed top-4 left-4 z-50 md:hidden bg-[#0B0F2E] text-white p-2 rounded-lg shadow-lg">
        <Menu className="w-5 h-5" />
      </button>

      {mobileOpen && <div onClick={() => setMobileOpen(false)} className="fixed inset-0 bg-black/50 z-40 md:hidden" />}

    <aside className={`w-60 bg-[#0B0F2E] min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-50 overflow-y-auto transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
      <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-4 md:hidden text-white/60 hover:text-white z-10">
        <X className="w-5 h-5" />
      </button>

      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="flex flex-col">
            <div className="flex items-baseline">
              <span className="text-base font-bold" style={{ color: "#E8EAFC", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}>LE</span>
              <span className="text-base font-bold" style={{ color: "#D4AF37", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}>X</span>
              <span className="text-base font-bold" style={{ color: "#E8EAFC", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}>ORA</span>
            </div>
            <span className="text-[10px] font-light tracking-wider" style={{ color: "#4A5490" }}>{subtitle}</span>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {/* Retour espace client — visible pour client_admin, client_user, comptable */}
        {['client_admin', 'client_user', 'comptable', 'comptable_dedie', 'admin', 'super_admin'].includes(userRole) && (
          <>
            <Link href="/client/tableau-de-bord"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[#D4AF37] hover:bg-[#D4AF37]/20 text-sm transition-colors mb-2 border border-[#D4AF37]/30">
              <ArrowLeft className="w-4 h-4 flex-shrink-0" />
              <span>Retour espace client</span>
            </Link>
            <div className="border-b border-white/10 mb-2" />
          </>
        )}
        {visibleLinks.map(l => {
          const Icon = l.icon
          const active = isActive(l.href, l.exact)
          return (
            <Link key={l.href} href={l.href}
              className={cn("flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                active ? "bg-[#D4AF37] text-[#0B0F2E] font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white"
              )}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{l.labelKey ? t(l.labelKey, locale) : l.label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="p-3 border-t border-white/10 space-y-1">
        <div className="flex justify-center mb-2">
          <LanguageSwitcher />
        </div>
        <Link href="/profil" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-white/50 hover:bg-white/10 hover:text-white text-sm transition-colors">
          <Settings className="w-4 h-4" /><span>{t('account.my_profile', locale)}</span>
        </Link>
        <button onClick={handleLogout} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-white/50 hover:bg-red-500/20 hover:text-red-400 text-sm transition-colors">
          <LogOut className="w-4 h-4" /><span>{t('common.logout', locale)}</span>
        </button>
      </div>
    </aside>
    </>
  )
}
