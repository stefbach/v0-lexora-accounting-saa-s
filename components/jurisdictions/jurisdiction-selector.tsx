'use client'

import { useState } from 'react'

export interface JurisdictionOption {
  code: string
  name: string
  nameFr: string
  flag: string  // Emoji flag
  zone: string
  currency: string
  framework: string
}

export const ALL_JURISDICTIONS: JurisdictionOption[] = [
  // Maurice
  { code: 'MU', name: 'Mauritius', nameFr: 'Maurice', flag: '🇲🇺', zone: 'Indian Ocean', currency: 'MUR', framework: 'PCM' },
  // UEMOA
  { code: 'SN', name: 'Senegal', nameFr: 'Sénégal', flag: '🇸🇳', zone: 'UEMOA', currency: 'XOF', framework: 'SYSCOHADA' },
  { code: 'CI', name: 'Ivory Coast', nameFr: 'Côte d\'Ivoire', flag: '🇨🇮', zone: 'UEMOA', currency: 'XOF', framework: 'SYSCOHADA' },
  { code: 'ML', name: 'Mali', nameFr: 'Mali', flag: '🇲🇱', zone: 'UEMOA', currency: 'XOF', framework: 'SYSCOHADA' },
  { code: 'BF', name: 'Burkina Faso', nameFr: 'Burkina Faso', flag: '🇧🇫', zone: 'UEMOA', currency: 'XOF', framework: 'SYSCOHADA' },
  { code: 'NE', name: 'Niger', nameFr: 'Niger', flag: '🇳🇪', zone: 'UEMOA', currency: 'XOF', framework: 'SYSCOHADA' },
  { code: 'BJ', name: 'Benin', nameFr: 'Bénin', flag: '🇧🇯', zone: 'UEMOA', currency: 'XOF', framework: 'SYSCOHADA' },
  { code: 'TG', name: 'Togo', nameFr: 'Togo', flag: '🇹🇬', zone: 'UEMOA', currency: 'XOF', framework: 'SYSCOHADA' },
  { code: 'GW', name: 'Guinea-Bissau', nameFr: 'Guinée-Bissau', flag: '🇬🇼', zone: 'UEMOA', currency: 'XOF', framework: 'SYSCOHADA' },
  // CEMAC
  { code: 'CM', name: 'Cameroon', nameFr: 'Cameroun', flag: '🇨🇲', zone: 'CEMAC', currency: 'XAF', framework: 'SYSCOHADA' },
  { code: 'GA', name: 'Gabon', nameFr: 'Gabon', flag: '🇬🇦', zone: 'CEMAC', currency: 'XAF', framework: 'SYSCOHADA' },
  { code: 'CG', name: 'Congo', nameFr: 'Congo', flag: '🇨🇬', zone: 'CEMAC', currency: 'XAF', framework: 'SYSCOHADA' },
  { code: 'TD', name: 'Chad', nameFr: 'Tchad', flag: '🇹🇩', zone: 'CEMAC', currency: 'XAF', framework: 'SYSCOHADA' },
  { code: 'CF', name: 'CAR', nameFr: 'Centrafrique', flag: '🇨🇫', zone: 'CEMAC', currency: 'XAF', framework: 'SYSCOHADA' },
  { code: 'GQ', name: 'Eq. Guinea', nameFr: 'Guinée Équat.', flag: '🇬🇶', zone: 'CEMAC', currency: 'XAF', framework: 'SYSCOHADA' },
  // Other
  { code: 'KM', name: 'Comoros', nameFr: 'Comores', flag: '🇰🇲', zone: 'OHADA', currency: 'KMF', framework: 'SYSCOHADA' },
  { code: 'CD', name: 'DR Congo', nameFr: 'RDC', flag: '🇨🇩', zone: 'OHADA', currency: 'CDF', framework: 'SYSCOHADA' },
  { code: 'GN', name: 'Guinea', nameFr: 'Guinée', flag: '🇬🇳', zone: 'OHADA', currency: 'GNF', framework: 'SYSCOHADA' },
]

interface JurisdictionSelectorProps {
  value?: string
  onChange: (code: string) => void
  disabled?: boolean
  showFramework?: boolean
  filterByFramework?: 'PCM' | 'SYSCOHADA'
}

export function JurisdictionSelector({ value, onChange, disabled, showFramework, filterByFramework }: JurisdictionSelectorProps) {
  const [search, setSearch] = useState('')

  const filtered = ALL_JURISDICTIONS
    .filter(j => !filterByFramework || j.framework === filterByFramework)
    .filter(j =>
      j.name.toLowerCase().includes(search.toLowerCase()) ||
      j.nameFr.toLowerCase().includes(search.toLowerCase()) ||
      j.code.toLowerCase().includes(search.toLowerCase())
    )

  // Group by zone
  const byZone = filtered.reduce((acc, j) => {
    acc[j.zone] ??= []
    acc[j.zone].push(j)
    return acc
  }, {} as Record<string, JurisdictionOption[]>)

  return (
    <div className="space-y-2">
      <input
        type="search"
        placeholder="Rechercher un pays..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2 border rounded-md text-sm"
        disabled={disabled}
      />
      <div className="max-h-96 overflow-y-auto border rounded-md">
        {Object.entries(byZone).map(([zone, jurisdictions]) => (
          <div key={zone}>
            <div className="px-3 py-1 bg-gray-50 text-xs font-semibold text-gray-600 uppercase">
              {zone}
            </div>
            {jurisdictions.map(j => (
              <button
                key={j.code}
                type="button"
                onClick={() => onChange(j.code)}
                disabled={disabled}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-blue-50 ${
                  value === j.code ? 'bg-blue-100 border-l-4 border-blue-500' : ''
                }`}
              >
                <span className="text-2xl">{j.flag}</span>
                <div className="flex-1">
                  <div className="font-medium text-sm">{j.nameFr}</div>
                  <div className="text-xs text-gray-500">
                    {j.code} • {j.currency}
                    {showFramework && ` • ${j.framework}`}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="p-4 text-center text-sm text-gray-500">
            Aucun pays trouvé
          </div>
        )}
      </div>
    </div>
  )
}
