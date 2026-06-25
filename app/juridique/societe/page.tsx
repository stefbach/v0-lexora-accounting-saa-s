"use client"
import Link from "next/link"
import { Landmark, Gavel, BookUser, CalendarClock, ArrowRight, Users2, FileText } from "lucide-react"
import { JuridiqueHeader } from "@/components/juridique/JuridiqueHeader"
import { SocieteSelector } from "@/components/juridique/JuridiqueSocieteProvider"
import { t, getLocale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

export default function VieSocietePage() {
  const locale = getLocale()
  const SECTIONS = [
    {
      href: "/juridique/societe/assemblees",
      icon: Landmark,
      title: t('jurs.home.assemblees.title', locale),
      desc: t('jurs.home.assemblees.desc', locale),
      tag: t('jurs.home.tag.available', locale),
      active: true,
    },
    {
      href: "/juridique/societe/actes",
      icon: FileText,
      title: t('jurs.home.actes.title', locale),
      desc: t('jurs.home.actes.desc', locale),
      tag: t('jurs.home.tag.available', locale),
      active: true,
    },
    {
      href: "/juridique/societe/resolutions",
      icon: Gavel,
      title: t('jurs.home.resolutions.title', locale),
      desc: t('jurs.home.resolutions.desc', locale),
      tag: t('jurs.home.tag.available', locale),
      active: true,
    },
    {
      href: "/juridique/societe/registres",
      icon: BookUser,
      title: t('jurs.home.registres.title', locale),
      desc: t('jurs.home.registres.desc', locale),
      tag: t('jurs.home.tag.available', locale),
      active: true,
    },
    {
      href: "/juridique/societe/obligations",
      icon: CalendarClock,
      title: t('jurs.home.obligations.title', locale),
      desc: t('jurs.home.obligations.desc', locale),
      tag: t('jurs.home.tag.available', locale),
      active: true,
    },
  ]
  return (
    <div className="space-y-6">
      <JuridiqueHeader
        icon={<Landmark className="w-6 h-6" style={{ color: GOLD }} />}
        title={t('jurs.home.title', locale)}
        subtitle={t('jurs.home.subtitle', locale)}
      />

      <div className="flex justify-end"><SocieteSelector /></div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SECTIONS.map((s) => {
          const Icon = s.icon
          const inner = (
            <div className={`h-full rounded-2xl bg-white border border-gray-100 p-5 shadow-sm transition-all ${s.active ? "hover:shadow-md hover:border-[#D4AF37]/40 hover:-translate-y-0.5" : "opacity-70"}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="rounded-xl p-2.5" style={{ background: "rgba(11,15,46,0.06)" }}>
                  <Icon className="w-5 h-5" style={{ color: NAVY }} />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full" style={s.active ? { background: "rgba(212,175,55,0.16)", color: "#8a6d15" } : { background: "#F3F4F6", color: "#9CA3AF" }}>{s.tag}</span>
              </div>
              <p className="font-bold text-[15px]" style={{ color: NAVY }}>{s.title}</p>
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{s.desc}</p>
              {s.active && (
                <div className="mt-3 flex items-center gap-1 text-xs font-semibold" style={{ color: GOLD }}>
                  {t('jurs.home.open', locale)} <ArrowRight className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          )
          return s.active ? <Link key={s.title} href={s.href} className="group">{inner}</Link> : <div key={s.title}>{inner}</div>
        })}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm flex items-start gap-3">
        <Users2 className="w-5 h-5 mt-0.5" style={{ color: GOLD }} />
        <div>
          <p className="font-bold text-sm" style={{ color: NAVY }}>{t('jurs.home.dataCard.title', locale)}</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            {t('jurs.home.dataCard.desc', locale)}
          </p>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 text-center flex items-center justify-center gap-1.5">
        <FileText className="w-3 h-3" /> {t('jurs.home.disclaimer', locale)}
      </p>
    </div>
  )
}
