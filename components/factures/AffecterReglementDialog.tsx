"use client"

/**
 * AffecterReglementDialog — sens inverse du rapprochement.
 *
 * Depuis une facture impayée, liste les virements bancaires NON rapprochés
 * correspondants (crédits pour une facture client, débits pour un fournisseur),
 * en laisse choisir un, et lettre via /api/comptable/rapprochement
 * (action lettrer_partiel). L'écart règlement/facture (change/frais/acompte)
 * est comptabilisé côté serveur. Réutilisé sur /client/factures et
 * /comptable/factures.
 */

import { useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, CheckCircle2, Search } from "lucide-react"

export interface AffecterReglementFacture {
  id: string
  numero_facture?: string | null
  tiers?: string | null
  type_facture?: string | null
  montant_ttc?: number | null
  montant_mur?: number | null
  solde_non_paye?: number | null
  devise?: string | null
}

interface BankTx {
  id: string
  releve_id: string
  date: string
  libelle: string
  debit: number
  credit: number
  devise: string
  statut: string
  facture_id?: string | null
}

const fmt = (n: number) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

export function AffecterReglementDialog({
  facture,
  societeId,
  open,
  onOpenChange,
  onDone,
}: {
  facture: AffecterReglementFacture | null
  societeId: string | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onDone?: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [txs, setTxs] = useState<BankTx[]>([])
  const [error, setError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [amountStr, setAmountStr] = useState<string>("")

  const isClient = facture?.type_facture !== "fournisseur"
  const remaining =
    facture == null
      ? 0
      : typeof facture.solde_non_paye === "number"
        ? facture.solde_non_paye
        : Number(facture.montant_mur) || Number(facture.montant_ttc) || 0

  // Charge les virements non rapprochés à l'ouverture
  useEffect(() => {
    if (!open || !facture || !societeId) return
    setLoading(true)
    setError(null)
    setOkMsg(null)
    setSelectedId(null)
    setAmountStr("")
    setSearch("")
    ;(async () => {
      try {
        const res = await fetch(`/api/comptable/rapprochement?societe_id=${societeId}`)
        const d = await res.json()
        if (!res.ok) throw new Error(d?.error || `HTTP ${res.status}`)
        const all: BankTx[] = Array.isArray(d?.bankTransactions) ? d.bankTransactions : []
        // Non rapprochés + sens correspondant (client → crédit ; fournisseur → débit)
        const candidates = all.filter((t) => {
          if (t.statut === "rapproche" || t.statut === "interne") return false
          if (t.facture_id) return false
          return isClient ? (t.credit || 0) > 0 : (t.debit || 0) > 0
        })
        setTxs(candidates)
      } catch (e: any) {
        setError(e?.message || "Erreur de chargement")
      } finally {
        setLoading(false)
      }
    })()
  }, [open, facture, societeId, isClient])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q
      ? txs.filter((t) => `${t.libelle} ${t.date}`.toLowerCase().includes(q))
      : txs
    // Tri par proximité de montant avec le solde à régler
    return [...list].sort((a, b) => {
      const av = isClient ? a.credit : a.debit
      const bv = isClient ? b.credit : b.debit
      return Math.abs(av - remaining) - Math.abs(bv - remaining)
    })
  }, [txs, search, isClient, remaining])

  const selectedTx = txs.find((t) => t.id === selectedId) || null
  const txAmount = selectedTx ? (isClient ? selectedTx.credit : selectedTx.debit) : 0
  const amount = (() => {
    if (amountStr === "") return Math.min(remaining, txAmount)
    const n = Number(amountStr)
    return Number.isFinite(n) ? n : 0
  })()
  const overSolde = amount > remaining + 1
  const overTx = amount > txAmount + 1
  const positive = amount > 0
  const allocValid = !overSolde && !overTx && positive

  // Aperçu de l'écart (miroir serveur) — É = montant affecté − virement
  const ecartTreatment = (() => {
    if (!selectedTx) return null
    const ecartBrut = Math.round((amount - txAmount) * 100) / 100
    if (Math.abs(ecartBrut) <= 1) return null
    const devise = (facture?.devise || "MUR").toUpperCase()
    const anyDevise = devise !== "MUR"
    const seuil = Math.max(50, 0.02 * txAmount)
    let compte: string
    let libelle: string
    if (ecartBrut > 0) {
      compte = anyDevise ? "656" : "6270"
      libelle = anyDevise ? "écart de change (perte)" : "frais bancaires"
    } else if (Math.abs(ecartBrut) > seuil) {
      compte = isClient ? "4191" : "409"
      libelle = isClient ? "acompte client" : "avance fournisseur"
    } else {
      compte = anyDevise ? "756" : "6270"
      libelle = anyDevise ? "écart de change (gain)" : "écart"
    }
    return { ecartBrut, compte, libelle }
  })()

  const handleConfirm = async () => {
    if (!facture || !societeId || !selectedTx) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/comptable/rapprochement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "lettrer_partiel",
          societe_id: societeId,
          releve_id: selectedTx.releve_id,
          transaction_id: selectedTx.id,
          allocations: [{ facture_id: facture.id, montant: Math.round(amount * 100) / 100 }],
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d?.error || `HTTP ${res.status}`)
      const ecartMsg = d?.ecart ? ` · écart ${fmt(Math.abs(d.ecart.montant))} → ${d.ecart.compte}` : ""
      setOkMsg(`Règlement affecté (lettre ${d?.lettre || "—"})${ecartMsg}`)
      setBusy(false)
      onDone?.()
      setTimeout(() => onOpenChange(false), 900)
    } catch (e: any) {
      setBusy(false)
      setError(e?.message || "Échec du lettrage")
    }
  }

  if (!facture) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Affecter un règlement</DialogTitle>
          <DialogDescription>
            Facture <span className="font-mono">{facture.numero_facture || facture.id.slice(0, 8)}</span>
            {facture.tiers ? ` · ${facture.tiers}` : ""} · reste{" "}
            <span className="font-mono font-medium">
              {fmt(remaining)} MUR{facture.devise && facture.devise !== "MUR" ? ` (${facture.devise})` : ""}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un virement (libellé, date)…"
            className="pl-8 h-9"
          />
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 inline animate-spin" /> Chargement des virements…
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucun virement bancaire non rapproché {isClient ? "(crédit)" : "(débit)"} trouvé.
          </p>
        ) : (
          <div className="rounded border bg-card divide-y max-h-72 overflow-y-auto">
            {filtered.map((t) => {
              const v = isClient ? t.credit : t.debit
              const checked = selectedId === t.id
              return (
                <label
                  key={t.id}
                  className={`flex items-start gap-3 p-3 hover:bg-muted/30 cursor-pointer ${checked ? "bg-green-50" : ""}`}
                >
                  <input
                    type="radio"
                    name="tx"
                    checked={checked}
                    onChange={() => {
                      setSelectedId(t.id)
                      setAmountStr(String(Math.round(Math.min(remaining, v) * 100) / 100))
                    }}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">{t.date}</p>
                    <p className="text-sm break-words">{t.libelle}</p>
                  </div>
                  <p className="font-mono text-sm flex-shrink-0 text-green-700">
                    {fmt(v)} {t.devise || "MUR"}
                  </p>
                </label>
              )
            })}
          </div>
        )}

        {selectedTx && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Montant affecté (MUR) :</span>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className={`h-8 w-36 text-right font-mono ${overSolde || overTx ? "border-rose-400" : ""}`}
              />
              <span className="text-xs text-muted-foreground">
                / virement {fmt(txAmount)} · solde {fmt(remaining)}
              </span>
            </div>
            {!allocValid ? (
              <p className="text-[11px] text-rose-700">
                {overSolde
                  ? "Le montant dépasse le solde restant de la facture."
                  : overTx
                    ? "Le montant dépasse le virement sélectionné."
                    : "Le montant doit être strictement positif."}
              </p>
            ) : ecartTreatment ? (
              <p className="text-[11px] text-amber-800">
                Écart de {fmt(Math.abs(ecartTreatment.ecartBrut))} MUR → comptabilisé en{" "}
                <span className="font-mono">{ecartTreatment.compte}</span> ({ecartTreatment.libelle}).
              </p>
            ) : amount < remaining - 0.01 ? (
              <p className="text-[11px] text-amber-800">
                Paiement partiel — la facture restera « partiel » (reste {fmt(remaining - amount)} MUR).
              </p>
            ) : null}
          </div>
        )}

        {error && <p className="text-xs text-rose-700">{error}</p>}
        {okMsg && <p className="text-xs text-green-700">{okMsg}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuler
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={busy || !selectedTx || !allocValid}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
            )}
            {ecartTreatment ? `Affecter + écart → ${ecartTreatment.compte}` : "Affecter le règlement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
