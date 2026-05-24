"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { RequireRole, NON_CLIENT_USER_ROLES } from "@/components/client/RequireRole"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { User, Building2, Bell, Shield, Loader2 } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useProfile } from "@/hooks/use-profile"
import { t, getLocale } from "@/lib/i18n"

interface Societe {
  id: string
  nom: string
  brn: string | null
  numero_tva_mra: string | null
  comptable?: {
    id: string
    full_name: string
    email: string
    phone: string | null
  } | null
}

export default function ProfilPage() {
  const locale = getLocale()
  const { profile, loading } = useProfile()
  const { societe: activeSociete, loading: societeLoading } = useSocieteActive()

  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [saving, setSaving] = useState(false)
  const [pwdOpen, setPwdOpen] = useState(false)
  const [newPwd, setNewPwd] = useState("")
  const [pwdSaving, setPwdSaving] = useState(false)

  const societe = activeSociete as Societe | null
  const loadingSociete = societeLoading

  const [notifEmail, setNotifEmail] = useState(true)
  const [notifWhatsapp, setNotifWhatsapp] = useState(true)
  const [notifTva, setNotifTva] = useState(true)
  const [notifDocuments, setNotifDocuments] = useState(true)
  const [notifSalaires, setNotifSalaires] = useState(false)

  // Populate form fields from profile
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "")
      setEmail(profile.email || "")
      setPhone(profile.phone || "")
    }
  }, [profile])

  async function handleSaveProfile() {
    if (!profile?.id) {
      toast.error("Profil non chargé")
      return
    }
    setSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName || null, phone: phone || null })
        .eq("id", profile.id)
      if (error) {
        toast.error("Erreur sauvegarde : " + error.message)
      } else {
        toast.success(t('core.prof.save_changes', locale))
      }
    } catch {
      toast.error("Erreur sauvegarde")
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword() {
    if (!newPwd || newPwd.length < 8) {
      toast.error("Mot de passe : 8 caractères minimum")
      return
    }
    setPwdSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: newPwd })
      if (error) {
        toast.error("Erreur : " + error.message)
      } else {
        toast.success(t('core.prof.change_password', locale))
        setNewPwd("")
        setPwdOpen(false)
      }
    } catch {
      toast.error("Erreur changement mot de passe")
    } finally {
      setPwdSaving(false)
    }
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#D4AF37" }} />
      </div>
    )
  }

  if (profile?.role === "client_user") {
    return <RequireRole roles={NON_CLIENT_USER_ROLES}>{null}</RequireRole>
  }

  return (
    <ClientPageShell
      breadcrumbs={[{ label: t('core.prof.client_space', locale), href: "/client" }, { label: t('core.prof.my_profile', locale) }]}
      kicker={t('core.prof.my_account', locale)}
      title={t('core.prof.my_profile', locale)}
      subtitle={t('core.prof.subtitle', locale)}
    >
      <div className="space-y-6">
      {/* Informations personnelles */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <User className="h-5 w-5" style={{ color: "#0B0F2E" }} />
            <CardTitle style={{ color: "#0B0F2E" }}>{t('core.prof.personal_info', locale)}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">{t('core.prof.full_name', locale)}</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('core.prof.email', locale)}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                readOnly
                disabled
                title="Pour modifier votre email, contactez votre comptable."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{t('core.prof.phone', locale)}</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('core.prof.role', locale)}</Label>
              <div className="flex items-center h-9">
                <Badge style={{ backgroundColor: "#0B0F2E", color: "white" }}>
                  {profile?.role === "client_admin" ? t('core.prof.administrator', locale) : profile?.role || "---"}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              disabled={saving}
              onClick={handleSaveProfile}
              style={{ backgroundColor: "#D4AF37", color: "white" }}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('core.prof.save_changes', locale)}
                </>
              ) : (
                t('core.prof.save_changes', locale)
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Ma Société */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5" style={{ color: "#0B0F2E" }} />
            <CardTitle style={{ color: "#0B0F2E" }}>{t('core.prof.my_company', locale)}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loadingSociete ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#D4AF37" }} />
            </div>
          ) : societe ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('core.prof.company_name', locale)}</p>
                <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>
                  {societe.nom}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('core.prof.brn', locale)}</p>
                <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>
                  {societe.brn || "---"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('core.prof.vat_mra', locale)}</p>
                <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>
                  {societe.numero_tva_mra || "---"}
                </p>
              </div>
              {societe.comptable && (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{t('core.prof.accountant_assigned', locale)}</p>
                  <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>
                    {societe.comptable.full_name}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {t('core.prof.no_company_associated', locale)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('core.prof.contact_accountant_link', locale)}
              </p>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-4">
            {t('core.prof.info_managed_accountant', locale)}
          </p>
        </CardContent>
      </Card>

      {/* Préférences notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5" style={{ color: "#0B0F2E" }} />
            <CardTitle style={{ color: "#0B0F2E" }}>{t('core.prof.notification_preferences', locale)}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>{t('core.prof.notif_email', locale)}</p>
              <p className="text-sm text-muted-foreground">{t('core.prof.notif_email_desc', locale)}</p>
            </div>
            <Switch checked={notifEmail} onCheckedChange={setNotifEmail} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>{t('core.prof.notif_wa', locale)}</p>
              <p className="text-sm text-muted-foreground">{t('core.prof.notif_wa_desc', locale)}</p>
            </div>
            <Switch checked={notifWhatsapp} onCheckedChange={setNotifWhatsapp} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>{t('core.prof.notif_vat', locale)}</p>
              <p className="text-sm text-muted-foreground">{t('core.prof.notif_vat_desc', locale)}</p>
            </div>
            <Switch checked={notifTva} onCheckedChange={setNotifTva} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>{t('core.prof.notif_docs', locale)}</p>
              <p className="text-sm text-muted-foreground">{t('core.prof.notif_docs_desc', locale)}</p>
            </div>
            <Switch checked={notifDocuments} onCheckedChange={setNotifDocuments} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>{t('core.prof.notif_salaries', locale)}</p>
              <p className="text-sm text-muted-foreground">{t('core.prof.notif_salaries_desc', locale)}</p>
            </div>
            <Switch checked={notifSalaires} onCheckedChange={setNotifSalaires} />
          </div>
        </CardContent>
      </Card>

      {/* Sécurité */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5" style={{ color: "#0B0F2E" }} />
            <CardTitle style={{ color: "#0B0F2E" }}>{t('core.prof.security', locale)}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>{t('core.prof.password', locale)}</p>
              <p className="text-sm text-muted-foreground">
                {t('core.prof.password_desc', locale)}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setPwdOpen((v) => !v)}
              style={{ borderColor: "#0B0F2E", color: "#0B0F2E" }}
            >
              {t('core.prof.change_password', locale)}
            </Button>
          </div>
          {pwdOpen && (
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end pt-4 border-t">
              <div className="space-y-1 flex-1">
                <Label htmlFor="new-pwd">{t('core.prof.password', locale)}</Label>
                <Input
                  id="new-pwd"
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="Min. 8 caractères"
                  autoComplete="new-password"
                />
              </div>
              <Button
                onClick={handleChangePassword}
                disabled={pwdSaving}
                style={{ backgroundColor: "#D4AF37", color: "white" }}
              >
                {pwdSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    OK
                  </>
                ) : (
                  "OK"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </ClientPageShell>
  )
}
