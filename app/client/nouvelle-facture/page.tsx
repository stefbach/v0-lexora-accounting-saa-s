"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Plus, Trash2, Eye, Save, Send, Download, Lock, ArrowLeft, Calculator
} from "lucide-react"

interface LigneFacture {
  id: string; description: string; quantite: number; prix_unitaire: number
  taux_tva: number; total: number
}
interface InvoiceClient {
  id: string; nom: string; entreprise: string; adresse: string; email: string
  telephone: string; vat_number: string; devise: string; conditions_paiement: number
  offshore: boolean
}
interface CatalogueItem {
  id: string; description: string; prix_unitaire: number; devise: string
  tva_applicable: boolean; categorie: string
}
interface CompanySettings {
  nom: string; brn: string; vat_number: string; logo_url: string
  adresse: string; telephone: string; email: string; website: string
  banque_nom: string; banque_compte: string; banque_iban: string; banque_swift: string
  devise_defaut: string; prefixe_facture: string; prochain_numero: number
  conditions_paiement: number; footer_text: string; mention_legale: string
}
interface Societe { id: string; nom: string }

function genId() { return crypto.randomUUID() }
function fmt(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function today() { return new Date().toISOString().split("T")[0] }
function addDays(d: string, days: number) {
  const dt = new Date(d)
  dt.setDate(dt.getDate() + days)
  return dt.toISOString().split("T")[0]
}

const EXCHANGE_RATES: Record<string, number> = { MUR: 1, EUR: 49.5, USD: 45.8, GBP: 57.2 }

export default function NouvelleFacturePage() {
  const router = useRouter()
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [clients, setClients] = useState<InvoiceClient[]>([])
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([])
  const [societes, setSocietes] = useState<Societe[]>([])
  const [societeId, setSocieteId] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Invoice fields
  const [numeroFacture, setNumeroFacture] = useState("")
  const [dateFacture, setDateFacture] = useState(today())
  const [dateEcheance, setDateEcheance] = useState("")
  const [devise, setDevise] = useState("MUR")
  const [tauxChange, setTauxChange] = useState(1)

  // Client
  const [selectedClientId, setSelectedClientId] = useState("")
  const [clientNom, setClientNom] = useState("")
  const [clientEntreprise, setClientEntreprise] = useState("")
  const [clientAdresse, setClientAdresse] = useState("")
  const [clientEmail, setClientEmail] = useState("")
  const [clientVat, setClientVat] = useState("")
  const [clientOffshore, setClientOffshore] = useState(false)

  // Line items
  const [lignes, setLignes] = useState<LigneFacture[]>([])

  // Discounts
  const [remisePct, setRemisePct] = useState(0)
  const [remiseMontant, setRemiseMontant] = useState(0)

  // Notes
  const [notesInternes, setNotesInternes] = useState("")
  const [termes, setTermes] = useState("")

  // Load settings and societes
  useEffect(() => {
    try {
      const s = localStorage.getItem("lexora_invoice_settings")
      if (s) {
        const parsed = JSON.parse(s) as CompanySettings
        setSettings(parsed)
        setDevise(parsed.devise_defaut)
        setNumeroFacture(`${parsed.prefixe_facture}${String(parsed.prochain_numero).padStart(3, "0")}`)
        setDateEcheance(addDays(today(), parsed.conditions_paiement))
      }
      const c = localStorage.getItem("lexora_invoice_clients")
      if (c) setClients(JSON.parse(c))
      const cat = localStorage.getItem("lexora_invoice_catalogue")
      if (cat) setCatalogue(JSON.parse(cat))
    } catch { /* ignore */ }

    fetch("/api/client/societes")
      .then(r => r.json())
      .then(d => {
        setSocietes(d.societes || [])
        if (d.societes?.length === 1) setSocieteId(d.societes[0].id)
      })
      .catch(() => {})
  }, [])

  // Auto-fill client from selection
  const handleClientSelect = (id: string) => {
    setSelectedClientId(id)
    if (id === "manual") {
      setClientNom(""); setClientEntreprise(""); setClientAdresse("")
      setClientEmail(""); setClientVat(""); setClientOffshore(false)
      return
    }
    const c = clients.find(cl => cl.id === id)
    if (c) {
      setClientNom(c.nom); setClientEntreprise(c.entreprise); setClientAdresse(c.adresse)
      setClientEmail(c.email); setClientVat(c.vat_number); setClientOffshore(c.offshore)
      setDevise(c.devise)
      if (settings) setDateEcheance(addDays(dateFacture, c.conditions_paiement))
    }
  }

  // Line items
  const addLigne = () => {
    const tva = clientOffshore ? 0 : 15
    setLignes(prev => [...prev, { id: genId(), description: "", quantite: 1, prix_unitaire: 0, taux_tva: tva, total: 0 }])
  }
  const addFromCatalogue = (item: CatalogueItem) => {
    const tva = clientOffshore ? 0 : (item.tva_applicable ? 15 : 0)
    const total = item.prix_unitaire * (1 + tva / 100)
    setLignes(prev => [...prev, { id: genId(), description: item.description, quantite: 1, prix_unitaire: item.prix_unitaire, taux_tva: tva, total }])
  }
  const updateLigne = (id: string, field: keyof LigneFacture, value: string | number) => {
    setLignes(prev => prev.map(l => {
      if (l.id !== id) return l
      const updated = { ...l, [field]: value }
      updated.total = updated.quantite * updated.prix_unitaire * (1 + updated.taux_tva / 100)
      return updated
    }))
  }
  const removeLigne = (id: string) => setLignes(prev => prev.filter(l => l.id !== id))

  // Totals
  const subtotalHT = useMemo(() => lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0), [lignes])
  const totalTVA = useMemo(() => lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire * l.taux_tva / 100, 0), [lignes])
  const discountAmount = useMemo(() => remisePct > 0 ? subtotalHT * remisePct / 100 : remiseMontant, [subtotalHT, remisePct, remiseMontant])
  const grandTotal = useMemo(() => subtotalHT + totalTVA - discountAmount, [subtotalHT, totalTVA, discountAmount])
  const totalMUR = useMemo(() => devise === "MUR" ? grandTotal : grandTotal * tauxChange, [grandTotal, devise, tauxChange])

  // Update exchange rate when currency changes
  useEffect(() => {
    setTauxChange(EXCHANGE_RATES[devise] || 1)
  }, [devise])

  const buildInvoiceData = (statut: string) => ({
    societe_id: societeId,
    numero_facture: numeroFacture,
    tiers: clientNom || clientEntreprise,
    description: lignes.map(l => l.description).filter(Boolean).join(", "),
    date_facture: dateFacture,
    date_echeance: dateEcheance,
    devise, taux_change: tauxChange,
    montant_ht: subtotalHT,
    montant_tva: totalTVA,
    montant_ttc: grandTotal,
    taux_tva: clientOffshore ? 0 : 15,
    statut,
    lignes, conditions_paiement: settings?.conditions_paiement || 30,
    notes_internes: notesInternes, termes,
    template: localStorage.getItem("lexora_invoice_template") || "standard",
    client_offshore: clientOffshore,
    remise_pct: remisePct, remise_montant: discountAmount,
    logo_url: settings?.logo_url || "",
  })

  const saveToSession = () => {
    const data = {
      ...buildInvoiceData("brouillon"),
      client: { nom: clientNom, entreprise: clientEntreprise, adresse: clientAdresse, email: clientEmail, vat_number: clientVat, offshore: clientOffshore },
      settings,
    }
    sessionStorage.setItem("lexora_facture_preview", JSON.stringify(data))
  }

  const handleSaveDraft = async () => {
    if (!societeId) { setError("Selectionnez une societe"); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch("/api/client/factures", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildInvoiceData("brouillon")),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      // Increment next number in settings
      if (settings) {
        const updated = { ...settings, prochain_numero: settings.prochain_numero + 1 }
        localStorage.setItem("lexora_invoice_settings", JSON.stringify(updated))
      }
      router.push("/client/factures")
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur") }
    finally { setSaving(false) }
  }

  const handleFinalize = async () => {
    if (!societeId) { setError("Selectionnez une societe"); return }
    if (lignes.length === 0) { setError("Ajoutez au moins une ligne"); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch("/api/client/factures", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildInvoiceData("en_attente")),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      if (settings) {
        const updated = { ...settings, prochain_numero: settings.prochain_numero + 1 }
        localStorage.setItem("lexora_invoice_settings", JSON.stringify(updated))
      }
      router.push("/client/factures")
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur") }
    finally { setSaving(false) }
  }

  const handlePreview = () => {
    saveToSession()
    window.open("/client/facture-preview", "_blank")
  }

  const handleDownloadPDF = () => {
    saveToSession()
    const w = window.open("/client/facture-preview?print=true", "_blank")
    if (w) {
      w.addEventListener("afterprint", () => w.close())
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/client/factures")}><ArrowLeft className="w-4 h-4 mr-1" />Retour</Button>
          <div>
            <h1 className="text-2xl font-bold text-[#1E2A4A]">Nouvelle Facture</h1>
            <p className="text-sm text-gray-500">Conforme MRA - Maurice</p>
          </div>
        </div>
        <Badge className="bg-gray-100 text-gray-600">Brouillon</Badge>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

      {/* Invoice details */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <Label>Societe</Label>
              <Select value={societeId} onValueChange={setSocieteId}>
                <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                <SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>N. Facture</Label><Input value={numeroFacture} onChange={e => setNumeroFacture(e.target.value)} className="font-mono" /></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-3">
            <div><Label>Date de facture</Label><Input type="date" value={dateFacture} onChange={e => { setDateFacture(e.target.value); if (settings) setDateEcheance(addDays(e.target.value, settings.conditions_paiement)) }} /></div>
            <div><Label>Date d&apos;echeance</Label><Input type="date" value={dateEcheance} onChange={e => setDateEcheance(e.target.value)} /></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <Label>Devise</Label>
              <Select value={devise} onValueChange={setDevise}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["MUR", "EUR", "USD", "GBP"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {devise !== "MUR" && (
              <div>
                <Label>Taux de change (1 {devise} = X MUR)</Label>
                <Input type="number" step="0.01" value={tauxChange} onChange={e => setTauxChange(parseFloat(e.target.value) || 1)} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Client */}
      <Card>
        <CardHeader><CardTitle className="text-[#1E2A4A] text-base">Client</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Selectionner un client</Label>
              <Select value={selectedClientId} onValueChange={handleClientSelect}>
                <SelectTrigger><SelectValue placeholder="Choisir ou saisie manuelle..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">-- Saisie manuelle --</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nom}{c.entreprise ? ` (${c.entreprise})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type</Label>
              <Select value={clientOffshore ? "offshore" : "local"} onValueChange={v => setClientOffshore(v === "offshore")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local Maurice - TVA 15%</SelectItem>
                  <SelectItem value="offshore">Offshore / Export - Zero-rated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Nom</Label><Input value={clientNom} onChange={e => setClientNom(e.target.value)} placeholder="Nom du contact" /></div>
            <div><Label>Entreprise</Label><Input value={clientEntreprise} onChange={e => setClientEntreprise(e.target.value)} placeholder="Societe du client" /></div>
            <div><Label>N. TVA</Label><Input value={clientVat} onChange={e => setClientVat(e.target.value)} placeholder="VAT number" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Adresse</Label><Input value={clientAdresse} onChange={e => setClientAdresse(e.target.value)} /></div>
            <div><Label>Email</Label><Input value={clientEmail} onChange={e => setClientEmail(e.target.value)} type="email" /></div>
          </div>
          {clientOffshore && (
            <div className="bg-blue-50 border border-blue-200 rounded p-2 text-sm text-blue-700">
              Client offshore / export : TVA a 0% (zero-rated) appliquee automatiquement.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-[#1E2A4A] text-base">Lignes de facture</CardTitle>
            <div className="flex gap-2">
              {catalogue.length > 0 && (
                <Select onValueChange={v => { const item = catalogue.find(i => i.id === v); if (item) addFromCatalogue(item) }}>
                  <SelectTrigger className="w-60"><SelectValue placeholder="Ajouter du catalogue..." /></SelectTrigger>
                  <SelectContent>{catalogue.map(item => <SelectItem key={item.id} value={item.id}>{item.description} - {fmt(item.prix_unitaire)} {item.devise}</SelectItem>)}</SelectContent>
                </Select>
              )}
              <Button onClick={addLigne} variant="outline" size="sm"><Plus className="w-4 h-4 mr-1" />Ajouter une ligne</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Description</TableHead>
                <TableHead className="text-right w-[10%]">Qte</TableHead>
                <TableHead className="text-right w-[15%]">Prix unit.</TableHead>
                <TableHead className="text-right w-[10%]">TVA %</TableHead>
                <TableHead className="text-right w-[15%]">Total</TableHead>
                <TableHead className="w-[5%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lignes.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-400">Ajoutez des lignes a la facture</TableCell></TableRow>
              ) : (
                lignes.map(l => (
                  <TableRow key={l.id}>
                    <TableCell><Input value={l.description} onChange={e => updateLigne(l.id, "description", e.target.value)} placeholder="Description du service/produit" className="border-0 bg-transparent" /></TableCell>
                    <TableCell><Input type="number" min={1} value={l.quantite} onChange={e => updateLigne(l.id, "quantite", parseFloat(e.target.value) || 0)} className="text-right border-0 bg-transparent w-20" /></TableCell>
                    <TableCell><Input type="number" step="0.01" value={l.prix_unitaire} onChange={e => updateLigne(l.id, "prix_unitaire", parseFloat(e.target.value) || 0)} className="text-right border-0 bg-transparent w-28" /></TableCell>
                    <TableCell>
                      <Select value={String(l.taux_tva)} onValueChange={v => updateLigne(l.id, "taux_tva", parseFloat(v))}>
                        <SelectTrigger className="border-0 bg-transparent w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">15%</SelectItem>
                          <SelectItem value="0">0%</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">{fmt(l.total)}</TableCell>
                    <TableCell><Button variant="ghost" size="sm" onClick={() => removeLigne(l.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></Button></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Totals and Discounts */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-[#1E2A4A] text-base">Remise</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Remise en %</Label>
                <Input type="number" min={0} max={100} step={0.5} value={remisePct} onChange={e => { setRemisePct(parseFloat(e.target.value) || 0); setRemiseMontant(0) }} />
              </div>
              <div>
                <Label>Ou montant fixe ({devise})</Label>
                <Input type="number" min={0} step={0.01} value={remiseMontant} onChange={e => { setRemiseMontant(parseFloat(e.target.value) || 0); setRemisePct(0) }} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-gray-600">Sous-total HT</span><span className="font-mono">{fmt(subtotalHT)} {devise}</span></div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm text-red-600"><span>Remise{remisePct > 0 ? ` (${remisePct}%)` : ""}</span><span className="font-mono">-{fmt(discountAmount)} {devise}</span></div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">TVA {clientOffshore ? "(Zero-rated export)" : "(15%)"}</span>
              <span className="font-mono">{fmt(totalTVA)} {devise}</span>
            </div>
            <div className="border-t pt-2 flex justify-between font-bold text-lg">
              <span className="text-[#1E2A4A]">Total TTC</span>
              <span className="text-[#1E2A4A] font-mono">{fmt(grandTotal)} {devise}</span>
            </div>
            {devise !== "MUR" && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>Equivalent MUR (taux: {tauxChange})</span>
                <span className="font-mono">{fmt(totalMUR)} MUR</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-[#1E2A4A] text-base">Notes internes</CardTitle></CardHeader>
          <CardContent><Textarea value={notesInternes} onChange={e => setNotesInternes(e.target.value)} placeholder="Notes internes (non visibles sur la facture)" rows={3} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-[#1E2A4A] text-base">Termes et conditions</CardTitle></CardHeader>
          <CardContent><Textarea value={termes} onChange={e => setTermes(e.target.value)} placeholder="Conditions de paiement, penalites de retard..." rows={3} /></CardContent>
        </Card>
      </div>

      {/* Actions */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePreview}><Eye className="w-4 h-4 mr-2" />Apercu</Button>
              <Button variant="outline" onClick={handleDownloadPDF}><Download className="w-4 h-4 mr-2" />Telecharger PDF</Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => alert("Fonctionnalite email bientot disponible")} disabled><Send className="w-4 h-4 mr-2" />Envoyer par email</Button>
              <Button onClick={handleSaveDraft} disabled={saving} className="bg-gray-600 hover:bg-gray-700 text-white"><Save className="w-4 h-4 mr-2" />{saving ? "Sauvegarde..." : "Sauvegarder brouillon"}</Button>
              <Button onClick={handleFinalize} disabled={saving} className="bg-[#1E2A4A] hover:bg-[#2a3d6b]"><Lock className="w-4 h-4 mr-2" />{saving ? "Finalisation..." : "Finaliser"}</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
