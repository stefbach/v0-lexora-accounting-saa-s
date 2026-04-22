"use client"
/**
 * G7 — Panneau "Protection légale" WRA 2019 S.52/S.53/S.64 pour /rh/employes/[id].
 * Visible uniquement pour les RH/admins. Permet :
 * - Déclarer une grossesse (si employe.genre = 'F')
 * - Déclarer une paternité (si employe.genre = 'M')
 * - Enregistrer accouchement / retour / annuler
 * - Afficher le badge "Protégée contre licenciement" + dates de protection
 * - Visualiser allocation naissance 3 000 MUR (statut payé/non-payé)
 */
import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { ShieldCheck, Baby, AlertTriangle, Loader2, Heart } from "lucide-react"
import { toast } from "sonner"

interface Props {
  employe: {
    id: string
    prenom?: string | null
    nom?: string | null
    genre?: string | null
    gender?: string | null
    date_arrivee?: string | null
  }
  canManage: boolean // true si user RH/admin
}

interface Grossesse {
  id: string
  date_declaration: string
  date_presume_accouchement: string
  date_reelle_accouchement: string | null
  grossesse_multiple: boolean
  naissance_prematuree: boolean
  mortinaissance: boolean
  est_adoption: boolean
  statut: 'declaree' | 'conge_en_cours' | 'retour_effectue' | 'annulee'
  conge_mat_debut: string | null
  conge_mat_fin: string | null
  allocation_naissance_payee: boolean
  allocation_naissance_paye_le: string | null
  commentaire: string | null
}

interface Paternite {
  id: string
  date_declaration: string
  date_naissance_enfant: string
  conge_pat_debut: string | null
  conge_pat_fin: string | null
  conge_paye: boolean
  statut: string
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—"
  const s = String(iso).slice(0, 10)
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`
}

export function ProtectionLegalePanel({ employe, canManage }: Props) {
  const [grossesse, setGrossesse] = useState<Grossesse | null>(null)
  const [paternite, setPaternite] = useState<Paternite | null>(null)
  const [loading, setLoading] = useState(true)

  const [dialog, setDialog] = useState<null | 'declarer-grossesse' | 'accouchement' | 'declarer-paternite' | 'annuler-grossesse'>(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Form states
  const [datePresume, setDatePresume] = useState("")
  const [grossesseMultiple, setGrossesseMultiple] = useState(false)
  const [commentaire, setCommentaire] = useState("")
  const [certificatUrl, setCertificatUrl] = useState("")

  const [dateReelle, setDateReelle] = useState("")
  const [naissancePrematuree, setNaissancePrematuree] = useState(false)
  const [mortinaissance, setMortinaissance] = useState(false)

  const [dateNaissanceEnfant, setDateNaissanceEnfant] = useState("")
  const [acteNaissanceUrl, setActeNaissanceUrl] = useState("")

  const [motifAnnulation, setMotifAnnulation] = useState("")

  const isFemale = (employe.genre || employe.gender || '').toUpperCase().startsWith('F')
  const isMale = (employe.genre || employe.gender || '').toUpperCase().startsWith('M')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Grossesses actives (RLS SELF + SELECT_RH)
      const [gRes, pRes] = await Promise.all([
        fetch(`/api/rh/maternite`).then(r => r.ok ? r.json() : { grossesses: [] }).catch(() => ({ grossesses: [] })),
        fetch(`/api/rh/paternite`).then(r => r.ok ? r.json() : { paternites: [] }).catch(() => ({ paternites: [] })),
      ])
      const g = (gRes.grossesses || []).find((x: any) => x.employe_id === employe.id) || null
      const p = (pRes.paternites || []).find((x: any) => x.employe_id === employe.id) || null
      setGrossesse(g)
      setPaternite(p)
    } finally {
      setLoading(false)
    }
  }, [employe.id])

  useEffect(() => { load() }, [load])

  const declarerGrossesse = async () => {
    if (!datePresume) { toast.error('Date présumée accouchement requise'); return }
    setActionLoading(true)
    try {
      const res = await fetch('/api/rh/maternite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'declarer',
          employe_id: employe.id,
          date_presume_accouchement: datePresume,
          grossesse_multiple: grossesseMultiple,
          commentaire: commentaire || null,
          certificat_medical_url: certificatUrl || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Erreur'); return }
      toast.success('Grossesse déclarée — protection WRA S.64 active.')
      setDialog(null)
      setDatePresume(""); setGrossesseMultiple(false); setCommentaire(""); setCertificatUrl("")
      await load()
    } finally {
      setActionLoading(false)
    }
  }

  const enregistrerAccouchement = async () => {
    if (!grossesse || !dateReelle) { toast.error('Date réelle requise'); return }
    setActionLoading(true)
    try {
      const res = await fetch('/api/rh/maternite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'accouchement',
          grossesse_id: grossesse.id,
          date_reelle: dateReelle,
          naissance_prematuree: naissancePrematuree,
          mortinaissance: mortinaissance,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Erreur'); return }
      toast.success(`Accouchement enregistré — congé jusqu'au ${fmtDate(data.conge_mat_fin)}.`)
      setDialog(null)
      setDateReelle(""); setNaissancePrematuree(false); setMortinaissance(false)
      await load()
    } finally {
      setActionLoading(false)
    }
  }

  const enregistrerRetourMat = async () => {
    if (!grossesse) return
    if (!confirm(`Enregistrer le retour de ${employe.prenom} ${employe.nom} après congé maternité ?`)) return
    setActionLoading(true)
    try {
      const res = await fetch('/api/rh/maternite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retour', grossesse_id: grossesse.id }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Erreur'); return }
      toast.success('Retour enregistré.')
      await load()
    } finally {
      setActionLoading(false)
    }
  }

  const annuler = async () => {
    if (!grossesse || !motifAnnulation) { toast.error('Motif requis'); return }
    setActionLoading(true)
    try {
      const res = await fetch('/api/rh/maternite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'annuler',
          grossesse_id: grossesse.id,
          motif: motifAnnulation,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Erreur'); return }
      toast.success('Grossesse annulée.')
      setDialog(null)
      setMotifAnnulation("")
      await load()
    } finally {
      setActionLoading(false)
    }
  }

  const declarerPaternite = async () => {
    if (!dateNaissanceEnfant) { toast.error('Date naissance enfant requise'); return }
    setActionLoading(true)
    try {
      const res = await fetch('/api/rh/paternite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'declarer',
          employe_id: employe.id,
          date_naissance_enfant: dateNaissanceEnfant,
          acte_naissance_url: acteNaissanceUrl || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Erreur'); return }
      toast.success(`Paternité déclarée — 4 sem ${data.conge_paye ? 'payées' : 'non-payées (ancienneté < 12 mois)'}.`)
      setDialog(null)
      setDateNaissanceEnfant(""); setActeNaissanceUrl("")
      await load()
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-4 text-center text-xs text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Chargement protection légale...
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="border-pink-200 bg-gradient-to-r from-pink-50 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-pink-900">
            <ShieldCheck className="w-4 h-4 text-pink-600" />
            Protection légale (WRA S.52/S.53/S.64)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {/* ── Grossesse active ─────────────────────────────────── */}
          {grossesse ? (
            <div className="space-y-2 border-l-4 border-pink-400 pl-3 bg-white rounded-md py-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Baby className="w-4 h-4 text-pink-600" />
                  <span className="font-semibold text-pink-900">
                    {grossesse.statut === 'declaree' && 'Grossesse déclarée'}
                    {grossesse.statut === 'conge_en_cours' && 'Congé maternité en cours'}
                  </span>
                </div>
                {(grossesse.statut === 'declaree' || grossesse.statut === 'conge_en_cours') && (
                  <Badge className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px]">
                    🛡️ Protégée contre licenciement
                  </Badge>
                )}
              </div>
              <div className="text-xs text-gray-700 space-y-0.5">
                <p>Date présumée : <strong>{fmtDate(grossesse.date_presume_accouchement)}</strong></p>
                {grossesse.date_reelle_accouchement && (
                  <p>Date réelle accouchement : <strong>{fmtDate(grossesse.date_reelle_accouchement)}</strong></p>
                )}
                {grossesse.conge_mat_debut && grossesse.conge_mat_fin && (
                  <p>Congé maternité : <strong>{fmtDate(grossesse.conge_mat_debut)} → {fmtDate(grossesse.conge_mat_fin)}</strong></p>
                )}
                {grossesse.grossesse_multiple && <p className="text-pink-700">🤰🤰 Grossesse multiple (+2 semaines)</p>}
                {grossesse.naissance_prematuree && <p className="text-pink-700">👶 Naissance prématurée (+2 semaines)</p>}
                {grossesse.mortinaissance && <p className="text-red-700">💔 Mortinaissance — pas d&apos;allocation naissance</p>}
                <p>
                  Allocation naissance 3 000 MUR :{" "}
                  {grossesse.allocation_naissance_payee ? (
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]">
                      ✓ Payée {grossesse.allocation_naissance_paye_le ? `le ${fmtDate(grossesse.allocation_naissance_paye_le)}` : ''}
                    </Badge>
                  ) : grossesse.mortinaissance ? (
                    <Badge className="bg-gray-100 text-gray-500 text-[10px]">Non applicable</Badge>
                  ) : (
                    <Badge className="bg-orange-100 text-orange-700 text-[10px]">En attente (sera injectée au prochain bulletin du mois)</Badge>
                  )}
                </p>
              </div>
              {canManage && (
                <div className="flex gap-2 pt-2">
                  {grossesse.statut === 'declaree' && (
                    <Button size="sm" className="bg-pink-600 text-white h-7 text-xs" onClick={() => setDialog('accouchement')}>
                      Enregistrer l&apos;accouchement
                    </Button>
                  )}
                  {grossesse.statut === 'conge_en_cours' && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={enregistrerRetourMat} disabled={actionLoading}>
                      Enregistrer le retour
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => setDialog('annuler-grossesse')}>
                    Annuler
                  </Button>
                </div>
              )}
            </div>
          ) : isFemale && canManage ? (
            <Button size="sm" onClick={() => setDialog('declarer-grossesse')} className="bg-pink-600 text-white">
              <Heart className="w-3.5 h-3.5 mr-1" />
              Déclarer une grossesse
            </Button>
          ) : null}

          {/* ── Paternité ─────────────────────────────────────────── */}
          {paternite ? (
            <div className="space-y-1 border-l-4 border-blue-400 pl-3 bg-white rounded-md py-2">
              <div className="flex items-center gap-2">
                <Baby className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-blue-900">
                  Congé paternité ({paternite.conge_paye ? 'payé' : 'non payé'})
                </span>
              </div>
              <p className="text-xs text-gray-700">
                Naissance : <strong>{fmtDate(paternite.date_naissance_enfant)}</strong> ·
                Congé : <strong>{fmtDate(paternite.conge_pat_debut)} → {fmtDate(paternite.conge_pat_fin)}</strong>
              </p>
            </div>
          ) : isMale && canManage ? (
            <Button size="sm" onClick={() => setDialog('declarer-paternite')} className="bg-blue-600 text-white">
              <Baby className="w-3.5 h-3.5 mr-1" />
              Déclarer une paternité
            </Button>
          ) : null}

          {!grossesse && !paternite && !canManage && (
            <p className="text-xs text-gray-500">Aucune protection légale active pour cet employé.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog Déclarer grossesse ─────────────────────────────── */}
      <Dialog open={dialog === 'declarer-grossesse'} onOpenChange={open => { if (!open) setDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-pink-600" />
              Déclarer une grossesse
            </DialogTitle>
            <DialogDescription>
              WRA S.52/S.64 — confidentialité garantie, accès réservé RH.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Date présumée d&apos;accouchement *</Label>
              <Input type="date" value={datePresume} onChange={e => setDatePresume(e.target.value)} />
            </div>
            <label className="flex items-center gap-2">
              <Checkbox checked={grossesseMultiple} onCheckedChange={v => setGrossesseMultiple(!!v)} />
              <span>Grossesse multiple (+2 semaines de congé)</span>
            </label>
            <div>
              <Label>URL certificat médical (optionnel)</Label>
              <Input value={certificatUrl} onChange={e => setCertificatUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <Label>Commentaire (optionnel)</Label>
              <Textarea value={commentaire} onChange={e => setCommentaire(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Annuler</Button>
            <Button onClick={declarerGrossesse} disabled={actionLoading} className="bg-pink-600 text-white">
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Déclarer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Accouchement ───────────────────────────────────── */}
      <Dialog open={dialog === 'accouchement'} onOpenChange={open => { if (!open) setDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Baby className="w-5 h-5 text-pink-600" />
              Enregistrer l&apos;accouchement
            </DialogTitle>
            <DialogDescription>Déclenche le congé maternité + allocation 3 000 MUR au prochain bulletin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Date réelle d&apos;accouchement *</Label>
              <Input type="date" value={dateReelle} onChange={e => setDateReelle(e.target.value)} />
            </div>
            <label className="flex items-center gap-2">
              <Checkbox checked={naissancePrematuree} onCheckedChange={v => setNaissancePrematuree(!!v)} />
              <span>Naissance prématurée (+2 semaines)</span>
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={mortinaissance} onCheckedChange={v => setMortinaissance(!!v)} />
              <span className="text-red-700">Mortinaissance (pas d&apos;allocation)</span>
            </label>
            {mortinaissance && (
              <div className="bg-red-50 border border-red-200 rounded-md p-2 text-xs text-red-800 flex gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>L&apos;allocation naissance ne sera PAS versée. Le congé maternité reste dû selon la loi.</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Annuler</Button>
            <Button onClick={enregistrerAccouchement} disabled={actionLoading} className="bg-pink-600 text-white">
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Annuler grossesse ──────────────────────────────── */}
      <Dialog open={dialog === 'annuler-grossesse'} onOpenChange={open => { if (!open) setDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-700">Annuler la grossesse ?</DialogTitle>
            <DialogDescription>Action exceptionnelle. Motif documenté obligatoire.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Motif (requis, ≥ 3 caractères)</Label>
              <Textarea value={motifAnnulation} onChange={e => setMotifAnnulation(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Retour</Button>
            <Button variant="destructive" onClick={annuler} disabled={actionLoading || motifAnnulation.trim().length < 3}>
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Annuler la grossesse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Déclarer paternité ─────────────────────────────── */}
      <Dialog open={dialog === 'declarer-paternite'} onOpenChange={open => { if (!open) setDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Baby className="w-5 h-5 text-blue-600" />
              Déclarer une paternité
            </DialogTitle>
            <DialogDescription>
              WRA S.53 — 4 semaines de congé. Payées si l&apos;employé a 12 mois de service continu.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <Label>Date de naissance de l&apos;enfant *</Label>
              <Input type="date" value={dateNaissanceEnfant} onChange={e => setDateNaissanceEnfant(e.target.value)} />
            </div>
            <div>
              <Label>URL acte de naissance (optionnel)</Label>
              <Input value={acteNaissanceUrl} onChange={e => setActeNaissanceUrl(e.target.value)} placeholder="https://..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Annuler</Button>
            <Button onClick={declarerPaternite} disabled={actionLoading} className="bg-blue-600 text-white">
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Déclarer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
