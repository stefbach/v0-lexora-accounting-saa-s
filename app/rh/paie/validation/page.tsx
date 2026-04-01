"use client"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle2, AlertTriangle, XCircle, Play, FileCheck } from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

interface Anomaly {
  employe_id: string
  employe_nom: string
  type: string
  message: string
  severite: "erreur" | "avertissement"
}

interface ValidationResult {
  statut: string
  nb_employes: number
  nb_anomalies: number
  anomalies: Anomaly[]
}

export default function PayrollValidationPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [error, setError] = useState("")

  const runValidation = async () => {
    setLoading(true); setError(""); setResult(null)
    try {
      const periode = new Date().toISOString().slice(0, 7)
      const res = await fetch("/api/rh/paie/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periode }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setResult(data)
    } catch { setError("Erreur reseau") }
    finally { setLoading(false) }
  }

  const erreurs = result?.anomalies.filter(a => a.severite === "erreur") || []
  const avertissements = result?.anomalies.filter(a => a.severite === "avertissement") || []
  const canGenerate = result && erreurs.length === 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Controle pre-paie</h1>
          <p className="text-sm text-gray-500">Verification automatique avant generation des bulletins</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={runValidation} disabled={loading} style={{ backgroundColor: NAVY }} className="text-white gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {loading ? "Verification..." : "Lancer le controle"}
          </Button>
          {canGenerate && (
            <Button className="gap-2" style={{ backgroundColor: GOLD, color: NAVY }}>
              <FileCheck className="w-4 h-4" /> Valider et generer la paie
            </Button>
          )}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">{error}</div>}

      {result && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: NAVY }}>
                  <span className="text-white font-bold">{result.nb_employes}</span>
                </div>
                <div><p className="text-sm font-medium">Employes verifies</p><p className="text-xs text-gray-500">Periode en cours</p></div>
              </CardContent>
            </Card>
            <Card className={erreurs.length > 0 ? "border-red-300" : "border-green-300"}>
              <CardContent className="p-4 flex items-center gap-3">
                {erreurs.length > 0 ? <XCircle className="w-10 h-10 text-red-500" /> : <CheckCircle2 className="w-10 h-10 text-green-500" />}
                <div><p className="text-sm font-medium">{erreurs.length} erreur(s)</p><p className="text-xs text-gray-500">Bloquent la generation</p></div>
              </CardContent>
            </Card>
            <Card className={avertissements.length > 0 ? "border-orange-300" : "border-green-300"}>
              <CardContent className="p-4 flex items-center gap-3">
                {avertissements.length > 0 ? <AlertTriangle className="w-10 h-10 text-orange-500" /> : <CheckCircle2 className="w-10 h-10 text-green-500" />}
                <div><p className="text-sm font-medium">{avertissements.length} avertissement(s)</p><p className="text-xs text-gray-500">A verifier</p></div>
              </CardContent>
            </Card>
          </div>

          {canGenerate ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <p className="text-sm text-green-800 font-medium">Tous les controles OK — vous pouvez generer la paie.</p>
            </div>
          ) : erreurs.length > 0 ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
              <XCircle className="w-5 h-5 text-red-600" />
              <p className="text-sm text-red-800 font-medium">{erreurs.length} erreur(s) bloquante(s) — corrigez avant de generer.</p>
            </div>
          ) : null}

          {result.anomalies.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base" style={{ color: NAVY }}>Detail des anomalies</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {result.anomalies.map((a, i) => (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${a.severite === "erreur" ? "bg-red-50 border-red-200" : "bg-orange-50 border-orange-200"}`}>
                      {a.severite === "erreur" ? <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{a.employe_nom}</span>
                          <Badge className={`text-[10px] ${a.severite === "erreur" ? "bg-red-100 text-red-800" : "bg-orange-100 text-orange-800"}`}>{a.type}</Badge>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">{a.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!result && !loading && (
        <Card>
          <CardContent className="p-12 text-center text-gray-400">
            <Play className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Lancez le controle pre-paie</p>
            <p className="text-sm mt-1">Verifie: salaire, pointage, conges, primes, champs obligatoires</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
