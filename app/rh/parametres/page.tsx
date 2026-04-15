"use client"
/**
 * /rh/parametres — Page de navigation centralisée vers tous les sous-modules
 * de paramétrage RH. Page créée en réponse à l'audit des 24 pages RH (Sprint 2)
 * qui avait relevé qu'aucun /rh/parametres n'existait — seuls /rh/societe et
 * /rh/paie/parametres étaient accessibles, sans hub commun.
 *
 * Cette page n'EFFECTUE aucun paramétrage elle-même : elle agit comme un
 * tableau d'orientation avec une carte par section, chaque carte indiquant
 * brièvement ce qui peut être configuré et redirigeant vers l'écran dédié.
 *
 * Couvert par le redirect /rh/parametres → /rh/societe (next.config.mjs
 * Sprint 1) — ce redirect reste en place car certains liens externes /
 * docs internes pointent encore vers /rh/parametres ; cette page sert de
 * destination canonique pour les nouveaux liens.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Building2, Banknote, Calendar, Clock, Shield, ArrowRight, Settings,
} from "lucide-react"
import Link from "next/link"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface Section {
  title: string
  description: string
  href: string
  icon: any
  bg: string
  border: string
  accent: string
  highlights: string[]
}

const SECTIONS: Section[] = [
  {
    title: "Société",
    description: "Identité, contact, coordonnées GPS, banque, fiscal, devises actives.",
    href: "/rh/societe",
    icon: Building2,
    bg: "bg-slate-50",
    border: "border-l-slate-500",
    accent: "text-slate-700",
    highlights: ["BRN, TAN, NPF", "Adresse + GPS", "Compte bancaire principal", "Toggle pointage_actif"],
  },
  {
    title: "Paie",
    description: "Taux MRA (CSG, NSF, PAYE, PRGF), seuils d'exonération, taux de change EUR/MUR.",
    href: "/rh/paie/parametres",
    icon: Banknote,
    bg: "bg-emerald-50",
    border: "border-l-emerald-500",
    accent: "text-emerald-700",
    highlights: ["CSG seuil + taux", "NSF + Training Levy", "PAYE seuils + tranches", "PRGF par jour"],
  },
  {
    title: "Congés",
    description: "Référentiel WRA 2019, règles AL/SL/MAT/PAT par société, demi-journées + collectif.",
    href: "/rh/conges/parametres",
    icon: Calendar,
    bg: "bg-blue-50",
    border: "border-l-blue-500",
    accent: "text-blue-700",
    highlights: ["22j AL, 15j SL", "98j maternité, 5j paternité", "Toggle demi-journée par type", "Imposable par société"],
  },
  {
    title: "Planning",
    description: "Règles WRA 2019 : heures hebdo max, repos consécutif, OT, contraintes équipe.",
    href: "/rh/planning/regles",
    icon: Shield,
    bg: "bg-amber-50",
    border: "border-l-amber-500",
    accent: "text-amber-700",
    highlights: ["45h/semaine max", "9h/jour max (5j) ou 8h (6j)", "1 jour repos minimum", "Taux OT 1.5x / 2x"],
  },
  {
    title: "Pointage obligatoire",
    description: "Active la déduction automatique des absences depuis les pointages. Toggle par société dans l'onglet Société.",
    href: "/rh/societe",
    icon: Clock,
    bg: "bg-orange-50",
    border: "border-l-orange-500",
    accent: "text-orange-700",
    highlights: [
      "OFF (défaut) — mode test, aucun impact paie",
      "ON — absences sans pointage déduites du net",
      "Confirmation requise avant activation",
    ],
  },
]

export default function ParametresHubPage() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: NAVY }}
        >
          <Settings className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Paramètres RH</h1>
          <p className="text-gray-500 text-sm">
            Tous les paramétrages — société, paie, congés, planning, pointage. Cliquez sur une carte pour ouvrir l'écran dédié.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECTIONS.map((s) => {
          const Icon = s.icon
          return (
            <Link key={s.href + s.title} href={s.href} className="group">
              <Card className={`rounded-2xl border-l-4 ${s.border} hover:shadow-lg transition-shadow h-full`}>
                <CardHeader className="pb-2">
                  <CardTitle className={`text-base font-semibold flex items-center gap-2 ${s.accent}`}>
                    <Icon className="w-5 h-5" /> {s.title}
                    <ArrowRight
                      className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: GOLD }}
                    />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-gray-600">{s.description}</p>
                  <ul className="space-y-1">
                    {s.highlights.map((h) => (
                      <li key={h} className="text-xs text-gray-500 flex items-start gap-1.5">
                        <span className={s.accent}>•</span>
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="pt-1">
                    <Badge variant="outline" className="text-[10px]">
                      {s.href}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
        <p className="font-medium mb-1">À noter</p>
        <ul className="space-y-1 text-blue-800">
          <li>• Les paramètres s'appliquent <b>par société</b>. Sélectionnez la société dans chaque écran avant de modifier.</li>
          <li>• Les changements sur Paie, Congés et Planning entrent en vigueur dès le prochain calcul de paie / création de demande.</li>
          <li>• Le toggle « Pointage obligatoire » est OFF par défaut — la masse salariale n'est jamais déduite tant qu'il n'est pas activé.</li>
        </ul>
      </div>
    </div>
  )
}
