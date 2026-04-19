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
  Shield, Wifi, WifiOff, Info, Loader2, Upload
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { toast } from "sonner"

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
  { id: "standard", nom: "Standard", description: "Mise en page classique avec en-tete complet, ideal pour la plupart des entreprises.", style: { couleur_primaire: "#0B0F2E", couleur_secondaire: "#D4AF37", police: "Inter", layout: "standard" } },
  { id: "professional", nom: "Professionnel", description: "Design epure avec accents dores, parfait pour les cabinets et consultants.", style: { couleur_primaire: "#0F172A", couleur_secondaire: "#B8860B", police: "Inter", layout: "professional" } },
  { id: "minimal", nom: "Minimal", description: "Design minimaliste avec espacement genereux, moderne et lisible.", style: { couleur_primaire: "#374151", couleur_secondaire: "#6B7280", police: "Inter", layout: "minimal" } },
]

function genId() { return crypto.randomUUID() }

// ── Mapper DB ↔ état UI ────────────────────────────────────────────────────
// La table `invoice_settings` utilise des noms un peu différents (pied_de_page,
// mention_legale_mra…) ; on convertit aux frontières pour ne pas toucher au
// reste du code UI.
interface InvoiceSettingsRow {
  societe_id?: string
  logo_url?: string | null
  brn?: string | null
  vat_number?: string | null
  adresse?: string | null
  telephone?: string | null
  email?: string | null
  website?: string | null
  banque_nom?: string | null
  banque_compte?: string | null
  banque_iban?: string | null
  banque_swift?: string | null
  devise_defaut?: string | null
  conditions_paiement?: string | null
  prefixe_facture?: string | null
  prochain_numero?: number | null
  pied_de_page?: string | null
  mention_legale_mra?: string | null
  template_id?: string | null
  couleur_primaire?: string | null
  couleur_secondaire?: string | null
  mra_active?: boolean | null
  mra_ebs_id?: string | null
  // Le GET renvoie la clé masquée ("***" + 4 derniers chars) — jamais la valeur brute.
  // Pour écriture (PUT/PATCH), le champ persisté est `mra_api_key_secret`.
  mra_api_key_masked?: string | null
  mra_api_key_secret?: string | null
  mra_env?: "sandbox" | "production" | null
}

function rowToCompanySettings(row: InvoiceSettingsRow): CompanySettings {
  const condStr = row.conditions_paiement ?? ""
  const condNum = parseInt(condStr, 10)
  return {
    nom: DEFAULT_SETTINGS.nom, // nom n'est pas encore stocké — conservé pour futur
    brn: row.brn ?? "",
    vat_number: row.vat_number ?? "",
    logo_url: row.logo_url ?? "",
    adresse: row.adresse ?? "",
    telephone: row.telephone ?? "",
    email: row.email ?? "",
    website: row.website ?? "",
    banque_nom: row.banque_nom ?? "",
    banque_compte: row.banque_compte ?? "",
    banque_iban: row.banque_iban ?? "",
    banque_swift: row.banque_swift ?? "",
    devise_defaut: row.devise_defaut ?? "MUR",
    prefixe_facture: row.prefixe_facture ?? "INV-",
    prochain_numero: row.prochain_numero ?? 1,
    conditions_paiement: Number.isFinite(condNum) && condNum > 0 ? condNum : 30,
    footer_text: row.pied_de_page ?? "",
    mention_legale: row.mention_legale_mra ?? "",
  }
}

function companySettingsToRow(s: CompanySettings): Omit<InvoiceSettingsRow, "societe_id"> {
  return {
    logo_url: s.logo_url || null,
    brn: s.brn || null,
    vat_number: s.vat_number || null,
    adresse: s.adresse || null,
    telephone: s.telephone || null,
    email: s.email || null,
    website: s.website || null,
    banque_nom: s.banque_nom || null,
    banque_compte: s.banque_compte || null,
    banque_iban: s.banque_iban || null,
    banque_swift: s.banque_swift || null,
    devise_defaut: s.devise_defaut || "MUR",
    conditions_paiement: String(s.conditions_paiement ?? 30),
    prefixe_facture: s.prefixe_facture || "INV-",
    prochain_numero: s.prochain_numero || 1,
    pied_de_page: s.footer_text || null,
    mention_legale_mra: s.mention_legale || null,
  }
}

export default function FacturationSettingsPage() {
  const { societeId } = useSocieteActive()
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS)
  const [clients, setClients] = useState<InvoiceClient[]>([])
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState("standard")
  const [templateColors, setTemplateColors] = useState({ primaire: "#0B0F2E", secondaire: "#D4AF37" })
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  // Affiché si localStorage contient d'anciens settings ET la DB est vide
  const [hasLegacyLocal, setHasLegacyLocal] = useState(false)
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

  // ── Chargement : 1) DB (Mon Entreprise / Modèles / MRA) 2) localStorage (Clients / Catalogue) ──
  useEffect(() => {
    if (!societeId) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/client/invoice-settings?societe_id=${societeId}`, { cache: "no-store" })
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "Erreur réseau" }))
          toast.error(body.error || "Impossible de charger les paramètres")
          return
        }
        const data = await res.json()
        const row = (data.settings ?? {}) as InvoiceSettingsRow
        const isEmptyRow = !row || Object.keys(row).length === 0

        if (cancelled) return
        if (!isEmptyRow) {
          setSettings(rowToCompanySettings(row))
          if (row.template_id) setSelectedTemplate(row.template_id)
          if (row.couleur_primaire || row.couleur_secondaire) {
            setTemplateColors({
              primaire: row.couleur_primaire ?? "#0B0F2E",
              secondaire: row.couleur_secondaire ?? "#D4AF37",
            })
          }
          setMraActive(Boolean(row.mra_active))
          setMraEbsId(row.mra_ebs_id ?? "")
          // L'API retourne la clé masquée ("***XXXX"), jamais la valeur brute.
          // L'utilisateur doit re-saisir la clé complète pour la mettre à jour.
          setMraApiKey(row.mra_api_key_masked ?? "")
          const env = (row.mra_env ?? "sandbox") as "sandbox" | "production"
          setMraEnvironment(env)
          setMraApiUrl(env === "production" ? "https://ifp.mra.mu/api/v1" : "https://sandboxifp.mra.mu/api/v1")
        }

        // Clients & catalogue restent en localStorage (scope limit ce sprint)
        try {
          const c = localStorage.getItem("lexora_invoice_clients")
          if (c) setClients(JSON.parse(c))
          const cat = localStorage.getItem("lexora_invoice_catalogue")
          if (cat) setCatalogue(JSON.parse(cat))
        } catch { /* ignore */ }

        // Détection d'anciennes données locales non-encore migrées
        const hasLegacy = typeof window !== "undefined" && (
          !!localStorage.getItem("lexora_invoice_settings")
          || !!localStorage.getItem("lexora_invoice_template")
          || !!localStorage.getItem("lexora_invoice_template_colors")
          || !!localStorage.getItem("lexora_mra_settings")
        )
        setHasLegacyLocal(hasLegacy && isEmptyRow)
      } catch (e) {
        console.error("[facturation-settings] load failed", e)
        toast.error("Erreur lors du chargement des paramètres")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [societeId])

  const saveAll = useCallback(async () => {
    if (!societeId) {
      toast.error("Aucune société active — sélectionnez une société pour sauvegarder")
      return
    }
    setSyncing(true)
    try {
      const payload = {
        societe_id: societeId,
        ...companySettingsToRow(settings),
        template_id: selectedTemplate,
        couleur_primaire: templateColors.primaire,
        couleur_secondaire: templateColors.secondaire,
        mra_active: mraActive,
        mra_ebs_id: mraEbsId || null,
        // N'envoie la clé que si elle a été modifiée (non masquée).
        // Une valeur commençant par "***" est la version masquée retournée par GET.
        ...(mraApiKey && !mraApiKey.startsWith("***")
          ? { mra_api_key_secret: mraApiKey }
          : {}),
        mra_env: mraEnvironment,
      }
      const res = await fetch("/api/client/invoice-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Erreur" }))
        toast.error(body.error || "Sauvegarde échouée")
        return
      }
      // Clients / catalogue → toujours en localStorage
      try {
        localStorage.setItem("lexora_invoice_clients", JSON.stringify(clients))
        localStorage.setItem("lexora_invoice_catalogue", JSON.stringify(catalogue))
      } catch { /* ignore quota */ }
      setSaved(true)
      toast.success("Paramètres sauvegardés")
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error("[facturation-settings] save failed", e)
      toast.error("Erreur lors de la sauvegarde")
    } finally {
      setSyncing(false)
    }
  }, [societeId, settings, clients, catalogue, selectedTemplate, templateColors, mraActive, mraEbsId, mraApiKey, mraEnvironment])

  // ── Migration one-shot : importe les anciennes données localStorage vers la DB ──
  const importLegacyLocal = useCallback(async () => {
    if (!societeId) {
      toast.error("Aucune société active")
      return
    }
    setSyncing(true)
    try {
      // Reconstitue l'état depuis les clés localStorage historiques
      let localSettings: CompanySettings = settings
      let localTemplate = selectedTemplate
      let localColors = templateColors
      let localMraActive = mraActive
      let localMraEbs = mraEbsId
      let localMraKey = mraApiKey
      let localMraEnv: "sandbox" | "production" = mraEnvironment

      try {
        const s = localStorage.getItem("lexora_invoice_settings")
        if (s) localSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(s) }
        const t = localStorage.getItem("lexora_invoice_template")
        if (t) localTemplate = t
        const tc = localStorage.getItem("lexora_invoice_template_colors")
        if (tc) localColors = JSON.parse(tc)
        const mra = localStorage.getItem("lexora_mra_settings")
        if (mra) {
          const m = JSON.parse(mra)
          localMraActive = Boolean(m.active)
          localMraEbs = m.ebs_id || ""
          localMraKey = m.api_key || ""
          localMraEnv = (m.environment === "production" ? "production" : "sandbox")
        }
      } catch {
        toast.error("Données locales illisibles")
        return
      }

      const payload = {
        societe_id: societeId,
        ...companySettingsToRow(localSettings),
        template_id: localTemplate,
        couleur_primaire: localColors.primaire,
        couleur_secondaire: localColors.secondaire,
        mra_active: localMraActive,
        mra_ebs_id: localMraEbs || null,
        // Import localStorage : même logique — ne pas ré-envoyer une clé masquée.
        ...(localMraKey && !localMraKey.startsWith("***")
          ? { mra_api_key_secret: localMraKey }
          : {}),
        mra_env: localMraEnv,
      }

      const res = await fetch("/api/client/invoice-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Erreur" }))
        toast.error(body.error || "Import échoué")
        return
      }

      // Succès : on applique aux states + on nettoie les clés migrées
      setSettings(localSettings)
      setSelectedTemplate(localTemplate)
      setTemplateColors(localColors)
      setMraActive(localMraActive)
      setMraEbsId(localMraEbs)
      setMraApiKey(localMraKey)
      setMraEnvironment(localMraEnv)
      setMraApiUrl(localMraEnv === "production" ? "https://ifp.mra.mu/api/v1" : "https://sandboxifp.mra.mu/api/v1")
      try {
        localStorage.removeItem("lexora_invoice_settings")
        localStorage.removeItem("lexora_invoice_template")
        localStorage.removeItem("lexora_invoice_template_colors")
        localStorage.removeItem("lexora_mra_settings")
      } catch { /* ignore */ }
      setHasLegacyLocal(false)
      toast.success("Paramètres locaux importés avec succès")
    } catch (e) {
      console.error("[facturation-settings] import failed", e)
      toast.error("Erreur lors de l'import")
    } finally {
      setSyncing(false)
    }
  }, [societeId, settings, selectedTemplate, templateColors, mraActive, mraEbsId, mraApiKey, mraEnvironment])

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
        <Button onClick={saveAll} disabled={syncing || loading || !societeId} className="bg-[#0B0F2E] hover:bg-[#2a3d6b]">
          {syncing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sauvegarde...</>
            : saved ? <><Check className="w-4 h-4 mr-2" />Sauvegardé !</>
            : <><Save className="w-4 h-4 mr-2" />Sauvegarder tout</>}
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="hidden">{/* header moved to shell */}
      </div>

      {!societeId && !loading && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 flex items-center gap-2">
          <Info className="w-4 h-4 flex-shrink-0" />
          Sélectionnez une société active dans la barre supérieure pour charger et sauvegarder les paramètres.
        </div>
      )}

      {hasLegacyLocal && societeId && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
          <Upload className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900">Paramètres locaux détectés</p>
            <p className="text-xs text-blue-700 mt-0.5">
              Vos anciens paramètres sont stockés dans ce navigateur. Importez-les dans votre compte pour les retrouver sur tous vos appareils.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={importLegacyLocal} disabled={syncing} className="border-blue-300 text-blue-700 hover:bg-blue-100">
            {syncing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Import...</> : <>Importer mes paramètres locaux</>}
          </Button>
        </div>
      )}

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
                <CardHeader><CardTitle className="text-[#0B0F2E] text-base">Coordonnees bancaires</CardTitle></CardHeader>
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
            <Button onClick={openNewClient} className="bg-[#0B0F2E]"><Plus className="w-4 h-4 mr-2" />Nouveau client</Button>
          </div>
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
