'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { ArrowLeftRight, Plus, AlertTriangle, Download, RefreshCw } from 'lucide-react'
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale } from "@/lib/i18n"

// ─── Types ───────────────────────────────────────────────────────────────────

interface Societe {
  id: string
  nom: string
}

interface FluxInterco {
  id: string
  societe_emettrice_id: string
  societe_receptrice_id: string
  societe_emettrice: { id: string; nom: string }
  societe_receptrice: { id: string; nom: string }
  date_flux: string
  description: string
  montant_mur: number
  devise: string
  type_flux: string
  statut_reconciliation: string
  created_at: string
}

interface ReconciliationPaire {
  societe_a_id: string
  societe_a_nom: string
  societe_b_id: string
  societe_b_nom: string
  receivable_a: number
  payable_a: number
  ecart: number
  statut: string
  nb_flux: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-MU', { style: 'currency', currency: 'MUR', minimumFractionDigits: 0 }).format(n)

const fmtDate = (d: string, locale: 'fr' | 'en' = 'fr') => new Date(d).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR')

const getTypeFluxLabels = (locale: 'fr' | 'en'): Record<string, string> => ({
  mise_a_disposition: t('cab.interco.type_mise', locale),
  refacturation: t('cab.interco.type_refact', locale),
  pret: t('cab.interco.type_loan', locale),
  dividende: t('cab.interco.type_dividend', locale),
  remboursement: t('cab.interco.type_refund', locale),
  avance: t('cab.interco.type_advance', locale),
})

const RECONCILIATION_COLORS: Record<string, string> = {
  en_attente: 'bg-yellow-100 text-yellow-700',
  reconcilie: 'bg-green-100 text-green-700',
  litige: 'bg-red-100 text-red-700'
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function IntercoPage() {
  const locale = getLocale()
  const TYPE_FLUX_LABELS = getTypeFluxLabels(locale)
  const [societes, setSocietes] = useState<Societe[]>([])
  const [flux, setFlux] = useState<FluxInterco[]>([])
  const [reconciliation, setReconciliation] = useState<ReconciliationPaire[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingRecon, setLoadingRecon] = useState(false)

  // Filtres
  const [filterSociete, setFilterSociete] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')

  // Nouveau flux
  const [showNewFlux, setShowNewFlux] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newFlux, setNewFlux] = useState({
    societe_emettrice_id: '',
    societe_receptrice_id: '',
    date_flux: new Date().toISOString().split('T')[0],
    description: '',
    montant_mur: 0,
    devise: 'MUR',
    type_flux: 'refacturation'
  })

  const fetchSocietes = useCallback(async () => {
    const res = await fetch('/api/comptable/societes')
    if (res.ok) {
      const d = await res.json()
      setSocietes(d.societes || d || [])
    }
  }, [])

  const fetchFlux = useCallback(async () => {
    const params = new URLSearchParams()
    if (filterSociete !== 'all') params.set('societe_id', filterSociete)
    if (filterType !== 'all') params.set('type_flux', filterType)
    if (dateDebut) params.set('date_debut', dateDebut)
    if (dateFin) params.set('date_fin', dateFin)

    const res = await fetch(`/api/comptable/interco?${params}`)
    if (res.ok) {
      const d = await res.json()
      setFlux(d.flux || [])
    }
  }, [filterSociete, filterType, dateDebut, dateFin])

  const fetchReconciliation = useCallback(async () => {
    setLoadingRecon(true)
    const params = new URLSearchParams()
    if (dateDebut) params.set('date_debut', dateDebut)
    if (dateFin) params.set('date_fin', dateFin)
    const res = await fetch(`/api/comptable/interco/reconciliation?${params}`)
    if (res.ok) {
      const d = await res.json()
      setReconciliation(d.reconciliation || [])
    }
    setLoadingRecon(false)
  }, [dateDebut, dateFin])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await Promise.all([fetchSocietes(), fetchFlux(), fetchReconciliation()])
      setLoading(false)
    }
    load()
  }, [fetchSocietes, fetchFlux, fetchReconciliation])

  const handleCreateFlux = async () => {
    if (!newFlux.societe_emettrice_id || !newFlux.societe_receptrice_id || !newFlux.montant_mur) return
    setCreating(true)
    try {
      const res = await fetch('/api/comptable/interco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newFlux)
      })
      if (res.ok) {
        setShowNewFlux(false)
        setNewFlux({
          societe_emettrice_id: '',
          societe_receptrice_id: '',
          date_flux: new Date().toISOString().split('T')[0],
          description: '',
          montant_mur: 0,
          devise: 'MUR',
          type_flux: 'refacturation'
        })
        await Promise.all([fetchFlux(), fetchReconciliation()])
      }
    } finally {
      setCreating(false)
    }
  }

  const handleExportCSV = () => {
    const headers = [t('cab.interco.col_company_a', locale), t('cab.interco.col_company_b', locale), t('cab.interco.col_receivable', locale), t('cab.interco.col_payable', locale), t('cab.interco.col_gap', locale), t('cab.interco.col_status', locale), t('cab.interco.col_nb_flow', locale)]
    const rows = reconciliation.map(p => [
      p.societe_a_nom,
      p.societe_b_nom,
      p.receivable_a.toFixed(2),
      p.payable_a.toFixed(2),
      p.ecart.toFixed(2),
      p.statut,
      String(p.nb_flux)
    ])

    const csv = [headers, ...rows].map(r => r.join(';')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `interco_reconciliation_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const ecartImportants = reconciliation.filter(p => Math.abs(p.ecart) > 1000)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#D4AF37' }} />
      </div>
    )
  }

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0B0F2E' }}>
            {t('cab.interco.title', locale)}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('cab.interco.subtitle', locale)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            {t('cab.interco.export_csv', locale)}
          </Button>
          <Dialog open={showNewFlux} onOpenChange={setShowNewFlux}>
            <DialogTrigger asChild>
              <Button size="sm" style={{ backgroundColor: '#D4AF37', color: 'white' }}>
                <Plus className="h-4 w-4 mr-2" />
                {t('cab.interco.new_flow', locale)}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{t('cab.interco.dialog_title', locale)}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t('cab.interco.fld_emitter', locale)}</Label>
                    <Select value={newFlux.societe_emettrice_id} onValueChange={v => setNewFlux(f => ({ ...f, societe_emettrice_id: v }))}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder={t('cab.interco.choose', locale)} /></SelectTrigger>
                      <SelectContent>
                        {societes.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t('cab.interco.fld_receiver', locale)}</Label>
                    <Select value={newFlux.societe_receptrice_id} onValueChange={v => setNewFlux(f => ({ ...f, societe_receptrice_id: v }))}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder={t('cab.interco.choose', locale)} /></SelectTrigger>
                      <SelectContent>
                        {societes.filter(s => s.id !== newFlux.societe_emettrice_id).map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t('cab.interco.fld_date', locale)}</Label>
                    <Input
                      type="date"
                      value={newFlux.date_flux}
                      onChange={e => setNewFlux(f => ({ ...f, date_flux: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>{t('cab.interco.fld_type', locale)}</Label>
                    <Select value={newFlux.type_flux} onValueChange={v => setNewFlux(f => ({ ...f, type_flux: v }))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(TYPE_FLUX_LABELS).map(([v, l]) => (
                          <SelectItem key={v} value={v}>{l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>{t('cab.interco.fld_description', locale)}</Label>
                  <Input
                    value={newFlux.description}
                    onChange={e => setNewFlux(f => ({ ...f, description: e.target.value }))}
                    placeholder={t('cab.interco.desc_placeholder', locale)}
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t('cab.interco.fld_amount_mur', locale)}</Label>
                    <Input
                      type="number"
                      value={newFlux.montant_mur}
                      onChange={e => setNewFlux(f => ({ ...f, montant_mur: parseFloat(e.target.value) || 0 }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>{t('cab.interco.fld_currency', locale)}</Label>
                    <Select value={newFlux.devise} onValueChange={v => setNewFlux(f => ({ ...f, devise: v }))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MUR">MUR</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="GBP">GBP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  onClick={handleCreateFlux}
                  disabled={creating}
                  className="w-full"
                  style={{ backgroundColor: '#0B0F2E', color: 'white' }}
                >
                  {creating ? t('cab.interco.creating', locale) : t('cab.interco.create_btn', locale)}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Alertes écarts importants */}
      {ecartImportants.length > 0 && (
        <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            <span className="font-medium text-orange-700">
              {ecartImportants.length} {t('cab.interco.alert_gap_pre', locale)}
            </span>
          </div>
          <div className="space-y-1">
            {ecartImportants.map((p, i) => (
              <p key={i} className="text-sm text-orange-600">
                {p.societe_a_nom} ↔ {p.societe_b_nom} : {t('cab.interco.gap', locale)} {fmt(Math.abs(p.ecart))}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Filtres */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3">
            <div>
              <Label className="text-xs">{t('cab.interco.fld_company', locale)}</Label>
              <Select value={filterSociete} onValueChange={setFilterSociete}>
                <SelectTrigger className="w-48 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('cab.interco.all_companies', locale)}</SelectItem>
                  {societes.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t('cab.interco.fld_type', locale)}</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-48 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('cab.interco.all_types', locale)}</SelectItem>
                  {Object.entries(TYPE_FLUX_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t('cab.interco.fld_from', locale)}</Label>
              <Input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} className="w-40 mt-1" />
            </div>
            <div>
              <Label className="text-xs">{t('cab.interco.fld_to', locale)}</Label>
              <Input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} className="w-40 mt-1" />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => Promise.all([fetchFlux(), fetchReconciliation()])}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tableau croisé réconciliation */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5" style={{ color: '#D4AF37' }} />
            <CardTitle className="text-base">{t('cab.interco.reconciliation_title', locale)}</CardTitle>
            {loadingRecon && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('cab.interco.col_company_a', locale)}</TableHead>
                <TableHead>{t('cab.interco.col_company_b', locale)}</TableHead>
                <TableHead className="text-right">{t('cab.interco.col_receivable', locale)}</TableHead>
                <TableHead className="text-right">{t('cab.interco.col_payable', locale)}</TableHead>
                <TableHead className="text-right">{t('cab.interco.col_gap', locale)}</TableHead>
                <TableHead>{t('cab.interco.col_status', locale)}</TableHead>
                <TableHead className="text-right">{t('cab.interco.col_nb_flow', locale)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reconciliation.map((p, i) => (
                <TableRow key={i} className={Math.abs(p.ecart) > 1000 ? 'bg-orange-50' : ''}>
                  <TableCell className="font-medium">{p.societe_a_nom}</TableCell>
                  <TableCell className="font-medium">{p.societe_b_nom}</TableCell>
                  <TableCell className="text-right">{fmt(p.receivable_a)}</TableCell>
                  <TableCell className="text-right">{fmt(p.payable_a)}</TableCell>
                  <TableCell className="text-right">
                    <span className={Math.abs(p.ecart) > 1000 ? 'text-red-600 font-semibold' : Math.abs(p.ecart) > 0 ? 'text-orange-600' : 'text-green-600'}>
                      {fmt(p.ecart)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge className={RECONCILIATION_COLORS[p.statut] || ''}>
                      {p.statut === 'en_attente' ? t('cab.interco.status_pending', locale) : p.statut === 'reconcilie' ? t('cab.interco.status_reconciled', locale) : t('cab.interco.status_dispute', locale)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{p.nb_flux}</TableCell>
                </TableRow>
              ))}
              {reconciliation.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {t('cab.interco.no_flow_recorded', locale)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Liste des flux */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('cab.interco.flows_period', locale)}
            <Badge variant="secondary" className="ml-2">{flux.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('cab.interco.col_date', locale)}</TableHead>
                <TableHead>{t('cab.interco.col_emitter', locale)}</TableHead>
                <TableHead>{t('cab.interco.col_receiver', locale)}</TableHead>
                <TableHead>{t('cab.interco.col_description', locale)}</TableHead>
                <TableHead>{t('cab.interco.col_type', locale)}</TableHead>
                <TableHead className="text-right">{t('cab.interco.col_amount', locale)}</TableHead>
                <TableHead>{t('cab.interco.col_recon_status', locale)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flux.map(f => (
                <TableRow key={f.id}>
                  <TableCell>{fmtDate(f.date_flux, locale)}</TableCell>
                  <TableCell className="font-medium">{f.societe_emettrice?.nom}</TableCell>
                  <TableCell>{f.societe_receptrice?.nom}</TableCell>
                  <TableCell className="max-w-xs truncate">{f.description}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {TYPE_FLUX_LABELS[f.type_flux] || f.type_flux}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{fmt(f.montant_mur)}</TableCell>
                  <TableCell>
                    <Badge className={RECONCILIATION_COLORS[f.statut_reconciliation] || ''}>
                      {f.statut_reconciliation === 'en_attente' ? t('cab.interco.status_pending', locale)
                        : f.statut_reconciliation === 'reconcilie' ? t('cab.interco.status_reconciled', locale) : t('cab.interco.status_dispute', locale)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {flux.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {t('cab.interco.no_flow_period', locale)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
    </ClientPageShell>
  )
}
