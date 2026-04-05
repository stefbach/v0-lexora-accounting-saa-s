"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function ExportsMRARedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/rh/exports/paie")
  }, [router])
  return (
    <div className="flex items-center justify-center min-h-[50vh] text-gray-400 text-sm">
      Redirection vers Exports Paie...
    </div>
  )
}
