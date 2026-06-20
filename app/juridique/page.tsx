"use client"
import Link from "next/link"
import { Scale, Gavel, FileSignature, FolderOpen, ShieldCheck, MessageSquareText, ArrowRight, BookOpen, Users, FolderKanban } from "lucide-react"
import { JuridiqueHeader } from "@/components/juridique/JuridiqueHeader"
import { LOIS_MAURICIENNES, JURIDICTIONS_MAURICIENNES, TYPES_CONTENTIEUX } from "@/lib/juridique/referentielMauricien"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

const MODULES = [
  {
    href: "/juridique/dossiers",
    icon: FolderKanban,
    title: "Dossiers",
    desc: "Gérez vos dossiers et contentieux : parties, statut, pièces, analyses et actes — tout persisté et rattaché.",
    tag: "Gestion",
  },
  {
    href: "/juridique/conseil",
    icon: MessageSquareText,
    title: "Conseil juridique",
    desc: "Posez une question à l'avocat-conseil IA. Références mauriciennes citées, raisonnement structuré.",
    tag: "Avocat-conseil",
  },
  {
    href: "/juridique/conseil-rh",
    icon: Users,
    title: "Conseil RH & Social",
    desc: "Droit du travail mauricien (WRA 2019, ERA 2008) : discipline, licenciement, severance, PRGF. Analyse de contrats de travail.",
    tag: "RH & Social",
  },
  {
    href: "/juridique/contentieux",
    icon: Gavel,
    title: "Contentieux",
    desc: "Qualifiez un litige, évaluez vos chances, générez mises en demeure et actes — tous types de contentieux.",
    tag: "Tous contentieux",
  },
  {
    href: "/juridique/contrats",
    icon: FileSignature,
    title: "Contrats",
    desc: "Génération de contrats de travail, NDA, baux et prestations conformes au droit mauricien.",
    tag: "Rédaction",
  },
  {
    href: "/juridique/documents",
    icon: FolderOpen,
    title: "Documents",
    desc: "Coffre-fort des pièces : importez et classez contrats, actes, registres et correspondances.",
    tag: "Coffre-fort",
  },
  {
    href: "/juridique/conformite",
    icon: ShieldCheck,
    title: "Conformité & délais",
    desc: "Calendrier des obligations légales, délais de prescription et échéances réglementaires (CA 2001, MRA, FSC).",
    tag: "Compliance",
  },
]

function StatCard({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-xl bg-white border border-gray-100 px-4 py-3 shadow-sm">
      <p className="text-2xl font-bold" style={{ color: NAVY }}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

export default function JuridiqueDashboard() {
  return (
    <div className="space-y-6">
      <JuridiqueHeader
        icon={<Scale className="w-6 h-6" style={{ color: GOLD }} />}
        title="Département Juridique"
        subtitle="Votre cabinet juridique mauricien augmenté par l'IA — conseil, contentieux, contrats et conformité. Chaque production est un projet à valider par un homme de loi."
      />

      {/* Stats référentiel */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard value={LOIS_MAURICIENNES.length} label="Lois & codes référencés" />
        <StatCard value={JURIDICTIONS_MAURICIENNES.length} label="Juridictions couvertes" />
        <StatCard value={TYPES_CONTENTIEUX.length} label="Types de contentieux" />
        <StatCard value="🇲🇺" label="Droit mauricien (système mixte)" />
      </div>

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
                  Ouvrir <ArrowRight className="w-3.5 h-3.5" />
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
            <p className="font-bold text-sm" style={{ color: NAVY }}>Un socle de connaissances mauricien</p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Companies Act 2001, Workers' Rights Act 2019, Code Civil & Code de Commerce, Income Tax Act, DPA 2017,
              FSA 2007, Insolvency Act 2009, International Arbitration Act 2008… Le département connaît les juridictions
              (District / Intermediate Court, Commercial Division, Industrial Court, ARC, MARC, Privy Council) et les
              délais de prescription applicables.
            </p>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 text-center">
        Lexora n'exerce pas l'activité réglementée d'avocat. Les documents produits sont des projets de travail à faire
        valider et signer par un avocat / attorney inscrit avant tout usage officiel.
      </p>
    </div>
  )
}
