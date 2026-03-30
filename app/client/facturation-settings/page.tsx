"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Building2, Users, Package, Layout, Save, Plus, Pencil, Trash2, Check, X, Eye
} from "lucide-react"

// ── Types ──
interface CompanySettings {
  nom: string; brn: string; vat_number: string; logo_url: string
  adresse: string; telephone: string; email: string; website: string
  banque_nom: string; banque_compte: string; banque_iban: string; banque_swift: string
  devise_defaut: string; prefixe_facture: string; prochain_numero: number
  conditions_paiement: number; footer_text: string; mention_legale: string
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
interface InvoiceTemplate {
  id: string; nom: string; description: string; style: {
    couleur_primaire: string; couleur_secondaire: string; police: string; layout: string
  }
}

const DEFAULT_SETTINGS: CompanySettings = {
  nom: "", brn: "", vat_number: "", logo_url: "",
  adresse: "", telephone: "", email: "", website: "",
  banque_nom: "", banque_compte: "", banque_iban: "", banque_swift: "",
  devise_defaut: "MUR", prefixe_facture: "INV-", prochain_numero: 1,
  conditions_paiement: 30, footer_text: "Thank you for your business",
  mention_legale: "VAT Reg No: XXXXX | BRN: XXXXX",
}

const TEMPLATES: InvoiceTemplate[] = [
  { id: "standard", nom: "Standard", description: "Mise en page classique avec en-tete complet, ideal pour la plupart des entreprises.", style: { couleur_primaire: "#1E2A4A", couleur_secondaire: "#C9A84C", police: "Inter", layout: "standard" } },
  { id: "professional", nom: "Professionnel", description: "Design epure avec accents dores, parfait pour les cabinets et consultants.", style: { couleur_primaire: "#0F172A", couleur_secondaire: "#B8860B", police: "Inter", layout: "professional" } },
  { id: "minimal", nom: "Minimal", description: "Design minimaliste avec espacement genereux, moderne et lisible.", style: { couleur_primaire: "#374151", couleur_secondaire: "#6B7280", police: "Inter", layout: "minimal" } },
]

function genId() { return crypto.randomUUID() }

export default function FacturationSettingsPage() {
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS)
  const [clients, setClients] = useState<InvoiceClient[]>([])
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState("standard")
  const [templateColors, setTemplateColors] = useState({ primaire: "#1E2A4A", secondaire: "#C9A84C" })
  const [saved, setSaved] = useState(false)
  const [clientDialog, setClientDialog] = useState(false)
  const [editingClient, setEditingClient] = useState<InvoiceClient | null>(null)
  const [catalogueDialog, setCatalogueDialog] = useState(false)
  const [editingItem, setEditingItem] = useState<CatalogueItem | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  // Client form state
  const [cNom, setCNom] = useState("")
  const [cEntreprise, setCEntreprise] = useState("")
  const [cAdresse, setCAdresse] = useState("")
  const [cEmail, setCEmail] = useState("")
  const [cTelephone, setCTelephone] = useState("")
  const [cVat, setCVat] = useState("")
  const [cDevise, setCDevise] = useState("MUR")
  const [cConditions, setCConditions] = useState(30)
  const [cOffshore, setCOffshore] = useState(false)

  // Catalogue form state
  const [catDesc, setCatDesc] = useState("")
  const [catPrix, setCatPrix] = useState("")
  const [catDevise, setCatDevise] = useState("MUR")
  const [catTva, setCatTva] = useState(true)
  const [catCategorie, setCatCategorie] = useState("")

  // Load from localStorage
  useEffect(() => {
    try {
      const s = localStorage.getItem("lexora_invoice_settings")
      if (s) setSettings(JSON.parse(s))
      const c = localStorage.getItem("lexora_invoice_clients")
      if (c) setClients(JSON.parse(c))
      const cat = localStorage.getItem("lexora_invoice_catalogue")
      if (cat) setCatalogue(JSON.parse(cat))
      const t = localStorage.getItem("lexora_invoice_template")
      if (t) setSelectedTemplate(t)
      const tc = localStorage.getItem("lexora_invoice_template_colors")
      if (tc) setTemplateColors(JSON.parse(tc))
    } catch { /* ignore */ }
  }, [])

  const saveAll = useCallback(() => {
    localStorage.setItem("lexora_invoice_settings", JSON.stringify(settings))
    localStorage.setItem("lexora_invoice_clients", JSON.stringify(clients))
    localStorage.setItem("lexora_invoice_catalogue", JSON.stringify(catalogue))
    localStorage.setItem("lexora_invoice_template", selectedTemplate)
    localStorage.setItem("lexora_invoice_template_colors", JSON.stringify(templateColors))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [settings, clients, catalogue, selectedTemplate, templateColors])

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const url = ev.target?.result as string
      setLogoPreview(url)
      setSettings(s => ({ ...s, logo_url: url }))
    }
    reader.readAsDataURL(file)
  }

  // ── Client CRUD ──
  const openNewClient = () => {
    setEditingClient(null)
    setCNom(""); setCEntreprise(""); setCAdresse(""); setCEmail("")
    setCTelephone(""); setCVat(""); setCDevise("MUR"); setCConditions(30); setCOffshore(false)
    setClientDialog(true)
  }
  const openEditClient = (c: InvoiceClient) => {
    setEditingClient(c)
    setCNom(c.nom); setCEntreprise(c.entreprise); setCAdresse(c.adresse); setCEmail(c.email)
    setCTelephone(c.telephone); setCVat(c.vat_number); setCDevise(c.devise)
    setCConditions(c.conditions_paiement); setCOffshore(c.offshore)
    setClientDialog(true)
  }
  const saveClient = () => {
    const client: InvoiceClient = {
      id: editingClient?.id || genId(),
      nom: cNom, entreprise: cEntreprise, adresse: cAdresse, email: cEmail,
      telephone: cTelephone, vat_number: cVat, devise: cDevise,
      conditions_paiement: cConditions, offshore: cOffshore,
    }
    if (editingClient) {
      setClients(prev => prev.map(c => c.id === editingClient.id ? client : c))
    } else {
      setClients(prev => [...prev, client])
    }
    setClientDialog(false)
  }
  const deleteClient = (id: string) => {
    setClients(prev => prev.filter(c => c.id !== id))
  }

  // ── Catalogue CRUD ──
  const openNewItem = () => {
    setEditingItem(null)
    setCatDesc(""); setCatPrix(""); setCatDevise("MUR"); setCatTva(true); setCatCategorie("")
    setCatalogueDialog(true)
  }
  const openEditItem = (item: CatalogueItem) => {
    setEditingItem(item)
    setCatDesc(item.description); setCatPrix(String(item.prix_unitaire))
    setCatDevise(item.devise); setCatTva(item.tva_applicable); setCatCategorie(item.categorie)
    setCatalogueDialog(true)
  }
  const saveCatalogueItem = () => {
    const item: CatalogueItem = {
      id: editingItem?.id || genId(),
      description: catDesc, prix_unitaire: parseFloat(catPrix) || 0,
      devise: catDevise, tva_applicable: catTva, categorie: catCategorie,
    }
    if (editingItem) {
      setCatalogue(prev => prev.map(i => i.id === editingItem.id ? item : i))
    } else {
      setCatalogue(prev => [...prev, item])
    }
    setCatalogueDialog(false)
  }
  const deleteCatalogueItem = (id: string) => {
    setCatalogue(prev => prev.filter(i => i.id !== id))
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Parametres de Facturation</h1>
          <p className="text-sm text-gray-500">Configuration MRA pour vos factures</p>
        </div>
        <Button onClick={saveAll} className="bg-[#1E2A4A] hover:bg-[#2a3d6b]">
          {saved ? <><Check className="w-4 h-4 mr-2" />Sauvegarde !</> : <><Save className="w-4 h-4 mr-2" />Sauvegarder tout</>}
        </Button>
      </div>

      <Tabs defaultValue="entreprise" className="space-y-4">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="entreprise" className="flex items-center gap-1.5"><Building2 className="w-4 h-4" />Mon Entreprise</TabsTrigger>
          <TabsTrigger value="clients" className="flex items-center gap-1.5"><Users className="w-4 h-4" />Clients</TabsTrigger>
          <TabsTrigger value="catalogue" className="flex items-center gap-1.5"><Package className="w-4 h-4" />Services/Produits</TabsTrigger>
          <TabsTrigger value="modeles" className="flex items-center gap-1.5"><Layout className="w-4 h-4" />Modeles</TabsTrigger>
        </TabsList>

        {/* ══════════ TAB: Mon Entreprise ══════════ */}
        <TabsContent value="entreprise" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Company identity */}
            <Card>
              <CardHeader><CardTitle className="text-[#1E2A4A] text-base">Identite de l&apos;entreprise</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Nom de l&apos;entreprise</Label><Input value={settings.nom} onChange={e => setSettings(s => ({ ...s, nom: e.target.value }))} placeholder="DDS Consulting Ltd" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>BRN</Label><Input value={settings.brn} onChange={e => setSettings(s => ({ ...s, brn: e.target.value }))} placeholder="C12345678" /></div>
                  <div><Label>N. TVA / VAT</Label><Input value={settings.vat_number} onChange={e => setSettings(s => ({ ...s, vat_number: e.target.value }))} placeholder="VAT12345678" /></div>
                </div>
                <div>
                  <Label>Logo</Label>
                  <div className="flex items-center gap-4 mt-1">
                    {(logoPreview || settings.logo_url) && (
                      <img src={logoPreview || settings.logo_url} alt="Logo" className="w-16 h-16 object-contain rounded border" />
                    )}
                    <Input type="file" accept="image/*" onChange={handleLogoChange} className="max-w-xs" />
                  </div>
                </div>
                <div><Label>Adresse</Label><Textarea value={settings.adresse} onChange={e => setSettings(s => ({ ...s, adresse: e.target.value }))} placeholder="Port Louis, Mauritius" rows={2} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Telephone</Label><Input value={settings.telephone} onChange={e => setSettings(s => ({ ...s, telephone: e.target.value }))} placeholder="+230 xxx xxxx" /></div>
                  <div><Label>Email</Label><Input value={settings.email} onChange={e => setSettings(s => ({ ...s, email: e.target.value }))} placeholder="info@company.mu" /></div>
                </div>
                <div><Label>Site web</Label><Input value={settings.website} onChange={e => setSettings(s => ({ ...s, website: e.target.value }))} placeholder="https://www.company.mu" /></div>
              </CardContent>
            </Card>

            {/* Bank details & invoicing */}
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-[#1E2A4A] text-base">Coordonnees bancaires</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div><Label>Nom de la banque</Label><Input value={settings.banque_nom} onChange={e => setSettings(s => ({ ...s, banque_nom: e.target.value }))} placeholder="MCB / SBM / AfrAsia" /></div>
                  <div><Label>Numero de compte</Label><Input value={settings.banque_compte} onChange={e => setSettings(s => ({ ...s, banque_compte: e.target.value }))} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>IBAN</Label><Input value={settings.banque_iban} onChange={e => setSettings(s => ({ ...s, banque_iban: e.target.value }))} /></div>
                    <div><Label>SWIFT / BIC</Label><Input value={settings.banque_swift} onChange={e => setSettings(s => ({ ...s, banque_swift: e.target.value }))} /></div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-[#1E2A4A] text-base">Parametres de facturation</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Devise par defaut</Label>
                      <Select value={settings.devise_defaut} onValueChange={v => setSettings(s => ({ ...s, devise_defaut: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{["MUR", "EUR", "USD", "GBP"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Conditions de paiement</Label>
                      <Select value={String(settings.conditions_paiement)} onValueChange={v => setSettings(s => ({ ...s, conditions_paiement: parseInt(v) }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">30 jours</SelectItem>
                          <SelectItem value="60">60 jours</SelectItem>
                          <SelectItem value="90">90 jours</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Prefixe facture</Label><Input value={settings.prefixe_facture} onChange={e => setSettings(s => ({ ...s, prefixe_facture: e.target.value }))} placeholder="INV-" /></div>
                    <div><Label>Prochain numero</Label><Input type="number" min={1} value={settings.prochain_numero} onChange={e => setSettings(s => ({ ...s, prochain_numero: parseInt(e.target.value) || 1 }))} /></div>
                  </div>
                  <div><Label>Texte de pied de page</Label><Input value={settings.footer_text} onChange={e => setSettings(s => ({ ...s, footer_text: e.target.value }))} /></div>
                  <div><Label>Mention legale MRA</Label><Input value={settings.mention_legale} onChange={e => setSettings(s => ({ ...s, mention_legale: e.target.value }))} placeholder="VAT Reg No: XXXXX | BRN: XXXXX" /></div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ══════════ TAB: Clients ══════════ */}
        <TabsContent value="clients" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Base de donnees clients pour la facturation</p>
            <Button onClick={openNewClient} className="bg-[#1E2A4A]"><Plus className="w-4 h-4 mr-2" />Nouveau client</Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {clients.length === 0 ? (
                <div className="text-center py-12 text-gray-500">Aucun client. Ajoutez votre premier client de facturation.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead><TableHead>Entreprise</TableHead><TableHead>Email</TableHead>
                      <TableHead>N. TVA</TableHead><TableHead>Devise</TableHead><TableHead>Type</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.nom}</TableCell>
                        <TableCell>{c.entreprise || "-"}</TableCell>
                        <TableCell className="text-sm">{c.email || "-"}</TableCell>
                        <TableCell className="font-mono text-xs">{c.vat_number || "-"}</TableCell>
                        <TableCell><Badge variant="outline">{c.devise}</Badge></TableCell>
                        <TableCell>
                          {c.offshore
                            ? <Badge className="bg-blue-100 text-blue-700">Offshore / Export</Badge>
                            : <Badge className="bg-green-100 text-green-700">Local Maurice</Badge>
                          }
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditClient(c)}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => deleteClient(c.id)} className="text-red-600 hover:text-red-700"><Trash2 className="w-4 h-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Client Dialog */}
          <Dialog open={clientDialog} onOpenChange={setClientDialog}>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editingClient ? "Modifier le client" : "Nouveau client"}</DialogTitle></DialogHeader>
              <div className="grid gap-3 py-2">
                <div><Label>Nom *</Label><Input value={cNom} onChange={e => setCNom(e.target.value)} placeholder="Nom complet" /></div>
                <div><Label>Entreprise</Label><Input value={cEntreprise} onChange={e => setCEntreprise(e.target.value)} placeholder="Nom de la societe" /></div>
                <div><Label>Adresse</Label><Textarea value={cAdresse} onChange={e => setCAdresse(e.target.value)} rows={2} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Email</Label><Input value={cEmail} onChange={e => setCEmail(e.target.value)} type="email" /></div>
                  <div><Label>Telephone</Label><Input value={cTelephone} onChange={e => setCTelephone(e.target.value)} /></div>
                </div>
                <div><Label>N. TVA / VAT</Label><Input value={cVat} onChange={e => setCVat(e.target.value)} /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Devise</Label>
                    <Select value={cDevise} onValueChange={setCDevise}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["MUR", "EUR", "USD", "GBP"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Paiement (jours)</Label>
                    <Select value={String(cConditions)} onValueChange={v => setCConditions(parseInt(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30</SelectItem><SelectItem value="60">60</SelectItem><SelectItem value="90">90</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select value={cOffshore ? "offshore" : "local"} onValueChange={v => setCOffshore(v === "offshore")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">Local Maurice (TVA 15%)</SelectItem>
                        <SelectItem value="offshore">Offshore / Export (0%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setClientDialog(false)}>Annuler</Button>
                <Button onClick={saveClient} disabled={!cNom} className="bg-[#1E2A4A]">{editingClient ? "Modifier" : "Ajouter"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ══════════ TAB: Catalogue ══════════ */}
        <TabsContent value="catalogue" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Catalogue de services et produits reutilisables</p>
            <Button onClick={openNewItem} className="bg-[#1E2A4A]"><Plus className="w-4 h-4 mr-2" />Nouveau service/produit</Button>
          </div>
          <Card>
            <CardContent className="p-0">
              {catalogue.length === 0 ? (
                <div className="text-center py-12 text-gray-500">Aucun service ou produit. Ajoutez vos prestations courantes.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead><TableHead>Categorie</TableHead>
                      <TableHead className="text-right">Prix unitaire</TableHead><TableHead>Devise</TableHead>
                      <TableHead>TVA</TableHead><TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catalogue.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.description}</TableCell>
                        <TableCell>{item.categorie || "-"}</TableCell>
                        <TableCell className="text-right font-mono">{item.prix_unitaire.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell><Badge variant="outline">{item.devise}</Badge></TableCell>
                        <TableCell>{item.tva_applicable ? <Badge className="bg-orange-100 text-orange-700">TVA 15%</Badge> : <Badge className="bg-gray-100 text-gray-600">Zero-rated</Badge>}</TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditItem(item)}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => deleteCatalogueItem(item.id)} className="text-red-600 hover:text-red-700"><Trash2 className="w-4 h-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Catalogue Dialog */}
          <Dialog open={catalogueDialog} onOpenChange={setCatalogueDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>{editingItem ? "Modifier" : "Nouveau service/produit"}</DialogTitle></DialogHeader>
              <div className="grid gap-3 py-2">
                <div><Label>Description *</Label><Input value={catDesc} onChange={e => setCatDesc(e.target.value)} placeholder="Prestation comptable mensuelle" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Prix unitaire</Label><Input type="number" value={catPrix} onChange={e => setCatPrix(e.target.value)} placeholder="0.00" /></div>
                  <div>
                    <Label>Devise</Label>
                    <Select value={catDevise} onValueChange={setCatDevise}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["MUR", "EUR", "USD", "GBP"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Categorie</Label><Input value={catCategorie} onChange={e => setCatCategorie(e.target.value)} placeholder="Comptabilite, Audit, Conseil..." /></div>
                <div>
                  <Label>TVA applicable</Label>
                  <Select value={catTva ? "oui" : "non"} onValueChange={v => setCatTva(v === "oui")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="oui">Oui - TVA 15%</SelectItem>
                      <SelectItem value="non">Non - Zero-rated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCatalogueDialog(false)}>Annuler</Button>
                <Button onClick={saveCatalogueItem} disabled={!catDesc} className="bg-[#1E2A4A]">{editingItem ? "Modifier" : "Ajouter"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ══════════ TAB: Modeles ══════════ */}
        <TabsContent value="modeles" className="space-y-4">
          <p className="text-sm text-gray-500">Choisissez et personnalisez votre modele de facture</p>
          <div className="grid grid-cols-3 gap-4">
            {TEMPLATES.map(t => (
              <Card key={t.id} className={`cursor-pointer transition-all ${selectedTemplate === t.id ? "ring-2 ring-[#C9A84C] shadow-lg" : "hover:shadow-md"}`}
                onClick={() => { setSelectedTemplate(t.id); setTemplateColors(t.style.couleur_primaire ? { primaire: t.style.couleur_primaire, secondaire: t.style.couleur_secondaire } : templateColors) }}>
                <CardContent className="p-4">
                  {/* Template Preview */}
                  <div className="border rounded-lg p-3 mb-3 bg-white min-h-[180px]">
                    <div className="flex justify-between items-start mb-3">
                      <div className="w-10 h-10 rounded" style={{ backgroundColor: t.style.couleur_primaire }} />
                      <div className="text-right">
                        <div className="text-[10px] font-bold" style={{ color: t.style.couleur_primaire }}>FACTURE</div>
                        <div className="text-[8px] text-gray-400">INV-001</div>
                      </div>
                    </div>
                    <div className="space-y-1 mb-3">
                      <div className="h-1.5 rounded bg-gray-200 w-3/4" />
                      <div className="h-1.5 rounded bg-gray-200 w-1/2" />
                    </div>
                    <div className="border-t pt-2 space-y-1">
                      <div className="flex justify-between">
                        <div className="h-1.5 rounded bg-gray-200 w-1/3" />
                        <div className="h-1.5 rounded w-1/6" style={{ backgroundColor: t.style.couleur_secondaire }} />
                      </div>
                      <div className="flex justify-between">
                        <div className="h-1.5 rounded bg-gray-200 w-2/5" />
                        <div className="h-1.5 rounded w-1/6" style={{ backgroundColor: t.style.couleur_secondaire }} />
                      </div>
                    </div>
                    <div className="border-t mt-2 pt-2 flex justify-end">
                      <div className="h-2 rounded w-1/4" style={{ backgroundColor: t.style.couleur_primaire }} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-[#1E2A4A]">{t.nom}</h3>
                      <p className="text-xs text-gray-500">{t.description}</p>
                    </div>
                    {selectedTemplate === t.id && <Check className="w-5 h-5 text-[#C9A84C]" />}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Customization */}
          <Card>
            <CardHeader><CardTitle className="text-[#1E2A4A] text-base">Personnalisation</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div>
                  <Label>Couleur primaire</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <input type="color" value={templateColors.primaire} onChange={e => setTemplateColors(c => ({ ...c, primaire: e.target.value }))} className="w-10 h-10 rounded border cursor-pointer" />
                    <Input value={templateColors.primaire} onChange={e => setTemplateColors(c => ({ ...c, primaire: e.target.value }))} className="font-mono text-sm" />
                  </div>
                </div>
                <div>
                  <Label>Couleur secondaire</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <input type="color" value={templateColors.secondaire} onChange={e => setTemplateColors(c => ({ ...c, secondaire: e.target.value }))} className="w-10 h-10 rounded border cursor-pointer" />
                    <Input value={templateColors.secondaire} onChange={e => setTemplateColors(c => ({ ...c, secondaire: e.target.value }))} className="font-mono text-sm" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
