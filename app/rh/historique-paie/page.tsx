"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Calendar, Users, Banknote, ChevronDown, ChevronRight, FileText, Download, ExternalLink } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"
function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) }

export default function HistoriquePaiePage() {
  const locale = getLocale()
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [loading, setLoading] = useState(true)
  const [periodes, setPeriodes] = useState<any[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [detail, setDetail] = useState<any[]>([])
  const [ecritures, setEcritures] = useState<any[]>([])

  useEffect(() => {
    Promise.all([
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values())
      setSocietes(unique)
      if (unique.length >= 1) setSociete(unique[0].id)
    })
  }, [])

  const load = useCallback(async () => {
    if (!societe) return
    setLoading(true)
    try {
      const res = await fetch(`/api/rh/import-paie?action=history&societe_id=${societe}`)
      const data = await res.json()
      setPeriodes((data.history || []).sort((a: any, b: any) => b.periode.localeCompare(a.periode)))
    } catch { /* noop */ }
    setLoading(false)
  }, [societe])

  useEffect(() => { load() }, [load])

  const toggleExpand = async (periode: string) => {
    if (expanded === periode) { setExpanded(null); return }
    setExpanded(periode)
    // Load detail for this period
    const [detRes, ecrRes] = await Promise.all([
      fetch(`/api/rh/import-paie?action=detail&periode=${periode}&societe_id=${societe}`).then(r => r.json()).catch(() => ({ bulletins: [] })),
      fetch(`/api/rh/paie?action=list&societe_id=${societe}&periode=${periode.slice(0, 7)}`).then(r => r.json()).catch(() => ({ bulletins: [] })),
    ])
    setDetail(detRes.bulletins || [])
    // Load accounting entries for this period
    try {
      const ecrRes2 = await fetch(`/api/comptable/ecritures?societe_id=${societe}&journal=SAL&date_debut=${periode}&date_fin=${periode}`).then(r => r.json()).catch(() => ({ ecritures: [] }))
      setEcritures(ecrRes2.ecritures || [])
    } catch { setEcritures([]) }
  }

  const totalBrut = periodes.reduce((s, p) => s + (p.total_brut || 0), 0)
  const totalNet = periodes.reduce((s, p) => s + (p.total_net || 0), 0)
  const totalCharges = periodes.reduce((s, p) => s + (p.total_charges || 0), 0)

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>{t('rha.a.histp.title', locale)}</h1>
          <p className="text-gray-500 text-sm">{t('rha.a.histp.subtitle', locale)}</p>
        </div>
        <div className="flex gap-2">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder={t('rha.a.common.societe', locale)} /></SelectTrigger>
            <SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" onClick={() => window.location.href = "/rh/import-paie"}>
            <FileText className="h-4 w-4 mr-1" /> {t('rha.a.common.importer', locale)}
          </Button>
        </div>
      </div>

      {/* KPIs globaux */}
      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="p-4 text-center">
          <Calendar className="h-5 w-5 mx-auto mb-1" style={{ color: GOLD }} />
          <p className="text-2xl font-bold" style={{ color: NAVY }}>{periodes.length}</p>
          <p className="text-xs text-gray-500">{t('rha.a.histp.mois_importes', locale)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Banknote className="h-5 w-5 mx-auto mb-1 text-blue-600" />
          <p className="text-2xl font-bold text-blue-600">{fmt(totalBrut)}</p>
          <p className="text-xs text-gray-500">{t('rha.a.histp.total_brut', locale)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Banknote className="h-5 w-5 mx-auto mb-1 text-emerald-600" />
          <p className="text-2xl font-bold text-emerald-600">{fmt(totalNet)}</p>
          <p className="text-xs text-gray-500">{t('rha.a.histp.total_net', locale)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Banknote className="h-5 w-5 mx-auto mb-1 text-orange-600" />
          <p className="text-2xl font-bold text-orange-600">{fmt(totalCharges)}</p>
          <p className="text-xs text-gray-500">{t('rha.a.histp.total_charges', locale)}</p>
        </CardContent></Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : periodes.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-400">
          <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p>{t('rha.a.histp.aucun_historique', locale)}</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {periodes.map(p => {
            const isOpen = expanded === p.periode
            const moisLabel = new Date(p.periode + "T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
            return (
              <Card key={p.periode}>
                <button onClick={() => toggleExpand(p.periode)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left">
                  <div className="flex items-center gap-4">
                    {isOpen ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronRight className="h-5 w-5 text-gray-400" />}
                    <div>
                      <p className="font-bold capitalize text-lg" style={{ color: NAVY }}>{moisLabel}</p>
                      <p className="text-xs text-gray-500"><Users className="inline h-3 w-3 mr-1" />{p.nb} {t('rha.a.common.employes', locale)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-right">
                      <p className="font-mono text-blue-600">{fmt(p.total_brut)} <span className="text-xs text-gray-400">{t('rha.a.histp.brut_suffix', locale)}</span></p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-emerald-600 font-bold">{fmt(p.total_net)} <span className="text-xs text-gray-400">{t('rha.a.histp.net_suffix', locale)}</span></p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-orange-600">{fmt(p.total_charges)} <span className="text-xs text-gray-400">{t('rha.a.histp.charges_suffix', locale)}</span></p>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <CardContent className="border-t space-y-4">
                    {/* Détail par employé */}
                    <div>
                      <h3 className="text-sm font-medium mb-2" style={{ color: NAVY }}>{t('rha.a.histp.detail_par_employe', locale)}</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-2 py-1.5 text-left">{t('rha.a.common.employe', locale)}</th>
                              <th className="px-2 py-1.5 text-right">{t('rha.a.histp.col_basic', locale)}</th>
                              <th className="px-2 py-1.5 text-right">{t('rha.a.histp.col_ot', locale)}</th>
                              <th className="px-2 py-1.5 text-right">{t('rha.a.histp.col_primes', locale)}</th>
                              <th className="px-2 py-1.5 text-right">{t('rha.a.histp.col_csg_sal', locale)}</th>
                              <th className="px-2 py-1.5 text-right">{t('rha.a.histp.col_nsf_sal', locale)}</th>
                              <th className="px-2 py-1.5 text-right">{t('rha.a.histp.col_paye', locale)}</th>
                              <th className="px-2 py-1.5 text-right">{t('rha.a.histp.col_csg_pat', locale)}</th>
                              <th className="px-2 py-1.5 text-right">{t('rha.a.histp.col_nsf_pat', locale)}</th>
                              <th className="px-2 py-1.5 text-right">{t('rha.a.histp.col_levy', locale)}</th>
                              <th className="px-2 py-1.5 text-right">{t('rha.a.histp.col_prgf', locale)}</th>
                              <th className="px-2 py-1.5 text-right font-bold text-emerald-700">{t('rha.a.histp.col_net', locale)}</th>
                              <th className="px-2 py-1.5 text-center">{t('rha.a.histp.col_fiche', locale)}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {detail.map((b: any) => (
                              <tr key={b.id} className="hover:bg-gray-50">
                                <td className="px-2 py-1.5 font-medium">{b.employe?.prenom} {b.employe?.nom}</td>
                                <td className="px-2 py-1.5 text-right font-mono">{fmt(b.salaire_base || 0)}</td>
                                <td className="px-2 py-1.5 text-right font-mono">{fmt(b.heures_sup_montant || 0)}</td>
                                <td className="px-2 py-1.5 text-right font-mono">{fmt(b.special_allowance_1 || 0)}</td>
                                <td className="px-2 py-1.5 text-right font-mono text-red-500">{fmt(b.csg_salarie || 0)}</td>
                                <td className="px-2 py-1.5 text-right font-mono text-red-500">{fmt(b.nsf_salarie || 0)}</td>
                                <td className="px-2 py-1.5 text-right font-mono text-red-500">{fmt(b.paye || 0)}</td>
                                <td className="px-2 py-1.5 text-right font-mono text-orange-500">{fmt(b.csg_patronal || 0)}</td>
                                <td className="px-2 py-1.5 text-right font-mono text-orange-500">{fmt(b.nsf_patronal || 0)}</td>
                                <td className="px-2 py-1.5 text-right font-mono text-orange-500">{fmt(b.training_levy || 0)}</td>
                                <td className="px-2 py-1.5 text-right font-mono text-orange-500">{fmt(b.prgf || 0)}</td>
                                <td className="px-2 py-1.5 text-right font-mono font-bold text-emerald-700">{fmt(b.salaire_net || 0)}</td>
                                <td className="px-2 py-1.5 text-center">
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
                                    onClick={() => window.open(`/rh/employes/${b.employe_id}`, '_blank')}>
                                    <ExternalLink className="h-3 w-3" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Écritures comptables */}
                    {ecritures.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium mb-2" style={{ color: NAVY }}>{t('rha.a.histp.ecritures_comptables', locale)}</h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-1.5 text-left">{t('rha.a.histp.col_compte', locale)}</th>
                                <th className="px-2 py-1.5 text-left">{t('rha.a.histp.col_libelle', locale)}</th>
                                <th className="px-2 py-1.5 text-right">{t('rha.a.histp.col_debit', locale)}</th>
                                <th className="px-2 py-1.5 text-right">{t('rha.a.histp.col_credit', locale)}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {ecritures.map((e: any, i: number) => (
                                <tr key={i}>
                                  <td className="px-2 py-1.5 font-mono">{e.compte}</td>
                                  <td className="px-2 py-1.5">{e.libelle}</td>
                                  <td className="px-2 py-1.5 text-right font-mono">{e.debit > 0 ? fmt(e.debit) : ""}</td>
                                  <td className="px-2 py-1.5 text-right font-mono">{e.credit > 0 ? fmt(e.credit) : ""}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
    </ClientPageShell>
  )
}
