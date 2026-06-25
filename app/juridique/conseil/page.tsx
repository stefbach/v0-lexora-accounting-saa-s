"use client"
import React, { useEffect, useState } from "react"
import { MessageSquareText, Scale } from "lucide-react"
import { JuridiqueHeader } from "@/components/juridique/JuridiqueHeader"
import { LegalChat } from "@/components/juridique/LegalChat"
import { DEPARTEMENTS } from "@/lib/juridique/departements"
import { t, getLocale } from "@/lib/i18n"

const GOLD = "#D4AF37"

export default function ConseilPage() {
  const locale = getLocale()
  const SUGGESTIONS = [
    t("jurd.conseil.s1", locale),
    t("jurd.conseil.s2", locale),
    t("jurd.conseil.s3", locale),
    t("jurd.conseil.s4", locale),
  ]
  const [dep, setDep] = useState<(typeof DEPARTEMENTS)[number] | null>(null)

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("dep")
    if (id) setDep(DEPARTEMENTS.find((d) => d.id === id) || null)
  }, [])

  return (
    <div className="space-y-4">
      <JuridiqueHeader
        icon={<MessageSquareText className="w-6 h-6" style={{ color: GOLD }} />}
        title={dep ? `${t("jurd.conseil.titlePrefix", locale)} ${dep.nom}` : t("jurd.conseil.title", locale)}
        subtitle={t("jurd.conseil.subtitle", locale)}
      />

      {dep && (
        <div className="flex items-center gap-2 -mt-1 text-xs">
          <span className="font-semibold px-2.5 py-1 rounded-full" style={{ background: "rgba(212,175,55,0.16)", color: "#8a6d15" }}>
            {t("jurd.conseil.departement", locale)} {dep.nom}
          </span>
          <span className="text-gray-400">{dep.lois.join(" · ")}</span>
        </div>
      )}

      <LegalChat
        icon={<Scale className="w-4 h-4" style={{ color: GOLD }} />}
        title={dep ? `${t("jurd.conseil.avocatPrefix", locale)} ${dep.nom}` : t("jurd.conseil.avocat", locale)}
        subtitle={t("jurd.conseil.chatSubtitle", locale)}
        suggestions={dep?.exemples?.length ? dep.exemples : SUGGESTIONS}
        emptyHint={dep ? `${t("jurd.conseil.emptyHintPrefix", locale)} ${dep.nom}. ${dep.pitch}` : undefined}
        domaines={dep?.domaines}
        departement={dep?.id}
        contextLabel={dep ? `${t("jurd.conseil.contextLabelPrefix", locale)} ${dep.nom} (${dep.lois.join(", ")})` : undefined}
        placeholder={t("jurd.conseil.placeholder", locale)}
        reportTitle={dep ? `${t("jurd.conseil.reportTitlePrefix", locale)} ${dep.nom}` : t("jurd.conseil.reportTitle", locale)}
      />
    </div>
  )
}
