"use client"
import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { notifySuccess } from "@/lib/utils/toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Navigation, Play, Square } from "lucide-react"
import { t, getLocale } from "@/lib/i18n"

// Extrait du monolithe page.tsx pendant le sprint-salarie V0.1.
// Iso-fonctionnel.
export function TrajetsTab({ employe }: { employe: any }) {
  const locale = getLocale()
  const [trajets, setTrajets] = useState<any[]>([])
  const [trajetEnCours, setTrajetEnCours] = useState<any>(null)
  const [loadingT, setLoadingT] = useState(true)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [motif, setMotif] = useState("")
  const [vehicule, setVehicule] = useState("voiture")

  const loadTrajets = useCallback(() => {
    setLoadingT(true)
    fetch(`/api/rh/trajets-km?employe_id=${employe.id}`)
      .then(r => r.json())
      .then(d => {
        const all = d.trajets || []
        setTrajets(all)
        setTrajetEnCours(all.find((t: any) => t.statut === "en_cours") || null)
      })
      .catch(() => {})
      .finally(() => setLoadingT(false))
  }, [employe.id])

  useEffect(() => { loadTrajets() }, [loadTrajets])

  const getPosition = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error(t('sal.trajets.gps_unsupported', locale))); return }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        err => reject(err),
        { enableHighAccuracy: true, timeout: 15000 }
      )
    })
  }

  const demarrerTrajet = async () => {
    setGpsLoading(true)
    try {
      let pos: { lat: number; lng: number }
      try {
        pos = await getPosition()
      } catch (gpsErr: any) {
        toast.error(t('sal.trajets.gps_unavailable', locale), { description: gpsErr.message || t('sal.trajets.gps_denied', locale) })
        return
      }
      const res = await fetch("/api/rh/trajets-km", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "demarrer", employe_id: employe.id, societe_id: employe.societe_id, latitude: pos.lat, longitude: pos.lng, motif: motif || t('sal.trajets.default_motif', locale), vehicule }),
      })
      const text = await res.text()
      let data: any
      try { data = JSON.parse(text) } catch { toast.error(t('sal.trajets.server_error', locale), { description: text.slice(0, 200) }); return }
      if (!res.ok) { toast.error(`${t('sal.trajets.error_status', locale)} ${res.status}`, { description: data.error || data.message || t('sal.trajets.start_failed', locale) }); return }
      setTrajetEnCours(data.trajet)
      notifySuccess(t('sal.trajets.started', locale))
      loadTrajets()
    } catch (e: any) { toast.error(t('sal.trajets.error', locale), { description: e.message || String(e) }) }
    finally { setGpsLoading(false) }
  }

  const ajouterCheckpoint = async () => {
    if (!trajetEnCours) return
    setGpsLoading(true)
    try {
      const pos = await getPosition()
      const res = await fetch("/api/rh/trajets-km", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "checkpoint", trajet_id: trajetEnCours.id, latitude: pos.lat, longitude: pos.lng }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(t('sal.trajets.error', locale), { description: data.error || t('sal.trajets.checkpoint_failed', locale) }); return }
      setTrajetEnCours((prev: any) => ({ ...prev, distance_totale_km: data.trajet?.distance_totale_km || prev?.distance_totale_km }))
      notifySuccess(t('sal.trajets.checkpoint_added', locale))
    } catch (e: any) { toast.error(t('sal.trajets.gps_error', locale), { description: e.message }) }
    finally { setGpsLoading(false) }
  }

  const terminerTrajet = async () => {
    if (!trajetEnCours) return
    setGpsLoading(true)
    try {
      const pos = await getPosition()
      const res = await fetch("/api/rh/trajets-km", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "terminer", trajet_id: trajetEnCours.id, latitude: pos.lat, longitude: pos.lng }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(t('sal.trajets.error', locale), { description: data.error || t('sal.trajets.finish_failed', locale) }); return }
      setTrajetEnCours(null)
      notifySuccess(t('sal.trajets.finished', locale))
      loadTrajets()
    } catch (e: any) { toast.error(t('sal.trajets.gps_error', locale), { description: e.message }) }
    finally { setGpsLoading(false) }
  }

  const totalKm = trajets.filter((t: any) => t.statut !== "rejete").reduce((s: number, t: any) => s + (Number(t.distance_totale_km) || 0), 0)
  const totalIndemnite = trajets.filter((t: any) => t.statut === "valide").reduce((s: number, t: any) => s + (Number(t.montant_indemnite) || 0), 0)

  return (
    <div className="space-y-4">
      {trajetEnCours ? (
        <Card className="rounded-2xl shadow-sm" style={{ borderLeft: "4px solid #D4AF37" }}>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
              <p className="font-semibold" style={{ color: "#0B0F2E" }}>{t('sal.trajets.in_progress', locale)}</p>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="p-3 rounded-xl bg-gray-50 text-center">
                <p className="text-2xl font-bold" style={{ color: "#D4AF37" }}>{Number(trajetEnCours.distance_totale_km || 0).toFixed(1)}</p>
                <p className="text-xs text-gray-500">{t('sal.trajets.km_traveled', locale)}</p>
              </div>
              <div className="p-3 rounded-xl bg-gray-50 text-center">
                <p className="text-2xl font-bold" style={{ color: "#4191FF" }}>{trajetEnCours.vehicule || "voiture"}</p>
                <p className="text-xs text-gray-500">{t('sal.trajets.vehicle_label', locale)}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={ajouterCheckpoint} disabled={gpsLoading} className="flex-1 h-12 rounded-xl" style={{ backgroundColor: "#4191FF", color: "white" }}>
                {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Navigation className="w-4 h-4 mr-2" />}
                {t('sal.trajets.checkpoint', locale)}
              </Button>
              <Button onClick={terminerTrajet} disabled={gpsLoading} className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white">
                {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Square className="w-4 h-4 mr-2" />}
                {t('sal.trajets.finish', locale)}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-5">
            <p className="font-semibold mb-3" style={{ color: "#0B0F2E" }}>{t('sal.trajets.new_trip', locale)}</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-500">{t('sal.trajets.vehicle', locale)}</label>
                <select value={vehicule} onChange={e => setVehicule(e.target.value)} className="w-full h-11 rounded-xl border px-3 text-sm">
                  <option value="voiture">{t('sal.trajets.vehicle_car', locale)}</option>
                  <option value="moto">{t('sal.trajets.vehicle_motorcycle', locale)}</option>
                  <option value="velo">{t('sal.trajets.vehicle_bike', locale)}</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">{t('sal.trajets.reason', locale)}</label>
                <input value={motif} onChange={e => setMotif(e.target.value)} placeholder={t('sal.trajets.reason_placeholder', locale)} className="w-full h-11 rounded-xl border px-3 text-sm" />
              </div>
            </div>
            <Button onClick={demarrerTrajet} disabled={gpsLoading} className="w-full h-12 rounded-xl" style={{ backgroundColor: "#2ECC8A", color: "white" }}>
              {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
              {t('sal.trajets.start_trip', locale)}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl text-center" style={{ backgroundColor: "#D4AF3710" }}>
          <p className="text-2xl font-bold" style={{ color: "#D4AF37" }}>{totalKm.toFixed(1)} km</p>
          <p className="text-xs text-gray-500">{t('sal.trajets.total_this_month', locale)}</p>
        </div>
        <div className="p-4 rounded-2xl text-center" style={{ backgroundColor: "#2ECC8A10" }}>
          <p className="text-2xl font-bold" style={{ color: "#2ECC8A" }}>{new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(totalIndemnite)} MUR</p>
          <p className="text-xs text-gray-500">{t('sal.trajets.approved_allowances', locale)}</p>
        </div>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base" style={{ color: "#0B0F2E" }}>{t('sal.trajets.history', locale)}</CardTitle></CardHeader>
        <CardContent>
          {loadingT ? <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin" /></div> :
          trajets.filter((t: any) => t.statut !== "en_cours").length === 0 ? <p className="text-gray-400 text-center py-6 text-sm">{t('sal.trajets.empty', locale)}</p> : (
            <div className="space-y-2">
              {trajets.filter((tr: any) => tr.statut !== "en_cours").map((tr: any) => {
                const motifRejet = tr.motif_rejet || tr.raison_rejet || tr.commentaire_rh || null
                return (
                  <div key={tr.id} className="flex flex-col gap-2 p-3 rounded-xl border" style={{ borderLeft: `3px solid ${tr.statut === "valide" ? "#2ECC8A" : tr.statut === "rejete" ? "#dc2626" : "#D4AF37"}` }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>{new Date(tr.date_trajet).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} — {tr.vehicule}</p>
                        <p className="text-xs text-gray-400">{tr.motif || "—"}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-sm">{Number(tr.distance_totale_km || 0).toFixed(1)} km</p>
                        <Badge className={`text-[10px] ${tr.statut === "valide" ? "bg-green-100 text-green-700" : tr.statut === "rejete" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {tr.statut === "valide" ? t('sal.trajets.status_approved', locale) : tr.statut === "rejete" ? t('sal.trajets.status_rejected', locale) : t('sal.trajets.status_pending', locale)}
                        </Badge>
                      </div>
                    </div>
                    {tr.statut === "rejete" && motifRejet && (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                        <span className="font-semibold">{t('sal.trajets.rejection_reason', locale)}</span> {motifRejet}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
