"use client"
/**
 * G1 — Onglet "Cash-in-lieu" pour /rh/conges (admin/super_admin).
 * Liste les cycles AL se fermant + historique des paiements compensation.
 */
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, AlertTriangle, CheckCircle2, Clock, FileSpreadsheet } from "lucide-react"
import { toast } from "sonner"
import { notifySuccess, notifyError } from "@/lib/utils/toast"
import { t, getLocale } from "@/lib/i18n"

interface Cycle {
  employe_id: string
  employe_prenom: string
  employe_nom: string
  societe_id: string
  societe_nom: string
  salaire_base: number
  cycle_debut: string
  cycle_fin: string
  jours_avant_fin: number
  al_droit: number
  al_pris: number
  al_solde_a_payer: number
  montant_estime: number
  deja_paye: boolean
}

interface Paiement {
  id: string
  employe_id: string
  societe_id: string
  type_conge: string
  cycle_debut: string
  cycle_fin: string
  jours_payes_compensation: number
  montant_total: number
  statut: 'en_attente' | 'valide' | 'paye' | 'annule'
  motif: string
  bulletin_paie_id: string | null
  periode_bulletin: string | null
  cree_le: string
  valide_le: string | null
  paye_le: string | null
}

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n)
}
function dateFR(iso: string | null) {
  if (!iso) return "—"
  const s = String(iso).slice(0, 10)
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`
}

function StatutBadge({ statut }: { statut: string }) {
  const locale = getLocale()
  if (statut === 'valide') return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100"><CheckCircle2 className="w-3 h-3 mr-1" />{t('rhc.cil.statut_valide', locale)}</Badge>
  if (statut === 'paye') return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle2 className="w-3 h-3 mr-1" />{t('rhc.cil.statut_paye', locale)}</Badge>
  if (statut === 'annule') return <Badge className="bg-gray-100 text-gray-500 hover:bg-gray-100">{t('rhc.cil.statut_annule', locale)}</Badge>
  return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100"><Clock className="w-3 h-3 mr-1" />{t('rhc.cil.statut_attente', locale)}</Badge>
}

export function CashInLieuPanel() {
  const locale = getLocale()
  const [loading, setLoading] = useState(true)
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [historique, setHistorique] = useState<Paiement[]>([])
  const [joursAvance, setJoursAvance] = useState<string>("30")
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [periodeBulletin, setPeriodeBulletin] = useState<string>(() => {
    // Défaut : 1er du mois prochain
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  })

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/cash-in-lieu?jours_avance=${joursAvance}`)
      const data = await res.json()
      if (!res.ok) {
        notifyError(t('rhc.cil.toast.load', locale), data.error)
        setCycles([])
        setHistorique([])
        return
      }
      setCycles(data.cycles_a_clore || [])
      setHistorique(data.historique || [])
    } catch (e: unknown) {
      notifyError(t('rhc.cil.toast.network', locale), e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [joursAvance])

  const generer = async (cycle: Cycle) => {
    setActionLoading(cycle.employe_id)
    try {
      const res = await fetch('/api/admin/cash-in-lieu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generer',
          employe_id: cycle.employe_id,
          cycle_debut: cycle.cycle_debut,
          cycle_fin: cycle.cycle_fin,
          periode_bulletin: periodeBulletin,
        }),
      })
      const data = await res.json()
      if (!res.ok) notifyError(t('rhc.cil.toast.gen_paiement', locale), data.error)
      else {
        notifySuccess(data.already_exists ? t('rhc.cil.toast.deja_cree', locale) : t('rhc.cil.toast.cree', locale).replace('{amt}', fmt(data.montant_total)))
        await load()
      }
    } finally {
      setActionLoading(null)
    }
  }

  const genererTous = async (dryRun: boolean) => {
    setActionLoading('batch')
    try {
      const res = await fetch('/api/admin/cash-in-lieu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generer-tous',
          periode_bulletin: periodeBulletin,
          jours_avance: parseInt(joursAvance, 10),
          dry_run: dryRun,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        notifyError(t('rhc.cil.toast.gen_paiements', locale), data.error)
        return
      }
      if (dryRun) {
        toast.info(t('rhc.cil.toast.dryrun', locale).replace('{nb}', String(data.nb_eligibles)).replace('{amt}', fmt(data.montant_total_estime)))
      } else {
        notifySuccess(t('rhc.cil.toast.batch_done', locale).replace('{nb}', String(data.nb_traites)).replace('{amt}', fmt(data.montant_total)).replace('{err}', String(data.nb_erreurs)))
        await load()
      }
    } finally {
      setActionLoading(null)
    }
  }

  const valider = async (paiementId: string) => {
    setActionLoading(paiementId)
    try {
      const res = await fetch('/api/admin/cash-in-lieu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'valider', paiement_id: paiementId }),
      })
      const data = await res.json()
      if (!res.ok) notifyError(t('rhc.cil.toast.valider', locale), data.error)
      else { notifySuccess(t('rhc.cil.toast.valide', locale)); await load() }
    } finally {
      setActionLoading(null)
    }
  }

  const annuler = async (paiementId: string) => {
    if (!confirm(t('rhc.cil.confirm_annuler', locale))) return
    setActionLoading(paiementId)
    try {
      const res = await fetch(`/api/admin/cash-in-lieu?id=${paiementId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) notifyError(t('rhc.cil.toast.annuler', locale), data.error)
      else { notifySuccess(t('rhc.cil.toast.annule', locale)); await load() }
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Section 1 — Cycles à clore */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="text-[#0B0F2E]">{t('rhc.cil.title', locale)}</CardTitle>
              <p className="text-xs text-gray-500 mt-1">
                {t('rhc.cil.subtitle', locale)} <em>{t('rhc.cil.subtitle_quote', locale)}</em>.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={joursAvance} onValueChange={setJoursAvance}>
                <SelectTrigger className="w-40 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">{t('rhc.cil.dans_jours', locale).replace('{n}', '7')}</SelectItem>
                  <SelectItem value="30">{t('rhc.cil.dans_jours', locale).replace('{n}', '30')}</SelectItem>
                  <SelectItem value="60">{t('rhc.cil.dans_jours', locale).replace('{n}', '60')}</SelectItem>
                  <SelectItem value="90">{t('rhc.cil.dans_jours', locale).replace('{n}', '90')}</SelectItem>
                  <SelectItem value="180">{t('rhc.cil.dans_jours', locale).replace('{n}', '180')}</SelectItem>
                </SelectContent>
              </Select>
              <input
                type="date"
                className="h-9 px-2 text-xs border rounded"
                value={periodeBulletin}
                onChange={e => setPeriodeBulletin(e.target.value)}
                title={t('rhc.cil.periode_title', locale)}
              />
              <Button onClick={() => genererTous(true)} disabled={actionLoading !== null} variant="outline" size="sm" className="text-xs">
                {t('rhc.cil.dry_run', locale)}
              </Button>
              <Button onClick={() => genererTous(false)} disabled={actionLoading !== null} className="bg-purple-600 text-white text-xs">
                {actionLoading === 'batch' && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                {t('rhc.cil.generer_tous', locale)}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : cycles.length === 0 ? (
            <div className="text-center py-12 text-gray-500">{t('rhc.cil.aucun_cycle', locale).replace('{n}', joursAvance)}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('rhc.cil.col_employe', locale)}</TableHead>
                    <TableHead>{t('rhc.cil.col_societe', locale)}</TableHead>
                    <TableHead className="text-xs">{t('rhc.cil.col_cycle_fin', locale)}</TableHead>
                    <TableHead className="text-xs text-center">{t('rhc.cil.col_j_avant', locale)}</TableHead>
                    <TableHead className="text-center">{t('rhc.cil.col_al_solde', locale)}</TableHead>
                    <TableHead className="text-right">{t('rhc.cil.col_montant', locale)}</TableHead>
                    <TableHead>{t('rhc.cil.col_statut', locale)}</TableHead>
                    <TableHead className="text-right">{t('rhc.cil.col_action', locale)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cycles.map(c => {
                    const urgent = c.jours_avant_fin <= 7
                    const warn = c.jours_avant_fin <= 30
                    return (
                      <TableRow key={c.employe_id}>
                        <TableCell className="font-medium">{c.employe_prenom} {c.employe_nom}</TableCell>
                        <TableCell className="text-xs text-gray-600">{c.societe_nom}</TableCell>
                        <TableCell className="text-xs">{dateFR(c.cycle_fin)}</TableCell>
                        <TableCell className={`text-center text-xs font-semibold ${urgent ? 'text-red-600' : warn ? 'text-orange-500' : 'text-gray-700'}`}>
                          {c.jours_avant_fin <= 0 ? <AlertTriangle className="inline w-3 h-3 mr-1" /> : null}
                          J{c.jours_avant_fin >= 0 ? '-' : '+'}{Math.abs(c.jours_avant_fin)}
                        </TableCell>
                        <TableCell className="text-center font-semibold">{c.al_solde_a_payer}</TableCell>
                        <TableCell className="text-right font-mono font-semibold text-purple-700">
                          {fmt(c.montant_estime)} MUR
                        </TableCell>
                        <TableCell>
                          {c.deja_paye ? (
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">{t('rhc.cil.deja_paye', locale)}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">{t('rhc.cil.a_traiter', locale)}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {!c.deja_paye && (
                            <Button onClick={() => generer(c)} disabled={actionLoading === c.employe_id} size="sm" className="bg-purple-600 text-white text-xs h-7">
                              {actionLoading === c.employe_id && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                              {t('rhc.cil.generer', locale)}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2 — Historique */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[#0B0F2E] text-base flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            {t('rhc.cil.histo_title', locale)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {historique.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">{t('rhc.cil.histo_vide', locale)}</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">{t('rhc.cil.col_type', locale)}</TableHead>
                    <TableHead className="text-xs">{t('rhc.cil.col_cycle', locale)}</TableHead>
                    <TableHead className="text-xs text-center">{t('rhc.cil.col_jours', locale)}</TableHead>
                    <TableHead className="text-xs text-right">{t('rhc.cil.col_montant2', locale)}</TableHead>
                    <TableHead className="text-xs">{t('rhc.cil.col_periode', locale)}</TableHead>
                    <TableHead className="text-xs">{t('rhc.cil.col_statut', locale)}</TableHead>
                    <TableHead className="text-xs">{t('rhc.cil.col_cree', locale)}</TableHead>
                    <TableHead className="text-right text-xs">{t('rhc.cil.col_action', locale)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historique.map(p => (
                    <TableRow key={p.id}>
                      <TableCell><Badge variant="outline" className="text-[10px]">{p.type_conge}</Badge></TableCell>
                      <TableCell className="text-xs">{dateFR(p.cycle_debut)} → {dateFR(p.cycle_fin)}</TableCell>
                      <TableCell className="text-center font-semibold">{p.jours_payes_compensation}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(p.montant_total)} MUR</TableCell>
                      <TableCell className="text-xs">{dateFR(p.periode_bulletin)}</TableCell>
                      <TableCell><StatutBadge statut={p.statut} /></TableCell>
                      <TableCell className="text-xs text-gray-500">{dateFR(p.cree_le)}</TableCell>
                      <TableCell className="text-right">
                        {p.statut === 'en_attente' && (
                          <div className="flex gap-1 justify-end">
                            <Button onClick={() => valider(p.id)} disabled={actionLoading === p.id} size="sm" variant="ghost" className="h-7 px-2 text-xs text-blue-700">
                              {t('rhc.cil.valider', locale)}
                            </Button>
                            <Button onClick={() => annuler(p.id)} disabled={actionLoading === p.id} size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-600">
                              {t('rhc.cil.annuler', locale)}
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
