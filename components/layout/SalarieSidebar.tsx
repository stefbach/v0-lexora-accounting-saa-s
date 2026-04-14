"use client"
import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { LanguageSwitcher } from "@/components/LanguageSwitcher"
import { LayoutDashboard, CalendarDays, CreditCard, Calendar, TrendingUp, User, LogOut, Menu, X, HeartPulse, FolderOpen, Navigation, FileText, Clock } from "lucide-react"

/**
 * Dedicated sidebar for the Espace Salarié (employee self-service portal).
 *
 * - Visible only on /salarie (see app/salarie/layout.tsx).
 * - Does NOT reuse the RH sidebar — the employee should never see "Employés",
 *   "Paie & Bulletins", "Rapprochement" etc. Only the tabs relevant to her.
 * - Links use hash anchors (#dashboard, #conges, …). The monolithic page
 *   reads window.location.hash on mount to preselect the right tab.
 */
const NAV = [
  { hash: "#dashboard", label: "Pointage", icon: Clock },
  { hash: "#conges",    label: "Mes congés", icon: CalendarDays },
  { hash: "#bulletins", label: "Mes bulletins", icon: CreditCard },
  { hash: "#planning",  label: "Mon planning", icon: Calendar },
  { hash: "#primes",    label: "Mes primes", icon: TrendingUp },
  { hash: "#contrats",  label: "Mes contrats", icon: FileText },
  { hash: "#documents", label: "Mes documents", icon: FolderOpen },
  { hash: "#trajets",   label: "Mes trajets km", icon: Navigation },
  { hash: "#sante",     label: "Ma santé (TIBOK)", icon: HeartPulse },
  { hash: "#profil",    label: "Ma fiche", icon: User },
]

export function SalarieSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeHash, setActiveHash] = useState<string>("#dashboard")

  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Keep the "active link" highlight in sync with the current hash — the
  // employee page toggles its internal tab state on hashchange.
  useEffect(() => {
    const sync = () => setActiveHash(window.location.hash || "#dashboard")
    sync()
    window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 md:hidden bg-[#0B0F2E] text-white p-2 rounded-lg shadow-lg"
        aria-label="Ouvrir le menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
        />
      )}

      <aside
        className={`w-60 bg-[#0B0F2E] min-h-screen flex flex-col fixed left-0 top-0 bottom-0 z-50 overflow-y-auto transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 md:hidden text-white/60 hover:text-white z-10"
          aria-label="Fermer le menu"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Brand */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-baseline">
            <span className="text-base font-bold" style={{ color: "#E8EAFC", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}>LE</span>
            <span className="text-base font-bold" style={{ color: "#D4AF37", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}>X</span>
            <span className="text-base font-bold" style={{ color: "#E8EAFC", letterSpacing: "0.04em", fontFamily: "'Poppins', sans-serif" }}>ORA</span>
          </div>
          <span className="text-[10px] font-light tracking-wider" style={{ color: "#4A5490" }}>
            Espace Salarié
          </span>
        </div>

        {/* Navigation — hash-based anchors handled by the page's internal tab state */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ hash, label, icon: Icon }) => {
            const active = activeHash === hash
            return (
              <Link
                key={hash}
                href={`/salarie${hash}`}
                onClick={() => setActiveHash(hash)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-[#D4AF37] text-[#0B0F2E] font-semibold"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-white/10 space-y-2">
          <div className="flex justify-center">
            <LanguageSwitcher />
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-white/50 hover:bg-red-500/20 hover:text-red-400 text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>
    </>
  )
}
