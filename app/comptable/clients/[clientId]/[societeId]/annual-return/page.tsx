'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { getAvailableYears } from '@/lib/fiscal-years'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { Building2, Users, UserCog, TrendingUp, CalendarDays, Plus, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { t, getLocale, type Locale } from '@/lib/i18n'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Societe {
  id: string
  nom: string
  numero_registre?: string
  registered_office?: string
  date_incorporation?: string
  nature_activite?: string
  capital_social?: number
  nb_actions_total?: number
}

interface Actionnaire {
  id: string
  nom: string
  prenom?: string
  type_personne: string
  nationalite?: string
  nb_actions: number
  type_actions: string
  valeur_nominale: number
  pourcentage?: number
  date_entree?: string
  actif: boolean
}

interface Administrateur {
  id: string
  nom: string
  prenom?: string
  type: string
  nationalite?: string
  nic?: string
  date_nomination?: string
  date_fin?: string
  actif: boolean
}

interface AnnualReturn {
  id: string
  annee: number
  date_agm?: string
  date_echeance?: string
  date_soumission?: string
  reference_roc?: string
  statut: string
  actif_total: number
  passif_total: number
  chiffre_affaires: number
  resultat_net: number
  notes?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-MU', { style: 'currency', currency: 'MUR', minimumFractionDigits: 0 }).format(n)

const fmtDate = (d?: string, locale: Locale = 'fr') => d ? new Date(d).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB') : '—'

function getDeadlineStatus(echeance?: string) {
  if (!echeance) return null
  const today = new Date()
  const deadline = new Date(echeance)
  const diffDays = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'depasse'
  if (diffDays <= 7) return 'urgent'
  return 'ok'
}

const TYPE_LABELS: Record<string, string> = {
  director: 'Director',
  secretary: 'Secretary',
  chairperson: 'Chairperson',
  ceo: 'CEO',
  cfo: 'CFO'
}

const getStatutLabels = (locale: Locale): Record<string, string> => ({
  a_faire: t('cabclt.ar.status_todo', locale),
  en_cours: t('cabclt.ar.status_inprogress', locale),
  soumis: t('cabclt.ar.status_submitted', locale),
  accepte: t('cabclt.ar.status_accepted', locale),
  rejete: t('cabclt.ar.status_rejected', locale)
})

const STATUT_COLORS: Record<string, string> = {
  a_faire: 'bg-gray-100 text-gray-700',
  en_cours: 'bg-blue-100 text-blue-700',
  soumis: 'bg-yellow-100 text-yellow-700',
  accepte: 'bg-green-100 text-green-700',
  rejete: 'bg-red-100 text-red-700'
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AnnualReturnPage() {
  const params = useParams()
  const locale = getLocale()
  const STATUT_LABELS = getStatutLabels(locale)
  const societeId = params?.societeId as string

  const [societe, setSociete] = useState<Societe | null>(null)
  const [actionnaires, setActionnaires] = useState<Actionnaire[]>([])
  const [administrateurs, setAdministrateurs] = useState<Administrateur[]>([])
  const [annualReturn, setAnnualReturn] = useState<AnnualReturn | null>(null)
  const [annee, setAnnee] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(true)

  // Formulaires
  const [showActionnaire, setShowActionnaire] = useState(false)
  const [showAdministrateur, setShowAdministrateur] = useState(false)
  const [showSocieteEdit, setShowSocieteEdit] = useState(false)
  const [savingReturn, setSavingReturn] = useState(false)

  const [newActionnaire, setNewActionnaire] = useState({
    nom: '', prenom: '', type_personne: 'physique', nationalite: 'mauricienne',
    nb_actions: 0, type_actions: 'ordinaires', valeur_nominale: 1, pourcentage: 0,
    date_entree: ''
  })

  const [newAdmin, setNewAdmin] = useState({
    nom: '', prenom: '', type: 'director', nationalite: 'mauricienne',
    nic: '', date_nomination: ''
  })

  const [returnForm, setReturnForm] = useState({
    date_agm: '', statut: 'a_faire', reference_roc: '',
    actif_total: 0, passif_total: 0, chiffre_affaires: 0, resultat_net: 0, notes: ''
  })

  const [societeForm, setSocieteForm] = useState({
    registered_office: '', date_incorporation: '',
    nature_activite: '', capital_social: 0, nb_actions_total: 0
  })

  const fetchData = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const [sRes, actRes, admRes, arRes] = await Promise.all([
        fetch(`/api/comptable/societes?id=${societeId}`),
        fetch(`/api/comptable/roc/actionnaires?societe_id=${societeId}`),
        fetch(`/api/comptable/roc/administrateurs?societe_id=${societeId}`),
        fetch(`/api/comptable/roc/annual-return?societe_id=${societeId}&annee=${annee}`)
      ])

      if (sRes.ok) {
        const sData = await sRes.json()
        const s = Array.isArray(sData) ? sData[0] : (sData.societes?.[0] || sData)
        if (s) {
          setSociete(s)
          setSocieteForm({
            registered_office: s.registered_office || '',
            date_incorporation: s.date_incorporation || '',
            nature_activite: s.nature_activite || '',
            capital_social: s.capital_social || 0,
            nb_actions_total: s.nb_actions_total || 0
          })
        }
      }

      if (actRes.ok) {
        const d = await actRes.json()
        setActionnaires(d.actionnaires || [])
      }

      if (admRes.ok) {
        const d = await admRes.json()
        setAdministrateurs(d.administrateurs || [])
      }

      if (arRes.ok) {
        const d = await arRes.json()
        const ar = d.annual_returns?.[0]
        if (ar) {
          setAnnualReturn(ar)
          setReturnForm({
            date_agm: ar.date_agm || '',
            statut: ar.statut || 'a_faire',
            reference_roc: ar.reference_roc || '',
            actif_total: ar.actif_total || 0,
            passif_total: ar.passif_total || 0,
            chiffre_affaires: ar.chiffre_affaires || 0,
            resultat_net: ar.resultat_net || 0,
            notes: ar.notes || ''
          })
        }
      }
    } finally {
      setLoading(false)
    }
  }, [societeId, annee])

  useEffect(() => { fetchData() }, [fetchData])

  const handleAddActionnaire = async () => {
    const res = await fetch('/api/comptable/roc/actionnaires', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newActionnaire, societe_id: societeId })
    })
    if (res.ok) {
      setShowActionnaire(false)
      setNewActionnaire({
        nom: '', prenom: '', type_personne: 'physique', nationalite: 'mauricienne',
        nb_actions: 0, type_actions: 'ordinaires', valeur_nominale: 1, pourcentage: 0,
        date_entree: ''
      })
      fetchData()
    }
  }

  const handleAddAdmin = async () => {
    const res = await fetch('/api/comptable/roc/administrateurs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newAdmin, societe_id: societeId })
    })
    if (res.ok) {
      setShowAdministrateur(false)
      setNewAdmin({ nom: '', prenom: '', type: 'director', nationalite: 'mauricienne', nic: '', date_nomination: '' })
      fetchData()
    }
  }

  const handleSaveReturn = async () => {
    setSavingReturn(true)
    try {
      const method = annualReturn ? 'PATCH' : 'POST'
      const url = annualReturn
        ? `/api/comptable/roc/annual-return?id=${annualReturn.id}`
        : '/api/comptable/roc/annual-return'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...returnForm, societe_id: societeId, annee })
      })
      if (res.ok) fetchData()
    } finally {
      setSavingReturn(false)
    }
  }

  const handleDeleteActionnaire = async (id: string) => {
    await fetch(`/api/comptable/roc/actionnaires?id=${id}`, { method: 'DELETE' })
    fetchData()
  }

  const handleDeleteAdmin = async (id: string) => {
    await fetch(`/api/comptable/roc/administrateurs?id=${id}`, { method: 'DELETE' })
    fetchData()
  }

  const deadlineStatus = getDeadlineStatus(annualReturn?.date_echeance)
  const totalActions = actionnaires.filter(a => a.actif).reduce((s, a) => s + (a.nb_actions || 0), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#D4AF37' }} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0B0F2E' }}>
            {t('cabclt.ar.title', locale)}
          </h1>
          <p className="text-muted-foreground mt-1">{societe?.nom} — {t('cabclt.ar.fiscal_year', locale)} {annee}</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(annee)} onValueChange={v => setAnnee(parseInt(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getAvailableYears(3, 1).map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {annualReturn && (
            <Badge className={STATUT_COLORS[annualReturn.statut]}>
              {STATUT_LABELS[annualReturn.statut]}
            </Badge>
          )}
        </div>
      </div>

      {/* Alerte deadline */}
      {deadlineStatus === 'depasse' && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-medium">
            {t('cabclt.ar.deadline_passed', locale)} {fmtDate(annualReturn?.date_echeance, locale)}
          </span>
        </div>
      )}
      {deadlineStatus === 'urgent' && (
        <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg text-orange-700">
          <Clock className="h-5 w-5" />
          <span className="font-medium">
            {t('cabclt.ar.deadline_urgent', locale)} {fmtDate(annualReturn?.date_echeance, locale)}
          </span>
        </div>
      )}

      {/* ── Section 1 : Infos société ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5" style={{ color: '#D4AF37' }} />
              <CardTitle className="text-base">{t('cabclt.ar.legal_info', locale)}</CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowSocieteEdit(!showSocieteEdit)}>
              {showSocieteEdit ? t('cabclt.ar.hide', locale) : t('cabclt.ar.edit', locale)}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Registered Office</p>
              <p className="font-medium">{societe?.registered_office || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Date d&apos;incorporation</p>
              <p className="font-medium">{fmtDate(societe?.date_incorporation)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('cabclt.ar.activity_nature', locale)}</p>
              <p className="font-medium">{societe?.nature_activite || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Capital social</p>
              <p className="font-medium">{societe?.capital_social ? fmt(societe.capital_social) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Nb actions total</p>
              <p className="font-medium">{societe?.nb_actions_total?.toLocaleString('fr-FR') || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">BRN</p>
              <p className="font-medium">{societe?.numero_registre || '—'}</p>
            </div>
          </div>

          {showSocieteEdit && (
            <div className="mt-4 pt-4 border-t space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>{t('cabclt.ar.registered_office', locale)}</Label>
                  <Input
                    value={societeForm.registered_office}
                    onChange={e => setSocieteForm(f => ({ ...f, registered_office: e.target.value }))}
                    placeholder={t('cabclt.ar.address_placeholder', locale)}
                  />
                </div>
                <div>
                  <Label>{t('cabclt.ar.incorp_date', locale)}</Label>
                  <Input
                    type="date"
                    value={societeForm.date_incorporation}
                    onChange={e => setSocieteForm(f => ({ ...f, date_incorporation: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>{t('cabclt.ar.activity_nature', locale)}</Label>
                  <Input
                    value={societeForm.nature_activite}
                    onChange={e => setSocieteForm(f => ({ ...f, nature_activite: e.target.value }))}
                    placeholder={t('cabclt.ar.activity_placeholder', locale)}
                  />
                </div>
                <div>
                  <Label>{t('cabclt.ar.share_capital_mur', locale)}</Label>
                  <Input
                    type="number"
                    value={societeForm.capital_social}
                    onChange={e => setSocieteForm(f => ({ ...f, capital_social: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div>
                  <Label>{t('cabclt.ar.total_shares', locale)}</Label>
                  <Input
                    type="number"
                    value={societeForm.nb_actions_total}
                    onChange={e => setSocieteForm(f => ({ ...f, nb_actions_total: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              </div>
              <Button
                onClick={async () => {
                  await fetch(`/api/comptable/societes/${societeId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(societeForm)
                  })
                  setShowSocieteEdit(false)
                  fetchData()
                }}
                style={{ backgroundColor: '#0B0F2E', color: 'white' }}
              >
                {t('cabclt.ar.save', locale)}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Section 2 : Actionnariat ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" style={{ color: '#D4AF37' }} />
              <CardTitle className="text-base">{t('cabclt.ar.shareholders', locale)}</CardTitle>
              <Badge variant="secondary">{actionnaires.filter(a => a.actif).length} {t('cabclt.ar.shareholders_count', locale)}</Badge>
            </div>
            <Dialog open={showActionnaire} onOpenChange={setShowActionnaire}>
              <DialogTrigger asChild>
                <Button size="sm" style={{ backgroundColor: '#D4AF37', color: 'white' }}>
                  <Plus className="h-4 w-4 mr-1" /> Ajouter
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('cabclt.ar.new_shareholder', locale)}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>{t('cabclt.ar.name', locale)} *</Label>
                      <Input value={newActionnaire.nom} onChange={e => setNewActionnaire(f => ({ ...f, nom: e.target.value }))} />
                    </div>
                    <div>
                      <Label>{t('cabclt.ar.firstname', locale)}</Label>
                      <Input value={newActionnaire.prenom} onChange={e => setNewActionnaire(f => ({ ...f, prenom: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>{t('cabclt.ar.person_type', locale)}</Label>
                      <Select value={newActionnaire.type_personne} onValueChange={v => setNewActionnaire(f => ({ ...f, type_personne: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="physique">{t('cabclt.ar.individual', locale)}</SelectItem>
                          <SelectItem value="morale">{t('cabclt.ar.corporate', locale)}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{t('cabclt.ar.nationality', locale)}</Label>
                      <Input value={newActionnaire.nationalite} onChange={e => setNewActionnaire(f => ({ ...f, nationalite: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>{t('cabclt.ar.nb_shares', locale)}</Label>
                      <Input type="number" value={newActionnaire.nb_actions} onChange={e => setNewActionnaire(f => ({ ...f, nb_actions: parseInt(e.target.value) || 0 }))} />
                    </div>
                    <div>
                      <Label>{t('cabclt.ar.share_type', locale)}</Label>
                      <Select value={newActionnaire.type_actions} onValueChange={v => setNewActionnaire(f => ({ ...f, type_actions: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ordinaires">{t('cabclt.ar.ordinary', locale)}</SelectItem>
                          <SelectItem value="preferentielles">{t('cabclt.ar.preference', locale)}</SelectItem>
                          <SelectItem value="rerachetables">{t('cabclt.ar.redeemable', locale)}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{t('cabclt.ar.par_value', locale)}</Label>
                      <Input type="number" step="0.01" value={newActionnaire.valeur_nominale} onChange={e => setNewActionnaire(f => ({ ...f, valeur_nominale: parseFloat(e.target.value) || 1 }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>{t('cabclt.ar.pct_held', locale)}</Label>
                      <Input type="number" step="0.01" max="100" value={newActionnaire.pourcentage} onChange={e => setNewActionnaire(f => ({ ...f, pourcentage: parseFloat(e.target.value) || 0 }))} />
                    </div>
                    <div>
                      <Label>{t('cabclt.ar.entry_date', locale)}</Label>
                      <Input type="date" value={newActionnaire.date_entree} onChange={e => setNewActionnaire(f => ({ ...f, date_entree: e.target.value }))} />
                    </div>
                  </div>
                  <Button onClick={handleAddActionnaire} className="w-full" style={{ backgroundColor: '#0B0F2E', color: 'white' }}>
                    {t('cabclt.ar.add_shareholder', locale)}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('cabclt.ar.name', locale)}</TableHead>
                <TableHead>{t('cabclt.ar.type', locale)}</TableHead>
                <TableHead className="text-right">{t('cabclt.ar.nb_shares', locale)}</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead>{t('cabclt.ar.share_type', locale)}</TableHead>
                <TableHead>{t('cabclt.ar.entry_date', locale)}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {actionnaires.filter(a => a.actif).map(a => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.prenom ? `${a.prenom} ${a.nom}` : a.nom}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {a.type_personne === 'physique' ? t('cabclt.ar.individual_long', locale) : t('cabclt.ar.corporate_long', locale)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{a.nb_actions?.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB')}</TableCell>
                  <TableCell className="text-right">
                    {totalActions > 0
                      ? `${((a.nb_actions / totalActions) * 100).toFixed(1)}%`
                      : a.pourcentage ? `${a.pourcentage}%` : '—'}
                  </TableCell>
                  <TableCell>{a.type_actions}</TableCell>
                  <TableCell>{fmtDate(a.date_entree, locale)}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => handleDeleteActionnaire(a.id)}
                    >
                      {t('cabclt.ar.remove', locale)}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {actionnaires.filter(a => a.actif).length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {t('cabclt.ar.no_shareholders', locale)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Section 3 : Administrateurs ──────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCog className="h-5 w-5" style={{ color: '#D4AF37' }} />
              <CardTitle className="text-base">{t('cabclt.ar.directors', locale)}</CardTitle>
              <Badge variant="secondary">{administrateurs.filter(a => a.actif).length} {t('cabclt.ar.active_count', locale)}</Badge>
            </div>
            <Dialog open={showAdministrateur} onOpenChange={setShowAdministrateur}>
              <DialogTrigger asChild>
                <Button size="sm" style={{ backgroundColor: '#D4AF37', color: 'white' }}>
                  <Plus className="h-4 w-4 mr-1" /> Ajouter
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('cabclt.ar.new_director', locale)}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>{t('cabclt.ar.name', locale)} *</Label>
                      <Input value={newAdmin.nom} onChange={e => setNewAdmin(f => ({ ...f, nom: e.target.value }))} />
                    </div>
                    <div>
                      <Label>{t('cabclt.ar.firstname', locale)}</Label>
                      <Input value={newAdmin.prenom} onChange={e => setNewAdmin(f => ({ ...f, prenom: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>{t('cabclt.ar.role', locale)}</Label>
                      <Select value={newAdmin.type} onValueChange={v => setNewAdmin(f => ({ ...f, type: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="director">Director</SelectItem>
                          <SelectItem value="secretary">Secretary</SelectItem>
                          <SelectItem value="chairperson">Chairperson</SelectItem>
                          <SelectItem value="ceo">CEO</SelectItem>
                          <SelectItem value="cfo">CFO</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{t('cabclt.ar.nationality', locale)}</Label>
                      <Input value={newAdmin.nationalite} onChange={e => setNewAdmin(f => ({ ...f, nationalite: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>NIC</Label>
                      <Input value={newAdmin.nic} onChange={e => setNewAdmin(f => ({ ...f, nic: e.target.value }))} placeholder={t('cabclt.ar.nic_placeholder', locale)} />
                    </div>
                    <div>
                      <Label>{t('cabclt.ar.nomination_date', locale)}</Label>
                      <Input type="date" value={newAdmin.date_nomination} onChange={e => setNewAdmin(f => ({ ...f, date_nomination: e.target.value }))} />
                    </div>
                  </div>
                  <Button onClick={handleAddAdmin} className="w-full" style={{ backgroundColor: '#0B0F2E', color: 'white' }}>
                    {t('cabclt.ar.add_director', locale)}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('cabclt.ar.name', locale)}</TableHead>
                <TableHead>{t('cabclt.ar.role', locale)}</TableHead>
                <TableHead>{t('cabclt.ar.nationality', locale)}</TableHead>
                <TableHead>NIC</TableHead>
                <TableHead>{t('cabclt.ar.nomination_date', locale)}</TableHead>
                <TableHead>{t('cabclt.ar.status', locale)}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {administrateurs.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.prenom ? `${a.prenom} ${a.nom}` : a.nom}</TableCell>
                  <TableCell>
                    <Badge style={{ backgroundColor: '#0B0F2E15', color: '#0B0F2E' }}>
                      {TYPE_LABELS[a.type] || a.type}
                    </Badge>
                  </TableCell>
                  <TableCell>{a.nationalite || '—'}</TableCell>
                  <TableCell className="font-mono text-sm">{a.nic || '—'}</TableCell>
                  <TableCell>{fmtDate(a.date_nomination, locale)}</TableCell>
                  <TableCell>
                    {a.actif
                      ? <Badge className="bg-green-100 text-green-700">{t('cabclt.ar.active', locale)}</Badge>
                      : <Badge className="bg-gray-100 text-gray-600">{t('cabclt.ar.inactive', locale)}</Badge>}
                  </TableCell>
                  <TableCell>
                    {a.actif && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => handleDeleteAdmin(a.id)}
                      >
                        Retirer
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {administrateurs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {t('cabclt.ar.no_directors', locale)}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Section 4 : États financiers ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" style={{ color: '#D4AF37' }} />
            <CardTitle className="text-base">{t('cabclt.ar.simplified_fs', locale)}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">{t('cabclt.ar.total_assets', locale)}</Label>
              <Input
                type="number"
                value={returnForm.actif_total}
                onChange={e => setReturnForm(f => ({ ...f, actif_total: parseFloat(e.target.value) || 0 }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t('cabclt.ar.total_liabilities', locale)}</Label>
              <Input
                type="number"
                value={returnForm.passif_total}
                onChange={e => setReturnForm(f => ({ ...f, passif_total: parseFloat(e.target.value) || 0 }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t('cabclt.ar.turnover', locale)}</Label>
              <Input
                type="number"
                value={returnForm.chiffre_affaires}
                onChange={e => setReturnForm(f => ({ ...f, chiffre_affaires: parseFloat(e.target.value) || 0 }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t('cabclt.ar.net_profit', locale)}</Label>
              <Input
                type="number"
                value={returnForm.resultat_net}
                onChange={e => setReturnForm(f => ({ ...f, resultat_net: parseFloat(e.target.value) || 0 }))}
                className="mt-1"
              />
            </div>
          </div>
          {annualReturn && (
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 rounded-lg p-3">
              <div><p className="text-xs text-muted-foreground">{t('cabclt.ar.total_assets', locale)}</p><p className="font-bold">{fmt(annualReturn.actif_total)}</p></div>
              <div><p className="text-xs text-muted-foreground">{t('cabclt.ar.total_liabilities', locale)}</p><p className="font-bold">{fmt(annualReturn.passif_total)}</p></div>
              <div><p className="text-xs text-muted-foreground">{t('cabclt.ar.ca_short', locale)}</p><p className="font-bold">{fmt(annualReturn.chiffre_affaires)}</p></div>
              <div>
                <p className="text-xs text-muted-foreground">{t('cabclt.ar.net_profit', locale)}</p>
                <p className={`font-bold ${annualReturn.resultat_net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {fmt(annualReturn.resultat_net)}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Section 5 : Statut soumission ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" style={{ color: '#D4AF37' }} />
            <CardTitle className="text-base">{t('cabclt.ar.roc_submission', locale)}</CardTitle>
            {annualReturn && (
              <Badge className={STATUT_COLORS[annualReturn.statut]}>
                {STATUT_LABELS[annualReturn.statut]}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <Label>{t('cabclt.ar.agm_date', locale)}</Label>
              <Input
                type="date"
                value={returnForm.date_agm}
                onChange={e => setReturnForm(f => ({ ...f, date_agm: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>{t('cabclt.ar.status', locale)}</Label>
              <Select value={returnForm.statut} onValueChange={v => setReturnForm(f => ({ ...f, statut: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUT_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('cabclt.ar.roc_reference', locale)}</Label>
              <Input
                value={returnForm.reference_roc}
                onChange={e => setReturnForm(f => ({ ...f, reference_roc: e.target.value }))}
                placeholder="ROC-XXXX-YYYY"
                className="mt-1"
              />
            </div>
          </div>

          {annualReturn?.date_echeance && (
            <div className="mt-4 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('cabclt.ar.deadline_label', locale)}</span>
              <span className={`font-semibold ${
                deadlineStatus === 'depasse' ? 'text-red-600' :
                deadlineStatus === 'urgent' ? 'text-orange-600' : 'text-green-600'
              }`}>
                {fmtDate(annualReturn.date_echeance, locale)}
              </span>
              {deadlineStatus === 'depasse' && <AlertTriangle className="h-4 w-4 text-red-500" />}
              {deadlineStatus === 'ok' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
            </div>
          )}

          <div className="mt-4">
            <Label>{t('cabclt.ar.notes', locale)}</Label>
            <Textarea
              value={returnForm.notes}
              onChange={e => setReturnForm(f => ({ ...f, notes: e.target.value }))}
              placeholder={t('cabclt.ar.notes_placeholder', locale)}
              className="mt-1"
              rows={3}
            />
          </div>

          <div className="mt-4 flex gap-3">
            <Button
              onClick={handleSaveReturn}
              disabled={savingReturn}
              style={{ backgroundColor: '#0B0F2E', color: 'white' }}
            >
              {savingReturn ? t('cabclt.ar.saving', locale) : annualReturn ? t('cabclt.ar.update', locale) : t('cabclt.ar.create_ar', locale)}
            </Button>
            {annualReturn && annualReturn.statut !== 'soumis' && (
              <Button
                variant="outline"
                onClick={() => {
                  setReturnForm(f => ({
                    ...f,
                    statut: 'soumis',
                    // date soumission automatique
                  }))
                  setTimeout(handleSaveReturn, 100)
                }}
              >
                {t('cabclt.ar.mark_submitted', locale)}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
