"use client"
import React from "react"
import { Users, Scale } from "lucide-react"
import { JuridiqueHeader } from "@/components/juridique/JuridiqueHeader"
import { LegalChat } from "@/components/juridique/LegalChat"

const GOLD = "#D4AF37"

const SUGGESTIONS = [
  "Un salarié a 3 absences injustifiées. Quelle procédure disciplinaire selon le WRA 2019 ?",
  "Comment calculer la severance allowance d'un licenciement injustifié ?",
  "Analyse ce contrat de travail et signale les clauses non conformes (joindre le document).",
  "Quelles obligations PRGF pour un employeur à Maurice ?",
]

export default function ConseilRHPage() {
  return (
    <div className="space-y-4">
      <JuridiqueHeader
        icon={<Users className="w-6 h-6" style={{ color: GOLD }} />}
        title="Conseil RH & Social"
        subtitle="Conseil en droit du travail mauricien (Workers' Rights Act 2019, Employment Relations Act 2008) : embauche, discipline, licenciement, severance, PRGF. Analyse de contrats et documents RH."
      />

      <LegalChat
        icon={<Scale className="w-4 h-4" style={{ color: GOLD }} />}
        title="Conseiller RH & Social"
        subtitle="Droit du travail mauricien · sources citées"
        suggestions={SUGGESTIONS}
        domaines={["travail"]}
        departement="travail"
        contextLabel="Domaine : Droit du travail & social mauricien (WRA 2019, ERA 2008)"
        placeholder="Posez votre question RH/sociale, ou joignez un contrat de travail à analyser…"
        reportTitle="Rapport de consultation RH & Social"
      />
    </div>
  )
}
