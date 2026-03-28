"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Clock, UserCheck, UserX, RefreshCw } from "lucide-react"

export default function PointagePage() {
  const [pointages, setPointages] = useState<any[]>([])
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [date, setDate] = useState(new Date().toISOString().split("T")[0])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ date })
      if (societe !== "all") params.set("societe_id", societe)
      const [ptRes, socRes] = await Promise.all([fetch(`/api/rh/pointage?${params}`), fetch("/api/comptable/societes")])
      setPointages((await ptRes.json()).pointages||[])
      setSocietes((await socRes.json()).societes||[])
    } catch(e){console.error(e)} finally{setLoading(false)}
  }, [societe, date])

  useEffect(() => { load() }, [load])

  const presents = pointages.filter(p=>p.heure_entree).length
  const partis = pointages.filter(p=>p.heure_sortie).length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-[#1E2A4A]">Pointage</h1><p className="text-sm text-gray-500">Présences en temps réel</p></div>
        <Button onClick={load} variant="outline"><RefreshCw className="w-4 h-4 mr-2"/>Actualiser</Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3"><UserCheck className="w-8 h-8 text-green-600"/><div><p className="text-xs text-gray-500">Présents</p><p className="text-2xl font-bold text-green-600">{presents}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><Clock className="w-8 h-8 text-blue-600"/><div><p className="text-xs text-gray-500">En cours</p><p className="text-2xl font-bold text-blue-600">{presents-partis}</p></div></CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3"><UserX className="w-8 h-8 text-gray-400"/><div><p className="text-xs text-gray-500">Partis</p><p className="text-2xl font-bold text-gray-600">{partis}</p></div></CardContent></Card>
      </div>

      <Card><CardContent className="p-4 flex gap-3">
        <Input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-40"/>
        <Select value={societe} onValueChange={setSociete}><SelectTrigger className="w-48"><SelectValue placeholder="Toutes sociétés"/></SelectTrigger><SelectContent><SelectItem value="all">Toutes</SelectItem>{societes.map(s=><SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent></Select>
      </CardContent></Card>

      <Card>
        <CardHeader><CardTitle className="text-[#1E2A4A]">Présences du {new Date(date).toLocaleDateString("fr-FR")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin"/></div> : pointages.length===0 ? <div className="text-center py-12 text-gray-500">Aucun pointage pour cette date</div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Employé</TableHead><TableHead>Poste</TableHead><TableHead>Entrée</TableHead><TableHead>Sortie</TableHead><TableHead>Durée</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
              <TableBody>
                {pointages.map(p=>(
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.employe?.prenom} {p.employe?.nom}</TableCell>
                    <TableCell className="text-sm text-gray-500">{p.employe?.poste||"—"}</TableCell>
                    <TableCell className="font-mono text-sm text-green-700">{p.heure_entree||"—"}</TableCell>
                    <TableCell className="font-mono text-sm text-red-600">{p.heure_sortie||"—"}</TableCell>
                    <TableCell className="text-sm">{p.duree_minutes ? `${Math.floor(p.duree_minutes/60)}h${String(p.duree_minutes%60).padStart(2,"0")}` : "—"}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${p.heure_sortie?"bg-gray-100 text-gray-600":p.heure_entree?"bg-green-100 text-green-700":"bg-red-100 text-red-600"}`}>
                        {p.heure_sortie?"Parti":p.heure_entree?"Présent":"Absent"}
                      </span>
                    </TableCell>
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
