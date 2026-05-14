"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Loader2, Download, CheckCheck } from "lucide-react"
import { t, getLocale } from "@/lib/i18n"

const JOURS_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]
const JOURS_FERIES_MU = [
  "01-01", "02-01", "12-03", "01-05", "09-05", "15-08", "02-11", "25-12"
]

function isWeekend(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00")
  return d.getDay() === 0 || d.getDay() === 6
}
function isFerie(dateStr: string) {
  const mmdd = dateStr.slice(5)
  return JOURS_FERIES_MU.includes(mmdd)
}
function getRowColor(row: any) {
  if (!row) return ""
  if (row.type_absence === "conge_approuve") return "bg-blue-50 border-l-4 border-l-blue-400"
  if (row.absence_injustifiee) return "bg-red-50 border-l-4 border-l-red-400"
  if (isWeekend(row.date) || isFerie(row.date)) return "bg-gray-50 text-gray-400"
  if ((row.ot_1_5x || 0) > 0 || (row.ot_2x || 0) > 0) return "bg-orange-50 border-l-4 border-l-orange-400"
  if (row.heure_entree && row.heure_sortie) return "bg-green-50 border-l-4 border-l-green-400"
  return ""
}

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " MUR"
}

function calcOT(hEntree: string, hSortie: string, ferieDay: boolean): { normales: number; ot15: number; ot2: number; total: number } {
  if (!hEntree || !hSortie) return { normales: 0, ot15: 0, ot2: 0, total: 0 }
  const debut = new Date(`1970-01-01T${hEntree}`)
  const fin = new Date(`1970-01-01T${hSortie}`)
  let totalH = (fin.getTime() - debut.getTime()) / 3600000 - 1 // -1h pause
  if (totalH <= 0) totalH = 0
  if (ferieDay) return { normales: 0, ot15: 0, ot2: totalH, total: totalH }
  const normales = Math.min(totalH, 9)
  const reste = Math.max(totalH - 9, 0)
  const ot15 = Math.min(reste, 2)
  const ot2 = Math.max(reste - 2, 0)
  return { normales, ot15, ot2, total: totalH }
}

function calcMontantOT(ot: { ot15: number; ot2: number }, salaireBase: number): number {
  const tauxHoraire = salaireBase > 0 ? salaireBase / (45 * 52 / 12) : 0
  return Math.round((ot.ot15 * tauxHoraire * 1.5 + ot.ot2 * tauxHoraire * 2) * 100) / 100
}

export default function PointageMensuelPage() {
  const locale = getLocale()
  const [societes, setSocietes] = useState<any[]>([])
  const [employes, setEmployes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [employe, setEmploye] = useState("all")
  const [periode, setPeriode] = useState(new Date().toISOString().slice(0, 7))
  const [rows, setRows] = useState<any[]>([])
  const [recap, setRecap] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  // Dialog correction
  const [corrDialog, setCorrDialog] = useState<any | null>(null)
  const [corrEntree, setCorrEntree] = useState("")
  const [corrSortie, setCorrSortie] = useState("")
  const [corrMotif, setCorrMotif] = useState("")
  const [saving, setSaving] = useState(false)

  // Dialog valider OT
  const [otDialog, setOtDialog] = useState<any | null>(null)
  const [otSaving, setOtSaving] = useState(false)
  const [otResult, setOtResult] = useState<any>(null)

  // Batch OT
  const [batchSaving, setBatchSaving] = useState(false)
  const [batchResult, setBatchResult] = useState<any>(null)

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  useEffect(() => {
    if (societe !== "all") {
      fetch(`/api/rh/employes?societe_id=${societe}`).then(r => r.json()).then(d => setEmployes(d.employes || []))
    } else {
      setEmployes([])
    }
  }, [societe])

  const load = useCallback(async () => {
    if (!periode) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ periode })
      if (societe !== "all") params.set("societe_id", societe)
      if (employe !== "all") params.set("employe_id", employe)
      const [ptRes, recapRes] = await Promise.all([
        fetch(`/api/rh/pointage?${params}&mensuel=1`),
        societe !== "all" ? fetch(`/api/rh/pointage/recap-mensuel?${params}`) : Promise.resolve(null)
      ])
      const ptData = await ptRes.json()
      setRows(ptData.pointages || [])
      if (recapRes) {
        const recapData = await recapRes.json()
        setRecap(recapData.recap || null)
      }
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [societe, employe, periode])

  useEffect(() => { load() }, [load])

  const openCorr = (row: any) => {
    setCorrDialog(row)
    setCorrEntree(row.heure_entree?.slice(0, 5) || "")
    setCorrSortie(row.heure_sortie?.slice(0, 5) || "")
    setCorrMotif("")
  }

  const saveCorr = async () => {
    if (!corrDialog) return
    setSaving(true)
    try {
      await fetch(`/api/rh/pointage/${corrDialog.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heure_entree: corrEntree || null, heure_sortie: corrSortie || null, motif_correction: corrMotif })
      })
      setCorrDialog(null)
      load()
    } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  const validerOT = async () => {
    if (!otDialog) return
    setOtSaving(true)
    setOtResult(null)
    try {
      const res = await fetch("/api/rh/heures-sup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pointage_id: otDialog.id, employe_id: otDialog.employe_id })
      })
      const data = await res.json()
      setOtResult(data)
      // Fermer après 1.5 s si succès
      if (data.success) {
        setTimeout(() => { setOtDialog(null); setOtResult(null); load() }, 1500)
      }
    } catch (e) { console.error(e) } finally { setOtSaving(false) }
  }

  // Récupérer toutes les lignes avec OT non validées
  const rowsAvecOT = rows.filter(row => {
    if (isWeekend(row.date)) return false
    const ot = calcOT(row.heure_entree, row.heure_sortie, isFerie(row.date))
    return (ot.ot15 > 0 || ot.ot2 > 0) && !row.ot_valide
  })

  const validerToutesOT = async () => {
    if (rowsAvecOT.length === 0) return
    setBatchSaving(true)
    setBatchResult(null)
    try {
      const batch = rowsAvecOT.map(row => ({
        pointage_id: row.id,
        employe_id: row.employe_id,
        date: row.date,
        heure_entree: row.heure_entree,
        heure_sortie: row.heure_sortie,
      }))
      const res = await fetch("/api/rh/heures-sup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch })
      })
      const data = await res.json()
      setBatchResult(data)
      if (data.success) load()
    } catch (e) { console.error(e) } finally { setBatchSaving(false) }
  }

  const justifierAbsence = async (id: string) => {
    await fetch(`/api/rh/pointage/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ absent_justifie: true, motif_absence: "Justifié par manager" })
    })
    load()
  }

  const exportCSV = () => {
    const headers = ["Date","Jour","Entrée","Sortie","Heures norm.","OT 1.5x","OT 2x","Statut"]
    const lines = rows.map(r => {
      const d = new Date(r.date + "T12:00:00")
      const ot = calcOT(r.heure_entree, r.heure_sortie, isFerie(r.date))
      return [
        r.date, JOURS_FR[d.getDay()],
        r.heure_entree?.slice(0,5)||"", r.heure_sortie?.slice(0,5)||"",
        ot.normales.toFixed(2), ot.ot15.toFixed(2), ot.ot2.toFixed(2),
        r.absent_justifie ? "Absent justifié" : r.absence_injustifiee ? "Absence injust." : isWeekend(r.date) ? "Week-end" : r.heure_entree ? "Travaillé" : "Absent"
      ].join(";")
    })
    const csv = [headers.join(";"), ...lines].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob)
    a.download = `pointage_${employe !== "all" ? employe : "tous"}_${periode}.csv`; a.click()
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E]">{t('rha.a.pointm.title', locale)}</h1>
          <p className="text-sm text-gray-500">Corrections, validation OT, absences — source de vérité pour la paie</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a href="/rh/pointage"><Button variant="outline" size="sm">⏰ Temps réel</Button></a>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-2" />Export CSV</Button>
          {rowsAvecOT.length > 0 && (
            <Button
              size="sm"
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={validerToutesOT}
              disabled={batchSaving}
            >
              {batchSaving
                ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                : <CheckCheck className="w-4 h-4 mr-2" />}
              Valider toutes les OT du mois ({rowsAvecOT.length})
            </Button>
          )}
        </div>
      </div>

      {/* Résumé batch OT */}
      {batchResult && batchResult.success && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-sm text-orange-900">
          <p className="font-semibold mb-1">✅ Validation batch terminée</p>
          <p>
            <strong>{batchResult.summary?.total_heures}h</strong> validées pour{" "}
            <strong>{batchResult.summary?.nb_employes}</strong> employés —
            Total OT : <strong>{fmt(batchResult.summary?.montant_total ?? 0)}</strong>
          </p>
          {batchResult.errors > 0 && (
            <p className="text-orange-700 mt-1">{batchResult.errors} erreur(s) — voir console</p>
          )}
        </div>
      )}

      {/* Filtres */}
      <Card>
        <CardContent className="p-4 flex gap-3 flex-wrap">
          <Select value={societe} onValueChange={v => { setSociete(v); setEmploye("all") }}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Société" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes sociétés</SelectItem>
              {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={employe} onValueChange={setEmploye}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Tous les employés" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les employés</SelectItem>
              {employes.map(e => <SelectItem key={e.id} value={e.id}>{e.prenom} {e.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="month" value={periode} onChange={e => setPeriode(e.target.value)} className="w-36" />
          <Button onClick={load} className="bg-[#0B0F2E] text-white">Afficher</Button>
        </CardContent>
      </Card>

      {/* Légende */}
      <div className="flex gap-4 text-xs flex-wrap">
        {[
          { color: "bg-green-200", label: "Jour normal complet" },
          { color: "bg-orange-200", label: "OT détectées" },
          { color: "bg-red-200", label: "Absence injustifiée" },
          { color: "bg-blue-200", label: "Congé approuvé" },
          { color: "bg-gray-200", label: "Week-end / Férié" },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded ${l.color}`} />
            <span className="text-gray-600">{l.label}</span>
          </div>
        ))}
      </div>

      {/* Recap mensuel */}
      {recap && (
        <div className="grid grid-cols-6 gap-3">
          {[
            { label: "Jours travaillés", v: recap.total_jours_travailles },
            { label: "Heures normales", v: (recap.total_heures_normales?.toFixed(1) ?? "—") + "h" },
            { label: "OT 1.5x", v: `${recap.total_ot_1_5x?.toFixed(1) ?? 0}h = ${recap.montant_ot_1_5x?.toLocaleString("fr-FR") ?? 0} MUR` },
            { label: "OT 2x", v: `${recap.total_ot_2x?.toFixed(1) ?? 0}h = ${recap.montant_ot_2x?.toLocaleString("fr-FR") ?? 0} MUR` },
            { label: "Absences injust.", v: recap.nb_absences_injustifiees },
            { label: "Congés pris", v: recap.nb_conges_pris },
          ].map(k => (
            <Card key={k.label}>
              <CardContent className="p-3">
                <p className="text-xs text-gray-500">{k.label}</p>
                <p className="text-sm font-bold text-[#0B0F2E]">{k.v ?? "—"}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tableau mensuel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[#0B0F2E]">
            Pointages — {periode} ({rows.length} entrées)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-gray-500">Aucun pointage pour cette période</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Jour</TableHead>
                  {employe === "all" && <TableHead>Employé</TableHead>}
                  <TableHead>Entrée</TableHead>
                  <TableHead>Sortie</TableHead>
                  <TableHead>H. normales</TableHead>
                  <TableHead>OT 1.5x</TableHead>
                  <TableHead>OT 2x</TableHead>
                  <TableHead>OT</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => {
                  const d = new Date(row.date + "T12:00:00")
                  const ot = calcOT(row.heure_entree, row.heure_sortie, isFerie(row.date))
                  const weekend = isWeekend(row.date)
                  const ferie = isFerie(row.date)
                  const hasOT = ot.ot15 > 0 || ot.ot2 > 0
                  const employeData = row.employe
                  const salaireBase = Number(employeData?.salaire_base) || 0
                  const montantOT = hasOT ? calcMontantOT(ot, salaireBase) : 0

                  return (
                    <TableRow key={i} className={getRowColor(row)}>
                      <TableCell className="font-mono text-sm">{row.date}</TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {JOURS_FR[d.getDay()]}
                        {ferie && <span className="ml-1 text-xs text-purple-600">🎌 Férié</span>}
                      </TableCell>
                      {employe === "all" && (
                        <TableCell className="text-sm font-medium">{row.employe?.prenom} {row.employe?.nom}</TableCell>
                      )}
                      <TableCell className="font-mono text-sm">{row.heure_entree?.slice(0, 5) || "—"}</TableCell>
                      <TableCell className="font-mono text-sm">{row.heure_sortie?.slice(0, 5) || "—"}</TableCell>
                      <TableCell className="text-sm">{ot.normales > 0 ? `${ot.normales.toFixed(1)}h` : "—"}</TableCell>
                      <TableCell className="text-sm text-orange-700">{ot.ot15 > 0 ? `${ot.ot15.toFixed(1)}h` : "—"}</TableCell>
                      <TableCell className="text-sm text-red-700">{ot.ot2 > 0 ? `${ot.ot2.toFixed(1)}h` : "—"}</TableCell>

                      {/* ── Colonne OT avec badge ── */}
                      <TableCell>
                        {ferie && ot.total > 0 ? (
                          <Badge variant="destructive" className="text-xs">Férié: {ot.total.toFixed(1)}h</Badge>
                        ) : row.ot_valide ? (
                          <Badge className="bg-green-600 text-xs">
                            ✅ {((ot.ot15 + ot.ot2) || 0).toFixed(1)}h — {fmt(row.montant_ot ?? montantOT)}
                          </Badge>
                        ) : hasOT ? (
                          <Badge className="bg-orange-500 text-xs">
                            OT: {(ot.ot15 + ot.ot2).toFixed(1)}h
                          </Badge>
                        ) : null}
                      </TableCell>

                      <TableCell>
                        {weekend ? <span className="text-xs text-gray-400">Week-end</span>
                          : ferie ? <span className="text-xs text-purple-600">Férié</span>
                          : row.type_absence === "conge_approuve" ? <span className="text-xs text-blue-600 font-medium">Congé</span>
                          : row.absent_justifie ? <span className="text-xs text-blue-600">Absent justifié</span>
                          : row.absence_injustifiee ? <span className="text-xs text-red-600 font-medium">Absent injust.</span>
                          : !row.heure_entree ? <span className="text-xs text-red-500">Absent</span>
                          : hasOT ? <span className="text-xs text-orange-600 font-medium">OT {row.ot_valide ? "✓ validées" : "en attente"}</span>
                          : <span className="text-xs text-green-600">✓ Normal</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {!weekend && !ferie && row.heure_entree && (
                            <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => openCorr(row)}>✏️</Button>
                          )}
                          {(hasOT || (ferie && row.heure_entree)) && !row.ot_valide && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-xs px-2 text-orange-700 border-orange-300 hover:bg-orange-50"
                              onClick={() => setOtDialog(row)}
                            >
                              ⏱️ Valider OT
                            </Button>
                          )}
                          {!weekend && !ferie && !row.heure_entree && !row.absent_justifie && (
                            <Button size="sm" variant="outline" className="h-6 text-xs px-2 text-blue-700" onClick={() => justifierAbsence(row.id)}>🔒 Just.</Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog correction */}
      <Dialog open={!!corrDialog} onOpenChange={open => !open && setCorrDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Corriger pointage — {corrDialog?.date} — {corrDialog?.employe?.prenom} {corrDialog?.employe?.nom}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Heure d'entrée</Label><Input type="time" value={corrEntree} onChange={e => setCorrEntree(e.target.value)} /></div>
              <div><Label>Heure de sortie</Label><Input type="time" value={corrSortie} onChange={e => setCorrSortie(e.target.value)} /></div>
            </div>
            <div><Label>Motif de correction *</Label><Input value={corrMotif} onChange={e => setCorrMotif(e.target.value)} placeholder="Ex: Erreur saisie initiale..." /></div>
            {corrEntree && corrSortie && (() => {
              const ot = calcOT(corrEntree + ":00", corrSortie + ":00", false)
              return (
                <div className="bg-blue-50 p-3 rounded text-sm text-blue-800">
                  <p>Heures calculées : <strong>{ot.normales.toFixed(1)}h normales</strong></p>
                  {ot.ot15 > 0 && <p>+ <strong>{ot.ot15.toFixed(1)}h OT 1.5x</strong></p>}
                  {ot.ot2 > 0 && <p>+ <strong>{ot.ot2.toFixed(1)}h OT 2x</strong></p>}
                </div>
              )
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrDialog(null)}>Annuler</Button>
            <Button onClick={saveCorr} disabled={saving || !corrMotif} className="bg-[#0B0F2E] text-white">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Sauvegarder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog valider OT */}
      <Dialog open={!!otDialog} onOpenChange={open => { if (!open) { setOtDialog(null); setOtResult(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>⏱️ Valider les heures supplémentaires</DialogTitle>
          </DialogHeader>
          {otDialog && (() => {
            const ferieRow = isFerie(otDialog.date)
            const ot = calcOT(otDialog.heure_entree, otDialog.heure_sortie, ferieRow)
            const salaireBase = Number(otDialog.employe?.salaire_base) || 0
            const montantEstime = calcMontantOT(ot, salaireBase)
            return (
              <div className="space-y-3 py-2">
                <p className="text-sm">
                  <strong>{otDialog.employe?.prenom} {otDialog.employe?.nom}</strong>
                  {" "}— {otDialog.date}
                  {ferieRow && <Badge variant="destructive" className="ml-2 text-xs">Jour férié</Badge>}
                </p>
                <div className="bg-orange-50 p-4 rounded-lg space-y-1 text-sm">
                  <p>Entrée : <strong>{otDialog.heure_entree?.slice(0,5)}</strong> — Sortie : <strong>{otDialog.heure_sortie?.slice(0,5)}</strong></p>
                  <p>Heures effectives : <strong>{(ot.total).toFixed(2)}h</strong> (dont 1h pause déduite)</p>
                  <p>Heures normales : <strong>{ot.normales.toFixed(2)}h</strong></p>
                  {ot.ot15 > 0 && <p className="text-orange-700">OT 1.5x : <strong>{ot.ot15.toFixed(2)}h</strong></p>}
                  {ot.ot2 > 0 && <p className="text-red-700">OT 2x : <strong>{ot.ot2.toFixed(2)}h</strong></p>}
                  {montantEstime > 0 && (
                    <p className="font-semibold text-[#0B0F2E] pt-1 border-t border-orange-200">
                      Montant estimé : {fmt(montantEstime)}
                    </p>
                  )}
                </div>
                {otResult?.success && (
                  <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-800">
                    ✅ OT validées — {fmt(otResult.ot?.montant_ot_total ?? 0)}
                  </div>
                )}
                {otResult && !otResult.success && (
                  <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
                    ❌ Erreur : {otResult.error}
                  </div>
                )}
                <p className="text-xs text-gray-500">Ces heures seront intégrées dans le calcul du bulletin de paie.</p>
              </div>
            )
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOtDialog(null); setOtResult(null) }}>
              {otResult?.success ? "Fermer" : "Annuler"}
            </Button>
            {!otResult?.success && (
              <Button onClick={validerOT} disabled={otSaving} className="bg-orange-600 text-white">
                {otSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}✅ Confirmer les OT
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
