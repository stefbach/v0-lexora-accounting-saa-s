export const metadata = {
  title: 'Lexora OHADA - Comptabilité SYSCOHADA pour 17 pays africains',
  description: 'La première solution SaaS de comptabilité OHADA moderne. SYSCOHADA, paie, fiscalité pour Sénégal, Côte d\'Ivoire, Cameroun et 14 autres pays.',
}

export default function OhadaPublicPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Hero */}
      <section className="py-20 px-4 text-center max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm mb-6">
          🌍 17 pays OHADA + Maurice = 18 juridictions
        </div>
        <h1 className="text-5xl font-bold mb-4">
          La comptabilité <span className="text-blue-600">SYSCOHADA</span> moderne
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
          Lexora est la première solution SaaS qui couvre nativement la comptabilité, la paie
          et la fiscalité de tous les pays OHADA. 5× moins chère que Sage X3, 10× plus rapide à déployer.
        </p>
        <div className="flex gap-4 justify-center">
          <a href="/admin/ohada" className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
            Voir la démo
          </a>
          <a href="#features" className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50">
            Découvrir
          </a>
        </div>
      </section>

      {/* Pays supportés */}
      <section className="py-16 px-4 bg-white" id="pays">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-2">17 pays OHADA + Maurice</h2>
          <p className="text-center text-gray-600 mb-12">Tous les pays signataires du Traité OHADA + Maurice (PCM)</p>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { code: 'MU', flag: '🇲🇺', name: 'Maurice', framework: 'PCM' },
              { code: 'SN', flag: '🇸🇳', name: 'Sénégal', framework: 'UEMOA' },
              { code: 'CI', flag: '🇨🇮', name: 'Côte d\'Ivoire', framework: 'UEMOA' },
              { code: 'ML', flag: '🇲🇱', name: 'Mali', framework: 'UEMOA' },
              { code: 'BF', flag: '🇧🇫', name: 'Burkina Faso', framework: 'UEMOA' },
              { code: 'NE', flag: '🇳🇪', name: 'Niger', framework: 'UEMOA' },
              { code: 'BJ', flag: '🇧🇯', name: 'Bénin', framework: 'UEMOA' },
              { code: 'TG', flag: '🇹🇬', name: 'Togo', framework: 'UEMOA' },
              { code: 'GW', flag: '🇬🇼', name: 'Guinée-Bissau', framework: 'UEMOA' },
              { code: 'CM', flag: '🇨🇲', name: 'Cameroun', framework: 'CEMAC' },
              { code: 'GA', flag: '🇬🇦', name: 'Gabon', framework: 'CEMAC' },
              { code: 'CG', flag: '🇨🇬', name: 'Congo', framework: 'CEMAC' },
              { code: 'TD', flag: '🇹🇩', name: 'Tchad', framework: 'CEMAC' },
              { code: 'CF', flag: '🇨🇫', name: 'Centrafrique', framework: 'CEMAC' },
              { code: 'GQ', flag: '🇬🇶', name: 'Guinée Équatoriale', framework: 'CEMAC' },
              { code: 'KM', flag: '🇰🇲', name: 'Comores', framework: 'OHADA' },
              { code: 'CD', flag: '🇨🇩', name: 'RDC', framework: 'OHADA' },
              { code: 'GN', flag: '🇬🇳', name: 'Guinée', framework: 'OHADA' },
            ].map(country => (
              <div key={country.code} className="bg-white border rounded-lg p-3 text-center hover:shadow-md transition-shadow">
                <div className="text-3xl mb-1">{country.flag}</div>
                <div className="font-medium text-sm">{country.name}</div>
                <div className="text-xs text-gray-500">{country.framework}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4" id="features">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Tout ce qu&apos;il vous faut, intégré</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FeatureCard icon="📊" title="Plan Comptable SYSCOHADA"
              description="500+ comptes officiels (9 classes), conformes AUDCIF 2017. Mise à jour automatique." />
            <FeatureCard icon="📈" title="États Financiers Officiels"
              description="Bilan, Compte de Résultat, TAFIRE, 35 Notes Annexes. Système Normal et SMT (TPE)." />
            <FeatureCard icon="💰" title="Fiscalité Multi-Pays"
              description="TVA (10-19.25%), IS (25-35%), Withholding Tax, IMF. Calculs automatisés par juridiction." />
            <FeatureCard icon="👥" title="Paie Locale"
              description="CNSS, IUTS, IRPP, IPRES, prestations familiales. Barèmes 2024 pour 17 pays." />
            <FeatureCard icon="🤖" title="IA Copilote (pas remplaçant)"
              description="Claude vous assiste mais l'expert-comptable garde le contrôle. OCR factures, anomalies." />
            <FeatureCard icon="🔐" title="Audit-Ready"
              description="Audit trail immuable, segregation of duties, conformité Big 4. Prêt pour vos commissaires." />
          </div>
        </div>
      </section>

      {/* Comparaison */}
      <section className="py-16 px-4 bg-blue-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Lexora vs Sage X3</h2>

          <div className="bg-white rounded-lg overflow-hidden shadow-sm">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Critère</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold">Sage X3</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold bg-blue-100">Lexora</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[
                  ['Coût annuel (50 users)', '80-150k€', '15-25k€', true],
                  ['Délai déploiement', '6-12 mois', '2-4 semaines', true],
                  ['SYSCOHADA natif', 'Add-on', '✅ Natif', true],
                  ['IA copilote', '❌', '✅ Claude', true],
                  ['Mobile responsive', 'Vieillot', '✅ Moderne 2026', true],
                  ['Telegram bot', '❌', '✅ OCR + RH', true],
                  ['Multi-pays OHADA', 'Limité', '✅ 17 pays', true],
                  ['Pays mondial', '✅ 80+', '⚠️ 18 ciblés', false],
                ].map(([critere, sage, lexora, lexoraWins]) => (
                  <tr key={critere as string} className={lexoraWins ? 'bg-blue-50/30' : ''}>
                    <td className="px-4 py-3 text-sm font-medium">{critere as string}</td>
                    <td className="px-4 py-3 text-sm text-center text-gray-600">{sage as string}</td>
                    <td className={`px-4 py-3 text-sm text-center font-medium ${lexoraWins ? 'text-blue-700' : ''}`}>{lexora as string}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 text-center bg-gradient-to-br from-blue-600 to-blue-800 text-white">
        <h2 className="text-4xl font-bold mb-4">Prêt à moderniser votre comptabilité OHADA ?</h2>
        <p className="text-xl mb-8 opacity-90">Démo gratuite, déploiement en 2 semaines</p>
        <a href="/rdv" className="inline-block px-8 py-4 bg-white text-blue-600 rounded-lg font-bold hover:shadow-lg">
          Demander une démo
        </a>
      </section>
    </div>
  )
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="bg-white p-6 rounded-lg border shadow-sm">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="font-bold text-lg mb-2">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  )
}
