"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Loader2, Settings, Calendar, Edit2, Save, ShieldCheck, Baby, Clock,
  Umbrella, XCircle, Heart, Users, Gavel, Trophy, Scale, BookOpen,
  AlertCircle, CheckCircle2, Info, ArrowRight, Timer, Briefcase
} from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"
const BLUE = "#4191FF"

// ---------------------------------------------------------------------------
// WRA 2019 Reference Data
// ---------------------------------------------------------------------------

interface WRALeaveType {
  id: string
  title: string
  titleEn: string
  section: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
  borderColor: string
  badgeBg: string
  badgeText: string
  quota: string
  unit: string
  unitType: "working" | "calendar" | "variable"
  cumulative: boolean
  cumulativeNote?: string
  keyRules: string[]
  details?: string[]
}

const WRA_LEAVE_TYPES: WRALeaveType[] = [
  {
    id: "AL",
    title: "Conge annuel (Local Leave)",
    titleEn: "Annual Leave",
    section: "Section 45",
    icon: Umbrella,
    color: "#4191FF",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-800",
    quota: "22",
    unit: "jours ouvrables / an",
    unitType: "working",
    cumulative: true,
    cumulativeNote: "Sur demande ecrite",
    keyRules: [
      "20 jours ouvrables + 2 jours supplementaires garantis = 22 jours/an",
      "Weekends exclus, jours feries pendant le conge NON deduits",
      "12 mois d'emploi continu requis pour le droit complet",
      "Annee 1 : 0 jours (mois 1-6), puis 1 jour/mois a partir du mois 7 (max 6 jours)",
      "Annee 2+ : 22 jours disponibles integralement des le 1er jour",
      "Preavis de 48h requis pour jours consecutifs",
    ],
  },
  {
    id: "SL",
    title: "Conge maladie",
    titleEn: "Sick Leave",
    section: "Section 46",
    icon: ShieldCheck,
    color: "#F97316",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    badgeBg: "bg-orange-100",
    badgeText: "text-orange-800",
    quota: "15",
    unit: "jours ouvrables / an",
    unitType: "working",
    cumulative: true,
    cumulativeNote: "Automatique, accumulation illimitee",
    keyRules: [
      "15 jours ouvrables par an",
      "Certificat medical requis a partir du 4e jour",
      "Report automatique des jours non utilises (accumulation illimitee)",
      "Hospitalisation : debitee du solde accumule",
    ],
  },
  {
    id: "VAC",
    title: "Conge de vacances",
    titleEn: "Vacation Leave",
    section: "Section 47",
    icon: Calendar,
    color: "#22C55E",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    badgeBg: "bg-green-100",
    badgeText: "text-green-800",
    quota: "30",
    unit: "jours ouvrables / 5 ans",
    unitType: "working",
    cumulative: false,
    keyRules: [
      "30 jours ouvrables tous les 5 ans de service continu",
      "Preavis de 3 mois requis",
      "NON cumulatif (reinitialise apres utilisation ou paiement)",
      "Non disponible pour les travailleurs migrants",
    ],
  },
  {
    id: "MAT",
    title: "Conge maternite",
    titleEn: "Maternity Leave",
    section: "Section 52",
    icon: Baby,
    color: "#EC4899",
    bgColor: "bg-pink-50",
    borderColor: "border-pink-200",
    badgeBg: "bg-pink-100",
    badgeText: "text-pink-800",
    quota: "16",
    unit: "semaines calendaires",
    unitType: "calendar",
    cumulative: false,
    keyRules: [
      "16 semaines (semaines calendaires, weekends inclus)",
      "+2 semaines pour jumeaux ou naissance prematuree",
      "Fausse couche : 3 semaines + 5 jours",
      "Mort-ne : 16 semaines",
      "Adoption (enfant < 12 mois) : 16 semaines",
      "Au moins 8 semaines doivent etre apres l'accouchement",
    ],
    details: [
      "Allaitement : 2x30min ou 1x1h par jour pendant 6 mois",
      "Pas de travail de nuit pendant 12 mois apres l'accouchement",
    ],
  },
  {
    id: "PAT",
    title: "Conge paternite",
    titleEn: "Paternity Leave",
    section: "Section 53",
    icon: Users,
    color: "#8B5CF6",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    badgeBg: "bg-purple-100",
    badgeText: "text-purple-800",
    quota: "4",
    unit: "semaines calendaires consecutives",
    unitType: "calendar",
    cumulative: false,
    keyRules: [
      "4 semaines consecutives (semaines calendaires)",
      "Doit commencer dans les 2 semaines suivant la naissance/sortie d'hopital",
      "12 mois d'emploi requis (sinon non remunere)",
      "Egalement pour l'adoption d'un enfant de moins de 12 mois",
    ],
  },
  {
    id: "CARE",
    title: "Conge pour soins",
    titleEn: "Care Leave",
    section: "Section 47A",
    icon: Heart,
    color: "#EF4444",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    badgeBg: "bg-red-100",
    badgeText: "text-red-800",
    quota: "Illimite",
    unit: "deduit du CA/CM/Vacances",
    unitType: "variable",
    cumulative: false,
    keyRules: [
      "Illimite (deduit du solde de conge annuel, maladie ou vacances)",
      "Pour enfant malade, parents ou grands-parents",
      "Maximum 10 jours pour parents/grands-parents",
    ],
  },
  {
    id: "SPECIAL",
    title: "Conge special",
    titleEn: "Special Leave",
    section: "Section 48",
    icon: BookOpen,
    color: "#0EA5E9",
    bgColor: "bg-sky-50",
    borderColor: "border-sky-200",
    badgeBg: "bg-sky-100",
    badgeText: "text-sky-800",
    quota: "3-6",
    unit: "jours ouvrables selon evenement",
    unitType: "working",
    cumulative: false,
    keyRules: [
      "Mariage (propre, 1er uniquement) : 6 jours ouvrables",
      "Mariage d'un enfant (1er uniquement) : 3 jours ouvrables",
      "Deces (conjoint, enfant, parent, frere/soeur) : 3 jours ouvrables",
    ],
  },
  {
    id: "JURY",
    title: "Conge de jure",
    titleEn: "Juror's Leave",
    section: "Section 49",
    icon: Gavel,
    color: "#6366F1",
    bgColor: "bg-indigo-50",
    borderColor: "border-indigo-200",
    badgeBg: "bg-indigo-100",
    badgeText: "text-indigo-800",
    quota: "Variable",
    unit: "duree de la citation",
    unitType: "variable",
    cumulative: false,
    keyRules: [
      "Duree de la citation en tant que jure",
      "Integralement remunere",
    ],
  },
  {
    id: "SPORT",
    title: "Conge sportif / culturel",
    titleEn: "Sport/Culture Leave",
    section: "Section 50",
    icon: Trophy,
    color: "#F59E0B",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-800",
    quota: "Variable",
    unit: "duree de l'evenement",
    unitType: "variable",
    cumulative: false,
    keyRules: [
      "Duree de l'evenement sportif ou culturel",
      "Integralement remunere",
      "Pour representation nationale ou evenement reconnu",
    ],
  },
  {
    id: "COURT",
    title: "Conge judiciaire",
    titleEn: "Court Leave",
    section: "Section 51",
    icon: Scale,
    color: "#64748B",
    bgColor: "bg-slate-50",
    borderColor: "border-slate-200",
    badgeBg: "bg-slate-100",
    badgeText: "text-slate-800",
    quota: "Variable",
    unit: "duree de l'audience",
    unitType: "variable",
    cumulative: false,
    keyRules: [
      "Duree de l'audience au tribunal",
      "Integralement remunere",
    ],
  },
]

// ---------------------------------------------------------------------------
// Admin editable rule types (existing functionality)
// ---------------------------------------------------------------------------

interface LeaveRule {
  id: string
  type_conge: string
  jours_par_an: number
  prorata: boolean
  max_report: number
  anciennete_min_mois: number
  genre: string | null
  description: string
}

const TYPE_LABELS: Record<string, string> = {
  AL: "Conge annuel",
  SL: "Conge maladie",
  MAT: "Conge maternite",
  PAT: "Conge paternite",
  SANS_SOLDE: "Conge sans solde",
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  AL: Umbrella,
  SL: ShieldCheck,
  MAT: Baby,
  PAT: Users,
  SANS_SOLDE: XCircle,
}

const TYPE_COLORS: Record<string, string> = {
  AL: "border-blue-300 bg-blue-50",
  SL: "border-orange-300 bg-orange-50",
  MAT: "border-pink-300 bg-pink-50",
  PAT: "border-purple-300 bg-purple-50",
  SANS_SOLDE: "border-gray-300 bg-gray-50",
}

const BADGE_COLORS: Record<string, string> = {
  AL: "bg-blue-100 text-blue-800",
  SL: "bg-orange-100 text-orange-800",
  MAT: "bg-pink-100 text-pink-800",
  PAT: "bg-purple-100 text-purple-800",
  SANS_SOLDE: "bg-gray-100 text-gray-800",
}

const GENRE_LABELS: Record<string, string> = {
  F: "Femme uniquement",
  M: "Homme uniquement",
  "": "Tous",
}

const DEFAULT_RULES: LeaveRule[] = [
  {
    id: "default_al",
    type_conge: "AL",
    jours_par_an: 22,
    prorata: true,
    max_report: 5,
    anciennete_min_mois: 0,
    genre: null,
    description: "Conge annuel selon le Workers\u2019 Rights Act 2019. 22 jours ouvrables par an, prorata pour service partiel.",
  },
  {
    id: "default_sl",
    type_conge: "SL",
    jours_par_an: 15,
    prorata: false,
    max_report: 0,
    anciennete_min_mois: 0,
    genre: null,
    description: "Conge maladie selon le WRA 2019. 15 jours par an, report automatique illimite. Certificat medical requis apres 3 jours consecutifs.",
  },
  {
    id: "default_mat",
    type_conge: "MAT",
    jours_par_an: 112,
    prorata: false,
    max_report: 0,
    anciennete_min_mois: 12,
    genre: "F",
    description: "Conge maternite de 16 semaines (112 jours calendaires) selon le WRA 2019.",
  },
  {
    id: "default_pat",
    type_conge: "PAT",
    jours_par_an: 28,
    prorata: false,
    max_report: 0,
    anciennete_min_mois: 12,
    genre: "M",
    description: "Conge paternite de 4 semaines consecutives (28 jours calendaires) selon le WRA 2019.",
  },
  {
    id: "default_sans_solde",
    type_conge: "SANS_SOLDE",
    jours_par_an: 0,
    prorata: false,
    max_report: 0,
    anciennete_min_mois: 0,
    genre: null,
    description: "Conge sans solde, sur accord de l\u2019employeur. Pas de limite legale mais soumis a approbation.",
  },
]

// ---------------------------------------------------------------------------
// Summary Row Card
// ---------------------------------------------------------------------------

function SummaryCard({ item }: { item: WRALeaveType }) {
  const Icon = item.icon
  return (
    <div
      className="flex flex-col items-center text-center p-3 rounded-xl border-2 transition-all hover:scale-105 hover:shadow-md cursor-default"
      style={{ borderColor: item.color + "40", background: item.color + "08" }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center mb-2"
        style={{ background: item.color + "20" }}
      >
        {(Icon as any)({ className: "h-5 w-5", style: { color: item.color } })}
      </div>
      <p className="text-2xl font-extrabold leading-none" style={{ color: NAVY }}>
        {item.quota}
      </p>
      <p className="text-[10px] text-gray-500 mt-1 leading-tight">{item.unit}</p>
      <p className="text-xs font-semibold mt-1" style={{ color: item.color }}>
        {item.titleEn}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Unit Type Badge
// ---------------------------------------------------------------------------

function UnitBadge({ type }: { type: "working" | "calendar" | "variable" }) {
  const config = {
    working: { label: "Jours ouvrables", bg: "bg-emerald-100", text: "text-emerald-700", icon: Briefcase },
    calendar: { label: "Semaines calendaires", bg: "bg-violet-100", text: "text-violet-700", icon: Calendar },
    variable: { label: "Duree variable", bg: "bg-gray-100", text: "text-gray-600", icon: Timer },
  }
  const c = config[type]
  const Icon = c.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${c.bg} ${c.text}`}>
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  )
}

function CumulativeBadge({ value, note }: { value: boolean; note?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
        value ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
      }`}
      title={note}
    >
      {value ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      Cumulatif : {value ? "Oui" : "Non"}
    </span>
  )
}

// ---------------------------------------------------------------------------
// WRA Reference Card
// ---------------------------------------------------------------------------

function WRACard({ item }: { item: WRALeaveType }) {
  const Icon = item.icon
  return (
    <Card className={`border-2 ${item.borderColor} overflow-hidden flex flex-col h-full`}>
      {/* Colored header */}
      <div
        className="px-5 py-4 flex items-start justify-between gap-3"
        style={{ background: `linear-gradient(135deg, ${item.color}12, ${item.color}06)` }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: item.color + "20" }}
          >
            {(Icon as any)({ className: "h-6 w-6", style: { color: item.color } })}
          </div>
          <div>
            <h3 className="font-bold text-sm leading-tight" style={{ color: NAVY }}>
              {item.title}
            </h3>
            <p className="text-[11px] text-gray-500">{item.titleEn}</p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="shrink-0 text-[10px] font-semibold"
          style={{ borderColor: item.color, color: item.color }}
        >
          {item.section}
        </Badge>
      </div>

      <CardContent className="px-5 py-4 flex-1 flex flex-col gap-3">
        {/* Big quota number */}
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-black" style={{ color: item.color }}>
            {item.quota}
          </span>
          <span className="text-sm text-gray-500">{item.unit}</span>
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap gap-1.5">
          <UnitBadge type={item.unitType} />
          <CumulativeBadge value={item.cumulative} note={item.cumulativeNote} />
        </div>

        {item.cumulativeNote && item.cumulative && (
          <p className="text-[11px] text-gray-400 -mt-1 ml-0.5 flex items-center gap-1">
            <Info className="h-3 w-3" /> {item.cumulativeNote}
          </p>
        )}

        <Separator className="my-1" />

        {/* Key rules */}
        <ul className="space-y-1.5 flex-1">
          {item.keyRules.map((rule, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
              <ArrowRight className="h-3 w-3 mt-0.5 shrink-0" style={{ color: item.color }} />
              <span>{rule}</span>
            </li>
          ))}
        </ul>

        {/* Additional details */}
        {item.details && item.details.length > 0 && (
          <>
            <Separator className="my-1" />
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Details supplementaires</p>
              {item.details.map((d, i) => (
                <p key={i} className="text-[11px] text-gray-500 flex items-start gap-1.5">
                  <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" style={{ color: item.color }} />
                  {d}
                </p>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function CongesParametresPage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [rules, setRules] = useState<LeaveRule[]>(DEFAULT_RULES)
  const [loading, setLoading] = useState(true)

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false)
  const [editRule, setEditRule] = useState<LeaveRule | null>(null)
  const [formJours, setFormJours] = useState("")
  const [formProrata, setFormProrata] = useState(false)
  const [formMaxReport, setFormMaxReport] = useState("")
  const [formAnciennete, setFormAnciennete] = useState("")
  const [formGenre, setFormGenre] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // If no societe selected, show defaults (API requires societe_id)
      if (societe === "all" || !societe) {
        setRules(DEFAULT_RULES)
        return
      }
      const params = new URLSearchParams({ societe_id: societe })
      const res = await fetch(`/api/rh/conges/entitlements?${params}`)
      if (!res.ok) {
        setRules(DEFAULT_RULES)
        return
      }
      const data = await res.json()
      // API returns { regles } but we also accept { rules } for compatibility
      const loaded = data.rules || data.regles || []
      if (loaded.length > 0) {
        setRules(loaded)
      } else {
        setRules(DEFAULT_RULES)
      }
    } catch (e) {
      console.error(e)
      setRules(DEFAULT_RULES)
    } finally {
      setLoading(false)
    }
  }, [societe])

  useEffect(() => { load() }, [load])

  const openEdit = (rule: LeaveRule) => {
    setEditRule(rule)
    setFormJours(String(rule.jours_par_an))
    setFormProrata(rule.prorata)
    setFormMaxReport(String(rule.max_report))
    setFormAnciennete(String(rule.anciennete_min_mois))
    setFormGenre(rule.genre || "")
    setEditOpen(true)
  }

  const saveRule = async () => {
    if (!editRule) return
    setSaving(true)
    try {
      const updated: LeaveRule = {
        ...editRule,
        jours_par_an: parseInt(formJours) || 0,
        prorata: formProrata,
        max_report: parseInt(formMaxReport) || 0,
        anciennete_min_mois: parseInt(formAnciennete) || 0,
        genre: formGenre || null,
      }
      await fetch("/api/rh/conges/entitlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_rule",
          societe_id: societe !== "all" ? societe : undefined,
          rule: updated,
        }),
      })
      setRules(prev => prev.map(r => r.type_conge === editRule.type_conge ? updated : r))
      setEditOpen(false)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-[1400px] mx-auto">
      {/* ================================================================= */}
      {/* PAGE HEADER                                                       */}
      {/* ================================================================= */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: NAVY }}>
            <Settings className="inline h-7 w-7 mr-2 -mt-1" style={{ color: GOLD }} />
            Regles des conges
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            Guide de reference complet selon le{" "}
            <span className="font-semibold" style={{ color: BLUE }}>Workers&apos; Rights Act 2019</span>{" "}
            de Maurice
          </p>
        </div>
        <Select value={societe} onValueChange={setSociete}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Toutes les societes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les societes</SelectItem>
            {societes.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ================================================================= */}
      {/* WRA INFO BANNER                                                   */}
      {/* ================================================================= */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <div
          className="px-6 py-4 flex items-start gap-3"
          style={{ background: `linear-gradient(135deg, ${NAVY}08, ${BLUE}10)` }}
        >
          <ShieldCheck className="h-5 w-5 mt-0.5 shrink-0" style={{ color: BLUE }} />
          <div className="text-sm text-gray-700">
            <p>
              <strong>Workers&apos; Rights Act 2019 (WRA)</strong> &mdash; Ce guide presente les droits
              minimaux legaux en matiere de conges a Maurice. Les valeurs ci-dessous servent de
              reference et ne peuvent etre reduites par l&apos;employeur. La section{" "}
              <span className="font-semibold">Parametres editables</span> (ci-dessous) permet de
              configurer des regles specifiques a votre entreprise, en respectant ces minimums legaux.
            </p>
          </div>
        </div>
      </Card>

      {/* ================================================================= */}
      {/* TABS: Reference Guide / Admin Settings                            */}
      {/* ================================================================= */}
      <Tabs defaultValue="reference" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="reference" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Guide WRA 2019
          </TabsTrigger>
          <TabsTrigger value="admin" className="gap-2">
            <Settings className="h-4 w-4" />
            Parametres editables
          </TabsTrigger>
        </TabsList>

        {/* ============================================================= */}
        {/* TAB 1: WRA 2019 REFERENCE GUIDE                               */}
        {/* ============================================================= */}
        <TabsContent value="reference" className="space-y-8">
          {/* ------ SUMMARY ROW ------ */}
          <div>
            <h2 className="text-lg font-bold mb-4" style={{ color: NAVY }}>
              Apercu des quotas legaux
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-3">
              {WRA_LEAVE_TYPES.map(lt => (
                <SummaryCard key={lt.id} item={lt} />
              ))}
            </div>
          </div>

          <Separator />

          {/* ------ DETAILED CARDS ------ */}
          <div>
            <h2 className="text-lg font-bold mb-1" style={{ color: NAVY }}>
              Details par type de conge
            </h2>
            <p className="text-xs text-gray-400 mb-5">
              Chaque carte reprend les dispositions exactes du WRA 2019 avec la section de loi correspondante.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {WRA_LEAVE_TYPES.map(lt => (
                <WRACard key={lt.id} item={lt} />
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ============================================================= */}
        {/* TAB 2: ADMIN EDITABLE RULES                                    */}
        {/* ============================================================= */}
        <TabsContent value="admin" className="space-y-6">
          <div>
            <h2 className="text-lg font-bold" style={{ color: NAVY }}>
              Parametres specifiques a l&apos;entreprise
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Personnalisez les regles de conges de votre societe. Les modifications ne peuvent pas
              descendre en dessous des minimums legaux du WRA 2019.
            </p>
          </div>

          {/* Warning banner */}
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="py-3">
              <p className="text-sm text-amber-800 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                Les valeurs par defaut sont conformes au <strong>Workers&apos; Rights Act 2019</strong>.
                Modifiez uniquement si la politique interne de la societe le permet, en respectant les
                minimums legaux.
              </p>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {rules.map(rule => {
                const Icon = TYPE_ICONS[rule.type_conge] || Calendar
                const colorClass = TYPE_COLORS[rule.type_conge] || "border-gray-300 bg-gray-50"
                const badgeClass = BADGE_COLORS[rule.type_conge] || "bg-gray-100 text-gray-800"

                return (
                  <Card key={rule.type_conge} className={`border-2 ${colorClass}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
                          <Icon className="h-5 w-5" />
                          {TYPE_LABELS[rule.type_conge] || rule.type_conge}
                        </CardTitle>
                        <Badge className={badgeClass}>{rule.type_conge}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-xs text-gray-500">{rule.description}</p>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-400 text-xs">Jours / an</p>
                          <p className="font-bold text-lg" style={{ color: NAVY }}>
                            {rule.type_conge === "SANS_SOLDE" ? "Illimite" : rule.jours_par_an}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-xs">Prorata</p>
                          <Badge variant={rule.prorata ? "default" : "secondary"} className={rule.prorata ? "bg-green-100 text-green-700" : ""}>
                            {rule.prorata ? "Oui" : "Non"}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-gray-400 text-xs">Report max</p>
                          <p className="font-semibold">{rule.max_report > 0 ? `${rule.max_report} jours` : "Aucun"}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-xs">Anciennete min</p>
                          <p className="font-semibold">
                            {rule.anciennete_min_mois > 0 ? `${rule.anciennete_min_mois} mois` : "Aucune"}
                          </p>
                        </div>
                      </div>

                      {rule.genre && (
                        <div className="flex items-center gap-1">
                          <p className="text-xs text-gray-400">Genre:</p>
                          <Badge variant="outline" className="text-xs">{GENRE_LABELS[rule.genre] || rule.genre}</Badge>
                        </div>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-2"
                        onClick={() => openEdit(rule)}
                        style={{ borderColor: GOLD, color: GOLD }}
                      >
                        <Edit2 className="h-3 w-3 mr-1" /> Modifier
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ================================================================= */}
      {/* EDIT DIALOG                                                       */}
      {/* ================================================================= */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{ color: NAVY }}>
              Modifier - {editRule ? TYPE_LABELS[editRule.type_conge] || editRule.type_conge : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Jours par an</Label>
              <Input
                type="number"
                min="0"
                value={formJours}
                onChange={e => setFormJours(e.target.value)}
                className="mt-1"
                disabled={editRule?.type_conge === "SANS_SOLDE"}
              />
              {editRule?.type_conge === "SANS_SOLDE" && (
                <p className="text-xs text-gray-400 mt-1">Le conge sans solde n&apos;a pas de limite legale.</p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Label>Prorata (calcul proportionnel)</Label>
              <Switch checked={formProrata} onCheckedChange={setFormProrata} />
            </div>

            <div>
              <Label>Report maximum (jours)</Label>
              <Input
                type="number"
                min="0"
                value={formMaxReport}
                onChange={e => setFormMaxReport(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-gray-400 mt-1">Nombre de jours reportables a l&apos;annee suivante</p>
            </div>

            <div>
              <Label>Anciennete minimum (mois)</Label>
              <Input
                type="number"
                min="0"
                value={formAnciennete}
                onChange={e => setFormAnciennete(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Restriction genre</Label>
              <Select value={formGenre} onValueChange={setFormGenre}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Aucune restriction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tous</SelectItem>
                  <SelectItem value="F">Femme uniquement</SelectItem>
                  <SelectItem value="M">Homme uniquement</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full text-white"
              style={{ backgroundColor: NAVY }}
              onClick={saveRule}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Enregistrer les modifications
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
