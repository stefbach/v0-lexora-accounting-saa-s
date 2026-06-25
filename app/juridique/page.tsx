"use client"
import Link from "next/link"
import { Scale, Gavel, FileSignature, FolderOpen, ShieldCheck, MessageSquareText, ArrowRight, BookOpen, Users, FolderKanban, Landmark } from "lucide-react"
import { JuridiqueHeader } from "@/components/juridique/JuridiqueHeader"
import { RagAdminPanel } from "@/components/juridique/RagAdminPanel"
import { RagStats } from "@/components/juridique/RagStats"
import { t, getLocale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

export default function JuridiqueDashboard() {
  const locale = getLocale()
  const MODULES = [
    {
      href: "/juridique/dossiers",
      icon: FolderKanban,
      title: t("jurd.mod.dossiers.title", locale),
      desc: t("jurd.mod.dossiers.desc", locale),
      tag: t("jurd.mod.dossiers.tag", locale),
    },
    {
      href: "/juridique/societe",
      icon: Landmark,
      title: t("jurd.mod.societe.title", locale),
      desc: t("jurd.mod.societe.desc", locale),
      tag: t("jurd.mod.societe.tag", locale),
    },
    {
      href: "/juridique/conseil",
      icon: MessageSquareText,
      title: t("jurd.mod.conseil.title", locale),
      desc: t("jurd.mod.conseil.desc", locale),
      tag: t("jurd.mod.conseil.tag", locale),
    },
    {
      href: "/juridique/conseil-rh",
      icon: Users,
      title: t("jurd.mod.conseilrh.title", locale),
      desc: t("jurd.mod.conseilrh.desc", locale),
      tag: t("jurd.mod.conseilrh.tag", locale),
    },
    {
      href: "/juridique/contentieux",
      icon: Gavel,
      title: t("jurd.mod.contentieux.title", locale),
      desc: t("jurd.mod.contentieux.desc", locale),
      tag: t("jurd.mod.contentieux.tag", locale),
    },
    {
      href: "/juridique/contrats",
      icon: FileSignature,
      title: t("jurd.mod.contrats.title", locale),
      desc: t("jurd.mod.contrats.desc", locale),
      tag: t("jurd.mod.contrats.tag", locale),
    },
    {
      href: "/juridique/documents",
      icon: FolderOpen,
      title: t("jurd.mod.documents.title", locale),
      desc: t("jurd.mod.documents.desc", locale),
      tag: t("jurd.mod.documents.tag", locale),
    },
    {
      href: "/juridique/conformite",
      icon: ShieldCheck,
      title: t("jurd.mod.conformite.title", locale),
      desc: t("jurd.mod.conformite.desc", locale),
      tag: t("jurd.mod.conformite.tag", locale),
    },
  ]
  return (
    <div className="space-y-6">
      <JuridiqueHeader
        icon={<Scale className="w-6 h-6" style={{ color: GOLD }} />}
        title={t("jurd.dash.title", locale)}
        subtitle={t("jurd.dash.subtitle", locale)}
      />

      {/* Base de connaissances réelle (corpus RAG live) */}
      <RagStats />

      {/* Modules */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {MODULES.map((m) => {
          const Icon = m.icon
          return (
            <Link key={m.href} href={m.href} className="group">
              <div className="h-full rounded-2xl bg-white border border-gray-100 p-5 shadow-sm transition-all hover:shadow-md hover:border-[#D4AF37]/40 hover:-translate-y-0.5">
                <div className="flex items-center justify-between mb-3">
                  <div className="rounded-xl p-2.5" style={{ background: "rgba(11,15,46,0.06)" }}>
                    <Icon className="w-5 h-5" style={{ color: NAVY }} />
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full" style={{ background: "rgba(212,175,55,0.14)", color: "#8a6d15" }}>
                    {m.tag}
                  </span>
                </div>
                <p className="font-bold text-[15px]" style={{ color: NAVY }}>{m.title}</p>
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{m.desc}</p>
                <div className="mt-3 flex items-center gap-1 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: GOLD }}>
                  {t("jurd.dash.open", locale)} <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Bandeau référentiel */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <BookOpen className="w-5 h-5 mt-0.5" style={{ color: GOLD }} />
          <div>
            <p className="font-bold text-sm" style={{ color: NAVY }}>{t("jurd.dash.kb.title", locale)}</p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              {t("jurd.dash.kb.desc", locale)}
            </p>
          </div>
        </div>
      </div>

      <RagAdminPanel />

      <p className="text-[11px] text-gray-400 text-center">
        {t("jurd.dash.disclaimer", locale)}
      </p>
    </div>
  )
}
