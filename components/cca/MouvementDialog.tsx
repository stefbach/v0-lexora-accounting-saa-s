"use client"

/**
 * Dialog de saisie d'un mouvement de compte courant associé.
 *
 * Utilisable :
 *  - depuis la liste CCA (on choisit un CCA dans le select)
 *  - depuis le détail d'un CCA (on fixe `ccaId` côté parent → `lockedCcaId`)
 */
import { useEffect, useState } from "react"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

export interface CcaOption {
  id: string
  nom: string
  type: string
}

export interface FactureOption {
  id: string
  numero_facture?: string | null
  tiers?: string | null
  montant_ttc?: number | null
  devise?: string | null
}

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  ccas: CcaOption[]
  factures?: FactureOption[]
  lockedCcaId?: string | null
  saving?: boolean
  onSubmit: (payload: {
    cca_id: string
    type: "avance" | "remboursement"
    montant: number
    date_mouvement: string
    description: string
    facture_id: string | null
  }) => Promise<void> | void
}

export function MouvementDialog({
  open,
  onOpenChange,
  ccas,
  factures = [],
  lockedCcaId = null,
  saving = false,
  onSubmit,
}: Props) {
  const [ccaId, setCcaId] = useState<string>("")
  const [type, setType] = useState<"avance" | "remboursement">("avance")
  const [montant, setMontant] = useState<string>("")
  const [date, setDate] = useState<string>("")
  const [description, setDescription] = useState<string>("")
  const [factureId, setFactureId] = useState<string>("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCcaId(lockedCcaId ?? "")
    setType("avance")
    setMontant("")
    setDate(new Date().toISOString().split("T")[0])
    setDescription("")
    setFactureId("")
    setError(null)
  }, [open, lockedCcaId])

  const today = new Date().toISOString().split("T")[0]

  const handleSave = async () => {
    setError(null)
    const montantNum = Number(montant)
    if (!ccaId) return setError("Sélectionnez un CCA")
    if (!Number.isFinite(montantNum) || montantNum <= 0) {
      return setError("Le montant doit être strictement positif")
    }
    if (!date) return setError("La date est requise")
    if (date > today) return setError("La date ne peut pas être future")

    await onSubmit({
      cca_id: ccaId,
      type,
      montant: montantNum,
      date_mouvement: date,
      description,
      facture_id: factureId || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau mouvement CCA</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div>
            <Label>Compte Courant Associé *</Label>
            <Select
              value={ccaId}
              onValueChange={setCcaId}
              disabled={!!lockedCcaId}
            >
              <SelectTrigger><SelectValue placeholder="Choisir un associé..." /></SelectTrigger>
              <SelectContent>
                {ccas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nom} ({c.type === "associe" ? "Associé" : "Collaborateur"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Type *</Label>
            <Select value={type} onValueChange={(v) => setType(v as "avance" | "remboursement")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="avance">Avance — l&apos;associé avance du cash</SelectItem>
                <SelectItem value="remboursement">Remboursement — la société rend</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Montant (MUR) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Date *</Label>
              <Input
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Achat fournitures bureau"
            />
          </div>
          {factures.length > 0 && type === "avance" && (
            <div>
              <Label>Facture liée (optionnel)</Label>
              <Select value={factureId} onValueChange={setFactureId}>
                <SelectTrigger><SelectValue placeholder="Aucune" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Aucune</SelectItem>
                  {factures.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.numero_facture || f.tiers || "--"}
                      {f.montant_ttc ? ` — ${Number(f.montant_ttc).toFixed(2)} ${f.devise ?? ""}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !ccaId || !montant}
            className="bg-[#0B0F2E]"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
