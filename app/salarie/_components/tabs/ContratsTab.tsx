"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, FileText, CheckCircle, Eye, Download } from "lucide-react"
import { NAVY, GOLD } from "../shared/constants"
import { t, getLocale } from "@/lib/i18n"

// Extrait du monolithe page.tsx pendant le sprint-salarie V0.1.
// Iso-fonctionnel.
export function ContratsTab({ employe }: { employe: any }) {
  const locale = getLocale()
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
    brouillon:     t('sal.contrats.statut_brouillon', locale),
    signe_employe: t('sal.contrats.statut_signe_employe', locale),
    signe:         t('sal.contrats.statut_signe', locale) + " ✓✓",
    expire:        t('sal.contrats.statut_expire', locale),
    resilie:       t('sal.contrats.statut_resilie', locale),
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
        setSignError(d.error || t('sal.contrats.err_signature', locale))
        return
      }
      setViewing({ ...viewing, ...d.contrat })
      reload()
    } catch (e: any) {
      setSignError(t('sal.contrats.err_reseau', locale) + (e?.message || ""))
    } finally {
      setSigning(false)
    }
  }

  return (
    <>
      <Card className="rounded-xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
            <FileText className="w-4 h-4" /> {t('sal.contrats.titre', locale)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" style={{ color: NAVY }} /></div>
          ) : contrats.length === 0 ? (
            <p className="text-gray-400 text-center py-8">{t('sal.contrats.aucun', locale)}</p>
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
                      {t('sal.contrats.debut', locale)} {c.date_debut ?? "—"}
                      {c.date_fin ? ` · ${t('sal.contrats.fin', locale)} ${c.date_fin}` : ` · ${t('sal.contrats.duree_indeterminee', locale)}`}
                    </p>
                    {c.date_signature_employe && (
                      <p className="text-xs text-green-600">✓ {t('sal.contrats.signe_par_vous_le', locale)} {new Date(c.date_signature_employe).toLocaleDateString("fr-FR")}</p>
                    )}
                    {c.date_signature_dirigeant && (
                      <p className="text-xs text-green-600">✓ {t('sal.contrats.contresigne_employeur_le', locale)} {new Date(c.date_signature_dirigeant).toLocaleDateString("fr-FR")}</p>
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
                      {c.statut === "brouillon" ? t('sal.contrats.voir_signer', locale) : t('sal.contrats.voir', locale)}
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
              {t('sal.contrats.contrat_prefix', locale)} {viewing?.type_contrat}{" "}
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
                    <p className="text-xs text-gray-500 mb-2">{t('sal.contrats.signature_employeur', locale)}</p>
                    {viewing.signature_image_dirigeant_url && (
                      <img
                        src={viewing.signature_image_dirigeant_url}
                        alt={t('sal.contrats.alt_signature_dirigeant', locale)}
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
              <p className="p-6 text-center text-gray-500">{t('sal.contrats.aucun_contenu', locale)}</p>
            )}
          </div>
          {signError && (
            <div className="border-t pt-2 text-xs text-red-700 bg-red-50 rounded px-3 py-2">{signError}</div>
          )}
          <div className="border-t pt-3 flex items-center justify-between gap-3 flex-wrap">
            {viewing?.statut === "brouillon" ? (
              <p className="text-xs text-gray-500 flex-1 min-w-[200px]">
                {t('sal.contrats.legal_signer', locale)}
              </p>
            ) : viewing?.statut === "signe_employe" ? (
              <p className="text-xs flex-1 min-w-[200px]" style={{ color: "#2563EB" }}>
                ✓ {t('sal.contrats.vous_avez_signe', locale)}{viewing?.date_signature_employe ? ` ${t('sal.contrats.le', locale)} ${new Date(viewing.date_signature_employe).toLocaleDateString("fr-FR")}` : ""}.
                {" "}{t('sal.contrats.en_attente_contresignature', locale)}
              </p>
            ) : viewing?.statut === "signe" ? (
              <p className="text-xs flex-1 min-w-[200px]" style={{ color: "#059669" }}>
                ✓✓ {t('sal.contrats.integralement_signe', locale)}
              </p>
            ) : (
              <p className="text-xs text-gray-500 flex-1 min-w-[200px]">
                {t('sal.contrats.plus_disponible', locale)}
              </p>
            )}
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setViewing(null)}>{t('sal.contrats.fermer', locale)}</Button>
              {viewing?.statut === "brouillon" && (
                <Button
                  size="sm"
                  onClick={handleSign}
                  disabled={signing || viewing?.statut !== "brouillon"}
                  style={{ backgroundColor: GOLD, color: NAVY }}
                  className="hover:opacity-90 font-semibold"
                >
                  {signing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                  {t('sal.contrats.signer_contrat', locale)}
                </Button>
              )}
              {viewing?.statut === "signe_employe" && (
                <Button size="sm" disabled className="font-semibold opacity-70">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {t('sal.contrats.deja_signe', locale)}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
