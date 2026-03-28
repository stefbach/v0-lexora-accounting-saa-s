"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Clock, Calendar, CreditCard, Download, MapPin } from "lucide-react"

function fmt(n: number) { return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "MUR", maximumFractionDigits: 0 }).format(n) }

export default function PortailSalariePage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [pointageLoading, setPointageLoading] = useState(false)
  const [employe, setEmploye] = useState<any>(null)
  const [emailConnecte, setEmailConnecte] = useState<string>("")

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch("/api/rh/employes/me")
        const d = await res.json()
        if (d.email) setEmailConnecte(d.email)
        if (d.employe) {
          setEmploye(d.employe)
          const detail = await fetch(`/api/rh/employes/${d.employe.id}`).then(r => r.json())
          setData(detail)
        }
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const pointer = async (type: "entree" | "sortie") => {
    if (!employe) return
    setPointageLoading(true)
    try {
      let latitude: number | undefined, longitude: number | undefined
      if (navigator.geolocation) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(pos => { latitude = pos.coords.latitude; longitude = pos.coords.longitude; resolve() }, () => resolve())
        })
      }
      await fetch("/api/rh/pointage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employe_id: employe.id, type_pointage: type, methode: "gps", latitude, longitude }) })
      const detail = await fetch(`/api/rh/employes/${employe.id}`).then(r => r.json())
      setData(detail)
    } catch (e) { console.error(e) }
    finally { setPointageLoading(false) }
  }

  if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="w-8 h-8 animate-spin text-[#1E2A4A]"/></div>

  if (!employe) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <Card className="max-w-md w-full shadow-md">
        <CardContent className="p-8 text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center text-3xl">👤</div>
          </div>
          <h2 className="text-lg font-semibold text-[#1E2A4A]">Compte non lié à un employé</h2>
          <p className="text-sm text-gray-600">
            Votre compte n'est pas encore associé à un dossier employé dans le système.
          </p>
          <div className="bg-blue-50 rounded-lg p-4 text-left space-y-2 text-sm text-blue-800">
            <p className="font-medium">Pour activer votre accès :</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Contactez votre responsable RH ou administrateur.</li>
              <li>Communiquez l'adresse e-mail de votre compte : <strong className="break-all">{emailConnecte || "—"}</strong></li>
              <li>Demandez à l'admin de lier votre profil à votre fiche employé.</li>
            </ol>
          </div>
          {emailConnecte && (
            <a
              href={`mailto:rh@lexora.mu?subject=Liaison compte employé&body=Bonjour, merci de lier mon compte (${emailConnecte}) à ma fiche employé. Merci.`}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1E2A4A] px-4 py-2 text-sm font-medium text-white hover:bg-[#C9A84C] transition-colors"
            >
              📧 Contacter le RH
            </a>
          )}
          <p className="text-xs text-gray-400">
            Si vous pensez qu'il s'agit d'une erreur, déconnectez-vous et reconnectez-vous puis réessayez.
          </p>
          <button
            onClick={async () => { const { createClient } = await import("@/lib/supabase/client"); const sb = createClient(); await sb.auth.signOut(); window.location.href = "/auth/login" }}
            className="text-sm text-[#1E2A4A] underline hover:text-[#C9A84C] transition-colors"
          >
            Se déconnecter
          </button>
        </CardContent>
      </Card>
    </div>
  )

  const todayPointage = data?.pointages?.[0]
  const isToday = todayPointage?.date_pointage === new Date().toISOString().split("T")[0]
  const isPointed = isToday && todayPointage?.heure_entree
  const isOut = isToday && todayPointage?.heure_sortie

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1E2A4A] text-white px-6 py-4">
        <h1 className="text-lg font-bold">Bonjour, {employe.prenom} 👋</h1>
        <p className="text-white/60 text-sm">{employe.poste} — {new Date().toLocaleDateString("fr-FR", { weekday:"long", day:"numeric", month:"long" })}</p>
      </div>

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Pointage */}
        <Card>
          <CardHeader><CardTitle className="text-[#1E2A4A] flex items-center gap-2 text-base"><Clock className="w-4 h-4"/>Pointage du jour</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Entrée :</span><span className={`font-mono font-semibold ${isPointed ? "text-green-600" : "text-gray-400"}`}>{isPointed ? todayPointage.heure_entree : "—"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Sortie :</span><span className={`font-mono font-semibold ${isOut ? "text-red-600" : "text-gray-400"}`}>{isOut ? todayPointage.heure_sortie : "—"}</span>
            </div>
            <div className="flex gap-2 pt-2">
              {!isPointed && (
                <Button onClick={() => pointer("entree")} disabled={pointageLoading} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                  {pointageLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <><MapPin className="w-4 h-4 mr-2"/>Pointer Entrée</>}
                </Button>
              )}
              {isPointed && !isOut && (
                <Button onClick={() => pointer("sortie")} disabled={pointageLoading} className="flex-1 bg-red-600 hover:bg-red-700 text-white">
                  {pointageLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <><MapPin className="w-4 h-4 mr-2"/>Pointer Sortie</>}
                </Button>
              )}
              {isOut && <p className="text-sm text-gray-500 text-center w-full">Journée pointée ✅</p>}
            </div>
          </CardContent>
        </Card>

        {/* Soldes congés */}
        {data?.soldes?.[0] && (
          <Card>
            <CardHeader><CardTitle className="text-[#1E2A4A] flex items-center gap-2 text-base"><Calendar className="w-4 h-4"/>Mes congés {data.soldes[0].annee}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Congés annuels", pris: data.soldes[0].conge_annuel_pris || 0, droit: data.soldes[0].conge_annuel_droit || 20 },
                  { label: "Congés maladie", pris: data.soldes[0].sick_leave_pris || 0, droit: data.soldes[0].sick_leave_droit || 15 },
                ].map(c => (
                  <div key={c.label} className="bg-blue-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{c.label}</p>
                    <p className="text-xl font-bold text-[#1E2A4A]">{c.droit - c.pris}j</p>
                    <p className="text-xs text-gray-400">{c.pris}j pris / {c.droit}j droit</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Derniers bulletins */}
        {(data?.bulletins || []).length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-[#1E2A4A] flex items-center gap-2 text-base"><CreditCard className="w-4 h-4"/>Mes bulletins de paie</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Période</TableHead><TableHead className="text-right">Net</TableHead><TableHead>Statut</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {(data.bulletins || []).slice(0, 6).map((b: any) => (
                    <TableRow key={b.id}>
                      <TableCell className="text-sm">{new Date(b.periode).toLocaleDateString("fr-FR", { month:"long", year:"numeric" })}</TableCell>
                      <TableCell className="text-right font-semibold text-green-700">{fmt(b.salaire_net)}</TableCell>
                      <TableCell><span className={`text-xs px-2 py-0.5 rounded-full ${b.statut==="paye"?"bg-green-100 text-green-700":"bg-blue-100 text-blue-700"}`}>{b.statut}</span></TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => window.open(`/api/export/bulletin-pdf?id=${b.id}`, "_blank")}>
                          <Download className="w-3 h-3"/>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
