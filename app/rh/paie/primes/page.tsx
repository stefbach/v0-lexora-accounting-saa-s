"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Plus, CheckCircle, Pencil, Trash2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"

const TYPE_PRIME_LABELS: Record<string, string> = {
  fixe: "💰 Fixe",
  variable_unitaire: "📊 Variable par unité",
  bonus_objectif: "🎯 Bonus objectif",
  pourcentage: "📈 % Salaire",
  commission: "🤝 Commission",
}

const STATUT_COLORS: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-700",
  approuve: "bg-green-100 text-green-700",
  integre: "bg-blue-100 text-blue-700",
}

function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " MUR" }

export default function PrimesPage() {
  const [tab, setTab] = useState<"catalogue" | "saisie">("catalogue")
  const [societes, setSocietes] = useState<any[]>([])
  const [employes, setEmployes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [periode, setPeriode] = useState(new Date().toISOString().slice(0, 7))
  const [catalogue, setCatalogue] = useState<any[]>([])
  const [saisies, setSaisies] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Dialog nouvelle prime catalogue
  const [catDialog, setCatDialog] = useState(false)
  const [catForm, setCatForm] = useState({ code: "", libelle: "", type_prime: "fixe", montant_fixe: "", montant_par_unite: "", unite: "", pourcentage: "", bonus_objectif_montant: "", periode_application: "mensuel", postes_eligibles: "" })
  const [catError, setCatError] = useState<string | null>(null)

  // Dialog saisie prime
  const [saisieDialog, setSaisieDialog] = useState(false)
  const [saisieForm, setSaisieForm] = useState({ employe_id: "", prime_id: "", quantite: "", notes: "" })
  const [saisieCalc, setSaisieCalc] = useState<number | null>(null)
  const [saisieError, setSaisieError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  useEffect(() => {
    if (societe !== "all") {
      fetch(`/api/rh/employes?societe_id=${societe}`).then(r => r.json()).then(d => setEmployes(d.employes || []))
    }
  }, [societe])

  const loadCatalogue = useCallback(async () => {
    setLoading(true)
    try {
      const params = societe !== "all" ? `?societe_id=${societe}&type=catalogue` : "?type=catalogue"
      const data = await fetch(`/api/rh/primes${params}`).then(r => r.json())
      setCatalogue(data.primes || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [societe])

  const loadSaisies = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ periode, type: "saisie" })
      if (societe !== "all") params.set("societe_id", societe)
      const data = await fetch(`/api/rh/primes?${params}`).then(r => r.json())
      setSaisies(data.primes || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [societe, periode])

  useEffect(() => {
    if (tab === "catalogue") loadCatalogue()
    else loadSaisies()
  }, [tab, loadCatalogue, loadSaisies])

  const creerCatalogue = async () => {
    if (!catForm.libelle || !catForm.type_prime) { setCatError("Libellé et type requis"); return }
    setSaving(true); setCatError(null)
    try {
      const res = await fetch("/api/rh/primes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "creer_catalogue", ...catForm, societe_id: societe !== "all" ? societe : null, montant_fixe: catForm.montant_fixe ? Number(catForm.montant_fixe) : null, montant_par_unite: catForm.montant_par_unite ? Number(catForm.montant_par_unite) : null, pourcentage: catForm.pourcentage ? Number(catForm.pourcentage) : null, bonus_objectif_montant: catForm.bonus_objectif_montant ? Number(catForm.bonus_objectif_montant) : null })
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setCatDialog(false)
      setCatForm({ code: "", libelle: "", type_prime: "fixe", montant_fixe: "", montant_par_unite: "", unite: "", pourcentage: "", bonus_objectif_montant: "", periode_application: "mensuel", postes_eligibles: "" })
      loadCatalogue()
    } catch (e: unknown) { setCatError(e instanceof Error ? e.message : "Erreur") }
    finally { setSaving(false) }
  }

  const toggleActif = async (id: string, actif: boolean) => {
    await fetch(`/api/rh/primes/${id}?type=catalogue`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "catalogue", actif }) })
    loadCatalogue()
  }

  // Calculer montant en temps réel
  useEffect(() => {
    if (!saisieForm.prime_id) { setSaisieCalc(null); return }
    const prime = catalogue.find(p => p.id === saisieForm.prime_id)
    if (!prime) return
    let calc: number | null = null
    switch (prime.type_prime) {
      case "fixe": calc = prime.montant_fixe || 0; break
      case "variable_unitaire": case "commission":
        calc = Number(saisieForm.quantite || 0) * (prime.montant_par_unite || 0)
        break
      case "bonus_objectif": calc = prime.bonus_objectif_montant || 0; break
      case "pourcentage": {
        const emp = employes.find(e => e.id === saisieForm.employe_id)
        if (emp) calc = Math.round(Number(emp.salaire_base || 0) * ((prime.pourcentage || 0) / 100) * 100) / 100
        break
      }
    }
    setSaisieCalc(calc)
  }, [saisieForm.prime_id, saisieForm.quantite, saisieForm.employe_id, catalogue, employes])

  const saisirPrime = async () => {
    if (!saisieForm.employe_id || !saisieForm.prime_id) { setSaisieError("Employé et prime requis"); return }
    setSaving(true); setSaisieError(null)
    try {
      const res = await fetch("/api/rh/primes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saisir", ...saisieForm, periode, quantite: saisieForm.quantite ? Number(saisieForm.quantite) : null, societe_id: societe !== "all" ? societe : null })
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setSaisieDialog(false)
      setSaisieForm({ employe_id: "", prime_id: "", quantite: "", notes: "" })
      loadSaisies()
    } catch (e: unknown) { setSaisieError(e instanceof Error ? e.message : "Erreur") }
    finally { setSaving(false) }
  }

  const approuverPrime = async (id: string) => {
    await fetch("/api/rh/primes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approuver", id }) })
    loadSaisies()
  }

  const totalSaisies = saisies.filter(s => s.approuve).reduce((sum, s) => sum + Number(s.montant || 0), 0)

  const primeSelectionnee = catalogue.find(p => p.id === saisieForm.prime_id)

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Primes & Bonus</h1>
          <p className="text-sm text-gray-500">Catalogue + saisie mensuelle → intégration automatique dans la paie</p>
        </div>
        <div className="flex gap-3 items-center">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Société" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes sociétés</SelectItem>
              {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { id: "catalogue", label: "📋 Catalogue des primes" },
          { id: "saisie", label: "✏️ Saisie du mois" },
        ] as { id: "catalogue" | "saisie"; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? "border-[#1E2A4A] text-[#1E2A4A]" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* CATALOGUE */}
      {tab === "catalogue" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-[#1E2A4A]">Catalogue primes ({catalogue.filter(p => p.actif !== false).length} actives)</CardTitle>
              <Button onClick={() => setCatDialog(true)} className="bg-[#1E2A4A] text-white">
                <Plus className="w-4 h-4 mr-2" />Nouvelle prime
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
              : catalogue.length === 0 ? <div className="text-center py-12 text-gray-500">Aucune prime dans le catalogue</div>
              : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead><TableHead>Libellé</TableHead>
                      <TableHead>Type</TableHead><TableHead>Valeur</TableHead>
                      <TableHead>Période</TableHead><TableHead>Actif</TableHead><TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catalogue.map(p => (
                      <TableRow key={p.id} className={p.actif === false ? "opacity-50" : ""}>
                        <TableCell className="font-mono text-sm">{p.code}</TableCell>
                        <TableCell className="font-medium">{p.libelle}</TableCell>
                        <TableCell><span className="text-sm">{TYPE_PRIME_LABELS[p.type_prime] || p.type_prime}</span></TableCell>
                        <TableCell className="text-sm">
                          {p.type_prime === "fixe" && `${fmt(p.montant_fixe || 0)}`}
                          {p.type_prime === "variable_unitaire" && `${fmt(p.montant_par_unite || 0)} / ${p.unite || "unité"}`}
                          {p.type_prime === "bonus_objectif" && `${fmt(p.bonus_objectif_montant || 0)}`}
                          {p.type_prime === "pourcentage" && `${p.pourcentage}% du brut`}
                          {p.type_prime === "commission" && `${fmt(p.montant_par_unite || 0)} / ${p.unite || "vente"}`}
                        </TableCell>
                        <TableCell className="text-sm text-gray-500 capitalize">{p.periode_application}</TableCell>
                        <TableCell>
                          <Switch checked={p.actif !== false} onCheckedChange={v => toggleActif(p.id, v)} />
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Modifier">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
          </CardContent>
        </Card>
      )}

      {/* SAISIE */}
      {tab === "saisie" && (
        <div className="space-y-4">
          <div className="flex gap-3 items-center">
            <Input type="month" value={periode} onChange={e => setPeriode(e.target.value)} className="w-36" />
            <Button onClick={loadSaisies} variant="outline">Afficher</Button>
            <div className="ml-auto flex items-center gap-3">
              {totalSaisies > 0 && (
                <div className="bg-green-50 border border-green-200 px-4 py-2 rounded-lg text-sm">
                  Total approuvé : <strong className="text-green-700">{fmt(totalSaisies)}</strong>
                </div>
              )}
              <Button onClick={() => setSaisieDialog(true)} disabled={societe === "all"} className="bg-[#1E2A4A] text-white">
                <Plus className="w-4 h-4 mr-2" />Saisir une prime
              </Button>
            </div>
          </div>

          {societe === "all" && <p className="text-sm text-gray-500">Sélectionnez une société pour saisir des primes</p>}

          <Card>
            <CardHeader><CardTitle className="text-[#1E2A4A]">Primes de {periode} ({saisies.length})</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
                : saisies.length === 0 ? <div className="text-center py-12 text-gray-500">Aucune prime saisie pour cette période</div>
                : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employé</TableHead><TableHead>Prime</TableHead>
                        <TableHead>Quantité</TableHead><TableHead className="text-right">Montant</TableHead>
                        <TableHead>Notes</TableHead><TableHead>Statut</TableHead><TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {saisies.map(s => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.employe?.prenom} {s.employe?.nom}</TableCell>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium">{s.prime?.libelle}</p>
                              <p className="text-xs text-gray-400">{TYPE_PRIME_LABELS[s.prime?.type_prime] || ""}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{s.quantite || "—"}</TableCell>
                          <TableCell className="text-right font-semibold text-[#1E2A4A]">{fmt(s.montant || 0)}</TableCell>
                          <TableCell className="text-sm text-gray-500 max-w-32 truncate">{s.notes || "—"}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${s.integre_paie ? "bg-blue-100 text-blue-700" : s.approuve ? STATUT_COLORS.approuve : STATUT_COLORS.brouillon}`}>
                              {s.integre_paie ? "✓ Intégré paie" : s.approuve ? "✓ Approuvé" : "Brouillon"}
                            </span>
                          </TableCell>
                          <TableCell>
                            {!s.approuve && (
                              <Button size="sm" variant="ghost" className="text-green-600 h-7" onClick={() => approuverPrime(s.id)}>
                                <CheckCircle className="w-4 h-4 mr-1" />Approuver
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dialog nouvelle prime catalogue */}
      <Dialog open={catDialog} onOpenChange={open => !open && setCatDialog(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nouvelle prime — Catalogue</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2 max-h-[70vh] overflow-y-auto pr-2">
            {catError && <p className="text-sm text-red-600">{catError}</p>}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Code (auto si vide)</Label><Input value={catForm.code} onChange={e => setCatForm(f => ({ ...f, code: e.target.value }))} placeholder="PRM-001" /></div>
              <div><Label>Période</Label>
                <Select value={catForm.periode_application} onValueChange={v => setCatForm(f => ({ ...f, periode_application: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensuel">Mensuel</SelectItem>
                    <SelectItem value="trimestriel">Trimestriel</SelectItem>
                    <SelectItem value="annuel">Annuel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Libellé *</Label><Input value={catForm.libelle} onChange={e => setCatForm(f => ({ ...f, libelle: e.target.value }))} placeholder="Ex: Prime consultation TIBOK" /></div>
            <div><Label>Type *</Label>
              <Select value={catForm.type_prime} onValueChange={v => setCatForm(f => ({ ...f, type_prime: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_PRIME_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {catForm.type_prime === "fixe" && (
              <div><Label>Montant mensuel (MUR)</Label><Input type="number" value={catForm.montant_fixe} onChange={e => setCatForm(f => ({ ...f, montant_fixe: e.target.value }))} /></div>
            )}
            {(catForm.type_prime === "variable_unitaire" || catForm.type_prime === "commission") && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Montant par unité (MUR)</Label><Input type="number" value={catForm.montant_par_unite} onChange={e => setCatForm(f => ({ ...f, montant_par_unite: e.target.value }))} /></div>
                <div><Label>Unité (ex: consultation)</Label><Input value={catForm.unite} onChange={e => setCatForm(f => ({ ...f, unite: e.target.value }))} placeholder="consultation" /></div>
              </div>
            )}
            {catForm.type_prime === "pourcentage" && (
              <div><Label>Pourcentage du salaire brut (%)</Label><Input type="number" step="0.1" value={catForm.pourcentage} onChange={e => setCatForm(f => ({ ...f, pourcentage: e.target.value }))} placeholder="5" /></div>
            )}
            {catForm.type_prime === "bonus_objectif" && (
              <div><Label>Montant bonus si objectif atteint (MUR)</Label><Input type="number" value={catForm.bonus_objectif_montant} onChange={e => setCatForm(f => ({ ...f, bonus_objectif_montant: e.target.value }))} /></div>
            )}
            <div><Label>Postes éligibles (séparés par virgule)</Label><Input value={catForm.postes_eligibles} onChange={e => setCatForm(f => ({ ...f, postes_eligibles: e.target.value }))} placeholder="Ex: Médecin, Infirmier (ou laisser vide = tous)" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialog(false)}>Annuler</Button>
            <Button onClick={creerCatalogue} disabled={saving} className="bg-[#1E2A4A] text-white">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Créer la prime
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog saisie prime */}
      <Dialog open={saisieDialog} onOpenChange={open => !open && setSaisieDialog(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Saisir une prime — {periode}</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            {saisieError && <p className="text-sm text-red-600">{saisieError}</p>}
            <div><Label>Employé *</Label>
              <Select value={saisieForm.employe_id} onValueChange={v => setSaisieForm(f => ({ ...f, employe_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                <SelectContent>{employes.map(e => <SelectItem key={e.id} value={e.id}>{e.prenom} {e.nom}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Prime du catalogue *</Label>
              <Select value={saisieForm.prime_id} onValueChange={v => setSaisieForm(f => ({ ...f, prime_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Choisir une prime..." /></SelectTrigger>
                <SelectContent>
                  {catalogue.filter(p => p.actif !== false).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.libelle} ({TYPE_PRIME_LABELS[p.type_prime]})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {primeSelectionnee && (primeSelectionnee.type_prime === "variable_unitaire" || primeSelectionnee.type_prime === "commission") && (
              <div><Label>Quantité ({primeSelectionnee.unite || "unités"})</Label>
                <Input type="number" value={saisieForm.quantite} onChange={e => setSaisieForm(f => ({ ...f, quantite: e.target.value }))} placeholder="Ex: 12" />
              </div>
            )}
            {saisieCalc !== null && (
              <div className="bg-[#1E2A4A]/5 border border-[#1E2A4A]/20 p-3 rounded-lg">
                <p className="text-sm font-medium text-[#1E2A4A]">Montant calculé : <strong>{fmt(saisieCalc)}</strong></p>
                {primeSelectionnee && <p className="text-xs text-gray-500 mt-1">{TYPE_PRIME_LABELS[primeSelectionnee.type_prime]}</p>}
              </div>
            )}
            <div><Label>Notes (optionnel)</Label>
              <Input value={saisieForm.notes} onChange={e => setSaisieForm(f => ({ ...f, notes: e.target.value }))} placeholder="Ex: Bonus performance Q3..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaisieDialog(false)}>Annuler</Button>
            <Button onClick={saisirPrime} disabled={saving} className="bg-[#1E2A4A] text-white">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Calculer et Sauvegarder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
