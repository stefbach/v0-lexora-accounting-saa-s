import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, UserCog, Building2 } from "lucide-react"
import Link from "next/link"

export default function AdminDashboardPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>
          Tableau de bord administrateur
        </h1>
        <p className="text-muted-foreground mt-1">
          Gestion de la plateforme Lexora
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/admin/clients">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Clients</CardTitle>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: "#C9A84C15" }}>
                <Users className="h-5 w-5" style={{ color: "#C9A84C" }} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Créer, modifier et gérer les comptes clients et sociétés</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/comptables">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Comptables</CardTitle>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: "#1E2A4A15" }}>
                <UserCog className="h-5 w-5" style={{ color: "#1E2A4A" }} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Gérer les comptables principaux et dédiés</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/parametres">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Paramètres</CardTitle>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: "#1E2A4A15" }}>
                <Building2 className="h-5 w-5" style={{ color: "#1E2A4A" }} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Configuration de la plateforme et notifications</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  )
}
