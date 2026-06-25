"use client"
import { Card } from "@/components/ui/card"
import { HeartPulse, Video, ShieldCheck, Play, Stethoscope } from "lucide-react"
import { NAVY } from "../shared/constants"
import { t, getLocale } from "@/lib/i18n"

// Sprint salarie V3.4 — Simplification de l'onglet Santé.
// Avant : 12 sous-onglets dont 11 placeholders, inaccessibles en
// mobile au-delà du 6e. Maintenant : un écran unique avec un seul
// CTA vers TIBOK (https://tibok.mu). Les 11 placeholders et la
// navigation interne ont été retirés.
export function SanteTab({ employe }: { employe: any }) {
  const TEAL = "#2a9d8f"
  const locale = getLocale()

  const features = [
    { icon: Video, label: t("sal.sante.feature1Label", locale), desc: t("sal.sante.feature1Desc", locale) },
    { icon: Stethoscope, label: t("sal.sante.feature2Label", locale), desc: t("sal.sante.feature2Desc", locale) },
    { icon: HeartPulse, label: t("sal.sante.feature3Label", locale), desc: t("sal.sante.feature3Desc", locale) },
    { icon: ShieldCheck, label: t("sal.sante.feature4Label", locale), desc: t("sal.sante.feature4Desc", locale) },
  ]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl md:text-2xl font-bold" style={{ color: NAVY }}>{t("sal.sante.greeting", locale)} {employe?.prenom}</h2>
        <p className="text-gray-400 text-sm">{t("sal.sante.subtitle", locale)}</p>
      </div>

      <Card className="rounded-2xl border-0 shadow-md overflow-hidden">
        <div className="h-1.5 w-full" style={{ backgroundColor: TEAL }} />
        <div className="p-8 text-center">
          <div className="h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${TEAL}10` }}>
            <Video className="h-7 w-7" style={{ color: TEAL }} />
          </div>
          <p className="text-lg font-semibold" style={{ color: TEAL }}>{t("sal.sante.consultation", locale)}</p>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            {t("sal.sante.description", locale)}
          </p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <span className="px-3 py-1 rounded-full text-xs border" style={{ borderColor: TEAL, color: TEAL }}>{t("sal.sante.badgeSecure", locale)}</span>
            <span className="px-3 py-1 rounded-full text-xs border" style={{ borderColor: TEAL, color: TEAL }}>{t("sal.sante.badgeCertified", locale)}</span>
          </div>
          <button
            className="mt-6 w-full md:w-auto px-8 py-3.5 rounded-full text-white font-semibold text-sm flex items-center justify-center gap-2 mx-auto transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ backgroundColor: TEAL }}
            onClick={() => window.open("https://tibok.mu", "_blank", "noopener,noreferrer")}
          >
            {t("sal.sante.cta", locale)} <Play className="h-4 w-4" style={{ marginLeft: 2 }} />
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {features.map((f, i) => (
          <div key={i} className="rounded-2xl border bg-white p-4 flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${TEAL}10` }}>
              <f.icon className="h-5 w-5" style={{ color: TEAL }} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: NAVY }}>{f.label}</p>
              <p className="text-xs text-gray-400">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 text-center">
        {t("sal.sante.partnerNote", locale)}
      </p>
    </div>
  )
}
