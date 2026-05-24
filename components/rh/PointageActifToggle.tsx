"use client"
/**
 * Sprint 5 AMÉLIO 9 — Composant partagé pour le toggle pointage_actif.
 *
 * Utilisé :
 *   - /rh/societe (onglet Contact) — inline sous Localisation GPS
 *   - /rh/parametres — inline dans la carte Pointage obligatoire
 *     (avant : un lien vers /rh/societe, maintenant on toggle sans quitter
 *      la page)
 *
 * Le toggle est par société : confirmation obligatoire avant activation
 * (évite une bascule accidentelle qui ferait fondre la masse salariale
 * au prochain run de paie). Désactivation directe sans confirmation.
 */
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Loader2, MapPin, AlertCircle } from "lucide-react"
import { notifySuccess, notifyError } from "@/lib/utils/toast"

const NAVY = "#0B0F2E"

export interface PointageActifToggleProps {
  societeId: string
  initial: boolean
  onSaved?: (v: boolean) => void
  /** Si true (défaut), rend la carte complète. Si false, juste le toggle (pour usage embarqué). */
  withCard?: boolean
}

export function PointageActifToggle({
  societeId,
  initial,
  onSaved,
  withCard = true,
}: PointageActifToggleProps) {
  const [active, setActive] = useState(initial)
  const [pendingActivate, setPendingActivate] = useState(false)
  const [saving, setSaving] = useState(false)

  const persist = async (newValue: boolean) => {
    setSaving(true)
    try {
      const res = await fetch("/api/rh/societe", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: societeId, pointage_actif: newValue }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        notifyError("Enregistrer", d.error || res.statusText)
        return
      }
      setActive(newValue)
      onSaved?.(newValue)
      notifySuccess(
        newValue
          ? "✅ Pointage obligatoire activé — la prochaine paie déduira les absences"
          : "Pointage obligatoire désactivé — les pointages restent enregistrés sans impact paie",
      )
    } catch (e: unknown) {
      notifyError("Erreur réseau", e)
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = (next: boolean) => {
    if (next) setPendingActivate(true)
    else persist(false)
  }

  const toggleBody = (
    <>
      <p className="text-sm text-gray-600">
        Activer la déduction automatique des absences basée sur le pointage.
      </p>
      <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
        ⚠️ Une fois activé, tout employé sans pointage <b>ni congé approuvé</b> sera considéré
        absent ce jour. La déduction s'applique au prochain calcul de paie (action « calculer »
        ou « calculer_batch »).
      </div>
      <div className="flex items-center gap-3 pt-1">
        <Switch checked={active} disabled={saving} onCheckedChange={handleToggle} />
        <span
          className="text-sm font-medium"
          style={{ color: active ? "#059669" : "#6b7280" }}
        >
          {active ? "Activé — la paie déduira les absences" : "Désactivé (mode test)"}
        </span>
        {saving && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
      </div>

      {pendingActivate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-amber-900 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" /> Activer le pointage obligatoire ?
            </h3>
            <p className="text-sm text-gray-700">
              Êtes-vous sûr ? <b>Tout employé sans pointage</b> sur un jour ouvré, et
              sans congé approuvé couvrant ce jour, sera considéré <b>absent</b> dès
              le prochain calcul de paie.
            </p>
            <p className="text-xs text-gray-500">
              Cette bascule est réversible — vous pouvez la couper à tout moment.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setPendingActivate(false)}
                disabled={saving}
              >
                Annuler
              </Button>
              <Button
                onClick={async () => {
                  await persist(true)
                  setPendingActivate(false)
                }}
                disabled={saving}
                style={{ backgroundColor: NAVY }}
                className="text-white hover:opacity-90"
              >
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Confirmer l'activation
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  if (!withCard) return <div className="space-y-3">{toggleBody}</div>

  return (
    <Card className="rounded-2xl border-l-4 border-l-amber-500">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-amber-700 flex items-center gap-2">
          <MapPin className="h-4 w-4" /> Pointage obligatoire
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{toggleBody}</CardContent>
    </Card>
  )
}
