import { JurisdictionBadge } from '@/components/jurisdictions/jurisdiction-badge'

const STATS = {
  totalCountries: 18, // 17 OHADA + Maurice
  ohadaCountries: 17,
  totalAccounts: 200, // SYSCOHADA
  zones: ['UEMOA (8 pays)', 'CEMAC (6 pays)', 'Autres OHADA (3 pays)', 'Maurice (PCM)'],
}

const JURISDICTIONS = [
  { code: 'MU', framework: 'PCM', status: 'ACTIVE', companies: 0 },
  { code: 'SN', framework: 'SYSCOHADA', status: 'READY', companies: 0 },
  { code: 'CI', framework: 'SYSCOHADA', status: 'READY', companies: 0 },
  { code: 'ML', framework: 'SYSCOHADA', status: 'READY', companies: 0 },
  { code: 'BF', framework: 'SYSCOHADA', status: 'READY', companies: 0 },
  { code: 'NE', framework: 'SYSCOHADA', status: 'READY', companies: 0 },
  { code: 'BJ', framework: 'SYSCOHADA', status: 'READY', companies: 0 },
  { code: 'TG', framework: 'SYSCOHADA', status: 'READY', companies: 0 },
  { code: 'GW', framework: 'SYSCOHADA', status: 'READY', companies: 0 },
  { code: 'CM', framework: 'SYSCOHADA', status: 'READY', companies: 0 },
  { code: 'GA', framework: 'SYSCOHADA', status: 'READY', companies: 0 },
  { code: 'CG', framework: 'SYSCOHADA', status: 'READY', companies: 0 },
  { code: 'TD', framework: 'SYSCOHADA', status: 'READY', companies: 0 },
  { code: 'CF', framework: 'SYSCOHADA', status: 'READY', companies: 0 },
  { code: 'GQ', framework: 'SYSCOHADA', status: 'READY', companies: 0 },
  { code: 'KM', framework: 'SYSCOHADA', status: 'READY', companies: 0 },
  { code: 'CD', framework: 'SYSCOHADA', status: 'READY', companies: 0 },
  { code: 'GN', framework: 'SYSCOHADA', status: 'READY', companies: 0 },
]

export default function OhadaAdminPage() {
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">OHADA Multi-Juridictions</h1>
        <p className="text-gray-600">
          Support de 17 pays OHADA (SYSCOHADA) + Maurice (PCM) — La couche régionale qui dépasse Sage X3
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-6 rounded-lg border shadow-sm">
          <div className="text-3xl font-bold text-blue-600">{STATS.totalCountries}</div>
          <div className="text-sm text-gray-600 mt-1">Pays supportés</div>
        </div>
        <div className="bg-white p-6 rounded-lg border shadow-sm">
          <div className="text-3xl font-bold text-green-600">{STATS.ohadaCountries}</div>
          <div className="text-sm text-gray-600 mt-1">Pays OHADA</div>
        </div>
        <div className="bg-white p-6 rounded-lg border shadow-sm">
          <div className="text-3xl font-bold text-purple-600">{STATS.totalAccounts}+</div>
          <div className="text-sm text-gray-600 mt-1">Comptes SYSCOHADA</div>
        </div>
        <div className="bg-white p-6 rounded-lg border shadow-sm">
          <div className="text-3xl font-bold text-orange-600">9</div>
          <div className="text-sm text-gray-600 mt-1">Classes comptables</div>
        </div>
      </div>

      {/* Zones */}
      <div className="bg-white p-6 rounded-lg border shadow-sm mb-8">
        <h2 className="text-xl font-bold mb-4">Zones Économiques</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {STATS.zones.map(zone => (
            <div key={zone} className="p-4 bg-gray-50 rounded">
              <div className="font-medium">{zone}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Jurisdictions Table */}
      <div className="bg-white rounded-lg border shadow-sm">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">Juridictions Disponibles</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-4 text-sm font-medium text-gray-600">Pays</th>
                <th className="text-left p-4 text-sm font-medium text-gray-600">Framework</th>
                <th className="text-left p-4 text-sm font-medium text-gray-600">Statut</th>
                <th className="text-left p-4 text-sm font-medium text-gray-600">Sociétés</th>
              </tr>
            </thead>
            <tbody>
              {JURISDICTIONS.map(j => (
                <tr key={j.code} className="border-b hover:bg-gray-50">
                  <td className="p-4">
                    <JurisdictionBadge code={j.code} />
                  </td>
                  <td className="p-4 text-sm">
                    <span className={`px-2 py-1 rounded text-xs ${
                      j.framework === 'SYSCOHADA' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                    }`}>
                      {j.framework}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs ${
                      j.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {j.status}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-gray-600">{j.companies}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
