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
import { Loader2, Settings, Calendar, Edit2, Save, ShieldCheck, Baby, Clock, Umbrella, XCircle } from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

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
  PAT: Baby,
  SANS_SOLDE: XCircle,
}

const TYPE_COLORS: Record<string, string> = {
  AL: "border-blue-300 bg-blue-50",
  SL: "border-orange-300 bg-orange-50",
  MAT: "border-pink-300 bg-pink-50",
  PAT: "border-indigo-300 bg-indigo-50",
  SANS_SOLDE: "border-gray-300 bg-gray-50",
}

const BADGE_COLORS: Record<string, string> = {
  AL: "bg-blue-100 text-blue-800",
  SL: "bg-orange-100 text-orange-800",
  MAT: "bg-pink-100 text-pink-800",
  PAT: "bg-indigo-100 text-indigo-800",
  SANS_SOLDE: "bg-gray-100 text-gray-800",
}

const GENRE_LABELS: Record<string, string> = {
  F: "Femme uniquement",
  M: "Homme uniquement",
  "": "Tous",
}

// WRA 2019 defaults
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
    description: "Conge maladie selon le WRA 2019. 15 jours par an, non reportable. Certificat medical requis apres 3 jours consecutifs.",
  },
  {
    id: "default_mat",
    type_conge: "MAT",
    jours_par_an: 98,
    prorata: false,
    max_report: 0,
    anciennete_min_mois: 12,
    genre: "F",
    description: "Conge maternite de 14 semaines (98 jours) selon le WRA 2019. Anciennete minimum de 12 mois requise.",
  },
  {
    id: "default_pat",
    type_conge: "PAT",
    jours_par_an: 5,
    prorata: false,
    max_report: 0,
    anciennete_min_mois: 12,
    genre: "M",
    description: "Conge paternite de 5 jours ouvrables selon le WRA 2019. Anciennete minimum de 12 mois requise.",
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
      const params = new URLSearchParams()
      if (societe !== "all") params.set("societe_id", societe)
      const data = await fetch(`/api/rh/conges/entitlements?${params}`).then(r => r.json()).catch(() => ({ rules: [] }))
      if (data.rules && data.rules.length > 0) {
        setRules(data.rules)
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
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            <Settings className="inline h-6 w-6 mr-2" />
            Parametres des conges
          </h1>
          <p className="text-gray-500 text-sm">Configuration des droits et regles de conges (WRA 2019)</p>
        </div>
        <Select value={societe} onValueChange={setSociete}>
          <SelectTrigger className="w-[200px]">
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

      {/* Info banner */}
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="py-3">
          <p className="text-sm text-amber-800">
            <ShieldCheck className="inline h-4 w-4 mr-1" />
            Les valeurs par defaut sont conformes au <strong>Workers&apos; Rights Act 2019</strong> de Maurice.
            Modifiez uniquement si la politique interne de la societe le permet.
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

      {/* Edit dialog */}
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
