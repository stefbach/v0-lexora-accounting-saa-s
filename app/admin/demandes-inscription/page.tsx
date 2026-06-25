"use client"

/**
 * Page /admin/demandes-inscription — Validation des demandes
 *
 * Sprint 4 du workflow d'inscription :
 *  - Liste des demandes par statut (en attente / validées / refusées)
 *  - Dialog de validation : choix plan + ajustement modules + tarif final
 *  - Dialog de refus : raison obligatoire
 *
 * Backend : /api/admin/demandes-inscription
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Loader2, RefreshCw, CheckCircle2, XCircle, Clock,
  Mail, Phone, Building2, UserCircle, Calendar, MessageSquare,
  ChevronRight, AlertTriangle,
} from "lucide-react"
import { t, getLocale } from "@/lib/i18n"

interface Plan {
  id: string
  code: string
  nom: string
  prix_mensuel_mur: number
  prix_annuel_mur: number | null
}

interface Demande {
  id: string
  type_demandeur: 'dirigeant' | 'comptable'
  prenom: string
  nom: string
  email: string
  telephone: string | null
  poste: string | null
  societe_data: any
  cabinet_data: any
  plan_id: string | null
  periodicite: 'mensuelle' | 'annuelle'
  accept_cgu: boolean
  accept_cgv: boolean
  accept_marketing: boolean
  message: string | null
  statut: 'en_attente' | 'validee' | 'refusee'
  plan_attribue_id: string | null
  tarif_final_mur: number | null
  validated_at: string | null
  rejected_reason: string | null
  created_at: string
  plan?: Plan | null
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AdminDemandesInscriptionPage() {
  const locale = getLocale()
  const [statut, setStatut] = useState<'en_attente' | 'validee' | 'refusee'>('en_attente')
  const [demandes, setDemandes] = useState<Demande[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [validateDemande, setValidateDemande] = useState<Demande | null>(null)
  const [validating, setValidating] = useState(false)
  const [validatePlan, setValidatePlan] = useState<string>("")
  const [validateTarif, setValidateTarif] = useState<string>("")
  const [validateCreerSociete, setValidateCreerSociete] = useState(true)
  const [rejectDemande, setRejectDemande] = useState<Demande | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [demandesRes, plansRes] = await Promise.all([
        fetch(`/api/admin/demandes-inscription?statut=${statut}`, { cache: 'no-store' }),
        fetch('/api/plans', { cache: 'no-store' }),
      ])
      const dj = await demandesRes.json()
      const pj = await plansRes.json()
      if (!demandesRes.ok) throw new Error(dj.error || t('adm2.dem.err_loading', locale))
      setDemandes(dj.demandes || [])
      setPlans(pj.plans || [])
    } catch (e: any) {
      setError(e?.message || t('adm2.dem.err_generic', locale))
    } finally {
      setLoading(false)
    }
  }, [statut, locale])

  useEffect(() => { load() }, [load])

  const counts = useMemo(() => ({
    en_attente: demandes.filter(d => d.statut === 'en_attente').length,
  }), [demandes])

  function openValidate(d: Demande) {
    setValidateDemande(d)
    setValidatePlan(d.plan_id || '')
    const plan = plans.find(p => p.id === d.plan_id)
    const tarif = plan
      ? (d.periodicite === 'annuelle' ? plan.prix_annuel_mur : plan.prix_mensuel_mur) || 0
      : 0
    setValidateTarif(String(tarif))
    setValidateCreerSociete(true)
  }

  async function submitValidation() {
    if (!validateDemande) return
    setValidating(true)
    try {
      const r = await fetch(`/api/admin/demandes-inscription/${validateDemande.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_attribue_id: validatePlan || null,
          tarif_final_mur: validateTarif ? Number(validateTarif) : null,
          creer_societe: validateCreerSociete,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || t('adm2.dem.err_generic', locale))
      showToast(t('adm2.dem.validated_toast', locale))
      setValidateDemande(null)
      load()
    } catch (e: any) {
      showToast(e?.message || t('adm2.dem.err_generic', locale), 'error')
    } finally {
      setValidating(false)
    }
  }

  async function submitReject() {
    if (!rejectDemande || !rejectReason.trim()) return
    setRejecting(true)
    try {
      const r = await fetch(`/api/admin/demandes-inscription/${rejectDemande.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejected_reason: rejectReason.trim() }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || t('adm2.dem.err_generic', locale))
      showToast(t('adm2.dem.rejected_toast', locale))
      setRejectDemande(null)
      setRejectReason('')
      load()
    } catch (e: any) {
      showToast(e?.message || t('adm2.dem.err_generic', locale), 'error')
    } finally {
      setRejecting(false)
    }
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCircle className="h-6 w-6 text-[#0B0F2E]" />
            {t('adm2.dem.title', locale)}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('adm2.dem.subtitle', locale)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
          {t('adm2.dem.refresh', locale)}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <Tabs value={statut} onValueChange={(v) => setStatut(v as 'en_attente' | 'validee' | 'refusee')}>
        <TabsList>
          <TabsTrigger value="en_attente">
            <Clock className="h-3.5 w-3.5 mr-1" />
            {t('adm2.dem.tab_pending', locale)}
          </TabsTrigger>
          <TabsTrigger value="validee">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            {t('adm2.dem.tab_validated', locale)}
          </TabsTrigger>
          <TabsTrigger value="refusee">
            <XCircle className="h-3.5 w-3.5 mr-1" />
            {t('adm2.dem.tab_rejected', locale)}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={statut}>
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="py-12 text-center">
                  <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
                </div>
              ) : demandes.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  {statut === 'en_attente' ? t('adm2.dem.none_pending', locale) : statut === 'validee' ? t('adm2.dem.none_validated', locale) : t('adm2.dem.none_rejected', locale)}
                </p>
              ) : (
                <div className="divide-y">
                  {demandes.map(d => (
                    <DemandeCard
                      key={d.id}
                      demande={d}
                      locale={locale}
                      onValidate={() => openValidate(d)}
                      onReject={() => setRejectDemande(d)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog Validation */}
      <Dialog open={!!validateDemande} onOpenChange={(o) => !o && setValidateDemande(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('adm2.dem.validate_title', locale)}</DialogTitle>
          </DialogHeader>
          {validateDemande && (
            <div className="space-y-4 text-sm">
              <div className="rounded border bg-muted/30 p-3">
                <p className="font-semibold">{validateDemande.prenom} {validateDemande.nom}</p>
                <p className="text-muted-foreground text-xs">{validateDemande.email}</p>
                <p className="text-muted-foreground text-xs">{t('adm2.dem.type', locale)} : {validateDemande.type_demandeur}</p>
                {validateDemande.societe_data?.nom && (
                  <p className="text-muted-foreground text-xs">{t('adm2.dem.company', locale)} : {validateDemande.societe_data.nom}</p>
                )}
                {validateDemande.cabinet_data?.nom_cabinet && (
                  <p className="text-muted-foreground text-xs">{t('adm2.dem.cabinet', locale)} : {validateDemande.cabinet_data.nom_cabinet}</p>
                )}
              </div>

              <div>
                <Label>{t('adm2.dem.attributed_plan', locale)}</Label>
                <Select value={validatePlan || '__none__'} onValueChange={v => setValidatePlan(v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder={t('adm2.dem.choose_plan', locale)} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('adm2.dem.no_plan', locale)}</SelectItem>
                    {plans.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nom} — {p.prix_mensuel_mur} {t('adm2.dem.per_month', locale)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {validateDemande.plan_id && validatePlan !== validateDemande.plan_id && (
                  <p className="text-[11px] text-amber-700 mt-1">
                    ⚠️ {t('adm2.dem.prospect_chose', locale)} <strong>{validateDemande.plan?.nom || '—'}</strong>
                  </p>
                )}
              </div>

              <div>
                <Label>{t('adm2.dem.final_price', locale).replace('{periodicite}', validateDemande.periodicite)}</Label>
                <Input type="number" value={validateTarif} onChange={e => setValidateTarif(e.target.value)} placeholder={t('adm2.dem.final_price_ph', locale)} />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t('adm2.dem.price_adjust_hint', locale)}
                </p>
              </div>

              {validateDemande.type_demandeur === 'dirigeant' && validateDemande.societe_data?.nom && (
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={validateCreerSociete}
                    onChange={e => setValidateCreerSociete(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="text-sm">
                    {t('adm2.dem.create_company', locale)} <strong>{validateDemande.societe_data.nom}</strong> {t('adm2.dem.create_company_suffix', locale)}
                  </span>
                </label>
              )}

              <div className="rounded border-l-4 border-blue-300 bg-blue-50 p-3 text-xs text-blue-900">
                ℹ️ {t('adm2.dem.email_info', locale)}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setValidateDemande(null)}>{t('adm2.dem.cancel', locale)}</Button>
            <Button onClick={submitValidation} disabled={validating} className="bg-emerald-600 hover:bg-emerald-700">
              {validating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
              {t('adm2.dem.validate_create', locale)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Refus */}
      <Dialog open={!!rejectDemande} onOpenChange={(o) => !o && setRejectDemande(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('adm2.dem.reject_title', locale)}</DialogTitle>
          </DialogHeader>
          {rejectDemande && (
            <div className="space-y-4">
              <p className="text-sm">
                {t('adm2.dem.reject_confirm', locale)} <strong>{rejectDemande.prenom} {rejectDemande.nom}</strong> ({rejectDemande.email}) ?
              </p>
              <div>
                <Label>{t('adm2.dem.reject_reason', locale)}</Label>
                <Textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder={t('adm2.dem.reject_reason_ph', locale)}
                  rows={4}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDemande(null)}>{t('adm2.dem.cancel', locale)}</Button>
            <Button
              onClick={submitReject}
              disabled={rejecting || !rejectReason.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              {rejecting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <XCircle className="h-4 w-4 mr-1" />}
              {t('adm2.dem.reject_notify', locale)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function DemandeCard({ demande, locale, onValidate, onReject }: {
  demande: Demande
  locale: any
  onValidate: () => void
  onReject: () => void
}) {
  const sd = demande.societe_data || {}
  const cd = demande.cabinet_data || {}
  return (
    <div className="p-4 hover:bg-muted/20 transition-colors">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm">{demande.prenom} {demande.nom}</h3>
            <Badge variant="outline" className="text-[10px]">
              {demande.type_demandeur === 'dirigeant' ? t('adm2.dem.type_dirigeant', locale) : t('adm2.dem.type_comptable', locale)}
            </Badge>
            {demande.plan?.nom && (
              <Badge className="text-[10px] bg-blue-100 text-blue-700 border-blue-200">
                {t('adm2.dem.plan_badge', locale).replace('{name}', demande.plan.nom).replace('{periodicite}', demande.periodicite)}
              </Badge>
            )}
            {demande.statut === 'validee' && (
              <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">
                {t('adm2.dem.validated_badge', locale).replace('{date}', fmtDate(demande.validated_at))}
              </Badge>
            )}
            {demande.statut === 'refusee' && (
              <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200">
                {t('adm2.dem.rejected_badge', locale)}
              </Badge>
            )}
          </div>

          <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Mail className="h-3 w-3" /> {demande.email}
            </div>
            {demande.telephone && (
              <div className="flex items-center gap-1.5">
                <Phone className="h-3 w-3" /> {demande.telephone}
              </div>
            )}
            {sd.nom && (
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3 w-3" /> {sd.nom}{sd.brn ? ` (BRN ${sd.brn})` : ''}
              </div>
            )}
            {cd.nom_cabinet && (
              <div className="flex items-center gap-1.5">
                <Building2 className="h-3 w-3" /> {t('adm2.dem.cabinet_prefix', locale)} {cd.nom_cabinet}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3" /> {t('adm2.dem.received', locale).replace('{date}', fmtDate(demande.created_at))}
            </div>
          </div>

          {demande.message && (
            <div className="mt-2 rounded border-l-2 border-gray-300 bg-gray-50 p-2 text-xs flex items-start gap-1.5">
              <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0 text-gray-500" />
              <span className="whitespace-pre-line">{demande.message}</span>
            </div>
          )}

          {demande.statut === 'refusee' && demande.rejected_reason && (
            <div className="mt-2 text-xs text-red-700 italic">
              {t('adm2.dem.reject_motive', locale)} {demande.rejected_reason}
            </div>
          )}

          {demande.statut === 'validee' && demande.tarif_final_mur && (
            <p className="text-xs text-emerald-700 mt-1">
              {t('adm2.dem.applied_price', locale)} <strong>{demande.tarif_final_mur} MUR / {demande.periodicite}</strong>
            </p>
          )}
        </div>

        {demande.statut === 'en_attente' && (
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs" onClick={onValidate}>
              <CheckCircle2 className="h-3 w-3 mr-1" /> {t('adm2.dem.validate', locale)}
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs border-red-300 text-red-700 hover:bg-red-50" onClick={onReject}>
              <XCircle className="h-3 w-3 mr-1" /> {t('adm2.dem.reject', locale)}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
