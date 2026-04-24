"use client"
import { useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Building2, ArrowRight, Loader2, Layers } from "lucide-react"
import { useRHSocieteActive } from "@/components/rh/RHSocieteActiveProvider"
import { ClientPageShell } from "@/components/layout/ClientPageShell"

/**
 * Page /rh/select-societe — équivalent /client/select-societe pour l'espace RH.
 *
 * Flow :
 *   1. Middleware redirige ici si pas de cookie de choix fait.
 *   2. Si l'utilisateur n'a qu'UNE société, auto-select silencieux.
 *   3. Sinon, l'utilisateur choisit une société OU "Toutes les sociétés"
 *      (mode consolidé admin/comptable). Les deux écrivent le flag
 *      `rh_societe_choice_made=true` pour éviter de revenir ici.
 *
 * Après sélection : redirect vers `?returnTo=` ou /rh par défaut.
 */
export default function SelectSocietePage() {
  const router = useRouter()
  const search = useSearchParams()
  const returnTo = search?.get("returnTo") || "/rh"
  const { societes, loading, switchSociete, selectAll } = useRHSocieteActive()
  const autoPickedRef = useRef(false)

  const handlePick = (id: string) => {
    switchSociete(id)
    router.push(returnTo)
  }
  const handleAll = () => {
    selectAll()
    router.push(returnTo)
  }

  // Auto-select silencieux : si l'utilisateur n'a qu'UNE société accessible,
  // on la pose et on redirige immédiatement sans passer par la page.
  useEffect(() => {
    if (loading || autoPickedRef.current) return
    if (societes.length === 1) {
      autoPickedRef.current = true
      switchSociete(societes[0].id)
      router.replace(returnTo)
    }
  }, [loading, societes, switchSociete, router, returnTo])

  if (loading) {
    return (
      <ClientPageShell>
        <div className="flex items-center gap-2 text-slate-500 p-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement des sociétés…
        </div>
      </ClientPageShell>
    )
  }

  // Pendant la redirection auto (1 société), on affiche un spinner.
  if (societes.length === 1) {
    return (
      <ClientPageShell>
        <div className="flex items-center gap-2 text-slate-500 p-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Redirection…
        </div>
      </ClientPageShell>
    )
  }

  return (
    <ClientPageShell>
      <div className="max-w-3xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#0B0F2E" }}>
            Choisir la société active
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            La société sélectionnée filtrera automatiquement toutes les pages RH.
            Ce choix est partagé avec l'espace client (cookie commun).
          </p>
        </div>

        {societes.length > 1 && (
          <Card className="border-2 border-dashed hover:border-solid transition" style={{ borderColor: "#D4AF37" }}>
            <CardContent className="p-4">
              <button onClick={handleAll} className="w-full text-left flex items-center gap-3">
                <div className="rounded-xl p-2.5" style={{ backgroundColor: "#D4AF3720" }}>
                  <Layers className="h-5 w-5" style={{ color: "#D4AF37" }} />
                </div>
                <div className="flex-1">
                  <div className="font-semibold" style={{ color: "#0B0F2E" }}>
                    Toutes les sociétés
                  </div>
                  <div className="text-xs text-slate-500">
                    Vue consolidée — utile pour les dashboards multi-sociétés (admin, comptable).
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Vos sociétés</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {societes.length === 0 && (
              <div className="text-sm text-slate-500 italic p-4">
                Aucune société accessible pour votre compte.
              </div>
            )}
            {societes.map(s => (
              <button
                key={s.id}
                onClick={() => handlePick(s.id)}
                className="w-full text-left flex items-center gap-3 p-3 rounded-lg border hover:border-slate-400 transition"
              >
                <div className="rounded-xl p-2.5 shrink-0" style={{ backgroundColor: "#F1F5F9" }}>
                  <Building2 className="h-5 w-5" style={{ color: "#0B0F2E" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate" style={{ color: "#0B0F2E" }}>
                    {s.nom}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {s.brn ? `BRN ${s.brn}` : "—"}
                    {s.ern ? ` · ERN ${s.ern}` : ""}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </button>
            ))}
          </CardContent>
        </Card>

      </div>
    </ClientPageShell>
  )
}
