"use client"

/**
 * Page /client/contacts — Gestion CRUD des contacts clients (factures_contacts).
 *
 * Remplace le tab "Clients" de /client/facturation-settings (localStorage)
 * par une UI persistée Supabase. Auto-import depuis localStorage si présent.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Users,
  RefreshCw,
  Upload,
  Search,
  Mail,
  Phone,
  Globe,
  FileSpreadsheet,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { EmptyState } from "@/components/ui/empty-state"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { ContactsImportDialog } from "@/components/client/ContactsImportDialog"
import { t, getLocale, type Locale } from "@/lib/i18n"

interface Contact {
  id: string
  nom: string
  entreprise: string | null
  adresse: string | null
  code_postal: string | null
  ville: string | null
  pays: string | null
  email: string | null
  telephone: string | null
  mobile: string | null
  fax: string | null
  vat_number: string | null
  brn: string | null
  kbis: string | null
  site_web: string | null
  devise: string
  conditions_paiement: number
  offshore: boolean
  actif: boolean
  created_at?: string
  updated_at?: string
}

const DEVISES = ["MUR", "EUR", "USD", "GBP"] as const

export default function ClientContactsPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [items, setItems] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const [includeInactifs, setIncludeInactifs] = useState(false)
  const [search, setSearch] = useState("")
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [fNom, setFNom] = useState("")
  const [fEntreprise, setFEntreprise] = useState("")
  const [fAdresse, setFAdresse] = useState("")
  const [fEmail, setFEmail] = useState("")
  const [fTel, setFTel] = useState("")
  const [fVat, setFVat] = useState("")
  const [fBrn, setFBrn] = useState("")
  const [fKbis, setFKbis] = useState("")
  const [fSiteWeb, setFSiteWeb] = useState("")
  const [fCodePostal, setFCodePostal] = useState("")
  const [fVille, setFVille] = useState("")
  const [fPays, setFPays] = useState("")
  const [fMobile, setFMobile] = useState("")
  const [fFax, setFFax] = useState("")
  const [fDevise, setFDevise] = useState("MUR")
  const [fCondPaie, setFCondPaie] = useState("30")
  const [fOffshore, setFOffshore] = useState(false)
  const [fActif, setFActif] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [legacyCount, setLegacyCount] = useState(0)

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4500)
  }

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const url = `/api/client/factures-contacts?societe_id=${societeId}${
        includeInactifs ? "&include_inactifs=1" : ""
      }`
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || t('inv.ct.toast_error', locale))
      setItems(data?.items || [])
    } catch (e: any) {
      showToast(e?.message || t('inv.ct.toast_error_load', locale), "error")
    } finally {
      setLoading(false)
    }
  }, [societeId, includeInactifs, locale])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (loading || items.length > 0) {
      setLegacyCount(0)
      return
    }
    try {
      const raw = localStorage.getItem("lexora_invoice_clients")
      if (!raw) return
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length > 0) setLegacyCount(arr.length)
    } catch {
      /* ignore */
    }
  }, [items, loading])

  function openNew() {
    setEditing(null)
    setFNom("")
    setFEntreprise("")
    setFAdresse("")
    setFCodePostal("")
    setFVille("")
    setFPays("")
    setFEmail("")
    setFTel("")
    setFMobile("")
    setFFax("")
    setFVat("")
    setFBrn("")
    setFKbis("")
    setFSiteWeb("")
    setFDevise("MUR")
    setFCondPaie("30")
    setFOffshore(false)
    setFActif(true)
    setDialogOpen(true)
  }

  function openEdit(c: Contact) {
    setEditing(c)
    setFNom(c.nom)
    setFEntreprise(c.entreprise || "")
    setFAdresse(c.adresse || "")
    setFCodePostal(c.code_postal || "")
    setFVille(c.ville || "")
    setFPays(c.pays || "")
    setFEmail(c.email || "")
    setFTel(c.telephone || "")
    setFMobile(c.mobile || "")
    setFFax(c.fax || "")
    setFVat(c.vat_number || "")
    setFBrn(c.brn || "")
    setFKbis(c.kbis || "")
    setFSiteWeb(c.site_web || "")
    setFDevise(c.devise)
    setFCondPaie(String(c.conditions_paiement))
    setFOffshore(c.offshore)
    setFActif(c.actif)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!societeId) return
    const nom = fNom.trim()
    if (!nom) {
      showToast(t('inv.ct.toast_name_required', locale), "error")
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        nom,
        entreprise: fEntreprise.trim() || null,
        adresse: fAdresse.trim() || null,
        code_postal: fCodePostal.trim() || null,
        ville: fVille.trim() || null,
        pays: fPays.trim() || null,
        email: fEmail.trim() || null,
        telephone: fTel.trim() || null,
        mobile: fMobile.trim() || null,
        fax: fFax.trim() || null,
        vat_number: fVat.trim() || null,
        brn: fBrn.trim() || null,
        kbis: fKbis.trim() || null,
        site_web: fSiteWeb.trim() || null,
        devise: fDevise,
        conditions_paiement: Number(fCondPaie) || 30,
        offshore: fOffshore,
        actif: fActif,
      }
      const url = editing
        ? `/api/client/factures-contacts/${editing.id}`
        : `/api/client/factures-contacts`
      const method = editing ? "PATCH" : "POST"
      const body = editing ? payload : { ...payload, societe_id: societeId }
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || t('inv.ct.toast_error', locale))
      showToast(editing ? t('inv.ct.toast_modified', locale) : t('inv.ct.toast_added', locale))
      setDialogOpen(false)
      await load()
    } catch (e: any) {
      showToast(e?.message || t('inv.ct.toast_error', locale), "error")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(c: Contact) {
    if (!confirm(t('inv.ct.confirm_delete', locale).replace('{name}', c.nom))) return
    try {
      const res = await fetch(`/api/client/factures-contacts/${c.id}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data?.can_archive) {
          if (
            confirm(
              `${data.error}${t('inv.ct.confirm_archive_suffix', locale)}`,
            )
          ) {
            const r2 = await fetch(`/api/client/factures-contacts/${c.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...c, actif: false }),
            })
            const d2 = await r2.json()
            if (!r2.ok) throw new Error(d2?.error || t('inv.ct.toast_error', locale))
            showToast(t('inv.ct.toast_archived', locale))
            await load()
          }
          return
        }
        throw new Error(data?.error || t('inv.ct.toast_error', locale))
      }
      showToast(t('inv.ct.toast_deleted', locale))
      await load()
    } catch (e: any) {
      showToast(e?.message || t('inv.ct.toast_error', locale), "error")
    }
  }

  async function importLegacy() {
    if (!societeId) return
    try {
      const raw = localStorage.getItem("lexora_invoice_clients")
      if (!raw) return
      const arr = JSON.parse(raw)
      if (!Array.isArray(arr) || arr.length === 0) return
      const itemsToImport = arr.map((it: any) => ({
        nom: String(it.nom || it.entreprise || "Contact"),
        entreprise: it.entreprise ? String(it.entreprise) : null,
        adresse: it.adresse ? String(it.adresse) : null,
        code_postal: it.code_postal ? String(it.code_postal) : null,
        ville: it.ville ? String(it.ville) : null,
        pays: it.pays ? String(it.pays) : null,
        email: it.email ? String(it.email) : null,
        telephone: it.telephone ? String(it.telephone) : null,
        mobile: it.mobile ? String(it.mobile) : null,
        fax: it.fax ? String(it.fax) : null,
        vat_number: it.vat_number ? String(it.vat_number) : null,
        brn: it.brn ? String(it.brn) : null,
        kbis: it.kbis ? String(it.kbis) : null,
        site_web: it.site_web ? String(it.site_web) : null,
        devise: String(it.devise || "MUR"),
        conditions_paiement: Number(it.conditions_paiement) || 30,
        offshore: it.offshore === true,
        actif: true,
      }))
      const res = await fetch(`/api/client/factures-contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, items: itemsToImport }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || t('inv.ct.toast_error', locale))
      showToast(t('inv.ct.toast_imported', locale).replace('{n}', String(data?.inserted)))
      setLegacyCount(0)
      await load()
    } catch (e: any) {
      showToast(e?.message || t('inv.ct.toast_error_import', locale), "error")
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (i) =>
        i.nom.toLowerCase().includes(q) ||
        (i.entreprise || "").toLowerCase().includes(q) ||
        (i.email || "").toLowerCase().includes(q),
    )
  }, [items, search])

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6 max-w-6xl">
        {toast && (
          <div
            className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white ${
              toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
            }`}
          >
            {toast.msg}
          </div>
        )}

        {/* HEADER */}
        <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-50 p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-br from-sky-600 to-blue-600 p-3 text-white shadow-md">
                <Users className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-sky-900">{t('inv.ct.title', locale)}</h1>
                <p className="text-sm text-sky-800/80 mt-0.5">
                  {t('inv.ct.subtitle', locale)}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={load} disabled={loading || !societeId} size="sm">
                <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                {t('inv.ct.refresh', locale)}
              </Button>
              <Button
                variant="outline"
                onClick={() => setImportDialogOpen(true)}
                disabled={!societeId}
                className="border-sky-300 text-sky-700 hover:bg-sky-50"
              >
                <FileSpreadsheet className="h-4 w-4 mr-1.5" />
                {t('inv.ct.import_file', locale)}
              </Button>
              <Button
                onClick={openNew}
                disabled={!societeId}
                className="bg-sky-600 hover:bg-sky-700 text-white shadow-md"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                {t('inv.ct.new_contact', locale)}
              </Button>
            </div>
          </div>
        </div>

        {legacyCount > 0 && (
          <Card className="border-amber-300 bg-amber-50">
            <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm">
                <strong>{legacyCount} {t('inv.ct.legacy_found', locale)}</strong> —
                {' '}{t('inv.ct.legacy_note', locale)}
              </div>
              <Button
                onClick={importLegacy}
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                <Upload className="h-4 w-4 mr-1.5" />
                {t('inv.ct.import_now', locale)}
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-3 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('inv.ct.search_ph', locale)}
                className="pl-8 h-9"
              />
            </div>
            <Label className="flex items-center gap-2 cursor-pointer text-sm">
              <Switch checked={includeInactifs} onCheckedChange={setIncludeInactifs} />
              {t('inv.ct.include_inactive', locale)}
            </Label>
          </CardContent>
        </Card>

        {!societeId ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={Users}
                title={t('inv.ct.no_societe', locale)}
              />
            </CardContent>
          </Card>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-sky-600" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={Users}
                title={items.length === 0
                  ? t('inv.ct.empty', locale)
                  : t('inv.ct.empty_filter', locale)}
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('inv.ct.col_name', locale)}</TableHead>
                    <TableHead>{t('inv.ct.col_contact', locale)}</TableHead>
                    <TableHead>{t('inv.ct.col_vat', locale)}</TableHead>
                    <TableHead className="text-right">{t('inv.ct.col_pay', locale)}</TableHead>
                    <TableHead>{t('inv.ct.col_currency', locale)}</TableHead>
                    <TableHead>{t('inv.ct.col_status', locale)}</TableHead>
                    <TableHead className="text-right">{t('inv.ct.col_actions', locale)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.id} className={!c.actif ? "opacity-60" : ""}>
                      <TableCell>
                        <div className="font-medium">{c.nom}</div>
                        {c.entreprise && (
                          <div className="text-xs text-muted-foreground">{c.entreprise}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            {c.email}
                          </div>
                        )}
                        {c.telephone && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {c.telephone}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {c.vat_number && <div>{t('inv.ct.vat_label', locale)} : {c.vat_number}</div>}
                        {c.brn && <div className="text-muted-foreground">{t('inv.ct.brn_label', locale)} : {c.brn}</div>}
                        {c.kbis && <div className="text-muted-foreground">{c.kbis}</div>}
                        {!c.vat_number && !c.brn && !c.kbis && <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">{c.conditions_paiement} {t('inv.ct.days_short', locale)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{c.devise}</Badge>
                        {c.offshore && (
                          <Badge className="ml-1 text-[10px] bg-blue-100 text-blue-700 border-blue-300">
                            <Globe className="h-3 w-3 mr-0.5" />
                            {t('inv.ct.offshore', locale)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.actif ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">
                            {t('inv.ct.active', locale)}
                          </Badge>
                        ) : (
                          <Badge variant="outline">{t('inv.ct.archived', locale)}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(c)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? t('inv.ct.dlg_edit', locale) : t('inv.ct.dlg_new', locale)}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('inv.ct.field_name', locale)}</Label>
                  <Input value={fNom} onChange={(e) => setFNom(e.target.value)} placeholder={t('inv.ct.ph_name', locale)} />
                </div>
                <div className="space-y-1">
                  <Label>{t('inv.ct.field_company', locale)}</Label>
                  <Input value={fEntreprise} onChange={(e) => setFEntreprise(e.target.value)} placeholder={t('inv.ct.ph_company', locale)} />
                </div>
              </div>
              {/* Adresse structurée : ligne adresse libre + code postal +
                  ville + pays. Permet le filtrage / regroupement ultérieur
                  par ville/pays et le formatage propre sur la facture. */}
              <div className="space-y-1">
                <Label>{t('inv.ct.field_address', locale)}</Label>
                <Textarea
                  value={fAdresse}
                  onChange={(e) => setFAdresse(e.target.value)}
                  rows={2}
                  placeholder={t('inv.ct.ph_address', locale)}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>{t('inv.ct.field_zip', locale)}</Label>
                  <Input value={fCodePostal} onChange={(e) => setFCodePostal(e.target.value)} placeholder="11328" />
                </div>
                <div className="space-y-1">
                  <Label>{t('inv.ct.field_city', locale)}</Label>
                  <Input value={fVille} onChange={(e) => setFVille(e.target.value)} placeholder={t('inv.ct.ph_city', locale)} />
                </div>
                <div className="space-y-1">
                  <Label>{t('inv.ct.field_country', locale)}</Label>
                  <Input value={fPays} onChange={(e) => setFPays(e.target.value)} placeholder={t('inv.ct.ph_country', locale)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('inv.ct.field_email', locale)}</Label>
                  <Input type="email" value={fEmail} onChange={(e) => setFEmail(e.target.value)} placeholder="bob@acme.com" />
                </div>
                <div className="space-y-1">
                  <Label>{t('inv.ct.field_phone', locale)}</Label>
                  <Input value={fTel} onChange={(e) => setFTel(e.target.value)} placeholder="+230 5..." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('inv.ct.field_mobile', locale)}</Label>
                  <Input value={fMobile} onChange={(e) => setFMobile(e.target.value)} placeholder="+230 5 123 4567" />
                </div>
                <div className="space-y-1">
                  <Label>{t('inv.ct.field_fax', locale)}</Label>
                  <Input value={fFax} onChange={(e) => setFFax(e.target.value)} placeholder="+230 2 12 34 56" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>{t('inv.ct.field_vat_number', locale)}</Label>
                  <Input value={fVat} onChange={(e) => setFVat(e.target.value)} placeholder="VAT-XXX" />
                </div>
                <div className="space-y-1">
                  <Label>{t('inv.ct.field_brn', locale)}</Label>
                  <Input value={fBrn} onChange={(e) => setFBrn(e.target.value)} placeholder="C12345678" />
                </div>
                <div className="space-y-1">
                  <Label>{t('inv.ct.field_kbis', locale)}</Label>
                  <Input value={fKbis} onChange={(e) => setFKbis(e.target.value)} placeholder={t('inv.ct.ph_kbis', locale)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>{t('inv.ct.field_web', locale)}</Label>
                  <Input value={fSiteWeb} onChange={(e) => setFSiteWeb(e.target.value)} placeholder="https://..." />
                </div>
                <div className="space-y-1">
                  <Label>{t('inv.ct.field_currency', locale)}</Label>
                  <Select value={fDevise} onValueChange={setFDevise}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEVISES.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t('inv.ct.field_pay_days', locale)}</Label>
                  <Input
                    type="number"
                    min="0"
                    max="365"
                    value={fCondPaie}
                    onChange={(e) => setFCondPaie(e.target.value)}
                  />
                </div>
              </div>
              <Label className="flex items-center gap-2 cursor-pointer">
                <Switch checked={fOffshore} onCheckedChange={setFOffshore} />
                {t('inv.ct.toggle_offshore', locale)}
              </Label>
              {editing && (
                <Label className="flex items-center gap-2 cursor-pointer">
                  <Switch checked={fActif} onCheckedChange={setFActif} />
                  {t('inv.ct.toggle_active', locale)}
                </Label>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
                {t('inv.ct.cancel', locale)}
              </Button>
              <Button
                onClick={handleSave}
                disabled={submitting || !fNom.trim()}
                className="bg-sky-600 hover:bg-sky-700 text-white"
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? t('inv.ct.save', locale) : t('inv.ct.add', locale)}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Import en masse (CSV/XLSX) — réutilise l'endpoint bulk
            POST /api/client/factures-contacts { items: [...] } mis en
            place depuis la PR #55. */}
        <ContactsImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          societeId={societeId}
          onImported={() => load()}
        />
      </div>
    </ClientPageShell>
  )
}
