"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, CreditCard, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"

function fmt(n: number, devise = "MUR") {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: devise === "MUR" ? "EUR" : devise, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n).replace("€", "MUR")
}

export default function MesComptesPage() {
  const { profile } = useProfile()
  const [comptes, setComptes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/client/financial").then(r => r.json()).then(d => {
      setComptes(d.comptes_bancaires || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const totalMur = comptes.reduce((s, c) => s + (Number(c.solde_mur) || 0), 0)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1E2A4A]">Mes comptes bancaires</h1>
        <p className="text-sm text-gray-500">Trésorerie consolidée en temps réel</p>
      </div>

      {/* Total consolidé */}
      <Card className="bg-[#1E2A4A] text-white">
        <CardContent className="p-6 flex items-center justify-between">
          <div>
            <p className="text-white/70 text-sm">Trésorerie totale</p>
            <p className="text-3xl font-bold">{loading ? "..." : fmt(totalMur)}</p>
          </div>
          <CreditCard className="w-12 h-12 text-[#C9A84C]"/>
        </CardContent>
      </Card>

      {/* Comptes */}
      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-[#1E2A4A]"/></div>
      ) : comptes.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-gray-400">Aucun compte bancaire configuré</CardContent></Card>
      ) : (
        <div className="grid gap-4">
          {comptes.map((c: any) => (
            <Card key={c.id}>
              <CardContent className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-blue-600"/>
                  </div>
                  <div>
                    <p className="font-semibold text-[#1E2A4A]">{c.nom_compte || c.banque}</p>
                    <p className="text-xs text-gray-500">{c.iban || c.numero_compte || "—"} • {c.devise}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-bold ${Number(c.solde_actuel) >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(Number(c.solde_actuel))} {c.devise}
                  </p>
                  {c.devise !== "MUR" && (
                    <p className="text-xs text-gray-400">≈ {fmt(Number(c.solde_mur))} MUR</p>
                  )}
                  <p className="text-xs text-gray-400">
                    {c.derniere_maj ? `Mis à jour: ${new Date(c.derniere_maj).toLocaleDateString("fr-FR")}` : ""}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
