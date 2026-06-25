"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Search, Plus, Loader2, ShoppingCart, TrendingDown, Clock, AlertCircle, Wallet, Download } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { ReglerHorsBanqueDialog } from "@/components/factures/ReglerHorsBanqueDialog"
import { t, getLocale } from "@/lib/i18n"

interface Facture {
  id: string
  numero_facture: string | null
  tiers: string | null
  description: string | null
  date_facture: string
  date_echeance: string | null
  devise: string
  montant_ht: number
  montant_tva: number
  montant_ttc: number
  montant_mur: number
  solde_non_paye: number | null
  societe_id: string
  statut: string
}

interface Societe { id: string; nom: string }

const STATUT_COLORS: Record<string, string> = {
  en_attente: "bg-yellow-100 text-yellow-800",
  paye: "bg-green-100 text-green-800",
  retard: "bg-red-100 text-red-800",
  partiel: "bg-blue-100 text-blue-800",
  annule: "bg-gray-100 text-gray-600",
}

function fmt(n: number, devise = "MUR") {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: devise, maximumFractionDigits: 0 }).format(n)
}

export default function FournisseursPage() {
  const locale = getLocale()
  const [factures, setFactures] = useState<Facture[]>([])
  const [societes, setSocietes] = useState<Societe[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterSociete, setFilterSociete] = useState("all")
  const [filterStatut, setFilterStatut] = useState("all")
  const [totaux, setTotaux] = useState({ total_mur: 0, nb_factures: 0, nb_en_attente: 0, nb_retard: 0 })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Sélection multi-factures pour règlement hors banque
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [reglementOpen, setReglementOpen] = useState(false)
  const [formSociete, setFormSociete] = useState("")
  const [formTiers, setFormTiers] = useState("")
  const [formDate, setFormDate] = useState("")
  const [formEcheance, setFormEcheance] = useState("")
  const [formDevise, setFormDevise] = useState("MUR")
  const [formHT, setFormHT] = useState("")
  const [formTVA, setFormTVA] = useState("")
  const [formDesc, setFormDesc] = useState("")

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ type: "fournisseur", limit: "200" })
      if (filterSociete !== "all") params.set("societe_id", filterSociete)
      if (filterStatut !== "all") params.set("statut", filterStatut)
      const [facRes, socRes] = await Promise.all([
        fetch(`/api/comptable/factures?${params}`),
        fetch("/api/comptable/societes"),
      ])
      const facData = await facRes.json()
      const socData = await socRes.json()
      setFactures(facData.factures || [])
      setTotaux(facData.totaux || {})
      setSocietes(socData.societes || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [filterSociete, filterStatut])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = factures.filter(f =>
    (f.tiers || "").toLowerCase().includes(search.toLowerCase()) ||
    (f.description || "").toLowerCase().includes(search.toLowerCase())
  )

  const handleCreate = async () => {
    if (!formSociete || !formDate || !formTiers) { setError(t('cab.fournisseurs.err_required', locale)); return }
    setSaving(true); setError(null)
    try {
      const ht = parseFloat(formHT) || 0
      const tva = parseFloat(formTVA) || 0
      const res = await fetch("/api/comptable/factures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: formSociete, type_facture: "fournisseur",
          tiers: formTiers, description: formDesc,
          date_facture: formDate, date_echeance: formEcheance || null,
          devise: formDevise, montant_ht: ht, montant_tva: tva, montant_ttc: ht + tva,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setDialogOpen(false)
      setFormTiers(""); setFormDate(""); setFormHT(""); setFormTVA(""); setFormDesc("")
      fetchData()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : t('cab.fournisseurs.err_generic', locale)) }
    finally { setSaving(false) }
  }

  const updateStatut = async (id: string, statut: string) => {
    await fetch(`/api/comptable/factures/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statut }),
    })
    fetchData()
  }

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E]">{t('cab.fournisseurs.title', locale)}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('cab.fournisseurs.subtitle', locale)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const p = new URLSearchParams({ type_facture: 'fournisseur' })
              if (filterSociete !== 'all') p.set('societe_id', filterSociete)
              if (filterStatut !== 'all') p.set('statut', filterStatut)
              window.location.href = `/api/comptable/factures/export-xlsx?${p}`
            }}
            disabled={loading || filtered.length === 0}
            title={t('cpta.four_export_title', locale)}
            className="gap-2"
          >
            <Download className="w-4 h-4" /> Excel
          </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#0B0F2E] text-white hover:bg-[#2a3a5a]">
              <Plus className="w-4 h-4 mr-2" /> {t('cab.fournisseurs.new', locale)}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{t('cab.fournisseurs.dialog_title', locale)}</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t('cab.fournisseurs.fld_company', locale)}</Label>
                  <Select value={formSociete} onValueChange={setFormSociete}>
                    <SelectTrigger><SelectValue placeholder={t('cab.fournisseurs.choose', locale)} /></SelectTrigger>
                    <SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('cab.fournisseurs.fld_currency', locale)}</Label>
                  <Select value={formDevise} onValueChange={setFormDevise}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["MUR","EUR","USD","GBP"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>{t('cab.fournisseurs.fld_supplier', locale)}</Label>
                <Input value={formTiers} onChange={e => setFormTiers(e.target.value)} placeholder={t('cab.fournisseurs.supplier_placeholder', locale)} />
              </div>
              <div>
                <Label>{t('cab.fournisseurs.fld_description', locale)}</Label>
                <Input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder={t('cab.fournisseurs.desc_placeholder', locale)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t('cab.fournisseurs.fld_date', locale)}</Label><Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} /></div>
                <div><Label>{t('cab.fournisseurs.fld_due', locale)}</Label><Input type="date" value={formEcheance} onChange={e => setFormEcheance(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t('cab.fournisseurs.fld_amount_ht', locale)}</Label><Input type="number" value={formHT} onChange={e => setFormHT(e.target.value)} placeholder="0" /></div>
                <div><Label>{t('cab.fournisseurs.fld_vat', locale)}</Label><Input type="number" value={formTVA} onChange={e => setFormTVA(e.target.value)} placeholder="0" /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('cab.fournisseurs.cancel', locale)}</Button>
              <Button onClick={handleCreate} disabled={saving} className="bg-[#0B0F2E] text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} {t('cab.fournisseurs.create_btn', locale)}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t('cab.fournisseurs.kpi_total_ap', locale), value: fmt(totaux.total_mur), icon: ShoppingCart, color: "text-purple-600" },
          { label: t('cab.fournisseurs.kpi_invoices', locale), value: totaux.nb_factures, icon: TrendingDown, color: "text-blue-600" },
          { label: t('cab.fournisseurs.kpi_pending', locale), value: totaux.nb_en_attente, icon: Clock, color: "text-yellow-600" },
          { label: t('cab.fournisseurs.kpi_late', locale), value: totaux.nb_retard, icon: AlertCircle, color: "text-red-600" },
        ].map(k => (
          <Card key={k.label}><CardContent className="p-4 flex items-center gap-3">
            <k.icon className={`w-8 h-8 ${k.color}`} />
            <div><p className="text-xs text-gray-500">{k.label}</p><p className="text-xl font-bold text-[#0B0F2E]">{k.value}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <Card><CardContent className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input className="pl-9" placeholder={t('cab.fournisseurs.search', locale)} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={filterSociete} onValueChange={setFilterSociete}>
            <SelectTrigger className="w-48"><SelectValue placeholder={t('cab.fournisseurs.all_companies', locale)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('cab.fournisseurs.all_companies', locale)}</SelectItem>
              {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatut} onValueChange={setFilterStatut}>
            <SelectTrigger className="w-40"><SelectValue placeholder={t('cab.fournisseurs.all_status', locale)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('cab.fournisseurs.all_status', locale)}</SelectItem>
              <SelectItem value="en_attente">{t('cab.fournisseurs.status_pending', locale)}</SelectItem>
              <SelectItem value="paye">{t('cab.fournisseurs.status_paid', locale)}</SelectItem>
              <SelectItem value="retard">{t('cab.fournisseurs.status_late', locale)}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent></Card>

      <Card>
        <CardHeader><CardTitle className="text-[#0B0F2E]">{t('cab.fournisseurs.invoices_label', locale)} ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#0B0F2E]" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-500">{t('cab.fournisseurs.empty', locale)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>{t('cab.fournisseurs.col_supplier', locale)}</TableHead>
                  <TableHead>{t('cab.fournisseurs.col_description', locale)}</TableHead>
                  <TableHead>{t('cab.fournisseurs.col_date', locale)}</TableHead>
                  <TableHead>{t('cab.fournisseurs.col_due', locale)}</TableHead>
                  <TableHead className="text-right">{t('cab.fournisseurs.col_amount_ttc', locale)}</TableHead>
                  <TableHead>{t('cab.fournisseurs.col_currency', locale)}</TableHead>
                  <TableHead>{t('cab.fournisseurs.col_status', locale)}</TableHead>
                  <TableHead>{t('cab.fournisseurs.col_action', locale)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(f => {
                  const reglable = f.statut !== "paye" && f.statut !== "annule"
                  return (
                  <TableRow key={f.id}>
                    <TableCell>
                      {reglable && (
                        <Checkbox
                          checked={selectedIds.has(f.id)}
                          onCheckedChange={(v) => {
                            setSelectedIds(prev => {
                              const n = new Set(prev)
                              if (v) n.add(f.id); else n.delete(f.id)
                              return n
                            })
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{f.tiers || "—"}</TableCell>
                    <TableCell className="text-sm text-gray-600 max-w-48 truncate">{f.description || "—"}</TableCell>
                    <TableCell className="text-sm">{f.date_facture ? new Date(f.date_facture).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR') : "—"}</TableCell>
                    <TableCell className="text-sm">{f.date_echeance ? new Date(f.date_echeance).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR') : "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(f.montant_ttc, f.devise)}</TableCell>
                    <TableCell><Badge variant="outline">{f.devise}</Badge></TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUT_COLORS[f.statut] || ""}`}>
                        {f.statut.replace("_", " ")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Select value={f.statut} onValueChange={v => updateStatut(f.id, v)}>
                        <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en_attente">{t('cab.fournisseurs.status_pending', locale)}</SelectItem>
                          <SelectItem value="paye">{t('cab.fournisseurs.status_paid', locale)}</SelectItem>
                          <SelectItem value="retard">{t('cab.fournisseurs.status_late_short', locale)}</SelectItem>
                          <SelectItem value="annule">{t('cab.fournisseurs.status_cancelled', locale)}</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedIds.size > 0 && (() => {
        const selFactures = factures.filter(f => selectedIds.has(f.id))
        const societeIds = new Set(selFactures.map(f => f.societe_id))
        const sameSociete = societeIds.size === 1
        const totalSel = selFactures.reduce((s, f) => s + (Number(f.solde_non_paye ?? f.montant_ttc) || 0), 0)
        return (
          <div className="fixed bottom-4 right-4 z-40 rounded-xl border bg-white shadow-2xl p-4 flex items-center gap-3 min-w-[420px]">
            <div className="flex-1">
              <div className="text-sm font-medium text-[#0B0F2E]">
                {selectedIds.size} {selectedIds.size > 1 ? t('cpta.four_invoices_selected', locale) : t('cpta.four_invoice_selected', locale)}
              </div>
              <div className="text-xs text-gray-600">
                {t('cpta.four_remaining_total', locale)} {totalSel.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} MUR
                {!sameSociete && <span className="text-red-600 ml-2">{t('cpta.four_multiple_companies', locale)}</span>}
              </div>
            </div>
            <Button variant="outline" onClick={() => setSelectedIds(new Set())}>{t('cpta.four_deselect', locale)}</Button>
            <Button
              onClick={() => setReglementOpen(true)}
              disabled={!sameSociete}
              className="bg-[#0B0F2E] text-white hover:bg-[#2a3a5a]"
              title={sameSociete ? t('cpta.four_settle_offbank', locale) : t('cpta.four_same_company_required', locale)}
            >
              <Wallet className="w-4 h-4 mr-2" />
              {t('cpta.four_settle_offbank', locale)}
            </Button>
          </div>
        )
      })()}

      <ReglerHorsBanqueDialog
        open={reglementOpen}
        onClose={() => setReglementOpen(false)}
        societeId={factures.filter(f => selectedIds.has(f.id))[0]?.societe_id || ""}
        factures={factures.filter(f => selectedIds.has(f.id)).map(f => ({
          id: f.id,
          numero_facture: f.numero_facture,
          tiers: f.tiers,
          montant_ttc: f.montant_ttc,
          solde_non_paye: f.solde_non_paye,
          devise: f.devise,
        }))}
        onSuccess={(info) => {
          setSelectedIds(new Set())
          fetchData()
          alert(`✓ ${info.nbFactures} ${t('cpta.four_invoices_settled', locale)} — ${t('cpta.four_letter', locale)} ${info.lettre} — ${info.montantTotal.toLocaleString("fr-FR")} MUR`)
        }}
      />
    </div>
    </ClientPageShell>
  )
}
