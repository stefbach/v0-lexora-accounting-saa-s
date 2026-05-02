"use client"

/**
 * OnboardingShell — layout commun pour le wizard d'onboarding (4 étapes).
 *
 * Fournit :
 *  - Un header (logo Lexora + numéro d'étape)
 *  - Une progress bar 4 steps
 *  - Une zone de contenu pour la step courante
 *  - Des boutons back / next standardisés
 *  - Un store sessionStorage pour persister le brouillon entre étapes
 *
 * Utilisation côté page :
 *
 *   <OnboardingShell step={1} title="Votre société" onNext={handleNext} canNext={...}>
 *     ...formulaire...
 *   </OnboardingShell>
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

export type OnboardingStep = 1 | 2 | 3 | 4

const STEPS: { num: OnboardingStep; key: string; label: string; href: string }[] = [
  { num: 1, key: "societe",          label: "Société",         href: "/onboarding/societe" },
  { num: 2, key: "comptes-bancaires", label: "Comptes bancaires", href: "/onboarding/comptes-bancaires" },
  { num: 3, key: "exercice",         label: "Exercice",        href: "/onboarding/exercice" },
  { num: 4, key: "done",             label: "Terminé",         href: "/onboarding/done" },
]

export type OnboardingShellProps = {
  step: OnboardingStep
  title: string
  subtitle?: string
  children: React.ReactNode

  /** Hook back. Default = navigate to previous step. */
  onBack?: () => void
  /** Hook next. Default = navigate to next step. */
  onNext?: () => void | Promise<void>

  /** Si false, désactive le bouton next */
  canNext?: boolean
  /** Si true, affiche un loader sur le bouton next */
  loading?: boolean
  /** Texte custom pour le bouton next */
  nextLabel?: string
  /** Cache le bouton back (utile sur step 1) */
  hideBack?: boolean
  /** Cache le bouton next (utile pour la step "done" qui a ses propres CTA) */
  hideNext?: boolean
}

export function OnboardingShell({
  step,
  title,
  subtitle,
  children,
  onBack,
  onNext,
  canNext = true,
  loading = false,
  nextLabel,
  hideBack = false,
  hideNext = false,
}: OnboardingShellProps) {
  const router = useRouter()

  const progressValue = (step / STEPS.length) * 100
  const currentIndex = STEPS.findIndex((s) => s.num === step)

  const handleBack = () => {
    if (onBack) return onBack()
    if (currentIndex > 0) router.push(STEPS[currentIndex - 1].href)
  }

  const handleNext = async () => {
    if (onNext) return onNext()
    if (currentIndex < STEPS.length - 1) router.push(STEPS[currentIndex + 1].href)
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50/30"
      style={{ fontFamily: "'Poppins', sans-serif" }}
    >
      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: GOLD }}>
              Lexora — Onboarding
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Étape {step} sur {STEPS.length}
            </div>
          </div>
          <div className="hidden gap-1 sm:flex">
            {STEPS.map((s) => {
              const done = s.num < step
              const active = s.num === step
              return (
                <div
                  key={s.key}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                    done && "text-white",
                    active && "ring-2 ring-offset-2",
                    !done && !active && "bg-slate-100 text-slate-400",
                  )}
                  style={{
                    backgroundColor: done ? GOLD : active ? NAVY : undefined,
                    color: done ? "#fff" : active ? "#fff" : undefined,
                  }}
                  aria-label={s.label}
                  title={s.label}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : s.num}
                </div>
              )
            })}
          </div>
        </div>

        {/* Progress */}
        <Progress value={progressValue} className="mb-8 h-1.5 bg-slate-200" />

        {/* Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold" style={{ color: NAVY }}>
            {title}
          </h1>
          {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
        </div>

        {/* Content */}
        <div className="rounded-xl border bg-white p-6 shadow-sm sm:p-8">
          {children}
        </div>

        {/* Footer actions */}
        {(!hideBack || !hideNext) && (
          <div className="mt-6 flex items-center justify-between">
            {!hideBack ? (
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={loading || step === 1}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Retour
              </Button>
            ) : <div />}

            {!hideNext && (
              <Button
                onClick={handleNext}
                disabled={!canNext || loading}
                style={{ backgroundColor: GOLD, color: NAVY }}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    {nextLabel ?? "Continuer"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Draft persistence (sessionStorage)
// ────────────────────────────────────────────────────────────────────────────

const DRAFT_KEY = "lexora.onboarding.draft.v1"

export type OnboardingDraft = {
  societe?: {
    nom: string
    brn: string
    adresse: string
    secteur: string
    devise_principale: string
    exercice_type: 'fiscal_jul_jun' | 'calendaire'
    statut_tva: boolean
    numero_tva_mra?: string
  }
  comptes_bancaires?: Array<{
    banque: string
    nom_compte: string
    numero_compte: string
    iban: string
    devise: string
    solde_initial: number
    compte_principal: boolean
  }>
  exercice?: {
    date_debut: string
    date_fin: string
    saisie_balance_ouverture: boolean
    balance_ouverture?: Array<{ compte: string; libelle: string; debit: number; credit: number }>
  }
  societe_id?: string
}

export function loadDraft(): OnboardingDraft {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as OnboardingDraft
  } catch {
    return {}
  }
}

export function saveDraft(patch: Partial<OnboardingDraft>): OnboardingDraft {
  if (typeof window === 'undefined') return {}
  const current = loadDraft()
  const next = { ...current, ...patch }
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next))
  } catch {
    // sessionStorage may be disabled — ignore
  }
  return next
}

export function clearDraft() {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    // ignore
  }
}
