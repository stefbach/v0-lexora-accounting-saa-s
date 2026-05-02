"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  CheckCircle2, FileSpreadsheet, FileUp, LayoutDashboard, Sparkles,
} from "lucide-react"
import { OnboardingShell, loadDraft, clearDraft } from "@/components/onboarding/OnboardingShell"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

export default function OnboardingDonePage() {
  const router = useRouter()
  const [societeId, setSocieteId] = useState<string | null>(null)
  const [societeNom, setSocieteNom] = useState<string>("")
  const [nbComptes, setNbComptes] = useState(0)

  useEffect(() => {
    const d = loadDraft()
    if (!d.societe_id) {
      // Si pas d'ID en draft → onboarding incomplet, retour début
      router.replace("/onboarding/societe")
      return
    }
    setSocieteId(d.societe_id)
    setSocieteNom(d.societe?.nom ?? "")
    setNbComptes(d.comptes_bancaires?.length ?? 0)
  }, [router])

  const goImportFactures = () => {
    if (societeId) {
      // On nettoie le draft : l'onboarding est terminé
      clearDraft()
      router.push(`/comptable/factures-clients?societe=${societeId}`)
    }
  }

  const goImportReleve = () => {
    if (societeId) {
      clearDraft()
      router.push(`/comptable/banque?societe=${societeId}`)
    }
  }

  const goDashboard = () => {
    clearDraft()
    router.push("/comptable")
  }

  return (
    <OnboardingShell
      step={4}
      title="Tout est prêt !"
      subtitle={societeNom ? `${societeNom} est créée et configurée. Voici les prochaines étapes recommandées.` : "Société créée avec succès."}
      hideBack
      hideNext
    >
      <div className="space-y-6">
        <div
          className="rounded-lg border-2 border-dashed p-6 text-center"
          style={{ borderColor: GOLD, backgroundColor: "#FFFBEA" }}
        >
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: GOLD }}>
            <CheckCircle2 className="h-6 w-6 text-white" />
          </div>
          <h2 className="text-lg font-bold" style={{ color: NAVY }}>
            <Sparkles className="mr-1 inline h-4 w-4" style={{ color: GOLD }} />
            Société configurée
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Plan comptable PCM Maurice initialisé{nbComptes > 0 ? ` · ${nbComptes} compte${nbComptes > 1 ? "s" : ""} bancaire${nbComptes > 1 ? "s" : ""}` : ""}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card
            className="group cursor-pointer p-5 transition-all hover:border-amber-300 hover:shadow-md"
            onClick={goImportFactures}
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
              <FileSpreadsheet className="h-5 w-5" style={{ color: NAVY }} />
            </div>
            <h3 className="text-sm font-semibold" style={{ color: NAVY }}>
              Importer factures historiques
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              CSV, Excel ou PDF. On classifie automatiquement.
            </p>
            <div className="mt-3 text-xs font-semibold uppercase" style={{ color: GOLD }}>
              Démarrer →
            </div>
          </Card>

          <Card
            className="group cursor-pointer p-5 transition-all hover:border-amber-300 hover:shadow-md"
            onClick={goImportReleve}
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <FileUp className="h-5 w-5" style={{ color: NAVY }} />
            </div>
            <h3 className="text-sm font-semibold" style={{ color: NAVY }}>
              Importer relevé bancaire
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              MCB, SBM, AfrAsia, MauBank — formats auto-détectés.
            </p>
            <div className="mt-3 text-xs font-semibold uppercase" style={{ color: GOLD }}>
              Démarrer →
            </div>
          </Card>

          <Card
            className="group cursor-pointer p-5 transition-all hover:border-amber-300 hover:shadow-md"
            onClick={goDashboard}
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
              <LayoutDashboard className="h-5 w-5" style={{ color: NAVY }} />
            </div>
            <h3 className="text-sm font-semibold" style={{ color: NAVY }}>
              Aller au tableau de bord
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Explorer Lexora et configurer plus tard.
            </p>
            <div className="mt-3 text-xs font-semibold uppercase" style={{ color: GOLD }}>
              Y aller →
            </div>
          </Card>
        </div>

        {societeId && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              onClick={() => {
                clearDraft()
                router.push(`/comptable/societes/${societeId}/onboarding-resume`)
              }}
            >
              Voir la checklist d&apos;onboarding restante
            </Button>
          </div>
        )}
      </div>
    </OnboardingShell>
  )
}
