"use client"

/**
 * Assistant de démarrage — /client/demarrage (cible dirigeant autonome, lever 3).
 *
 * Parcours guidé « une chose à la fois » qui amène un dirigeant tout neuf de
 * zéro à opérationnel :
 *   1. Votre société   (formulaire inline : exercice + TVA + secteur)
 *   2. Votre banque    (import du 1er relevé)
 *   3. Premier document (1re facture via l'OCR)
 *   4. Prêt à démarrer  (récap + accès tableau de bord)
 *
 * Reprend automatiquement à la première étape non faite (signaux réels de
 * /api/client/onboarding-status). Logique de parcours : lib/onboarding/wizard.ts.
 */

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Rocket, Building2, Landmark, FileText, PartyPopper, CheckCircle2, Circle,
  ArrowRight, ArrowLeft, Loader2, RefreshCw, ExternalLink, Sparkles,
} from "lucide-react"
import {
  WIZARD_STEPS, NB_ETAPES_ACTION, firstIncompleteStep, nbEtapesFaites,
} from "@/lib/onboarding/wizard"
import type { OnboardingSignals } from "@/lib/onboarding/checklist"

const NAVY = "#0B0F2E"

const SECTEURS = [
  "Commerce", "Services", "Restauration", "Tourisme", "Construction / BTP",
  "Technologies de l'information", "Santé", "Immobilier", "Transport",
  "Agriculture", "Industrie / Manufacturing", "Finance", "Autre",
]

const STEP_ICONS = [Building2, Landmark, FileText, PartyPopper]

interface Signals extends OnboardingSignals {}
interface SocieteProfil {
  id: string
  nom?: string
  date_debut_exercice?: string | null
  date_fin_exercice?: string | null
  numero_tva_mra?: string | null
  statut_tva?: boolean | null
  secteur_activite?: string | null
}

export default function DemarragePage() {
  const { societeId, societe } = useSocieteActive()
  const [signals, setSignals] = useState<Signals | null>(null)
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)

  // Étape 1 — profil
  const [profil, setProfil] = useState<SocieteProfil | null>(null)
  const [assujettiTva, setAssujettiTva] = useState<"oui" | "non">("non")
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const chargerSignals = useCallback(async (): Promise<Signals | null> => {
    if (!societeId) return null
    try {
      const r = await fetch(`/api/client/onboarding-status?societe_id=${societeId}`)
      const d = await r.json()
      if (d?.signals) { setSignals(d.signals); return d.signals as Signals }
    } catch { /* silencieux */ }
    return null
  }, [societeId])

  // Chargement initial : signaux + profil société, puis reprise sur 1re étape à faire.
  useEffect(() => {
    if (!societeId) { setLoading(false); return }
    let annule = false
    ;(async () => {
      setLoading(true)
      const [s] = await Promise.all([
        chargerSignals(),
        (async () => {
          try {
            const r = await fetch(`/api/client/societes`)
            const list = await r.json()
            const found = Array.isArray(list) ? list.find((x: any) => x.id === societeId) : null
            if (!annule && found) {
              setProfil(found)
              setAssujettiTva(found.numero_tva_mra && String(found.numero_tva_mra).trim() ? "oui" : "non")
            }
          } catch { /* silencieux */ }
        })(),
      ])
      if (annule) return
      if (s) setStep(firstIncompleteStep(s))
      setLoading(false)
    })()
    return () => { annule = true }
  }, [societeId, chargerSignals])

  const verifier = useCallback(async () => {
    setChecking(true)
    const s = await chargerSignals()
    setChecking(false)
    // Avance automatiquement si l'étape courante est désormais faite.
    if (s) {
      const st = WIZARD_STEPS[step]
      if (st && !st.finale && st.signal && s[st.signal]) {
        setStep(v => Math.min(v + 1, WIZARD_STEPS.length - 1))
      }
    }
  }, [chargerSignals, step])

  async function enregistrerProfil() {
    if (!societeId || !profil) return
    setSaving(true); setSaveMsg(null)
    try {
      const body: Record<string, unknown> = {
        date_debut_exercice: profil.date_debut_exercice || null,
        date_fin_exercice: profil.date_fin_exercice || null,
        secteur_activite: profil.secteur_activite || null,
        statut_tva: assujettiTva === "oui",
        numero_tva_mra: assujettiTva === "oui" ? (profil.numero_tva_mra || null) : null,
      }
      const r = await fetch(`/api/client/societes?id=${societeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || "Enregistrement impossible")
      setSaveMsg({ ok: true, text: "Profil enregistré." })
      const s = await chargerSignals()
      if (s?.profil_complet) setStep(v => Math.min(v + 1, WIZARD_STEPS.length - 1))
    } catch (e: any) {
      setSaveMsg({ ok: false, text: e?.message || "Erreur" })
    } finally {
      setSaving(false)
    }
  }

  if (!societeId) {
    return (
      <ClientPageShell>
        <Card><CardContent className="py-10 text-center text-slate-500">
          Sélectionnez d'abord une société.
        </CardContent></Card>
      </ClientPageShell>
    )
  }

  const faites = signals ? nbEtapesFaites(signals) : 0
  const pct = Math.round((faites / NB_ETAPES_ACTION) * 100)
  const current = WIZARD_STEPS[step]

  return (
    <ClientPageShell>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* En-tête */}
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl flex items-center justify-center" style={{ background: NAVY }}>
            <Rocket className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold" style={{ color: NAVY }}>Assistant de démarrage</h1>
            <p className="text-sm text-slate-500">
              {societe?.nom ? `${societe.nom} — ` : ""}quelques étapes pour être opérationnel.
            </p>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex items-center">
          {WIZARD_STEPS.map((s, i) => {
            const Icon = STEP_ICONS[i]
            const fait = signals && !s.finale && s.signal ? !!signals[s.signal] : false
            const actif = i === step
            return (
              <div key={s.key} className="flex items-center flex-1 last:flex-none">
                <button
                  onClick={() => setStep(i)}
                  className="flex flex-col items-center gap-1 group"
                  title={s.titre}
                >
                  <div
                    className={`h-9 w-9 rounded-full flex items-center justify-center border-2 transition-colors ${
                      fait ? "bg-emerald-500 border-emerald-500 text-white"
                        : actif ? "border-[color:var(--navy)] text-[color:var(--navy)]"
                        : "border-slate-300 text-slate-400"
                    }`}
                    style={{ ["--navy" as any]: NAVY }}
                  >
                    {fait ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span className={`text-[11px] leading-tight text-center max-w-[80px] ${actif ? "font-semibold" : "text-slate-500"}`}>
                    {s.titre}
                  </span>
                </button>
                {i < WIZARD_STEPS.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-1 mb-5 ${fait ? "bg-emerald-500" : "bg-slate-200"}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* Barre de progression globale */}
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-slate-500 whitespace-nowrap">{faites}/{NB_ETAPES_ACTION} · {pct}%</span>
        </div>

        {loading ? (
          <Card><CardContent className="py-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </CardContent></Card>
        ) : (
          <Card className="border-t-4" style={{ borderTopColor: NAVY }}>
            {/* ÉTAPE 1 — PROFIL */}
            {current?.key === "profil" && (
              <>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Building2 className="h-5 w-5" style={{ color: NAVY }} /> Votre société
                  </CardTitle>
                  <p className="text-sm text-slate-500">
                    Ces informations rendent vos calculs et vos échéances fiscales justes dès le départ.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="deb">Début d'exercice comptable</Label>
                      <Input id="deb" type="date"
                        value={profil?.date_debut_exercice ?? ""}
                        onChange={e => setProfil(p => p ? { ...p, date_debut_exercice: e.target.value } : p)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="fin">Clôture d'exercice (fin)</Label>
                      <Input id="fin" type="date"
                        value={profil?.date_fin_exercice ?? ""}
                        onChange={e => setProfil(p => p ? { ...p, date_fin_exercice: e.target.value } : p)} />
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 -mt-2">
                    À Maurice, l'exercice court souvent du 1ᵉʳ juillet au 30 juin — mais choisissez vos dates réelles.
                  </p>

                  <div className="space-y-1.5">
                    <Label>Secteur d'activité</Label>
                    <Select
                      value={profil?.secteur_activite ?? ""}
                      onValueChange={v => setProfil(p => p ? { ...p, secteur_activite: v } : p)}
                    >
                      <SelectTrigger><SelectValue placeholder="Choisir un secteur" /></SelectTrigger>
                      <SelectContent>
                        {SECTEURS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Êtes-vous assujetti à la TVA (MRA) ?</Label>
                    <Select value={assujettiTva} onValueChange={v => setAssujettiTva(v as "oui" | "non")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="non">Non — pas de numéro de TVA</SelectItem>
                        <SelectItem value="oui">Oui — j'ai un numéro de TVA MRA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {assujettiTva === "oui" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="tva">Numéro de TVA MRA</Label>
                      <Input id="tva" placeholder="Ex. 27… "
                        value={profil?.numero_tva_mra ?? ""}
                        onChange={e => setProfil(p => p ? { ...p, numero_tva_mra: e.target.value } : p)} />
                    </div>
                  )}

                  {saveMsg && (
                    <p className={`text-sm ${saveMsg.ok ? "text-emerald-600" : "text-red-600"}`}>{saveMsg.text}</p>
                  )}

                  <div className="flex justify-between pt-2">
                    <Button variant="ghost" onClick={() => setStep(v => Math.min(v + 1, WIZARD_STEPS.length - 1))}>
                      Passer
                    </Button>
                    <Button onClick={enregistrerProfil} disabled={saving} style={{ background: NAVY }}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Enregistrer et continuer <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </CardContent>
              </>
            )}

            {/* ÉTAPE 2 — BANQUE */}
            {current?.key === "banque" && (
              <StepAction
                icon={Landmark}
                titre="Connectez votre banque"
                fait={!!signals?.banque_connectee}
                phrase="Importez votre premier relevé bancaire (PDF). Lexora le lit automatiquement et prépare le rapprochement — c'est le cœur du suivi de votre trésorerie."
                ctaHref="/client/banque"
                ctaLabel="Importer un relevé"
                checking={checking}
                onVerifier={verifier}
                onBack={() => setStep(v => Math.max(v - 1, 0))}
                onSkip={() => setStep(v => Math.min(v + 1, WIZARD_STEPS.length - 1))}
                faitLabel="Banque connectée ✓"
              />
            )}

            {/* ÉTAPE 3 — DOCUMENT */}
            {current?.key === "document" && (
              <StepAction
                icon={FileText}
                titre="Ajoutez votre premier document"
                fait={!!signals?.a_document}
                phrase="Déposez une facture (fournisseur ou client). L'IA la lit, la classe et l'enregistre en comptabilité. Essayez avec un vrai document pour voir la magie."
                ctaHref="/client/documents"
                ctaLabel="Importer une facture"
                checking={checking}
                onVerifier={verifier}
                onBack={() => setStep(v => Math.max(v - 1, 0))}
                onSkip={() => setStep(v => Math.min(v + 1, WIZARD_STEPS.length - 1))}
                faitLabel="Premier document traité ✓"
              />
            )}

            {/* ÉTAPE 4 — PRÊT */}
            {current?.key === "pret" && (
              <>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <PartyPopper className="h-5 w-5 text-emerald-600" /> Prêt à démarrer
                  </CardTitle>
                  <p className="text-sm text-slate-500">
                    L'essentiel est en place. Voici où vous en êtes :
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    <RecapLigne fait={!!signals?.profil_complet} label="Profil de la société complété" />
                    <RecapLigne fait={!!signals?.banque_connectee} label="Banque connectée" />
                    <RecapLigne fait={!!signals?.a_document} label="Premier document traité" />
                  </ul>

                  <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 space-y-1.5">
                    <p className="font-medium flex items-center gap-1.5" style={{ color: NAVY }}>
                      <Sparkles className="h-4 w-4" /> Pour aller plus loin (facultatif)
                    </p>
                    <p>
                      • Saisissez vos <Link href="/client/echeances" className="underline">soldes d'ouverture</Link> pour un bilan exact.
                    </p>
                    <p>
                      • Si vous employez du personnel, ajoutez vos <Link href="/rh/employes" className="underline">salariés</Link> (paie + déclarations MRA).
                    </p>
                  </div>

                  <div className="flex justify-between pt-1">
                    <Button variant="ghost" onClick={() => setStep(v => Math.max(v - 1, 0))}>
                      <ArrowLeft className="h-4 w-4 mr-1" /> Retour
                    </Button>
                    <Link href="/client/tableau-de-bord">
                      <Button style={{ background: NAVY }}>
                        Aller au tableau de bord <ArrowRight className="h-4 w-4 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </>
            )}
          </Card>
        )}
      </div>
    </ClientPageShell>
  )
}

function RecapLigne({ fait, label }: { fait: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {fait
        ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        : <Circle className="h-4 w-4 text-slate-300" />}
      <span className={fait ? "" : "text-slate-500"}>{label}</span>
    </li>
  )
}

function StepAction(props: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  titre: string
  fait: boolean
  phrase: string
  ctaHref: string
  ctaLabel: string
  faitLabel: string
  checking: boolean
  onVerifier: () => void
  onBack: () => void
  onSkip: () => void
}) {
  const { icon: Icon, titre, fait, phrase, ctaHref, ctaLabel, faitLabel, checking, onVerifier, onBack, onSkip } = props
  return (
    <>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-5 w-5" style={{ color: NAVY }} /> {titre}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">{phrase}</p>

        {fait ? (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 text-emerald-700 p-3 text-sm">
            <CheckCircle2 className="h-5 w-5" /> {faitLabel}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Link href={ctaHref}>
              <Button style={{ background: NAVY }}>
                {ctaLabel} <ExternalLink className="h-4 w-4 ml-1.5" />
              </Button>
            </Link>
            <Button variant="outline" onClick={onVerifier} disabled={checking}>
              {checking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              J'ai terminé, vérifier
            </Button>
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Retour
          </Button>
          <Button variant="ghost" onClick={onSkip}>
            {fait ? "Continuer" : "Passer"} <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </>
  )
}
