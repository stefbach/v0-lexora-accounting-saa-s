"use client"
/**
 * MonEspaceSalarieLink — Lien discret « 👤 Mon espace salarié → »
 * vers /salarie, affiché UNIQUEMENT si l'utilisateur courant a une
 * fiche employé liée (profile.employe_id ou employes.auth_user_id).
 *
 * Utilisé dans les sidebars / headers de :
 *   • RH (RHSidebarDedicated)
 *   • Manager
 *   • Assistant client (déjà un bouton dédié)
 *   • Comptable type='interne' (mig 137)
 *
 * Le composant gère lui-même la détection. Le parent peut le poser
 * sans condition, il ne rend rien si l'user n'a pas de fiche.
 *
 * Variante pour sidebar (compact) ou header (normal) via la prop
 * `compact`.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { User, ArrowRight } from "lucide-react"
import { t, getLocale } from "@/lib/i18n"

interface Props {
  /** Style sidebar (full width, padding réduit) vs header (inline). */
  compact?: boolean
  /** Surcharge du lien — par défaut /salarie. */
  href?: string
  /** Surcharge du label. */
  label?: string
}

export default function MonEspaceSalarieLink({
  compact = false,
  href = "/salarie",
  label,
}: Props) {
  const locale = getLocale()
  const resolvedLabel = label ?? t('scrh.mesl_label', locale)
  const [hasEmploye, setHasEmploye] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/rh/employes/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setHasEmploye(!!d?.employe) })
      .catch(() => { if (!cancelled) setHasEmploye(false) })
    return () => { cancelled = true }
  }, [])

  // Tant qu'on ne sait pas, ne rien rendre (évite le flash on/off)
  if (hasEmploye !== true) return null

  if (compact) {
    return (
      <Link
        href={href}
        className="flex items-center gap-2 px-3 py-2 mx-2 mb-2 rounded-md text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-colors border border-white/10"
        title={resolvedLabel}
      >
        <User className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{resolvedLabel}</span>
        <ArrowRight className="h-3 w-3 ml-auto opacity-60" />
      </Link>
    )
  }

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-[#0B0F2E] transition-colors"
    >
      <User className="h-3.5 w-3.5" />
      <span>{resolvedLabel}</span>
      <ArrowRight className="h-3 w-3 opacity-60" />
    </Link>
  )
}
