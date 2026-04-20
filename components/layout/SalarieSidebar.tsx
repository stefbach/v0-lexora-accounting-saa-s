"use client"
import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
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
  const [badges, setBadges] = useState<{ contrats_a_signer: number; bulletins_non_lus: number }>({
    contrats_a_signer: 0, bulletins_non_lus: 0,
  })

  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Keep the "active link" highlight in sync with the current hash — the
  // employee page toggles its internal tab state on hashchange.
  useEffect(() => {
    const sync = () => setActiveHash(window.location.hash || "#dashboard")
    sync()
    window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [])

  // Sprint-salarie V3.5 — poll notification counts (contracts to sign,
  // unread pay slips) to show small badges next to the relevant menu
  // items. Lightweight: single call, refreshed every 60s.
  useEffect(() => {
    let cancelled = false
    const fetchBadges = async () => {
      try {
        const res = await fetch("/api/salarie/notifications")
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setBadges({
          contrats_a_signer: Number(data.contrats_a_signer) || 0,
          bulletins_non_lus: Number(data.bulletins_non_lus) || 0,
        })
      } catch {}
    }
    fetchBadges()
    const t = setInterval(fetchBadges, 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  return (
    <>
      {/* Mobile trigger — glassmorphic pill */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Ouvrir le menu"
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

      <aside data-lenis-prevent
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
          aria-label="Fermer le menu"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Brand — with live pulse dot */}
        <div
          className="p-5 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(232,234,252,0.06)" }}
        >
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
            className="mt-2 inline-block text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ color: "#A8AFC7" }}
          >
            Espace Salarié
          </span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ hash, label, icon: Icon }) => {
            const active = activeHash === hash
            return (
              <a
                key={hash}
                href={`/salarie${hash}`}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                  e.preventDefault()
                  router.push(`/salarie${hash}`)
                  setActiveHash(hash)
                }}
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
                <Icon className="w-4 h-4 flex-shrink-0 relative" style={{ color: active ? "#0B0F2E" : undefined }} />
                <span className="relative flex-1">{label}</span>
                {hash === "#contrats" && badges.contrats_a_signer > 0 && (
                  <span
                    aria-label={`${badges.contrats_a_signer} contrat(s) à signer`}
                    className="relative inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold leading-none"
                    style={{
                      backgroundColor: active ? "#0B0F2E" : "#D4AF37",
                      color: active ? "#D4AF37" : "#0B0F2E",
                    }}
                  >
                    {badges.contrats_a_signer}
                  </span>
                )}
                {hash === "#bulletins" && badges.bulletins_non_lus > 0 && (
                  <span
                    aria-label={`${badges.bulletins_non_lus} bulletin(s) non lu(s)`}
                    className="relative inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold leading-none"
                    style={{
                      backgroundColor: active ? "#0B0F2E" : "#4191FF",
                      color: "#FFFFFF",
                    }}
                  >
                    {badges.bulletins_non_lus}
                  </span>
                )}
              </a>
            )
          })}
        </nav>

        <div
          className="px-3 py-4 flex-shrink-0 space-y-2"
          style={{ borderTop: "1px solid rgba(232,234,252,0.06)" }}
        >
          <div className="flex justify-center">
            <LanguageSwitcher />
          </div>
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
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>
    </>
  )
}
