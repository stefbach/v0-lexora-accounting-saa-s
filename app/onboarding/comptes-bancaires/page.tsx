"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Card } from "@/components/ui/card"
import { Plus, Trash2, Building } from "lucide-react"
import { OnboardingShell, loadDraft, saveDraft } from "@/components/onboarding/OnboardingShell"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

const BANQUES = [
  { code: "MCB", label: "MCB (Mauritius Commercial Bank)" },
  { code: "SBM", label: "SBM (State Bank of Mauritius)" },
  { code: "AfrAsia", label: "AfrAsia Bank" },
  { code: "MauBank", label: "MauBank" },
  { code: "ABC", label: "ABC Banking Corporation" },
  { code: "BarclaysAbsa", label: "Absa Bank Mauritius" },
  { code: "Standard Chartered", label: "Standard Chartered Mauritius" },
  { code: "HSBC", label: "HSBC Mauritius" },
  { code: "Other", label: "Autre banque" },
]

const DEVISES = ["MUR", "EUR", "USD", "GBP", "ZAR", "INR"]

type CompteForm = {
  banque: string
  nom_compte: string
  numero_compte: string
  iban: string
  devise: string
  solde_initial: number
  compte_principal: boolean
}

function emptyCompte(deviseDefault = "MUR"): CompteForm {
  return {
    banque: "MCB",
    nom_compte: "",
    numero_compte: "",
    iban: "",
    devise: deviseDefault,
    solde_initial: 0,
    compte_principal: false,
  }
}

export default function OnboardingComptesBancairesPage() {
  const router = useRouter()
  const [comptes, setComptes] = useState<CompteForm[]>([])
  const [deviseDefault, setDeviseDefault] = useState("MUR")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const d = loadDraft()
    if (d.societe?.devise_principale) setDeviseDefault(d.societe.devise_principale)
    if (d.comptes_bancaires && d.comptes_bancaires.length > 0) {
      setComptes(d.comptes_bancaires)
    } else {
      setComptes([{ ...emptyCompte(d.societe?.devise_principale ?? "MUR"), compte_principal: true }])
    }
  }, [])

  // Si l'utilisateur n'a pas encore complété l'étape 1, le ramener au début
  useEffect(() => {
    const d = loadDraft()
    if (!d.societe?.nom) {
      router.replace("/onboarding/societe")
    }
  }, [router])

  const updateCompte = (idx: number, patch: Partial<CompteForm>) => {
    setComptes((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)))
  }

  const setPrincipal = (idx: number) => {
    setComptes((prev) => prev.map((c, i) => ({ ...c, compte_principal: i === idx })))
  }

  const addCompte = () => {
    setComptes((prev) => [...prev, emptyCompte(deviseDefault)])
  }

  const removeCompte = (idx: number) => {
    setComptes((prev) => {
      const next = prev.filter((_, i) => i !== idx)
      // Si on a supprimé le principal, désigner le premier restant
      if (next.length > 0 && !next.some((c) => c.compte_principal)) {
        next[0] = { ...next[0], compte_principal: true }
      }
      return next
    })
  }

  const validate = (): string | null => {
    if (comptes.length === 0) return null // skip autorisé
    for (const [i, c] of comptes.entries()) {
      if (!c.banque) return `Banque manquante pour le compte n°${i + 1}.`
      if (!c.numero_compte && !c.iban) {
        return `Numéro de compte ou IBAN requis pour le compte n°${i + 1}.`
      }
    }
    if (comptes.length > 0 && !comptes.some((c) => c.compte_principal)) {
      return "Désignez un compte principal."
    }
    return null
  }

  const handleNext = () => {
    setError(null)
    const err = validate()
    if (err) { setError(err); return }
    saveDraft({ comptes_bancaires: comptes })
    router.push("/onboarding/exercice")
  }

  const handleSkip = () => {
    saveDraft({ comptes_bancaires: [] })
    router.push("/onboarding/exercice")
  }

  return (
    <OnboardingShell
      step={2}
      title="Vos comptes bancaires"
      subtitle="Ajoutez les comptes principaux de la société. Vous pourrez en ajouter d'autres plus tard."
      onNext={handleNext}
      nextLabel="Continuer"
    >
      <div className="space-y-5">
        {comptes.map((c, idx) => (
          <Card key={idx} className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4" style={{ color: NAVY }} />
                <span className="text-sm font-semibold" style={{ color: NAVY }}>
                  Compte bancaire n°{idx + 1}
                </span>
                {c.compte_principal && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                    style={{ backgroundColor: GOLD, color: NAVY }}
                  >
                    Principal
                  </span>
                )}
              </div>
              {comptes.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeCompte(idx)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Banque</Label>
                <Select value={c.banque} onValueChange={(v) => updateCompte(idx, { banque: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BANQUES.map((b) => (
                      <SelectItem key={b.code} value={b.code}>{b.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Devise</Label>
                <Select value={c.devise} onValueChange={(v) => updateCompte(idx, { devise: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEVISES.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Nom du compte (libre)</Label>
                <Input
                  placeholder="Ex: Compte courant principal"
                  value={c.nom_compte}
                  onChange={(e) => updateCompte(idx, { nom_compte: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>N° de compte</Label>
                <Input
                  placeholder="Ex: 000123456789"
                  value={c.numero_compte}
                  onChange={(e) => updateCompte(idx, { numero_compte: e.target.value })}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>IBAN</Label>
                <Input
                  placeholder="Ex: MU17 BOMM 0101 1010 3030 0200 000 MUR"
                  value={c.iban}
                  onChange={(e) => updateCompte(idx, { iban: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="space-y-2">
                <Label>Solde initial ({c.devise})</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={c.solde_initial}
                  onChange={(e) => updateCompte(idx, { solde_initial: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="flex items-end gap-3">
                <div className="flex flex-col gap-2">
                  <Label className="text-xs">Compte principal</Label>
                  <Switch
                    checked={c.compte_principal}
                    onCheckedChange={() => setPrincipal(idx)}
                  />
                </div>
              </div>
            </div>
          </Card>
        ))}

        <Button variant="outline" onClick={addCompte} className="w-full">
          <Plus className="mr-2 h-4 w-4" />
          Ajouter un compte bancaire
        </Button>

        <div className="rounded-md border border-amber-200 bg-amber-50/50 px-4 py-3 text-sm text-amber-900">
          Vous pouvez aussi <button type="button" onClick={handleSkip} className="font-semibold underline">passer cette étape</button> et ajouter vos comptes plus tard.
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}
      </div>
    </OnboardingShell>
  )
}
