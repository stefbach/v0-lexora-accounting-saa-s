"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Loader2, Sparkles, Phone, Globe, Linkedin, Save, Search, MapPin } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

const panelStyle: React.CSSProperties = {
  border: "1px solid #D8DFED",
  borderRadius: 18,
  background: "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 18px 40px -24px rgba(15,23,42,0.16)",
}

interface CompanyPreview {
  apollo_id?: string
  nom: string
  telephone?: string
  site_web?: string
  linkedin_url?: string
  industrie?: string
  taille_effectif?: string
  ville?: string
  annee_creation?: number
  description?: string
}

const EXAMPLES = [
  "Hôtels et restaurants à Grand Baie",
  "Cabinets comptables à Port Louis de plus de 50 employés",
  "Sociétés IT / fintech à Ebène",
  "Entreprises de construction à Maurice",
]

export default function RechercheIntelligentePage() {
  const { toast } = useToast()
  const [prompt, setPrompt] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [interpretation, setInterpretation] = useState("")
  const [companies, setCompanies] = useState<CompanyPreview[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  // Filtres locaux (gratuits, côté client)
  const [onlyPhone, setOnlyPhone] = useState(false)
  const [onlyWeb, setOnlyWeb] = useState(false)
  const [onlyLinkedin, setOnlyLinkedin] = useState(false)

  const keyOf = (c: CompanyPreview, i: number) => c.apollo_id || `${c.nom}-${i}`

  const filtered = useMemo(() => {
    return companies.filter((c) => {
      if (onlyPhone && !c.telephone) return false
      if (onlyWeb && !c.site_web) return false
      if (onlyLinkedin && !c.linkedin_url) return false
      return true
    })
  }, [companies, onlyPhone, onlyWeb, onlyLinkedin])

  const selectedCount = Object.values(selected).filter(Boolean).length

  const fetchPage = async (pageToFetch: number) => {
    const res = await fetch("/api/crm/internal/smart-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, page: pageToFetch }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error || "Erreur recherche")
    return json.data as {
      interpretation?: string
      companies?: CompanyPreview[]
      total?: number
      page?: number
    }
  }

  const search = async () => {
    if (!prompt.trim()) {
      toast({ title: "Saisissez une requête", variant: "destructive" })
      return
    }
    setLoading(true)
    setCompanies([])
    setSelected({})
    setInterpretation("")
    setPage(1)
    setTotal(0)
    try {
      const data = await fetchPage(1)
      setInterpretation(data.interpretation || "")
      setCompanies(data.companies || [])
      setTotal(data.total || 0)
      setPage(1)
      toast({
        title: "Consultation gratuite",
        description: `${data.total || data.companies?.length || 0} sociétés trouvées (aucun crédit consommé)`,
      })
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const next = page + 1
      const data = await fetchPage(next)
      const incoming = data.companies || []
      // Dédup sur apollo_id pour éviter les doublons entre pages
      setCompanies((prev) => {
        const seen = new Set(prev.map((c) => c.apollo_id).filter(Boolean))
        const merged = [...prev]
        for (const c of incoming) {
          if (c.apollo_id && seen.has(c.apollo_id)) continue
          merged.push(c)
        }
        return merged
      })
      setPage(next)
      if (typeof data.total === "number") setTotal(data.total)
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" })
    } finally {
      setLoadingMore(false)
    }
  }

  const keepSelection = async () => {
    const toKeep = filtered.filter((c, i) => selected[keyOf(c, i)])
    if (toKeep.length === 0) {
      toast({ title: "Aucune sélection", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/crm/internal/keep-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companies: toKeep }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Erreur enregistrement")
      const r = json.data
      toast({
        title: "Sélection enregistrée",
        description: `${r.companies_created} créées, ${r.companies_updated} mises à jour`,
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
    if (checked) filtered.forEach((c, i) => { next[keyOf(c, i)] = true })
    setSelected(next)
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2" style={{ color: NAVY }}>
          <Sparkles className="h-7 w-7" style={{ color: GOLD }} /> Recherche intelligente
        </h1>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" /> Maurice uniquement — décrivez votre cible, consultez gratuitement, gardez ce qui vous intéresse.
        </p>
      </div>

      <Card style={panelStyle}>
        <CardHeader><CardTitle className="text-base">Que cherchez-vous&nbsp;?</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="ex : hôtels 4-5 étoiles à Grand Baie de plus de 50 employés"
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
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              La consultation ne consomme aucun crédit Apollo. Les crédits ne sont utilisés que lors de l&apos;enrichissement d&apos;un contact.
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

      {companies.length > 0 && (
        <Card style={panelStyle}>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">
              Résultats ({filtered.length}/{companies.length}
              {total > companies.length ? ` sur ${total}` : ""})
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip active={onlyPhone} onClick={() => setOnlyPhone((v) => !v)} icon={Phone} label="Téléphone" />
              <FilterChip active={onlyWeb} onClick={() => setOnlyWeb((v) => !v)} icon={Globe} label="Site web" />
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
              {filtered.map((c, i) => {
                const k = keyOf(c, i)
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
                        <span className="font-semibold" style={{ color: NAVY }}>{c.nom}</span>
                        {c.industrie && <Badge variant="secondary" className="text-[10px]">{c.industrie}</Badge>}
                        {c.taille_effectif && <Badge variant="outline" className="text-[10px]">{c.taille_effectif}</Badge>}
                      </div>
                      {c.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.description}</p>
                      )}
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                        {c.ville && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{c.ville}</span>}
                        {c.telephone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.telephone}</span>}
                        {c.site_web && <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" />{c.site_web}</span>}
                        {c.linkedin_url && <span className="inline-flex items-center gap-1"><Linkedin className="h-3 w-3" />LinkedIn</span>}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>

            {companies.length < total && (
              <div className="flex justify-center mt-4">
                <Button
                  variant="outline"
                  onClick={loadMore}
                  disabled={loadingMore}
                  size="sm"
                >
                  {loadingMore ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  Voir plus ({companies.length}/{total})
                </Button>
              </div>
            )}
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
  icon: React.ComponentType<{ className?: string }>
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
      <Icon className="h-3 w-3" />
      {label}
    </button>
  )
}
