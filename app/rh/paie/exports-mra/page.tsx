"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Download, CheckCircle, AlertTriangle, Clock, CreditCard as CreditCardIcon, Building2, FileText, ClipboardList } from "lucide-react"


function downloadCSV(content: string, filename: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" })
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}

interface ExportStatus { done: boolean; loading: boolean; error: string | null }

export default function ExportsMRAPage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [periode, setPeriode] = useState(new Date().toISOString().slice(0, 7))
  const [bulletinsCount, setBulletinsCount] = useState<number | null>(null)
  const [checkingBulletins, setCheckingBulletins] = useState(false)

  const [csgStatus, setCsgStatus] = useState<ExportStatus>({ done: false, loading: false, error: null })
  const [payeStatus, setPayeStatus] = useState<ExportStatus>({ done: false, loading: false, error: null })
  const [virementMCBStatus, setVirementMCBStatus] = useState<ExportStatus>({ done: false, loading: false, error: null })
  const [virementSBMStatus, setVirementSBMStatus] = useState<ExportStatus>({ done: false, loading: false, error: null })

  useEffect(() => {
    Promise.all([
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values())
      setSocietes(unique)
      if (unique.length >= 1 && !societe) setSociete(unique[0].id)
    })
  }, [])

  useEffect(() => {
    if (!societe || !periode) return
    setCheckingBulletins(true)
    setBulletinsCount(null)
    fetch(`/api/rh/paie?societe_id=${societe}&periode=${periode}`)
      .then(r => r.json())
      .then(d => setBulletinsCount(d.nb || 0))
      .finally(() => setCheckingBulletins(false))
  }, [societe, periode])

  const exportCSGNSF = async () => {
    if (!societe) return alert("Sélectionnez une société")
    setCsgStatus({ done: false, loading: true, error: null })
    try {
      const data = await fetch("/api/rh/exports/csg-mra", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societe, periode })
      }).then(r => r.json())
      if (data.error) throw new Error(data.error)
      downloadCSV(data.recap_csv, data.filename_recap)
      setTimeout(() => downloadCSV(data.detail_csv, data.filename_detail), 500)
      setCsgStatus({ done: true, loading: false, error: null })
    } catch (e: unknown) {
      setCsgStatus({ done: false, loading: false, error: e instanceof Error ? e.message : "Erreur" })
    }
  }

  const exportPAYE = async () => {
    if (!societe) return alert("Sélectionnez une société")
    setPayeStatus({ done: false, loading: true, error: null })
    try {
      const data = await fetch("/api/rh/exports/paye-mra", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societe, periode })
      }).then(r => r.json())
      if (data.error) throw new Error(data.error)
      downloadCSV(data.recap_csv, data.filename_recap)
      setTimeout(() => downloadCSV(data.detail_csv, data.filename_detail), 500)
      setPayeStatus({ done: true, loading: false, error: null })
    } catch (e: unknown) {
      setPayeStatus({ done: false, loading: false, error: e instanceof Error ? e.message : "Erreur" })
    }
  }

  const exportVirement = async (banque: "MCB" | "SBM") => {
    if (!societe) return alert("Sélectionnez une société")
    const setter = banque === "MCB" ? setVirementMCBStatus : setVirementSBMStatus
    setter({ done: false, loading: true, error: null })
    try {
      const data = await fetch("/api/rh/exports/virement", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societe, periode, banque })
      }).then(r => r.json())
      if (data.error) throw new Error(data.error)
      if (data.content) downloadCSV(data.content, data.filename)
      setter({ done: true, loading: false, error: null })
    } catch (e: unknown) {
      setter({ done: false, loading: false, error: e instanceof Error ? e.message : "Erreur" })
    }
  }

  const StatusBadge = ({ status }: { status: ExportStatus }) => {
    if (status.loading) return <span className="flex items-center gap-1 text-xs text-blue-600"><Loader2 className="w-3 h-3 animate-spin" />En cours...</span>
    if (status.error) return <span className="flex items-center gap-1 text-xs text-red-600"><AlertTriangle className="w-3 h-3" />{status.error}</span>
    if (status.done) return <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="w-3 h-3" />Téléchargé</span>
    return null
  }

  const now = new Date()
  const periodeDate = periode ? new Date(periode + "-01") : now
  const isCurrentMonth = periodeDate.getMonth() === now.getMonth() && periodeDate.getFullYear() === now.getFullYear()
  const isPast = periodeDate < new Date(now.getFullYear(), now.getMonth(), 1)

  // Deadlines
  const deadlineCsg = new Date(periodeDate.getFullYear(), periodeDate.getMonth() + 1, 15)
  const deadlinePaye = new Date(periodeDate.getFullYear(), periodeDate.getMonth() + 1, 20)
  const isLate = (deadline: Date) => now > deadline

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1E2A4A]">Exports MRA & Virements</h1>
          <p className="text-sm text-gray-500">Déclarations MRA Maurice — CSG/NSF, PAYE, PRGF, Training Levy, Virements bancaires</p>
        </div>
      </div>

      {/* Sélecteurs */}
      <Card>
        <CardContent className="p-4 flex gap-4 items-center">
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Sélectionner société *" /></SelectTrigger>
            <SelectContent>
              {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="month" value={periode} onChange={e => setPeriode(e.target.value)} className="w-36" />
          {checkingBulletins && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          {bulletinsCount !== null && (
            <span className={`text-sm px-3 py-1 rounded-full ${bulletinsCount > 0 ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
              {bulletinsCount > 0 ? `${bulletinsCount} bulletin(s) calcules` : "Aucun bulletin -- calculez la paie d'abord"}
            </span>
          )}
        </CardContent>
      </Card>

      {/* Alertes deadlines */}
      {isPast && (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "CSG/NSF", deadline: deadlineCsg, text: `Deadline: le 15/${String(periodeDate.getMonth() + 2).padStart(2, "0")}` },
            { label: "PAYE", deadline: deadlinePaye, text: `Deadline: le 20/${String(periodeDate.getMonth() + 2).padStart(2, "0")}` },
          ].map(d => (
            <div key={d.label} className={`flex items-center gap-2 p-3 rounded-lg border text-sm ${isLate(d.deadline) ? "bg-red-50 border-red-200 text-red-700" : "bg-yellow-50 border-yellow-200 text-yellow-700"}`}>
              {isLate(d.deadline) ? <AlertTriangle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
              <span><strong>{d.label}</strong> -- {d.text} {isLate(d.deadline) ? "EN RETARD" : "A faire"}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4">
        {/* VIREMENTS SALAIRES */}
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-[#1E2A4A] flex items-center gap-2">
              <CreditCardIcon className="w-4 h-4" /> Virements Salaires
              <span className="text-xs font-normal text-gray-500">Échéance : fin du mois</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
                <div>
                  <p className="font-medium text-sm">MCB Juice Pro</p>
                  <p className="text-xs text-gray-500">Mauritius Commercial Bank</p>
                  <StatusBadge status={virementMCBStatus} />
                </div>
                <Button onClick={() => exportVirement("MCB")} disabled={virementMCBStatus.loading || !societe || !bulletinsCount} variant="outline" size="sm">
                  {virementMCBStatus.loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1" />}
                  Export CSV
                </Button>
              </div>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
                <div>
                  <p className="font-medium text-sm">SBM Internet Banking</p>
                  <p className="text-xs text-gray-500">State Bank of Mauritius</p>
                  <StatusBadge status={virementSBMStatus} />
                </div>
                <Button onClick={() => exportVirement("SBM")} disabled={virementSBMStatus.loading || !societe || !bulletinsCount} variant="outline" size="sm">
                  {virementSBMStatus.loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1" />}
                  Export CSV
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* DÉCLARATIONS MRA */}
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-[#1E2A4A] flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Declarations MRA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {/* CSG/NSF */}
              <div className="p-4 bg-gray-50 rounded-lg border">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium text-sm">CSG/NSF Mensuel</p>
                    <p className="text-xs text-gray-500">2 fichiers : Récap + Détail</p>
                    <p className={`text-xs mt-1 ${isLate(deadlineCsg) ? "text-red-600 font-medium" : "text-gray-400"}`}>
                      Deadline : 15/{String(periodeDate.getMonth() + 2).padStart(2, "0")}/{periodeDate.getFullYear()}
                      {isLate(deadlineCsg) ? " [EN RETARD]" : ""}
                    </p>
                    <StatusBadge status={csgStatus} />
                  </div>
                  <Button onClick={exportCSGNSF} disabled={csgStatus.loading || !societe || !bulletinsCount} size="sm" className="bg-[#1E2A4A] text-white">
                    {csgStatus.loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1" />}
                    Télécharger
                  </Button>
                </div>
                <div className="text-xs text-gray-400 space-y-0.5">
                  <p>• CSG salarié (1.5% / 3%)</p>
                  <p>• CSG patronal (6%)</p>
                  <p>• NSF salarié (1.5%) + patronal (2.5%)</p>
                </div>
              </div>

              {/* PAYE */}
              <div className="p-4 bg-gray-50 rounded-lg border">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium text-sm">PAYE Return</p>
                    <p className="text-xs text-gray-500">2 fichiers : Récap + Détail</p>
                    <p className={`text-xs mt-1 ${isLate(deadlinePaye) ? "text-red-600 font-medium" : "text-gray-400"}`}>
                      Deadline : 20/{String(periodeDate.getMonth() + 2).padStart(2, "0")}/{periodeDate.getFullYear()}
                      {isLate(deadlinePaye) ? " [EN RETARD]" : ""}
                    </p>
                    <StatusBadge status={payeStatus} />
                  </div>
                  <Button onClick={exportPAYE} disabled={payeStatus.loading || !societe || !bulletinsCount} size="sm" className="bg-[#1E2A4A] text-white">
                    {payeStatus.loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1" />}
                    Télécharger
                  </Button>
                </div>
                <div className="text-xs text-gray-400 space-y-0.5">
                  <p>• Retenu PAYE mensuel par employé</p>
                  <p>• Salaire annualisé + TAN</p>
                  <p>• Format MRA conforme</p>
                </div>
              </div>

              {/* PRGF */}
              <div className="p-4 bg-gray-50 rounded-lg border opacity-70">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium text-sm">PRGF</p>
                    <p className="text-xs text-gray-500">4.50 MUR × jours travaillés</p>
                    <p className="text-xs text-gray-400">Deadline : fin du mois</p>
                  </div>
                  <Button disabled size="sm" variant="outline">
                    <Download className="w-3 h-3 mr-1" />Inclus dans CSG
                  </Button>
                </div>
                <p className="text-xs text-gray-400">Inclus dans l'export CSG/NSF</p>
              </div>

              {/* Training Levy */}
              <div className="p-4 bg-gray-50 rounded-lg border opacity-70">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium text-sm">Training Levy (HRDC)</p>
                    <p className="text-xs text-gray-500">1% de la masse salariale</p>
                    <p className="text-xs text-gray-400">Deadline : fin du mois</p>
                  </div>
                  <Button disabled size="sm" variant="outline">
                    <Download className="w-3 h-3 mr-1" />Inclus dans CSG
                  </Button>
                </div>
                <p className="text-xs text-gray-400">Inclus dans l'export CSG/NSF</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* BULLETINS PDF */}
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-[#1E2A4A] flex items-center gap-2"><FileText className="w-4 h-4" /> Bulletins de Paie</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1 p-4 bg-gray-50 rounded-lg border">
                <p className="font-medium text-sm mb-1">Bulletin individuel</p>
                <p className="text-xs text-gray-500 mb-3">Sélectionnez un employé pour générer son bulletin PDF</p>
                <a href="/rh/paie">
                  <Button variant="outline" size="sm">
                    Aller aux bulletins →
                  </Button>
                </a>
              </div>
              <div className="flex-1 p-4 bg-gray-50 rounded-lg border opacity-60">
                <p className="font-medium text-sm mb-1">Tous les bulletins (ZIP)</p>
                <p className="text-xs text-gray-500 mb-3">Un PDF par employé — fonctionnalité à venir</p>
                <Button disabled variant="outline" size="sm">Bientôt disponible</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rappel légal */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <h3 className="font-medium text-blue-900 text-sm mb-2 flex items-center gap-2"><ClipboardList className="w-4 h-4" /> Calendrier des declarations MRA</h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs text-blue-800">
            <p>• <strong>CSG/NSF :</strong> avant le 15 du mois suivant</p>
            <p>• <strong>PAYE :</strong> avant le 20 du mois suivant</p>
            <p>• <strong>PRGF :</strong> fin du mois en cours</p>
            <p>• <strong>Training Levy :</strong> fin du mois en cours</p>
            <p>• <strong>13ème mois (75%) :</strong> avant le 25 décembre</p>
            <p>• <strong>EDF annuel :</strong> avant le 30 septembre</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
