"use client"
import Link from "next/link"
import { Landmark, Gavel, BookUser, CalendarClock, ArrowRight, Users2, FileText } from "lucide-react"
import { JuridiqueHeader } from "@/components/juridique/JuridiqueHeader"
import { SocieteSelector } from "@/components/juridique/JuridiqueSocieteProvider"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

const SECTIONS = [
  {
    href: "/juridique/societe/assemblees",
    icon: Landmark,
    title: "Assemblées générales",
    desc: "PV d'AGO (approbation des comptes, affectation du résultat, quitus) et d'AGE — préremplis avec les associés, administrateurs et chiffres de l'exercice.",
    tag: "Disponible",
    active: true,
  },
  {
    href: "#",
    icon: Gavel,
    title: "Résolutions du conseil",
    desc: "Décisions du conseil d'administration / des gérants : nominations, conventions réglementées, distributions.",
    tag: "Bientôt",
    active: false,
  },
  {
    href: "#",
    icon: BookUser,
    title: "Registres légaux",
    desc: "Registre des associés, des administrateurs et des bénéficiaires effectifs (Companies Act 2001).",
    tag: "Bientôt",
    active: false,
  },
  {
    href: "#",
    icon: CalendarClock,
    title: "Calendrier des obligations",
    desc: "Annual return, AGM, dépôts FSC/ROC, échéances statutaires — alertes et suivi.",
    tag: "Bientôt",
    active: false,
  },
]

export default function VieSocietePage() {
  return (
    <div className="space-y-6">
      <JuridiqueHeader
        icon={<Landmark className="w-6 h-6" style={{ color: GOLD }} />}
        title="Vie juridique de la société"
        subtitle="Le secrétariat juridique de votre société mauricienne : assemblées, résolutions, registres et obligations — alimenté par vos associés, administrateurs et données financières."
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
                  Ouvrir <ArrowRight className="w-3.5 h-3.5" />
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
          <p className="font-bold text-sm" style={{ color: NAVY }}>Tout part de vos données</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            Les actes sont préremplis avec les associés/actionnaires, les administrateurs et les chiffres de l'exercice
            déjà enregistrés dans Lexora. Chaque document cite ses sources (Companies Act 2001) et reste éditable avant signature.
          </p>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 text-center flex items-center justify-center gap-1.5">
        <FileText className="w-3 h-3" /> Lexora n'exerce pas l'activité réglementée d'avocat ni de company secretary agréé. Documents à valider avant dépôt officiel.
      </p>
    </div>
  )
}
