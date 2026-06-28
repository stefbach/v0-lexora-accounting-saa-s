"use client"

/**
 * Sprint 12 FEATURE 5 — Panneau de contrôle prépaie.
 *
 * Extrait de l'ancienne page /rh/paie/validation (qui est désormais un
 * redirect vers /rh/paie?tab=validation). Ne gère PLUS les filtres société/
 * période ni le tableau des bulletins — ceux-ci vivent dans /rh/paie (parent)
 * qui les passe en props.
 *
 * Seul le flux "Lancer le contrôle → afficher anomalies" est ici : compact,
 * réutilisable, sans duplication d'état.
 */

import { useState } from "react"
import { t, getLocale } from "@/lib/i18n"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Loader2, CheckCircle2, AlertTriangle, XCircle, ShieldCheck,
} from "lucide-react"

const NAVY = "#0B0F2E"

interface Anomaly {
  employe_id: string
  employe_nom: string
  type: string
  message: string
  severite: "erreur" | "avertissement"
}

interface ValidationResult {
  statut: string
  nb_employes: number
  nb_anomalies: number
  anomalies: Anomaly[]
  periode: string
  societe_id: string
}

export function PaieValidationPanel({
  societe,
  periode,
  onValidated,
}: {
  societe: string
  periode: string
  /** Appelé après validation réussie — utile pour rafraîchir les bulletins
      du parent si des actions corrigent l'anomalie (ex: publier planning). */
  onValidated?: () => void
}) {
  const locale = getLocale()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [error, setError] = useState("")

  const runValidation = async () => {
    if (!societe || societe === "all") {
      setError("Sélectionnez une société dans l'onglet Bulletins avant de lancer le contrôle.")
      return
    }
    setLoading(true)
    setError("")
    setResult(null)
    try {
      const res = await fetch("/api/rh/paie/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ societe_id: societe, periode }),
      })
      const data = await res.json().catch(() => ({ error: t('hr.paieval.err_invalid_response', locale).replace('{status}', String(res.status)) }))
      if (!res.ok || data.error) {
        console.error("[PaieValidationPanel] error", res.status, data?.error || data)
        setError(data.error || t('hr.paieval.err_check', locale).replace('{status}', String(res.status)))
        return
      }
      setResult(data)
      onValidated?.()
    } catch (e: any) {
      console.error("[PaieValidationPanel] exception", e)
      setError(t('hr.paieval.err_network', locale).replace('{msg}', e?.message || t('hr.paieval.unknown', locale)))
    } finally {
      setLoading(false)
    }
  }

  const erreurs = result?.anomalies.filter(a => a.severite === "erreur") || []
  const avertissements = result?.anomalies.filter(a => a.severite === "avertissement") || []
  const canGenerate = result && erreurs.length === 0

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: NAVY }}>{t('hr.paieval.title', locale)}</h2>
          <p className="text-sm text-gray-500">
            {t('hr.paieval.subtitle', locale)}
          </p>
        </div>
        <Button
          onClick={runValidation}
          disabled={loading || !societe || societe === "all"}
          style={{ backgroundColor: NAVY }}
          className="text-white gap-2"
        >
          {loading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <ShieldCheck className="w-4 h-4" />}
          {loading ? t('hr.paieval.checking', locale) : t('hr.paieval.run_btn', locale)}
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm">{error}</div>
      )}

      {/* Empty state */}
      {!result && !loading && !error && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3 text-sm text-blue-800">
          <ShieldCheck className="w-5 h-5 text-blue-500 shrink-0" />
          <p>
            {t('hr.paieval.empty_hint_1', locale)} <strong>{t('hr.paieval.run_btn', locale)}</strong> {t('hr.paieval.empty_hint_2', locale)}
          </p>
        </div>
      )}

      {/* Result cards */}
      {result && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: NAVY }}>
                  <span className="text-white font-bold text-sm">{result.nb_employes}</span>
                </div>
                <div>
                  <p className="text-sm font-medium">{t('hr.paieval.employees_checked', locale)}</p>
                  <p className="text-xs text-gray-500">{t('hr.paieval.period', locale)} {result.periode}</p>
                </div>
              </CardContent>
            </Card>
            <Card className={erreurs.length > 0 ? "border-red-300" : "border-green-300"}>
              <CardContent className="p-4 flex items-center gap-3">
                {erreurs.length > 0
                  ? <XCircle className="w-10 h-10 text-red-500 shrink-0" />
                  : <CheckCircle2 className="w-10 h-10 text-green-500 shrink-0" />}
                <div>
                  <p className="text-sm font-medium">{erreurs.length} {t('hr.paieval.errors', locale)}</p>
                  <p className="text-xs text-gray-500">{t('hr.paieval.block_generation', locale)}</p>
                </div>
              </CardContent>
            </Card>
            <Card className={avertissements.length > 0 ? "border-orange-300" : "border-green-300"}>
              <CardContent className="p-4 flex items-center gap-3">
                {avertissements.length > 0
                  ? <AlertTriangle className="w-10 h-10 text-orange-500 shrink-0" />
                  : <CheckCircle2 className="w-10 h-10 text-green-500 shrink-0" />}
                <div>
                  <p className="text-sm font-medium">{avertissements.length} {t('hr.paieval.warnings', locale)}</p>
                  <p className="text-xs text-gray-500">{t('hr.paieval.to_check', locale)}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {canGenerate ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
              <p className="text-sm text-green-800 font-medium">
                {t('hr.paieval.all_ok', locale)}
              </p>
            </div>
          ) : erreurs.length > 0 ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
              <XCircle className="w-5 h-5 text-red-600 shrink-0" />
              <p className="text-sm text-red-800 font-medium">
                {t('hr.paieval.errors_blocking', locale).replace('{n}', String(erreurs.length))}
              </p>
            </div>
          ) : null}

          {result.anomalies.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base" style={{ color: NAVY }}>
                  {t('hr.paieval.anomalies_detail', locale)} ({result.anomalies.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {result.anomalies.map((a, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${
                        a.severite === "erreur"
                          ? "bg-red-50 border-red-200"
                          : "bg-orange-50 border-orange-200"
                      }`}
                    >
                      {a.severite === "erreur"
                        ? <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                        : <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{a.employe_nom}</span>
                          <Badge
                            className={`text-[10px] ${
                              a.severite === "erreur"
                                ? "bg-red-100 text-red-800 hover:bg-red-100"
                                : "bg-orange-100 text-orange-800 hover:bg-orange-100"
                            }`}
                          >
                            {a.type}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-600 mt-0.5">{a.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
