"use client"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"

export default function JuridiquePage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#2D1E4A]">Module Juridique</h1>
        <p className="text-sm text-gray-500">Gestion des contrats, conformité et documents juridiques</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[
          { href: '/juridique/contrats', icon: '📄', label: 'Contrats', desc: 'Contrats de travail, NDAs, baux' },
          { href: '/juridique/documents', icon: '📁', label: 'Documents', desc: 'Registres légaux, statuts, procès-verbaux' },
          { href: '/juridique/conformite', icon: '✅', label: 'Conformité', desc: 'GDPR, Companies Act, MRA' },
          { href: '/rh/employes', icon: '👥', label: 'Employés', desc: 'Accès lecture — fiches employés' },
        ].map(item => (
          <Link key={item.href} href={item.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-[#2D1E4A]">
              <CardContent className="p-5">
                <p className="text-3xl mb-2">{item.icon}</p>
                <p className="font-bold text-[#2D1E4A]">{item.label}</p>
                <p className="text-xs text-gray-500 mt-1">{item.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
