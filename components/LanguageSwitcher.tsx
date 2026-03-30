"use client"

import { getLocale, setLocale, type Locale } from "@/lib/i18n"
import { useState, useEffect } from "react"

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const [locale, setLocaleState] = useState<Locale>("fr")

  useEffect(() => {
    setLocaleState(getLocale())
  }, [])

  const handleSwitch = (newLocale: Locale) => {
    if (newLocale !== locale) {
      setLocale(newLocale)
    }
  }

  return (
    <div className={`flex items-center gap-1 rounded-lg bg-white/10 p-0.5 ${className}`}>
      <button
        onClick={() => handleSwitch("fr")}
        className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
          locale === "fr"
            ? "bg-[#C9A84C] text-[#1E2A4A]"
            : "text-white/60 hover:text-white"
        }`}
      >
        FR
      </button>
      <button
        onClick={() => handleSwitch("en")}
        className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
          locale === "en"
            ? "bg-[#C9A84C] text-[#1E2A4A]"
            : "text-white/60 hover:text-white"
        }`}
      >
        EN
      </button>
    </div>
  )
}

/** Light variant for use on white backgrounds (e.g. homepage header) */
export function LanguageSwitcherLight({ className = "" }: { className?: string }) {
  const [locale, setLocaleState] = useState<Locale>("fr")

  useEffect(() => {
    setLocaleState(getLocale())
  }, [])

  const handleSwitch = (newLocale: Locale) => {
    if (newLocale !== locale) {
      setLocale(newLocale)
    }
  }

  return (
    <div className={`flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5 ${className}`}>
      <button
        onClick={() => handleSwitch("fr")}
        className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
          locale === "fr"
            ? "bg-[#C9A84C] text-white"
            : "text-gray-500 hover:text-gray-900"
        }`}
      >
        FR
      </button>
      <button
        onClick={() => handleSwitch("en")}
        className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
          locale === "en"
            ? "bg-[#C9A84C] text-white"
            : "text-gray-500 hover:text-gray-900"
        }`}
      >
        EN
      </button>
    </div>
  )
}
