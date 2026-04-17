"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, FileText, CheckCircle, Eye, Download } from "lucide-react"
import { NAVY, GOLD } from "../shared/constants"

// Extrait du monolithe page.tsx pendant le sprint-salarie V0.1.
// Iso-fonctionnel.
export function ContratsTab({ employe }: { employe: any }) {
  const [contrats, setContrats] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [viewing, setViewing] = useState<any | null>(null)
  const [signing, setSigning] = useState(false)
  const [signError, setSignError] = useState<string | null>(null)

  const reload = useCallback(() => {
    setLoading(true)
    fetch(`/api/rh/contrats?employe_id=${employe.id}`)
      .then(r => r.json())
      .then(d => setContrats(d.contrats || []))
      .catch(() => setContrats([]))
      .finally(() => setLoading(false))
  }, [employe.id])

  useEffect(() => { reload() }, [reload])

  const STATUT_LABELS: Record<string, string> = {
    brouillon:     "À signer",
    signe_employe: "Signé — en attente employeur",
    signe:         "Signé ✓✓",
    expire:        "Expiré",
    resilie:       "Résilié",
  }
  const STATUT_COLORS: Record<string, string> = {
    brouillon:     "bg-amber-100 text-amber-700",
    signe_employe: "bg-blue-100 text-blue-700",
    signe:         "bg-green-100 text-green-700",
    expire:        "bg-orange-100 text-orange-700",
    resilie:       "bg-red-100 text-red-700",
  }

  const handleSign = async () => {
    if (!viewing) return
    setSigning(true)
    setSignError(null)
    try {
      const res = await fetch(`/api/rh/contrats/${viewing.id}/signer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "signer_self" }),
      })
      const d = await res.json()
      if (!res.ok) {
        setSignError(d.error || "Erreur de signature")
        return
      }
      setViewing({ ...viewing, ...d.contrat })
      reload()
    } catch (e: any) {
      setSignError("Erreur réseau : " + (e?.message || ""))
    } finally {
      setSigning(false)
    }
  }

  return (
    <>
      <Card className="rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
            <FileText className="w-4 h-4" /> Mes contrats de travail
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" style={{ color: NAVY }} /></div>
          ) : contrats.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Aucun contrat disponible</p>
          ) : (
            <div className="space-y-3">
              {contrats.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between p-4 rounded-xl border bg-white hover:shadow-sm transition-shadow flex-wrap gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm" style={{ color: NAVY }}>{c.type_contrat}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_COLORS[c.statut] ?? "bg-gray-100 text-gray-600"}`}>
                        {STATUT_LABELS[c.statut] ?? c.statut}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Début : {c.date_debut ?? "—"}
                      {c.date_fin ? ` · Fin : ${c.date_fin}` : " · Durée indéterminée"}
                    </p>
                    {c.date_signature_employe && (
                      <p className="text-xs text-green-600">✓ Signé par vous le {new Date(c.date_signature_employe).toLocaleDateString("fr-FR")}</p>
                    )}
                    {c.date_signature_dirigeant && (
                      <p className="text-xs text-green-600">✓ Contresigné par l&apos;employeur le {new Date(c.date_signature_dirigeant).toLocaleDateString("fr-FR")}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 text-xs h-8"
                      onClick={() => { setViewing(c); setSignError(null) }}
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      {c.statut === "brouillon" ? "Voir & signer" : "Voir"}
                    </Button>
                    {c.id && (
                      <a href={`/api/rh/contrats/${c.id}/pdf`} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="shrink-0 text-xs h-8">
                          <Download className="w-3 h-3 mr-1" /> PDF
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewing} onOpenChange={o => { if (!o) { setViewing(null); setSignError(null) } }}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Contrat {viewing?.type_contrat}{" "}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_COLORS[viewing?.statut] ?? "bg-gray-100 text-gray-600"}`}>
                {STATUT_LABELS[viewing?.statut] ?? viewing?.statut}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {(viewing?.html_content_modified || viewing?.html_content) ? (
              <>
                <div
                  className="prose prose-sm max-w-none p-4 text-sm text-gray-800"
                  dangerouslySetInnerHTML={{ __html: viewing.html_content_modified || viewing.html_content }}
                />
                {(viewing?.signature_nom_complet || viewing?.signature_image_dirigeant_url) && (
                  <div className="mx-4 mt-6 mb-4 p-4 border-t bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-2">Signature de l&apos;employeur</p>
                    {viewing.signature_image_dirigeant_url && (
                      <img
                        src={viewing.signature_image_dirigeant_url}
                        alt="Signature dirigeant"
                        className="h-16 bg-white border p-1 rounded mb-2"
                      />
                    )}
                    {viewing.signature_nom_complet && (
                      <p className="text-sm font-medium text-gray-800">{viewing.signature_nom_complet}</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="p-6 text-center text-gray-500">Aucun contenu disponible pour ce contrat.</p>
            )}
          </div>
          {signError && (
            <div className="border-t pt-2 text-xs text-red-700 bg-red-50 rounded px-3 py-2">{signError}</div>
          )}
          <div className="border-t pt-3 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              En signant, vous acceptez les termes du contrat. Votre signature a valeur juridique
              (Electronic Transactions Act 2000 — Maurice).
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setViewing(null)}>Fermer</Button>
              {viewing?.statut === "brouillon" && (
                <Button
                  size="sm"
                  onClick={handleSign}
                  disabled={signing}
                  style={{ backgroundColor: GOLD, color: NAVY }}
                  className="hover:opacity-90 font-semibold"
                >
                  {signing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  Signer le contrat
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
