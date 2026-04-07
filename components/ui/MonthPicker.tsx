"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, X } from "lucide-react"

const MOIS_FR = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
]

const MOIS_LONG_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]

interface MonthPickerProps {
  value: string | null // "2026-04" format or null for "Tout"
  onChange: (value: string | null) => void
  showTout?: boolean // show "Tout" button (default: true)
  className?: string
}

export function MonthPicker({ value, onChange, showTout = true, className }: MonthPickerProps) {
  const [open, setOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(() => {
    if (value) return parseInt(value.split("-")[0])
    return new Date().getFullYear()
  })
  const ref = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  function shiftMonth(delta: number) {
    if (!value) {
      const now = new Date()
      onChange(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`)
      return
    }
    const [y, m] = value.split("-").map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }

  function formatLabel(): string {
    if (!value) return "Tous les mois"
    const [y, m] = value.split("-").map(Number)
    return `${MOIS_LONG_FR[m - 1]} ${y}`
  }

  const selectedMonth = value ? parseInt(value.split("-")[1]) : null
  const selectedYear = value ? parseInt(value.split("-")[0]) : null

  return (
    <div className={`relative flex items-center gap-2 ${className || ""}`} ref={ref}>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftMonth(-1)}>
        <ChevronLeft className="w-4 h-4" />
      </Button>

      <button
        onClick={() => { setOpen(!open); if (value) setPickerYear(parseInt(value.split("-")[0])) }}
        className="text-sm font-medium min-w-[160px] text-center capitalize hover:bg-gray-100 rounded-md px-2 py-1 transition-colors"
      >
        {formatLabel()}
      </button>

      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftMonth(1)}>
        <ChevronRight className="w-4 h-4" />
      </Button>

      {showTout && (
        <Button
          variant={!value ? "default" : "outline"}
          size="sm"
          className={!value ? "bg-[#0B0F2E] text-white" : ""}
          onClick={() => onChange(null)}
        >
          Tout
        </Button>
      )}

      {/* Dropdown picker */}
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg z-50 w-[280px] p-3">
          {/* Year selector */}
          <div className="flex items-center justify-between mb-3">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPickerYear(pickerYear - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-bold text-[#0B0F2E]">{pickerYear}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPickerYear(pickerYear + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-4 gap-1.5">
            {MOIS_FR.map((mois, idx) => {
              const monthNum = idx + 1
              const isSelected = selectedYear === pickerYear && selectedMonth === monthNum
              const now = new Date()
              const isCurrent = pickerYear === now.getFullYear() && monthNum === now.getMonth() + 1

              return (
                <button
                  key={mois}
                  onClick={() => {
                    onChange(`${pickerYear}-${String(monthNum).padStart(2, "0")}`)
                    setOpen(false)
                  }}
                  className={`px-2 py-1.5 text-xs rounded-md transition-colors ${
                    isSelected
                      ? "bg-[#D4AF37] text-white font-bold"
                      : isCurrent
                      ? "bg-[#D4AF37]/10 text-[#D4AF37] font-medium border border-[#D4AF37]/30"
                      : "hover:bg-gray-100 text-gray-700"
                  }`}
                >
                  {mois}
                </button>
              )
            })}
          </div>

          {/* Tout option */}
          {showTout && (
            <button
              onClick={() => { onChange(null); setOpen(false) }}
              className="w-full mt-2 px-2 py-1.5 text-xs rounded-md text-center text-gray-500 hover:bg-gray-100 border-t pt-2"
            >
              Tous les mois
            </button>
          )}
        </div>
      )}
    </div>
  )
}
