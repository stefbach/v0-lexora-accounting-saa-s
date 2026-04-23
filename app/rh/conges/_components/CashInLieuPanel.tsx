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
  if (statut === 'valide') return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100"><CheckCircle2 className="w-3 h-3 mr-1" />Validé</Badge>
  if (statut === 'paye') return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle2 className="w-3 h-3 mr-1" />Payé</Badge>
  if (statut === 'annule') return <Badge className="bg-gray-100 text-gray-500 hover:bg-gray-100">Annulé</Badge>
  return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100"><Clock className="w-3 h-3 mr-1" />En attente</Badge>
}

export function CashInLieuPanel() {
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
        toast.error(data.error || 'Erreur chargement cash-in-lieu')
        setCycles([])
        setHistorique([])
        return
      }
      setCycles(data.cycles_a_clore || [])
      setHistorique(data.historique || [])
    } catch (e: any) {
      toast.error('Erreur réseau : ' + (e?.message || ''))
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
      if (!res.ok) toast.error(data.error || 'Erreur')
      else {
        toast.success(data.already_exists ? 'Paiement déjà créé' : `Paiement créé : ${fmt(data.montant_total)} MUR`)
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
        toast.error(data.error || 'Erreur')
        return
      }
      if (dryRun) {
        toast.info(`Dry-run : ${data.nb_eligibles} cycles, total ~${fmt(data.montant_total_estime)} MUR`)
      } else {
        toast.success(`${data.nb_traites} paiements créés (${fmt(data.montant_total)} MUR), ${data.nb_erreurs} erreurs`)
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
      if (!res.ok) toast.error(data.error || 'Erreur')
      else { toast.success('Paiement validé'); await load() }
    } finally {
      setActionLoading(null)
    }
  }

  const annuler = async (paiementId: string) => {
    if (!confirm('Annuler ce paiement compensation ?')) return
    setActionLoading(paiementId)
    try {
      const res = await fetch(`/api/admin/cash-in-lieu?id=${paiementId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) toast.error(data.error || 'Erreur')
      else { toast.success('Paiement annulé'); await load() }
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
              <CardTitle className="text-[#0B0F2E]">Cycles AL à clore — Cash-in-lieu (WRA S.45)</CardTitle>
              <p className="text-xs text-gray-500 mt-1">
                Paiement compensatoire OBLIGATOIRE des jours d&apos;Annual Leave non pris en fin de cycle.
                Section 45 WRA 2019 : <em>&quot;The worker shall be paid a normal day&apos;s pay&quot;</em>.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={joursAvance} onValueChange={setJoursAvance}>
                <SelectTrigger className="w-40 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Dans 7 jours</SelectItem>
                  <SelectItem value="30">Dans 30 jours</SelectItem>
                  <SelectItem value="60">Dans 60 jours</SelectItem>
                  <SelectItem value="90">Dans 90 jours</SelectItem>
                  <SelectItem value="180">Dans 180 jours</SelectItem>
                </SelectContent>
              </Select>
              <input
                type="date"
                className="h-9 px-2 text-xs border rounded"
                value={periodeBulletin}
                onChange={e => setPeriodeBulletin(e.target.value)}
                title="Période bulletin pour injecter le paiement (1er du mois)"
              />
              <Button onClick={() => genererTous(true)} disabled={actionLoading !== null} variant="outline" size="sm" className="text-xs">
                Dry-run
              </Button>
              <Button onClick={() => genererTous(false)} disabled={actionLoading !== null} className="bg-purple-600 text-white text-xs">
                {actionLoading === 'batch' && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                Générer tous
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : cycles.length === 0 ? (
            <div className="text-center py-12 text-gray-500">Aucun cycle à clore dans les {joursAvance} prochains jours.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employé</TableHead>
                    <TableHead>Société</TableHead>
                    <TableHead className="text-xs">Cycle fin</TableHead>
                    <TableHead className="text-xs text-center">J avant fin</TableHead>
                    <TableHead className="text-center">AL solde</TableHead>
                    <TableHead className="text-right">Montant estimé</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Action</TableHead>
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
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Déjà payé</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">À traiter</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {!c.deja_paye && (
                            <Button onClick={() => generer(c)} disabled={actionLoading === c.employe_id} size="sm" className="bg-purple-600 text-white text-xs h-7">
                              {actionLoading === c.employe_id && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                              Générer
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
            Historique des paiements compensation (100 derniers)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {historique.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">Aucun paiement compensation enregistré.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Cycle</TableHead>
                    <TableHead className="text-xs text-center">Jours</TableHead>
                    <TableHead className="text-xs text-right">Montant</TableHead>
                    <TableHead className="text-xs">Période bulletin</TableHead>
                    <TableHead className="text-xs">Statut</TableHead>
                    <TableHead className="text-xs">Créé le</TableHead>
                    <TableHead className="text-right text-xs">Action</TableHead>
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
                              Valider
                            </Button>
                            <Button onClick={() => annuler(p.id)} disabled={actionLoading === p.id} size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-600">
                              Annuler
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
