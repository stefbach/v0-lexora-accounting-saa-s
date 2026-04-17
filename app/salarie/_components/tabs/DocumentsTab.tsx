"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FolderOpen } from "lucide-react"
import { NAVY, GOLD } from "../shared/constants"

// Placeholder extrait du monolithe page.tsx pendant le sprint-salarie V0.1.
// Sera remplacé en V1.5 par la vraie UI de lecture des documents RH
// (GET /api/salarie/documents?employe_id=...).
export function DocumentsTab({ employe: _employe }: { employe: any }) {
  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
          <FolderOpen className="h-4 w-4" style={{ color: GOLD }} />
          Mes documents
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-16 w-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: `${GOLD}15` }}>
            <FolderOpen className="h-7 w-7" style={{ color: GOLD }} />
          </div>
          <p className="text-base font-semibold mb-1" style={{ color: NAVY }}>
            Fonctionnalité à venir 🚧
          </p>
          <p className="text-sm text-gray-500 max-w-sm">
            L&apos;espace de gestion de vos documents personnels
            (contrats, certificats, fiches d&apos;identité…) arrive bientôt.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
