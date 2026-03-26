"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Construction } from "lucide-react"

export default function MesComptesPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#1E2A4A" }}>Mes Comptes Bancaires</h1>
        <p className="text-sm text-muted-foreground mt-1">Vue de vos comptes bancaires et trésorerie consolidée</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2" style={{ color: "#1E2A4A" }}>
            <Construction className="h-5 w-5" style={{ color: "#C9A84C" }} />
            En cours de développement
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Cette fonctionnalité sera disponible très prochainement.</p>
        </CardContent>
      </Card>
    </div>
  )
}
