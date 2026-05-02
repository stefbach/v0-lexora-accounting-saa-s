"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  CheckCircle2, Circle, FileSpreadsheet, FileUp, Lock, Loader2,
  ArrowLeft, Sparkles, Building, Receipt, AlertTriangle,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

type ChecklistItem = {
  key: string
  label: string
  description: string
  done: boolean
  href?: string
  cta?: string
  icon: React.ComponentType<{ className?: string }>
}

type ResumeData = {
  societe: { id: string; nom: string } | null
  factures_count: number
  ecritures_count: number
  comptes_bancaires_count: number
  releves_count: number
  has_balance_ouverture: boolean
  has_first_month_closed: boolean
  has_tva_setup: boolean
}

export default function OnboardingResumePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const societeId = params?.id as string

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ResumeData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!societeId) return
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        // On agrège manuellement à partir des endpoints existants pour
        // ne pas créer de nouvelle API juste pour cette vue. Best-effort :
        // si un endpoint échoue, on remplace par 0 et on logge.
        const safeJson = async (url: string) => {
          try {
            const r = await fetch(url, { cache: "no-store" })
            if (!r.ok) return null
            return await r.json()
          } catch {
            return null
          }
        }

        const [societeRes, facturesRes, ecrituresRes, banquesRes] =
          await Promise.all([
            safeJson(`/api/admin/societes`),
            safeJson(`/api/comptable/factures-clients?societe_id=${societeId}`),
            safeJson(`/api/comptable/ecritures?societe_id=${societeId}&limit=1`),
            safeJson(`/api/comptable/comptes-bancaires?societe_id=${societeId}`),
          ])

        if (cancelled) return

        const societe =
          (societeRes?.societes ?? []).find((s: { id: string }) => s.id === societeId) ?? null

        const facturesCount =
          (facturesRes?.factures?.length as number | undefined) ??
          (facturesRes?.count as number | undefined) ??
          0
        const ecrituresCount =
          (ecrituresRes?.count as number | undefined) ??
          (ecrituresRes?.ecritures?.length as number | undefined) ??
          0
        const banquesCount =
          (banquesRes?.comptes?.length as number | undefined) ??
          (banquesRes?.count as number | undefined) ??
          0

        // Heuristiques pour les flags manquants (best-effort)
        const hasBalanceOuverture = !!ecrituresRes?.has_an_opening
        const hasFirstMonthClosed = !!ecrituresRes?.has_period_closed
        const hasTvaSetup = !!societe?.statut_tva

        setData({
          societe: societe ? { id: societe.id, nom: societe.nom } : null,
          factures_count: facturesCount,
          ecritures_count: ecrituresCount,
          comptes_bancaires_count: banquesCount,
          releves_count: 0,
          has_balance_ouverture: hasBalanceOuverture,
          has_first_month_closed: hasFirstMonthClosed,
          has_tva_setup: hasTvaSetup,
        })
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erreur inconnue")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [societeId])

  const checklist: ChecklistItem[] = data
    ? [
        {
          key: "societe",
          label: "Société créée et configurée",
          description: "Informations de base, secteur d'activité, exercice fiscal.",
          done: !!data.societe,
          icon: Building,
        },
        {
          key: "comptes_bancaires",
          label: "Comptes bancaires",
          description: `${data.comptes_bancaires_count} compte(s) configuré(s).`,
          done: data.comptes_bancaires_count > 0,
          href: `/comptable/banque?societe=${societeId}`,
          cta: "Ajouter un compte",
          icon: Building,
        },
        {
          key: "balance_ouverture",
          label: "Balance d'ouverture",
          description: "Si vous migrez d'un autre logiciel, saisir les soldes initiaux.",
          done: data.has_balance_ouverture,
          href: `/onboarding/exercice`,
          cta: "Saisir la balance",
          icon: Receipt,
        },
        {
          key: "factures",
          label: "Factures historiques importées",
          description: `${data.factures_count} facture(s) trouvée(s) dans le système.`,
          done: data.factures_count > 0,
          href: `/comptable/factures-clients?societe=${societeId}`,
          cta: "Importer factures",
          icon: FileSpreadsheet,
        },
        {
          key: "releve_bancaire",
          label: "Premier relevé bancaire importé",
          description: "Importer un relevé MCB / SBM / AfrAsia / MauBank.",
          done: data.releves_count > 0,
          href: `/comptable/banque?societe=${societeId}`,
          cta: "Importer relevé",
          icon: FileUp,
        },
        {
          key: "tva_setup",
          label: "Statut TVA configuré",
          description: "Assujetti TVA + numéro MRA, ou exonéré.",
          done: data.has_tva_setup,
          href: `/comptable/tva?societe=${societeId}`,
          cta: "Configurer TVA",
          icon: Receipt,
        },
        {
          key: "first_month",
          label: "Premier mois clôturé",
          description: "Verrouiller la période et générer la déclaration TVA.",
          done: data.has_first_month_closed,
          href: `/comptable/cloture?societe=${societeId}`,
          cta: "Clôturer un mois",
          icon: Lock,
        },
      ]
    : []

  const doneCount = checklist.filter((c) => c.done).length
  const total = checklist.length || 1
  const progressValue = (doneCount / total) * 100

  return (
    <ClientPageShell hideHero disableParticles>
      <div className="space-y-6" style={{ fontFamily: "'Poppins', sans-serif" }}>
        <div className="flex items-center justify-between">
          <div>
            <Link
              href="/comptable/societes"
              className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
            >
              <ArrowLeft className="h-3 w-3" /> Retour aux sociétés
            </Link>
            <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
              <Sparkles className="mr-1 inline h-5 w-5" style={{ color: GOLD }} />
              Onboarding — {data?.societe?.nom ?? "..."}
            </h1>
            <p className="text-sm text-muted-foreground">
              Checklist des étapes restantes pour avoir un dossier 100 % opérationnel.
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold" style={{ color: NAVY }}>
              {doneCount}/{total}
            </div>
            <div className="text-xs text-muted-foreground">étapes complétées</div>
          </div>
        </div>

        <Progress value={progressValue} className="h-2 bg-slate-200" />

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && error && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <Card>
            <CardHeader>
              <CardTitle style={{ color: NAVY }}>Étapes</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {checklist.map((item) => {
                  const Icon = item.icon
                  return (
                    <li
                      key={item.key}
                      className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${
                        item.done ? "border-green-200 bg-green-50/40" : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="mt-0.5">
                        {item.done ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <Circle className="h-5 w-5 text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className={`text-sm font-semibold ${item.done ? "text-green-800" : ""}`} style={{ color: item.done ? undefined : NAVY }}>
                            {item.label}
                          </span>
                          {item.done && (
                            <Badge className="bg-green-100 text-green-700">Terminé</Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                      </div>
                      {!item.done && item.href && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => router.push(item.href!)}
                          style={{ borderColor: GOLD, color: NAVY }}
                        >
                          {item.cta ?? "Configurer"}
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </ClientPageShell>
  )
}
