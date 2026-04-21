"use client"

import { useState } from "react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { BalanceAgee } from "@/components/accounting/BalanceAgee"
import { Button } from "@/components/ui/button"

export default function BalanceAgeePage() {
  const { societeId } = useSocieteActive()
  const [tab, setTab] = useState<'client' | 'fournisseur'>('client')

  return (
    <ClientPageShell
      kicker="Comptabilité"
      title="Balance âgée"
      subtitle="Analyse des créances et dettes ouvertes, ventilées par ancienneté"
      breadcrumbs={[{ label: "Espace client", href: "/client" }, { label: "Balance âgée" }]}
    >
      <div className="flex gap-2 mb-4">
        <Button
          variant={tab === 'client' ? 'default' : 'outline'}
          onClick={() => setTab('client')}
        >
          Clients (411)
        </Button>
        <Button
          variant={tab === 'fournisseur' ? 'default' : 'outline'}
          onClick={() => setTab('fournisseur')}
        >
          Fournisseurs (401)
        </Button>
      </div>
      <BalanceAgee societeId={societeId} type={tab} />
    </ClientPageShell>
  )
}
