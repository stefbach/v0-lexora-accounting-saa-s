"use client"

import { useState, useEffect, useCallback } from "react"
import { useSearchParams } from "next/navigation"
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
  Shield, Wifi, WifiOff, Info, Loader2, Download, Upload, Sparkles, FileText
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { LogoUploader } from "@/components/client/LogoUploader"
import { inferSwiftFromIban, inferSwiftWithDiagnostic } from "@/lib/banque/iban-swift"
import { t, getLocale, type Locale } from '@/lib/i18n'
import { ACTIVE_TEMPLATE_LS_KEY, toAiTemplateId, parseAiTemplateId } from '@/lib/factures/active-template'

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
// Template extrait par l'IA depuis un PDF/image uploadé par l'utilisateur,
// persisté dans la table `facture_templates`. À ne pas confondre avec les
// 3 templates hardcoded (standard / professional / minimal).
interface AiFactureTemplate {
  id: string
  societe_id: string
  nom: string
  couleur_primaire: string | null
  couleur_secondaire: string | null
  logo_position: string | null
  entete_html: string | null
  pied_page_html: string | null
  colonnes: string[] | null
  mentions_legales: string | null
  conditions_paiement: string | null
  devise_defaut: string | null
  tva_defaut: number | null
  format_numero: string | null
  style: Record<string, unknown> | null
  source_fichier: string | null
  consignes_ia: string | null
  created_at: string
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

function getTemplates(locale: Locale): InvoiceTemplate[] {
  return [
    { id: "standard", nom: t('inv.fs.tpl_standard_name', locale), description: t('inv.fs.tpl_standard_desc', locale), style: { couleur_primaire: "#0B0F2E", couleur_secondaire: "#D4AF37", police: "Inter", layout: "standard" } },
    { id: "professional", nom: t('inv.fs.tpl_pro_name', locale), description: t('inv.fs.tpl_pro_desc', locale), style: { couleur_primaire: "#0F172A", couleur_secondaire: "#B8860B", police: "Inter", layout: "professional" } },
    { id: "minimal", nom: t('inv.fs.tpl_minimal_name', locale), description: t('inv.fs.tpl_minimal_desc', locale), style: { couleur_primaire: "#374151", couleur_secondaire: "#6B7280", police: "Inter", layout: "minimal" } },
  ]
}

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
  const locale = getLocale()
  const { societeId, societe, refresh } = useSocieteActive()
  // Onglet actif : lu depuis ?tab= dans l'URL (le redirect depuis
  // /client/facture-template arrive avec ?tab=modeles, idem depuis le
  // menu latéral si on veut deep-link vers un tab précis).
  const searchParams = useSearchParams()
  const requestedTab = searchParams?.get('tab') || ''
  const VALID_TABS = ['entreprise', 'clients', 'catalogue', 'modeles', 'mra']
  const initialTab = VALID_TABS.includes(requestedTab) ? requestedTab : 'entreprise'
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_SETTINGS)
  const [persisting, setPersisting] = useState(false)
  const [persistError, setPersistError] = useState<string | null>(null)
  const [comptesBancaires, setComptesBancaires] = useState<CompteBancaireBrief[]>([])
  const [clients, setClients] = useState<InvoiceClient[]>([])
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState("standard")
  const [templateColors, setTemplateColors] = useState({ primaire: "#0B0F2E", secondaire: "#D4AF37" })
  // Templates IA générés à partir de factures uploadées par l'utilisateur.
  // Persistés dans la table `facture_templates` côté serveur.
  const [aiTemplates, setAiTemplates] = useState<AiFactureTemplate[]>([])
  const [aiTemplatesLoading, setAiTemplatesLoading] = useState(false)
  const [aiUploadFile, setAiUploadFile] = useState<File | null>(null)
  const [aiUploadConsignes, setAiUploadConsignes] = useState("")
  const [aiUploading, setAiUploading] = useState(false)
  const [aiUploadError, setAiUploadError] = useState<string | null>(null)
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
      const tplStored = localStorage.getItem(ACTIVE_TEMPLATE_LS_KEY)
      if (tplStored) setSelectedTemplate(tplStored)
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

    // DB > localStorage pour le template actif : mig 287
    // (societes.facture_template_id) prend le pas s'il est défini.
    const dbTemplateId = (societe as { facture_template_id?: string | null } | null)?.facture_template_id
    if (dbTemplateId) setSelectedTemplate(toAiTemplateId(dbTemplateId))
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

  // Charge les templates de facture générés par IA pour la société active.
  const loadAiTemplates = useCallback(async () => {
    if (!societeId) {
      setAiTemplates([])
      return
    }
    setAiTemplatesLoading(true)
    try {
      const res = await fetch('/api/client/facture-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', societe_id: societeId }),
      })
      const data = await res.json()
      if (res.ok && Array.isArray(data.templates)) {
        setAiTemplates(data.templates)
      } else {
        setAiTemplates([])
      }
    } catch {
      setAiTemplates([])
    } finally {
      setAiTemplatesLoading(false)
    }
  }, [societeId])

  useEffect(() => { loadAiTemplates() }, [loadAiTemplates])

  // Upload d'une facture existante (PDF/image) + consignes utilisateur.
  // L'analyse Claude prend 10-30s ; on désactive le bouton pendant.
  const handleAiTemplateUpload = useCallback(async () => {
    if (!aiUploadFile || !societeId) return
    setAiUploading(true)
    setAiUploadError(null)
    try {
      const fd = new FormData()
      fd.append('file', aiUploadFile)
      fd.append('societe_id', societeId)
      if (aiUploadConsignes.trim()) fd.append('consignes', aiUploadConsignes.trim())
      const res = await fetch('/api/client/facture-template', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok || !data.saved) {
        throw new Error(data.error || 'Échec de l\'analyse')
      }
      setAiUploadFile(null)
      setAiUploadConsignes("")
      await loadAiTemplates()
    } catch (e: unknown) {
      setAiUploadError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setAiUploading(false)
    }
  }, [aiUploadFile, aiUploadConsignes, societeId, loadAiTemplates])

  const handleAiTemplateDelete = useCallback(async (id: string) => {
    if (!societeId) return
    if (!confirm('Supprimer ce template ?')) return
    try {
      const res = await fetch('/api/client/facture-template', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, societe_id: societeId }),
      })
      if (res.ok) {
        if (selectedTemplate === toAiTemplateId(id)) setSelectedTemplate('standard')
        await loadAiTemplates()
        return
      }
      // L'API peut échouer (template déjà supprimé, perte de session, etc.).
      // On affiche dans la même bande d'erreur que l'upload pour rester
      // discret — l'utilisateur peut réessayer ou recharger la page.
      const data = await res.json().catch(() => ({}))
      setAiUploadError(data?.error || 'Suppression échouée. Réessaie.')
    } catch (e: unknown) {
      setAiUploadError(e instanceof Error ? e.message : 'Erreur réseau pendant la suppression.')
    }
  }, [societeId, selectedTemplate, loadAiTemplates])

  const saveAll = useCallback(async () => {
    // 1. localStorage : conserve les paramètres pas encore migrés en DB
    //    (clients legacy, catalogue legacy, template choisi, MRA). Quand
    //    le composant catalogue / contacts DB sera la source unique, on
    //    pourra retirer ces lignes.
    localStorage.setItem("lexora_invoice_settings", JSON.stringify(settings))
    localStorage.setItem("lexora_invoice_clients", JSON.stringify(clients))
    localStorage.setItem("lexora_invoice_catalogue", JSON.stringify(catalogue))
    localStorage.setItem(ACTIVE_TEMPLATE_LS_KEY, selectedTemplate)
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
          // Mig 287 : persiste le template actif côté société. Pour les
          // templates hardcoded (standard/professional/minimal), on stocke null.
          facture_template_id:          parseAiTemplateId(selectedTemplate),
        }
        const res = await fetch(`/api/client/societes?id=${societeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || t('inv.fs.persist_err_default', locale))
        await refresh()
      } catch (e: any) {
        setPersistError(e?.message || t('inv.fs.persist_err_db', locale))
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
      breadcrumbs={[{ label: t('inv.fs.client_area', locale), href: "/client" }, { label: t('inv.fs.title', locale) }]}
      kicker="Facturation"
      title={t('inv.fs.title', locale)}
      subtitle={t('inv.fs.subtitle', locale)}
      actions={
        <div className="flex items-center gap-3">
          {persistError && (
            <span className="text-xs text-red-600 max-w-xs truncate" title={persistError}>
              ⚠ {persistError}
            </span>
          )}
          <Button onClick={saveAll} disabled={persisting} className="bg-[#0B0F2E] hover:bg-[#2a3d6b]">
            {persisting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('inv.fs.saving', locale)}</>
            ) : saved ? (
              <><Check className="w-4 h-4 mr-2" />{t('inv.fs.saved', locale)}</>
            ) : (
              <><Save className="w-4 h-4 mr-2" />{t('inv.fs.save_all', locale)}</>
            )}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="hidden">{/* header moved to shell */}
      </div>

      <Tabs defaultValue={initialTab} className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="entreprise" className="flex items-center gap-1.5"><Building2 className="w-4 h-4" />{t('inv.fs.tab_company', locale)}</TabsTrigger>
          <TabsTrigger value="clients" className="flex items-center gap-1.5"><Users className="w-4 h-4" />{t('inv.fs.tab_clients', locale)}</TabsTrigger>
          <TabsTrigger value="catalogue" className="flex items-center gap-1.5"><Package className="w-4 h-4" />{t('inv.fs.tab_catalogue', locale)}</TabsTrigger>
          <TabsTrigger value="modeles" className="flex items-center gap-1.5"><Layout className="w-4 h-4" />{t('inv.fs.tab_templates', locale)}</TabsTrigger>
          <TabsTrigger value="mra" className="flex items-center gap-1.5"><Shield className="w-4 h-4" />MRA e-Invoicing</TabsTrigger>
        </TabsList>

        {/* ══════════ TAB: Mon Entreprise ══════════ */}
        <TabsContent value="entreprise" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Company identity */}
            <Card>
              <CardHeader><CardTitle className="text-[#0B0F2E] text-base">{t('inv.fs.company_identity', locale)}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div><Label>{t('inv.fs.company_name_label', locale)}</Label><Input value={settings.nom} onChange={e => setSettings(s => ({ ...s, nom: e.target.value }))} placeholder="DDS Consulting Ltd" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t('inv.fs.brn_label', locale)}</Label><Input value={settings.brn} onChange={e => {
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
                  <div><Label>{t('inv.fs.vat_label', locale)}</Label><Input value={settings.vat_number} onChange={e => {
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
                  <Label>{t('inv.fs.logo_label', locale)}</Label>
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
                <div><Label>{t('inv.fs.address_label', locale)}</Label><Textarea value={settings.adresse} onChange={e => setSettings(s => ({ ...s, adresse: e.target.value }))} placeholder="Port Louis, Mauritius" rows={2} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t('inv.fs.phone_label', locale)}</Label><Input value={settings.telephone} onChange={e => setSettings(s => ({ ...s, telephone: e.target.value }))} placeholder="+230 xxx xxxx" /></div>
                  <div><Label>{t('inv.fs.email_label', locale)}</Label><Input value={settings.email} onChange={e => setSettings(s => ({ ...s, email: e.target.value }))} placeholder="info@company.mu" /></div>
                </div>
                <div><Label>{t('inv.fs.website_label', locale)}</Label><Input value={settings.website} onChange={e => setSettings(s => ({ ...s, website: e.target.value }))} placeholder="https://www.company.mu" /></div>
              </CardContent>
            </Card>

            {/* Bank details & invoicing */}
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-[#0B0F2E] text-base">{t('inv.fs.bank_details_section', locale)}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {/* Importer depuis un compte bancaire existant (mig 010/043).
                      L'utilisateur a souvent déjà saisi ses RIB via la page
                      /client/banque : pas la peine de les retaper ici. */}
                  {comptesBancaires.length > 0 && (
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                      <div className="text-xs text-emerald-900 font-medium">
                        💡 {comptesBancaires.length} {t('inv.fs.bank_accounts_found', locale)}
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
                  <div><Label>{t('inv.fs.bank_name_label', locale)}</Label><Input value={settings.banque_nom} onChange={e => setSettings(s => ({ ...s, banque_nom: e.target.value }))} placeholder="MCB / SBM / AfrAsia" /></div>
                  <div><Label>{t('inv.fs.account_number_label', locale)}</Label><Input value={settings.banque_compte} onChange={e => setSettings(s => ({ ...s, banque_compte: e.target.value }))} /></div>
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
                        <Label>{t('inv.fs.swift_bic_label', locale)}</Label>
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
                          title={t('inv.fs.deduce_swift_title', locale)}
                        >
                          {t('inv.fs.deduce_swift_btn', locale)}
                        </Button>
                      </div>
                      <Input value={settings.banque_swift} onChange={e => setSettings(s => ({ ...s, banque_swift: e.target.value }))} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-[#0B0F2E] text-base">{t('inv.fs.invoicing_params_title', locale)}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>{t('inv.fs.default_currency_label', locale)}</Label>
                      <Select value={settings.devise_defaut} onValueChange={v => setSettings(s => ({ ...s, devise_defaut: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{["MUR", "EUR", "USD", "GBP"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{t('inv.fs.default_payment_terms', locale)}</Label>
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
                        <option value="0" label={t('inv.fs.on_receipt', locale)} />
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
                        {t('inv.fs.payment_terms_help', locale)}
                      </p>
                    </div>
                  </div>
                  {/* Numérotation automatique : préfixe + compteur par
                      type de document (facture, devis, avoir, note débit).
                      Une fois paramétré ici, le numéro est généré et
                      incrémenté automatiquement à chaque création. */}
                  <div className="space-y-3 border-t pt-3 mt-1">
                    <Label className="text-sm font-semibold text-[#0B0F2E]">
                      {t('inv.fs.auto_numbering_label', locale)}
                    </Label>
                    <p className="text-[11px] text-gray-500 -mt-2">
                      {t('inv.fs.auto_numbering_help', locale)}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">{t('inv.fs.invoice_prefix', locale)}</Label>
                        <Input value={settings.prefixe_facture}
                          onChange={e => setSettings(s => ({ ...s, prefixe_facture: e.target.value }))}
                          placeholder="INV-" />
                      </div>
                      <div>
                        <Label className="text-xs">{t('inv.fs.next_invoice_no', locale)}</Label>
                        <Input type="number" min={1} value={settings.prochain_numero}
                          onChange={e => setSettings(s => ({ ...s, prochain_numero: parseInt(e.target.value) || 1 }))} />
                      </div>
                      <div>
                        <Label className="text-xs">{t('inv.fs.quote_prefix', locale)}</Label>
                        <Input value={settings.devis_prefixe}
                          onChange={e => setSettings(s => ({ ...s, devis_prefixe: e.target.value }))}
                          placeholder="DEV-" />
                      </div>
                      <div>
                        <Label className="text-xs">{t('inv.fs.next_quote_no', locale)}</Label>
                        <Input type="number" min={1} value={settings.devis_prochain_numero}
                          onChange={e => setSettings(s => ({ ...s, devis_prochain_numero: parseInt(e.target.value) || 1 }))} />
                      </div>
                      <div>
                        <Label className="text-xs">{t('inv.fs.credit_prefix', locale)}</Label>
                        <Input value={settings.avoir_prefixe}
                          onChange={e => setSettings(s => ({ ...s, avoir_prefixe: e.target.value }))}
                          placeholder="AV-" />
                      </div>
                      <div>
                        <Label className="text-xs">{t('inv.fs.next_credit_no', locale)}</Label>
                        <Input type="number" min={1} value={settings.avoir_prochain_numero}
                          onChange={e => setSettings(s => ({ ...s, avoir_prochain_numero: parseInt(e.target.value) || 1 }))} />
                      </div>
                      <div>
                        <Label className="text-xs">{t('inv.fs.debit_prefix', locale)}</Label>
                        <Input value={settings.note_debit_prefixe}
                          onChange={e => setSettings(s => ({ ...s, note_debit_prefixe: e.target.value }))}
                          placeholder="ND-" />
                      </div>
                      <div>
                        <Label className="text-xs">{t('inv.fs.next_debit_no', locale)}</Label>
                        <Input type="number" min={1} value={settings.note_debit_prochain_numero}
                          onChange={e => setSettings(s => ({ ...s, note_debit_prochain_numero: parseInt(e.target.value) || 1 }))} />
                      </div>
                    </div>
                  </div>
                  <div><Label>{t('inv.fs.footer_text_label', locale)}</Label><Input value={settings.footer_text} onChange={e => setSettings(s => ({ ...s, footer_text: e.target.value }))} /></div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label>{t('inv.fs.legal_mention_mra', locale)}</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSettings(s => ({ ...s, mention_legale: buildMentionLegale(s.brn, s.vat_number) }))}
                        disabled={!settings.brn && !settings.vat_number}
                        className="h-6 text-[11px] text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                        title={t('inv.fs.regen_legal_title', locale)}
                      >
                        {t('inv.fs.regen_legal_btn', locale)}
                      </Button>
                    </div>
                    <Input
                      value={settings.mention_legale}
                      onChange={e => setSettings(s => ({ ...s, mention_legale: e.target.value }))}
                      placeholder={buildMentionLegale(settings.brn, settings.vat_number) || "VAT Reg No: XXXXX | BRN: XXXXX"}
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      {t('inv.fs.legal_help', locale)}
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
            <p className="text-sm text-gray-500">{t('inv.fs.clients_db', locale)}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  if (!societeId) return
                  if (!confirm(t('inv.fs.import_clients_confirm', locale))) return
                  try {
                    const res = await fetch(`/api/client/factures-contacts/import-existing`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ societe_id: societeId }),
                    })
                    const data = await res.json()
                    if (!res.ok) throw new Error(data?.error || t('inv.nf.err_generic', locale))
                    // Détail des sources pour diagnostic — l'API renvoie
                    // source_counts depuis le PR fix-conditions-paiement.
                    const counts = data.source_counts || {}
                    const detail = [
                      `Annuaire OCR : ${counts.tiers_annuaire ?? 0} client(s) trouvé(s)`,
                      `Historique factures : ${counts.factures_historique ?? 0} nom(s) distinct(s)`,
                    ].join("\n")
                    if (data.inserted > 0) {
                      alert(`${t('inv.fs.import_done', locale).replace('{n}', String(data.inserted)).replace('{c}', String(data.candidats))}\n\n${detail}`)
                      // Recharger la page pour voir les contacts importés
                      window.location.reload()
                    } else if (data.message) {
                      // Cas spécial : aucun candidat → diagnostic détaillé du serveur
                      alert(data.message)
                    } else {
                      alert(`${t('inv.fs.import_none', locale)}\n\n${detail}`)
                    }
                  } catch (e: any) {
                    alert(e?.message || t('inv.fs.import_err', locale))
                  }
                }}
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                <Download className="w-4 h-4 mr-2" />
                {t('inv.fs.import_existing_clients', locale)}
              </Button>
              <Button onClick={openNewClient} className="bg-[#0B0F2E]"><Plus className="w-4 h-4 mr-2" />{t('inv.fs.new_client', locale)}</Button>
            </div>
          </div>
          <p className="text-xs text-gray-500 -mt-2">
            {t('inv.fs.import_help', locale)}
          </p>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {clients.length === 0 ? (
                <div className="text-center py-12 text-gray-500">{t('inv.fs.no_clients', locale)}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('inv.fs.col_name', locale)}</TableHead><TableHead>{t('inv.fs.col_company', locale)}</TableHead><TableHead>{t('inv.fs.col_email', locale)}</TableHead>
                      <TableHead>{t('inv.fs.col_vat', locale)}</TableHead><TableHead>{t('inv.fs.col_currency', locale)}</TableHead><TableHead>{t('inv.fs.col_type', locale)}</TableHead>
                      <TableHead className="text-right">{t('inv.fs.col_actions', locale)}</TableHead>
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
                            ? <Badge className="bg-blue-100 text-blue-700">{t('inv.fs.offshore_export', locale)}</Badge>
                            : <Badge className="bg-green-100 text-green-700">{t('inv.fs.local_mauritius', locale)}</Badge>
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
              <DialogHeader><DialogTitle>{editingClient ? t('inv.fs.edit_client', locale) : t('inv.fs.new_client_dialog', locale)}</DialogTitle></DialogHeader>
              <div className="grid gap-3 py-2">
                <div><Label>{t('inv.fs.name_required', locale)}</Label><Input value={cNom} onChange={e => setCNom(e.target.value)} placeholder={t('inv.fs.full_name', locale)} /></div>
                <div><Label>{t('inv.fs.company_dialog', locale)}</Label><Input value={cEntreprise} onChange={e => setCEntreprise(e.target.value)} placeholder={t('inv.fs.company_name_dialog', locale)} /></div>
                <div><Label>{t('inv.fs.address_dialog', locale)}</Label><Textarea value={cAdresse} onChange={e => setCAdresse(e.target.value)} rows={2} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t('inv.fs.col_email', locale)}</Label><Input value={cEmail} onChange={e => setCEmail(e.target.value)} type="email" /></div>
                  <div><Label>{t('inv.fs.phone_dialog', locale)}</Label><Input value={cTelephone} onChange={e => setCTelephone(e.target.value)} /></div>
                </div>
                <div><Label>{t('inv.fs.vat_label', locale)}</Label><Input value={cVat} onChange={e => setCVat(e.target.value)} /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>{t('inv.fs.col_currency', locale)}</Label>
                    <Select value={cDevise} onValueChange={setCDevise}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["MUR", "EUR", "USD", "GBP"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t('inv.fs.payment_days', locale)}</Label>
                    <Select value={String(cConditions)} onValueChange={v => setCConditions(parseInt(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">{t('inv.fs.on_receipt', locale)}</SelectItem>
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
                    <Label>{t('inv.fs.col_type', locale)}</Label>
                    <Select value={cOffshore ? "offshore" : "local"} onValueChange={v => setCOffshore(v === "offshore")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="local">{t('inv.fs.local_mauritius_vat', locale)}</SelectItem>
                        <SelectItem value="offshore">{t('inv.fs.offshore_zero', locale)}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setClientDialog(false)}>{t('inv.fs.cancel', locale)}</Button>
                <Button onClick={saveClient} disabled={!cNom} className="bg-[#0B0F2E]">{editingClient ? t('inv.fs.modify', locale) : t('inv.fs.add', locale)}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ══════════ TAB: Catalogue ══════════ */}
        <TabsContent value="catalogue" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{t('inv.fs.catalogue_subtitle', locale)}</p>
            <Button onClick={openNewItem} className="bg-[#0B0F2E]"><Plus className="w-4 h-4 mr-2" />{t('inv.fs.new_service_product', locale)}</Button>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {catalogue.length === 0 ? (
                <div className="text-center py-12 text-gray-500">{t('inv.fs.no_catalogue', locale)}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('inv.fs.col_description', locale)}</TableHead><TableHead>{t('inv.fs.col_category', locale)}</TableHead>
                      <TableHead className="text-right">{t('inv.fs.col_unit_price', locale)}</TableHead><TableHead>{t('inv.fs.col_currency', locale)}</TableHead>
                      <TableHead>{t('inv.fs.col_vat_short', locale)}</TableHead><TableHead className="text-right">{t('inv.fs.col_actions', locale)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catalogue.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.description}</TableCell>
                        <TableCell>{item.categorie || "-"}</TableCell>
                        <TableCell className="text-right font-mono">{item.prix_unitaire.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell><Badge variant="outline">{item.devise}</Badge></TableCell>
                        <TableCell>{item.tva_applicable ? <Badge className="bg-orange-100 text-orange-700">{t('inv.fs.vat_15', locale)}</Badge> : <Badge className="bg-gray-100 text-gray-600">{t('inv.fs.zero_rated', locale)}</Badge>}</TableCell>
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
              <DialogHeader><DialogTitle>{editingItem ? t('inv.fs.modify_dialog', locale) : t('inv.fs.new_service_product', locale)}</DialogTitle></DialogHeader>
              <div className="grid gap-3 py-2">
                <div><Label>{t('inv.fs.cat_desc_required', locale)}</Label><Input value={catDesc} onChange={e => setCatDesc(e.target.value)} placeholder={t('inv.fs.cat_desc_placeholder', locale)} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>{t('inv.fs.cat_unit_price', locale)}</Label><Input type="number" value={catPrix} onChange={e => setCatPrix(e.target.value)} placeholder="0.00" /></div>
                  <div>
                    <Label>{t('inv.fs.cat_currency', locale)}</Label>
                    <Select value={catDevise} onValueChange={setCatDevise}><SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["MUR", "EUR", "USD", "GBP"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>{t('inv.fs.cat_category', locale)}</Label><Input value={catCategorie} onChange={e => setCatCategorie(e.target.value)} placeholder={t('inv.fs.cat_category_placeholder', locale)} /></div>
                <div>
                  <Label>{t('inv.fs.vat_applicable', locale)}</Label>
                  <Select value={catTva ? "oui" : "non"} onValueChange={v => setCatTva(v === "oui")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="oui">{t('inv.fs.yes_vat_15', locale)}</SelectItem>
                      <SelectItem value="non">{t('inv.fs.no_zero_rated', locale)}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCatalogueDialog(false)}>{t('inv.fs.cancel', locale)}</Button>
                <Button onClick={saveCatalogueItem} disabled={!catDesc} className="bg-[#0B0F2E]">{editingItem ? t('inv.fs.modify', locale) : t('inv.fs.add', locale)}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ══════════ TAB: Modeles ══════════ */}
        <TabsContent value="modeles" className="space-y-4">
          <p className="text-sm text-gray-500">{t('inv.fs.templates_subtitle', locale)}</p>

          {/* ── Upload d'une facture existante pour créer un template IA ── */}
          <Card className="border-dashed border-2 border-[#D4AF37]/40 bg-gradient-to-br from-[#D4AF37]/5 to-transparent">
            <CardHeader>
              <CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                Créer un modèle à partir d'une facture existante
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-gray-600">
                Uploade une ancienne facture (PDF, PNG, JPG, WebP, max 20 MB) et ajoute tes consignes pour que l'IA extraie un modèle réutilisable.
              </p>
              {!settings.logo_url && (
                <div className="text-xs text-[#A88925] bg-[#D4AF37]/10 px-3 py-2 rounded flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>
                    Aucun logo société uploadé. Pour que le modèle reprenne ton logo en en-tête,
                    ajoute-le d'abord dans l'onglet <span className="font-semibold">Identité</span>.
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Fichier facture</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
                      onChange={e => setAiUploadFile(e.target.files?.[0] || null)}
                      disabled={aiUploading}
                      className="text-sm"
                    />
                  </div>
                  {aiUploadFile && (
                    <p className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {aiUploadFile.name} ({(aiUploadFile.size / 1024 / 1024).toFixed(2)} MB)
                    </p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Consignes pour l'IA (optionnel)</Label>
                  <Textarea
                    value={aiUploadConsignes}
                    onChange={e => setAiUploadConsignes(e.target.value)}
                    placeholder={`Ex: "Garde le header bleu marine", "Mentionne notre licence FSC", "Conditions: paiement à 30 jours fin de mois"...`}
                    rows={3}
                    disabled={aiUploading}
                    className="mt-1 text-sm"
                  />
                </div>
              </div>
              {aiUploadError && (
                <div className="text-xs text-[#9F1239] bg-[#9F1239]/10 px-3 py-2 rounded">
                  {aiUploadError}
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleAiTemplateUpload}
                  disabled={!aiUploadFile || !societeId || aiUploading}
                  className="bg-[#0B0F2E] hover:bg-[#0B0F2E]/90 text-white"
                >
                  {aiUploading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyse en cours…</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-2" />Analyser et créer le modèle</>
                  )}
                </Button>
                {aiUploading && (
                  <span className="text-xs text-gray-500">L'IA met 10 à 30 secondes pour analyser la facture.</span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Templates IA déjà créés ── */}
          {(aiTemplatesLoading || aiTemplates.length > 0) && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[#0B0F2E] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                Mes modèles IA
                {aiTemplatesLoading && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {aiTemplates.map(tpl => {
                  const tplId = toAiTemplateId(tpl.id)
                  const isSelected = selectedTemplate === tplId
                  const primaire = tpl.couleur_primaire || '#0B0F2E'
                  const secondaire = tpl.couleur_secondaire || '#D4AF37'
                  return (
                    <Card
                      key={tpl.id}
                      className={`cursor-pointer transition-all relative ${isSelected ? "ring-2 ring-[#D4AF37] shadow-lg" : "hover:shadow-md"}`}
                      onClick={() => {
                        setSelectedTemplate(tplId)
                        setTemplateColors({ primaire, secondaire })
                      }}
                    >
                      <CardContent className="p-4">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleAiTemplateDelete(tpl.id) }}
                          title="Supprimer ce modèle"
                          className="absolute top-2 right-2 p-1 rounded hover:bg-[#9F1239]/10 text-gray-400 hover:text-[#9F1239] transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <Badge className="absolute top-2 left-2 bg-[#D4AF37] text-white text-[9px] px-1.5 py-0">IA</Badge>
                        <div className="border rounded-lg p-3 mb-3 bg-white min-h-[180px] mt-6">
                          <div className={`flex items-start mb-3 ${tpl.logo_position === 'top-right' ? 'flex-row-reverse' : tpl.logo_position === 'top-center' ? 'flex-col items-center gap-1' : 'justify-between'}`}>
                            {settings.logo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={settings.logo_url} alt="logo" className="max-h-10 max-w-[80px] object-contain" />
                            ) : (
                              <div className="w-10 h-10 rounded" style={{ backgroundColor: primaire }} />
                            )}
                            <div className={tpl.logo_position === 'top-center' ? 'text-center' : 'text-right'}>
                              <div className="text-[10px] font-bold" style={{ color: primaire }}>FACTURE</div>
                              <div className="text-[8px] text-gray-400">{tpl.format_numero || 'INV-001'}</div>
                            </div>
                          </div>
                          <div className="space-y-1 mb-3">
                            <div className="h-1.5 rounded bg-gray-200 w-3/4" />
                            <div className="h-1.5 rounded bg-gray-200 w-1/2" />
                          </div>
                          <div className="border-t pt-2 space-y-1">
                            <div className="flex justify-between">
                              <div className="h-1.5 rounded bg-gray-200 w-1/3" />
                              <div className="h-1.5 rounded w-1/6" style={{ backgroundColor: secondaire }} />
                            </div>
                          </div>
                          <div className="border-t mt-2 pt-2 flex justify-end">
                            <div className="h-2 rounded w-1/4" style={{ backgroundColor: primaire }} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-[#0B0F2E] text-sm truncate" title={tpl.nom}>{tpl.nom}</h3>
                            {tpl.source_fichier && (
                              <p className="text-[10px] text-gray-500 truncate" title={tpl.source_fichier}>
                                {tpl.source_fichier}
                              </p>
                            )}
                            {tpl.consignes_ia && (
                              <p className="text-[10px] text-[#A88925] mt-1 line-clamp-2" title={tpl.consignes_ia}>
                                <Info className="w-2.5 h-2.5 inline mr-0.5" />
                                {tpl.consignes_ia}
                              </p>
                            )}
                          </div>
                          {isSelected && <Check className="w-5 h-5 text-[#D4AF37] flex-shrink-0" />}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Templates standards (hardcoded) ── */}
          <h3 className="text-sm font-semibold text-[#0B0F2E] pt-2">Modèles standards</h3>
          <div className="grid grid-cols-3 gap-4">
            {getTemplates(locale).map(tpl => (
              <Card key={tpl.id} className={`cursor-pointer transition-all ${selectedTemplate === tpl.id ? "ring-2 ring-[#D4AF37] shadow-lg" : "hover:shadow-md"}`}
                onClick={() => { setSelectedTemplate(tpl.id); setTemplateColors(tpl.style.couleur_primaire ? { primaire: tpl.style.couleur_primaire, secondaire: tpl.style.couleur_secondaire } : templateColors) }}>
                <CardContent className="p-4">
                  {/* Template Preview */}
                  <div className="border rounded-lg p-3 mb-3 bg-white min-h-[180px]">
                    <div className="flex justify-between items-start mb-3">
                      <div className="w-10 h-10 rounded" style={{ backgroundColor: tpl.style.couleur_primaire }} />
                      <div className="text-right">
                        <div className="text-[10px] font-bold" style={{ color: tpl.style.couleur_primaire }}>{t('inv.fs.invoice_uc_preview', locale)}</div>
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
                        <div className="h-1.5 rounded w-1/6" style={{ backgroundColor: tpl.style.couleur_secondaire }} />
                      </div>
                      <div className="flex justify-between">
                        <div className="h-1.5 rounded bg-gray-200 w-2/5" />
                        <div className="h-1.5 rounded w-1/6" style={{ backgroundColor: tpl.style.couleur_secondaire }} />
                      </div>
                    </div>
                    <div className="border-t mt-2 pt-2 flex justify-end">
                      <div className="h-2 rounded w-1/4" style={{ backgroundColor: tpl.style.couleur_primaire }} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-[#0B0F2E]">{tpl.nom}</h3>
                      <p className="text-xs text-gray-500">{tpl.description}</p>
                    </div>
                    {selectedTemplate === tpl.id && <Check className="w-5 h-5 text-[#D4AF37]" />}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Color Swatches */}
          <Card>
            <CardHeader><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2"><Palette className="w-4 h-4" />{t('inv.fs.default_accent_color', locale)}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-500">{t('inv.fs.default_accent_help', locale)}</p>
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
              <p className="text-xs text-gray-400">{t('inv.fs.selection_label', locale)} <span className="font-mono font-medium">{ACCENT_COLORS.find(c => c.hex === templateColors.primaire)?.name || t('inv.fs.custom_label', locale)}</span> ({templateColors.primaire})</p>

              {/* Custom color pickers */}
              <div className="grid grid-cols-2 gap-4 max-w-md pt-2 border-t">
                <div>
                  <Label>{t('inv.fs.primary_color_custom', locale)}</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <input type="color" value={templateColors.primaire} onChange={e => setTemplateColors(c => ({ ...c, primaire: e.target.value }))} className="w-10 h-10 rounded border cursor-pointer" />
                    <Input value={templateColors.primaire} onChange={e => setTemplateColors(c => ({ ...c, primaire: e.target.value }))} className="font-mono text-sm" />
                  </div>
                </div>
                <div>
                  <Label>{t('inv.fs.secondary_color', locale)}</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <input type="color" value={templateColors.secondaire} onChange={e => setTemplateColors(c => ({ ...c, secondaire: e.target.value }))} className="w-10 h-10 rounded border cursor-pointer" />
                    <Input value={templateColors.secondaire} onChange={e => setTemplateColors(c => ({ ...c, secondaire: e.target.value }))} className="font-mono text-sm" />
                  </div>
                </div>
              </div>

              {/* Mini preview with selected color */}
              <div className="border rounded-lg p-4 bg-white max-w-sm">
                <p className="text-xs font-medium text-gray-500 mb-2">{t('inv.fs.preview_label', locale)}</p>
                <div className="border rounded-lg overflow-hidden">
                  <div className="p-3 flex justify-between items-center" style={{ backgroundColor: templateColors.primaire }}>
                    <div className="w-6 h-6 rounded bg-white/20" />
                    <span className="text-white text-[10px] font-bold tracking-wide">{t('inv.fs.invoice_uc_preview', locale)}</span>
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
                      <div className="px-3 py-1 rounded text-[8px] text-white font-bold" style={{ backgroundColor: templateColors.primaire }}>{t('inv.fs.total_ttc_uc', locale)}</div>
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
                <CardHeader><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2"><Shield className="w-4 h-4" />{t('inv.fs.mra_fiscalisation_title', locale)}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">{t('inv.fs.activate_mra', locale)}</Label>
                      <p className="text-xs text-gray-500 mt-0.5">{t('inv.fs.activate_mra_help', locale)}</p>
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
                        <><Wifi className="w-4 h-4 text-green-600" /><span className="text-green-700 font-medium">{t('inv.fs.connected', locale)}</span></>
                      ) : (
                        <><WifiOff className="w-4 h-4 text-gray-400" /><span className="text-gray-500">{t('inv.fs.not_connected', locale)}</span></>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* EBS Credentials */}
              <Card className={!mraActive ? "opacity-50 pointer-events-none" : ""}>
                <CardHeader><CardTitle className="text-[#0B0F2E] text-base">{t('inv.fs.ebs_credentials_title', locale)}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label>{t('inv.fs.ebs_id_label', locale)}</Label>
                    <Input
                      value={mraEbsId}
                      onChange={e => setMraEbsId(e.target.value)}
                      placeholder="EBS-XXXXXXXX"
                      className="font-mono"
                    />
                  </div>
                  <div>
                    <Label>{t('inv.fs.api_key_label', locale)}</Label>
                    <Input
                      type="password"
                      value={mraApiKey}
                      onChange={e => setMraApiKey(e.target.value)}
                      placeholder={t('inv.fs.api_key_placeholder', locale)}
                      className="font-mono"
                    />
                    <p className="text-xs text-gray-400 mt-1">{t('inv.fs.api_key_masked', locale)}</p>
                  </div>
                  <div>
                    <Label>{t('inv.fs.environment_label', locale)}</Label>
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
                        <SelectItem value="sandbox">{t('inv.fs.sandbox_test', locale)}</SelectItem>
                        <SelectItem value="production">{t('inv.fs.production', locale)}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t('inv.fs.api_url_label', locale)}</Label>
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
                        setMraTestResult({ success: true, message: t('inv.fs.test_success', locale).replace('{env}', mraEnvironment) })
                      } catch {
                        setMraTestResult({ success: false, message: t('inv.fs.test_error', locale) })
                      } finally {
                        setMraTesting(false)
                      }
                    }}
                    disabled={mraTesting || !mraEbsId || !mraApiKey}
                    variant="outline"
                    className="w-full border-[#0B0F2E] text-[#0B0F2E]"
                  >
                    {mraTesting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('inv.fs.testing', locale)}</> : <><Wifi className="w-4 h-4 mr-2" />{t('inv.fs.test_connection', locale)}</>}
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
                <CardHeader><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2"><Info className="w-4 h-4" />{t('inv.fs.about_mra_title', locale)}</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm text-gray-700">
                  <p>
                    {t('inv.fs.about_mra_p1_pre', locale)} <strong>Mauritius Revenue Authority (MRA)</strong> {t('inv.fs.about_mra_p1_post', locale)}
                  </p>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-[#0B0F2E]">{t('inv.fs.thresholds_title', locale)}</h4>
                    <ul className="list-disc pl-5 space-y-1 text-xs text-gray-600">
                      <li>{t('inv.fs.thresholds_1', locale)}</li>
                      <li>{t('inv.fs.thresholds_2_pre', locale)} <strong>IRN</strong> {t('inv.fs.thresholds_2_post', locale)}</li>
                      <li>{t('inv.fs.thresholds_3_pre', locale)} <strong>QR code</strong> {t('inv.fs.thresholds_3_post', locale)}</li>
                      <li>{t('inv.fs.thresholds_4', locale)}</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-[#0B0F2E]">{t('inv.fs.prereq_title', locale)}</h4>
                    <ul className="list-disc pl-5 space-y-1 text-xs text-gray-600">
                      <li>{t('inv.fs.prereq_1', locale)}</li>
                      <li>{t('inv.fs.prereq_2', locale)}</li>
                      <li>{t('inv.fs.prereq_3', locale)}</li>
                      <li>{t('inv.fs.prereq_4', locale)}</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-[#0B0F2E]">{t('inv.fs.doc_codes_title', locale)}</h4>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-white rounded p-2 border text-center">
                        <p className="font-mono font-bold text-[#0B0F2E]">01</p>
                        <p className="text-gray-500">{t('inv.fs.doc_invoice', locale)}</p>
                      </div>
                      <div className="bg-white rounded p-2 border text-center">
                        <p className="font-mono font-bold text-red-600">02</p>
                        <p className="text-gray-500">{t('inv.fs.doc_credit', locale)}</p>
                      </div>
                      <div className="bg-white rounded p-2 border text-center">
                        <p className="font-mono font-bold text-orange-600">03</p>
                        <p className="text-gray-500">{t('inv.fs.doc_debit', locale)}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-[#0B0F2E] text-base">{t('inv.fs.current_mode_title', locale)}</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                    <Info className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-yellow-800">{t('inv.fs.simulation_mode', locale)}</p>
                      <p className="text-xs text-yellow-600 mt-0.5">
                        {t('inv.fs.simulation_help', locale)}
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
