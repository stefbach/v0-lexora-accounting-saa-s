"use client"
import { useState } from "react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Loader2, CheckCircle, Save } from "lucide-react"
import { NAVY, GOLD, BLUE, GREEN } from "../shared/constants"

// Ma fiche — composant isolé (pas de re-render parent).
// Extrait du monolithe page.tsx pendant le sprint-salarie V0.1.
// Iso-fonctionnel : aucun changement de logique métier.
export function MaFicheTab({ employe, onUpdated }: { employe: any; onUpdated: () => void }) {
  const [f, setF] = useState({ ...employe })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const u = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))

  const initials = [employe.prenom, employe.nom].filter(Boolean).map((n: string) => n[0]).join("").toUpperCase() || "?"

  const handleSave = async () => {
    setSaving(true); setSaved(false)
    try {
      const res = await fetch("/api/rh/employes/me", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile: f.mobile, telephone: f.telephone, email: f.email,
          adresse: f.adresse, adresse2: f.adresse2, ville: f.ville, code_postal: f.code_postal,
          date_naissance: f.date_naissance, genre: f.genre, statut_marital: f.statut_marital, nationalite: f.nationalite,
          bank_name: f.bank_name, bank_account: f.bank_account, iban: f.iban,
          contact_urgence_nom: f.contact_urgence_nom,
          contact_urgence_tel: f.contact_urgence_tel,
          contact_urgence_relation: f.contact_urgence_relation,
        }),
      })
      const data = await res.json()
      if (data.error) toast.error("Erreur", { description: data.error })
      else { setSaved(true); setTimeout(() => setSaved(false), 4000); onUpdated() }
    } catch { toast.error("Erreur réseau") }
    setSaving(false)
  }

  const inputCls = "h-11 rounded-xl"

  return (
    <div className="space-y-6">
      {saved && (
        <div className="flex items-center gap-3 p-4 rounded-2xl text-sm font-medium text-white shadow-sm" style={{ backgroundColor: GREEN }}>
          <CheckCircle className="h-5 w-5 shrink-0" />
          Informations mises à jour avec succès
        </div>
      )}

      <Card className="rounded-2xl shadow-sm overflow-hidden">
        <CardContent className="flex flex-col items-center py-8 gap-3">
          <div className="rounded-full p-1" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD}88)` }}>
            <Avatar className="w-20 h-20 border-2 border-white">
              {employe.photo_url && <AvatarImage src={employe.photo_url} alt={employe.prenom} />}
              <AvatarFallback className="text-2xl font-bold text-white" style={{ backgroundColor: NAVY }}>{initials}</AvatarFallback>
            </Avatar>
          </div>
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold" style={{ color: NAVY }}>{[employe.prenom, employe.nom].filter(Boolean).join(" ") || "Mon profil"}</h2>
            <p className="text-sm text-gray-500">{employe.poste || "Employé"}</p>
            <Badge variant="outline" className="text-xs font-mono" style={{ borderColor: GOLD, color: GOLD }}>{employe.code_employe || employe.code || "—"}</Badge>
          </div>
          <p className="text-xs text-gray-400 mt-1">Modifier mes infos</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <div className="flex rounded-2xl overflow-hidden">
          <div className="w-1.5 shrink-0" style={{ backgroundColor: BLUE }} />
          <div className="flex-1 p-5 space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">Coordonnées</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Email</Label><Input type="email" className={inputCls} value={f.email || ""} onChange={e => u("email", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Mobile</Label><Input className={inputCls} value={f.mobile || ""} onChange={e => u("mobile", e.target.value)} placeholder="+230 5XXX XXXX" /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Téléphone</Label><Input className={inputCls} value={f.telephone || ""} onChange={e => u("telephone", e.target.value)} /></div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <div className="flex rounded-2xl overflow-hidden">
          <div className="w-1.5 shrink-0" style={{ backgroundColor: GREEN }} />
          <div className="flex-1 p-5 space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">Adresse</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Adresse</Label><Input className={inputCls} value={f.adresse || ""} onChange={e => u("adresse", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Adresse 2</Label><Input className={inputCls} value={f.adresse2 || ""} onChange={e => u("adresse2", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Ville</Label><Input className={inputCls} value={f.ville || ""} onChange={e => u("ville", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Code postal</Label><Input className={inputCls} value={f.code_postal || ""} onChange={e => u("code_postal", e.target.value)} /></div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <div className="flex rounded-2xl overflow-hidden">
          <div className="w-1.5 shrink-0" style={{ backgroundColor: GOLD }} />
          <div className="flex-1 p-5 space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">Banque</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Banque</Label><Input className={inputCls} value={f.bank_name || ""} onChange={e => u("bank_name", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">N° compte</Label><Input className={inputCls} value={f.bank_account || ""} onChange={e => u("bank_account", e.target.value)} /></div>
              <div className="md:col-span-2 space-y-1.5"><Label className="text-xs font-medium text-gray-500">IBAN</Label><Input className={inputCls} value={f.iban || ""} onChange={e => u("iban", e.target.value)} /></div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <div className="flex rounded-2xl overflow-hidden">
          <div className="w-1.5 shrink-0" style={{ backgroundColor: "#A855F7" }} />
          <div className="flex-1 p-5 space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">Infos personnelles</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Date de naissance</Label><Input type="date" className={inputCls} value={f.date_naissance?.split("T")[0] || ""} onChange={e => u("date_naissance", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Genre</Label>
                <Select value={f.genre || ""} onValueChange={v => u("genre", v)}>
                  <SelectTrigger className={inputCls}><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent><SelectItem value="M">Homme</SelectItem><SelectItem value="F">Femme</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Nationalité</Label><Input className={inputCls} value={f.nationalite || ""} onChange={e => u("nationalite", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Statut marital</Label>
                <Select value={f.statut_marital || "single"} onValueChange={v => u("statut_marital", v)}>
                  <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Célibataire</SelectItem>
                    <SelectItem value="married">Marié(e)</SelectItem>
                    <SelectItem value="divorced">Divorcé(e)</SelectItem>
                    <SelectItem value="widowed">Veuf/Veuve</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <div className="flex rounded-2xl overflow-hidden">
          <div className="w-1.5 shrink-0" style={{ backgroundColor: "#F97316" }} />
          <div className="flex-1 p-5 space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">Contact d&apos;urgence</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Nom</Label><Input className={inputCls} value={f.contact_urgence_nom || ""} onChange={e => u("contact_urgence_nom", e.target.value)} placeholder="Nom prénom" /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">Téléphone</Label><Input className={inputCls} value={f.contact_urgence_tel || ""} onChange={e => u("contact_urgence_tel", e.target.value)} placeholder="+230 5XXX XXXX" /></div>
              <div className="space-y-1.5 md:col-span-2"><Label className="text-xs font-medium text-gray-500">Relation</Label><Input className={inputCls} value={f.contact_urgence_relation || ""} onChange={e => u("contact_urgence_relation", e.target.value)} placeholder="Conjoint, parent, ami…" /></div>
            </div>
          </div>
        </div>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto rounded-xl h-11 text-white font-semibold px-8" style={{ backgroundColor: GOLD }}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
        Enregistrer mes modifications
      </Button>

      <Card className="rounded-2xl shadow-sm bg-gray-50/80 border-dashed">
        <CardContent className="p-5 space-y-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">Mon emploi (lecture seule)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1"><Label className="text-xs text-gray-400">Code employé</Label><p className="text-sm font-mono bg-gray-100 text-gray-500 p-2.5 rounded-xl">{employe.code_employe || employe.code || "—"}</p></div>
            <div className="space-y-1"><Label className="text-xs text-gray-400">Date d&apos;arrivée</Label><p className="text-sm bg-gray-100 text-gray-500 p-2.5 rounded-xl">{employe.date_arrivee ? new Date(employe.date_arrivee).toLocaleDateString("fr-FR") : "—"}</p></div>
            <div className="space-y-1"><Label className="text-xs text-gray-400">Poste</Label><p className="text-sm bg-gray-100 text-gray-500 p-2.5 rounded-xl">{employe.poste || "—"}</p></div>
            <div className="space-y-1"><Label className="text-xs text-gray-400">Département</Label><p className="text-sm bg-gray-100 text-gray-500 p-2.5 rounded-xl">{employe.departement || "—"}</p></div>
            <div className="space-y-1 md:col-span-2"><Label className="text-xs text-gray-400">Adresse</Label><p className="text-sm bg-gray-100 text-gray-500 p-2.5 rounded-xl">{[employe.adresse, employe.adresse2, employe.ville, employe.code_postal].filter(Boolean).join(', ') || "—"}</p></div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
