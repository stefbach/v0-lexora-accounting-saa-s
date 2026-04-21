"use client"
import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Calendar, CalendarPlus, CheckCircle, FileText, Upload, X } from "lucide-react"
import { NAVY, GOLD, BLUE, GREEN } from "../shared/constants"

const MAX_CERT_BYTES = 5 * 1024 * 1024 // 5 MB
const ACCEPTED_CERT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"]

// Extrait du monolithe page.tsx pendant le sprint-salarie V0.1.
// Iso-fonctionnel.
export function CongesTab({ employe, onRefresh }: { employe: any; onRefresh: () => void }) {
  const [balances, setBalances] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loadingH, setLoadingH] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState("")
  const [error, setError] = useState("")
  const [typeConge, setTypeConge] = useState("AL")
  const [dateDebut, setDateDebut] = useState("")
  const [dateFin, setDateFin] = useState("")
  const [motif, setMotif] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [demiJournee, setDemiJournee] = useState(false)
  const [matinOuApresMidi, setMatinOuApresMidi] = useState<'matin' | 'apres_midi'>('matin')
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const needsCertificat = typeConge === "SL" && dateDebut && dateFin && (() => {
    const d1 = new Date(dateDebut), d2 = new Date(dateFin)
    return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1 > 3
  })()

  const DEMI_JOURNEE_ALLOWED = new Set(['AL', 'SL', 'SANS_SOLDE'])

  const refreshData = async () => {
    const [balRes, histRes] = await Promise.all([
      fetch(`/api/rh/conges?action=balances&employe_id=${employe.id}`).then(r => r.json()).catch(() => ({})),
      fetch(`/api/rh/conges?employe_id=${employe.id}`).then(r => r.json()).catch(() => ({ conges: [] })),
    ])
    // F5-bis — sélection défensive par employe_id. Avant le fix API qui
    // filtre server-side, balances[] pouvait contenir plusieurs employés
    // et balances[0] était le mauvais. On garde .find() en plus du filtre
    // server comme ceinture + bretelles.
    const mine = Array.isArray(balRes.balances)
      ? balRes.balances.find((b: any) => b.employe_id === employe.id)
      : null
    setBalances(mine || balRes.balances?.[0] || null)
    setHistory(histRes.conges || histRes.demandes || [])
  }

  useEffect(() => {
    const load = async () => {
      setLoadingH(true)
      try { await refreshData() } catch {}
      setLoadingH(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employe.id])

  const handleSubmit = async () => {
    if (!dateDebut) { setError("Veuillez renseigner la date"); return }
    const effectiveDateFin = demiJournee ? dateDebut : dateFin
    if (!effectiveDateFin) { setError("Veuillez renseigner la date de fin"); return }
    if (!demiJournee && dateFin < dateDebut) { setError("La date de fin doit être après la date de début"); return }
    if (demiJournee && !DEMI_JOURNEE_ALLOWED.has(typeConge)) {
      setError("Les demi-journées ne sont pas autorisées pour ce type de congé")
      return
    }
    if (needsCertificat && !file) {
      setError("Certificat médical obligatoire pour une demande SL > 3 jours")
      return
    }
    if (file && !ACCEPTED_CERT_TYPES.includes(file.type)) {
      setError("Format de certificat non supporté : PDF, JPG, PNG ou WebP uniquement")
      return
    }
    if (file && file.size > MAX_CERT_BYTES) {
      setError("Certificat trop volumineux (5 Mo maximum)")
      return
    }
    setSubmitting(true); setError(""); setSuccess("")
    try {
      // 1) Créer la demande (JSON comme avant).
      const res = await fetch("/api/rh/conges", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "creer",
          employe_id: employe.id,
          type_conge: typeConge,
          date_debut: dateDebut,
          date_fin: effectiveDateFin,
          motif,
          demi_journee: demiJournee,
          matin_ou_apres_midi: demiJournee ? matinOuApresMidi : null,
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); setSubmitting(false); return }

      // 2) V2.1 — si un certificat est attaché, l'uploader via un POST
      // multipart vers l'endpoint dédié. TODO(RH agent) — l'endpoint
      // POST /api/rh/conges/:id/certificat est livré par la branche
      // fix/sprint-rh-securite ce week-end. En attendant, on tolère
      // un 404 avec un message d'avertissement pour ne pas bloquer la
      // création de la demande.
      const createdId = data.conge?.id || data.id || data.demande?.id
      if (file && createdId) {
        const form = new FormData()
        form.append("certificat", file)
        try {
          const certRes = await fetch(`/api/rh/conges/${createdId}/certificat`, {
            method: "POST",
            body: form,
          })
          if (!certRes.ok) {
            if (certRes.status === 404) {
              toast.warning("Certificat non transmis", {
                description: "L'endpoint d'upload est en cours de déploiement. Transmettez votre certificat au RH en parallèle.",
              })
            } else {
              const err = await certRes.json().catch(() => ({}))
              toast.error("Erreur upload certificat", { description: err.error || `HTTP ${certRes.status}` })
            }
          } else {
            toast.success("Certificat médical transmis")
          }
        } catch {
          toast.warning("Certificat non transmis (réseau)")
        }
      }

      setSuccess(demiJournee ? "Demi-journée soumise avec succès" : "Demande soumise avec succès")
      setDateDebut(""); setDateFin(""); setMotif(""); setFile(null)
      setDemiJournee(false); setMatinOuApresMidi('matin')
      await refreshData()
      onRefresh()
      setTimeout(() => setSuccess(""), 4000)
    } catch { setError("Erreur réseau") }
    setSubmitting(false)
  }

  const cancelDemande = async (id: string) => {
    if (!window.confirm("Annuler cette demande de congé en attente ?")) return
    setCancellingId(id)
    setError(""); setSuccess("")
    try {
      const res = await fetch("/api/rh/conges", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "annuler", id }),
      })
      const data = await res.json()
      if (!res.ok || data.error) setError(data.error || `Erreur HTTP ${res.status}`)
      else {
        setSuccess("Demande annulée")
        await refreshData()
        onRefresh()
        setTimeout(() => setSuccess(""), 3000)
      }
    } catch { setError("Erreur réseau") }
    setCancellingId(null)
  }

  // F5 — Source de vérité = API /api/rh/conges?action=balances qui lit
  // soldes_conges. Plus de fallback silencieux `|| 22` / `|| 15` : si la
  // row n'existe pas, on affiche un état d'erreur explicite plus bas.
  const soldesMissing = !balances
    || balances._missing_solde === true
    || balances.al_droit == null
    || balances.al_pris == null
    || balances.al_solde == null
    || balances.sl_droit == null
    || balances.sl_pris == null
    || balances.sl_solde == null

  const alDroit = soldesMissing ? 0 : Number(balances.al_droit)
  const slDroit = soldesMissing ? 0 : Number(balances.sl_droit)
  const alPris = soldesMissing ? 0 : Number(balances.al_pris)
  const alImposeSociete = soldesMissing ? 0 : Number(balances.al_impose_societe ?? 0)
  const alImposeEmploye = soldesMissing
    ? 0
    : (balances.al_impose_employe != null
        ? Number(balances.al_impose_employe)
        : Math.max(0, alPris - alImposeSociete))
  const alRemaining = soldesMissing ? 0 : Number(balances.al_solde)
  const slRemaining = soldesMissing ? 0 : Number(balances.sl_solde)
  const alPct = alDroit > 0 ? Math.round((alRemaining / alDroit) * 100) : 0
  const slPct = slDroit > 0 ? Math.round((slRemaining / slDroit) * 100) : 0

  const statutBadge = (s: string) => {
    if (s === "approuve" || s === "approved") return <Badge style={{ backgroundColor: `${GREEN}20`, color: GREEN }}>Approuvé</Badge>
    if (s === "refuse" || s === "rejected") return <Badge style={{ backgroundColor: "#ef444420", color: "#ef4444" }}>Refusé</Badge>
    return <Badge style={{ backgroundColor: "#f9731620", color: "#f97316" }}>En attente</Badge>
  }

  const typeLabel: Record<string, string> = { AL: "Local Leave", SL: "Sick Leave", MAT: "Maternity Leave", PAT: "Paternity Leave", SANS_SOLDE: "Leave Without Pay" }
  const typeColor: Record<string, string> = { AL: GREEN, SL: "#f97316", MAT: "#8b5cf6", PAT: BLUE, SANS_SOLDE: "#6b7280" }

  return (
    <div className="space-y-6">
      {soldesMissing ? (
        // F5 — État d'erreur explicite. Pas de défauts silencieux (22/15).
        <Card className="rounded-xl shadow-sm border-red-200 bg-red-50">
          <CardContent className="p-4 text-sm text-red-700">
            Impossible de charger vos soldes de congés. Contactez votre RH.
          </CardContent>
        </Card>
      ) : (
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${GREEN}15` }}>
                <Calendar className="h-5 w-5" style={{ color: GREEN }} />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: NAVY }}>{alRemaining}<span className="text-sm font-normal text-gray-400">j</span></p>
              <p className="text-xs text-gray-500 mt-0.5">Local Leave restants / {alDroit}j</p>
            </div>
            <Progress value={alPct} className="h-2 rounded-full" style={{ backgroundColor: `${GREEN}20` }} />
            {(alImposeSociete > 0 || alPris > 0) && (
              <div className="flex items-center justify-between text-[10px] text-gray-500 pt-1 border-t border-gray-100">
                <span>Pris: <strong className="text-gray-700">{alPris}j</strong></span>
                <span>· Moi: <strong className="text-gray-700">{alImposeEmploye}j</strong></span>
                {alImposeSociete > 0 && (
                  <span>· <span className="text-amber-700">Imposé: <strong>{alImposeSociete}j</strong></span></span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#f9731615" }}>
                <Calendar className="h-5 w-5 text-orange-500" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: NAVY }}>{slRemaining}<span className="text-sm font-normal text-gray-400">j</span></p>
              <p className="text-xs text-gray-500 mt-0.5">Sick Leave restants / {slDroit}j</p>
            </div>
            <Progress value={slPct} className="h-2 rounded-full" style={{ backgroundColor: "#f9731620" }} />
          </CardContent>
        </Card>
      </div>
      )}

      <Card className="rounded-xl shadow-sm">
        <CardHeader><CardTitle className="text-xl md:text-base" style={{ color: NAVY }}>Nouvelle demande</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {success && <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700"><CheckCircle className="h-4 w-4" />{success}</div>}
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

          <div>
            <Label className="text-sm font-medium mb-2 block">Type de conge</Label>
            <div className="flex flex-wrap gap-2">
              {([
                { value: "AL", label: "Local Leave", color: GREEN },
                { value: "SL", label: "Sick Leave", color: "#f97316" },
                { value: "MAT", label: "Maternity", color: "#8b5cf6" },
                { value: "PAT", label: "Paternity", color: BLUE },
                { value: "SANS_SOLDE", label: "Sans solde", color: "#6b7280" },
              ]).map(opt => (
                <button key={opt.value} onClick={() => setTypeConge(opt.value)}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.97]"
                  style={typeConge === opt.value
                    ? { backgroundColor: opt.color, color: "white" }
                    : { backgroundColor: `${opt.color}10`, color: opt.color, border: `1px solid ${opt.color}30` }
                  }>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {DEMI_JOURNEE_ALLOWED.has(typeConge) && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium" style={{ color: NAVY }}>
                <input
                  type="checkbox"
                  checked={demiJournee}
                  onChange={e => {
                    setDemiJournee(e.target.checked)
                    if (e.target.checked && dateDebut) setDateFin(dateDebut)
                  }}
                  className="h-4 w-4 rounded"
                />
                Demi-journée (0,5 jour)
              </label>
              {demiJournee && (
                <div className="pl-6 flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="demi-moment"
                      value="matin"
                      checked={matinOuApresMidi === 'matin'}
                      onChange={() => setMatinOuApresMidi('matin')}
                    />
                    Matin (AM)
                  </label>
                  <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="demi-moment"
                      value="apres_midi"
                      checked={matinOuApresMidi === 'apres_midi'}
                      onChange={() => setMatinOuApresMidi('apres_midi')}
                    />
                    Après-midi (PM)
                  </label>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Date debut</Label>
              <Input
                type="date"
                value={dateDebut}
                onChange={e => {
                  setDateDebut(e.target.value)
                  if (demiJournee) setDateFin(e.target.value)
                }}
                className="h-12 md:h-10 rounded-xl"
              />
            </div>
            <div>
              <Label>Date fin {demiJournee && <span className="text-[10px] text-gray-400">(même date que début)</span>}</Label>
              <Input
                type="date"
                value={demiJournee ? dateDebut : dateFin}
                disabled={demiJournee}
                onChange={e => setDateFin(e.target.value)}
                className="h-12 md:h-10 rounded-xl"
              />
            </div>
          </div>

          <div>
            <Label>Motif (optionnel)</Label>
            <Textarea value={motif} onChange={e => setMotif(e.target.value)} placeholder="Raison de la demande..." rows={3} className="rounded-xl" />
          </div>

          {needsCertificat && (
            <div>
              <Label>Certificat médical (PDF/image)</Label>
              <div
                className={`mt-1 border-2 border-dashed rounded-lg p-6 text-center transition-colors ${dragOver ? "border-blue-400 bg-blue-50" : "border-gray-300"}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) setFile(f) }}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="h-5 w-5 text-gray-500" />
                    <span className="text-sm">{file.name}</span>
                    <button onClick={() => setFile(null)} className="text-red-400 hover:text-red-600"><X className="h-4 w-4" /></button>
                  </div>
                ) : (
                  <div>
                    <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500">Glissez-déposez ou <label className="text-blue-600 cursor-pointer hover:underline">parcourir<input type="file" className="hidden" accept=".pdf,image/*" onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]) }} /></label></p>
                  </div>
                )}
              </div>
            </div>
          )}

          <Button onClick={handleSubmit} disabled={submitting} style={{ backgroundColor: NAVY }} className="w-full md:w-auto h-12 md:h-10 rounded-xl text-white text-base md:text-sm transition-all duration-200 active:scale-[0.98]">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CalendarPlus className="h-4 w-4 mr-2" />}
            Soumettre la demande
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-xl shadow-sm">
        <CardHeader><CardTitle className="text-xl md:text-base" style={{ color: NAVY }}>Historique</CardTitle></CardHeader>
        <CardContent>
          {loadingH ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : history.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Aucune demande de conge</p>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 pr-3">Type</th>
                      <th className="pb-2 pr-3">Dates</th>
                      <th className="pb-2 pr-3">Jours</th>
                      <th className="pb-2 pr-3">Statut</th>
                      <th className="pb-2 pr-3">Motif</th>
                      <th className="pb-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((c: any, i: number) => {
                      const t = c.type_conge || "AL"
                      const d1 = c.date_debut ? new Date(c.date_debut).toLocaleDateString("fr-FR") : "—"
                      const d2 = c.date_fin ? new Date(c.date_fin).toLocaleDateString("fr-FR") : "—"
                      const days = Number(c.nb_jours) || "—"
                      const isMine = !c.employe_id || c.employe_id === employe.id
                      const canCancel = isMine && c.statut === "en_attente"
                      return (
                        <tr key={c.id || i} className="border-b last:border-0">
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center gap-1 flex-wrap">
                              <Badge style={{ backgroundColor: `${typeColor[t] || BLUE}20`, color: typeColor[t] || BLUE }}>{typeLabel[t] || t}</Badge>
                              {c.demi_journee && (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                                  {c.matin_ou_apres_midi === 'apres_midi' ? '½ PM' : '½ AM'}
                                </span>
                              )}
                              {c.impose_par_societe && (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200" title="Imposé par la société">
                                  Imposé
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 pr-3 whitespace-nowrap">
                            {c.demi_journee ? d1 : <>{d1} — {d2}</>}
                          </td>
                          <td className="py-2.5 pr-3 font-mono">{days}</td>
                          <td className="py-2.5 pr-3">{statutBadge(c.statut || c.status || "en_attente")}</td>
                          <td className="py-2.5 pr-3 text-gray-500 truncate max-w-[200px]">{c.motif || "—"}</td>
                          <td className="py-2.5 text-right">
                            {canCancel && (
                              <button
                                onClick={() => cancelDemande(c.id)}
                                disabled={cancellingId === c.id}
                                className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded disabled:opacity-50"
                              >
                                {cancellingId === c.id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <X className="h-3 w-3" />}
                                Annuler
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden space-y-3">
                {history.map((c: any, i: number) => {
                  const t = c.type_conge || "AL"
                  const d1 = c.date_debut ? new Date(c.date_debut).toLocaleDateString("fr-FR") : "—"
                  const d2 = c.date_fin ? new Date(c.date_fin).toLocaleDateString("fr-FR") : "—"
                  const days = c.nb_jours || (c.date_debut && c.date_fin ? Math.ceil((new Date(c.date_fin).getTime() - new Date(c.date_debut).getTime()) / (1000 * 60 * 60 * 24)) + 1 : "—")
                  const isMine = !c.employe_id || c.employe_id === employe.id
                  const canCancel = isMine && c.statut === "en_attente"
                  return (
                    <div key={c.id || i} className="p-4 border rounded-xl space-y-2 transition-all duration-200" style={{ borderLeft: `3px solid ${typeColor[t] || BLUE}` }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 flex-wrap">
                          <Badge className="text-xs" style={{ backgroundColor: `${typeColor[t] || BLUE}20`, color: typeColor[t] || BLUE }}>{typeLabel[t] || t}</Badge>
                          {c.demi_journee && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-800">
                              {c.matin_ou_apres_midi === 'apres_midi' ? '½ PM' : '½ AM'}
                            </span>
                          )}
                          {c.impose_par_societe && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">Imposé</span>
                          )}
                        </div>
                        {statutBadge(c.statut || c.status || "en_attente")}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span style={{ color: NAVY }}>{c.demi_journee ? d1 : <>{d1} — {d2}</>}</span>
                        <span className="font-mono text-xs text-gray-400">({days}j)</span>
                      </div>
                      {c.motif && <p className="text-xs text-gray-500">{c.motif}</p>}
                      {canCancel && (
                        <button
                          onClick={() => cancelDemande(c.id)}
                          disabled={cancellingId === c.id}
                          className="mt-1 inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded disabled:opacity-50"
                        >
                          {cancellingId === c.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <X className="h-3 w-3" />}
                          Annuler
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
