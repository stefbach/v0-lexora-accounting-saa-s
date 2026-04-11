"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Upload, FileText, Palette, CheckCircle, Eye, Wand2 } from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

export default function FactureTemplatePage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societe, setSociete] = useState("")
  const [uploading, setUploading] = useState(false)
  const [template, setTemplate] = useState<any>(null)
  const [error, setError] = useState("")
  const [templates, setTemplates] = useState<any[]>([])
  const [fileName, setFileName] = useState("")

  useEffect(() => {
    Promise.all([
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values())
      setSocietes(unique)
      if (unique.length >= 1) setSociete(unique[0].id)
    })
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    const res = await fetch("/api/client/facture-template", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" }),
    }).then(r => r.json()).catch(() => ({ templates: [] }))
    setTemplates(res.templates || [])
  }

  const handleUpload = async (file: File) => {
    if (!file) return
    setFileName(file.name)
    setUploading(true)
    setError("")
    setTemplate(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      if (societe) fd.append("societe_id", societe)
      const res = await fetch("/api/client/facture-template", { method: "POST", body: fd })
      const data = await res.json()

      // Erreur bloquante (IA ou autre)
      if (data.error && !data.template) {
        setError(data.error)
        return
      }

      // Sauvegarde en base échouée — afficher l'erreur mais montrer le template analysé
      if (data.saved === false) {
        setError(
          `Le template a été analysé mais n'a PAS été sauvegardé en base de données.\n` +
          `Raison: ${data.error || "inconnue"}` +
          (data.hint ? `\nIndice: ${data.hint}` : "") +
          (data.code ? `\nCode: ${data.code}` : "")
        )
        setTemplate(data.template)
        return
      }

      setTemplate(data.template)
      loadTemplates()
    } catch (e: any) { setError(e.message || "Erreur") }
    finally { setUploading(false) }
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Template de facture IA</h1>
          <p className="text-gray-500 text-sm">Importez une ancienne facture — l'IA crée votre template personnalisé</p>
        </div>
        <Select value={societe} onValueChange={setSociete}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Société" /></SelectTrigger>
          <SelectContent>{societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base" style={{ color: NAVY }}>
            <Wand2 className="inline h-5 w-5 mr-2" style={{ color: GOLD }} />
            Analyser une facture existante
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">Uploadez une facture que vous utilisiez avant — l'IA va analyser la mise en page, les couleurs, la structure et créer un template réutilisable.</p>
          <div className="flex items-center gap-3">
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={uploading}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
              className="flex-1 text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#0B0F2E] file:text-white hover:file:bg-[#2a3d66]" />
            {uploading && <div className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" style={{ color: GOLD }} /><span className="text-sm text-gray-500">Analyse IA en cours...</span></div>}
          </div>
          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 whitespace-pre-line">{error}</div>}
        </CardContent>
      </Card>

      {/* Template résultat */}
      {template && (
        <Card className="border-2" style={{ borderColor: GOLD }}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2" style={{ color: NAVY }}>
              <CheckCircle className="h-5 w-5 text-emerald-500" />
              Template généré — {template.nom_template || template.nom || fileName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Couleur primaire</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-6 h-6 rounded" style={{ backgroundColor: template.couleur_primaire || NAVY }} />
                  <span className="text-sm font-mono">{template.couleur_primaire || NAVY}</span>
                </div>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Couleur secondaire</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="w-6 h-6 rounded" style={{ backgroundColor: template.couleur_secondaire || GOLD }} />
                  <span className="text-sm font-mono">{template.couleur_secondaire || GOLD}</span>
                </div>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Format numéro</p>
                <p className="text-sm font-mono mt-1">{template.format_numero || "INV-{YYYY}-{NNN}"}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Devise / TVA</p>
                <p className="text-sm mt-1">{template.devise || template.devise_defaut || "MUR"} • TVA {template.taux_tva ?? template.tva_defaut ?? 15}%</p>
              </div>
            </div>

            {template.colonnes && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Colonnes du tableau</p>
                <div className="flex gap-1 flex-wrap">
                  {(Array.isArray(template.colonnes) ? template.colonnes : []).map((c: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-xs">{c}</Badge>
                  ))}
                </div>
              </div>
            )}

            {template.style && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Style détecté</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {template.style.police && <p>Police: <strong>{template.style.police}</strong></p>}
                  {template.style.taille_titre && <p>Titre: <strong>{template.style.taille_titre}</strong></p>}
                  {template.style.bordures_tableau !== undefined && <p>Bordures: <strong>{template.style.bordures_tableau ? "Oui" : "Non"}</strong></p>}
                </div>
              </div>
            )}

            {template.mentions_legales && (
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-600 font-medium mb-1">Mentions légales détectées</p>
                <p className="text-xs text-blue-800">{template.mentions_legales}</p>
              </div>
            )}

            {template.conditions_paiement && (
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-xs text-green-600 font-medium mb-1">Conditions de paiement</p>
                <p className="text-xs text-green-800">{template.conditions_paiement}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Templates existants */}
      {templates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base" style={{ color: NAVY }}>
              <Palette className="inline h-5 w-5 mr-2" />
              Mes templates ({templates.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {templates.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: t.couleur_primaire || NAVY }} />
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: t.couleur_secondaire || GOLD }} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{t.nom}</p>
                      <p className="text-xs text-gray-400">{t.source_fichier || "—"} • {t.devise_defaut || "MUR"} • TVA {t.tva_defaut || 15}%</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">{t.format_numero || "INV-{YYYY}-{NNN}"}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
