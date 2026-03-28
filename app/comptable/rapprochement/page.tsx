"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCw, CheckCircle, AlertTriangle, Plus, GitMerge } from "lucide-react"

function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(n) }

export default function RapprochementBancairePage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [rapprochements, setRapprochements] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ periode_debut: "", periode_fin: "", solde_releve: "", banque: "MCB" })

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  const load = useCallback(async () => {
    if (!societe) return
    setLoading(true)
    const res = await fetch(`/api/comptable/rapprochement?societe_id=${societe}`)
    const d = await res.json()
    setRapprochements(d.rapprochements || [])
    setLoading(false)
  }, [societe])

  useEffect(() => { load() }, [load])

  const creer = async () => {
    if (!societe || !form.periode_debut || !form.periode_fin || !form.solde_releve) return
    setCreating(true)
    const res = await fetch("/api/comptable/rapprochement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "creer", societe_id: societe, ...form, solde_releve: parseFloat(form.solde_releve) })
    })
    const d = await res.json()
    setCreating(false)
    setShowNew(false)
    setForm({ periode_debut: "", periode_fin: "", solde_releve: "", banque: "MCB" })
    load()
    if (d.ecart !== undefined) {
      alert(`Rapprochement créé. Écart: ${fmt(d.rapprochement?.ecart || 0)} MUR\nSolde relevé: ${fmt(d.rapprochement?.solde_releve)} | Solde comptable: ${fmt(d.solde_comptable)}`)
    }
  }

  const valider = async (id: string) => {
    await fetch("/api/comptable/rapprochement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "valider", rapprochement_id: id }) })
    load()
  }

  const lancerLettrage = async () => {
    if (!societe) return
    // Récupérer le dossier de la société
    const res = await fetch(`/api/comptable/lettrage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "auto", societe_id: societe })
    })
    const d = await res.json()
    alert(d.message || `${d.nb_lettres} écritures lettrées`)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Rapprochement bancaire</h1>
          <p className="text-sm text-gray-500">Vérification solde relevé ↔ grand livre comptable</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={lancerLettrage} disabled={!societe} className="gap-1">
            <GitMerge className="w-4 h-4"/>Lettrage auto
          </Button>
          <Button onClick={() => setShowNew(!showNew)} className="bg-[#1E2A4A] text-white gap-1">
            <Plus className="w-4 h-4"/>Nouveau rapprochement
          </Button>
        </div>
      </div>

      {/* Sélection société */}
      <div className="flex gap-4 items-end">
        <div className="w-72">
          <Label>Société</Label>
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger><SelectValue placeholder="Choisir une société..."/></SelectTrigger>
            <SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {societe && <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="w-4 h-4"/></Button>}
      </div>

      {/* Formulaire nouveau rapprochement */}
      {showNew && (
        <Card className="border-[#1E2A4A]/20">
          <CardHeader><CardTitle className="text-[#1E2A4A] text-base">Nouveau rapprochement</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-4 gap-4">
            <div>
              <Label>Période début *</Label>
              <Input type="date" value={form.periode_debut} onChange={e => setForm({...form, periode_debut: e.target.value})}/>
            </div>
            <div>
              <Label>Période fin *</Label>
              <Input type="date" value={form.periode_fin} onChange={e => setForm({...form, periode_fin: e.target.value})}/>
            </div>
            <div>
              <Label>Solde relevé banque (MUR) *</Label>
              <Input type="number" step="0.01" placeholder="0.00" value={form.solde_releve} onChange={e => setForm({...form, solde_releve: e.target.value})}/>
            </div>
            <div>
              <Label>Banque</Label>
              <Select value={form.banque} onValueChange={v => setForm({...form, banque: v})}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  {["MCB","SBM","AfrAsia","BNI","HSBC","Standard Bank"].map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-4 flex gap-2">
              <Button onClick={creer} disabled={creating} className="bg-[#1E2A4A] text-white">
                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : null}Créer le rapprochement
              </Button>
              <Button variant="outline" onClick={() => setShowNew(false)}>Annuler</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Liste rapprochements */}
      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-[#1E2A4A]"/></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Période</TableHead>
                  <TableHead>Banque</TableHead>
                  <TableHead className="text-right">Solde relevé</TableHead>
                  <TableHead className="text-right">Solde comptable</TableHead>
                  <TableHead className="text-right">Écart</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rapprochements.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">
                      {new Date(r.periode_debut).toLocaleDateString("fr-FR")} → {new Date(r.periode_fin).toLocaleDateString("fr-FR")}
                    </TableCell>
                    <TableCell>{r.banque || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.solde_releve)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.solde_comptable)}</TableCell>
                    <TableCell className={`text-right font-mono font-semibold ${Math.abs(r.ecart) < 0.01 ? "text-green-600" : "text-red-600"}`}>
                      {Math.abs(r.ecart) < 0.01 ? "✓ 0.00" : fmt(r.ecart)}
                    </TableCell>
                    <TableCell>
                      <Badge className={r.statut === 'valide' ? "bg-green-100 text-green-700" : r.ecart === 0 ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}>
                        {r.statut === 'valide' ? <><CheckCircle className="w-3 h-3 mr-1"/>Validé</> : r.ecart === 0 ? "Équilibré" : <><AlertTriangle className="w-3 h-3 mr-1"/>Écart</>}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.statut !== 'valide' && (
                        <Button size="sm" variant="outline" onClick={() => valider(r.id)} className="h-7 text-xs">
                          <CheckCircle className="w-3 h-3 mr-1"/>Valider
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!rapprochements.length && (
                  <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-8">
                    {societe ? "Aucun rapprochement pour cette société" : "Sélectionnez une société"}
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Info Lettrage */}
      {societe && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-blue-800 mb-1">💡 Lettrage automatique</p>
            <p className="text-xs text-blue-700">
              Le lettrage associe automatiquement les débits et crédits du même montant sur les comptes de tiers (comptes 4xx).
              Cliquez sur <strong>Lettrage auto</strong> pour lettrer les écritures non lettrées.
              Le délettrage est disponible via l'API.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
