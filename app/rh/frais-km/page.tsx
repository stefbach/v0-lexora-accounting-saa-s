"use client"
import { useState, useEffect, useCallback } from "react"
import { notifySuccess, notifyError } from "@/lib/utils/toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Car, Plus, CheckCircle, Edit2, Save, DollarSign, MapPin, Trash2, XCircle } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale, type Locale } from "@/lib/i18n"
import { CalculDistanceWidget } from "@/components/rh/CalculDistanceWidget"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

function fmt(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 2 }).format(n)
}

// Format ISO date (YYYY-MM-DD) -> DD/MM/YYYY (FR). Renvoie '—' si vide/invalide.
function fmtDateFR(iso: string | null | undefined): string {
  if (!iso) return '—'
  // On accepte aussi les timestamps "YYYY-MM-DDTHH:mm..." en ne gardant que la date.
  const dateOnly = iso.slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly)
  if (!m) return '—'
  return `${m[3]}/${m[2]}/${m[1]}`
}

// Aujourd'hui au format YYYY-MM-DD (local).
function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// Date par défaut pour un nouveau trajet, en fonction de la période courante.
// - Si aujourd'hui appartient au mois de la période -> aujourd'hui (cas normal).
// - Sinon (saisie sur un mois passé) -> dernier jour du mois de la période.
function getDefaultTrajetDate(periode: string): string {
  const today = todayISO()
  if (today.startsWith(periode)) return today
  // periode = "YYYY-MM" -> dernier jour du mois
  const [y, mo] = periode.split('-').map(Number)
  if (!y || !mo) return today
  const lastDay = new Date(y, mo, 0).getDate() // mois 1-12 = day 0 du mois suivant
  return `${periode}-${String(lastDay).padStart(2, '0')}`
}

const STATUT_COLORS: Record<string, string> = {
  en_attente: "bg-yellow-100 text-yellow-800",
  approuve: "bg-green-100 text-green-800",
  refuse: "bg-red-100 text-red-800",
}
function getStatutLabels(locale: Locale): Record<string, string> {
  return {
    en_attente: t('rha.b.fraiskm.status_pending', locale),
    approuve: t('rha.b.fraiskm.status_approved', locale),
    refuse: t('rha.b.fraiskm.status_refused', locale),
  }
}

interface FraisKm {
  id: string
  employe_id: string
  employe_nom: string
  employe_prenom: string
  periode: string
  km: number
  tarif: number
  montant: number
  statut: string
}

interface TrajetKm {
  id: string
  societe_id: string
  employe_id: string
  periode: string
  date_trajet: string | null
  depart_adresse: string | null
  arrivee_adresse: string | null
  km: number
  motif: string | null
  aller_retour: boolean
  statut: 'en_attente' | 'valide' | 'rejete' | 'paye'
  rejected_reason: string | null
  created_at: string
}

const TRAJET_STATUT_COLORS: Record<string, string> = {
  en_attente: 'bg-yellow-100 text-yellow-800',
  valide: 'bg-green-100 text-green-800',
  rejete: 'bg-red-100 text-red-800',
  paye: 'bg-blue-100 text-blue-800',
}

export default function FraisKmPage() {
  const locale: Locale = getLocale()
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("all")
  const [employes, setEmployes] = useState<any[]>([])
  const [frais, setFrais] = useState<FraisKm[]>([])
  const [loading, setLoading] = useState(true)
  const [tarif, setTarif] = useState(16)
  const [editingTarif, setEditingTarif] = useState(false)
  const [newTarif, setNewTarif] = useState("16")
  const [savingTarif, setSavingTarif] = useState(false)
  const [periode, setPeriode] = useState(new Date().toISOString().slice(0, 7))

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingFrais, setEditingFrais] = useState<FraisKm | null>(null)
  const [formEmploye, setFormEmploye] = useState("")
  const [formKm, setFormKm] = useState("")
  const [saving, setSaving] = useState(false)

  // Mig 426 — multi-trajets : dialog détail
  const [trajetsDialogOpen, setTrajetsDialogOpen] = useState(false)
  const [trajetsEmploye, setTrajetsEmploye] = useState<FraisKm | null>(null)
  const [trajets, setTrajets] = useState<TrajetKm[]>([])
  const [loadingTrajets, setLoadingTrajets] = useState(false)
  const [newTrajetDate, setNewTrajetDate] = useState("")
  const [newTrajetMotif, setNewTrajetMotif] = useState("")
  const [newTrajetKm, setNewTrajetKm] = useState("")
  const [newTrajetAR, setNewTrajetAR] = useState(false)
  const [newTrajetDepart, setNewTrajetDepart] = useState("")
  const [newTrajetArrivee, setNewTrajetArrivee] = useState("")
  const [addingTrajet, setAddingTrajet] = useState(false)

  useEffect(() => {
    fetch("/api/comptable/societes").then(r => r.json()).then(d => setSocietes(d.societes || []))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ periode })
      if (societe !== "all") params.set("societe_id", societe)
      const [fraisRes, empRes] = await Promise.all([
        fetch(`/api/rh/frais-km?${params}`).then(r => r.json()).catch(() => ({ frais: [], tarif_km: 16 })),
        fetch(`/api/rh/employes?${societe !== "all" ? `societe_id=${societe}` : ""}`).then(r => r.json()).catch(() => ({ employes: [] })),
      ])
      setFrais(fraisRes.frais || [])
      setTarif(fraisRes.tarif_km ?? 16)
      setNewTarif(String(fraisRes.tarif_km ?? 16))
      setEmployes(empRes.employes || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [societe, periode])

  useEffect(() => { load() }, [load])

  const saveTarifKm = async () => {
    // FIX BUG 1 — feedback explicite : avant, l'utilisateur n'avait AUCUN
    // toast en cas d'échec (RLS rejet silencieux), il croyait que le tarif
    // était sauvegardé alors que l'API renvoyait 403.
    if (societe === "all") {
      notifyError("Tarif km", "Sélectionnez une société avant de modifier le tarif")
      return
    }
    const tarifNum = parseFloat(newTarif)
    if (!tarifNum || tarifNum <= 0) {
      notifyError("Tarif km", "Tarif invalide")
      return
    }
    setSavingTarif(true)
    try {
      const res = await fetch("/api/rh/frais-km", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_tarif", societe_id: societe, tarif_km: tarifNum }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        notifyError("Sauvegarde tarif km", data.error || `HTTP ${res.status}`)
        return
      }
      setTarif(tarifNum)
      setEditingTarif(false)
      notifySuccess(`✅ Tarif km mis à jour : ${tarifNum} MUR/km`)
      await load()
    } catch (e: unknown) {
      notifyError("Erreur réseau", e)
    } finally {
      setSavingTarif(false)
    }
  }

  const openAddDialog = () => {
    setEditingFrais(null)
    setFormEmploye("")
    setFormKm("")
    setDialogOpen(true)
  }

  const openEditDialog = (f: FraisKm) => {
    setEditingFrais(f)
    setFormEmploye(f.employe_id)
    setFormKm(String(f.km))
    setDialogOpen(true)
  }

  const saveFrais = async () => {
    if (!formEmploye || !formKm) return
    setSaving(true)
    try {
      const res = await fetch("/api/rh/frais-km", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "saisir",
          employe_id: formEmploye,
          periode,
          km_parcourus: parseFloat(formKm),
          societe_id: societe !== "all" ? societe : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        notifyError("Ajouter frais km", data.error || `HTTP ${res.status}`)
        return
      }
      // Fermer le dialog AVANT le rechargement pour que l'UX paraisse
      // instantanée. await load() pour garantir que la liste est rafraîchie
      // avant le toast — sinon l'utilisateur voit le toast mais une liste
      // encore vide pendant 100-300 ms.
      setDialogOpen(false)
      await load()
      notifySuccess(editingFrais ? "✅ Frais kilométriques mis à jour" : "✅ Frais kilométriques ajouté")
    } catch (e: unknown) {
      notifyError("Erreur réseau", e)
    } finally {
      setSaving(false)
    }
  }

  const approveFrais = async (id: string) => {
    try {
      const res = await fetch("/api/rh/frais-km", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approuver", id }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        notifyError("Approuver frais km", d.error || `HTTP ${res.status}`)
        return
      }
      await load()
      notifySuccess("✅ Frais kilométriques approuvés")
    } catch (e: unknown) {
      notifyError("Erreur réseau", e)
    }
  }

  // ── Mig 426 — Multi-trajets handlers ───────────────────────────────────
  const loadTrajets = useCallback(async (employe_id: string, per: string) => {
    setLoadingTrajets(true)
    try {
      const params = new URLSearchParams({
        action: 'list_trajets',
        employe_id,
        periode: per,
      })
      const res = await fetch(`/api/rh/frais-km?${params}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        notifyError('Trajets km', data.error || `HTTP ${res.status}`)
        setTrajets([])
        return
      }
      setTrajets(data.trajets || [])
    } catch (e: unknown) {
      notifyError('Erreur réseau', e)
      setTrajets([])
    } finally {
      setLoadingTrajets(false)
    }
  }, [])

  const openTrajetsDialog = (f: FraisKm) => {
    setTrajetsEmploye(f)
    setTrajets([])
    // Date par défaut : aujourd'hui si dans la période sélectionnée,
    // sinon dernier jour du mois de la période (UX : éviter les valeurs vides
    // qui poussent l'utilisateur à oublier ce champ).
    setNewTrajetDate(getDefaultTrajetDate(periode))
    setNewTrajetMotif("")
    setNewTrajetKm("")
    setNewTrajetAR(false)
    setNewTrajetDepart("")
    setNewTrajetArrivee("")
    setTrajetsDialogOpen(true)
    void loadTrajets(f.employe_id, periode)
  }

  const addTrajet = async () => {
    if (!trajetsEmploye) return
    const kmNum = parseFloat(newTrajetKm)
    if (!kmNum || kmNum <= 0) {
      notifyError('Trajet', 'Km invalide')
      return
    }
    // Date obligatoire : si l'utilisateur a vidé le champ, on retombe sur la
    // valeur par défaut (aujourd'hui ou dernier jour de la période). Bloque
    // aussi les dates dans le futur, déjà filtrées par l'attribut HTML max
    // mais on garde la garde côté JS pour les navigateurs anciens / paste.
    const effectiveDate = newTrajetDate || getDefaultTrajetDate(periode)
    if (effectiveDate > todayISO()) {
      notifyError('Trajet', 'La date du trajet ne peut pas être dans le futur')
      return
    }
    setAddingTrajet(true)
    try {
      const res = await fetch('/api/rh/frais-km', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_trajet',
          employe_id: trajetsEmploye.employe_id,
          periode,
          date_trajet: effectiveDate,
          depart_adresse: newTrajetDepart || null,
          arrivee_adresse: newTrajetArrivee || null,
          km: kmNum,
          motif: newTrajetMotif || null,
          aller_retour: newTrajetAR,
          societe_id: societe !== 'all' ? societe : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // FIX-X (mai 2026) — toast détaillé pour aider le diagnostic en
        // prod. Avant : message générique "HTTP 500" qui ne disait rien à
        // l'utilisateur. Maintenant on map les codes Postgres usuels et on
        // log le payload complet en console pour le support.
        const code = (data as { code?: string }).code
        const details = (data as { details?: string; error?: string; hint?: string })
        const msg =
          code === '42P01'
            ? 'Table trajets absente — la migration 426/428 doit être appliquée en prod'
            : code === '42501'
            ? 'Permissions insuffisantes pour ajouter un trajet (RLS)'
            : code === '23505'
            ? 'Trajet en doublon (contrainte d\'unicité)'
            : (details.details || details.error || details.hint || `HTTP ${res.status}`)
        notifyError('Ajouter trajet', msg)
        console.error('[addTrajet] error:', data)
        return
      }
      notifySuccess('Trajet ajouté')
      // Reset : on remet la date à la valeur par défaut (pas "" qui laisserait
      // le champ vide et obligerait l'utilisateur à le re-cliquer pour le
      // prochain trajet).
      setNewTrajetDate(getDefaultTrajetDate(periode))
      setNewTrajetMotif("")
      setNewTrajetKm("")
      setNewTrajetAR(false)
      setNewTrajetDepart("")
      setNewTrajetArrivee("")
      await loadTrajets(trajetsEmploye.employe_id, periode)
      await load()
    } catch (e: unknown) {
      notifyError('Erreur réseau', e)
    } finally {
      setAddingTrajet(false)
    }
  }

  const validateTrajet = async (id: string, statut: 'valide' | 'rejete') => {
    try {
      const res = await fetch('/api/rh/frais-km', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'validate_trajet', id, statut }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        notifyError('Validation trajet', data.error || `HTTP ${res.status}`)
        return
      }
      notifySuccess(statut === 'valide' ? 'Trajet validé' : 'Trajet rejeté')
      if (trajetsEmploye) {
        await loadTrajets(trajetsEmploye.employe_id, periode)
      }
      await load()
    } catch (e: unknown) {
      notifyError('Erreur réseau', e)
    }
  }

  const deleteTrajet = async (id: string) => {
    if (!window.confirm('Supprimer ce trajet ?')) return
    try {
      const res = await fetch('/api/rh/frais-km', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_trajet', id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        notifyError('Suppression trajet', data.error || `HTTP ${res.status}`)
        return
      }
      notifySuccess('Trajet supprimé')
      if (trajetsEmploye) {
        await loadTrajets(trajetsEmploye.employe_id, periode)
      }
      await load()
    } catch (e: unknown) {
      notifyError('Erreur réseau', e)
    }
  }

  const totalKm = frais.reduce((s, f) => s + f.km, 0)
  const totalMontant = frais.reduce((s, f) => s + f.montant, 0)
  const nbApprouves = frais.filter(f => f.statut === "approuve").length

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>{t('rha.b.fraiskm.title', locale)}</h1>
          <p className="text-gray-500 text-sm">{t('rha.b.fraiskm.subtitle', locale)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            type="month"
            value={periode}
            onChange={e => setPeriode(e.target.value)}
            className="w-[160px]"
          />
          <Select value={societe} onValueChange={setSociete}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t('rha.b.fraiskm.all_societes', locale)} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('rha.b.fraiskm.all_societes', locale)}</SelectItem>
              {societes.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tarif card + summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-2" style={{ borderColor: GOLD }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Car className="h-4 w-4" /> {t('rha.b.fraiskm.tariff_per_km', locale)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {editingTarif ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.1"
                  value={newTarif}
                  onChange={e => setNewTarif(e.target.value)}
                  className="w-24"
                />
                <span className="text-sm text-gray-500">Rs/km</span>
                <Button size="sm" onClick={saveTarifKm} disabled={savingTarif} style={{ backgroundColor: NAVY }} className="text-white">
                  {savingTarif ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold" style={{ color: NAVY }}>{tarif} Rs</span>
                <span className="text-sm text-gray-500">/km</span>
                <Button variant="ghost" size="sm" onClick={() => { setNewTarif(String(tarif)); setEditingTarif(true) }}>
                  <Edit2 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">{t('rha.b.fraiskm.total_km', locale)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" style={{ color: NAVY }}>{totalKm.toLocaleString("fr-FR")} km</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">{t('rha.b.fraiskm.total_amount', locale)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" style={{ color: GOLD }}>{fmt(totalMontant)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">{t('rha.b.fraiskm.approved', locale)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{nbApprouves} / {frais.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Widget calcul distance — saisie manuelle 2 adresses (alternative au GPS) */}
      <CalculDistanceWidget
        onDistanceCalculated={(km) => {
          // Pré-remplit le dialog d'ajout avec la distance calculée.
          // L'utilisateur n'a plus qu'à choisir l'employé et valider.
          setEditingFrais(null)
          setFormEmploye("")
          setFormKm(km.toFixed(1))
          setDialogOpen(true)
        }}
      />

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle style={{ color: NAVY }}>
              <DollarSign className="inline h-5 w-5 mr-2" />
              {t('rha.b.fraiskm.table_title', locale).replace('{period}', periode)}
            </CardTitle>
            <Button onClick={openAddDialog} style={{ backgroundColor: GOLD }} className="text-white hover:opacity-90">
              <Plus className="h-4 w-4 mr-1" /> {t('rha.b.fraiskm.btn_add', locale)}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : frais.length === 0 ? (
            <p className="text-center text-gray-400 py-12">{t('rha.b.fraiskm.no_data', locale)}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('rha.b.fraiskm.col_employee', locale)}</TableHead>
                    <TableHead>{t('rha.b.fraiskm.col_period', locale)}</TableHead>
                    <TableHead className="text-right">{t('rha.b.fraiskm.col_km', locale)}</TableHead>
                    <TableHead className="text-right">{t('rha.b.fraiskm.col_tariff', locale)}</TableHead>
                    <TableHead className="text-right">{t('rha.b.fraiskm.col_amount', locale)}</TableHead>
                    <TableHead>{t('rha.b.fraiskm.col_status', locale)}</TableHead>
                    <TableHead className="text-right">{t('rha.b.fraiskm.col_actions', locale)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {frais.map(f => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">
                        {f.employe_prenom} {f.employe_nom}
                      </TableCell>
                      <TableCell>{f.periode}</TableCell>
                      <TableCell className="text-right">{f.km.toLocaleString("fr-FR")} km</TableCell>
                      <TableCell className="text-right">{f.tarif} Rs/km</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(f.montant)}</TableCell>
                      <TableCell>
                        <Badge className={STATUT_COLORS[f.statut] || "bg-gray-100 text-gray-700"}>
                          {getStatutLabels(locale)[f.statut] || f.statut}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openTrajetsDialog(f)}
                            title="Détail des trajets du mois"
                          >
                            <MapPin className="h-3 w-3 mr-1" /> Détail trajets
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(f)} disabled={f.statut === "approuve"}>
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          {f.statut === "en_attente" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-700 border-green-300 hover:bg-green-50"
                              onClick={() => approveFrais(f.id)}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" /> {t('rha.b.fraiskm.btn_approve', locale)}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{ color: NAVY }}>
              {editingFrais ? t('rha.b.fraiskm.dialog_edit', locale) : t('rha.b.fraiskm.dialog_add', locale)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('rha.b.fraiskm.lbl_employee', locale)}</Label>
              <Select value={formEmploye} onValueChange={setFormEmploye} disabled={!!editingFrais}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t('rha.b.fraiskm.select_employee', locale)} />
                </SelectTrigger>
                <SelectContent>
                  {employes.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.prenom} {emp.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('rha.b.fraiskm.lbl_km', locale)}</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={formKm}
                onChange={e => setFormKm(e.target.value)}
                placeholder="Ex: 150"
                className="mt-1"
              />
            </div>
            <div className="bg-gray-50 rounded p-3">
              <p className="text-sm text-gray-600">
                {t('rha.b.fraiskm.estimated', locale)} <strong style={{ color: GOLD }}>
                  {fmt((parseFloat(formKm) || 0) * tarif)}
                </strong>
              </p>
              <p className="text-xs text-gray-400 mt-1">{t('rha.b.fraiskm.tariff_applied', locale).replace('{n}', String(tarif))}</p>
            </div>
            <Button
              className="w-full text-white"
              style={{ backgroundColor: NAVY }}
              onClick={saveFrais}
              disabled={saving || !formEmploye || !formKm}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingFrais ? t('rha.b.fraiskm.btn_update', locale) : t('rha.b.fraiskm.btn_save', locale)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mig 426 — Multi-trajets : dialog détail par employé/mois */}
      <Dialog open={trajetsDialogOpen} onOpenChange={setTrajetsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ color: NAVY }}>
              <MapPin className="inline h-4 w-4 mr-1" />
              Détail des trajets — {trajetsEmploye?.employe_prenom} {trajetsEmploye?.employe_nom} ({periode})
            </DialogTitle>
          </DialogHeader>

          {/* Formulaire ajout trajet */}
          <Card className="border" style={{ borderColor: GOLD }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium" style={{ color: NAVY }}>
                <Plus className="inline h-4 w-4 mr-1" /> Ajouter un trajet
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Champ Date — placé EN PREMIER, pleine largeur, visuellement
                  mis en avant (bordure dorée + label explicite + warning si la
                  date sort du mois de la période sélectionnée). Avant cette
                  refonte le champ était noyé dans une grille à 2 colonnes et
                  les utilisateurs l'oubliaient régulièrement. */}
              <div
                className="space-y-2 rounded-md border-2 p-3"
                style={{ borderColor: GOLD, backgroundColor: '#FFFDF5' }}
              >
                <Label htmlFor="date_trajet" className="text-sm font-semibold" style={{ color: NAVY }}>
                  📅 Date du trajet <span className="text-red-600">*</span>
                </Label>
                <Input
                  id="date_trajet"
                  type="date"
                  value={newTrajetDate || getDefaultTrajetDate(periode)}
                  onChange={e => setNewTrajetDate(e.target.value)}
                  required
                  max={todayISO()}
                  className="w-full text-base"
                />
                <p className="text-xs text-muted-foreground">
                  Date à laquelle le trajet a été effectué (mois courant : <strong>{periode}</strong>).
                </p>
                {newTrajetDate && !newTrajetDate.startsWith(periode) && (
                  <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1">
                    ⚠️ Cette date n&apos;appartient pas au mois sélectionné ({periode}). Le trajet sera enregistré sur la période <strong>{periode}</strong>.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Motif</Label>
                  <Input
                    value={newTrajetMotif}
                    onChange={e => setNewTrajetMotif(e.target.value)}
                    placeholder="Ex: Client X, formation, partenaire"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Départ (adresse)</Label>
                  <Input
                    value={newTrajetDepart}
                    onChange={e => setNewTrajetDepart(e.target.value)}
                    placeholder="Adresse de départ"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Arrivée (adresse)</Label>
                  <Input
                    value={newTrajetArrivee}
                    onChange={e => setNewTrajetArrivee(e.target.value)}
                    placeholder="Adresse d'arrivée"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Km</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={newTrajetKm}
                    onChange={e => setNewTrajetKm(e.target.value)}
                    placeholder="Ex: 35"
                    className="mt-1"
                  />
                </div>
                <div className="flex items-end md:col-span-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newTrajetAR}
                      onChange={e => setNewTrajetAR(e.target.checked)}
                    />
                    Aller-retour (× 2)
                  </label>
                </div>
              </div>

              {/* Widget calcul distance — pré-remplit km + adresses */}
              <CalculDistanceWidget
                onDistanceCalculated={(km, depart, arrivee) => {
                  setNewTrajetKm(km.toFixed(1))
                  if (depart) setNewTrajetDepart(depart)
                  if (arrivee) setNewTrajetArrivee(arrivee)
                }}
              />

              <Button
                onClick={addTrajet}
                disabled={addingTrajet || !newTrajetKm || !(newTrajetDate || getDefaultTrajetDate(periode))}
                style={{ backgroundColor: NAVY }}
                className="text-white w-full"
              >
                {addingTrajet ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-1" />}
                Ajouter le trajet
              </Button>
            </CardContent>
          </Card>

          {/* Liste des trajets existants */}
          <div className="mt-4">
            <h3 className="font-semibold text-sm mb-2" style={{ color: NAVY }}>
              Trajets enregistrés ({trajets.length})
            </h3>
            {loadingTrajets ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : trajets.length === 0 ? (
              <p className="text-center text-gray-400 py-6 text-sm">
                Aucun trajet pour ce mois.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Motif</TableHead>
                      <TableHead>Trajet</TableHead>
                      <TableHead className="text-right">Km</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trajets.map(tr => (
                      <TableRow key={tr.id}>
                        <TableCell className="text-sm whitespace-nowrap">{fmtDateFR(tr.date_trajet)}</TableCell>
                        <TableCell className="text-sm">{tr.motif || '—'}</TableCell>
                        <TableCell className="text-xs text-gray-600">
                          {tr.depart_adresse && tr.arrivee_adresse
                            ? `${tr.depart_adresse} → ${tr.arrivee_adresse}`
                            : (tr.depart_adresse || tr.arrivee_adresse || '—')}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(tr.km).toLocaleString('fr-FR')} km
                          {tr.aller_retour && <span className="text-xs text-gray-500 ml-1">(A/R)</span>}
                        </TableCell>
                        <TableCell>
                          <Badge className={TRAJET_STATUT_COLORS[tr.statut] || 'bg-gray-100 text-gray-700'}>
                            {tr.statut}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {tr.statut === 'en_attente' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-green-700 border-green-300 hover:bg-green-50"
                                  onClick={() => validateTrajet(tr.id, 'valide')}
                                  title="Valider"
                                >
                                  <CheckCircle className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-700 border-red-300 hover:bg-red-50"
                                  onClick={() => validateTrajet(tr.id, 'rejete')}
                                  title="Rejeter"
                                >
                                  <XCircle className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:bg-red-50"
                              onClick={() => deleteTrajet(tr.id)}
                              title="Supprimer"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </ClientPageShell>
  )
}
