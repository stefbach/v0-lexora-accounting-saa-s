"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useProfile } from "@/hooks/use-profile"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { AlertTriangle, Loader2, CheckCircle2, XCircle, Trash2, ShieldAlert } from "lucide-react"

interface Societe { id: string; nom: string; brn?: string | null }

interface ResetOptions {
  releves: boolean
  documents: boolean
  tva: boolean
  bulletins: boolean
  plan_comptable: boolean
  immobilisations: boolean
}

const DEFAULT_OPTIONS: ResetOptions = {
  releves: true,
  documents: true,
  tva: true,
  bulletins: true,
  plan_comptable: false, // par défaut on garde les libellés canoniques
  immobilisations: true,
}

export default function ResetSocietePage() {
  const { profile, loading: profileLoading } = useProfile()
  const router = useRouter()
  const [societes, setSocietes] = useState<Societe[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogSociete, setDialogSociete] = useState<Societe | null>(null)
  const [confirmName, setConfirmName] = useState("")
  const [options, setOptions] = useState<ResetOptions>(DEFAULT_OPTIONS)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  // Auth guard : admin / super_admin / comptable / comptable_dedie
  useEffect(() => {
    if (profileLoading) return
    const role = profile?.role || ""
    if (!["admin", "super_admin", "comptable", "comptable_dedie"].includes(role)) {
      router.replace("/")
    }
  }, [profile, profileLoading, router])

  // Load societes
  useEffect(() => {
    Promise.all([
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const merged = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(merged.map((s: any) => [s.id, s])).values()) as Societe[]
      setSocietes(unique.sort((a, b) => a.nom.localeCompare(b.nom)))
    }).finally(() => setLoading(false))
  }, [])

  function openDialog(s: Societe) {
    setDialogSociete(s)
    setConfirmName("")
    setOptions(DEFAULT_OPTIONS)
    setResult(null)
    setError(null)
  }

  function closeDialog() {
    if (submitting) return
    setDialogSociete(null)
    setConfirmName("")
    setResult(null)
    setError(null)
  }

  async function handleReset() {
    if (!dialogSociete) return
    if (confirmName.trim() !== dialogSociete.nom) return
    setSubmitting(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/comptable/reset-complet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: dialogSociete.id,
          confirm: "RESET_COMPLET",
          confirm_nom_societe: dialogSociete.nom,
          options,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`)
      } else {
        setResult(data)
      }
    } catch (e: any) {
      setError(e?.message || "Erreur réseau")
    } finally {
      setSubmitting(false)
    }
  }

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-[#0B0F2E]" />
      </div>
    )
  }

  const nameMatches = dialogSociete ? confirmName.trim() === dialogSociete.nom : false

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Warning banner */}
      <Card className="border-2 border-[#9F1239] bg-[#9F1239]/5">
        <CardContent className="p-5 flex items-start gap-4">
          <ShieldAlert className="w-8 h-8 text-[#9F1239] flex-shrink-0 mt-0.5" />
          <div>
            <h1 className="text-xl font-bold text-[#9F1239]">Zone dangereuse — Reset comptable complet</h1>
            <p className="text-sm text-gray-700 mt-1">
              Cette page permet de <strong>vider intégralement la comptabilité d'une société</strong>
              (écritures, factures, rapprochements, audit…). Selon les options, peut aussi effacer
              les documents, relevés, TVA, bulletins, immobilisations.
            </p>
            <p className="text-sm text-gray-700 mt-2">
              <strong>L'action est irréversible.</strong> Aucune corbeille, aucun rollback automatique.
              Les fichiers supprimés du storage Supabase ne sont pas récupérables.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Liste des sociétés */}
      <Card>
        <CardHeader>
          <CardTitle className="text-[#0B0F2E]">Sociétés visibles</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : societes.length === 0 ? (
            <div className="text-sm text-gray-500 py-6 text-center">Aucune société accessible.</div>
          ) : (
            <div className="divide-y">
              {societes.map(s => (
                <div key={s.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-[#0B0F2E]">{s.nom}</p>
                    <p className="text-xs text-gray-400 font-mono">{s.id}{s.brn ? ` · BRN ${s.brn}` : ""}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-[#9F1239]/40 text-[#9F1239] hover:bg-[#9F1239]/5 hover:border-[#9F1239]"
                    onClick={() => openDialog(s)}
                  >
                    <Trash2 className="w-4 h-4" />
                    Reset complet
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de confirmation */}
      <Dialog open={!!dialogSociete} onOpenChange={(o) => { if (!o) closeDialog() }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#9F1239]">
              <AlertTriangle className="w-5 h-5" />
              Reset complet — {dialogSociete?.nom}
            </DialogTitle>
            <DialogDescription>
              Action <strong>irréversible</strong>. Cochez ce que vous voulez effacer, puis
              tapez le nom exact de la société pour confirmer.
            </DialogDescription>
          </DialogHeader>

          {/* Result state */}
          {result ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[#0F766E] font-semibold">
                <CheckCircle2 className="w-5 h-5" />
                Reset effectué avec succès
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono space-y-1">
                {Object.entries(result.stats || {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-gray-600">{k}</span>
                    <span className="text-[#0B0F2E] font-semibold">{String(v)}</span>
                  </div>
                ))}
              </div>
              {result.next_steps && (
                <ul className="text-xs text-gray-600 space-y-1 mt-2">
                  {result.next_steps.map((s: string, i: number) => (
                    <li key={i}>• {s}</li>
                  ))}
                </ul>
              )}
              <DialogFooter>
                <Button onClick={closeDialog}>Fermer</Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              {/* Ce qui sera TOUJOURS effacé */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 space-y-1">
                <p className="font-semibold text-[#0B0F2E]">Toujours effacé :</p>
                <ul className="ml-3 space-y-0.5">
                  <li>• Toutes les écritures comptables</li>
                  <li>• Toutes les factures (clients + fournisseurs + avoirs)</li>
                  <li>• Rapprochements bancaires + audit log</li>
                  <li>• Comptes courants associés</li>
                </ul>
              </div>

              {/* Options */}
              <div className="space-y-2.5">
                <p className="text-sm font-semibold text-[#0B0F2E]">Options supplémentaires :</p>
                {([
                  ["releves", "Relevés bancaires importés"],
                  ["documents", "Documents uploadés (PDF, Excel) + fichiers storage"],
                  ["tva", "Déclarations TVA mensuelles"],
                  ["bulletins", "Bulletins de paie + lignes associées"],
                  ["plan_comptable", "Plan comptable client (à garder si possible)"],
                  ["immobilisations", "Immobilisations"],
                ] as [keyof ResetOptions, string][]).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={options[key]}
                      onCheckedChange={(c) => setOptions(o => ({ ...o, [key]: !!c }))}
                    />
                    <span className="text-gray-700">{label}</span>
                  </label>
                ))}
              </div>

              {/* Confirm name input */}
              <div className="space-y-1.5 pt-2">
                <Label htmlFor="confirm-name" className="text-sm">
                  Tapez le nom EXACT de la société pour confirmer :
                  <span className="font-mono font-semibold text-[#9F1239] ml-2">{dialogSociete?.nom}</span>
                </Label>
                <Input
                  id="confirm-name"
                  value={confirmName}
                  onChange={e => setConfirmName(e.target.value)}
                  placeholder={dialogSociete?.nom || ""}
                  className="font-mono"
                  disabled={submitting}
                  autoFocus
                />
              </div>

              {error && (
                <div className="rounded-lg border border-[#9F1239]/30 bg-[#9F1239]/5 p-3 text-xs text-[#9F1239] flex items-start gap-2">
                  <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={closeDialog} disabled={submitting}>
                  Annuler
                </Button>
                <Button
                  onClick={handleReset}
                  disabled={!nameMatches || submitting}
                  className="bg-[#9F1239] hover:bg-[#9F1239]/90 text-white gap-2"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Reset en cours…</>
                  ) : (
                    <><Trash2 className="w-4 h-4" /> Effacer définitivement</>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
