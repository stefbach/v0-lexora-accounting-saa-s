"use client"

import Link from "next/link"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Loader2,
  FileText,
} from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

export default function FinancesPage() {
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
        <Link href="/client/upload" className="text-sm underline" style={{ color: "#C9A84C" }}>
          Retour &agrave; l&apos;envoi de documents
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Mes Chiffres
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Suivez vos revenus, vos d&eacute;penses, la TVA et les salaires en un coup d&apos;oeil.
        </p>
      </div>

      <Tabs defaultValue="mensuel">
        <TabsList>
          <TabsTrigger value="mensuel">Mes Chiffres</TabsTrigger>
          <TabsTrigger value="tva">Ma TVA</TabsTrigger>
          <TabsTrigger value="salaires">Salaires &amp; Charges</TabsTrigger>
        </TabsList>

        {/* Tab 1 - Vue mensuelle */}
        <TabsContent value="mensuel" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total revenus
                </CardTitle>
                <TrendingUp className="h-5 w-5" style={{ color: "#22C55E" }} />
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Pas encore de donn&eacute;es</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total d&eacute;penses
                </CardTitle>
                <TrendingDown className="h-5 w-5" style={{ color: "#EF4444" }} />
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Pas encore de donn&eacute;es</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  R&eacute;sultat du mois
                </CardTitle>
                <DollarSign className="h-5 w-5" style={{ color: "#C9A84C" }} />
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Pas encore de donn&eacute;es</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="py-10">
              <div className="flex flex-col items-center justify-center text-center">
                <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Aucune donn&eacute;e de revenus ou de d&eacute;penses disponible pour le moment.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Vos chiffres appara&icirc;tront ici une fois vos documents comptables trait&eacute;s.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2 - Ma TVA */}
        <TabsContent value="tva" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <CardTitle style={{ color: "#1E2A4A" }}>Suivi de la TVA</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Aucune d&eacute;claration TVA disponible pour le moment.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Votre comptable remplira cette section au fur et &agrave; mesure des d&eacute;clarations.
                </p>
              </div>

              <div className="rounded-lg border p-4 bg-blue-50/50">
                <p className="text-sm" style={{ color: "#1E2A4A" }}>
                  <strong>Comment &ccedil;a marche ?</strong>
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  La TVA collect&eacute;e est celle que vos clients vous ont pay&eacute;e en plus de vos prix.
                  La TVA d&eacute;ductible est celle que vous avez pay&eacute;e sur vos achats professionnels.
                  La diff&eacute;rence (&quot;Je dois&quot;) est ce que vous devez reverser &agrave; la MRA chaque mois.
                  Votre comptable s&apos;occupe de faire la d&eacute;claration pour vous.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3 - Salaires & Charges */}
        <TabsContent value="salaires" className="space-y-6 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5" style={{ color: "#1E2A4A" }} />
                <CardTitle style={{ color: "#1E2A4A" }}>Salaires &amp; Charges mensuels</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Aucune donn&eacute;e de salaires disponible pour le moment.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Les informations de paie appara&icirc;tront ici une fois trait&eacute;es par votre comptable.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
