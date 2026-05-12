"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Trash2, Eye, Save, Lock, Download, ArrowLeft, FileText, User, ListOrdered, Calculator, CreditCard, StickyNote, Palette, Check, FileWarning, FileMinus, Wand2, Package } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { CatalogueSelectorDialog, type CatalogueItem as CatalogueDialogItem } from "@/components/client/CatalogueSelectorDialog"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

interface LigneFacture { id: string; description: string; unite: string; quantite: number; prix_unitaire: number; taux_tva: number; montant_ht: number }
interface InvoiceClient { id: string; nom: string; entreprise: string; adresse: string; email: string; telephone: string; vat_number: string; devise: string; conditions_paiement: number; offshore: boolean; isDb?: boolean }
interface CatalogueItem { id: string; description: string; prix_unitaire: number; devise: string; tva_applicable: boolean; categorie: string | null; unite?: string }
interface CompanySettings { nom: string; brn: string; vat_number: string; logo_url: string; adresse: string; telephone: string; email: string; website: string; banque_nom: string; banque_compte: string; banque_iban: string; banque_swift: string; devise_defaut: string; prefixe_facture: string; prochain_numero: number; conditions_paiement: number; footer_text: string; mention_legale: string }
interface Societe { id: string; nom: string }

const genId = () => crypto.randomUUID()
const fmt = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const today = () => new Date().toISOString().split("T")[0]
const addDays = (d: string, days: number) => { const dt = new Date(d); dt.setDate(dt.getDate() + days); return dt.toISOString().split("T")[0] }
const UNITES = ["Heure", "Jour", "Mois", "Forfait", "Unite"] as const
const DEVISES = ["MUR", "EUR", "USD", "GBP"] as const
const MODES_PAIEMENT = ["Virement", "Cheque", "Especes", "Carte"] as const
const ACCENT_COLORS = [
  { name: "Navy", hex: "#0B0F2E" }, { name: "Gold", hex: "#D4AF37" },
  { name: "Blue", hex: "#2563EB" }, { name: "Green", hex: "#059669" },
  { name: "Red", hex: "#DC2626" }, { name: "Purple", hex: "#7C3AED" },
  { name: "Teal", hex: "#0D9488" }, { name: "Orange", hex: "#EA580C" },
  { name: "Slate", hex: "#475569" }, { name: "Rose", hex: "#E11D48" },
  { name: "Indigo", hex: "#4F46E5" }, { name: "Black", hex: "#000000" },
] as const
const ECHEANCES = [
  { label: "À réception", value: 0 },
  { label: "30 jours", value: 30 },
  { label: "60 jours", value: 60 },
  { label: "90 jours", value: 90 },
  { label: "Personnalisé", value: -1 },
] as const

function Sel({ value, onValueChange, placeholder, children }: { value?: string; onValueChange: (v: string) => void; placeholder?: string; children: React.ReactNode }) {
  return <Select value={value} onValueChange={onValueChange}><SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent>{children}</SelectContent></Select>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label>{label}</Label>{children}</div>
}

export default function NouvelleFacturePage() {
  const router = useRouter()
  const { societeId } = useSocieteActive()
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [clients, setClients] = useState<InvoiceClient[]>([])
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([])
  const [catalogueDialogOpen, setCatalogueDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [typeDocument, setTypeDocument] = useState<"facture" | "avoir" | "note_debit" | "devis">("facture")
  const [factureReferenceId, setFactureReferenceId] = useState("")
  const [existingFactures, setExistingFactures] = useState<Array<{ id: string; numero_facture: string; tiers: string; montant_ttc: number; devise: string }>>([])
  const [numeroFacture, setNumeroFacture] = useState("")
  const [dateFacture, setDateFacture] = useState(today())
  const [dateEcheance, setDateEcheance] = useState("")
  const [reference, setReference] = useState("")
  const [selectedClientId, setSelectedClientId] = useState("")
  const [clientNom, setClientNom] = useState("")
  const [clientEntreprise, setClientEntreprise] = useState("")
  const [clientAdresse, setClientAdresse] = useState("")
  const [clientEmail, setClientEmail] = useState("")
  const [clientVat, setClientVat] = useState("")
  const [clientOffshore, setClientOffshore] = useState(false)
  const [descriptif, setDescriptif] = useState("")
  const [lignes, setLignes] = useState<LigneFacture[]>([])
  const [remiseType, setRemiseType] = useState<"pct" | "fixe">("pct")
  const [remiseValue, setRemiseValue] = useState(0)
  const [devise, setDevise] = useState("MUR")
  const [tauxChange, setTauxChange] = useState(1)
  const [tauxLoading, setTauxLoading] = useState(false)
  const [modePaiement, setModePaiement] = useState("Virement")
  const [echeancePreset, setEcheancePreset] = useState(30)
  const [notesVisibles, setNotesVisibles] = useState("")
  const [notesInternes, setNotesInternes] = useState("")
  // Récurrence (mig 241) : ce bloc transforme la facture en MODÈLE généré
  // automatiquement chaque mois/trimestre/année par le cron quotidien.
  const [recurrent, setRecurrent] = useState(false)
  const [recurrentFreq, setRecurrentFreq] = useState<"mensuel" | "trimestriel" | "annuel">("mensuel")
  const [recurrenceJour, setRecurrenceJour] = useState("1")
  const [recurrenceDebut, setRecurrenceDebut] = useState("")
  const [recurrenceFin, setRecurrenceFin] = useState("")
  const [accentColor, setAccentColor] = useState("#0B0F2E")
  const [templates, setTemplates] = useState<any[]>([])
  const [templateId, setTemplateId] = useState("")
  const [tvaDef, setTvaDef] = useState(15)

  useEffect(() => {
    try {
      const s = localStorage.getItem("lexora_invoice_settings")
      if (s) {
        const p = JSON.parse(s) as CompanySettings
        setSettings(p); setDevise(p.devise_defaut || "MUR")
        setNumeroFacture(`${p.prefixe_facture}${String(p.prochain_numero).padStart(4, "0")}`)
        setDateEcheance(addDays(today(), p.conditions_paiement || 30))
        setEcheancePreset(p.conditions_paiement || 30)
      } else { setDateEcheance(addDays(today(), 30)) }
      const c = localStorage.getItem("lexora_invoice_clients")
      if (c) setClients(JSON.parse(c))
      // Catalogue : on charge depuis l'API ci-dessous (effet séparé). Fallback
      // localStorage tant que la DB n'est pas peuplée, pour ne pas perdre les
      // articles des utilisateurs legacy.
      const catLegacy = localStorage.getItem("lexora_invoice_catalogue")
      if (catLegacy) {
        try { setCatalogue(JSON.parse(catLegacy)) } catch { /* ignore */ }
      }
      const tc = localStorage.getItem("lexora_invoice_template_colors")
      if (tc) { try { const parsed = JSON.parse(tc); if (parsed.primaire) setAccentColor(parsed.primaire) } catch { /* ignore */ } }
    } catch { /* ignore */ }
    // Charger les templates depuis la DB
    fetch("/api/client/facture-template").then(r => r.json()).then(d => {
      setTemplates(d.templates || [])
    }).catch(() => {})
    // Load existing invoices for credit note references
    fetch("/api/client/factures?statut=en_attente").then(r => r.json()).then(d => {
      const facs = (d.factures || []).filter((f: { statut: string; type_document?: string }) => f.statut !== "brouillon" && (!f.type_document || f.type_document === "facture"))
      setExistingFactures(facs.map((f: { id: string; numero_facture: string; tiers: string; montant_ttc: number; devise: string }) => ({
        id: f.id, numero_facture: f.numero_facture, tiers: f.tiers, montant_ttc: f.montant_ttc, devise: f.devise,
      })))
    }).catch(() => {})
  }, [])

  // Catalogue depuis l'API — déclenché dès que societeId est disponible.
  // Remplace les items localStorage par ceux en base (source de vérité).
  useEffect(() => {
    if (!societeId) return
    fetch(`/api/client/catalogue?societe_id=${societeId}`)
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d?.items) && d.items.length > 0) {
          setCatalogue(d.items.map((it: any) => ({
            id: it.id,
            description: it.description,
            prix_unitaire: Number(it.prix_unitaire) || 0,
            devise: it.devise || "MUR",
            tva_applicable: it.tva_applicable !== false,
            categorie: it.categorie || null,
            unite: it.unite || "Forfait",
          })))
        }
      })
      .catch(() => { /* fallback localStorage déjà chargé */ })
  }, [societeId])

  // Contacts depuis l'API — déclenché dès que societeId est dispo.
  // Remplace les items localStorage par ceux en base (source de vérité).
  useEffect(() => {
    if (!societeId) return
    fetch(`/api/client/factures-contacts?societe_id=${societeId}`)
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d?.items) && d.items.length > 0) {
          setClients(d.items.map((c: any) => ({
            id: c.id,
            nom: c.nom || "",
            entreprise: c.entreprise || "",
            adresse: c.adresse || "",
            email: c.email || "",
            telephone: c.telephone || "",
            vat_number: c.vat_number || "",
            devise: c.devise || "MUR",
            conditions_paiement: Number(c.conditions_paiement) || 30,
            offshore: c.offshore === true,
            isDb: true,
          })))
        }
      })
      .catch(() => { /* fallback localStorage déjà chargé */ })
  }, [societeId])

  const fetchTaux = useCallback(async (dev: string) => {
    if (dev === "MUR") { setTauxChange(1); return }
    setTauxLoading(true)
    try {
      const res = await fetch("/api/taux-change")
      if (res.ok) { const data = await res.json(); const rate = data.rates?.[dev]; if (rate) { setTauxChange(rate); setTauxLoading(false); return } }
    } catch { /* fallback */ }
    setTauxChange({ EUR: 49.5, USD: 45.8, GBP: 57.2 }[dev] || 1)
    setTauxLoading(false)
  }, [])
  useEffect(() => { fetchTaux(devise) }, [devise, fetchTaux])

  const handleClientSelect = (id: string) => {
    setSelectedClientId(id)
    if (id === "manual") { setClientNom(""); setClientEntreprise(""); setClientAdresse(""); setClientEmail(""); setClientVat(""); setClientOffshore(false); return }
    const c = clients.find(cl => cl.id === id)
    if (c) { setClientNom(c.nom); setClientEntreprise(c.entreprise); setClientAdresse(c.adresse); setClientEmail(c.email); setClientVat(c.vat_number); setClientOffshore(c.offshore); if (c.devise) setDevise(c.devise); setDateEcheance(addDays(dateFacture, c.conditions_paiement || 30)) }
  }

  const handleOffshoreToggle = (offshore: boolean) => {
    setClientOffshore(offshore)
    setLignes(prev => prev.map(l => ({ ...l, taux_tva: offshore ? 0 : 15 })))
  }

  const addLigne = () => setLignes(prev => [...prev, { id: genId(), description: "", unite: "Heure", quantite: 1, prix_unitaire: 0, taux_tva: clientOffshore ? 0 : 15, montant_ht: 0 }])
  const addFromCatalogue = (item: CatalogueItem) => {
    const tva = clientOffshore ? 0 : (item.tva_applicable ? 15 : 0)
    setLignes(prev => [...prev, { id: genId(), description: item.description, unite: item.unite || "Forfait", quantite: 1, prix_unitaire: item.prix_unitaire, taux_tva: tva, montant_ht: item.prix_unitaire }])
  }
  const updateLigne = (id: string, field: keyof LigneFacture, value: string | number) => {
    setLignes(prev => prev.map(l => { if (l.id !== id) return l; const u = { ...l, [field]: value }; u.montant_ht = u.quantite * u.prix_unitaire; return u }))
  }
  const removeLigne = (id: string) => setLignes(prev => prev.filter(l => l.id !== id))

  const sousTotal = useMemo(() => lignes.reduce((s, l) => s + l.montant_ht, 0), [lignes])
  const remiseMontant = useMemo(() => remiseType === "pct" ? sousTotal * remiseValue / 100 : remiseValue, [sousTotal, remiseType, remiseValue])
  const totalHTApresRemise = useMemo(() => Math.max(0, sousTotal - remiseMontant), [sousTotal, remiseMontant])
  const totalTVA = useMemo(() => {
    if (sousTotal === 0) return 0
    const ratio = totalHTApresRemise / sousTotal
    return lignes.reduce((s, l) => s + l.montant_ht * ratio * l.taux_tva / 100, 0)
  }, [lignes, totalHTApresRemise, sousTotal])
  const totalTTC = useMemo(() => totalHTApresRemise + totalTVA, [totalHTApresRemise, totalTVA])
  const contreValeurMUR = useMemo(() => devise !== "MUR" ? totalTTC * tauxChange : null, [totalTTC, devise, tauxChange])

  const handleEcheancePreset = (val: string) => {
    const n = parseInt(val)
    setEcheancePreset(n)
    // n === 0  → "À réception" : échéance = date de facture
    // n  >  0  → délai en jours
    // n === -1 → "Personnalisé" : on ne touche pas à la date saisie
    if (n === 0) setDateEcheance(dateFacture)
    else if (n > 0) setDateEcheance(addDays(dateFacture, n))
  }

  const handleTemplateSelect = (id: string) => {
    setTemplateId(id)
    if (!id || id === "none") return
    const t = templates.find(t => t.id === id)
    if (!t) return
    if (t.couleur_primaire) setAccentColor(t.couleur_primaire)
    if (t.devise_defaut) setDevise(t.devise_defaut)
    if (t.tva_defaut !== undefined) setTvaDef(t.tva_defaut)
    if (t.conditions_paiement) { setEcheancePreset(t.conditions_paiement); setDateEcheance(addDays(dateFacture, t.conditions_paiement)) }
    if (t.mentions_legales) setNotesVisibles(t.mentions_legales)
    // Générer numéro selon format_numero du template
    if (t.format_numero) {
      const now = new Date()
      const yyyy = now.getFullYear().toString()
      const mm = String(now.getMonth() + 1).padStart(2, "0")
      const nnn = String(settings?.prochain_numero || 1).padStart(3, "0")
      const generated = t.format_numero.replace("{YYYY}", yyyy).replace("{MM}", mm).replace("{NNN}", nnn)
      setNumeroFacture(generated)
    }
  }

  const buildInvoiceData = (statut: string) => {
    const isCredit = typeDocument === "avoir"
    const signedHT = isCredit ? -Math.abs(totalHTApresRemise) : totalHTApresRemise
    const signedTVA = isCredit ? -Math.abs(totalTVA) : totalTVA
    const signedTTC = isCredit ? -Math.abs(totalTTC) : totalTTC
    return {
      societe_id: societeId, numero_facture: numeroFacture, reference,
      tiers: clientNom || clientEntreprise, description: descriptif || lignes.map(l => l.description).filter(Boolean).join(", "),
      date_facture: dateFacture, date_echeance: dateEcheance, devise, taux_change: tauxChange,
      montant_ht: signedHT, montant_tva: signedTVA, montant_ttc: signedTTC,
      taux_tva: clientOffshore ? 0 : 15, statut, lignes, mode_paiement: modePaiement,
      conditions_paiement: echeancePreset >= 0 ? echeancePreset : (settings?.conditions_paiement || 30),
      notes_visibles: notesVisibles, notes_internes: notesInternes,
      template: localStorage.getItem("lexora_invoice_template") || "standard",
      template_id: templateId || undefined,
      client_offshore: clientOffshore, remise_type: remiseType, remise_value: remiseValue, remise_montant: remiseMontant,
      logo_url: settings?.logo_url || "", contre_valeur_mur: contreValeurMUR,
      accent_color: accentColor,
      type_document: typeDocument,
      facture_reference_id: factureReferenceId || undefined,
      // Lien stable vers le contact DB (utilisé par les relances et le
      // suivi client). On envoie null si le client a été saisi à la main
      // ou provient du localStorage legacy.
      contact_id: (() => {
        const c = clients.find(cl => cl.id === selectedClientId)
        return c?.isDb ? c.id : null
      })(),
      recurrent,
      recurrent_frequence: recurrent ? recurrentFreq : undefined,
      recurrence_jour_du_mois: recurrent ? Number(recurrenceJour) || null : undefined,
      recurrence_date_debut: recurrent ? (recurrenceDebut || dateFacture) : undefined,
      recurrence_date_fin: recurrent ? (recurrenceFin || null) : undefined,
    }
  }

  const saveToSession = () => {
    sessionStorage.setItem("lexora_facture_preview", JSON.stringify({
      ...buildInvoiceData("brouillon"),
      type_document: typeDocument,
      client: { nom: clientNom, entreprise: clientEntreprise, adresse: clientAdresse, email: clientEmail, vat_number: clientVat, offshore: clientOffshore },
      settings,
    }))
  }
  const incrementNumero = () => { if (settings) { const u = { ...settings, prochain_numero: settings.prochain_numero + 1 }; localStorage.setItem("lexora_invoice_settings", JSON.stringify(u)) } }

  const handleSave = async (statut: string) => {
    if (!societeId) { setError("Selectionnez une societe."); return }
    if (statut === "en_attente" && lignes.length === 0) { setError("Ajoutez au moins une ligne."); return }
    if (statut === "en_attente" && !clientNom && !clientEntreprise) { setError("Renseignez le client."); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch("/api/client/factures", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildInvoiceData(statut)) })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      incrementNumero(); router.push("/client/factures")
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Erreur") }
    finally { setSaving(false) }
  }

  const handlePreview = () => { saveToSession(); window.open("/client/facture-preview", "_blank") }
  const handleDownloadPDF = () => { saveToSession(); const w = window.open("/client/facture-preview?print=true", "_blank"); if (w) w.addEventListener("afterprint", () => w.close()) }

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="pb-28 max-w-5xl mx-auto space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/client/factures")}><ArrowLeft className="w-4 h-4 mr-1" />Retour</Button>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: typeDocument === "avoir" ? "#DC2626" : "#0B0F2E" }}>
              {typeDocument === "avoir" ? "Nouvel Avoir" : typeDocument === "note_debit" ? "Nouvelle Note de Debit" : typeDocument === "devis" ? "Nouveau Devis" : "Nouvelle Facture"}
            </h1>
            <p className="text-sm text-gray-500">Conforme MRA - Maurice</p>
          </div>
        </div>
        <Badge className="bg-gray-100 text-gray-600 border border-gray-300">Brouillon</Badge>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

      {/* Document type selector */}
      <Card className={`border-t-4 ${typeDocument === "avoir" ? "border-t-red-500" : typeDocument === "note_debit" ? "border-t-orange-500" : "border-t-[#0B0F2E]"}`}>
        <CardHeader className="pb-2"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2"><FileText className="w-4 h-4" />Type de document</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => { setTypeDocument("facture"); setFactureReferenceId("") }}
              className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${typeDocument === "facture" ? "border-[#0B0F2E] bg-[#0B0F2E]/5" : "border-gray-200 hover:border-gray-300"}`}
            >
              <FileText className={`w-5 h-5 ${typeDocument === "facture" ? "text-[#0B0F2E]" : "text-gray-400"}`} />
              <div className="text-left">
                <p className={`font-medium text-sm ${typeDocument === "facture" ? "text-[#0B0F2E]" : "text-gray-700"}`}>Facture</p>
                <p className="text-xs text-gray-400">Invoice (code 01)</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setTypeDocument("avoir")}
              className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${typeDocument === "avoir" ? "border-red-500 bg-red-50" : "border-gray-200 hover:border-gray-300"}`}
            >
              <FileMinus className={`w-5 h-5 ${typeDocument === "avoir" ? "text-red-600" : "text-gray-400"}`} />
              <div className="text-left">
                <p className={`font-medium text-sm ${typeDocument === "avoir" ? "text-red-700" : "text-gray-700"}`}>Avoir</p>
                <p className="text-xs text-gray-400">Credit Note (code 02)</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setTypeDocument("note_debit")}
              className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${typeDocument === "note_debit" ? "border-orange-500 bg-orange-50" : "border-gray-200 hover:border-gray-300"}`}
            >
              <FileWarning className={`w-5 h-5 ${typeDocument === "note_debit" ? "text-orange-600" : "text-gray-400"}`} />
              <div className="text-left">
                <p className={`font-medium text-sm ${typeDocument === "note_debit" ? "text-orange-700" : "text-gray-700"}`}>Note de debit</p>
                <p className="text-xs text-gray-400">Debit Note (code 03)</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => { setTypeDocument("devis"); setFactureReferenceId("") }}
              className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${typeDocument === "devis" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
            >
              <FileText className={`w-5 h-5 ${typeDocument === "devis" ? "text-blue-600" : "text-gray-400"}`} />
              <div className="text-left">
                <p className={`font-medium text-sm ${typeDocument === "devis" ? "text-blue-700" : "text-gray-700"}`}>Devis</p>
                <p className="text-xs text-gray-400">Quote — pas de comptabilité</p>
              </div>
            </button>
          </div>
          {typeDocument === "avoir" && (
            <div className="mt-4 space-y-3">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                Avoir (Credit Note) : les montants seront enregistres en negatif. Selectionnez la facture d&apos;origine ci-dessous.
              </div>
              <Field label="Facture d'origine (reference)">
                <Sel value={factureReferenceId} onValueChange={setFactureReferenceId} placeholder="Selectionner la facture a crediter...">
                  {existingFactures.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.numero_facture} - {f.tiers} ({f.montant_ttc?.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} {f.devise})</SelectItem>
                  ))}
                </Sel>
              </Field>
            </div>
          )}
          {typeDocument === "note_debit" && (
            <div className="mt-4 bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-700">
              Note de debit : utilisee pour facturer un complement ou corriger a la hausse une facture existante.
            </div>
          )}
        </CardContent>
      </Card>

      {/* 0. Template selector */}
      {templates.length > 0 && (
        <Card className="border-t-4 border-t-[#D4AF37]">
          <CardHeader className="pb-2"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2"><Wand2 className="w-4 h-4 text-[#D4AF37]" />Template de facture</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <Sel value={templateId || "none"} onValueChange={handleTemplateSelect} placeholder="Choisir un template...">
                  <SelectItem value="none">— Aucun template (défaut) —</SelectItem>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nom} {t.devise_defaut ? `· ${t.devise_defaut}` : ""} {t.tva_defaut !== undefined ? `· TVA ${t.tva_defaut}%` : ""}
                    </SelectItem>
                  ))}
                </Sel>
              </div>
              {templateId && templateId !== "none" && (() => {
                const t = templates.find(t => t.id === templateId)
                return t ? (
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    {t.couleur_primaire && <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded-full inline-block border" style={{ backgroundColor: t.couleur_primaire }} />{t.couleur_primaire}</span>}
                    {t.format_numero && <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{t.format_numero}</span>}
                  </div>
                ) : null
              })()}
            </div>
            {templateId && templateId !== "none" && <p className="text-xs text-green-600 mt-2">✅ Template appliqué — couleurs, TVA, devise, numérotation et mentions légales chargés.</p>}
          </CardContent>
        </Card>
      )}

      {/* 1. Invoice header fields */}
      <Card className="border-t-4 border-t-[#0B0F2E]">
        <CardHeader className="pb-2"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2"><FileText className="w-4 h-4" />Informations facture</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="N. Facture"><Input value={numeroFacture} onChange={e => setNumeroFacture(e.target.value)} className="font-mono" /></Field>
            <Field label="Date facture"><Input type="date" value={dateFacture} onChange={e => {
              setDateFacture(e.target.value)
              if (echeancePreset === 0) setDateEcheance(e.target.value)
              else if (echeancePreset > 0) setDateEcheance(addDays(e.target.value, echeancePreset))
            }} /></Field>
            <Field label="Date echeance"><Input type="date" value={dateEcheance} onChange={e => { setDateEcheance(e.target.value); setEcheancePreset(-1) }} /></Field>
            <Field label="Reference"><Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Ref. / PO" /></Field>
          </div>
        </CardContent>
      </Card>

      {/* 2. Client */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2"><User className="w-4 h-4" />Client</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Selectionner un client">
              <Sel value={selectedClientId} onValueChange={handleClientSelect} placeholder="Choisir ou saisie manuelle...">
                <SelectItem value="manual">-- Saisie manuelle --</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nom}{c.entreprise ? ` (${c.entreprise})` : ""}</SelectItem>)}
              </Sel>
            </Field>
            <Field label="Type de client">
              <Sel value={clientOffshore ? "offshore" : "local"} onValueChange={v => handleOffshoreToggle(v === "offshore")}>
                <SelectItem value="local">Local Maurice - TVA 15%</SelectItem>
                <SelectItem value="offshore">Offshore / Export - TVA 0%</SelectItem>
              </Sel>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Nom"><Input value={clientNom} onChange={e => setClientNom(e.target.value)} placeholder="Nom du contact" /></Field>
            <Field label="Entreprise"><Input value={clientEntreprise} onChange={e => setClientEntreprise(e.target.value)} placeholder="Nom de la societe" /></Field>
            <Field label="N. TVA"><Input value={clientVat} onChange={e => setClientVat(e.target.value)} placeholder="VAT number" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Adresse"><Input value={clientAdresse} onChange={e => setClientAdresse(e.target.value)} placeholder="Adresse complete" /></Field>
            <Field label="Email"><Input value={clientEmail} onChange={e => setClientEmail(e.target.value)} type="email" placeholder="email@exemple.com" /></Field>
          </div>
          {clientOffshore && <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">Client offshore / export : TVA a 0% (zero-rated) appliquee automatiquement sur toutes les lignes.</div>}
        </CardContent>
      </Card>

      {/* 3. Descriptif */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2"><FileText className="w-4 h-4" />Descriptif</CardTitle></CardHeader>
        <CardContent>
          <Textarea value={descriptif} onChange={e => setDescriptif(e.target.value)} placeholder="Objet de la facture / description generale des prestations..." rows={3} className="resize-y" />
        </CardContent>
      </Card>

      {/* 4. Line items table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2"><ListOrdered className="w-4 h-4" />Lignes de facture</CardTitle>
            <div className="flex gap-2">
              {/* Bouton dialog catalogue — visible même si le catalogue est
                  vide (le dialog explique alors comment en créer). Plus
                  prominent que l'ancien dropdown caché. */}
              <Button
                type="button"
                onClick={() => setCatalogueDialogOpen(true)}
                variant="outline"
                size="sm"
                className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
              >
                <Package className="w-4 h-4 mr-1" />
                Choisir du catalogue
              </Button>
              <Button onClick={addLigne} variant="outline" size="sm" className="border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37]/10"><Plus className="w-4 h-4 mr-1" />Ajouter une ligne vide</Button>
            </div>
          </div>
          {devise !== "MUR" && tauxChange > 1.0001 && (
            <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-1.5 mt-2">
              💡 Vous pouvez saisir le prix unitaire en <strong>{devise}</strong> ou en <strong>MUR</strong> :
              la conversion se fait automatiquement au taux de {fmt(tauxChange)} MUR / {devise}.
              La facture finale est émise en {devise} avec l'équivalent MUR à titre informatif.
            </p>
          )}
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#0B0F2E]/5">
                <TableHead className="w-[4%] text-center">#</TableHead>
                <TableHead className="w-[26%]">Description</TableHead>
                <TableHead className="w-[10%]">Unite</TableHead>
                <TableHead className="text-right w-[9%]">Quantite</TableHead>
                <TableHead className="text-right w-[17%]">
                  Prix unitaire
                  {devise !== "MUR" && (
                    <div className="text-[10px] font-normal text-gray-500 mt-0.5">
                      Saisie en {devise} ou MUR
                    </div>
                  )}
                </TableHead>
                <TableHead className="text-right w-[7%]">TVA %</TableHead>
                <TableHead className="text-right w-[13%]">Montant HT</TableHead>
                <TableHead className="w-[4%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lignes.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-gray-400">Aucune ligne. Cliquez sur &quot;Ajouter une ligne&quot; pour commencer.</TableCell></TableRow>
              ) : lignes.map((l, idx) => (
                <TableRow key={l.id} className="group">
                  <TableCell className="text-center text-gray-400 text-sm">{idx + 1}</TableCell>
                  <TableCell><Input value={l.description} onChange={e => updateLigne(l.id, "description", e.target.value)} placeholder="Description du service ou produit" className="border-0 bg-transparent focus:bg-white" /></TableCell>
                  <TableCell>
                    <Select value={l.unite} onValueChange={v => updateLigne(l.id, "unite", v)}>
                      <SelectTrigger className="border-0 bg-transparent text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{UNITES.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Input type="number" min={0} step="0.01" value={l.quantite} onChange={e => updateLigne(l.id, "quantite", parseFloat(e.target.value) || 0)} className="text-right border-0 bg-transparent focus:bg-white w-20" /></TableCell>
                  <TableCell>
                    {devise === "MUR" || tauxChange <= 1.0001 ? (
                      <Input
                        type="number"
                        step="0.01"
                        value={l.prix_unitaire}
                        onChange={e => updateLigne(l.id, "prix_unitaire", parseFloat(e.target.value) || 0)}
                        className="text-right border-0 bg-transparent focus:bg-white w-28"
                      />
                    ) : (
                      // Bi-directionnel : on stocke toujours prix_unitaire dans
                      // la devise de facturation (devise étrangère). L'input MUR
                      // calcule à l'inverse via le taux et met à jour
                      // prix_unitaire. Permet à l'utilisateur de penser dans la
                      // devise qui lui parle (prix d'achat en MUR, vente en EUR).
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 justify-end">
                          <span className="text-[10px] text-gray-500 w-7">{devise}</span>
                          <Input
                            type="number"
                            step="0.01"
                            value={l.prix_unitaire}
                            onChange={e => updateLigne(l.id, "prix_unitaire", parseFloat(e.target.value) || 0)}
                            className="text-right border-0 bg-transparent focus:bg-white w-24 h-8"
                          />
                        </div>
                        <div className="flex items-center gap-1 justify-end">
                          <span className="text-[10px] text-gray-500 w-7">MUR</span>
                          <Input
                            type="number"
                            step="0.01"
                            value={Number((l.prix_unitaire * tauxChange).toFixed(2))}
                            onChange={e => {
                              const mur = parseFloat(e.target.value) || 0
                              updateLigne(l.id, "prix_unitaire", Number((mur / tauxChange).toFixed(4)))
                            }}
                            className="text-right border-0 bg-transparent focus:bg-white w-24 h-8 text-gray-600"
                          />
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select value={String(l.taux_tva)} onValueChange={v => updateLigne(l.id, "taux_tva", parseFloat(v))}>
                      <SelectTrigger className="border-0 bg-transparent w-20 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="15">15%</SelectItem><SelectItem value="0">0%</SelectItem></SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {/* En devise étrangère : on affiche les DEUX montants au
                        même format (taille + couleur). Le MUR est juste
                        marqué "≈" pour signaler qu'il est dérivé du taux. */}
                    <div className="font-semibold text-[#0B0F2E]">
                      {fmt(l.montant_ht)} {devise !== "MUR" ? devise : "MUR"}
                    </div>
                    {devise !== "MUR" && tauxChange > 1.0001 && (
                      <div className="font-semibold text-[#0B0F2E] mt-0.5">
                        ≈ {fmt(l.montant_ht * tauxChange)} MUR
                      </div>
                    )}
                  </TableCell>
                  <TableCell><Button variant="ghost" size="sm" onClick={() => removeLigne(l.id)} className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-4 h-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 5. Totals + 6. Devise */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          {/* Discount */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2"><Calculator className="w-4 h-4" />Remise</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-end gap-3">
                <Field label="Type">
                  <Sel value={remiseType} onValueChange={v => { setRemiseType(v as "pct" | "fixe"); setRemiseValue(0) }}>
                    <SelectItem value="pct">Pourcentage (%)</SelectItem>
                    <SelectItem value="fixe">Montant fixe ({devise})</SelectItem>
                  </Sel>
                </Field>
                <Field label={remiseType === "pct" ? "Remise (%)" : `Montant (${devise})`}>
                  <Input type="number" min={0} max={remiseType === "pct" ? 100 : undefined} step={0.5} value={remiseValue} onChange={e => setRemiseValue(parseFloat(e.target.value) || 0)} />
                </Field>
              </div>
            </CardContent>
          </Card>
          {/* Devise */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-[#0B0F2E] text-base">Devise</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Sel value={devise} onValueChange={setDevise}>{DEVISES.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</Sel>
              {devise !== "MUR" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label className="whitespace-nowrap">1 {devise} =</Label>
                    <Input type="number" step="0.01" value={tauxChange} onChange={e => setTauxChange(parseFloat(e.target.value) || 1)} className="w-28 font-mono" />
                    <span className="text-sm text-gray-500">MUR</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fetchTaux(devise)}
                      disabled={tauxLoading}
                      title="Récupérer le cours du jour"
                    >
                      {tauxLoading ? "…" : "↻ Cours du jour"}
                    </Button>
                  </div>
                  {tauxLoading && <p className="text-xs text-gray-400">Chargement du taux...</p>}
                  <p className="text-[11px] text-gray-500">
                    Le taux affiché est récupéré automatiquement depuis l'API officielle
                    (cache 1h). Vous pouvez le modifier manuellement si besoin.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        {/* Totals card */}
        <Card className="border-2 border-[#0B0F2E]/20">
          <CardContent className="p-5 space-y-3">
            <div className="flex justify-between text-sm"><span className="text-gray-600">Sous-total HT</span><span className="font-mono">{fmt(sousTotal)} {devise}</span></div>
            {remiseMontant > 0 && <div className="flex justify-between text-sm text-red-600"><span>Remise{remiseType === "pct" ? ` (${remiseValue}%)` : ""}</span><span className="font-mono">-{fmt(remiseMontant)} {devise}</span></div>}
            <div className="flex justify-between text-sm"><span className="text-gray-600">Total HT apres remise</span><span className="font-mono">{fmt(totalHTApresRemise)} {devise}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-600">TVA {clientOffshore ? "(zero-rated)" : "15%"}</span><span className="font-mono">{fmt(totalTVA)} {devise}</span></div>
            <div className="border-t-2 border-[#0B0F2E] pt-3 flex justify-between font-bold text-xl">
              <span className="text-[#0B0F2E]">TOTAL TTC</span><span className="text-[#0B0F2E] font-mono">{fmt(totalTTC)} {devise}</span>
            </div>
            {contreValeurMUR !== null && (
              <div className="bg-gray-50 rounded-lg p-3 mt-2 space-y-1">
                <div className="flex justify-between text-xs text-gray-500"><span>Taux : 1 {devise} = {fmt(tauxChange)} MUR</span></div>
                <div className="flex justify-between text-sm font-semibold text-gray-700"><span>Contre-valeur MUR</span><span className="font-mono">{fmt(contreValeurMUR)} MUR</span></div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 7. Payment */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2"><CreditCard className="w-4 h-4" />Paiement</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Mode de paiement"><Sel value={modePaiement} onValueChange={setModePaiement}>{MODES_PAIEMENT.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</Sel></Field>
            <Field label="Echeance"><Sel value={String(echeancePreset)} onValueChange={handleEcheancePreset}>{ECHEANCES.map(e => <SelectItem key={e.value} value={String(e.value)}>{e.label}</SelectItem>)}</Sel></Field>
            <Field label="Date d'echeance"><Input type="date" value={dateEcheance} onChange={e => { setDateEcheance(e.target.value); setEcheancePreset(-1) }} /></Field>
          </div>
          {settings && modePaiement === "Virement" && (settings.banque_nom || settings.banque_iban) && (
            <div className="mt-4 bg-gray-50 rounded-lg p-4 text-sm space-y-1">
              <p className="font-semibold text-[#0B0F2E] mb-1">Coordonnees bancaires</p>
              {settings.banque_nom && <p>Banque : {settings.banque_nom}</p>}
              {settings.banque_compte && <p>Compte : {settings.banque_compte}</p>}
              {settings.banque_iban && <p>IBAN : {settings.banque_iban}</p>}
              {settings.banque_swift && <p>SWIFT : {settings.banque_swift}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 8. Accent Color */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2"><Palette className="w-4 h-4" />Couleur de la facture</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-3">Choisissez la couleur d&apos;accent pour l&apos;en-tete, le tableau et les totaux de votre facture.</p>
          <div className="flex flex-wrap gap-3">
            {ACCENT_COLORS.map(color => (
              <button
                key={color.hex}
                type="button"
                onClick={() => setAccentColor(color.hex)}
                className={`group relative w-10 h-10 rounded-lg border-2 transition-all ${accentColor === color.hex ? "border-[#D4AF37] ring-2 ring-[#D4AF37]/30 scale-110" : "border-gray-200 hover:border-gray-400 hover:scale-105"}`}
                style={{ backgroundColor: color.hex }}
                title={color.name}
              >
                {accentColor === color.hex && (
                  <Check className="w-4 h-4 text-white absolute inset-0 m-auto drop-shadow-md" />
                )}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">Selection : <span className="font-mono font-medium">{ACCENT_COLORS.find(c => c.hex === accentColor)?.name || accentColor}</span> ({accentColor})</p>
        </CardContent>
      </Card>

      {/* 9. Notes */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2"><StickyNote className="w-4 h-4" />Notes</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Notes visibles sur la facture"><Textarea value={notesVisibles} onChange={e => setNotesVisibles(e.target.value)} placeholder="Conditions de paiement, mentions legales..." rows={3} className="resize-y" /></Field>
            <Field label="Notes internes (non imprimees)"><Textarea value={notesInternes} onChange={e => setNotesInternes(e.target.value)} placeholder="Notes internes, rappels..." rows={3} className="resize-y" /></Field>
          </div>
        </CardContent>
      </Card>

      {/* 10. Récurrence */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2">
            <ListOrdered className="w-4 h-4" />Récurrence (facturation automatique)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={recurrent}
              onChange={e => setRecurrent(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium">
              Faire de cette facture un modèle récurrent
            </span>
          </label>
          {recurrent && (
            <div className="space-y-3 pl-6 border-l-2 border-violet-200">
              <p className="text-xs text-muted-foreground">
                La facture sera enregistrée comme <strong>modèle</strong> (statut=modele, jamais
                comptabilisée). Le cron quotidien clonera ce modèle à intervalle régulier.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Fréquence">
                  <Sel
                    value={recurrentFreq}
                    onValueChange={v => setRecurrentFreq(v as any)}
                  >
                    <SelectItem value="mensuel">Mensuelle</SelectItem>
                    <SelectItem value="trimestriel">Trimestrielle</SelectItem>
                    <SelectItem value="annuel">Annuelle</SelectItem>
                  </Sel>
                </Field>
                <Field label="Jour du mois (1-28)">
                  <Input
                    type="number"
                    min="1"
                    max="28"
                    value={recurrenceJour}
                    onChange={e => setRecurrenceJour(e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Date de début">
                  <Input
                    type="date"
                    value={recurrenceDebut}
                    onChange={e => setRecurrenceDebut(e.target.value)}
                    placeholder={dateFacture}
                  />
                </Field>
                <Field label="Date de fin (optionnel)">
                  <Input
                    type="date"
                    value={recurrenceFin}
                    onChange={e => setRecurrenceFin(e.target.value)}
                  />
                </Field>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 10. Sticky bottom actions */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePreview} className="text-[#0B0F2E]"><Eye className="w-4 h-4 mr-2" />Apercu</Button>
            <Button variant="outline" onClick={handleDownloadPDF}><Download className="w-4 h-4 mr-2" />Telecharger PDF</Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => handleSave("brouillon")} disabled={saving} variant="outline" className="border-[#0B0F2E] text-[#0B0F2E]"><Save className="w-4 h-4 mr-2" />{saving ? "..." : "Sauvegarder brouillon"}</Button>
            <Button onClick={() => handleSave("en_attente")} disabled={saving} className="bg-[#D4AF37] hover:bg-[#b8973e] text-white font-semibold"><Lock className="w-4 h-4 mr-2" />{saving ? "..." : "Finaliser"}</Button>
          </div>
        </div>
      </div>
    </div>

    {/* Sélecteur catalogue (dialog modal). S'ouvre via le bouton
        "Choisir du catalogue" dans la card Lignes de facture. */}
    <CatalogueSelectorDialog
      open={catalogueDialogOpen}
      onOpenChange={setCatalogueDialogOpen}
      societeId={societeId || null}
      defaultQuantite={1}
      onSelect={(picks, qte) => {
        // Ajoute toutes les lignes sélectionnées avec la quantité choisie.
        // Réutilise la logique de addFromCatalogue (TVA selon offshore).
        setLignes(prev => [
          ...prev,
          ...picks.map(item => {
            const tva = clientOffshore ? 0 : (item.tva_applicable ? 15 : 0)
            const ht = (Number(qte) || 1) * item.prix_unitaire
            return {
              id: genId(),
              description: item.description,
              unite: item.unite || "Forfait",
              quantite: Number(qte) || 1,
              prix_unitaire: item.prix_unitaire,
              taux_tva: tva,
              montant_ht: ht,
            }
          }),
        ])
      }}
    />
    </ClientPageShell>
  )
}

