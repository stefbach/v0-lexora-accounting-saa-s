"use client"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale, type Locale } from "@/lib/i18n"

interface Comptable {
  id: string
  full_name: string
  email: string
  role: string
}

interface Societe {
  id: string
  nom: string
  brn: string
}

interface Assignation {
  assignation_id: string
  comptable_id: string
  comptable_nom: string
  comptable_email: string
  societe_id: string
  societe_nom: string
  brn: string
  type_acces: string
  date_assignation: string
  nb_dossiers_en_cours: number
  docs_en_attente: number
}

export default function AdminComptablesPage() {
  const locale = getLocale()
  const [comptables, setComptables] = useState<Comptable[]>([])
  const [societes, setSocietes] = useState<Societe[]>([])
  const [assignations, setAssignations] = useState<Assignation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedComptable, setSelectedComptable] = useState("")
  const [selectedSociete, setSelectedSociete] = useState("")
  const [typeAcces, setTypeAcces] = useState("comptable")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)

  // Sprint 4 TÂCHE 5 — Edit type_comptable dialog state.
  // Lookup par user_id via PATCH /api/admin/comptables/profil (mig 137).
  const [typeEditOpen, setTypeEditOpen] = useState(false)
  const [typeEditUserId, setTypeEditUserId] = useState<string>("")
  const [typeEditName, setTypeEditName] = useState<string>("")
  const [typeValue, setTypeValue] = useState<'interne' | 'externe' | 'dedie'>('dedie')
  const [typeEmployeId, setTypeEmployeId] = useState<string>("")
  const [typeCabinet, setTypeCabinet] = useState<string>("")
  const [typeNotes, setTypeNotes] = useState<string>("")
  const [typeSaving, setTypeSaving] = useState(false)
  const [typeLoading, setTypeLoading] = useState(false)
  const [typeError, setTypeError] = useState<string | null>(null)
  // Liste d'employés pour le dropdown « employé interne ». Chargée à
  // l'ouverture du dialog — multi-société donc on prend tous les
  // employés accessibles.
  const [allEmployes, setAllEmployes] = useState<Array<{ id: string; nom: string; prenom: string; societe_id: string }>>([])

  const load = async () => {
    setLoading(true)
    const [cp, soc, asgn] = await Promise.all([
      fetch("/api/admin/users").then(r => r.json()),
      fetch("/api/comptable/societes").then(r => r.json()),
      fetch("/api/admin/comptables/assignations").then(r => r.json())
    ])
    setComptables((cp.users || []).filter((u: Comptable) => ['comptable','comptable_dedie'].includes(u.role)))
    setSocietes(soc.societes || [])
    setAssignations(asgn.assignations || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const assigner = async () => {
    if (!selectedComptable || !selectedSociete) return
    setSaving(true)
    await fetch("/api/admin/comptables/assignations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comptable_id: selectedComptable, societe_id: selectedSociete, type_acces: typeAcces, notes })
    })
    setOpen(false)
    setSelectedComptable("")
    setSelectedSociete("")
    setNotes("")
    setSaving(false)
    load()
  }

  // Sprint 4 TÂCHE 5 — ouvre le dialog d'édition du type de comptable.
  // Charge (lazy) le profil existant + la liste d'employés.
  const openTypeEdit = async (userId: string, name: string) => {
    setTypeEditUserId(userId)
    setTypeEditName(name)
    setTypeValue('dedie')
    setTypeEmployeId('')
    setTypeCabinet('')
    setTypeNotes('')
    setTypeError(null)
    setTypeEditOpen(true)
    setTypeLoading(true)
    try {
      // Fetch profil existant (peut ne pas exister → on crée à la sauvegarde)
      const [profilRes, empsRes] = await Promise.all([
        fetch(`/api/admin/comptables/profil?user_id=${userId}`).then(r => r.json()).catch(() => ({})),
        fetch(`/api/rh/employes`).then(r => r.json()).catch(() => ({ employes: [] })),
      ])
      const prof = profilRes?.comptable
      if (prof) {
        if (prof.type_comptable === 'interne' || prof.type_comptable === 'externe' || prof.type_comptable === 'dedie') {
          setTypeValue(prof.type_comptable)
        }
        setTypeEmployeId(prof.employe_id || '')
        setTypeCabinet(prof.societe_cabinet || '')
        setTypeNotes(prof.notes || '')
      }
      setAllEmployes(empsRes.employes || [])
    } catch (e: any) {
      setTypeError(`${t('adm.cabs.partial_load', locale)} : ${e?.message || t('adm.cabs.network_err', locale)}`)
    } finally {
      setTypeLoading(false)
    }
  }

  const saveTypeComptable = async () => {
    setTypeSaving(true)
    setTypeError(null)
    try {
      const body: Record<string, any> = {
        user_id: typeEditUserId,
        type_comptable: typeValue,
        employe_id: typeValue === 'interne' ? (typeEmployeId || null) : null,
        societe_cabinet: typeValue === 'externe' ? (typeCabinet || null) : null,
        notes: typeNotes || null,
      }
      const res = await fetch('/api/admin/comptables/profil', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) {
        setTypeError(data.error || `Erreur ${res.status}`)
        return
      }
      setTypeEditOpen(false)
      // Pas de reload complet — les infos type ne sont pas affichées dans
      // la carte pour l'instant. L'admin peut ouvrir à nouveau pour voir
      // le nouveau type (il sera récupéré via profilRes).
    } catch (e: any) {
      setTypeError(e?.message || t('adm.cabs.network_err', locale))
    } finally {
      setTypeSaving(false)
    }
  }

  const retirer = async (comptable_id: string, societe_id: string) => {
    await fetch("/api/admin/comptables/assignations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comptable_id, societe_id })
    })
    load()
  }

  const badgeAcces = (type: string) => {
    if (type === 'comptable_dedie') return <Badge className="bg-purple-100 text-purple-800">{t('adm.cabs.badge_dedicated', locale)}</Badge>
    if (type === 'lecture') return <Badge variant="outline">{t('adm.cabs.badge_read', locale)}</Badge>
    return <Badge className="bg-blue-100 text-blue-800">{t('adm.cabs.badge_comptable', locale)}</Badge>
  }

  // Stats globales
  const nbComptablesActifs = new Set(assignations.map(a => a.comptable_id)).size
  const nbSocietesAvecComptable = new Set(assignations.map(a => a.societe_id)).size
  const nbSocietésSansComptable = societes.length - nbSocietesAvecComptable
  const totalDocsEnAttente = assignations.reduce((s, a) => s + (a.docs_en_attente || 0), 0)

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0B0F2E]">{t('adm.cabs.title', locale)}</h1>
          <p className="text-sm text-gray-500">{t('adm.cabs.subtitle', locale)}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[#0B0F2E]">{t('adm.cabs.assign_btn', locale)}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('adm.cabs.assign_dialog_title', locale)}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>{t('adm.cabs.comptable', locale)}</Label>
                <Select value={selectedComptable} onValueChange={setSelectedComptable}>
                  <SelectTrigger><SelectValue placeholder={t('adm.cabs.select_comptable', locale)} /></SelectTrigger>
                  <SelectContent>
                    {comptables.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.full_name} — {c.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('adm.cabs.societe', locale)}</Label>
                <Select value={selectedSociete} onValueChange={setSelectedSociete}>
                  <SelectTrigger><SelectValue placeholder={t('adm.cabs.select_societe', locale)} /></SelectTrigger>
                  <SelectContent>
                    {societes.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.nom} {s.brn ? `— ${s.brn}` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('adm.cabs.access_type', locale)}</Label>
                <Select value={typeAcces} onValueChange={setTypeAcces}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comptable">{t('adm.cabs.access_full', locale)}</SelectItem>
                    <SelectItem value="comptable_dedie">{t('adm.cabs.access_dedicated', locale)}</SelectItem>
                    <SelectItem value="lecture">{t('adm.cabs.access_read', locale)}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('adm.cabs.notes_optional', locale)}</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('adm.cabs.notes_placeholder', locale)} />
              </div>
              <Button onClick={assigner} disabled={saving || !selectedComptable || !selectedSociete} className="w-full bg-[#0B0F2E]">
                {saving ? t('adm.cabs.saving', locale) : t('adm.cabs.confirm_assign', locale)}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: t('adm.cabs.stat_active', locale), value: nbComptablesActifs, color: "text-blue-600" },
          { label: t('adm.cabs.stat_with', locale), value: nbSocietesAvecComptable, color: "text-green-600" },
          { label: t('adm.cabs.stat_without', locale), value: nbSocietésSansComptable, color: nbSocietésSansComptable > 0 ? "text-red-600" : "text-green-600" },
          { label: t('adm.cabs.stat_pending_docs', locale), value: totalDocsEnAttente, color: totalDocsEnAttente > 0 ? "text-orange-600" : "text-green-600" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Par comptable */}
      {loading ? (
        <div className="text-center text-gray-400 py-8">{t('adm.cabs.loading', locale)}</div>
      ) : comptables.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-gray-400">{t('adm.cabs.none_invite', locale)}</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {comptables.map(c => {
            const mesAssignations = assignations.filter(a => a.comptable_id === c.id)
            return (
              <Card key={c.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>
                      👤 {c.full_name}
                      <span className="text-sm font-normal text-gray-500 ml-2">{c.email}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openTypeEdit(c.id, c.full_name)}
                        className="h-7 text-xs"
                        title={t('adm.cabs.type_tooltip', locale)}
                      >
                        {t('adm.cabs.type_btn', locale)}
                      </Button>
                      <Badge variant="outline">{mesAssignations.length} {mesAssignations.length !== 1 ? t('adm.cabs.societe_count_many', locale) : t('adm.cabs.societe_count_one', locale)}</Badge>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {mesAssignations.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">{t('adm.cabs.none_assigned', locale)}</p>
                  ) : (
                    <div className="space-y-2">
                      {mesAssignations.map(a => (
                        <div key={a.assignation_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-3">
                            {badgeAcces(a.type_acces)}
                            <span className="font-medium text-sm">{a.societe_nom}</span>
                            {a.brn && <span className="text-xs text-gray-400">{a.brn}</span>}
                            {a.docs_en_attente > 0 && (
                              <Badge className="bg-orange-100 text-orange-700 text-xs">{a.docs_en_attente} {a.docs_en_attente > 1 ? t('adm.cabs.docs_pending_many', locale) : t('adm.cabs.docs_pending_one', locale)}</Badge>
                            )}
                          </div>
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700"
                            onClick={() => retirer(a.comptable_id, a.societe_id)}>
                            {t('adm.cabs.remove', locale)}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Sprint 4 TÂCHE 5 — Dialog type_comptable (mig 137 + profil API) */}
      <Dialog open={typeEditOpen} onOpenChange={setTypeEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('adm.cabs.type_title', locale)} — {typeEditName}</DialogTitle>
          </DialogHeader>
          {typeLoading ? (
            <p className="text-sm text-gray-500 py-4 text-center">{t('adm.cabs.loading_dots', locale)}</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">{t('adm.cabs.type_label', locale)}</Label>

                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="type_comptable"
                    value="interne"
                    checked={typeValue === 'interne'}
                    onChange={() => setTypeValue('interne')}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{t('adm.cabs.type_internal', locale)}</div>
                    <div className="text-xs text-gray-500">
                      {t('adm.cabs.type_internal_desc', locale)}
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="type_comptable"
                    value="externe"
                    checked={typeValue === 'externe'}
                    onChange={() => setTypeValue('externe')}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{t('adm.cabs.type_external', locale)}</div>
                    <div className="text-xs text-gray-500">
                      {t('adm.cabs.type_external_desc', locale)}
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="type_comptable"
                    value="dedie"
                    checked={typeValue === 'dedie'}
                    onChange={() => setTypeValue('dedie')}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{t('adm.cabs.type_dedicated', locale)}</div>
                    <div className="text-xs text-gray-500">
                      {t('adm.cabs.type_dedicated_desc', locale)}
                    </div>
                  </div>
                </label>
              </div>

              {/* Conditional fields */}
              {typeValue === 'interne' && (
                <div>
                  <Label className="text-sm">{t('adm.cabs.linked_employee', locale)}</Label>
                  <Select value={typeEmployeId || 'none'} onValueChange={v => setTypeEmployeId(v === 'none' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder={t('adm.cabs.choose_employee', locale)} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('adm.cabs.not_linked', locale)}</SelectItem>
                      {allEmployes.map(e => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.prenom} {e.nom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1">
                    {t('adm.cabs.internal_hint', locale)}
                  </p>
                </div>
              )}

              {typeValue === 'externe' && (
                <div>
                  <Label className="text-sm">{t('adm.cabs.cabinet_name', locale)}</Label>
                  <Textarea
                    value={typeCabinet}
                    onChange={e => setTypeCabinet(e.target.value)}
                    placeholder={t('adm.cabs.cabinet_placeholder', locale)}
                    rows={2}
                  />
                </div>
              )}

              <div>
                <Label className="text-sm">{t('adm.cabs.notes_label', locale)}</Label>
                <Textarea
                  value={typeNotes}
                  onChange={e => setTypeNotes(e.target.value)}
                  placeholder={t('adm.cabs.notes_placeholder2', locale)}
                  rows={2}
                />
              </div>

              {typeError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
                  {typeError}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-3 border-t">
            <Button variant="outline" onClick={() => setTypeEditOpen(false)} disabled={typeSaving}>
              {t('adm.cabs.cancel', locale)}
            </Button>
            <Button
              onClick={saveTypeComptable}
              disabled={typeSaving || typeLoading}
              className="bg-[#0B0F2E] text-white"
            >
              {typeSaving ? t('adm.cabs.save_dots', locale) : t('adm.cabs.save', locale)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </ClientPageShell>
  )
}
