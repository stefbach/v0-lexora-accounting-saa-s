"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Calculator, Download, CheckCircle } from "lucide-react"

function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n) }
const STATUT_COLORS: Record<string,string> = { brouillon:"bg-gray-100 text-gray-700", valide:"bg-blue-100 text-blue-700", paye:"bg-green-100 text-green-700", declare_mra:"bg-purple-100 text-purple-700" }

export default function PaiePage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [periode, setPeriode] = useState(new Date().toISOString().slice(0,7))
  const [bulletins, setBulletins] = useState<any[]>([])
  const [totaux, setTotaux] = useState<any>({})
  const [loading, setLoading] = useState(false)
  const [calculating, setCalculating] = useState(false)

  useEffect(() => { fetch("/api/comptable/societes").then(r=>r.json()).then(d=>setSocietes(d.societes||[])) }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ periode })
      if (societe !== "all") params.set("societe_id", societe)
      const data = await fetch(`/api/rh/paie?${params}`).then(r=>r.json())
      setBulletins(data.bulletins||[])
      setTotaux(data.totaux||{})
    } catch(e){console.error(e)} finally{setLoading(false)}
  }, [societe, periode])

  useEffect(() => { load() }, [load])

  const calculerBatch = async () => {
    if (societe === "all") return alert("Sélectionnez une société")
    setCalculating(true)
    try {
      await fetch("/api/rh/paie", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ action:"calculer_batch", societe_id:societe, periode }) })
      load()
    } catch(e){console.error(e)} finally{setCalculating(false)}
  }

  const exportVirements = async () => {
    if (societe === "all") return alert("Sélectionnez une société")
    const data = await fetch("/api/rh/exports/virement", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ societe_id:societe, periode, banque:"MCB" }) }).then(r=>r.json())
    if (data.content) {
      const blob = new Blob([data.content], { type:"text/csv" })
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = data.filename; a.click()
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-[#1E2A4A]">Paie & Bulletins</h1><p className="text-sm text-gray-500">Calcul MRA — CSG/NSF/PAYE</p></div>
        <div className="flex gap-2">
          <Button onClick={calculerBatch} disabled={calculating} variant="outline"><Calculator className="w-4 h-4 mr-2"/>{calculating?"Calcul...":"Calculer la paie"}</Button>
          <Button onClick={exportVirements} variant="outline"><Download className="w-4 h-4 mr-2"/>Export MCB</Button>
        </div>
      </div>

      <Card><CardContent className="p-4 flex gap-3">
        <Select value={societe} onValueChange={setSociete}><SelectTrigger className="w-56"><SelectValue placeholder="Société"/></SelectTrigger><SelectContent><SelectItem value="all">Toutes</SelectItem>{societes.map(s=><SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent></Select>
        <Input type="month" value={periode} onChange={e=>setPeriode(e.target.value)} className="w-40"/>
      </CardContent></Card>

      {totaux.cout_total_employeur > 0 && (
        <div className="grid grid-cols-4 gap-4">
          {[
            {label:"Masse salariale brute", v:fmt(totaux.masse_salariale_brute||0)},
            {label:"Masse salariale nette", v:fmt(totaux.masse_salariale_nette||0)},
            {label:"Charges patronales", v:fmt(totaux.total_charges_patronales||0)},
            {label:"Coût total employeur", v:fmt(totaux.cout_total_employeur||0)},
          ].map(k=>(
            <Card key={k.label}><CardContent className="p-4"><p className="text-xs text-gray-500">{k.label}</p><p className="text-lg font-bold text-[#1E2A4A]">{k.v}</p></CardContent></Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-[#1E2A4A]">Bulletins de paie — {periode} ({bulletins.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin"/></div> : bulletins.length===0 ? (
            <div className="text-center py-12 text-gray-500">
              <Calculator className="w-12 h-12 mx-auto mb-3 text-gray-300"/>
              <p>Aucun bulletin pour cette période</p>
              <p className="text-sm mt-1">Sélectionnez une société et cliquez sur "Calculer la paie"</p>
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Employé</TableHead><TableHead>Poste</TableHead><TableHead className="text-right">Brut</TableHead><TableHead className="text-right">CSG+NSF+PAYE</TableHead><TableHead className="text-right">Net à payer</TableHead><TableHead className="text-right">Coût employeur</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
              <TableBody>
                {bulletins.map(b=>(
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.employe?.prenom} {b.employe?.nom}</TableCell>
                    <TableCell className="text-sm text-gray-500">{b.employe?.poste||"—"}</TableCell>
                    <TableCell className="text-right">{fmt(b.salaire_brut)}</TableCell>
                    <TableCell className="text-right text-red-600">{fmt(b.total_deductions)}</TableCell>
                    <TableCell className="text-right font-semibold text-green-700">{fmt(b.salaire_net)}</TableCell>
                    <TableCell className="text-right text-orange-600">{fmt(b.cout_total_employeur)}</TableCell>
                    <TableCell><span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUT_COLORS[b.statut]||""}`}>{b.statut}</span></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
