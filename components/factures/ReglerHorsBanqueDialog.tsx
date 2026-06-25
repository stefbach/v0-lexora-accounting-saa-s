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
import { t, getLocale } from "@/lib/i18n"

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

export function ReglerHorsBanqueDialog({ open, onClose, societeId, factures, onSuccess }: Props) {
  const locale = getLocale()
  const typeLabel = (type: string) =>
    ({
      associe: t('cdlg.rhb.type.associe', locale),
      societe_liee: t('cdlg.rhb.type.societe_liee', locale),
      exploitant: t('cdlg.rhb.type.exploitant', locale),
      tiers: t('cdlg.rhb.type.tiers', locale),
    } as Record<string, string>)[type] || type
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
    if (!selectedCompteId) return setError(t('cdlg.rhb.err_select_compte', locale))
    if (!datePaiement) return setError(t('cdlg.rhb.err_date', locale))
    if (factures.length === 0) return setError(t('cdlg.rhb.err_no_facture', locale))
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
        setError(d?.error || `${t('cdlg.rhb.err_http', locale)} ${res.status}`)
        return
      }
      onSuccess?.({
        lettre: d.lettre,
        nbFactures: d.nb_factures,
        montantTotal: d.montant_total,
      })
      onClose()
    } catch (e: any) {
      setError(e?.message || t('cdlg.rhb.err_network', locale))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('cdlg.rhb.title_1', locale)} {factures.length} {factures.length > 1 ? t('cdlg.rhb.title_invoices', locale) : t('cdlg.rhb.title_invoice', locale)} {t('cdlg.rhb.title_2', locale)}</DialogTitle>
          <DialogDescription>
            {t('cdlg.rhb.subtitle', locale)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Récap factures */}
          <div className="rounded-lg border bg-gray-50 p-3 max-h-48 overflow-y-auto">
            <div className="text-xs font-medium text-gray-600 mb-2">
              {t('cdlg.rhb.recap_1', locale)} ({factures.length}) — {t('cdlg.rhb.recap_total', locale)} {totalAregler.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MUR
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
            <Label htmlFor="compte_tiers">{t('cdlg.rhb.compte_label', locale)}</Label>
            <div className="flex gap-2">
              <Select value={selectedCompteId} onValueChange={setSelectedCompteId} disabled={loadingComptes}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={loadingComptes ? t('cdlg.rhb.loading', locale) : t('cdlg.rhb.choose_compte', locale)} />
                </SelectTrigger>
                <SelectContent>
                  {comptes.length === 0 && !loadingComptes ? (
                    <div className="px-3 py-6 text-center text-sm text-gray-500">
                      {t('cdlg.rhb.no_compte_1', locale)}<br />{t('cdlg.rhb.no_compte_2', locale)}
                    </div>
                  ) : (
                    comptes.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="font-mono mr-2 text-xs text-gray-500">{c.code_compte}</span>
                        {c.nom_compte}
                        <span className="ml-2 text-xs text-gray-400">({typeLabel(c.type)})</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="icon" onClick={() => setShowCreate(true)} title={t('cdlg.rhb.new_compte_tooltip', locale)}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="date_paiement">{t('cdlg.rhb.date_label', locale)}</Label>
              <Input id="date_paiement" type="date" value={datePaiement} onChange={e => setDatePaiement(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="libelle">{t('cdlg.rhb.libelle_label', locale)}</Label>
              <Input id="libelle" value={libelle} onChange={e => setLibelle(e.target.value)} placeholder={t('cdlg.rhb.libelle_placeholder', locale)} />
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
          <Button variant="outline" onClick={onClose} disabled={submitting}>{t('cdlg.rhb.cancel', locale)}</Button>
          <Button onClick={handleSubmit} disabled={submitting || !selectedCompteId} className="bg-[#0B0F2E] text-white hover:bg-[#2a3a5a]">
            {submitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {t('cdlg.rhb.confirm', locale)}
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
  const locale = getLocale()

  useEffect(() => {
    if (open) { setCode(""); setNom(""); setType("associe"); setErr(null) }
  }, [open])

  const handleCreate = async () => {
    setErr(null)
    if (!/^[0-9]{3,8}$/.test(code)) return setErr(t('cdlg.rhb.create_err_code', locale))
    if (!nom.trim()) return setErr(t('cdlg.rhb.create_err_nom', locale))
    setSaving(true)
    try {
      const res = await fetch("/api/comptable/comptes-paiement-tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societeId, code_compte: code, nom_compte: nom, type }),
      })
      const d = await res.json()
      if (!res.ok) return setErr(d?.error || t('cdlg.rhb.create_err_create', locale))
      onCreated(d.compte)
    } catch (e: any) {
      setErr(e?.message || t('cdlg.rhb.err_network', locale))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('cdlg.rhb.create_title', locale)}</DialogTitle>
          <DialogDescription>{t('cdlg.rhb.create_subtitle', locale)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>{t('cdlg.rhb.create_type', locale)}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="associe">{t('cdlg.rhb.create_type_associe', locale)}</SelectItem>
                <SelectItem value="societe_liee">{t('cdlg.rhb.create_type_societe_liee', locale)}</SelectItem>
                <SelectItem value="exploitant">{t('cdlg.rhb.create_type_exploitant', locale)}</SelectItem>
                <SelectItem value="tiers">{t('cdlg.rhb.create_type_tiers', locale)}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t('cdlg.rhb.create_code', locale)}</Label>
            <Input value={code} onChange={e => setCode(e.target.value)} placeholder={t('cdlg.rhb.create_code_placeholder', locale)} />
          </div>
          <div className="space-y-1">
            <Label>{t('cdlg.rhb.create_libelle', locale)}</Label>
            <Input value={nom} onChange={e => setNom(e.target.value)} placeholder={t('cdlg.rhb.create_libelle_placeholder', locale)} />
          </div>
          {err && (
            <div className="rounded-md bg-red-50 border border-red-200 p-2 text-sm text-red-700">{err}</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t('cdlg.rhb.create_cancel', locale)}</Button>
          <Button onClick={handleCreate} disabled={saving} className="bg-[#0B0F2E] text-white">
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {t('cdlg.rhb.create_btn', locale)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
