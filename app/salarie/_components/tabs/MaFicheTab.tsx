"use client"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { notifySuccess, notifyError } from "@/lib/utils/toast"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Loader2, CheckCircle, Save, Camera } from "lucide-react"
import { NAVY, GOLD, BLUE, GREEN } from "../shared/constants"
import { t, getLocale } from "@/lib/i18n"

const MAX_AVATAR_BYTES = 2 * 1024 * 1024 // 2 MB
const ACCEPTED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"]

// Ma fiche — composant isolé (pas de re-render parent).
// Extrait du monolithe page.tsx pendant le sprint-salarie V0.1.
// Iso-fonctionnel : aucun changement de logique métier.
export function MaFicheTab({ employe, onUpdated }: { employe: any; onUpdated: () => void }) {
  const locale = getLocale()
  const [f, setF] = useState({ ...employe })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const u = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))

  const initials = [employe.prenom, employe.nom].filter(Boolean).map((n: string) => n[0]).join("").toUpperCase() || "?"
  const currentPhoto = photoPreview || employe.photo_url || null

  const handlePhotoPick = () => fileInputRef.current?.click()

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
      toast.error(t('sal.fiche.toast_format_unsupported', locale), { description: t('sal.fiche.toast_format_unsupported_desc', locale) })
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error(t('sal.fiche.toast_file_too_large', locale), { description: t('sal.fiche.toast_file_too_large_desc', locale) })
      return
    }

    // Aperçu local immédiat
    const objectUrl = URL.createObjectURL(file)
    setPhotoPreview(objectUrl)

    setUploadingPhoto(true)
    try {
      const form = new FormData()
      form.append("photo", file)
      // TODO(RH agent) — endpoint POST /api/rh/employes/me/photo en cours
      // de création sur fix/sprint-rh-securite (sprint weekend). Quand il
      // existera, il doit renvoyer { photo_url } après upload vers
      // Supabase Storage (bucket avatars/) et PATCH employes.photo_url.
      const res = await fetch("/api/rh/employes/me/photo", { method: "POST", body: form })
      if (!res.ok) {
        if (res.status === 404) {
          toast.warning(t('sal.fiche.toast_upload_deploying', locale), {
            description: t('sal.fiche.toast_upload_deploying_desc', locale),
          })
        } else {
          const data = await res.json().catch(() => ({}))
          toast.error(t('sal.fiche.toast_upload_error', locale), { description: data.error || `HTTP ${res.status}` })
          setPhotoPreview(null)
        }
        return
      }
      const data = await res.json()
      if (data.photo_url) {
        setPhotoPreview(null) // on laisse l'URL du serveur prendre le relais
        onUpdated()
        notifySuccess(t('sal.fiche.toast_photo_updated', locale))
      }
    } catch {
      notifyError(t('sal.fiche.toast_network_error', locale))
      setPhotoPreview(null)
    } finally {
      setUploadingPhoto(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

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
      if (data.error) toast.error(t('sal.fiche.toast_error', locale), { description: data.error })
      else { setSaved(true); setTimeout(() => setSaved(false), 4000); onUpdated() }
    } catch { notifyError(t('sal.fiche.toast_network_error', locale)) }
    setSaving(false)
  }

  const inputCls = "h-11 rounded-xl"

  return (
    <div className="space-y-6">
      {saved && (
        <div className="flex items-center gap-3 p-4 rounded-2xl text-sm font-medium text-white shadow-sm" style={{ backgroundColor: GREEN }}>
          <CheckCircle className="h-5 w-5 shrink-0" />
          {t('sal.fiche.success_updated', locale)}
        </div>
      )}

      <Card className="rounded-2xl shadow-sm overflow-hidden">
        <CardContent className="flex flex-col items-center py-8 gap-3">
          <div className="relative">
            <div className="rounded-full p-1" style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD}88)` }}>
              <Avatar className="w-20 h-20 border-2 border-white">
                {currentPhoto && <AvatarImage src={currentPhoto} alt={employe.prenom} />}
                <AvatarFallback className="text-2xl font-bold text-white" style={{ backgroundColor: NAVY }}>{initials}</AvatarFallback>
              </Avatar>
            </div>
            <button
              type="button"
              onClick={handlePhotoPick}
              disabled={uploadingPhoto}
              aria-label={t('sal.fiche.aria_change_photo', locale)}
              className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-white border shadow-md flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-50"
              style={{ borderColor: GOLD }}
            >
              {uploadingPhoto ? (
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: GOLD }} />
              ) : (
                <Camera className="h-4 w-4" style={{ color: GOLD }} />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_AVATAR_TYPES.join(",")}
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold" style={{ color: NAVY }}>{[employe.prenom, employe.nom].filter(Boolean).join(" ") || t('sal.fiche.my_profile', locale)}</h2>
            <p className="text-sm text-gray-500">{employe.poste || t('sal.fiche.employee', locale)}</p>
            <Badge variant="outline" className="text-xs font-mono" style={{ borderColor: GOLD, color: GOLD }}>{employe.code_employe || employe.code || "—"}</Badge>
          </div>
          <p className="text-xs text-gray-400 mt-1">{t('sal.fiche.avatar_hint', locale)}</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <div className="flex rounded-2xl overflow-hidden">
          <div className="w-1.5 shrink-0" style={{ backgroundColor: BLUE }} />
          <div className="flex-1 p-5 space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">{t('sal.fiche.section_contact', locale)}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">{t('sal.fiche.label_email', locale)}</Label><Input type="email" className={inputCls} value={f.email || ""} onChange={e => u("email", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">{t('sal.fiche.label_mobile', locale)}</Label><Input className={inputCls} value={f.mobile || ""} onChange={e => u("mobile", e.target.value)} placeholder="+230 5XXX XXXX" /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">{t('sal.fiche.label_phone', locale)}</Label><Input className={inputCls} value={f.telephone || ""} onChange={e => u("telephone", e.target.value)} /></div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <div className="flex rounded-2xl overflow-hidden">
          <div className="w-1.5 shrink-0" style={{ backgroundColor: GREEN }} />
          <div className="flex-1 p-5 space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">{t('sal.fiche.section_address', locale)}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">{t('sal.fiche.label_address', locale)}</Label><Input className={inputCls} value={f.adresse || ""} onChange={e => u("adresse", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">{t('sal.fiche.label_address2', locale)}</Label><Input className={inputCls} value={f.adresse2 || ""} onChange={e => u("adresse2", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">{t('sal.fiche.label_city', locale)}</Label><Input className={inputCls} value={f.ville || ""} onChange={e => u("ville", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">{t('sal.fiche.label_postal_code', locale)}</Label><Input className={inputCls} value={f.code_postal || ""} onChange={e => u("code_postal", e.target.value)} /></div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <div className="flex rounded-2xl overflow-hidden">
          <div className="w-1.5 shrink-0" style={{ backgroundColor: GOLD }} />
          <div className="flex-1 p-5 space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">{t('sal.fiche.section_bank', locale)}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">{t('sal.fiche.label_bank', locale)}</Label><Input className={inputCls} value={f.bank_name || ""} onChange={e => u("bank_name", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">{t('sal.fiche.label_account_number', locale)}</Label><Input className={inputCls} value={f.bank_account || ""} onChange={e => u("bank_account", e.target.value)} /></div>
              <div className="md:col-span-2 space-y-1.5"><Label className="text-xs font-medium text-gray-500">IBAN</Label><Input className={inputCls} value={f.iban || ""} onChange={e => u("iban", e.target.value)} /></div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <div className="flex rounded-2xl overflow-hidden">
          <div className="w-1.5 shrink-0" style={{ backgroundColor: "#A855F7" }} />
          <div className="flex-1 p-5 space-y-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">{t('sal.fiche.section_personal', locale)}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">{t('sal.fiche.label_birth_date', locale)}</Label><Input type="date" className={inputCls} value={f.date_naissance?.split("T")[0] || ""} onChange={e => u("date_naissance", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">{t('sal.fiche.label_gender', locale)}</Label>
                <Select value={f.genre || ""} onValueChange={v => u("genre", v)}>
                  <SelectTrigger className={inputCls}><SelectValue placeholder={t('sal.fiche.placeholder_choose', locale)} /></SelectTrigger>
                  <SelectContent><SelectItem value="M">{t('sal.fiche.gender_male', locale)}</SelectItem><SelectItem value="F">{t('sal.fiche.gender_female', locale)}</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">{t('sal.fiche.label_nationality', locale)}</Label><Input className={inputCls} value={f.nationalite || ""} onChange={e => u("nationalite", e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">{t('sal.fiche.label_marital_status', locale)}</Label>
                <Select value={f.statut_marital || "single"} onValueChange={v => u("statut_marital", v)}>
                  <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">{t('sal.fiche.marital_single', locale)}</SelectItem>
                    <SelectItem value="married">{t('sal.fiche.marital_married', locale)}</SelectItem>
                    <SelectItem value="divorced">{t('sal.fiche.marital_divorced', locale)}</SelectItem>
                    <SelectItem value="widowed">{t('sal.fiche.marital_widowed', locale)}</SelectItem>
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
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">{t('sal.fiche.section_emergency', locale)}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">{t('sal.fiche.label_name', locale)}</Label><Input className={inputCls} value={f.contact_urgence_nom || ""} onChange={e => u("contact_urgence_nom", e.target.value)} placeholder={t('sal.fiche.placeholder_full_name', locale)} /></div>
              <div className="space-y-1.5"><Label className="text-xs font-medium text-gray-500">{t('sal.fiche.label_phone', locale)}</Label><Input className={inputCls} value={f.contact_urgence_tel || ""} onChange={e => u("contact_urgence_tel", e.target.value)} placeholder="+230 5XXX XXXX" /></div>
              <div className="space-y-1.5 md:col-span-2"><Label className="text-xs font-medium text-gray-500">{t('sal.fiche.label_relation', locale)}</Label><Input className={inputCls} value={f.contact_urgence_relation || ""} onChange={e => u("contact_urgence_relation", e.target.value)} placeholder={t('sal.fiche.placeholder_relation', locale)} /></div>
            </div>
          </div>
        </div>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto rounded-xl h-11 text-white font-semibold px-8" style={{ backgroundColor: GOLD }}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
        {t('sal.fiche.btn_save', locale)}
      </Button>

      <Card className="rounded-2xl shadow-sm bg-gray-50/80 border-dashed">
        <CardContent className="p-5 space-y-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">{t('sal.fiche.section_employment', locale)}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1"><Label className="text-xs text-gray-400">{t('sal.fiche.label_employee_code', locale)}</Label><p className="text-sm font-mono bg-gray-100 text-gray-500 p-2.5 rounded-xl">{employe.code_employe || employe.code || "—"}</p></div>
            <div className="space-y-1"><Label className="text-xs text-gray-400">{t('sal.fiche.label_arrival_date', locale)}</Label><p className="text-sm bg-gray-100 text-gray-500 p-2.5 rounded-xl">{employe.date_arrivee ? new Date(employe.date_arrivee).toLocaleDateString("fr-FR") : "—"}</p></div>
            <div className="space-y-1"><Label className="text-xs text-gray-400">{t('sal.fiche.label_position', locale)}</Label><p className="text-sm bg-gray-100 text-gray-500 p-2.5 rounded-xl">{employe.poste || "—"}</p></div>
            <div className="space-y-1"><Label className="text-xs text-gray-400">{t('sal.fiche.label_department', locale)}</Label><p className="text-sm bg-gray-100 text-gray-500 p-2.5 rounded-xl">{employe.departement || "—"}</p></div>
            <div className="space-y-1 md:col-span-2"><Label className="text-xs text-gray-400">{t('sal.fiche.label_address', locale)}</Label><p className="text-sm bg-gray-100 text-gray-500 p-2.5 rounded-xl">{[employe.adresse, employe.adresse2, employe.ville, employe.code_postal].filter(Boolean).join(', ') || "—"}</p></div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
