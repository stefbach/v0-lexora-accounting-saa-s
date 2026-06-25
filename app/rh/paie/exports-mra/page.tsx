"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { t, getLocale } from "@/lib/i18n"

export default function ExportsMRARedirect() {
  const router = useRouter()
  const locale = getLocale()
  useEffect(() => {
    router.replace("/rh/exports/paie")
  }, [router])
  return (
    <div className="flex items-center justify-center min-h-[50vh] text-gray-400 text-sm">
      {t('rhpa.redir.exports_mra', locale)}
    </div>
  )
}
