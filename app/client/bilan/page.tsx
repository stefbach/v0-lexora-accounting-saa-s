"use client"

import Link from "next/link"
import { useProfile } from "@/hooks/use-profile"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Building2,
  Landmark,
  Banknote,
  Users,
  Scale,
  FileText,
  CheckCircle2,
  Clock,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtMUR(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} MUR`
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const actifItems = [
  { label: "Équipement", montant: 850_000, icon: Building2 },
  { label: "Logiciels", montant: 350_000, icon: FileText },
  { label: "Argent en banque", montant: 773_000, icon: Banknote, details: [
    { label: "MCB", montant: 150_000 },
    { label: "SBM", montant: 65_000 },
    { label: "CIC", montant: 558_000, devise: "EUR" },
  ]},
  { label: "Clients qui vous doivent", montant: 396_000, icon: Users },
]

const passifItems = [
  { label: "Fournisseurs", montant: 228_000 },
  { label: "TVA à payer", montant: 129_000 },
  { label: "Cotisations", montant: 81_000 },
  { label: "Capital", montant: 100_000 },
  { label: "Bénéfices accumulés", montant: 1_831_000 },
]

const totalActif = actifItems.reduce((s, i) => s + i.montant, 0)
const totalPassif = passifItems.reduce((s, i) => s + i.montant, 0)
const isEquilibre = totalActif === totalPassif

const bilanStatus: "preparation" | "finalise" = "preparation"
const isPublished = false

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BilanPage() {
  const { profile } = useProfile()

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: "#1E2A4A" }}>
          Accès non autorisé
        </h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;avez pas la permission d&apos;accéder à cette page.
        </p>
        <Link href="/client/documents" className="text-sm underline" style={{ color: "#C9A84C" }}>
          Retour aux documents
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
            Mon Bilan
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Votre situation financière à la clôture de l&apos;exercice
          </p>
        </div>
        <div className="flex items-center gap-2">
          {bilanStatus === "preparation" ? (
            <Badge className="bg-orange-100 text-orange-700 border-orange-200">
              <Clock className="h-3 w-3 mr-1" />
              En préparation
            </Badge>
          ) : (
            <Badge className="bg-green-100 text-green-700 border-green-200">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Finalisé
            </Badge>
          )}
          {isEquilibre && (
            <Badge className="bg-green-100 text-green-700 border-green-200">
              <Scale className="h-3 w-3 mr-1" />
              Équilibré
            </Badge>
          )}
        </div>
      </div>

      {/* Not published notice */}
      {!isPublished && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-orange-500 shrink-0" />
              <p className="text-sm text-orange-700">
                En cours de préparation par votre comptable
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Two-section layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Actif */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2" style={{ color: "#1E2A4A" }}>
              <Landmark className="h-5 w-5" style={{ color: "#C9A84C" }} />
              Ce que vous possédez
            </CardTitle>
            <p className="text-xs text-muted-foreground">Actif</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {actifItems.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{item.label}</span>
                    </div>
                    <span className="text-sm font-semibold" style={{ color: "#1E2A4A" }}>
                      {fmtMUR(item.montant)}
                    </span>
                  </div>
                  {item.details && (
                    <div className="ml-6 space-y-0.5">
                      {item.details.map((d) => (
                        <div key={d.label} className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{d.label}{d.devise ? ` (${d.devise})` : ""}</span>
                          <span>{fmtMUR(d.montant)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <div className="border-t pt-3 flex items-center justify-between">
              <span className="text-sm font-bold" style={{ color: "#1E2A4A" }}>Total Actif</span>
              <span className="text-base font-bold" style={{ color: "#C9A84C" }}>
                {fmtMUR(totalActif)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Passif */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2" style={{ color: "#1E2A4A" }}>
              <Banknote className="h-5 w-5" style={{ color: "#C9A84C" }} />
              Ce que vous devez
            </CardTitle>
            <p className="text-xs text-muted-foreground">Passif</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {passifItems.map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-sm">{item.label}</span>
                <span className="text-sm font-semibold" style={{ color: "#1E2A4A" }}>
                  {fmtMUR(item.montant)}
                </span>
              </div>
            ))}
            <div className="border-t pt-3 flex items-center justify-between">
              <span className="text-sm font-bold" style={{ color: "#1E2A4A" }}>Total Passif</span>
              <span className="text-base font-bold" style={{ color: "#C9A84C" }}>
                {fmtMUR(totalPassif)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer note */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground italic">
          Préparé par votre comptable — Exercice 2025-2026
        </p>
      </div>
    </div>
  )
}
