"use client"
import React from "react"
import { Users, Scale } from "lucide-react"
import { JuridiqueHeader } from "@/components/juridique/JuridiqueHeader"
import { LegalChat } from "@/components/juridique/LegalChat"
import { t, getLocale } from "@/lib/i18n"

const GOLD = "#D4AF37"

export default function ConseilRHPage() {
  const locale = getLocale()
  const SUGGESTIONS = [
    t("jurd.conseilrh.s1", locale),
    t("jurd.conseilrh.s2", locale),
    t("jurd.conseilrh.s3", locale),
    t("jurd.conseilrh.s4", locale),
  ]
  return (
    <div className="space-y-4">
      <JuridiqueHeader
        icon={<Users className="w-6 h-6" style={{ color: GOLD }} />}
        title={t("jurd.conseilrh.title", locale)}
        subtitle={t("jurd.conseilrh.subtitle", locale)}
      />

      <LegalChat
        icon={<Scale className="w-4 h-4" style={{ color: GOLD }} />}
        title={t("jurd.conseilrh.chatTitle", locale)}
        subtitle={t("jurd.conseilrh.chatSubtitle", locale)}
        suggestions={SUGGESTIONS}
        domaines={["travail"]}
        departement="travail"
        contextLabel={t("jurd.conseilrh.contextLabel", locale)}
        placeholder={t("jurd.conseilrh.placeholder", locale)}
        reportTitle={t("jurd.conseilrh.reportTitle", locale)}
      />
    </div>
  )
}
