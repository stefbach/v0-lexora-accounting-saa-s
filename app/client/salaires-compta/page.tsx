"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Users } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale, type Locale } from '@/lib/i18n'

const NAVY = "#0B0F2E"
function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) }

export default function SalairesComptaPage() {
  const locale = getLocale()
  const { societeId } = useSocieteActive()
  const [loading, setLoading] = useState(false)
  const [periodes, setPeriodes] = useState<any[]>([])
  const [busy, setBusy] = useState<string>('') // periode en cours de comptabilisation

  const load = useCallback(async () => {
    if (!societeId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/rh/paie?societe_id=${societeId}`)
      const data = await res.json()
      const allBulletins = data.bulletins || []

      const groups: Record<string, any> = {}
      for (const b of allBulletins) {
        const p = (b.periode || '').slice(0, 7)
        if (!p) continue
        if (!groups[p]) groups[p] = { periode: p, nb: 0, nb_comptabilise: 0, nb_valide_a_comptabiliser: 0, basic: 0, ot: 0, primes: 0, brut: 0, net: 0, csg_sal: 0, nsf_sal: 0, paye: 0, csg_pat: 0, nsf_pat: 0, levy: 0, prgf: 0, charges: 0 }
        groups[p].nb++
        if (b.comptabilise === true) groups[p].nb_comptabilise++
        if (b.statut === 'valide' && b.comptabilise !== true) groups[p].nb_valide_a_comptabiliser++
        groups[p].basic += Number(b.salaire_base) || 0
        groups[p].ot += Number(b.heures_sup_montant) || 0
        groups[p].primes += (Number(b.special_allowance_1) || 0) + (Number(b.special_allowance_2) || 0) + (Number(b.special_allowance_3) || 0) + (Number(b.other_refund) || 0) + (Number(b.eoy_bonus) || 0)
        groups[p].brut += (Number(b.salaire_base) || 0) + (Number(b.heures_sup_montant) || 0) + (Number(b.special_allowance_1) || 0) + (Number(b.special_allowance_2) || 0) + (Number(b.special_allowance_3) || 0) + (Number(b.other_refund) || 0) + (Number(b.eoy_bonus) || 0)
        groups[p].net += Number(b.salaire_net) || 0
        groups[p].csg_sal += (Number(b.csg_salarie) || 0) + (Number(b.csg_bonus) || 0)
        groups[p].nsf_sal += Number(b.nsf_salarie) || 0
        groups[p].paye += (Number(b.paye) || 0) + (Number(b.paye_bonus) || 0)
        groups[p].csg_pat += (Number(b.csg_patronal) || 0) + (Number(b.csg_patronal_bonus) || 0)
        groups[p].nsf_pat += Number(b.nsf_patronal) || 0
        groups[p].levy += Number(b.training_levy) || 0
        groups[p].prgf += Number(b.prgf) || 0
        groups[p].charges += Number(b.total_charges_patronales) || 0
      }
      setPeriodes(Object.values(groups).sort((a: any, b: any) => b.periode.localeCompare(a.periode)))
    } catch { /* noop */ }
    setLoading(false)
  }, [societeId])

  useEffect(() => { load() }, [load])

  async function handleComptabiliser(periodeYM: string, nbACompta: number) {
    if (!societeId) return
    if (nbACompta === 0) { alert("Aucun bulletin à comptabiliser pour ce mois (tous déjà comptabilisés ou non validés)."); return }
    if (!confirm(`Comptabiliser ${nbACompta} bulletin(s) de ${periodeYM} ? Les écritures OD-PAIE seront générées au grand livre.`)) return
    setBusy(periodeYM)
    try {
      const res = await fetch("/api/rh/paie/comptabiliser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all_periode: true, societe_id: societeId, periode: periodeYM, confirm: true }),
      })
      const data = await res.json()
      if (!res.ok) { alert("Erreur : " + (data.error || res.status)); return }
      alert(`✅ ${data.nb_bulletins} bulletin(s) comptabilisé(s) — ${data.nb_ecritures} écriture(s) générée(s)`)
      await load()
    } catch (e: any) {
      alert("Erreur réseau : " + (e?.message || ''))
    } finally {
      setBusy('')
    }
  }

  const totalBrut = periodes.reduce((s, p) => s + (p.brut || 0), 0)
  const totalNet = periodes.reduce((s, p) => s + (p.net || 0), 0)
  const totalCSGSal = periodes.reduce((s, p) => s + (p.csg_sal || 0), 0)
  const totalCSGPat = periodes.reduce((s, p) => s + (p.csg_pat || 0), 0)
  const totalNSFSal = periodes.reduce((s, p) => s + (p.nsf_sal || 0), 0)
  const totalNSFPat = periodes.reduce((s, p) => s + (p.nsf_pat || 0), 0)
  const totalPaye = periodes.reduce((s, p) => s + (p.paye || 0), 0)
  const totalLevy = periodes.reduce((s, p) => s + (p.levy || 0), 0)
  const totalPrgf = periodes.reduce((s, p) => s + (p.prgf || 0), 0)
  const totalCharges = periodes.reduce((s, p) => s + (p.charges || 0), 0)

  return (
    <ClientPageShell
      breadcrumbs={[{ label: t('hr.salaires_compta.bc_client', locale), href: "/client" }, { label: t('hr.salaires_compta.bc_self', locale) }]}
      kicker={t('hr.salaires_compta.kicker', locale)}
      title={t('hr.salaires_compta.title', locale)}
      subtitle={t('hr.salaires_compta.subtitle', locale)}
    >
      <div className="space-y-6">

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card><CardContent className="p-4 text-center">
          <Users className="h-5 w-5 mx-auto mb-1" style={{ color: NAVY }} />
          <p className="text-2xl font-bold" style={{ color: NAVY }}>{periodes.length}</p>
          <p className="text-xs text-gray-500">{t('hr.salaires_compta.months_recorded', locale)}</p>
        </CardContent></Card>
        <Card className="border-l-4 border-l-blue-500"><CardContent className="p-4">
          <p className="text-xs text-gray-400">{t('hr.salaires_compta.kpi_641', locale)}</p>
          <p className="text-2xl font-bold text-blue-600">{fmt(totalBrut)} MUR</p>
          <p className="text-xs text-gray-400 mt-1">{t('hr.salaires_compta.basic_label', locale)}: {fmt(periodes.reduce((s, p) => s + p.basic, 0))}</p>
        </CardContent></Card>
        <Card className="border-l-4 border-l-emerald-500"><CardContent className="p-4">
          <p className="text-xs text-gray-400">{t('hr.salaires_compta.kpi_421', locale)}</p>
          <p className="text-2xl font-bold text-emerald-600">{fmt(totalNet)} MUR</p>
          <p className="text-xs text-gray-400 mt-1">{totalBrut > 0 ? Math.round(totalNet / totalBrut * 100) : 0}% {t('hr.salaires_compta.of_gross', locale)}</p>
        </CardContent></Card>
        <Card className="border-l-4 border-l-red-500"><CardContent className="p-4">
          <p className="text-xs text-gray-400">{t('hr.salaires_compta.kpi_retentions', locale)}</p>
          <p className="text-2xl font-bold text-red-600">{fmt(totalCSGSal + totalNSFSal + totalPaye)} MUR</p>
          <p className="text-xs text-gray-400 mt-1">CSG {fmt(totalCSGSal)} • NSF {fmt(totalNSFSal)} • PAYE {fmt(totalPaye)}</p>
        </CardContent></Card>
        {/* NOUVEAU : charges patronales — manquaient dans le récap du haut */}
        <Card className="border-l-4 border-l-orange-500"><CardContent className="p-4">
          <p className="text-xs text-gray-400">{locale === 'fr' ? '645 — Charges patronales' : '645 — Employer charges'}</p>
          <p className="text-2xl font-bold text-orange-600">{fmt(totalCharges)} MUR</p>
          <p className="text-xs text-gray-400 mt-1">CSG {fmt(totalCSGPat)} • NSF {fmt(totalNSFPat)} • Levy {fmt(totalLevy)} • PRGF {fmt(totalPrgf)}</p>
        </CardContent></Card>
        {/* NOUVEAU : coût total employeur = brut + charges patronales */}
        <Card className="border-l-4 border-l-violet-500"><CardContent className="p-4">
          <p className="text-xs text-gray-400">{locale === 'fr' ? 'Coût total employeur' : 'Total employer cost'}</p>
          <p className="text-2xl font-bold text-violet-700">{fmt(totalBrut + totalCharges)} MUR</p>
          <p className="text-xs text-gray-400 mt-1">{locale === 'fr' ? 'brut + charges patronales' : 'gross + employer charges'}</p>
        </CardContent></Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base" style={{ color: NAVY }}>{t('hr.salaires_compta.detail_per_period', locale)}</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium" style={{ color: NAVY }}>{t('hr.salaires_compta.th_period', locale)}</th>
                    <th className="px-2 py-2 text-center font-medium">{t('hr.salaires_compta.th_nb', locale)}</th>
                    <th className="px-2 py-2 text-right font-medium bg-blue-50">{t('hr.salaires_compta.th_641_basic', locale)}</th>
                    <th className="px-2 py-2 text-right font-medium bg-blue-50">OT</th>
                    <th className="px-2 py-2 text-right font-medium bg-blue-50">{t('hr.salaires_compta.th_bonuses', locale)}</th>
                    <th className="px-2 py-2 text-right font-medium bg-red-50">{t('hr.salaires_compta.th_csg_emp', locale)}</th>
                    <th className="px-2 py-2 text-right font-medium bg-red-50">{t('hr.salaires_compta.th_nsf_emp', locale)}</th>
                    <th className="px-2 py-2 text-right font-medium bg-red-50">PAYE</th>
                    <th className="px-2 py-2 text-right font-medium bg-emerald-50 font-bold">{t('hr.salaires_compta.th_421_net', locale)}</th>
                    <th className="px-2 py-2 text-right font-medium bg-orange-50">{t('hr.salaires_compta.th_csg_emr', locale)}</th>
                    <th className="px-2 py-2 text-right font-medium bg-orange-50">{t('hr.salaires_compta.th_nsf_emr', locale)}</th>
                    <th className="px-2 py-2 text-right font-medium bg-orange-50">Levy</th>
                    <th className="px-2 py-2 text-right font-medium bg-orange-50">PRGF</th>
                    <th className="px-2 py-2 text-right font-medium bg-orange-50">{t('hr.salaires_compta.th_645_total', locale)}</th>
                    <th className="px-2 py-2 text-center font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {periodes.map(p => {
                    const mois = new Date((p.periode || '2025-01') + "-01T12:00:00").toLocaleDateString(locale === 'fr' ? "fr-FR" : "en-US", { month: "short", year: "numeric" })
                    return (
                      <tr key={p.periode} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium capitalize">{mois}</td>
                        <td className="px-2 py-2 text-center">{p.nb}</td>
                        <td className="px-2 py-2 text-right font-mono text-blue-600">{fmt(p.basic)}</td>
                        <td className="px-2 py-2 text-right font-mono text-blue-500">{p.ot > 0 ? fmt(p.ot) : "—"}</td>
                        <td className="px-2 py-2 text-right font-mono text-blue-500">{p.primes > 0 ? fmt(p.primes) : "—"}</td>
                        <td className="px-2 py-2 text-right font-mono text-red-600">{fmt(p.csg_sal)}</td>
                        <td className="px-2 py-2 text-right font-mono text-red-500">{fmt(p.nsf_sal)}</td>
                        <td className="px-2 py-2 text-right font-mono text-red-500">{fmt(p.paye)}</td>
                        <td className="px-2 py-2 text-right font-mono text-emerald-600 font-bold">{fmt(p.net)}</td>
                        <td className="px-2 py-2 text-right font-mono text-orange-600">{fmt(p.csg_pat)}</td>
                        <td className="px-2 py-2 text-right font-mono text-orange-500">{fmt(p.nsf_pat)}</td>
                        <td className="px-2 py-2 text-right font-mono text-orange-500">{fmt(p.levy)}</td>
                        <td className="px-2 py-2 text-right font-mono text-orange-500">{fmt(p.prgf)}</td>
                        <td className="px-2 py-2 text-right font-mono text-orange-700 font-bold">{fmt(p.charges)}</td>
                        <td className="px-2 py-2 text-center">
                          {p.nb_valide_a_comptabiliser > 0 ? (
                            <button
                              type="button"
                              disabled={busy === p.periode}
                              onClick={() => handleComptabiliser(p.periode, p.nb_valide_a_comptabiliser)}
                              className="px-2 py-1 text-[11px] rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                              title={`${p.nb_valide_a_comptabiliser} bulletin(s) à comptabiliser`}
                            >
                              {busy === p.periode ? '…' : `Comptabiliser (${p.nb_valide_a_comptabiliser})`}
                            </button>
                          ) : p.nb_comptabilise === p.nb ? (
                            <span className="text-[11px] text-emerald-700">✅ comptabilisé</span>
                          ) : (
                            <span className="text-[11px] text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {periodes.length > 0 && (
                    <tr className="bg-gray-100 font-bold text-xs">
                      <td className="px-3 py-2">{t('hr.salaires_compta.total', locale)}</td>
                      <td className="px-2 py-2 text-center">{periodes.reduce((s, p) => s + p.nb, 0)}</td>
                      <td className="px-2 py-2 text-right font-mono text-blue-600">{fmt(periodes.reduce((s, p) => s + p.basic, 0))}</td>
                      <td className="px-2 py-2 text-right font-mono">{fmt(periodes.reduce((s, p) => s + p.ot, 0))}</td>
                      <td className="px-2 py-2 text-right font-mono">{fmt(periodes.reduce((s, p) => s + p.primes, 0))}</td>
                      <td className="px-2 py-2 text-right font-mono text-red-600">{fmt(totalCSGSal)}</td>
                      <td className="px-2 py-2 text-right font-mono text-red-500">{fmt(totalNSFSal)}</td>
                      <td className="px-2 py-2 text-right font-mono text-red-500">{fmt(totalPaye)}</td>
                      <td className="px-2 py-2 text-right font-mono text-emerald-600 font-bold">{fmt(totalNet)}</td>
                      <td className="px-2 py-2 text-right font-mono text-orange-600">{fmt(totalCSGPat)}</td>
                      <td className="px-2 py-2 text-right font-mono text-orange-500">{fmt(totalNSFPat)}</td>
                      <td className="px-2 py-2 text-right font-mono text-orange-500">{fmt(totalLevy)}</td>
                      <td className="px-2 py-2 text-right font-mono text-orange-500">{fmt(totalPrgf)}</td>
                      <td className="px-2 py-2 text-right font-mono text-orange-700 font-bold">{fmt(totalCharges)}</td>
                      <td className="px-2 py-2"></td>
                    </tr>
                  )}
                </tbody>
              </table>
              {periodes.length === 0 && (
                <p className="text-center text-gray-400 py-8">{t('hr.salaires_compta.empty', locale)}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base" style={{ color: NAVY }}>{t('hr.salaires_compta.chart_title', locale)}</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  { compte: "6411", label: t('hr.salaires_compta.acc_6411', locale), debit: periodes.reduce((s, p) => s + p.basic, 0), color: "text-blue-600" },
                  { compte: "6414", label: t('hr.salaires_compta.acc_6414', locale), debit: periodes.reduce((s, p) => s + p.ot, 0), color: "text-blue-500" },
                  { compte: "6415", label: t('hr.salaires_compta.acc_6415', locale), debit: periodes.reduce((s, p) => s + p.primes, 0), color: "text-blue-500" },
                  { compte: "6451", label: t('hr.salaires_compta.acc_6451', locale), debit: totalCSGPat, color: "text-orange-600" },
                  { compte: "6452", label: t('hr.salaires_compta.acc_6452', locale), debit: totalNSFPat, color: "text-orange-500" },
                  { compte: "6454", label: t('hr.salaires_compta.acc_6454', locale), debit: totalLevy, color: "text-orange-500" },
                  { compte: "6453", label: t('hr.salaires_compta.acc_6453', locale), debit: totalPrgf, color: "text-orange-500" },
                ].map(c => (
                  <div key={c.compte} className="flex items-center justify-between p-2 border rounded">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono text-xs">{c.compte}</Badge>
                      <span className="text-sm">{c.label}</span>
                    </div>
                    <span className={`font-mono font-medium ${c.color}`}>{c.debit > 0 ? `${fmt(c.debit)} MUR` : "—"}</span>
                  </div>
                ))}
                <div className="border-t pt-2 mt-2">
                  <p className="text-xs text-gray-500 font-medium mb-2">{t('hr.salaires_compta.social_debts', locale)}</p>
                  {[
                    { compte: "4210", label: t('hr.salaires_compta.acc_4210', locale), credit: totalNet, color: "text-emerald-600" },
                    { compte: "4311", label: t('hr.salaires_compta.acc_4311', locale), credit: totalCSGSal, color: "text-red-600" },
                    { compte: "4321", label: t('hr.salaires_compta.acc_4321', locale), credit: totalCSGPat, color: "text-red-500" },
                    { compte: "4312", label: t('hr.salaires_compta.acc_4312', locale), credit: totalNSFSal, color: "text-red-500" },
                    { compte: "4322", label: t('hr.salaires_compta.acc_4322', locale), credit: totalNSFPat, color: "text-red-500" },
                    { compte: "4330", label: t('hr.salaires_compta.acc_4330', locale), credit: totalPaye, color: "text-red-500" },
                    { compte: "4324", label: t('hr.salaires_compta.acc_4324', locale), credit: totalLevy, color: "text-purple-600" },
                    { compte: "4323", label: t('hr.salaires_compta.acc_4323', locale), credit: totalPrgf, color: "text-purple-500" },
                  ].map(c => (
                    <div key={c.compte} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="font-mono text-xs">{c.compte}</Badge>
                        <span className="text-sm">{c.label}</span>
                      </div>
                      <span className={`font-mono font-medium ${c.color}`}>{c.credit > 0 ? `${fmt(c.credit)} MUR` : "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
      </div>
    </ClientPageShell>
  )
}
