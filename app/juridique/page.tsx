"use client"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale } from "@/lib/i18n"

export default function JuridiquePage() {
  const locale = getLocale()
  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0B0F2E]">{t('pub.juridique.title', locale)}</h1>
        <p className="text-sm text-gray-500">{t('pub.juridique.subtitle', locale)}</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[
          { href: '/juridique/contrats', icon: '📄', label: t('pub.juridique.contracts', locale), desc: t('pub.juridique.contracts_desc', locale) },
          { href: '/juridique/documents', icon: '📁', label: t('pub.juridique.documents', locale), desc: t('pub.juridique.documents_desc', locale) },
          { href: '/juridique/conformite', icon: '✅', label: t('pub.juridique.compliance', locale), desc: t('pub.juridique.compliance_desc', locale) },
          { href: '/rh/employes', icon: '👥', label: t('pub.juridique.employees', locale), desc: t('pub.juridique.employees_desc', locale) },
        ].map(item => (
          <Link key={item.href} href={item.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-[#0B0F2E]">
              <CardContent className="p-5">
                <p className="text-3xl mb-2">{item.icon}</p>
                <p className="font-bold text-[#0B0F2E]">{item.label}</p>
                <p className="text-xs text-gray-500 mt-1">{item.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
    </ClientPageShell>
  )
}
