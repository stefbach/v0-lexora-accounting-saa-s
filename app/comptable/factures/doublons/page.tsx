"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, RefreshCw, Trash2, AlertTriangle, CheckCircle, Copy } from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number) {
  return new Intl.NumberFormat("fr-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

interface Societe { id: string; nom: string }
interface FactureDup {
  id: string
  numero_facture: string
  tiers: string
  type_facture: string
  date_facture: string
  montant_ttc: number
  montant_mur: number
  devise: string
  statut: string
  document_id: string | null
  created_at: string
  role: 'conserver' | 'doublon'
}
interface Groupe {
  key: string
  tiers: string
  date_facture: string
  montant_ttc: number
  count: number
  nb_doublons: number
  factures: FactureDup[]
}

export default function DoublonsFacturesPage() {
  const [societes, setSocietes] = useState<Societe[]>([])
  const [sid, setSid] = useState("")
  const [groupes, setGroupes] = useState<Groupe[]>([])
  const [synth, setSynth] = useState<{ nb_groupes: number; nb_doublons: number; montant: number }>({ nb_groupes: 0, nb_doublons: 0, montant: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/comptable/societes")
      .then(r => r.json())
      .then(d => {
        const list = d.societes || []
        setSocietes(list)
        if (list.length > 0) setSid(list[0].id)
      })
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    if (!sid) { setGroupes([]); return }
    setLoading(true); setError("")
    try {
      const r = await fetch(`/api/comptable/factures/doublons?societe_id=${sid}`, { cache: "no-store" })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Erreur")
      setGroupes(d.doublons || [])
      setSynth({ nb_groupes: d.nb_groupes || 0, nb_doublons: d.nb_doublons || 0, montant: d.montant_ttc_doublons || 0 })
    } catch (e: any) {
      setError(e.message); setGroupes([])
    } finally {
      setLoading(false)
    }
  }, [sid])

  useEffect(() => { load() }, [load])

  const supprimer = async (f: FactureDup) => {
    if (!confirm(`Supprimer le doublon : facture ${f.numero_facture} (${fmt(f.montant_ttc)} ${f.devise || 'MUR'}) du ${f.date_facture} ?\n\nCette action est irréversible.`)) return
    setDeleting(f.id); setError("")
    try {
      const r = await fetch(`/api/comptable/factures/${f.id}`, { method: "DELETE" })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `Échec suppression (${r.status})`) }
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: NAVY }}>
          <Copy className="h-6 w-6" style={{ color: GOLD }} /> Doublons de factures
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Factures regroupées par tiers + date + montant TTC. Conserve la plus ancienne, supprime les doublons.
        </p>
      </div>

      <Card className="border-2" style={{ borderColor: GOLD }}>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-gray-500">Société</label>
            <Select value={sid} onValueChange={setSid}>
              <SelectTrigger className="w-64 h-8 text-sm"><SelectValue placeholder="Choisir…" /></SelectTrigger>
              <SelectContent>
                {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" className="h-8 gap-2" onClick={load} disabled={loading || !sid}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Actualiser
          </Button>
        </CardContent>
      </Card>

      {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-gray-500">Groupes en doublon</p>
          <p className="text-2xl font-bold" style={{ color: NAVY }}>{synth.nb_groupes}</p>
        </CardContent></Card>
        <Card className={synth.nb_doublons > 0 ? "border-red-300" : ""}><CardContent className="p-4">
          <p className="text-xs text-gray-500">Factures en trop</p>
          <p className="text-2xl font-bold text-red-600">{synth.nb_doublons}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-gray-500">Montant TTC dupliqué</p>
          <p className="text-xl font-bold text-red-600">{fmt(synth.montant)} MUR</p>
        </CardContent></Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: NAVY }} /></div>
      ) : groupes.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-500">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-300" />
          <p className="font-medium">Aucun doublon détecté pour cette société.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {groupes.map(g => (
            <Card key={g.key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2" style={{ color: NAVY }}>
                  {g.tiers} · {g.date_facture} · {fmt(g.montant_ttc)} MUR
                  <Badge className="bg-red-100 text-red-800">{g.count} exemplaires</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 text-xs">
                      <TableHead>N° facture</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Créée le</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead></TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.factures.map(f => (
                      <TableRow key={f.id} className={f.role === 'conserver' ? "bg-green-50/40" : ""}>
                        <TableCell className="font-mono text-xs">{f.numero_facture}</TableCell>
                        <TableCell className="text-xs">{f.type_facture}</TableCell>
                        <TableCell className="text-xs">{new Date(f.created_at).toLocaleString("fr-FR")}</TableCell>
                        <TableCell className="text-xs">{f.statut}</TableCell>
                        <TableCell>
                          {f.role === 'conserver'
                            ? <Badge className="bg-green-100 text-green-800 gap-1"><CheckCircle className="w-3 h-3" />à conserver</Badge>
                            : <Badge className="bg-red-100 text-red-800">doublon</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          {f.role === 'doublon' && (
                            <Button
                              size="sm" variant="outline"
                              className="h-7 px-2 text-xs gap-1 text-red-600 hover:bg-red-50"
                              onClick={() => supprimer(f)}
                              disabled={deleting === f.id}
                            >
                              {deleting === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                              Supprimer
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
