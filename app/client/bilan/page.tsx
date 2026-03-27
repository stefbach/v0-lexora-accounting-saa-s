"use client"

import Link from "next/link"
import { useProfile } from "@/hooks/use-profile"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Landmark,
  Banknote,
  Loader2,
  FileText,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BilanPage() {
  const { profile, loading } = useProfile()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} />
      </div>
    )
  }

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: "#1E2A4A" }}>
          Acc&egrave;s non autoris&eacute;
        </h1>
        <p className="text-sm text-muted-foreground">
          Vous n&apos;avez pas la permission d&apos;acc&eacute;der &agrave; cette page.
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
            Votre situation financi&egrave;re &agrave; la cl&ocirc;ture de l&apos;exercice
          </p>
        </div>
      </div>

      {/* Empty state */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Actif */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2" style={{ color: "#1E2A4A" }}>
              <Landmark className="h-5 w-5" style={{ color: "#C9A84C" }} />
              Ce que vous poss&eacute;dez
            </CardTitle>
            <p className="text-xs text-muted-foreground">Actif</p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                Aucune donn&eacute;e d&apos;actif disponible pour le moment.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Votre comptable pr&eacute;parera votre bilan en fin d&apos;exercice.
              </p>
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
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                Aucune donn&eacute;e de passif disponible pour le moment.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Votre comptable pr&eacute;parera votre bilan en fin d&apos;exercice.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer note */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground italic">
          Pr&eacute;par&eacute; par votre comptable
        </p>
      </div>
    </div>
  )
}
