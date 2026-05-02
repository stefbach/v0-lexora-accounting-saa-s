"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Card } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Plus, Trash2, Calculator, Info, Loader2 } from "lucide-react"
import { OnboardingShell, loadDraft, saveDraft } from "@/components/onboarding/OnboardingShell"

const NAVY = "#0B0F2E"

type BalanceLine = { compte: string; libelle: string; debit: number; credit: number }

function defaultExerciceDates(type: 'fiscal_jul_jun' | 'calendaire' | undefined): { debut: string; fin: string } {
  const now = new Date()
  if (type === 'calendaire') {
    const y = now.getFullYear()
    return { debut: `${y}-01-01`, fin: `${y}-12-31` }
  }
  // fiscal_jul_jun (default Maurice)
  const y = now.getMonth() < 6 ? now.getFullYear() - 1 : now.getFullYear()
  return { debut: `${y}-07-01`, fin: `${y + 1}-06-30` }
}

export default function OnboardingExercicePage() {
  const router = useRouter()

  const [dateDebut, setDateDebut] = useState("")
  const [dateFin, setDateFin] = useState("")
  const [saisirBalance, setSaisirBalance] = useState(false)
  const [lignes, setLignes] = useState<BalanceLine[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Restore draft + initialize default dates
  useEffect(() => {
    const d = loadDraft()
    if (!d.societe?.nom) {
      router.replace("/onboarding/societe")
      return
    }
    const exType = d.societe.exercice_type
    const def = defaultExerciceDates(exType)
    if (d.exercice?.date_debut) {
      setDateDebut(d.exercice.date_debut)
      setDateFin(d.exercice.date_fin ?? def.fin)
    } else {
      setDateDebut(def.debut)
      setDateFin(def.fin)
    }
    setSaisirBalance(d.exercice?.saisie_balance_ouverture ?? false)
    if (d.exercice?.balance_ouverture && d.exercice.balance_ouverture.length > 0) {
      setLignes(d.exercice.balance_ouverture)
    }
  }, [router])

  const totalDebit = useMemo(
    () => lignes.reduce((s, l) => s + (Number(l.debit) || 0), 0),
    [lignes]
  )
  const totalCredit = useMemo(
    () => lignes.reduce((s, l) => s + (Number(l.credit) || 0), 0),
    [lignes]
  )
  const equilibre = Math.abs(totalDebit - totalCredit) < 0.01

  const addLine = () => {
    setLignes((prev) => [...prev, { compte: "", libelle: "", debit: 0, credit: 0 }])
  }

  const updateLine = (idx: number, patch: Partial<BalanceLine>) => {
    setLignes((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  const removeLine = (idx: number) => {
    setLignes((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async () => {
    setError(null)
    if (!dateDebut || !dateFin) {
      setError("Les dates de début et fin d'exercice sont requises.")
      return
    }
    if (saisirBalance && lignes.length > 0 && !equilibre) {
      setError(`La balance d'ouverture n'est pas équilibrée (écart : ${(totalDebit - totalCredit).toFixed(2)} MUR).`)
      return
    }

    saveDraft({
      exercice: {
        date_debut: dateDebut,
        date_fin: dateFin,
        saisie_balance_ouverture: saisirBalance,
        balance_ouverture: saisirBalance ? lignes : [],
      },
    })

    setSubmitting(true)
    try {
      const draft = loadDraft()

      // 1) Setup société (création atomique)
      const setupRes = await fetch("/api/onboarding/setup-societe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe: draft.societe,
          comptes_bancaires: draft.comptes_bancaires ?? [],
          exercice: { date_debut: dateDebut, date_fin: dateFin },
        }),
      })
      const setupData = await setupRes.json()
      if (!setupRes.ok) {
        setError(setupData.error || "Erreur lors de la création de la société.")
        setSubmitting(false)
        return
      }

      const societeId = setupData.societe?.id
      saveDraft({ societe_id: societeId })

      // 2) Balance d'ouverture (optionnel)
      if (saisirBalance && lignes.length > 0 && societeId) {
        const balRes = await fetch("/api/onboarding/balance-ouverture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            societe_id: societeId,
            date_ouverture: dateDebut,
            lignes,
          }),
        })
        const balData = await balRes.json()
        if (!balRes.ok) {
          setError(balData.error || "Société créée mais balance d'ouverture en échec. Vous pourrez la saisir plus tard.")
          // On continue quand même vers la step done
        }
      }

      router.push("/onboarding/done")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <OnboardingShell
      step={3}
      title="Votre exercice comptable"
      subtitle="Confirmez les dates d'exercice et — si vous migrez d'un autre logiciel — saisissez votre balance d'ouverture."
      onNext={handleSubmit}
      loading={submitting}
      nextLabel="Créer la société"
    >
      <div className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="date_debut">Début d&apos;exercice</Label>
            <Input
              id="date_debut"
              type="date"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="date_fin">Fin d&apos;exercice</Label>
            <Input
              id="date_fin"
              type="date"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
            />
          </div>
        </div>

        <Alert className="border-blue-200 bg-blue-50/50">
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            À Maurice, l&apos;exercice fiscal standard est <strong>1er juillet → 30 juin</strong>. Vous pouvez choisir l&apos;année calendaire ou des dates personnalisées si votre société applique un autre cycle.
          </AlertDescription>
        </Alert>

        <Card className="border-amber-200 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label className="flex items-center gap-2 text-base font-semibold" style={{ color: NAVY }}>
                <Calculator className="h-4 w-4" />
                Saisir une balance d&apos;ouverture
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Pour les sociétés migrant d&apos;un autre logiciel. Génère automatiquement les écritures « À Nouveau » au {dateDebut || "début d'exercice"}.
              </p>
            </div>
            <Switch checked={saisirBalance} onCheckedChange={setSaisirBalance} />
          </div>

          {saisirBalance && (
            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-12 gap-2 text-xs font-semibold uppercase text-muted-foreground">
                <div className="col-span-2">Compte</div>
                <div className="col-span-4">Libellé</div>
                <div className="col-span-3 text-right">Débit</div>
                <div className="col-span-3 text-right">Crédit</div>
              </div>
              {lignes.map((l, idx) => (
                <div key={idx} className="grid grid-cols-12 items-center gap-2">
                  <Input
                    className="col-span-2"
                    placeholder="411"
                    value={l.compte}
                    onChange={(e) => updateLine(idx, { compte: e.target.value.trim() })}
                  />
                  <Input
                    className="col-span-4"
                    placeholder="Clients divers"
                    value={l.libelle}
                    onChange={(e) => updateLine(idx, { libelle: e.target.value })}
                  />
                  <Input
                    className="col-span-3 text-right"
                    type="number"
                    step="0.01"
                    value={l.debit}
                    onChange={(e) => updateLine(idx, { debit: parseFloat(e.target.value) || 0 })}
                  />
                  <div className="col-span-3 flex items-center gap-2">
                    <Input
                      className="text-right"
                      type="number"
                      step="0.01"
                      value={l.credit}
                      onChange={(e) => updateLine(idx, { credit: parseFloat(e.target.value) || 0 })}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(idx)}
                      className="h-7 w-7 shrink-0 text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}

              <Button variant="outline" size="sm" onClick={addLine} className="w-full">
                <Plus className="mr-2 h-3.5 w-3.5" />
                Ajouter une ligne
              </Button>

              <div className="mt-2 flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Total débit :</span>{" "}
                  <strong>{totalDebit.toLocaleString("fr-MU", { minimumFractionDigits: 2 })}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground">Total crédit :</span>{" "}
                  <strong>{totalCredit.toLocaleString("fr-MU", { minimumFractionDigits: 2 })}</strong>
                </div>
                <div className={equilibre ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>
                  {equilibre ? "Équilibré" : `Écart : ${(totalDebit - totalCredit).toFixed(2)}`}
                </div>
              </div>
            </div>
          )}
        </Card>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {submitting && (
          <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Création de la société et seed du plan comptable...
          </div>
        )}
      </div>
    </OnboardingShell>
  )
}

