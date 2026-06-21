"use client"
import React, { useEffect, useState } from "react"
import { MessageSquareText, Scale } from "lucide-react"
import { JuridiqueHeader } from "@/components/juridique/JuridiqueHeader"
import { LegalChat } from "@/components/juridique/LegalChat"
import { DEPARTEMENTS } from "@/lib/juridique/departements"

const GOLD = "#D4AF37"

const SUGGESTIONS = [
  "Un client ne paie pas une facture de 350 000 MUR depuis 4 mois. Quelles sont mes options ?",
  "Quel délai de prescription pour une créance commerciale à Maurice ?",
  "Comment contester une cotisation MRA jugée excessive ?",
  "Analyse ce contrat et signale les clauses à risque (joindre le document).",
]

export default function ConseilPage() {
  const [dep, setDep] = useState<(typeof DEPARTEMENTS)[number] | null>(null)

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("dep")
    if (id) setDep(DEPARTEMENTS.find((d) => d.id === id) || null)
  }, [])

  return (
    <div className="space-y-4">
      <JuridiqueHeader
        icon={<MessageSquareText className="w-6 h-6" style={{ color: GOLD }} />}
        title={dep ? `Conseil — ${dep.nom}` : "Conseil juridique"}
        subtitle="Interrogez l'avocat-conseil IA sur le droit mauricien. Réponses structurées avec références citées et analyse de documents."
      />

      {dep && (
        <div className="flex items-center gap-2 -mt-1 text-xs">
          <span className="font-semibold px-2.5 py-1 rounded-full" style={{ background: "rgba(212,175,55,0.16)", color: "#8a6d15" }}>
            Département : {dep.nom}
          </span>
          <span className="text-gray-400">{dep.lois.join(" · ")}</span>
        </div>
      )}

      <LegalChat
        icon={<Scale className="w-4 h-4" style={{ color: GOLD }} />}
        title={dep ? `Avocat-conseil — ${dep.nom}` : "Avocat-conseil"}
        subtitle="Droit mauricien · sources citées"
        suggestions={SUGGESTIONS}
        domaines={dep?.domaines}
        departement={dep?.id}
        contextLabel={dep ? `Département : ${dep.nom} (${dep.lois.join(", ")})` : undefined}
        placeholder="Décrivez votre question juridique, ou joignez des documents à analyser…"
        reportTitle={dep ? `Rapport de consultation — ${dep.nom}` : "Rapport de consultation juridique"}
      />
    </div>
  )
}
