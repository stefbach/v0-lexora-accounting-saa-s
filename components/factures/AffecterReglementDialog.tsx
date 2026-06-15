"use client"

/**
 * AffecterReglementDialog — sens inverse du rapprochement.
 *
 * Depuis une facture impayée, liste les virements bancaires NON rapprochés
 * correspondants (crédits pour une facture client, débits pour un fournisseur)
 * et en laisse sélectionner UN OU PLUSIEURS pour solder la facture en une fois.
 * Chaque virement est lettré via /api/comptable/rapprochement (action
 * lettrer_partiel), de façon séquentielle (le solde de la facture diminue
 * entre chaque appel). Réutilisé sur /client/factures et /comptable/factures.
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
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

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
  // Multi-sélection : plusieurs virements peuvent solder une même facture.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [amounts, setAmounts] = useState<Record<string, string>>({})

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
    setSelectedIds(new Set())
    setAmounts({})
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

  // ── Montant de chaque virement + répartition affectée ──────────────────
  const vOf = (t: BankTx) => (isClient ? t.credit : t.debit) || 0
  const selectedTxs = txs.filter((t) => selectedIds.has(t.id))
  const allocOf = (t: BankTx) => {
    const raw = amounts[t.id]
    if (raw === undefined || raw === "") return round2(Math.min(vOf(t), remaining))
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
  }
  const sumAlloc = round2(selectedTxs.reduce((s, t) => s + allocOf(t), 0))
  const resteApres = round2(remaining - sumAlloc)

  const toggle = (t: BankTx) => {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (n.has(t.id)) {
        n.delete(t.id)
        setAmounts((a) => {
          const c = { ...a }
          delete c[t.id]
          return c
        })
      } else {
        n.add(t.id)
        // Défaut = min(virement, reste à payer après les déjà sélectionnés) ⇒
        // additionner plusieurs virements solde la facture sans dépasser.
        const usedByOthers = txs
          .filter((x) => prev.has(x.id))
          .reduce((s, x) => s + allocOf(x), 0)
        const left = round2(Math.max(0, remaining - usedByOthers))
        const def = round2(Math.min(vOf(t), left > 0 ? left : vOf(t)))
        setAmounts((a) => ({ ...a, [t.id]: String(def) }))
      }
      return n
    })
  }

  const eachPositive = selectedTxs.every((t) => allocOf(t) > 0)
  const eachWithinTx = selectedTxs.every((t) => allocOf(t) <= vOf(t) + 1)
  const sumWithinSolde = sumAlloc <= remaining + 1
  const allocValid = selectedTxs.length > 0 && eachPositive && eachWithinTx && sumWithinSolde

  const handleConfirm = async () => {
    if (!facture || !societeId || selectedTxs.length === 0) return
    setBusy(true)
    setError(null)
    // Plafonnement cumulatif : ne jamais affecter plus que le solde restant,
    // appel par appel (le backend recalcule le solde après chaque versement).
    let left = remaining
    const calls = selectedTxs
      .map((t) => {
        const a = round2(Math.min(allocOf(t), vOf(t), left))
        left = round2(left - a)
        return { tx: t, montant: a }
      })
      .filter((c) => c.montant > 0)
    let done = 0
    let lastLettre = ""
    try {
      // Séquentiel : le solde de la facture diminue entre chaque lettrage.
      for (const c of calls) {
        const res = await fetch("/api/comptable/rapprochement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "lettrer_partiel",
            societe_id: societeId,
            releve_id: c.tx.releve_id,
            transaction_id: c.tx.id,
            allocations: [{ facture_id: facture.id, montant: c.montant }],
          }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d?.error || `HTTP ${res.status}`)
        done++
        lastLettre = d?.lettre || lastLettre
      }
      setOkMsg(
        `${done} règlement${done > 1 ? "s" : ""} affecté${done > 1 ? "s" : ""}` +
          (lastLettre ? ` (lettre ${lastLettre})` : "")
      )
      setBusy(false)
      onDone?.()
      setTimeout(() => onOpenChange(false), 900)
    } catch (e: any) {
      setBusy(false)
      // Échec en cours de série : certains virements ont pu être affectés.
      setError(
        (done > 0 ? `${done} règlement(s) affecté(s) puis échec : ` : "Échec du lettrage : ") +
          (e?.message || "erreur")
      )
      if (done > 0) onDone?.()
    }
  }

  if (!facture) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Affecter un ou plusieurs règlements</DialogTitle>
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
              const v = vOf(t)
              const checked = selectedIds.has(t.id)
              const over = allocOf(t) > v + 1
              return (
                <div key={t.id} className={`p-3 ${checked ? "bg-green-50" : ""}`}>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(t)}
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
                  {checked && (
                    <div className="mt-2 flex items-center gap-2 pl-7 text-xs">
                      <span className="text-muted-foreground">Affecté (MUR)&nbsp;:</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={amounts[t.id] ?? String(round2(Math.min(v, remaining)))}
                        onChange={(e) => setAmounts((a) => ({ ...a, [t.id]: e.target.value }))}
                        className={`h-8 w-32 text-right font-mono ${over ? "border-rose-400" : ""}`}
                      />
                      <span className="text-muted-foreground">/ virement {fmt(v)}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {selectedTxs.length > 0 && (
          <div
            className={`rounded border p-2.5 text-sm ${
              allocValid ? "bg-green-50 border-green-200" : "bg-rose-50 border-rose-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <span>
                {selectedTxs.length} règlement{selectedTxs.length > 1 ? "s" : ""} · total affecté{" "}
                <span className="font-mono">{fmt(sumAlloc)} MUR</span>
              </span>
              <span className="font-mono text-xs text-muted-foreground">solde {fmt(remaining)} MUR</span>
            </div>
            {!allocValid ? (
              <p className="text-[11px] text-rose-700 mt-1">
                {!sumWithinSolde
                  ? "Le total des règlements dépasse le solde de la facture. Décoche un virement ou réduis un montant."
                  : !eachWithinTx
                    ? "Un montant dépasse le virement sélectionné."
                    : "Chaque montant affecté doit être strictement positif."}
              </p>
            ) : resteApres > 0.01 ? (
              <p className="text-[11px] text-amber-800 mt-1">
                Paiement partiel — la facture restera « partiel » (reste {fmt(resteApres)} MUR).
              </p>
            ) : (
              <p className="text-[11px] text-green-700 mt-1">La facture sera soldée.</p>
            )}
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
            disabled={busy || !allocValid}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
            )}
            {selectedTxs.length > 1
              ? `Affecter ${selectedTxs.length} règlements`
              : "Affecter le règlement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
