"use client"

/**
 * ReglerHorsBanqueDialog
 *
 * Dialog réutilisable pour marquer une ou plusieurs factures comme payées
 * HORS du compte bancaire (associé, société liée, exploitant...).
 *
 * Le sélecteur de compte tiers est alimenté depuis
 * /api/comptable/comptes-paiement-tiers (whitelist par société). Un bouton
 * "+ Nouveau compte" permet de créer un compte tiers à la volée.
 *
 * Props :
 *   - open / onClose
 *   - societeId
 *   - factures : liste à régler (id, numero_facture, tiers, montant restant)
 *   - onSuccess : callback appelé après règlement réussi
 */

import { useState, useEffect, useMemo, useCallback } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Loader2, Plus, X } from "lucide-react"

export interface FactureAReglage {
  id: string
  numero_facture: string | null
  tiers: string | null
  montant_ttc: number
  solde_non_paye: number | null
  devise: string | null
}

export interface CompteTiers {
  id: string
  code_compte: string
  nom_compte: string
  type: "associe" | "societe_liee" | "exploitant" | "tiers"
  actif: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  societeId: string
  factures: FactureAReglage[]
  onSuccess?: (info: { lettre: string; nbFactures: number; montantTotal: number }) => void
}

const TYPE_LABELS: Record<string, string> = {
  associe: "Associé",
  societe_liee: "Société liée",
  exploitant: "Exploitant",
  tiers: "Tiers",
}

export function ReglerHorsBanqueDialog({ open, onClose, societeId, factures, onSuccess }: Props) {
  const [comptes, setComptes] = useState<CompteTiers[]>([])
  const [loadingComptes, setLoadingComptes] = useState(false)
  const [selectedCompteId, setSelectedCompteId] = useState<string>("")
  const [datePaiement, setDatePaiement] = useState<string>(new Date().toISOString().slice(0, 10))
  const [libelle, setLibelle] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const totalAregler = useMemo(
    () => factures.reduce((s, f) => s + (Number(f.solde_non_paye ?? f.montant_ttc) || 0), 0),
    [factures],
  )

  const loadComptes = useCallback(async () => {
    if (!societeId) return
    setLoadingComptes(true)
    try {
      const res = await fetch(`/api/comptable/comptes-paiement-tiers?societe_id=${societeId}&actif=true`)
      const d = await res.json()
      setComptes(d.comptes || [])
    } catch (e) {
      console.warn("loadComptes failed:", e)
    } finally {
      setLoadingComptes(false)
    }
  }, [societeId])

  useEffect(() => {
    if (open) {
      loadComptes()
      setError(null)
      setLibelle("")
      setSelectedCompteId("")
      setDatePaiement(new Date().toISOString().slice(0, 10))
    }
  }, [open, loadComptes])

  const handleSubmit = async () => {
    setError(null)
    if (!selectedCompteId) return setError("Sélectionnez un compte de paiement")
    if (!datePaiement) return setError("Date de paiement requise")
    if (factures.length === 0) return setError("Aucune facture à régler")
    setSubmitting(true)
    try {
      const res = await fetch("/api/comptable/factures/regler-hors-banque", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          societe_id: societeId,
          facture_ids: factures.map(f => f.id),
          compte_paiement_tiers_id: selectedCompteId,
          date_paiement: datePaiement,
          libelle: libelle.trim() || undefined,
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d?.error || `Erreur HTTP ${res.status}`)
        return
      }
      onSuccess?.({
        lettre: d.lettre,
        nbFactures: d.nb_factures,
        montantTotal: d.montant_total,
      })
      onClose()
    } catch (e: any) {
      setError(e?.message || "Erreur réseau")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Régler {factures.length} facture{factures.length > 1 ? "s" : ""} hors banque</DialogTitle>
          <DialogDescription>
            Imputer le règlement sur un compte de tiers (associé, société liée, exploitant…).
            Aucun mouvement bancaire ne sera créé.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Récap factures */}
          <div className="rounded-lg border bg-gray-50 p-3 max-h-48 overflow-y-auto">
            <div className="text-xs font-medium text-gray-600 mb-2">
              Factures à régler ({factures.length}) — Total : {totalAregler.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MUR
            </div>
            <ul className="space-y-1 text-sm">
              {factures.map(f => (
                <li key={f.id} className="flex justify-between gap-2">
                  <span className="font-mono text-xs">{f.numero_facture || "—"}</span>
                  <span className="text-gray-700 truncate flex-1">{f.tiers || "—"}</span>
                  <span className="font-medium">
                    {(Number(f.solde_non_paye ?? f.montant_ttc) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} {f.devise || "MUR"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Sélecteur compte tiers */}
          <div className="space-y-2">
            <Label htmlFor="compte_tiers">Compte de paiement</Label>
            <div className="flex gap-2">
              <Select value={selectedCompteId} onValueChange={setSelectedCompteId} disabled={loadingComptes}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={loadingComptes ? "Chargement…" : "Choisir un compte tiers"} />
                </SelectTrigger>
                <SelectContent>
                  {comptes.length === 0 && !loadingComptes ? (
                    <div className="px-3 py-6 text-center text-sm text-gray-500">
                      Aucun compte tiers configuré.<br />Cliquez sur + pour en créer un.
                    </div>
                  ) : (
                    comptes.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="font-mono mr-2 text-xs text-gray-500">{c.code_compte}</span>
                        {c.nom_compte}
                        <span className="ml-2 text-xs text-gray-400">({TYPE_LABELS[c.type] || c.type})</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="icon" onClick={() => setShowCreate(true)} title="Nouveau compte tiers">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="date_paiement">Date du règlement</Label>
              <Input id="date_paiement" type="date" value={datePaiement} onChange={e => setDatePaiement(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="libelle">Libellé (optionnel)</Label>
              <Input id="libelle" value={libelle} onChange={e => setLibelle(e.target.value)} placeholder="ex: Avance Stéphane mai 2026" />
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-start gap-2">
              <X className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Annuler</Button>
          <Button onClick={handleSubmit} disabled={submitting || !selectedCompteId} className="bg-[#0B0F2E] text-white hover:bg-[#2a3a5a]">
            {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Confirmer le règlement
          </Button>
        </DialogFooter>

        {/* Sub-dialog: création rapide d'un compte tiers */}
        <CreateCompteTiersDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          societeId={societeId}
          onCreated={(c) => {
            setComptes(prev => [...prev, c].sort((a, b) => a.nom_compte.localeCompare(b.nom_compte)))
            setSelectedCompteId(c.id)
            setShowCreate(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

// ─── Sub-dialog : création rapide d'un compte tiers ─────────────────────
function CreateCompteTiersDialog({
  open, onClose, societeId, onCreated,
}: {
  open: boolean
  onClose: () => void
  societeId: string
  onCreated: (c: CompteTiers) => void
}) {
  const [code, setCode] = useState("")
  const [nom, setNom] = useState("")
  const [type, setType] = useState<string>("associe")
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (open) { setCode(""); setNom(""); setType("associe"); setErr(null) }
  }, [open])

  const handleCreate = async () => {
    setErr(null)
    if (!/^[0-9]{3,8}$/.test(code)) return setErr("Code compte = 3 à 8 chiffres (ex: 455, 4551, 451)")
    if (!nom.trim()) return setErr("Nom requis (ex: CCA Stéphane Bach)")
    setSaving(true)
    try {
      const res = await fetch("/api/comptable/comptes-paiement-tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, code_compte: code, nom_compte: nom, type }),
      })
      const d = await res.json()
      if (!res.ok) return setErr(d?.error || "Erreur création")
      onCreated(d.compte)
    } catch (e: any) {
      setErr(e?.message || "Erreur réseau")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouveau compte de paiement</DialogTitle>
          <DialogDescription>Ajouter un compte tiers à la whitelist de cette société.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="associe">Associé</SelectItem>
                <SelectItem value="societe_liee">Société liée du groupe</SelectItem>
                <SelectItem value="exploitant">Exploitant (carte perso)</SelectItem>
                <SelectItem value="tiers">Autre tiers</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Code compte (PCG)</Label>
            <Input value={code} onChange={e => setCode(e.target.value)} placeholder="ex: 455, 4551, 451, 108" />
          </div>
          <div className="space-y-1">
            <Label>Libellé</Label>
            <Input value={nom} onChange={e => setNom(e.target.value)} placeholder="ex: CCA Stéphane Bach" />
          </div>
          {err && (
            <div className="rounded-md bg-red-50 border border-red-200 p-2 text-sm text-red-700">{err}</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button onClick={handleCreate} disabled={saving} className="bg-[#0B0F2E] text-white">
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
