"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Loader2, User, Shield, Bell, Key, CheckCircle, LogOut } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { t, getLocale, type Locale } from "@/lib/i18n"

const roleLabels = (locale: Locale): Record<string, { label: string; color: string; desc: string }> => ({
  admin:           { label: t('pub.profil.role_admin', locale), color: "bg-red-100 text-red-700", desc: t('pub.profil.role_admin_desc', locale) },
  direction:       { label: t('pub.profil.role_direction', locale), color: "bg-purple-100 text-purple-700", desc: t('pub.profil.role_direction_desc', locale) },
  comptable:       { label: t('pub.profil.role_accountant', locale), color: "bg-blue-100 text-blue-700", desc: t('pub.profil.role_accountant_desc', locale) },
  comptable_dedie: { label: t('pub.profil.role_dedicated', locale), color: "bg-indigo-100 text-indigo-700", desc: t('pub.profil.role_dedicated_desc', locale) },
  rh_manager:      { label: t('pub.profil.role_hr', locale), color: "bg-green-100 text-green-700", desc: t('pub.profil.role_hr_desc', locale) },
  juridique:       { label: t('pub.profil.role_legal', locale), color: "bg-amber-100 text-amber-700", desc: t('pub.profil.role_legal_desc', locale) },
  client_admin:    { label: t('pub.profil.role_client_admin', locale), color: "bg-orange-100 text-orange-700", desc: t('pub.profil.role_client_admin_desc', locale) },
  client_user:     { label: t('pub.profil.role_client_user', locale), color: "bg-gray-100 text-gray-700", desc: t('pub.profil.role_client_user_desc', locale) },
  salarie:         { label: t('pub.profil.role_employee', locale), color: "bg-teal-100 text-teal-700", desc: t('pub.profil.role_employee_desc', locale) },
})

const ROLE_DASHBOARD: Record<string, string> = {
  admin: '/admin', direction: '/direction', comptable: '/comptable',
  comptable_dedie: '/comptable', rh_manager: '/rh', juridique: '/rh/juridique',
  client_admin: '/client/tableau-de-bord', client_user: '/client/tableau-de-bord', salarie: '/salarie',
}

export default function ProfilPage() {
  const locale = getLocale()
  const ROLE_LABELS = roleLabels(locale)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({ full_name: "", phone: "" })

  useEffect(() => {
    fetch('/api/profil').then(r => r.json()).then(d => {
      if (d.profile) {
        setProfile({ ...d.profile, email: d.email })
        setForm({ full_name: d.profile.full_name || "", phone: d.profile.phone || "" })
      }
      setLoading(false)
    })
  }, [])

  const save = async () => {
    setSaving(true)
    const res = await fetch('/api/profil', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const d = await res.json()
    if (d.profile) setProfile((p: any) => ({ ...p, ...d.profile }))
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const logout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="w-8 h-8 animate-spin text-[#0B0F2E]"/></div>

  const roleInfo = ROLE_LABELS[profile?.role] || { label: profile?.role, color: "bg-gray-100 text-gray-700", desc: "" }
  const dashUrl = ROLE_DASHBOARD[profile?.role] || '/'

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#0B0F2E]">{t('pub.profil.title', locale)}</h1>
            <p className="text-sm text-gray-500">{t('pub.profil.subtitle', locale)}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.location.href = dashUrl}>{t('pub.profil.my_space', locale)}</Button>
            <Button variant="outline" size="sm" onClick={logout} className="text-red-600 hover:text-red-700">
              <LogOut className="w-4 h-4 mr-1"/>{t('pub.profil.logout', locale)}
            </Button>
          </div>
        </div>

        {/* Identité & Rôle */}
        <Card>
          <CardHeader><CardTitle className="text-[#0B0F2E] flex items-center gap-2 text-base"><User className="w-4 h-4"/>{t('pub.profil.identity', locale)}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-[#0B0F2E] flex items-center justify-center text-white text-xl font-bold">
                {(profile?.full_name || profile?.email || '?')[0].toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-[#0B0F2E]">{profile?.full_name || '—'}</p>
                <p className="text-sm text-gray-500">{profile?.email}</p>
                <Badge className={`text-xs mt-1 ${roleInfo.color}`}>
                  <Shield className="w-3 h-3 mr-1"/>{roleInfo.label}
                </Badge>
              </div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
              <strong>{t('pub.profil.access', locale)}</strong> {roleInfo.desc}
            </div>
          </CardContent>
        </Card>

        {/* Modifier informations */}
        <Card>
          <CardHeader><CardTitle className="text-[#0B0F2E] flex items-center gap-2 text-base"><Key className="w-4 h-4"/>{t('pub.profil.personal_info', locale)}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('pub.profil.full_name', locale)}</Label>
                <Input value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} placeholder={t('pub.profil.full_name_ph', locale)}/>
              </div>
              <div>
                <Label>{t('pub.profil.phone', locale)}</Label>
                <Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder={t('pub.profil.phone_ph', locale)}/>
              </div>
            </div>
            <div>
              <Label>{t('pub.profil.email_readonly', locale)}</Label>
              <Input value={profile?.email || ''} disabled className="bg-gray-50 text-gray-500"/>
            </div>
            <Button onClick={save} disabled={saving || saved} className="bg-[#0B0F2E] text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : saved ? <CheckCircle className="w-4 h-4 mr-2 text-green-400"/> : null}
              {saved ? t('pub.profil.saved', locale) : t('pub.profil.save', locale)}
            </Button>
          </CardContent>
        </Card>

        {/* Informations du compte */}
        <Card>
          <CardHeader><CardTitle className="text-[#0B0F2E] flex items-center gap-2 text-base"><Shield className="w-4 h-4"/>{t('pub.profil.account_security', locale)}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">{t('pub.profil.role', locale)}</span>
              <Badge className={`text-xs ${roleInfo.color}`}>{roleInfo.label}</Badge>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">{t('pub.profil.member_since', locale)}</span>
              <span className="font-medium">{profile?.created_at ? new Date(profile.created_at).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR') : '—'}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">{t('pub.profil.user_id', locale)}</span>
              <span className="font-mono text-xs text-gray-400">{profile?.id?.slice(0,8)}…</span>
            </div>
            {profile?.module_acces?.length > 0 && (
              <div className="flex justify-between py-2">
                <span className="text-gray-500">{t('pub.profil.allowed_modules', locale)}</span>
                <span className="text-sm">{profile.module_acces.join(', ')}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mot de passe */}
        <Card>
          <CardHeader><CardTitle className="text-[#0B0F2E] flex items-center gap-2 text-base"><Bell className="w-4 h-4"/>{t('pub.profil.change_password', locale)}</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-3">{t('pub.profil.reset_hint', locale)}</p>
            <Button variant="outline" onClick={async () => {
              const supabase = createClient()
              await supabase.auth.resetPasswordForEmail(profile?.email || '')
              alert(t('pub.profil.reset_sent', locale) + ' ' + profile?.email)
            }}>
              {t('pub.profil.send_reset', locale)}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
