"use client"

import Link from "next/link"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileText, CalendarClock, AlertTriangle, CheckCircle } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

export default function FiscalFreelancePage() {
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
        <Link href="/client/upload" className="text-sm underline" style={{ color: "#C9A84C" }}>
          Retour à l&apos;envoi de documents
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Mes Obligations Fiscales
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tout ce que vous devez savoir sur vos impôts et déclarations.
        </p>
      </div>

      {/* Déclaration annuelle */}
      <Card className="border-2" style={{ borderColor: "#C9A84C" }}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "#C9A84C20" }}>
              <FileText className="h-5 w-5" style={{ color: "#C9A84C" }} />
            </div>
            <div>
              <CardTitle style={{ color: "#1E2A4A" }}>Déclaration d&apos;impôt annuelle</CardTitle>
              <Badge className="bg-green-100 text-green-700 border-green-200 mt-1">
                <CheckCircle className="h-3 w-3 mr-1" />
                Votre comptable s&apos;en occupe
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg p-4" style={{ backgroundColor: "#1E2A4A08" }}>
            <p className="text-sm" style={{ color: "#1E2A4A" }}>
              Votre déclaration d&apos;impôt annuelle est à soumettre avant le{" "}
              <strong>30 septembre 2026</strong>.
              Votre comptable s&apos;en occupe. Vous n&apos;avez rien à faire de votre côté,
              sauf vous assurer que tous vos documents sont bien envoyés.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <CalendarClock className="h-5 w-5" style={{ color: "#1E2A4A" }} />
            <div>
              <p className="text-sm font-medium" style={{ color: "#1E2A4A" }}>Date limite</p>
              <p className="text-sm text-muted-foreground">30 septembre 2026</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-sm font-medium" style={{ color: "#1E2A4A" }}>Statut actuel</p>
              <p className="text-sm text-muted-foreground">
                En préparation par votre comptable
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Seuil TVA */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5" style={{ color: "#C9A84C" }} />
            <CardTitle style={{ color: "#1E2A4A" }}>TVA — Êtes-vous concerné ?</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 bg-yellow-50/50">
            <p className="text-sm" style={{ color: "#1E2A4A" }}>
              <strong>Le seuil TVA à Maurice est de 6 000 000 MUR par an.</strong>
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Si votre chiffre d&apos;affaires dépasse ce montant, vous devez vous enregistrer à la TVA
              auprès de la MRA. En dessous de ce seuil, l&apos;enregistrement est volontaire.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="py-4">
                <p className="text-sm text-muted-foreground">Votre chiffre d&apos;affaires estimé</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "#1E2A4A" }}>
                  3 360 000 MUR
                </p>
                <Badge className="bg-green-100 text-green-700 border-green-200 mt-2">
                  Sous le seuil
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-sm text-muted-foreground">Seuil TVA</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "#1E2A4A" }}>
                  6 000 000 MUR
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Vous n&apos;êtes pas obligé de vous enregistrer
                </p>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">
            Ces chiffres sont indicatifs. Votre comptable vous conseillera si vous approchez du seuil.
          </p>
        </CardContent>
      </Card>

      {/* Rappel simple */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm" style={{ color: "#1E2A4A" }}>
            Ce que vous devez retenir
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                Envoyez vos factures et reçus régulièrement sur Lexora.
              </p>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                Votre comptable prépare et soumet votre déclaration pour vous.
              </p>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                Si vous avez un doute, posez la question à votre comptable via la messagerie.
              </p>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
