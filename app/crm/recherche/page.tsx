"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Loader2, Sparkles, Linkedin, Save, Search, MapPin, Building2, Lock, Mail } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

const panelStyle: React.CSSProperties = {
  border: "1px solid #D8DFED",
  borderRadius: 18,
  background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 18px 40px -24px rgba(15,23,42,0.16)",
}

interface PersonPreview {
  apollo_person_id?: string
  prenom?: string
  nom?: string
  nom_complet?: string
  titre?: string
  seniorite?: string
  linkedin_url?: string
  email_locked: boolean
  societe?: string
  societe_site_web?: string
  societe_telephone?: string
  societe_industrie?: string
  societe_ville?: string
  societe_linkedin?: string
}

const EXAMPLES = [
  "Dirigeants d'hôtels à Grand Baie",
  "DAF / CFO de cabinets comptables à Port Louis",
  "Patrons de sociétés IT à Ebène",
  "Directeurs d'entreprises de construction à Maurice",
]

// Regroupe les séniorités Apollo en 3 niveaux affichables.
const SENIORITY_GROUPS: Record<string, string[]> = {
  Direction: ["owner", "founder", "c_suite", "partner"],
  "VP / Head": ["vp", "head"],
  Directeur: ["director"],
}

export default function RechercheIntelligentePage() {
  const { toast } = useToast()
  const [prompt, setPrompt] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [interpretation, setInterpretation] = useState("")
  const [total, setTotal] = useState(0)
  const [people, setPeople] = useState<PersonPreview[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})

  // Filtres locaux (gratuits, côté client)
  const [onlyLinkedin, setOnlyLinkedin] = useState(false)
  const [seniorityFilter, setSeniorityFilter] = useState<string | null>(null)

  const keyOf = (p: PersonPreview, i: number) => p.apollo_person_id || `${p.nom_complet}-${p.societe}-${i}`

  const filtered = useMemo(() => {
    return people.filter((p) => {
      if (onlyLinkedin && !p.linkedin_url) return false
      if (seniorityFilter) {
        const group = SENIORITY_GROUPS[seniorityFilter] || []
        if (!group.includes(p.seniorite ?? "")) return false
      }
      return true
    })
  }, [people, onlyLinkedin, seniorityFilter])

  const selectedCount = Object.values(selected).filter(Boolean).length

  const search = async () => {
    if (!prompt.trim()) {
      toast({ title: "Saisissez une requête", variant: "destructive" })
      return
    }
    setLoading(true)
    setPeople([])
    setSelected({})
    setInterpretation("")
    setTotal(0)
    try {
      const res = await fetch("/api/crm/internal/smart-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, per_page: 50 }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Erreur recherche")
      setInterpretation(json.data.interpretation || "")
      setPeople(json.data.people || [])
      setTotal(json.data.total || 0)
      toast({
        title: "Consultation gratuite",
        description: `${json.data.people?.length || 0} dirigeants affichés sur ${json.data.total || 0} trouvés (aucun crédit consommé)`,
      })
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const keepSelection = async () => {
    const toKeep = filtered.filter((p, i) => selected[keyOf(p, i)])
    if (toKeep.length === 0) {
      toast({ title: "Aucune sélection", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/crm/internal/keep-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ people: toKeep }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Erreur enregistrement")
      const r = json.data
      toast({
        title: "Sélection enregistrée",
        description: `${r.companies_created} sociétés, ${r.contacts_created} contacts créés`,
      })
      setSelected({})
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const toggleAll = (checked: boolean) => {
    const next: Record<string, boolean> = {}
    if (checked) filtered.forEach((p, i) => { next[keyOf(p, i)] = true })
    setSelected(next)
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2" style={{ color: NAVY }}>
          <Sparkles className="h-7 w-7" style={{ color: GOLD }} /> Recherche intelligente
        </h1>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" /> Maurice uniquement — décrivez les dirigeants cibles, consultez gratuitement, gardez ceux qui vous intéressent.
        </p>
      </div>

      <Card style={panelStyle}>
        <CardHeader><CardTitle className="text-base">Quels dirigeants cherchez-vous&nbsp;?</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="ex : directeurs financiers d'hôtels à Grand Baie de plus de 50 employés"
            rows={3}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) search() }}
          />
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setPrompt(ex)}
                className="text-xs rounded-full border px-3 py-1 text-muted-foreground hover:bg-gray-50"
              >
                {ex}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              Les noms des dirigeants s&apos;affichent gratuitement. Les emails/téléphones restent masqués jusqu&apos;à l&apos;enrichissement (qui, lui, consomme des crédits).
            </span>
            <Button onClick={search} disabled={loading} style={{ backgroundColor: GOLD, color: NAVY }}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Consulter (gratuit)
            </Button>
          </div>
        </CardContent>
      </Card>

      {interpretation && (
        <div className="text-sm rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-amber-900">
          <span className="font-semibold">Compris :</span> {interpretation}
        </div>
      )}

      {people.length > 0 && (
        <Card style={panelStyle}>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">
              Dirigeants ({filtered.length} affichés / {total.toLocaleString("fr-FR")} trouvés)
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {Object.keys(SENIORITY_GROUPS).map((g) => (
                <FilterChip
                  key={g}
                  active={seniorityFilter === g}
                  onClick={() => setSeniorityFilter((v) => (v === g ? null : g))}
                  label={g}
                />
              ))}
              <FilterChip active={onlyLinkedin} onClick={() => setOnlyLinkedin((v) => !v)} icon={Linkedin} label="LinkedIn" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <Checkbox
                  checked={selectedCount > 0 && selectedCount === filtered.length}
                  onCheckedChange={(v) => toggleAll(Boolean(v))}
                />
                Tout sélectionner
              </label>
              <Button
                onClick={keepSelection}
                disabled={saving || selectedCount === 0}
                size="sm"
                style={{ backgroundColor: NAVY, color: "white" }}
              >
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Garder la sélection ({selectedCount})
              </Button>
            </div>

            <div className="space-y-2">
              {filtered.map((p, i) => {
                const k = keyOf(p, i)
                return (
                  <label
                    key={k}
                    className="flex items-start gap-3 rounded-lg border bg-white p-3 cursor-pointer hover:border-amber-300"
                  >
                    <Checkbox
                      checked={!!selected[k]}
                      onCheckedChange={(v) => setSelected((s) => ({ ...s, [k]: Boolean(v) }))}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold" style={{ color: NAVY }}>
                          {p.nom_complet || "(nom non disponible)"}
                        </span>
                        {p.titre && <span className="text-sm text-muted-foreground">· {p.titre}</span>}
                        {p.seniorite && <Badge variant="secondary" className="text-[10px]">{p.seniorite}</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
                        {p.societe && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{p.societe}</span>}
                        {p.societe_industrie && <span>· {p.societe_industrie}</span>}
                        {p.societe_ville && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{p.societe_ville}</span>}
                        {p.linkedin_url && <span className="inline-flex items-center gap-1"><Linkedin className="h-3 w-3" />LinkedIn</span>}
                        <span className="inline-flex items-center gap-1">
                          {p.email_locked
                            ? <><Lock className="h-3 w-3" />email à révéler</>
                            : <><Mail className="h-3 w-3 text-emerald-600" />email dispo</>}
                        </span>
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon?: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors"
      style={
        active
          ? { backgroundColor: NAVY, color: "white", borderColor: NAVY }
          : { backgroundColor: "white", color: "#64748b" }
      }
    >
      {Icon && <Icon className="h-3 w-3" />}
      {label}
    </button>
  )
}
