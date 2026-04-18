"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ShieldCheck, Unlock, Lock, History, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface ValidationLog {
  id: string
  action: string
  statut_avant: string | null
  statut_apres: string | null
  solde_releve: number | null
  solde_comptable: number | null
  ecart: number | null
  raison: string | null
  user_email: string | null
  user_role: string | null
  created_at: string
}

interface Props {
  rapprochement: {
    id: string
    statut: string
    locked?: boolean
    solde_releve: number
    solde_comptable: number
    ecart: number
    valide_par?: string | null
    valide_le?: string | null
    hash_integrite?: string | null
    justification_ecart?: string | null
  }
  onChanged?: () => void
}

function fmt(n: number | null | undefined) {
  return (Number(n) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDateTime(d: string | null | undefined) {
  return d ? new Date(d).toLocaleString("fr-FR") : "—"
}

export function RapprochementValidationPanel({ rapprochement, onChanged }: Props) {
  const [log, setLog] = useState<ValidationLog[]>([])
  const [integrity, setIntegrity] = useState<{ ok: boolean } | null>(null)
  const [loading, setLoading] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [validateOpen, setValidateOpen] = useState(false)
  const [raison, setRaison] = useState("")
  const [forceEcart, setForceEcart] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const ecartNonNul = Math.abs(Number(rapprochement.ecart) || 0) > 0.01

  const fetchLog = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/comptable/rapprochement/validation?rapprochement_id=${rapprochement.id}`)
      const body = await res.json()
      if (res.ok) {
        setLog(body.log || [])
        setIntegrity(body.integrity)
      }
    } finally { setLoading(false) }
  }, [rapprochement.id])

  useEffect(() => { fetchLog() }, [fetchLog])

  async function doAction(action: "validate" | "unvalidate" | "lock") {
    setSubmitting(true)
    try {
      const res = await fetch("/api/comptable/rapprochement/validation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rapprochement_id: rapprochement.id,
          action,
          raison: raison.trim() || undefined,
          force_ecart: forceEcart || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || "Erreur")
      toast.success(body.message)
      setValidateOpen(false)
      setRaison("")
      setForceEcart(false)
      await fetchLog()
      onChanged?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    } finally { setSubmitting(false) }
  }

  const statutBadge = (() => {
    switch (rapprochement.statut) {
      case "valide": return <Badge className="bg-emerald-600 hover:bg-emerald-700">Validé</Badge>
      case "ecart_justifie": return <Badge className="bg-amber-500 hover:bg-amber-600">Écart justifié</Badge>
      case "en_cours": return <Badge variant="outline">En cours</Badge>
      default: return <Badge variant="outline">{rapprochement.statut}</Badge>
    }
  })()

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" /> Validation & audit
        </CardTitle>
        <div className="flex items-center gap-2">
          {statutBadge}
          {rapprochement.locked && <Badge variant="secondary"><Lock className="h-3 w-3 mr-1" /> Verrouillé</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs text-gray-500">Solde relevé</div>
            <div className="font-mono">{fmt(rapprochement.solde_releve)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Solde comptable</div>
            <div className="font-mono">{fmt(rapprochement.solde_comptable)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Écart</div>
            <div className={`font-mono font-semibold ${ecartNonNul ? "text-amber-600" : "text-emerald-700"}`}>
              {fmt(rapprochement.ecart)}
            </div>
          </div>
        </div>

        {rapprochement.valide_le && (
          <div className="text-xs text-gray-600 border-t pt-2">
            <div>Validé le <strong>{fmtDateTime(rapprochement.valide_le)}</strong></div>
            {rapprochement.justification_ecart && (
              <div className="mt-1 text-amber-700">
                <AlertTriangle className="h-3 w-3 inline mr-1" />
                {rapprochement.justification_ecart}
              </div>
            )}
            {rapprochement.hash_integrite && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-gray-400">Hash:</span>
                <code className="text-[10px]">{rapprochement.hash_integrite.slice(0, 16)}…</code>
                {integrity && (
                  integrity.ok
                    ? <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    : <AlertTriangle className="h-3 w-3 text-red-600" />
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {rapprochement.statut === "en_cours" ? (
            <Button
              size="sm"
              onClick={() => setValidateOpen(true)}
              style={{ backgroundColor: "#D4AF37", color: "#0B0F2E" }}
            >
              <ShieldCheck className="h-4 w-4 mr-1" /> Valider la clôture
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setValidateOpen(true)}>
              <Unlock className="h-4 w-4 mr-1" /> Dévalider
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4 mr-1" /> Historique ({log.length})
          </Button>
        </div>
      </CardContent>

      {/* Validate dialog */}
      <Dialog open={validateOpen} onOpenChange={setValidateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {rapprochement.statut === "en_cours" ? "Valider et verrouiller" : "Dévalider et déverrouiller"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {rapprochement.statut === "en_cours" && ecartNonNul && (
              <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  Écart de <strong>{fmt(rapprochement.ecart)}</strong>. Vous devez fournir une justification
                  (chèque en circulation, virement non encaissé, frais bancaires…) et cocher "forcer".
                </div>
              </div>
            )}
            <div>
              <Label>Raison / justification {rapprochement.statut !== "en_cours" || ecartNonNul ? "*" : "(optionnelle)"}</Label>
              <Textarea
                rows={3}
                value={raison}
                onChange={e => setRaison(e.target.value)}
                placeholder={
                  rapprochement.statut === "en_cours"
                    ? "Ex. Chèque n°125 émis le 28/03 non encaissé au 31/03"
                    : "Ex. Erreur d'import détectée — relevé à corriger"
                }
              />
            </div>
            {rapprochement.statut === "en_cours" && ecartNonNul && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={forceEcart} onChange={e => setForceEcart(e.target.checked)} />
                Je confirme valider malgré l'écart
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setValidateOpen(false)}>Annuler</Button>
            <Button
              onClick={() => doAction(rapprochement.statut === "en_cours" ? "validate" : "unvalidate")}
              disabled={submitting || (rapprochement.statut !== "en_cours" && raison.trim().length < 5)}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {rapprochement.statut === "en_cours" ? "Valider" : "Dévalider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Historique des validations</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : log.length === 0 ? (
              <div className="text-center py-6 text-gray-500">Aucun événement enregistré</div>
            ) : (
              <div className="space-y-2">
                {log.map(l => (
                  <div key={l.id} className="border-l-2 border-gray-300 pl-3 py-1">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline">{l.action}</Badge>
                      <span className="font-medium">{l.user_email}</span>
                      <span className="text-gray-400 text-xs">({l.user_role})</span>
                      <span className="text-gray-500 text-xs ml-auto">{fmtDateTime(l.created_at)}</span>
                    </div>
                    {l.statut_avant && l.statut_apres && l.statut_avant !== l.statut_apres && (
                      <div className="text-xs text-gray-600">
                        {l.statut_avant} → <strong>{l.statut_apres}</strong>
                      </div>
                    )}
                    {l.ecart !== null && (
                      <div className="text-xs text-gray-600">
                        D: {fmt(l.solde_releve)} / C: {fmt(l.solde_comptable)} / Écart: {fmt(l.ecart)}
                      </div>
                    )}
                    {l.raison && <div className="text-xs text-gray-700 mt-1 italic">« {l.raison} »</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
