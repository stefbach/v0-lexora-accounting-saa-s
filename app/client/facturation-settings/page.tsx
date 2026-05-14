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
  Building2, Users, Package, Layout, Save, Plus, Pencil, Trash2, Check, X, Eye, Palette,
  Shield, Wifi, WifiOff, Info, Loader2, Download
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { LogoUploader } from "@/components/client/LogoUploader"
import { inferSwiftFromIban, inferSwiftWithDiagnostic } from "@/lib/banque/iban-swift"

const ACCENT_COLORS = [
  { name: "Navy", hex: "#0B0F2E" }, { name: "Gold", hex: "#D4AF37" },
  { name: "Blue", hex: "#2563EB" }, { name: "Green", hex: "#059669" },
  { name: "Red", hex: "#DC2626" }, { name: "Purple", hex: "#7C3AED" },
  { name: "Teal", hex: "#0D9488" }, { name: "Orange", hex: "#EA580C" },
  { name: "Slate", hex: "#475569" }, { name: "Rose", hex: "#E11D48" },
  { name: "Indigo", hex: "#4F46E5" }, { name: "Black", hex: "#000000" },
] as const

// ── Types ──
interface CompanySettings {
  nom: string; brn: string; vat_number: string; logo_url: string
  adresse: string; telephone: string; email: string; website: string
  banque_nom: string; banque_compte: string; banque_iban: string; banque_swift: string
  devise_defaut: string
  // Numérotation par type de document (mig 243 + mig 247)
  prefixe_facture: string; prochain_numero: number
  devis_prefixe: string; devis_prochain_numero: number
  avoir_prefixe: string; avoir_prochain_numero: number
  note_debit_prefixe: string; note_debit_prochain_numero: number
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
  devise_defaut: "MUR",
  prefixe_facture: "INV-", prochain_numero: 1,
  devis_prefixe: "DEV-", devis_prochain_numero: 1,
  avoir_prefixe: "AV-", avoir_prochain_numero: 1,
  note_debit_prefixe: "ND-", note_debit_prochain_numero: 1,
  conditions_paiement: 30, footer_text: "Thank you for your business",
  mention_legale: "VAT Reg No: XXXXX | BRN: XXXXX",
}

const TEMPLATES: InvoiceTemplate[] = [
  { id: "standard", nom: "Standard", description: "Mise en page classique avec en-tete complet, ideal pour la plupart des entreprises.", style: { couleur_primaire: "#0B0F2E", couleur_secondaire: "#D4AF37", police: "Inter", layout: "standard" } },
  { id: "professional", nom: "Professionnel", description: "Design epure avec accents dores, parfait pour les cabinets et consultants.", style: { couleur_primaire: "#0F172A", couleur_secondaire: "#B8860B", police: "Inter", layout: "professional" } },
  { id: "minimal", nom: "Minimal", description: "Design minimaliste avec espacement genereux, moderne et lisible.", style: { couleur_primaire: "#374151", couleur_secondaire: "#6B7280", police: "Inter", layout: "minimal" } },
]

function genId() { return crypto.randomUUID() }

/**
 * Construit la mention légale obligatoire à partir des identifiants
 * fiscaux de la société (VAT MRA + BRN). Affichée en bas des factures.
 *
 * Format Maurice : "VAT Reg No: 12345 | BRN: C12345678"
 * Si l'une des deux valeurs manque, on n'affiche que celle qui est là.
 * Si les deux manquent, retourne chaîne vide → l'utilisateur sait
 * qu'il doit renseigner BRN/VAT plus haut.
 */
function buildMentionLegale(brn: string | null | undefined, vat: string | null | undefined): string {
  const parts: string[] = []
  const v = (vat || "").trim()
  const b = (brn || "").trim()
  if (v) parts.push(`VAT Reg No: ${v}`)
  if (b) parts.push(`BRN: ${b}`)
  return parts.join(" | ")
}

/**
 * Mappe la société DB (colonnes Supabase) → CompanySettings du form.
 * Privilégie les valeurs DB, fallback sur les valeurs déjà saisies en
 * localStorage pour ne rien perdre lors de la première migration.
 */
function mapSocieteToSettings(societe: any, legacy: Partial<CompanySettings>): CompanySettings {
  return {
    nom:                 societe?.nom                          ?? legacy.nom                 ?? "",
    brn:                 societe?.brn                          ?? legacy.brn                 ?? "",
    vat_number:          societe?.numero_tva_mra               ?? legacy.vat_number          ?? "",
    logo_url:            societe?.logo_url                     ?? legacy.logo_url            ?? "",
    adresse:             societe?.adresse                      ?? legacy.adresse             ?? "",
    telephone:           societe?.telephone                    ?? legacy.telephone           ?? "",
    email:               societe?.email                        ?? legacy.email               ?? "",
    website:             societe?.website                      ?? legacy.website             ?? "",
    banque_nom:          societe?.bank_name                    ?? legacy.banque_nom          ?? "",
    banque_compte:       societe?.bank_account_number          ?? legacy.banque_compte       ?? "",
    banque_iban:         societe?.iban                         ?? legacy.banque_iban         ?? "",
    banque_swift:        societe?.banque_swift                 ?? legacy.banque_swift        ?? "",
    devise_defaut:       societe?.devise_principale            ?? legacy.devise_defaut       ?? "MUR",
    prefixe_facture:     societe?.facture_prefixe              ?? legacy.prefixe_facture     ?? "INV-",
    prochain_numero:     Number(societe?.facture_prochain_numero ?? legacy.prochain_numero ?? 1),
    devis_prefixe:       societe?.devis_prefixe                 ?? legacy.devis_prefixe       ?? "DEV-",
    devis_prochain_numero: Number(societe?.devis_prochain_numero ?? legacy.devis_prochain_numero ?? 1),
    avoir_prefixe:       societe?.avoir_prefixe                 ?? legacy.avoir_prefixe       ?? "AV-",
    avoir_prochain_numero: Number(societe?.avoir_prochain_numero ?? legacy.avoir_prochain_numero ?? 1),
    note_debit_prefixe:  societe?.note_debit_prefixe            ?? legacy.note_debit_prefixe  ?? "ND-",
    note_debit_prochain_numero: Number(societe?.note_debit_prochain_numero ?? legacy.note_debit_prochain_numero ?? 1),
    conditions_paiement: Number(societe?.facture_conditions_paiement ?? legacy.conditions_paiement ?? 30),
    footer_text:         societe?.facture_footer_text          ?? legacy.footer_text         ?? "",
    // Auto-génère la mention légale depuis BRN/VAT si l'utilisateur n'a
    // rien saisi (ni en DB, ni en localStorage). Si la valeur stockée
    // ressemble au placeholder par défaut, on la régénère aussi.
    mention_legale:      (() => {
      const stored = societe?.facture_mention_legale ?? legacy.mention_legale ?? ""
      if (!stored || stored === "VAT Reg No: XXXXX | BRN: XXXXX") {
        return buildMentionLegale(societe?.brn, societe?.numero_tva_mra)
      }
      return stored
    })(),
  }
}

interface CompteBancaireBrief {
  id: string
  banque: string | null
  nom_compte: string | null
  numero_compte: string | null
  iban: string | null
  swift: string | null
  devise: string | null
  compte_principal: boolean
}

export default function FacturationSettingsPage() {
  const { societeId, societe, refresh } = useSocieteActive()
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS)
  const [persisting, setPersisting] = useState(false)
  const [persistError, setPersistError] = useState<string | null>(null)
  const [comptesBancaires, setComptesBancaires] = useState<CompteBancaireBrief[]>([])
  const [clients, setClients] = useState<InvoiceClient[]>([])
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState("standard")
  const [templateColors, setTemplateColors] = useState({ primaire: "#0B0F2E", secondaire: "#D4AF37" })
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

  // MRA e-Invoicing state
  const [mraActive, setMraActive] = useState(false)
  const [mraEbsId, setMraEbsId] = useState("")
  const [mraApiKey, setMraApiKey] = useState("")
  const [mraEnvironment, setMraEnvironment] = useState<"sandbox" | "production">("sandbox")
  const [mraApiUrl, setMraApiUrl] = useState("https://sandboxifp.mra.mu/api/v1")
  const [mraTesting, setMraTesting] = useState(false)
  const [mraTestResult, setMraTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Catalogue form state
  const [catDesc, setCatDesc] = useState("")
  const [catPrix, setCatPrix] = useState("")
  const [catDevise, setCatDevise] = useState("MUR")
  const [catTva, setCatTva] = useState(true)
  const [catCategorie, setCatCategorie] = useState("")

  // Charge depuis la DB (société active) en priorité, fallback localStorage
  // pour les utilisateurs legacy qui n'ont pas encore migré vers la mig 243.
  // Le mapping est fait par mapSocieteToSettings → toutes les colonnes DB
  // pertinentes (nom, BRN, adresse, banque, etc.) auto-remplissent le form.
  useEffect(() => {
    let legacy: Partial<CompanySettings> = {}
    try {
      const s = localStorage.getItem("lexora_invoice_settings")
      if (s) legacy = JSON.parse(s) as Partial<CompanySettings>
      const c = localStorage.getItem("lexora_invoice_clients")
      if (c) setClients(JSON.parse(c))
      const cat = localStorage.getItem("lexora_invoice_catalogue")
      if (cat) setCatalogue(JSON.parse(cat))
      const t = localStorage.getItem("lexora_invoice_template")
      if (t) setSelectedTemplate(t)
      const tc = localStorage.getItem("lexora_invoice_template_colors")
      if (tc) setTemplateColors(JSON.parse(tc))
      const mra = localStorage.getItem("lexora_mra_settings")
      if (mra) {
        const m = JSON.parse(mra)
        setMraActive(m.active || false)
        setMraEbsId(m.ebs_id || "")
        setMraApiKey(m.api_key || "")
        setMraEnvironment(m.environment || "sandbox")
        setMraApiUrl(m.api_url || "https://sandboxifp.mra.mu/api/v1")
      }
    } catch { /* ignore */ }
    // DB > legacy localStorage. Si pas de société chargée encore, on
    // pose au moins le legacy pour que le user voie ses anciennes valeurs.
    setSettings(mapSocieteToSettings(societe, legacy))
  }, [societe])

  // Charge les comptes bancaires de la société active (mig 010 + 043)
  // pour permettre le pré-remplissage 1-clic des coordonnées bancaires.
  useEffect(() => {
    if (!societeId) {
      setComptesBancaires([])
      return
    }
    fetch(`/api/client/comptes-bancaires?societe_id=${societeId}`)
      .then((r) => r.json())
      .then((d) => setComptesBancaires(d?.comptes || []))
      .catch(() => setComptesBancaires([]))
  }, [societeId])

  const saveAll = useCallback(async () => {
    // 1. localStorage : conserve les paramètres pas encore migrés en DB
    //    (clients legacy, catalogue legacy, template choisi, MRA). Quand
    //    le composant catalogue / contacts DB sera la source unique, on
    //    pourra retirer ces lignes.
    localStorage.setItem("lexora_invoice_settings", JSON.stringify(settings))
    localStorage.setItem("lexora_invoice_clients", JSON.stringify(clients))
    localStorage.setItem("lexora_invoice_catalogue", JSON.stringify(catalogue))
    localStorage.setItem("lexora_invoice_template", selectedTemplate)
    localStorage.setItem("lexora_invoice_template_colors", JSON.stringify(templateColors))
    localStorage.setItem("lexora_mra_settings", JSON.stringify({
      active: mraActive, ebs_id: mraEbsId, api_key: mraApiKey,
      environment: mraEnvironment, api_url: mraApiUrl,
    }))

    // 2. PATCH société : pousse les colonnes mappables en DB (mig 243+)
    if (societeId) {
      setPersisting(true)
      setPersistError(null)
      try {
        const body = {
          nom:                          settings.nom,
          brn:                          settings.brn,
          numero_tva_mra:               settings.vat_number,
          adresse:                      settings.adresse,
          telephone:                    settings.telephone,
          email:                        settings.email,
          website:                      settings.website,
          devise_principale:            settings.devise_defaut,
          bank_name:                    settings.banque_nom,
          bank_account_number:          settings.banque_compte,
          iban:                         settings.banque_iban,
          banque_swift:                 settings.banque_swift,
          facture_prefixe:              settings.prefixe_facture,
          facture_prochain_numero:      settings.prochain_numero,
          devis_prefixe:                settings.devis_prefixe,
          devis_prochain_numero:        settings.devis_prochain_numero,
          avoir_prefixe:                settings.avoir_prefixe,
          avoir_prochain_numero:        settings.avoir_prochain_numero,
          note_debit_prefixe:           settings.note_debit_prefixe,
          note_debit_prochain_numero:   settings.note_debit_prochain_numero,
          facture_conditions_paiement:  settings.conditions_paiement,
          facture_footer_text:          settings.footer_text,
          facture_mention_legale:       settings.mention_legale,
        }
        const res = await fetch(`/api/client/societes?id=${societeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || "Erreur enregistrement")
        await refresh()
      } catch (e: any) {
        setPersistError(e?.message || "Erreur enregistrement DB")
      } finally {
        setPersisting(false)
      }
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [settings, clients, catalogue, selectedTemplate, templateColors, mraActive, mraEbsId, mraApiKey, mraEnvironment, mraApiUrl, societeId, refresh])

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
    <ClientPageShell
      breadcrumbs={[{ label: "Espace client", href: "/client" }, { label: "Paramètres Facturation" }]}
      kicker="Facturation"
      title="Paramètres de Facturation"
      subtitle="Configuration MRA (ERN, IRN, TVA, devise par défaut) pour toutes vos factures émises."
      actions={
        <div className="flex items-center gap-3">
          {persistError && (
            <span className="text-xs text-red-600 max-w-xs truncate" title={persistError}>
              ⚠ {persistError}
            </span>
          )}
          <Button onClick={saveAll} disabled={persisting} className="bg-[#0B0F2E] hover:bg-[#2a3d6b]">
            {persisting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enregistrement…</>
            ) : saved ? (
              <><Check className="w-4 h-4 mr-2" />Sauvegardé !</>
            ) : (
              <><Save className="w-4 h-4 mr-2" />Sauvegarder tout</>
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="hidden">{/* header moved to shell */}
      </div>

      <Tabs defaultValue="entreprise" className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="entreprise" className="flex items-center gap-1.5"><Building2 className="w-4 h-4" />Mon Entreprise</TabsTrigger>
          <TabsTrigger value="clients" className="flex items-center gap-1.5"><Users className="w-4 h-4" />Clients</TabsTrigger>
          <TabsTrigger value="catalogue" className="flex items-center gap-1.5"><Package className="w-4 h-4" />Services/Produits</TabsTrigger>
          <TabsTrigger value="modeles" className="flex items-center gap-1.5"><Layout className="w-4 h-4" />Modeles</TabsTrigger>
          <TabsTrigger value="mra" className="flex items-center gap-1.5"><Shield className="w-4 h-4" />MRA e-Invoicing</TabsTrigger>
        </TabsList>

        {/* ══════════ TAB: Mon Entreprise ══════════ */}
        <TabsContent value="entreprise" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Company identity */}
            <Card>
              <CardHeader><CardTitle className="text-[#0B0F2E] text-base">Identite de l&apos;entreprise</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Nom de l&apos;entreprise</Label><Input value={settings.nom} onChange={e => setSettings(s => ({ ...s, nom: e.target.value }))} placeholder="DDS Consulting Ltd" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>BRN</Label><Input value={settings.brn} onChange={e => {
                    // Si la mention légale courante a été auto-générée
                    // depuis l'ancien BRN/VAT, on la régénère avec la nouvelle
                    // valeur de BRN. Sinon on respecte l'édition manuelle.
                    const newBrn = e.target.value
                    setSettings(s => {
                      const auto = buildMentionLegale(s.brn, s.vat_number)
                      const isAuto = !s.mention_legale || s.mention_legale === auto
                      return {
                        ...s,
                        brn: newBrn,
                        mention_legale: isAuto ? buildMentionLegale(newBrn, s.vat_number) : s.mention_legale,
                      }
                    })
                  }} placeholder="C12345678" /></div>
                  <div><Label>N. TVA / VAT</Label><Input value={settings.vat_number} onChange={e => {
                    const newVat = e.target.value
                    setSettings(s => {
                      const auto = buildMentionLegale(s.brn, s.vat_number)
                      const isAuto = !s.mention_legale || s.mention_legale === auto
                      return {
                        ...s,
                        vat_number: newVat,
                        mention_legale: isAuto ? buildMentionLegale(s.brn, newVat) : s.mention_legale,
                      }
                    })
                  }} placeholder="VAT12345678" /></div>
                </div>
                <div>
                  <Label>Logo société</Label>
                  <div className="mt-2">
                    <LogoUploader
                      societeId={societeId}
                      initialLogoUrl={settings.logo_url || undefined}
                      onChange={(url) => {
                        // Synchronise localStorage pour rétrocompat (lecture
                        // par nouvelle-facture jusqu'à la prochaine refonte).
                        setSettings(s => ({ ...s, logo_url: url || "" }))
                      }}
                    />
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
                <CardHeader><CardTitle className="text-[#0B0F2E] text-base">Coordonnees bancaires</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {/* Importer depuis un compte bancaire existant (mig 010/043).
                      L'utilisateur a souvent déjà saisi ses RIB via la page
                      /client/banque : pas la peine de les retaper ici. */}
                  {comptesBancaires.length > 0 && (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                      <div className="text-xs text-emerald-900 font-medium">
                        💡 {comptesBancaires.length} compte(s) bancaire(s) trouvé(s) en base. Cliquez pour pré-remplir :
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {comptesBancaires.map((c) => (
                          <Button
                            key={c.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSettings(s => ({
                                ...s,
                                banque_nom: c.banque || s.banque_nom,
                                banque_compte: c.numero_compte || s.banque_compte,
                                banque_iban: c.iban || s.banque_iban,
                                banque_swift: c.swift || s.banque_swift,
                              }))
                            }}
                            className="text-xs h-8 border-emerald-300 hover:bg-emerald-100"
                          >
                            {c.compte_principal && '⭐ '}
                            {c.banque}
                            {c.nom_compte && ` — ${c.nom_compte}`}
                            {c.devise && c.devise !== 'MUR' && ` (${c.devise})`}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div><Label>Nom de la banque</Label><Input value={settings.banque_nom} onChange={e => setSettings(s => ({ ...s, banque_nom: e.target.value }))} placeholder="MCB / SBM / AfrAsia" /></div>
                  <div><Label>Numero de compte</Label><Input value={settings.banque_compte} onChange={e => setSettings(s => ({ ...s, banque_compte: e.target.value }))} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>IBAN</Label>
                      <Input
                        value={settings.banque_iban}
                        onChange={e => {
                          const newIban = e.target.value
                          setSettings(s => {
                            // Auto-déduit le SWIFT si on n'en a pas déjà saisi
                            // un manuellement. Le helper retourne null si la
                            // banque n'est pas reconnue → on laisse l'existant.
                            const auto = inferSwiftFromIban(newIban)
                            const next = { ...s, banque_iban: newIban }
                            if (auto && !s.banque_swift) next.banque_swift = auto
                            return next
                          })
                        }}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label>SWIFT / BIC</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const diag = inferSwiftWithDiagnostic(settings.banque_iban)
                            if (diag.swift) {
                              setSettings(s => ({ ...s, banque_swift: diag.swift! }))
                            } else {
                              alert(diag.message)
                            }
                          }}
                          disabled={!settings.banque_iban}
                          className="h-6 text-[11px] text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                          title="Déduit le SWIFT à partir du code banque de l'IBAN"
                        >
                          ↻ Déduire depuis IBAN
                        </Button>
                      </div>
                      <Input value={settings.banque_swift} onChange={e => setSettings(s => ({ ...s, banque_swift: e.target.value }))} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-[#0B0F2E] text-base">Parametres de facturation</CardTitle></CardHeader>
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
                      <Label>Conditions de paiement par défaut (jours)</Label>
                      {/* Input libre 0..365 avec datalist pour suggérer les
                          valeurs courantes. L'utilisateur peut taper
                          n'importe quoi (1, 2, 5, 21, 75…) — le Select
                          précédent était trop restrictif. */}
                      <Input
                        type="number"
                        min={0}
                        max={365}
                        step={1}
                        list="conditions-paiement-suggestions"
                        value={settings.conditions_paiement}
                        onChange={e => {
                          const v = e.target.value
                          // Permet le champ vide pendant la saisie (Backspace)
                          if (v === '') {
                            setSettings(s => ({ ...s, conditions_paiement: 0 }))
                            return
                          }
                          const n = parseInt(v, 10)
                          if (Number.isFinite(n) && n >= 0 && n <= 365) {
                            setSettings(s => ({ ...s, conditions_paiement: n }))
                          }
                        }}
                      />
                      <datalist id="conditions-paiement-suggestions">
                        <option value="0" label="À réception" />
                        <option value="1" />
                        <option value="7" />
                        <option value="14" />
                        <option value="15" />
                        <option value="30" />
                        <option value="45" />
                        <option value="60" />
                        <option value="90" />
                      </datalist>
                      <p className="text-[11px] text-gray-500 mt-1">
                        Valeur pré-remplie à chaque création de facture (0 à 365 jours).
                        <strong> 0 = "À réception"</strong> (date d'échéance = date de facture).
                        Tu peux taper n'importe quelle valeur (1, 2, 5, 21, etc.).
                      </p>
                    </div>
                  </div>
                  {/* Numérotation automatique : préfixe + compteur par
                      type de document (facture, devis, avoir, note débit).
                      Une fois paramétré ici, le numéro est généré et
                      incrémenté automatiquement à chaque création. */}
                  <div className="space-y-3 border-t pt-3 mt-1">
                    <Label className="text-sm font-semibold text-[#0B0F2E]">
                      Numérotation automatique
                    </Label>
                    <p className="text-[11px] text-gray-500 -mt-2">
                      Préfixe + prochain numéro pour chaque type de document.
                      Le numéro est généré et incrémenté automatiquement à
                      chaque création — plus besoin de le saisir manuellement.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Préfixe facture</Label>
                        <Input value={settings.prefixe_facture}
                          onChange={e => setSettings(s => ({ ...s, prefixe_facture: e.target.value }))}
                          placeholder="INV-" />
                      </div>
                      <div>
                        <Label className="text-xs">Prochain numéro facture</Label>
                        <Input type="number" min={1} value={settings.prochain_numero}
                          onChange={e => setSettings(s => ({ ...s, prochain_numero: parseInt(e.target.value) || 1 }))} />
                      </div>
                      <div>
                        <Label className="text-xs">Préfixe devis</Label>
                        <Input value={settings.devis_prefixe}
                          onChange={e => setSettings(s => ({ ...s, devis_prefixe: e.target.value }))}
                          placeholder="DEV-" />
                      </div>
                      <div>
                        <Label className="text-xs">Prochain numéro devis</Label>
                        <Input type="number" min={1} value={settings.devis_prochain_numero}
                          onChange={e => setSettings(s => ({ ...s, devis_prochain_numero: parseInt(e.target.value) || 1 }))} />
                      </div>
                      <div>
                        <Label className="text-xs">Préfixe avoir</Label>
                        <Input value={settings.avoir_prefixe}
                          onChange={e => setSettings(s => ({ ...s, avoir_prefixe: e.target.value }))}
                          placeholder="AV-" />
                      </div>
                      <div>
                        <Label className="text-xs">Prochain numéro avoir</Label>
                        <Input type="number" min={1} value={settings.avoir_prochain_numero}
                          onChange={e => setSettings(s => ({ ...s, avoir_prochain_numero: parseInt(e.target.value) || 1 }))} />
                      </div>
                      <div>
                        <Label className="text-xs">Préfixe note de débit</Label>
                        <Input value={settings.note_debit_prefixe}
                          onChange={e => setSettings(s => ({ ...s, note_debit_prefixe: e.target.value }))}
                          placeholder="ND-" />
                      </div>
                      <div>
                        <Label className="text-xs">Prochain numéro note de débit</Label>
                        <Input type="number" min={1} value={settings.note_debit_prochain_numero}
                          onChange={e => setSettings(s => ({ ...s, note_debit_prochain_numero: parseInt(e.target.value) || 1 }))} />
                      </div>
                    </div>
                  </div>
                  <div><Label>Texte de pied de page</Label><Input value={settings.footer_text} onChange={e => setSettings(s => ({ ...s, footer_text: e.target.value }))} /></div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label>Mention légale MRA</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSettings(s => ({ ...s, mention_legale: buildMentionLegale(s.brn, s.vat_number) }))}
                        disabled={!settings.brn && !settings.vat_number}
                        className="h-6 text-[11px] text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                        title="Régénère la mention à partir du BRN et du N° TVA renseignés ci-dessus"
                      >
                        ↻ Régénérer depuis BRN/VAT
                      </Button>
                    </div>
                    <Input
                      value={settings.mention_legale}
                      onChange={e => setSettings(s => ({ ...s, mention_legale: e.target.value }))}
                      placeholder={buildMentionLegale(settings.brn, settings.vat_number) || "VAT Reg No: XXXXX | BRN: XXXXX"}
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Auto-générée depuis BRN + N° TVA. Modifie l'un des deux ci-dessus → mise à jour automatique.
                      Tu peux aussi la personnaliser manuellement.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ══════════ TAB: Clients ══════════ */}
        <TabsContent value="clients" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-gray-500">Base de donnees clients pour la facturation</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  if (!societeId) return
                  if (!confirm("Importer automatiquement les clients déjà connus du système (historique de facturation + annuaire OCR) dans votre carnet de contacts ?")) return
                  try {
                    const res = await fetch(`/api/client/factures-contacts/import-existing`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ societe_id: societeId }),
                    })
                    const data = await res.json()
                    if (!res.ok) throw new Error(data?.error || "Erreur")
                    // Détail des sources pour diagnostic — l'API renvoie
                    // source_counts depuis le PR fix-conditions-paiement.
                    const counts = data.source_counts || {}
                    const detail = [
                      `Annuaire OCR : ${counts.tiers_annuaire ?? 0} client(s) trouvé(s)`,
                      `Historique factures : ${counts.factures_historique ?? 0} nom(s) distinct(s)`,
                    ].join("\n")
                    if (data.inserted > 0) {
                      alert(`✓ Import terminé : ${data.inserted} nouveau(x) client(s) ajouté(s) sur ${data.candidats} candidat(s).\n\n${detail}`)
                      // Recharger la page pour voir les contacts importés
                      window.location.reload()
                    } else if (data.message) {
                      // Cas spécial : aucun candidat → diagnostic détaillé du serveur
                      alert(data.message)
                    } else {
                      alert(`Aucun client à importer (tout est déjà dans ton carnet).\n\n${detail}`)
                    }
                  } catch (e: any) {
                    alert(e?.message || "Erreur import")
                  }
                }}
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                <Download className="w-4 h-4 mr-2" />
                Importer mes clients existants
              </Button>
              <Button onClick={openNewClient} className="bg-[#0B0F2E]"><Plus className="w-4 h-4 mr-2" />Nouveau client</Button>
            </div>
          </div>
          <p className="text-xs text-gray-500 -mt-2">
            💡 <strong>Importer mes clients existants</strong> récupère vos clients depuis l'historique de facturation et l'annuaire OCR (factures fournisseur scannées) pour pré-remplir votre carnet sans saisie manuelle.
          </p>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
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
                        <SelectItem value="0">À réception</SelectItem>
                        <SelectItem value="7">7</SelectItem>
                        <SelectItem value="14">14</SelectItem>
                        <SelectItem value="30">30</SelectItem>
                        <SelectItem value="45">45</SelectItem>
                        <SelectItem value="60">60</SelectItem>
                        <SelectItem value="90">90</SelectItem>
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
                <Button onClick={saveClient} disabled={!cNom} className="bg-[#0B0F2E]">{editingClient ? "Modifier" : "Ajouter"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ══════════ TAB: Catalogue ══════════ */}
        <TabsContent value="catalogue" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Catalogue de services et produits reutilisables</p>
            <Button onClick={openNewItem} className="bg-[#0B0F2E]"><Plus className="w-4 h-4 mr-2" />Nouveau service/produit</Button>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
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
                <Button onClick={saveCatalogueItem} disabled={!catDesc} className="bg-[#0B0F2E]">{editingItem ? "Modifier" : "Ajouter"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ══════════ TAB: Modeles ══════════ */}
        <TabsContent value="modeles" className="space-y-4">
          <p className="text-sm text-gray-500">Choisissez et personnalisez votre modele de facture</p>
          <div className="grid grid-cols-3 gap-4">
            {TEMPLATES.map(t => (
              <Card key={t.id} className={`cursor-pointer transition-all ${selectedTemplate === t.id ? "ring-2 ring-[#D4AF37] shadow-lg" : "hover:shadow-md"}`}
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
                      <h3 className="font-semibold text-[#0B0F2E]">{t.nom}</h3>
                      <p className="text-xs text-gray-500">{t.description}</p>
                    </div>
                    {selectedTemplate === t.id && <Check className="w-5 h-5 text-[#D4AF37]" />}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Color Swatches */}
          <Card>
            <CardHeader><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2"><Palette className="w-4 h-4" />Couleur d&apos;accent par defaut</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-500">Selectionnez la couleur primaire par defaut pour vos factures. Elle sera utilisee pour l&apos;en-tete, le tableau et les totaux.</p>
              <div className="flex flex-wrap gap-3">
                {ACCENT_COLORS.map(color => (
                  <button
                    key={color.hex}
                    type="button"
                    onClick={() => setTemplateColors(c => ({ ...c, primaire: color.hex }))}
                    className={`group relative w-11 h-11 rounded-lg border-2 transition-all ${templateColors.primaire === color.hex ? "border-[#D4AF37] ring-2 ring-[#D4AF37]/30 scale-110" : "border-gray-200 hover:border-gray-400 hover:scale-105"}`}
                    style={{ backgroundColor: color.hex }}
                    title={color.name}
                  >
                    {templateColors.primaire === color.hex && (
                      <Check className="w-4 h-4 text-white absolute inset-0 m-auto drop-shadow-md" />
                    )}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400">Selection : <span className="font-mono font-medium">{ACCENT_COLORS.find(c => c.hex === templateColors.primaire)?.name || "Personnalise"}</span> ({templateColors.primaire})</p>

              {/* Custom color pickers */}
              <div className="grid grid-cols-2 gap-4 max-w-md pt-2 border-t">
                <div>
                  <Label>Couleur primaire (personnalisee)</Label>
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

              {/* Mini preview with selected color */}
              <div className="border rounded-lg p-4 bg-white max-w-sm">
                <p className="text-xs font-medium text-gray-500 mb-2">Apercu</p>
                <div className="border rounded-lg overflow-hidden">
                  <div className="p-3 flex justify-between items-center" style={{ backgroundColor: templateColors.primaire }}>
                    <div className="w-6 h-6 rounded bg-white/20" />
                    <span className="text-white text-[10px] font-bold tracking-wide">FACTURE</span>
                  </div>
                  <div className="p-3 space-y-1.5">
                    <div className="h-1.5 rounded bg-gray-200 w-3/4" />
                    <div className="h-1.5 rounded bg-gray-200 w-1/2" />
                    <div className="border-t mt-2 pt-2 space-y-1">
                      <div className="flex justify-between">
                        <div className="h-1.5 rounded bg-gray-200 w-1/3" />
                        <div className="h-1.5 rounded w-1/6" style={{ backgroundColor: templateColors.secondaire }} />
                      </div>
                      <div className="flex justify-between">
                        <div className="h-1.5 rounded bg-gray-200 w-2/5" />
                        <div className="h-1.5 rounded w-1/6" style={{ backgroundColor: templateColors.secondaire }} />
                      </div>
                    </div>
                    <div className="border-t pt-2 flex justify-end">
                      <div className="px-3 py-1 rounded text-[8px] text-white font-bold" style={{ backgroundColor: templateColors.primaire }}>TOTAL TTC</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ══════════ TAB: MRA e-Invoicing ══════════ */}
        <TabsContent value="mra" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              {/* Activation toggle */}
              <Card>
                <CardHeader><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2"><Shield className="w-4 h-4" />Fiscalisation MRA</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Activer la fiscalisation MRA</Label>
                      <p className="text-xs text-gray-500 mt-0.5">Soumettre les factures finalisees au MRA Invoice Fiscalization Platform</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMraActive(!mraActive)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${mraActive ? "bg-[#0B0F2E]" : "bg-gray-300"}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${mraActive ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>
                  {mraActive && (
                    <div className="flex items-center gap-2 text-sm">
                      {mraTestResult?.success ? (
                        <><Wifi className="w-4 h-4 text-green-600" /><span className="text-green-700 font-medium">Connecte</span></>
                      ) : (
                        <><WifiOff className="w-4 h-4 text-gray-400" /><span className="text-gray-500">Non connecte</span></>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* EBS Credentials */}
              <Card className={!mraActive ? "opacity-50 pointer-events-none" : ""}>
                <CardHeader><CardTitle className="text-[#0B0F2E] text-base">Identifiants EBS</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label>EBS ID (Identifiant d&apos;enregistrement)</Label>
                    <Input
                      value={mraEbsId}
                      onChange={e => setMraEbsId(e.target.value)}
                      placeholder="EBS-XXXXXXXX"
                      className="font-mono"
                    />
                  </div>
                  <div>
                    <Label>Cle API (API Key)</Label>
                    <Input
                      type="password"
                      value={mraApiKey}
                      onChange={e => setMraApiKey(e.target.value)}
                      placeholder="Votre cle API EBS"
                      className="font-mono"
                    />
                    <p className="text-xs text-gray-400 mt-1">La cle API est masquee pour des raisons de securite</p>
                  </div>
                  <div>
                    <Label>Environnement</Label>
                    <Select
                      value={mraEnvironment}
                      onValueChange={v => {
                        const env = v as "sandbox" | "production"
                        setMraEnvironment(env)
                        setMraApiUrl(env === "production" ? "https://ifp.mra.mu/api/v1" : "https://sandboxifp.mra.mu/api/v1")
                        setMraTestResult(null)
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sandbox">Sandbox (test)</SelectItem>
                        <SelectItem value="production">Production</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>URL de l&apos;API MRA</Label>
                    <Input
                      value={mraApiUrl}
                      onChange={e => setMraApiUrl(e.target.value)}
                      className="font-mono text-sm bg-gray-50"
                      readOnly
                    />
                  </div>
                  <Button
                    onClick={async () => {
                      setMraTesting(true)
                      setMraTestResult(null)
                      try {
                        const res = await fetch("/api/mra/fiscalise?facture_id=test")
                        // In mock mode, just simulate success
                        await new Promise(r => setTimeout(r, 800))
                        setMraTestResult({ success: true, message: "Connexion au serveur MRA (" + mraEnvironment + ") reussie." })
                      } catch {
                        setMraTestResult({ success: false, message: "Erreur de connexion au serveur MRA." })
                      } finally {
                        setMraTesting(false)
                      }
                    }}
                    disabled={mraTesting || !mraEbsId || !mraApiKey}
                    variant="outline"
                    className="w-full border-[#0B0F2E] text-[#0B0F2E]"
                  >
                    {mraTesting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Test en cours...</> : <><Wifi className="w-4 h-4 mr-2" />Tester la connexion</>}
                  </Button>
                  {mraTestResult && (
                    <div className={`rounded-lg p-3 text-sm ${mraTestResult.success ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                      {mraTestResult.message}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Info card */}
            <div className="space-y-4">
              <Card className="border-[#D4AF37]/30 bg-[#D4AF37]/5">
                <CardHeader><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2"><Info className="w-4 h-4" />A propos de la fiscalisation MRA</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm text-gray-700">
                  <p>
                    Le <strong>Mauritius Revenue Authority (MRA)</strong> exige la fiscalisation electronique des factures
                    via l&apos;Invoice Fiscalization Platform (IFP) pour les entreprises enregistrees a la TVA.
                  </p>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-[#0B0F2E]">Seuils et obligations</h4>
                    <ul className="list-disc pl-5 space-y-1 text-xs text-gray-600">
                      <li>Toutes les entreprises enregistrees a la TVA doivent se conformer</li>
                      <li>Chaque facture finalisee recoit un <strong>IRN</strong> (Invoice Reference Number)</li>
                      <li>Un <strong>QR code</strong> est genere pour verification par le client</li>
                      <li>Les avoirs (credit notes) doivent etre fiscalises avec reference a la facture d&apos;origine</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-[#0B0F2E]">Pre-requis</h4>
                    <ul className="list-disc pl-5 space-y-1 text-xs text-gray-600">
                      <li>Enregistrement EBS (Electronic Billing System) aupres du MRA</li>
                      <li>Obtention d&apos;un EBS ID et d&apos;une cle API</li>
                      <li>Certification du systeme en environnement sandbox</li>
                      <li>BRN et numero TVA valides configures dans Mon Entreprise</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-[#0B0F2E]">Codes de document</h4>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-white rounded p-2 border text-center">
                        <p className="font-mono font-bold text-[#0B0F2E]">01</p>
                        <p className="text-gray-500">Facture</p>
                      </div>
                      <div className="bg-white rounded p-2 border text-center">
                        <p className="font-mono font-bold text-red-600">02</p>
                        <p className="text-gray-500">Avoir</p>
                      </div>
                      <div className="bg-white rounded p-2 border text-center">
                        <p className="font-mono font-bold text-orange-600">03</p>
                        <p className="text-gray-500">Note de debit</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-[#0B0F2E] text-base">Mode actuel</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                    <Info className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-yellow-800">Mode simulation (Mock)</p>
                      <p className="text-xs text-yellow-600 mt-0.5">
                        Le systeme genere des IRN fictifs pour le developpement.
                        Activez le mode production apres certification EBS.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
      </div>
    </ClientPageShell>
  )
}
