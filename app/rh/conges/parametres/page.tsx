"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Loader2, Settings, Calendar, Edit2, ShieldCheck, Baby, Clock,
  Umbrella, XCircle, Heart, Users, Gavel, Trophy, Scale, BookOpen,
  AlertCircle, CheckCircle2, Briefcase, FileText, HeartPulse
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"
const BLUE = "#4191FF"

// ─── WRA 2019 Reference Data ───────────────────────────────────
interface WRARef {
  id: string
  title: string
  titleEn: string
  section: string
  color: string
  quota: string
  unit: string
  rules: string[]
}

const WRA_TYPES: WRARef[] = [
  {
    id: "AL",
    title: "Conge annuel (Local Leave)",
    titleEn: "Annual Leave",
    section: "Section 45",
    color: "#4191FF",
    quota: "22",
    unit: "jours ouvrables / an",
    rules: [
      "20 jours ouvrables + 2 jours garantis = 22 jours/an",
      "Weekends exclus, jours feries non deduits",
      "Annee 1 : 0 jours (mois 1-6), puis 1 jour/mois max 6",
      "Annee 2+ : 22 jours des le 1er jour",
      "Preavis 48h requis",
    ],
  },
  {
    id: "SL",
    title: "Conge maladie (Sick Leave)",
    titleEn: "Sick Leave",
    section: "Section 46",
    color: "#f97316",
    quota: "15",
    unit: "jours / an",
    rules: [
      "15 jours par an en cas de maladie",
      "Certificat medical requis apres 3 jours consecutifs",
      "Annee 1 : meme regle que AL (0 mois 1-6, puis 1 j/mois max 6)",
      "Cumulatif : solde non pris reporte annee suivante",
    ],
  },
  {
    id: "MAT",
    title: "Conge maternite",
    titleEn: "Maternity Leave",
    section: "Section 52",
    color: "#ec4899",
    quota: "14",
    unit: "semaines",
    rules: [
      "14 semaines (98 jours) remuneres",
      "12 mois d'anciennete requis pour maintien de salaire",
      "Prime de 3 mois pour les femmes sans anciennete",
      "Repartition : 4 semaines avant + 10 apres accouchement",
    ],
  },
  {
    id: "PAT",
    title: "Conge paternite",
    titleEn: "Paternity Leave",
    section: "Section 53",
    color: "#8b5cf6",
    quota: "5",
    unit: "jours ouvrables",
    rules: [
      "5 jours ouvrables consecutifs",
      "A prendre dans les 6 semaines apres la naissance",
      "12 mois d'anciennete requis",
      "Remuneres par l'employeur",
    ],
  },
  {
    id: "SPECIAL",
    title: "Conges exceptionnels",
    titleEn: "Special Leave",
    section: "Section 48",
    color: "#10b981",
    quota: "Variable",
    unit: "selon evenement",
    rules: [
      "Mariage du salarie : 6 jours",
      "Mariage enfant : 3 jours",
      "Deces famille proche : 3 jours",
      "Autres evenements : selon discretion employeur",
    ],
  },
  {
    id: "JURY",
    title: "Conge de jure",
    titleEn: "Jury Service Leave",
    section: "Section 50",
    color: "#64748b",
    quota: "Variable",
    unit: "duree du service",
    rules: [
      "Duree du service de jure",
      "Remunere par l'employeur",
      "Convocation officielle requise",
    ],
  },
]

// ─── Admin editable rules ────────────────────────────────────────
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

const TYPE_ICONS: Record<string, any> = {
  AL: Umbrella,
  SL: HeartPulse,
  MAT: Baby,
  PAT: Users,
  SANS_SOLDE: XCircle,
}

const TYPE_COLORS: Record<string, string> = {
  AL: "#4191FF",
  SL: "#f97316",
  MAT: "#ec4899",
  PAT: "#8b5cf6",
  SANS_SOLDE: "#64748b",
}

const GENRE_LABELS: Record<string, string> = {
  F: "Femme uniquement",
  M: "Homme uniquement",
  "": "Tous",
}

const DEFAULT_RULES: LeaveRule[] = [
  { id: "default_al", type_conge: "AL", jours_par_an: 22, prorata: true, max_report: 5, anciennete_min_mois: 0, genre: null, description: "Conge annuel selon WRA 2019. 22 jours ouvrables par an, prorata pour service partiel." },
  { id: "default_sl", type_conge: "SL", jours_par_an: 15, prorata: false, max_report: 0, anciennete_min_mois: 0, genre: null, description: "Conge maladie selon WRA 2019. 15 jours par an, certificat medical requis apres 3 jours." },
  { id: "default_mat", type_conge: "MAT", jours_par_an: 98, prorata: false, max_report: 0, anciennete_min_mois: 12, genre: "F", description: "Conge maternite 14 semaines (98 jours) selon WRA 2019." },
  { id: "default_pat", type_conge: "PAT", jours_par_an: 5, prorata: false, max_report: 0, anciennete_min_mois: 12, genre: "M", description: "Conge paternite 5 jours ouvrables selon WRA 2019." },
  { id: "default_sans_solde", type_conge: "SANS_SOLDE", jours_par_an: 0, prorata: false, max_report: 0, anciennete_min_mois: 0, genre: null, description: "Conge sans solde, sur accord de l'employeur." },
]

// Per-type flag map: { AL: { demi_journee_autorisee: true, ... }, ... }
type TypeFlags = Record<string, { demi_journee_autorisee: boolean; imposable_par_societe: boolean }>

// ─── Main Page ───────────────────────────────────────────────────
export default function CongesParametresPage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [rules, setRules] = useState<LeaveRule[]>(DEFAULT_RULES)
  const [typeFlags, setTypeFlags] = useState<TypeFlags>({})
  const [loading, setLoading] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editRule, setEditRule] = useState<LeaveRule | null>(null)
  const [formJours, setFormJours] = useState("")
  const [formProrata, setFormProrata] = useState(false)
  const [formMaxReport, setFormMaxReport] = useState("")
  const [formAnciennete, setFormAnciennete] = useState("")
  const [formGenre, setFormGenre] = useState("")
  const [formDemiJournee, setFormDemiJournee] = useState(true)
  const [formImposable, setFormImposable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/comptable/societes")
      .then(r => r.json())
      .then(d => setSocietes(d.societes || []))
      .catch(() => setSocietes([]))
  }, [])

  const load = useCallback(async () => {
    if (societe === "all" || !societe) {
      setRules(DEFAULT_RULES)
      setTypeFlags({})
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/rh/conges/entitlements?societe_id=${societe}`)
      if (!res.ok) { setRules(DEFAULT_RULES); setTypeFlags({}); return }
      const data = await res.json()
      const loaded = data.rules || data.regles || []
      setRules(loaded.length > 0 ? loaded : DEFAULT_RULES)
      setTypeFlags(data.type_flags || {})
    } catch {
      setRules(DEFAULT_RULES)
      setTypeFlags({})
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
    // Flag defaults: AL allows demi-journée and is imposable; the rest are
    // conservative defaults until the RH team explicitly opts in.
    const cur = typeFlags[rule.type_conge]
    setFormDemiJournee(cur?.demi_journee_autorisee ?? (rule.type_conge === 'AL' || rule.type_conge === 'SL'))
    setFormImposable(cur?.imposable_par_societe ?? (rule.type_conge === 'AL'))
    setSaveFeedback(null)
    setEditOpen(true)
  }

  const saveRule = async () => {
    if (!editRule) return
    setSaving(true)
    setSaveFeedback(null)
    try {
      const updated: LeaveRule = {
        ...editRule,
        jours_par_an: parseInt(formJours) || 0,
        prorata: formProrata,
        max_report: parseInt(formMaxReport) || 0,
        anciennete_min_mois: parseInt(formAnciennete) || 0,
        genre: formGenre || null,
      }
      if (societe !== "all") {
        // 1) Persist the WRA-style rule fields via the legacy POST action.
        await fetch("/api/rh/conges/entitlements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update_rule", societe_id: societe, rule: updated }),
        }).catch(() => {})

        // 2) Persist the two per-type flags across conges_employes for every
        //    active employee of the société (new PUT endpoint).
        const putRes = await fetch("/api/rh/conges/entitlements", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            societe_id: societe,
            type_conge: editRule.type_conge,
            demi_journee_autorisee: formDemiJournee,
            imposable_par_societe: formImposable,
          }),
        })
        if (putRes.ok) {
          const r = await putRes.json().catch(() => ({}))
          const u = r.updated || 0
          const c = r.created || 0
          setSaveFeedback(`Paramètres appliqués: ${u} employé(s) mis à jour, ${c} créé(s).`)
          // Update local type_flags so the UI reflects the change immediately.
          setTypeFlags(prev => ({
            ...prev,
            [editRule.type_conge]: {
              demi_journee_autorisee: formDemiJournee,
              imposable_par_societe: formImposable,
            },
          }))
        } else {
          const err = await putRes.json().catch(() => ({}))
          setSaveFeedback(`⚠ Flags non enregistrés: ${err?.error || putRes.status}`)
        }
      }
      setRules(prev => prev.map(r => r.type_conge === editRule.type_conge ? updated : r))
      // Keep dialog open briefly so user sees the feedback, then close.
      setTimeout(() => { setEditOpen(false); setSaveFeedback(null) }, 1200)
    } catch (e: any) {
      // Sprint 1 — feedback déjà visible via setSaveFeedback ; pas de
      // log console redondant en prod.
      setSaveFeedback(`Erreur lors de l'enregistrement : ${e?.message || 'inconnue'}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight" style={{ color: NAVY }}>
            <Settings className="inline h-6 w-6 mr-2 -mt-1" style={{ color: GOLD }} />
            Regles des conges
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            Guide de reference selon le <span className="font-semibold" style={{ color: BLUE }}>Workers&apos; Rights Act 2019</span> de Maurice
          </p>
        </div>
        <Select value={societe} onValueChange={setSociete}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Toutes les societes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les societes</SelectItem>
            {societes.map((s: any) => (
              <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Info banner */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="px-5 py-3 flex items-start gap-3" style={{ background: `linear-gradient(135deg, ${NAVY}08, ${BLUE}10)` }}>
          <ShieldCheck className="h-5 w-5 mt-0.5 shrink-0" style={{ color: BLUE }} />
          <p className="text-sm text-gray-700">
            <strong>Workers&apos; Rights Act 2019</strong> &mdash; Droits minimaux legaux a Maurice.
            Les valeurs ci-dessous sont des references qui ne peuvent etre reduites par l&apos;employeur.
          </p>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="reference" className="space-y-5">
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

        {/* TAB 1: REFERENCE */}
        <TabsContent value="reference" className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {WRA_TYPES.map(t => (
              <Card key={t.id} className="border-2 overflow-hidden flex flex-col" style={{ borderColor: t.color + "40" }}>
                <div className="px-5 py-4 flex items-start justify-between gap-3" style={{ background: `linear-gradient(135deg, ${t.color}15, ${t.color}05)` }}>
                  <div>
                    <h3 className="font-bold text-sm" style={{ color: NAVY }}>{t.title}</h3>
                    <p className="text-[11px] text-gray-500">{t.titleEn}</p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px] font-semibold" style={{ borderColor: t.color, color: t.color }}>
                    {t.section}
                  </Badge>
                </div>
                <CardContent className="px-5 py-4 flex-1 space-y-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-black" style={{ color: t.color }}>{t.quota}</span>
                    <span className="text-sm text-gray-500">{t.unit}</span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-gray-700">
                    {t.rules.map((r, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" style={{ color: t.color }} />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* TAB 2: ADMIN */}
        <TabsContent value="admin" className="space-y-5">
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="py-3">
              <p className="text-sm text-amber-800 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                Les valeurs par defaut sont conformes au <strong>WRA 2019</strong>. Modifiez uniquement si votre politique interne permet des minimums plus eleves.
              </p>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rules.map(rule => {
                const Icon = TYPE_ICONS[rule.type_conge] || Calendar
                const color = TYPE_COLORS[rule.type_conge] || "#64748b"
                return (
                  <Card key={rule.type_conge} className="border-2" style={{ borderColor: color + "40" }}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
                          <Icon className="h-5 w-5" style={{ color }} />
                          {TYPE_LABELS[rule.type_conge] || rule.type_conge}
                        </CardTitle>
                        <Badge style={{ backgroundColor: color + "20", color }}>{rule.type_conge}</Badge>
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
                          <p className="font-semibold">{rule.anciennete_min_mois > 0 ? `${rule.anciennete_min_mois} mois` : "Aucune"}</p>
                        </div>
                      </div>
                      {rule.genre && (
                        <div className="flex items-center gap-1">
                          <p className="text-xs text-gray-400">Genre:</p>
                          <Badge variant="outline" className="text-xs">{GENRE_LABELS[rule.genre] || rule.genre}</Badge>
                        </div>
                      )}
                      {/* Per-type flags — visible only when a société is selected */}
                      {societe !== "all" && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {typeFlags[rule.type_conge]?.demi_journee_autorisee && (
                            <Badge className="bg-purple-100 text-purple-700 text-[10px] font-medium">Demi-journée OK</Badge>
                          )}
                          {typeFlags[rule.type_conge]?.imposable_par_societe && (
                            <Badge className="bg-amber-100 text-amber-700 text-[10px] font-medium">Imposable</Badge>
                          )}
                        </div>
                      )}
                      <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => openEdit(rule)} style={{ borderColor: GOLD, color: GOLD }}>
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

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ color: NAVY }}>
              Modifier : {editRule ? (TYPE_LABELS[editRule.type_conge] || editRule.type_conge) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Jours par an</Label>
              <Input type="number" value={formJours} onChange={e => setFormJours(e.target.value)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Prorata pour nouveaux employes</Label>
              <Switch checked={formProrata} onCheckedChange={setFormProrata} />
            </div>
            <div>
              <Label>Jours reportables max (annee suivante)</Label>
              <Input type="number" value={formMaxReport} onChange={e => setFormMaxReport(e.target.value)} />
            </div>
            <div>
              <Label>Anciennete minimum requise (mois)</Label>
              <Input type="number" value={formAnciennete} onChange={e => setFormAnciennete(e.target.value)} />
            </div>
            <div>
              <Label>Genre</Label>
              <Select value={formGenre || "all"} onValueChange={v => setFormGenre(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="F">Femme uniquement</SelectItem>
                  <SelectItem value="M">Homme uniquement</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Commit 11 — Paramètres toggles (persist to conges_employes) */}
            <div className="rounded-lg border p-3 bg-gray-50 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Règles de fonctionnement
              </p>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-sm">Demi-journée autorisée</Label>
                  <p className="text-[10px] text-gray-500">
                    Les employés peuvent demander ½ journée (matin ou après-midi) pour ce type de congé.
                  </p>
                </div>
                <Switch checked={formDemiJournee} onCheckedChange={setFormDemiJournee} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-sm">Imposable par la société</Label>
                  <p className="text-[10px] text-gray-500">
                    La RH peut imposer ce type de congé (fermeture, pont, …) via « Imposer congé collectif ».
                  </p>
                </div>
                <Switch checked={formImposable} onCheckedChange={setFormImposable} />
              </div>
              {societe === "all" && (
                <p className="text-[10px] text-amber-700">
                  Choisissez une société dans le sélecteur en haut pour enregistrer ces paramètres.
                </p>
              )}
            </div>

            {saveFeedback && (
              <div className={`rounded-md p-2 text-sm ${saveFeedback.startsWith('⚠') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'}`}>
                {saveFeedback}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Annuler</Button>
            <Button onClick={saveRule} disabled={saving} style={{ backgroundColor: NAVY, color: "white" }}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </ClientPageShell>
  )
}
