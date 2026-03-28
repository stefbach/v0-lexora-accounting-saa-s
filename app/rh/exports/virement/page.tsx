"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Download, CreditCard, CheckCircle } from "lucide-react"

export default function ExportVirementPage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [periode, setPeriode] = useState(new Date().toISOString().slice(0, 7))
  const [banque, setBanque] = useState("MCB")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  const exporter = async () => {
    if (!societe) { setError("Sélectionnez une société"); return }
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await fetch("/api/rh/exports/virement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societe, periode, banque }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setResult(data)

      // Téléchargement automatique
      const blob = new Blob([data.content], { type: "text/csv;charset=utf-8" })
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = data.filename
      a.click()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur")
    } finally { setLoading(false) }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1E2A4A]">Export Virements Salaires</h1>
        <p className="text-sm text-gray-500">Format MCB JuicePro / SBM — Import direct en banque</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-[#1E2A4A] flex items-center gap-2"><CreditCard className="w-4 h-4"/>Paramètres d'export</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded">{error}</p>}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Société *</Label>
              <Select value={societe} onValueChange={setSociete}>
                <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                <SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Période *</Label>
              <Input type="month" value={periode} onChange={e => setPeriode(e.target.value)} />
            </div>
            <div>
              <Label>Banque</Label>
              <Select value={banque} onValueChange={setBanque}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MCB">MCB (JuicePro)</SelectItem>
                  <SelectItem value="SBM">SBM</SelectItem>
                  <SelectItem value="AfrAsia">AfrAsia Bank</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={exporter} disabled={loading} className="bg-[#1E2A4A] text-white">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
            Générer et télécharger le fichier
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card className="border-green-200">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-600" />
            <div>
              <p className="font-semibold text-green-700">Fichier généré avec succès</p>
              <p className="text-sm text-gray-600">{result.nb_beneficiaires} bénéficiaires • Total : {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(result.montant_total)}</p>
              <p className="text-xs text-gray-400">Fichier : {result.filename}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm text-gray-600">Instructions d'import</CardTitle></CardHeader>
        <CardContent className="text-sm text-gray-600 space-y-2">
          <p><strong>MCB JuicePro :</strong> Accès MCB Internet Banking → Paiements → Bulk Payment → Importer CSV</p>
          <p><strong>SBM :</strong> SBM Online Business Banking → Virement de masse → Importer fichier</p>
          <p className="text-xs text-gray-400">⚠️ Vérifier les numéros de compte avant validation. Les transferts sont irréversibles.</p>
        </CardContent>
      </Card>
    </div>
  )
}
