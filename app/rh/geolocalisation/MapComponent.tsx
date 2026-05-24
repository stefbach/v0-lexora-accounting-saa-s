"use client"
import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

const BLUE = "#4191FF"
const GREEN = "#2ECC8A"
const GOLD = "#D4AF37"
const GRAY = "#9ca3af"

const MAURITIUS_CENTER: [number, number] = [-20.25, 57.55]
const MAURITIUS_ZOOM = 10

function markerColor(shift: string): string {
  if (shift === "travail") return BLUE
  if (shift === "repos") return GRAY
  if (shift === "conge") return GREEN
  return "#d1d5db"
}

function createIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><div style="width:8px;height:8px;border-radius:50%;background:white;"></div></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  })
}

interface Position {
  employe_id: string
  nom: string
  prenom: string
  poste: string
  latitude: number | null
  longitude: number | null
  adresse: string
  shift_today: string
  shift_label: string
  heure_debut: string | null
  heure_fin: string | null
}

export default function MapComponent({ positions }: { positions: Position[] }) {
  const mapRef = useRef<L.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    const map = L.map(containerRef.current, {
      center: MAURITIUS_CENTER,
      zoom: MAURITIUS_ZOOM,
      scrollWheelZoom: true,
    })

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map)

    // Add markers for employees with GPS coordinates
    const markers: L.Marker[] = []
    for (const p of positions) {
      if (p.latitude && p.longitude) {
        const color = markerColor(p.shift_today)
        const icon = createIcon(color)
        const marker = L.marker([p.latitude, p.longitude], { icon })
        marker.bindPopup(`
          <div style="font-family:system-ui;min-width:180px;">
            <p style="font-weight:700;font-size:14px;margin:0 0 4px;color:#0B0F2E;">${p.prenom} ${p.nom}</p>
            <p style="font-size:12px;color:#666;margin:0 0 2px;">${p.poste || "—"}</p>
            <p style="font-size:11px;color:#999;margin:0 0 6px;">${p.adresse || "Adresse non renseignée"}</p>
            <div style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:${color}20;color:${color};">
              ${p.shift_label}${p.heure_debut ? ` ${String(p.heure_debut).slice(0,5)}-${String(p.heure_fin).slice(0,5)}` : ""}
            </div>
          </div>
        `)
        marker.addTo(map)
        markers.push(marker)
      }
    }

    // Fit bounds if we have markers
    if (markers.length > 0) {
      const group = L.featureGroup(markers)
      map.fitBounds(group.getBounds().pad(0.1))
    }

    // Add a note for employees without GPS
    const sansGPS = positions.filter(p => !p.latitude || !p.longitude)
    if (sansGPS.length > 0 && markers.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- L.control est typed comme namespace mais peut être invoqué comme fonction (API Leaflet historique)
      const corner = (L.control as any)({ position: "bottomleft" })
      corner.onAdd = () => {
        const div = L.DomUtil.create("div")
        div.style.cssText = "background:white;padding:8px 12px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);font-size:11px;color:#666;max-width:200px;"
        div.innerHTML = `<strong>${sansGPS.length}</strong> employé(s) sans coordonnées GPS`
        return div
      }
      corner.addTo(map)
    }

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [positions])

  const hasAnyGPS = positions.some(p => p.latitude && p.longitude)

  return (
    <div>
      <div ref={containerRef} style={{ height: "500px", width: "100%" }} />
      {!hasAnyGPS && (
        <div className="p-6 text-center">
          <MapPin className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">Aucune coordonnée GPS disponible</p>
          <p className="text-xs text-gray-400 mt-1">Renseignez les adresses dans les fiches employés pour les voir sur la carte</p>
        </div>
      )}
    </div>
  )
}

function MapPin({ className, ...props }: { className?: string; [key: string]: any }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} {...props}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  )
}
