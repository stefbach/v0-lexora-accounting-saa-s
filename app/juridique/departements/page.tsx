"use client"
import React from "react"
import Link from "next/link"
import {
  Building2, FileSignature, Users, Receipt, ShieldCheck, Lightbulb, Scale, Gavel, Home, Cpu,
  ArrowRight, type LucideIcon,
} from "lucide-react"
import { JuridiqueHeader } from "@/components/juridique/JuridiqueHeader"
import { DEPARTEMENTS } from "@/lib/juridique/departements"
import { t, getLocale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

const ICONS: Record<string, LucideIcon> = {
  Building2, FileSignature, Users, Receipt, ShieldCheck, Lightbulb, Scale, Gavel, Home, Cpu,
}

export default function DepartementsPage() {
  const locale = getLocale()
  return (
    <div className="space-y-5">
      <JuridiqueHeader
        icon={<Scale className="w-6 h-6" style={{ color: GOLD }} />}
        title={t("jurd.dep.title", locale)}
        subtitle={t("jurd.dep.subtitle", locale)}
        showSelector={false}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {DEPARTEMENTS.map((d) => {
          const Icon = ICONS[d.icon] || Scale
          return (
            <div key={d.id} className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm flex flex-col">
              <div className="flex items-center gap-3 mb-2">
                <div className="rounded-xl p-2.5" style={{ background: "rgba(11,15,46,0.06)" }}>
                  <Icon className="w-5 h-5" style={{ color: NAVY }} />
                </div>
                <p className="font-bold text-[15px]" style={{ color: NAVY }}>{d.nom}</p>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{d.pitch}</p>

              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{t("jurd.dep.prestations", locale)}</p>
                <ul className="text-xs text-gray-600 space-y-0.5">
                  {d.prestations.slice(0, 4).map((p) => (
                    <li key={p} className="flex gap-1.5"><span style={{ color: GOLD }}>•</span>{p}</li>
                  ))}
                </ul>
              </div>

              <div className="mt-3 flex flex-wrap gap-1">
                {d.lois.map((l) => (
                  <span key={l} className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-gray-200 text-gray-600">{l}</span>
                ))}
              </div>

              <Link
                href={`/juridique/conseil?dep=${d.id}`}
                className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: NAVY }}
              >
                {t("jurd.dep.consulter", locale)} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-gray-400 text-center">
        {t("jurd.dep.disclaimer", locale)}
      </p>
    </div>
  )
}
