"use client"

/**
 * Page /client/pcm — Plan Comptable Mauricien ÉDITABLE par société.
 *
 * Distincte de /client/plan-comptable (référentiel global figé). Ici on
 * gère le PCM propre à la société active via les API /api/societes/{id}/pcm/.
 *   - Tableau des comptes par classe, recherche, filtre archivés
 *   - Initialisation PCM (template CORE + modules)
 *   - Création / archivage de comptes
 */

import { useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Loader2, BookOpen, Search, Plus, Archive, RefreshCw, Wand2,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

interface Compte {
  id: string
  numero: string
  numero_parent: string | null
  intitule: string
  intitule_custom: boolean
  classe: number
  type: string
  nature: string | null
  sens_normal: string
  lettrable: boolean
  obligatoire: boolean
  archive: boolean
  archive_reason: string | null
  template_source: string | null
  tags: string[]
}

const CLASSE_LABELS: Record<number, string> = {
  1: "Capitaux propres",
  2: "Immobilisations",
  3: "Stocks",
  4: "Tiers",
  5: "Trésorerie",
  6: "Charges",
  7: "Produits",
  8: "Spéciaux",
}

const MODULES = [
  { code: "module_gbc1", label: "GBC1 (Global Business)" },
  { code: "module_holding", label: "Holding (sociétés liées)" },
  { code: "module_b2b_tech", label: "B2B Tech / SaaS" },
  { code: "module_health_clinic", label: "Clinique / Médical" },
]

export default function PCMPage() {
  const { societeId } = useSocieteActive()
  const [comptes, setComptes] = useState<Compte[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [classeFilter, setClasseFilter] = useState<string>("all")
  const [showArchived, setShowArchived] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const [initOpen, setInitOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (classeFilter !== "all") params.set("classe", classeFilter)
      if (search) params.set("search", search)
      if (showArchived) params.set("include_archived", "true")
      const res = await fetch(`/api/societes/${societeId}/pcm/comptes?${params}`)
      const d = await res.json()
      if (!res.ok) { showToast(d?.error || "Erreur chargement", "error"); setComptes([]) }
      else setComptes(d.comptes || [])
    } catch {
      showToast("Erreur réseau", "error")
    } finally {
      setLoading(false)
    }
  }, [societeId, classeFilter, search, showArchived])

  useEffect(() => { load() }, [load])

  const byClasse = useMemo(() => {
    const m = new Map<number, Compte[]>()
    for (const c of comptes) {
      if (!m.has(c.classe)) m.set(c.classe, [])
      m.get(c.classe)!.push(c)
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0])
  }, [comptes])

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-6xl">
        {toast && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white ${toast.type === "success" ? "bg-emerald-600" : "bg-red-600"}`}>
            {toast.msg}
          </div>
        )}

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#0B0F2E] p-3 text-white"><BookOpen className="h-6 w-6" /></div>
            <div>
              <h1 className="text-2xl font-bold text-[#0B0F2E]">Plan Comptable (PCM)</h1>
              <p className="text-sm text-gray-500">Plan comptable mauricien éditable de la société</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setInitOpen(true)}>
              <Wand2 className="w-4 h-4 mr-2" /> Initialiser PCM
            </Button>
            <Button onClick={() => setCreateOpen(true)} className="bg-[#0B0F2E] text-white hover:bg-[#2a3a5a]">
              <Plus className="w-4 h-4 mr-2" /> Nouveau compte
            </Button>
          </div>
        </div>

        {/* Filtres */}
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input className="pl-9" placeholder="Rechercher numéro ou intitulé…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={classeFilter} onValueChange={setClasseFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les classes</SelectItem>
                {Object.entries(CLASSE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>Classe {k} — {v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <Checkbox checked={showArchived} onCheckedChange={(v) => setShowArchived(!!v)} />
              Afficher archivés
            </label>
            <Button variant="ghost" size="icon" onClick={load} title="Rafraîchir"><RefreshCw className="w-4 h-4" /></Button>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#0B0F2E]" /></div>
        ) : comptes.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-gray-500">
            Aucun compte. Cliquez sur « Initialiser PCM » pour appliquer le template CORE Maurice.
          </CardContent></Card>
        ) : (
          byClasse.map(([classe, list]) => (
            <Card key={classe}>
              <CardHeader className="py-3">
                <CardTitle className="text-base">Classe {classe} — {CLASSE_LABELS[classe]} <span className="text-gray-400 font-normal">({list.length})</span></CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <tbody>
                    {list.map(c => (
                      <tr key={c.id} className={`border-t ${c.archive ? "opacity-50" : ""}`}>
                        <td className="px-4 py-2 font-mono text-xs w-28">{c.numero}</td>
                        <td className="px-4 py-2">
                          {c.intitule}
                          {c.intitule_custom && <Badge variant="outline" className="ml-2 text-[10px]">custom</Badge>}
                          {c.obligatoire && <Badge variant="outline" className="ml-2 text-[10px] border-blue-300 text-blue-600">obligatoire</Badge>}
                          {c.lettrable && <Badge variant="outline" className="ml-2 text-[10px]">lettrable</Badge>}
                          {c.archive && <Badge variant="outline" className="ml-2 text-[10px] border-red-300 text-red-600">archivé</Badge>}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-400 w-32">{c.template_source}</td>
                        <td className="px-4 py-2 w-12 text-right">
                          {!c.archive && (
                            <ArchiveButton societeId={societeId || ""} numero={c.numero} onDone={(msg, ok) => { showToast(msg, ok ? "success" : "error"); if (ok) load() }} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <InitializeDialog open={initOpen} onClose={() => setInitOpen(false)} societeId={societeId || ""}
        onDone={(msg, ok) => { showToast(msg, ok ? "success" : "error"); if (ok) { setInitOpen(false); load() } }} />
      <CreateCompteDialog open={createOpen} onClose={() => setCreateOpen(false)} societeId={societeId || ""}
        onDone={(msg, ok) => { showToast(msg, ok ? "success" : "error"); if (ok) { setCreateOpen(false); load() } }} />
    </ClientPageShell>
  )
}

function ArchiveButton({ societeId, numero, onDone }: { societeId: string; numero: string; onDone: (m: string, ok: boolean) => void }) {
  const [busy, setBusy] = useState(false)
  const handle = async () => {
    const reason = prompt(`Raison de l'archivage du compte ${numero} ?`)
    if (!reason) return
    const target = prompt("Compte de reclassement des écritures (laisser vide si aucune écriture) ?") || undefined
    setBusy(true)
    try {
      const res = await fetch(`/api/societes/${societeId}/pcm/comptes/${encodeURIComponent(numero)}/archive`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, target_compte: target }),
      })
      const d = await res.json()
      if (!res.ok) onDone(d?.error || "Échec archivage", false)
      else onDone(`Compte ${numero} archivé${d.reclassed_ecritures ? ` (${d.reclassed_ecritures} écritures reclassées)` : ""}`, true)
    } finally { setBusy(false) }
  }
  return <Button variant="ghost" size="icon" onClick={handle} disabled={busy} title="Archiver"><Archive className="w-4 h-4 text-gray-400" /></Button>
}

function InitializeDialog({ open, onClose, societeId, onDone }: { open: boolean; onClose: () => void; societeId: string; onDone: (m: string, ok: boolean) => void }) {
  const [modules, setModules] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setModules(new Set()) }, [open])

  const handle = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/societes/${societeId}/pcm/initialize`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_code: "core_maurice", modules: [...modules] }),
      })
      const d = await res.json()
      if (!res.ok) onDone(d?.error || "Échec initialisation", false)
      else onDone(`PCM initialisé : ${d.comptes_created} comptes créés, ${d.comptes_skipped} ignorés`, true)
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Initialiser le PCM</DialogTitle>
          <DialogDescription>Applique le template CORE Maurice (76 comptes) + modules optionnels. Idempotent : ne crée pas de doublon.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Modules d'extension</Label>
          {MODULES.map(m => (
            <label key={m.code} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={modules.has(m.code)} onCheckedChange={(v) => {
                setModules(prev => { const n = new Set(prev); if (v) n.add(m.code); else n.delete(m.code); return n })
              }} />
              {m.label}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
          <Button onClick={handle} disabled={busy} className="bg-[#0B0F2E] text-white">
            {busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Initialiser
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreateCompteDialog({ open, onClose, societeId, onDone }: { open: boolean; onClose: () => void; societeId: string; onDone: (m: string, ok: boolean) => void }) {
  const [numero, setNumero] = useState("")
  const [intitule, setIntitule] = useState("")
  const [type, setType] = useState("charge")
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setNumero(""); setIntitule(""); setType("charge") } }, [open])

  const handle = async () => {
    if (!numero || !intitule) return onDone("Numéro et intitulé requis", false)
    const classe = Number(numero[0])
    setBusy(true)
    try {
      const res = await fetch(`/api/societes/${societeId}/pcm/comptes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero, intitule, classe, type }),
      })
      const d = await res.json()
      if (!res.ok) onDone(d?.error || "Échec création", false)
      else onDone(`Compte ${numero} créé`, true)
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau compte</DialogTitle>
          <DialogDescription>Sous-compte via pattern 4511.OCC (le parent 4511 doit exister).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Numéro</Label>
            <Input value={numero} onChange={e => setNumero(e.target.value.toUpperCase())} placeholder="ex: 706.SKYCALL" />
          </div>
          <div className="space-y-1">
            <Label>Intitulé</Label>
            <Input value={intitule} onChange={e => setIntitule(e.target.value)} placeholder="ex: Prestations SKYCALL" />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="actif">Actif</SelectItem>
                <SelectItem value="passif">Passif</SelectItem>
                <SelectItem value="charge">Charge</SelectItem>
                <SelectItem value="produit">Produit</SelectItem>
                <SelectItem value="mixte">Mixte</SelectItem>
                <SelectItem value="tresorerie">Trésorerie</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
          <Button onClick={handle} disabled={busy} className="bg-[#0B0F2E] text-white">
            {busy && <Loader2 className="w-4 h-4 animate-spin mr-2" />} Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
