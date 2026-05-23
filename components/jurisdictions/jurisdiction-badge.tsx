'use client'

import { ALL_JURISDICTIONS } from './jurisdiction-selector'

interface JurisdictionBadgeProps {
  code: string
  size?: 'sm' | 'md' | 'lg'
  showName?: boolean
}

export function JurisdictionBadge({ code, size = 'md', showName = true }: JurisdictionBadgeProps) {
  const j = ALL_JURISDICTIONS.find(j => j.code === code)
  if (!j) return null

  const sizes = {
    sm: 'text-sm px-2 py-0.5',
    md: 'text-base px-3 py-1',
    lg: 'text-lg px-4 py-1.5'
  }

  return (
    <span className={`inline-flex items-center gap-2 rounded-full bg-gray-100 ${sizes[size]}`}>
      <span>{j.flag}</span>
      {showName && <span className="font-medium">{j.nameFr}</span>}
      <span className="text-xs text-gray-500">({j.currency})</span>
    </span>
  )
}
