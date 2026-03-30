"use client"
import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { t, getLocale } from "@/lib/i18n"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { Clock, Users, Calendar, CreditCard, TrendingUp, FileText, Banknote, Settings, LogOut, Menu, X, Bot } from "lucide-react"

const LINKS = [
  { href: '/rh', label: 'Tableau de bord', labelKey: 'nav.dashboard', icon: Clock, exact: true },
  { href: '/rh/employes', label: 'Employés', labelKey: 'hr.employees', icon: Users },
  { href: '/rh/pointage', label: 'Pointage', labelKey: 'hr.time_clock', icon: Clock },
  { href: '/rh/conges', label: 'Absences & Congés', labelKey: 'rh.absences_leave', icon: Calendar },
  { href: '/rh/paie', label: 'Paie & Bulletins', labelKey: 'hr.payslips', icon: CreditCard },
  { href: '/rh/paie/primes', label: 'Primes & OT', labelKey: 'rh.bonuses_ot', icon: TrendingUp },
  { href: '/rh/paie/exports-mra', label: 'Exports MRA', labelKey: 'rh.exports_mra', icon: FileText },
  { href: '/rh/exports/virement', label: 'Virements bancaires', labelKey: 'rh.bank_transfers', icon: Banknote },
  { href: '/rh/chat', label: 'CLARA — Assistant IA', icon: Bot },
  { href: '/rh/paie/parametres', label: 'Paramètres paie', labelKey: 'rh.payroll_settings', icon: Settings },
]

export function RHSidebarDedicated() {
  const pathname = usePathname()
  const router = useRouter()
  const locale = getLocale()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close sidebar on navigation
  useEffect(() => { setMobileOpen(false) }, [pathname])

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <>
      {/* Mobile hamburger */}
      <button onClick={() => setMobileOpen(true)} className="fixed top-4 left-4 z-50 md:hidden bg-[#1E2A4A] text-white p-2 rounded-lg shadow-lg">
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && <div onClick={() => setMobileOpen(false)} className="fixed inset-0 bg-black/50 z-40 md:hidden" />}

    <aside className={`w-60 bg-[#1E2A4A] min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-50 overflow-y-auto transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
      {/* Mobile close button */}
      <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-4 md:hidden text-white/60 hover:text-white z-10">
        <X className="w-5 h-5" />
      </button>

      <div className="p-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#C9A84C] rounded-lg flex items-center justify-center">
            <span className="text-[#1E2A4A] font-black text-sm">L</span>
          </div>
          <div>
            <p className="text-white font-bold text-base leading-tight">LEXORA</p>
            <p className="text-white/40 text-xs">{t('rh.module_title', locale)}</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {LINKS.map(l => {
          const Icon = l.icon
          const active = isActive(l.href, l.exact)
          return (
            <Link key={l.href} href={l.href}
              className={cn("flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                active ? "bg-[#C9A84C] text-[#1E2A4A] font-semibold" : "text-white/70 hover:bg-white/10 hover:text-white"
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
