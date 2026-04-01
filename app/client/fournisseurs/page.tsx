"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Search, Plus, Loader2, Users, ShoppingCart, FileText, Clock, ArrowUpDown, Building2, Tag, PercentIcon } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

// ── Types ──
interface Facture {
  id: string; tiers: string | null; date_facture: string; date_echeance: string | null
  devise: string; montant_ht: number; montant_tva: number; montant_ttc: number
  montant_mur: number; statut: string; type_facture: string
}

interface CategoryDef {
  compte: string; label: string; color: string; keywords: string[]
}

interface FournisseurRow {
  nom: string; categorie: string; nbFactures: number
  totalHT: number; totalTVA: number; totalTTC: number
  devise: string; derniereFacture: string; statut: string
}

// ── Constants ──
const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

const CATEGORIES: CategoryDef[] = [
  { compte: "612", label: "Loyer & charges locatives", color: "bg-blue-100 text-blue-800 border-blue-200", keywords: ["loyer", "rent", "mwpi", "mw prop", "bail"] },
  { compte: "622", label: "Honoraires", color: "bg-purple-100 text-purple-800 border-purple-200", keywords: ["honoraire", "comptable", "avocat", "consultant", "2e2j", "e2j", "magellan"] },
  { compte: "626", label: "Telecom & Internet", color: "bg-cyan-100 text-cyan-800 border-cyan-200", keywords: ["telecom", "internet", "ceb", "emtel", "mtml", "orange", "telephone"] },
  { compte: "627", label: "Frais bancaires", color: "bg-red-100 text-red-800 border-red-200", keywords: ["banque", "bank", "commission", "fee", "charge", "frais bancaire"] },
  { compte: "651", label: "SaaS & Logiciels", color: "bg-violet-100 text-violet-800 border-violet-200", keywords: ["saas", "openai", "vercel", "supabase", "aws", "github", "anthropic", "stripe", "adobe", "zoom", "slack", "wati", "microsoft"] },
  { compte: "623", label: "Marketing & Publicite", color: "bg-pink-100 text-pink-800 border-pink-200", keywords: ["marketing", "publicite", "meta", "facebook", "google ads"] },
  { compte: "624", label: "Transport & Deplacements", color: "bg-amber-100 text-amber-800 border-amber-200", keywords: ["transport", "uber", "bolt", "carburant", "taxi", "parking"] },
  { compte: "616", label: "Assurances", color: "bg-emerald-100 text-emerald-800 border-emerald-200", keywords: ["assurance", "insurance"] },
  { compte: "606", label: "Fournitures de bureau", color: "bg-orange-100 text-orange-800 border-orange-200", keywords: ["fourniture", "bureau", "papier", "cartouche"] },
  { compte: "602", label: "Pharmacie / Medical", color: "bg-teal-100 text-teal-800 border-teal-200", keywords: ["pharmacie", "medical", "medicament"] },
  { compte: "611", label: "Sous-traitance", color: "bg-indigo-100 text-indigo-800 border-indigo-200", keywords: ["sous-traitance", "outsourcing", "prestation"] },
  { compte: "628", label: "Charges diverses", color: "bg-gray-100 text-gray-700 border-gray-200", keywords: [] },
]

const LS_KEY = "lexora_fournisseur_categories"

function getOverrides(): Record<string, string> {
  if (typeof window === "undefined") return {}
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}") } catch { return {} }
}
function saveOverrides(m: Record<string, string>) {
  localStorage.setItem(LS_KEY, JSON.stringify(m))
}

function autoClassify(nom: string): string {
  const lower = nom.toLowerCase()
  for (const cat of CATEGORIES) {
    if (cat.keywords.some(kw => lower.includes(kw))) return cat.compte
  }
  return "628"
}

function classifyFournisseur(nom: string, overrides: Record<string, string>): string {
  if (overrides[nom]) return overrides[nom]
  return autoClassify(nom)
}

function getCategoryDef(compte: string): CategoryDef {
  return CATEGORIES.find(c => c.compte === compte) || CATEGORIES[CATEGORIES.length - 1]
}

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtDec(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

type SortKey = "nom" | "totalTTC" | "categorie" | "nbFactures"

export default function ClientFournisseursPage() {
  const { profile } = useProfile()
  const [factures, setFactures] = useState<Facture[]>([])
  const [loading, setLoading] = useState(true)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [search, setSearch] = useState("")
  const [filterCat, setFilterCat] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>("totalTTC")
  const [sortAsc, setSortAsc] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newForm, setNewForm] = useState({ nom: "", adresse: "", email: "", tel: "", tva: "", cat: "628" })
  const [suggestedCat, setSuggestedCat] = useState<string | null>(null)
  const [societes, setSocietes] = useState<any[]>([])
  const [selectedSociete, setSelectedSociete] = useState("all")

  // Load overrides from localStorage
  useEffect(() => { setOverrides(getOverrides()) }, [])

  // Fetch sociétés + data
  useEffect(() => {
    async function load() {
      try {
        const url = selectedSociete !== "all"
          ? `/api/client/financial?societe_id=${selectedSociete}`
          : "/api/client/financial"
        const res = await fetch(url)
        if (!res.ok) throw new Error("fetch failed")
        const json = await res.json()
        if (json.financial?.availableSocietes) setSocietes(json.financial.availableSocietes)
        const all: Facture[] = (json.financial?.factures || [])
          .filter((f: Facture) => f.type_facture === "fournisseur")
        setFactures(all)
      } catch (e) {
        console.error("Failed to load fournisseur data", e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [selectedSociete])

  // Group factures by fournisseur
  const fournisseurs = useMemo(() => {
    const map = new Map<string, FournisseurRow>()
    for (const f of factures) {
      const nom = (f.tiers || "Inconnu").trim()
      const cat = classifyFournisseur(nom, overrides)
      const existing = map.get(nom)
      if (existing) {
        existing.nbFactures++
        existing.totalHT += Number(f.montant_ht) || 0
        existing.totalTVA += Number(f.montant_tva) || 0
        existing.totalTTC += Number(f.montant_mur) || Number(f.montant_ttc) || 0
        if (f.date_facture > existing.derniereFacture) {
          existing.derniereFacture = f.date_facture
          existing.devise = f.devise || "MUR"
        }
        if (f.statut === "retard" || f.statut === "en_attente") existing.statut = f.statut
        existing.categorie = cat
      } else {
        map.set(nom, {
          nom, categorie: cat, nbFactures: 1,
          totalHT: Number(f.montant_ht) || 0,
          totalTVA: Number(f.montant_tva) || 0,
          totalTTC: Number(f.montant_mur) || Number(f.montant_ttc) || 0,
          devise: f.devise || "MUR",
          derniereFacture: f.date_facture || "",
          statut: f.statut || "en_attente",
        })
      }
    }
    return Array.from(map.values())
  }, [factures, overrides])

  // KPIs
  const now = new Date()
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  const currentFYStart = now.getMonth() >= 6
    ? `${now.getFullYear()}-07-01`
    : `${now.getFullYear() - 1}-07-01`

  const totalFournisseurs = fournisseurs.length
  const totalAchatsMois = factures
    .filter(f => f.date_facture?.startsWith(currentMonthStr))
    .reduce((s, f) => s + (Number(f.montant_mur) || Number(f.montant_ttc) || 0), 0)
  const totalAchatsExercice = factures
    .filter(f => f.date_facture >= currentFYStart)
    .reduce((s, f) => s + (Number(f.montant_mur) || Number(f.montant_ttc) || 0), 0)
  const nbEnAttente = factures.filter(f => f.statut === "en_attente" || f.statut === "retard").length

  // Category stats
  const catStats = useMemo(() => {
    const totalAll = fournisseurs.reduce((s, f) => s + f.totalTTC, 0)
    return CATEGORIES.map(cat => {
      const items = fournisseurs.filter(f => f.categorie === cat.compte)
      const total = items.reduce((s, f) => s + f.totalTTC, 0)
      const nbFact = items.reduce((s, f) => s + f.nbFactures, 0)
      const pct = totalAll > 0 ? (total / totalAll) * 100 : 0
      return { ...cat, total, nbFactures: nbFact, pct, nbFournisseurs: items.length }
    }).filter(c => c.total > 0 || c.nbFournisseurs > 0)
  }, [fournisseurs])

  // Filtered + sorted table
  const filteredRows = useMemo(() => {
    let rows = [...fournisseurs]
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(r => r.nom.toLowerCase().includes(q))
    }
    if (filterCat) {
      rows = rows.filter(r => r.categorie === filterCat)
    }
    rows.sort((a, b) => {
      let cmp = 0
      if (sortKey === "nom") cmp = a.nom.localeCompare(b.nom)
      else if (sortKey === "totalTTC") cmp = a.totalTTC - b.totalTTC
      else if (sortKey === "categorie") cmp = a.categorie.localeCompare(b.categorie)
      else if (sortKey === "nbFactures") cmp = a.nbFactures - b.nbFactures
      return sortAsc ? cmp : -cmp
    })
    return rows
  }, [fournisseurs, search, filterCat, sortKey, sortAsc])

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortAsc(p => !p)
    else { setSortKey(key); setSortAsc(false) }
  }, [sortKey])

  const handleCategoryChange = useCallback((nom: string, newCompte: string) => {
    const updated = { ...overrides, [nom]: newCompte }
    setOverrides(updated)
    saveOverrides(updated)
  }, [overrides])

  const handleNewNomChange = useCallback((v: string) => {
    const detected = autoClassify(v)
    setSuggestedCat(detected !== "628" ? detected : null)
    setNewForm(p => ({ ...p, nom: v, ...(detected !== "628" ? { cat: detected } : {}) }))
  }, [])

  const handleSaveFournisseur = useCallback(() => {
    if (!newForm.nom.trim()) return
    const updated = { ...overrides, [newForm.nom.trim()]: newForm.cat }
    setOverrides(updated); saveOverrides(updated)
    try {
      const contacts = JSON.parse(localStorage.getItem("lexora_fournisseur_contacts") || "[]")
      contacts.push({ nom: newForm.nom.trim(), adresse: newForm.adresse, email: newForm.email, telephone: newForm.tel, tva: newForm.tva, categorie: newForm.cat, created: new Date().toISOString() })
      localStorage.setItem("lexora_fournisseur_contacts", JSON.stringify(contacts))
    } catch { /* ignore */ }
    setDialogOpen(false)
    setNewForm({ nom: "", adresse: "", email: "", tel: "", tva: "", cat: "628" }); setSuggestedCat(null)
  }, [newForm, overrides])

  function getStatutBadge(statut: string) {
    switch (statut) {
      case "paye": return <Badge className="bg-green-100 text-green-700 border-green-200">Paye</Badge>
      case "en_attente": return <Badge className="bg-orange-100 text-orange-700 border-orange-200">En attente</Badge>
      case "retard": return <Badge className="bg-red-100 text-red-700 border-red-200">En retard</Badge>
      default: return <Badge variant="secondary">{statut || "---"}</Badge>
    }
  }

  if (profile?.role === "client_user") {
    return (
      <div className="p-6">
        <Card><CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Vous n&apos;avez pas acces a cette section.</p>
          <Link href="/client" className="text-sm underline mt-4 inline-block" style={{ color: GOLD }}>
            Retour au tableau de bord
          </Link>
        </CardContent></Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: NAVY }} />
        <span className="ml-3 text-muted-foreground">Chargement des fournisseurs...</span>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
            Gestion des fournisseurs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Classification automatique et suivi des achats par categorie comptable
          </p>
        </div>
        <div className="flex items-center gap-2">
          {societes.length > 1 && (
            <Select value={selectedSociete} onValueChange={setSelectedSociete}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les sociétés</SelectItem>
                {societes.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        <Button
          onClick={() => setDialogOpen(true)}
          style={{ backgroundColor: NAVY }}
          className="text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Ajouter un fournisseur
        </Button>
        </div>
      </div>

      {/* SECTION 1 - KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4" style={{ borderLeftColor: NAVY }}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: NAVY + "12" }}>
                <Users className="h-5 w-5" style={{ color: NAVY }} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total fournisseurs</p>
                <p className="text-2xl font-bold" style={{ color: NAVY }}>{totalFournisseurs}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4" style={{ borderLeftColor: GOLD }}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: GOLD + "18" }}>
                <ShoppingCart className="h-5 w-5" style={{ color: GOLD }} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Achats ce mois</p>
                <p className="text-2xl font-bold" style={{ color: NAVY }}>{fmt(totalAchatsMois)} MUR</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4" style={{ borderLeftColor: "#3B82F6" }}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Achats cet exercice</p>
                <p className="text-2xl font-bold" style={{ color: NAVY }}>{fmt(totalAchatsExercice)} MUR</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4" style={{ borderLeftColor: "#F59E0B" }}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Factures en attente</p>
                <p className="text-2xl font-bold" style={{ color: NAVY }}>{nbEnAttente}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SECTION 2 - Classification par categorie */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold" style={{ color: NAVY }}>
            Classification par categorie comptable
          </h2>
          {filterCat && (
            <Button variant="ghost" size="sm" onClick={() => setFilterCat(null)} className="text-xs">
              Effacer le filtre
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {catStats.map(cat => (
            <Card
              key={cat.compte}
              className={`cursor-pointer transition-all hover:shadow-md ${filterCat === cat.compte ? "ring-2" : ""}`}
              style={filterCat === cat.compte ? { ringColor: GOLD, borderColor: GOLD } : {}}
              onClick={() => setFilterCat(filterCat === cat.compte ? null : cat.compte)}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between mb-2">
                  <Badge className={cat.color}>{cat.compte}</Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <PercentIcon className="h-3 w-3" />
                    {cat.pct.toFixed(1)}%
                  </span>
                </div>
                <p className="text-sm font-semibold truncate" style={{ color: NAVY }}>{cat.label}</p>
                <p className="text-lg font-bold mt-1" style={{ color: NAVY }}>{fmt(cat.total)} MUR</p>
                <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                  <span>{cat.nbFactures} facture{cat.nbFactures > 1 ? "s" : ""}</span>
                  <span>{cat.nbFournisseurs} fournisseur{cat.nbFournisseurs > 1 ? "s" : ""}</span>
                </div>
                {/* Progress bar showing % of total */}
                <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(cat.pct, 100)}%`, backgroundColor: GOLD }}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
          {catStats.length === 0 && (
            <div className="col-span-full text-center py-8 text-muted-foreground">
              Aucune depense fournisseur enregistree.
            </div>
          )}
        </div>
      </div>

      {/* SECTION 3 - Table fournisseurs */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle style={{ color: NAVY }}>
              Fournisseurs ({filteredRows.length})
              {filterCat && (
                <Badge className="ml-2" style={{ backgroundColor: GOLD + "20", color: GOLD, borderColor: GOLD }}>
                  {getCategoryDef(filterCat).label}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un fournisseur..."
                  className="pl-9 w-64"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <Select value={filterCat || "all"} onValueChange={v => setFilterCat(v === "all" ? null : v)}>
                <SelectTrigger className="w-48">
                  <Tag className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Categorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les categories</SelectItem>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.compte} value={c.compte}>{c.compte} - {c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("nom")}>
                    <span className="flex items-center gap-1">
                      Fournisseur <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("categorie")}>
                    <span className="flex items-center gap-1">
                      Categorie <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none text-center" onClick={() => handleSort("nbFactures")}>
                    <span className="flex items-center justify-center gap-1">
                      Factures <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </TableHead>
                  <TableHead className="text-right">Total HT</TableHead>
                  <TableHead className="text-right">Total TVA</TableHead>
                  <TableHead className="cursor-pointer select-none text-right" onClick={() => handleSort("totalTTC")}>
                    <span className="flex items-center justify-end gap-1">
                      Total TTC <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </TableHead>
                  <TableHead>Devise</TableHead>
                  <TableHead>Derniere facture</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Changer categorie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map(row => {
                  const catDef = getCategoryDef(row.categorie)
                  return (
                    <TableRow key={row.nom}>
                      <TableCell className="font-medium" style={{ color: NAVY }}>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          {row.nom}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={catDef.color}>
                          {catDef.compte} {catDef.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{row.nbFactures}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtDec(row.totalHT)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtDec(row.totalTVA)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{fmtDec(row.totalTTC)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.devise || "MUR"}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{row.derniereFacture || "---"}</TableCell>
                      <TableCell>{getStatutBadge(row.statut)}</TableCell>
                      <TableCell>
                        <Select
                          value={row.categorie}
                          onValueChange={v => handleCategoryChange(row.nom, v)}
                        >
                          <SelectTrigger className="w-40 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map(c => (
                              <SelectItem key={c.compte} value={c.compte}>
                                {c.compte} - {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      {search || filterCat
                        ? "Aucun fournisseur ne correspond aux criteres de recherche."
                        : "Aucun fournisseur enregistre. Les fournisseurs apparaitront apres import de factures."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* SECTION 4 - Dialog: Ajouter un fournisseur */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle style={{ color: NAVY }}>Ajouter un fournisseur</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="fn-nom">Nom du fournisseur</Label>
              <Input id="fn-nom" value={newForm.nom} onChange={e => handleNewNomChange(e.target.value)} placeholder="Ex: EMTEL, AWS, MWPI..." />
              {suggestedCat && (
                <p className="text-xs mt-1 flex items-center gap-1" style={{ color: GOLD }}>
                  <Tag className="h-3 w-3" />
                  Suggestion : {getCategoryDef(suggestedCat).compte} - {getCategoryDef(suggestedCat).label}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="fn-adresse">Adresse</Label>
              <Input id="fn-adresse" value={newForm.adresse} onChange={e => setNewForm(p => ({ ...p, adresse: e.target.value }))} placeholder="Adresse" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="fn-email">Email</Label>
                <Input id="fn-email" type="email" value={newForm.email} onChange={e => setNewForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" />
              </div>
              <div>
                <Label htmlFor="fn-tel">Telephone</Label>
                <Input id="fn-tel" value={newForm.tel} onChange={e => setNewForm(p => ({ ...p, tel: e.target.value }))} placeholder="+230 xxx xxxx" />
              </div>
            </div>
            <div>
              <Label htmlFor="fn-tva">N. TVA</Label>
              <Input id="fn-tva" value={newForm.tva} onChange={e => setNewForm(p => ({ ...p, tva: e.target.value }))} placeholder="Numero TVA" />
            </div>
            <div>
              <Label htmlFor="fn-cat">Categorie comptable</Label>
              <Select value={newForm.cat} onValueChange={v => setNewForm(p => ({ ...p, cat: v }))}>
                <SelectTrigger id="fn-cat"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (<SelectItem key={c.compte} value={c.compte}>{c.compte} - {c.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleSaveFournisseur} disabled={!newForm.nom.trim()} style={{ backgroundColor: NAVY }} className="text-white hover:opacity-90">
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
