"use client"

/**
 * Widget de calcul de distance entre deux adresses (Maurice).
 *
 * Dépend de deux endpoints fournis par l'agent DIST-A :
 *   - GET  /api/rh/geocode-search?q=<query>&country=mu
 *       → [{ display_name, lat, lng }]
 *   - POST /api/rh/calcul-distance
 *       body { depart_adresse, arrivee_adresse, aller_retour }
 *       → { distance_km, total_km, depart, arrivee, routing_factor }
 *
 * Utilisable en standalone (par ex. au-dessus du tableau frais-km) ou
 * dans un Dialog. Si `onDistanceCalculated` est fourni, un bouton
 * "Utiliser cette distance" apparaît une fois le résultat affiché.
 */

import { useEffect, useRef, useState } from "react"
import { Loader2, MapPin, Search, ArrowRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { notifyError } from "@/lib/utils/toast"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { t, getLocale } from "@/lib/i18n"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

interface GeocodeSuggestion {
  display_name: string
  lat: number
  lng: number
}

interface AddressPoint {
  display_name: string
  lat?: number
  lng?: number
}

interface DistanceResult {
  distance_km: number
  total_km: number
  depart: AddressPoint
  arrivee: AddressPoint
  routing_factor?: number
}

export interface CalculDistanceWidgetProps {
  onDistanceCalculated?: (km: number, depart: string, arrivee: string) => void
  defaultDepart?: string
  defaultArrivee?: string
  className?: string
}

/**
 * Sous-composant : input adresse avec autocomplétion (combobox pattern).
 * Utilise un `<ul>` absolute (plutôt que Popover Radix) pour rester
 * simple et garder le focus naturel sur l'input.
 */
function AddressAutocomplete({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string
  label: string
  value: string
  onChange: (val: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<GeocodeSuggestion[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const debouncedValue = useDebouncedValue(value, 400)
  const containerRef = useRef<HTMLDivElement>(null)
  const justPickedRef = useRef(false)

  // Ferme le dropdown quand on clique en dehors
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [])

  // Fetch des suggestions avec debounce
  useEffect(() => {
    // Si la dernière modif vient d'un clic suggestion, on ne refetch pas
    if (justPickedRef.current) {
      justPickedRef.current = false
      return
    }
    const q = debouncedValue.trim()
    if (q.length < 3) {
      setSuggestions([])
      return
    }
    let cancelled = false
    setLoading(true)
    // dépend de DIST-A : endpoint /api/rh/geocode-search
    fetch(`/api/rh/geocode-search?q=${encodeURIComponent(q)}&country=mu`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        const arr: GeocodeSuggestion[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.results)
            ? data.results
            : []
        setSuggestions(arr.slice(0, 5))
        setOpen(arr.length > 0)
        setActiveIndex(-1)
      })
      .catch(() => {
        if (!cancelled) {
          setSuggestions([])
          setOpen(false)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [debouncedValue])

  const pickSuggestion = (s: GeocodeSuggestion) => {
    justPickedRef.current = true
    onChange(s.display_name)
    setOpen(false)
    setSuggestions([])
    setActiveIndex(-1)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault()
      pickSuggestion(suggestions[activeIndex])
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  const listboxId = `${id}-listbox`

  return (
    <div className="relative" ref={containerRef}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative mt-1">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400 pointer-events-none" />
        <Input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          className="pl-8 pr-8"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            activeIndex >= 0 ? `${id}-opt-${activeIndex}` : undefined
          }
        />
        {loading && (
          <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-gray-400" />
        )}
      </div>
      {open && suggestions.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border bg-white shadow-lg"
        >
          {suggestions.map((s, idx) => (
            <li
              key={`${s.display_name}-${idx}`}
              id={`${id}-opt-${idx}`}
              role="option"
              aria-selected={activeIndex === idx}
              className={`cursor-pointer px-3 py-2 text-sm hover:bg-gray-100 ${
                activeIndex === idx ? "bg-gray-100" : ""
              }`}
              onMouseDown={(e) => {
                // mousedown pour éviter le blur avant click
                e.preventDefault()
                pickSuggestion(s)
              }}
            >
              <div className="flex items-start gap-2">
                <MapPin className="h-3 w-3 mt-1 flex-shrink-0 text-gray-400" />
                <span className="line-clamp-2">{s.display_name}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function CalculDistanceWidget({
  onDistanceCalculated,
  defaultDepart = "",
  defaultArrivee = "",
  className = "",
}: CalculDistanceWidgetProps) {
  const locale = getLocale()
  const [depart, setDepart] = useState(defaultDepart)
  const [arrivee, setArrivee] = useState(defaultArrivee)
  const [allerRetour, setAllerRetour] = useState(false)
  const [calculating, setCalculating] = useState(false)
  const [result, setResult] = useState<DistanceResult | null>(null)

  const canCalculate =
    depart.trim().length > 2 &&
    arrivee.trim().length > 2 &&
    !calculating

  const calculer = async () => {
    if (!canCalculate) return
    setCalculating(true)
    setResult(null)
    try {
      // dépend de DIST-A : endpoint /api/rh/calcul-distance
      const res = await fetch("/api/rh/calcul-distance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          depart_adresse: depart.trim(),
          arrivee_adresse: arrivee.trim(),
          aller_retour: allerRetour,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        notifyError(
          t('scrh.dist_calc_error', locale),
          data?.error || `HTTP ${res.status}`,
        )
        return
      }
      setResult(data as DistanceResult)
    } catch (e: unknown) {
      notifyError(t('scrh.dist_network_error', locale), e)
    } finally {
      setCalculating(false)
    }
  }

  const useThisDistance = () => {
    if (!result || !onDistanceCalculated) return
    onDistanceCalculated(
      result.total_km,
      result.depart?.display_name || depart,
      result.arrivee?.display_name || arrivee,
    )
  }

  const reset = () => {
    setResult(null)
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle
          className="flex items-center gap-2 text-base"
          style={{ color: NAVY }}
        >
          <MapPin className="h-5 w-5" style={{ color: GOLD }} />
          {t('scrh.dist_title', locale)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AddressAutocomplete
            id="depart-adresse"
            label={t('scrh.dist_label_depart', locale)}
            value={depart}
            onChange={(v) => {
              setDepart(v)
              if (result) setResult(null)
            }}
            placeholder={t('scrh.dist_ph_depart', locale)}
          />
          <AddressAutocomplete
            id="arrivee-adresse"
            label={t('scrh.dist_label_arrivee', locale)}
            value={arrivee}
            onChange={(v) => {
              setArrivee(v)
              if (result) setResult(null)
            }}
            placeholder={t('scrh.dist_ph_arrivee', locale)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="aller-retour"
            checked={allerRetour}
            onCheckedChange={(c) => {
              setAllerRetour(c === true)
              if (result) setResult(null)
            }}
          />
          <Label
            htmlFor="aller-retour"
            className="text-sm font-normal cursor-pointer"
          >
            {t('scrh.dist_round_trip', locale)}
          </Label>
        </div>

        <Button
          onClick={calculer}
          disabled={!canCalculate}
          className="w-full text-white"
          style={{ backgroundColor: NAVY }}
        >
          {calculating ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <ArrowRight className="h-4 w-4 mr-2" />
          )}
          {calculating ? t('scrh.dist_calculating', locale) : t('scrh.dist_calc_btn', locale)}
        </Button>

        {result && (
          <div
            className="rounded-md border-2 p-4"
            style={{ borderColor: "#16a34a", backgroundColor: "#f0fdf4" }}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-2 text-green-700 text-sm font-medium mb-2">
              <span aria-hidden>✅</span>
              {t('scrh.dist_estimated', locale)}
            </div>
            <p
              className="text-3xl font-bold"
              style={{ color: NAVY }}
            >
              {result.total_km.toFixed(1)} km
              {allerRetour && (
                <span className="text-sm font-normal text-gray-500 ml-2">
                  {t('scrh.dist_round_trip_suffix', locale)}
                </span>
              )}
            </p>
            {typeof result.distance_km === "number" &&
              result.distance_km !== result.total_km && (
                <p className="text-xs text-gray-500 mt-1">
                  {t('scrh.dist_one_way', locale).replace('{km}', result.distance_km.toFixed(1))}
                </p>
              )}
            {result.routing_factor && (
              <p className="text-xs text-gray-500 mt-1">
                {t('scrh.dist_crow_flies', locale).replace('{f}', result.routing_factor.toFixed(2))}
              </p>
            )}
            <div className="mt-3 text-xs text-gray-600 space-y-1">
              <p>
                <strong>{t('scrh.dist_from', locale)}</strong>{" "}
                {result.depart?.display_name || depart}
              </p>
              <p>
                <strong>{t('scrh.dist_to', locale)}</strong>{" "}
                {result.arrivee?.display_name || arrivee}
              </p>
            </div>
            <div className="flex gap-2 mt-3">
              {onDistanceCalculated && (
                <Button
                  size="sm"
                  className="text-white"
                  style={{ backgroundColor: GOLD }}
                  onClick={useThisDistance}
                >
                  {t('scrh.dist_use', locale)}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={reset}>
                {t('scrh.dist_clear', locale)}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default CalculDistanceWidget
