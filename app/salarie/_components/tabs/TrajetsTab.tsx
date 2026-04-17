"use client"
import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Navigation, Play, Square } from "lucide-react"

// Extrait du monolithe page.tsx pendant le sprint-salarie V0.1.
// Iso-fonctionnel.
export function TrajetsTab({ employe }: { employe: any }) {
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
      if (!navigator.geolocation) { reject(new Error("Géolocalisation non supportée")); return }
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
        toast.error("GPS indisponible", { description: gpsErr.message || "Géolocalisation refusée. Autorisez-la dans les paramètres du navigateur." })
        return
      }
      const res = await fetch("/api/rh/trajets-km", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "demarrer", employe_id: employe.id, societe_id: employe.societe_id, latitude: pos.lat, longitude: pos.lng, motif: motif || "Déplacement", vehicule }),
      })
      const text = await res.text()
      let data: any
      try { data = JSON.parse(text) } catch { toast.error("Erreur serveur", { description: text.slice(0, 200) }); return }
      if (!res.ok) { toast.error(`Erreur ${res.status}`, { description: data.error || data.message || "Impossible de démarrer le trajet" }); return }
      setTrajetEnCours(data.trajet)
      toast.success("Trajet démarré")
      loadTrajets()
    } catch (e: any) { toast.error("Erreur", { description: e.message || String(e) }) }
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
      if (!res.ok) { toast.error("Erreur", { description: data.error || "Impossible d'ajouter le checkpoint" }); return }
      setTrajetEnCours((prev: any) => ({ ...prev, distance_totale_km: data.trajet?.distance_totale_km || prev?.distance_totale_km }))
      toast.success("Checkpoint ajouté")
    } catch (e: any) { toast.error("Erreur GPS", { description: e.message }) }
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
      if (!res.ok) { toast.error("Erreur", { description: data.error || "Impossible de terminer le trajet" }); return }
      setTrajetEnCours(null)
      toast.success("Trajet terminé")
      loadTrajets()
    } catch (e: any) { toast.error("Erreur GPS", { description: e.message }) }
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
              <p className="font-semibold" style={{ color: "#0B0F2E" }}>Trajet en cours</p>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="p-3 rounded-xl bg-gray-50 text-center">
                <p className="text-2xl font-bold" style={{ color: "#D4AF37" }}>{Number(trajetEnCours.distance_totale_km || 0).toFixed(1)}</p>
                <p className="text-xs text-gray-500">km parcourus</p>
              </div>
              <div className="p-3 rounded-xl bg-gray-50 text-center">
                <p className="text-2xl font-bold" style={{ color: "#4191FF" }}>{trajetEnCours.vehicule || "voiture"}</p>
                <p className="text-xs text-gray-500">véhicule</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={ajouterCheckpoint} disabled={gpsLoading} className="flex-1 h-12 rounded-xl" style={{ backgroundColor: "#4191FF", color: "white" }}>
                {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Navigation className="w-4 h-4 mr-2" />}
                Checkpoint
              </Button>
              <Button onClick={terminerTrajet} disabled={gpsLoading} className="flex-1 h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white">
                {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Square className="w-4 h-4 mr-2" />}
                Terminer
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-5">
            <p className="font-semibold mb-3" style={{ color: "#0B0F2E" }}>Nouveau trajet</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-500">Véhicule</label>
                <select value={vehicule} onChange={e => setVehicule(e.target.value)} className="w-full h-11 rounded-xl border px-3 text-sm">
                  <option value="voiture">Voiture</option>
                  <option value="moto">Moto</option>
                  <option value="velo">Vélo</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Motif</label>
                <input value={motif} onChange={e => setMotif(e.target.value)} placeholder="Ex: visite client" className="w-full h-11 rounded-xl border px-3 text-sm" />
              </div>
            </div>
            <Button onClick={demarrerTrajet} disabled={gpsLoading} className="w-full h-12 rounded-xl" style={{ backgroundColor: "#2ECC8A", color: "white" }}>
              {gpsLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
              Démarrer le trajet
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl text-center" style={{ backgroundColor: "#D4AF3710" }}>
          <p className="text-2xl font-bold" style={{ color: "#D4AF37" }}>{totalKm.toFixed(1)} km</p>
          <p className="text-xs text-gray-500">Total ce mois</p>
        </div>
        <div className="p-4 rounded-2xl text-center" style={{ backgroundColor: "#2ECC8A10" }}>
          <p className="text-2xl font-bold" style={{ color: "#2ECC8A" }}>{new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(totalIndemnite)} MUR</p>
          <p className="text-xs text-gray-500">Indemnités validées</p>
        </div>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-base" style={{ color: "#0B0F2E" }}>Historique des trajets</CardTitle></CardHeader>
        <CardContent>
          {loadingT ? <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin" /></div> :
          trajets.filter((t: any) => t.statut !== "en_cours").length === 0 ? <p className="text-gray-400 text-center py-6 text-sm">Aucun trajet enregistré</p> : (
            <div className="space-y-2">
              {trajets.filter((t: any) => t.statut !== "en_cours").map((t: any) => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-xl border" style={{ borderLeft: `3px solid ${t.statut === "valide" ? "#2ECC8A" : t.statut === "rejete" ? "#dc2626" : "#D4AF37"}` }}>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>{new Date(t.date_trajet).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} — {t.vehicule}</p>
                    <p className="text-xs text-gray-400">{t.motif || "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-bold text-sm">{Number(t.distance_totale_km || 0).toFixed(1)} km</p>
                    <Badge className={`text-[10px] ${t.statut === "valide" ? "bg-green-100 text-green-700" : t.statut === "rejete" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                      {t.statut === "valide" ? "Validé" : t.statut === "rejete" ? "Rejeté" : "En attente"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
