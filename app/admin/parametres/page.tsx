"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Save, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale } from "@/lib/i18n"

type Params = {
  org_nom: string
  org_email: string
  org_logo_url: string
  wati_token: string
  wati_phone_id: string
  wati_webhook_url: string
  email_from: string
  email_reply_to: string
  taux_change_usd_mur: string
  taux_change_eur_mur: string
  exercice_fiscal_debut: string
  devise_principale: string
  notif_email: boolean
  notif_new_users: boolean
  notif_uploads: boolean
  notif_tva: boolean
}

const DEFAULTS: Params = {
  org_nom: "Lexora Mauritius",
  org_email: "admin@lexora.mu",
  org_logo_url: "",
  wati_token: "",
  wati_phone_id: "",
  wati_webhook_url: "",
  email_from: "noreply@lexora.mu",
  email_reply_to: "admin@lexora.mu",
  taux_change_usd_mur: "",
  taux_change_eur_mur: "",
  exercice_fiscal_debut: "01-01",
  devise_principale: "MUR",
  notif_email: true,
  notif_new_users: true,
  notif_uploads: false,
  notif_tva: true,
}

export default function AdminParametresPage() {
  const locale = getLocale()
  const [params, setParams] = useState<Params>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle")
  const [saveError, setSaveError] = useState("")

  useEffect(() => {
    fetch("/api/admin/parametres")
      .then(r => r.json())
      .then(d => {
        if (d.parametres) setParams({ ...DEFAULTS, ...d.parametres })
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const set = <K extends keyof Params>(key: K, value: Params[K]) =>
    setParams(p => ({ ...p, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    setSaveStatus("idle")
    try {
      const res = await fetch("/api/admin/parametres", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || t('adm.params.err_save', locale))
      setSaveStatus("success")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch (e: unknown) {
      setSaveStatus("error")
      setSaveError(e instanceof Error ? e.message : t('adm.params.err_unknown', locale))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-[#0B0F2E]" />
      </div>
    )
  }

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>{t('adm.params.title', locale)}</h1>
          <p className="text-muted-foreground">{t('adm.params.subtitle', locale)}</p>
        </div>
        <Button onClick={handleSave} disabled={saving} style={{ backgroundColor: "#D4AF37" }} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t('adm.params.save_all', locale)}
        </Button>
      </div>

      {saveStatus === "success" && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          {t('adm.params.saved', locale)}
        </div>
      )}
      {saveStatus === "error" && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="h-4 w-4" />
          {saveError}
        </div>
      )}

      {/* ── 1. Informations plateforme ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t('adm.params.section_org', locale)}</CardTitle>
          <CardDescription>{t('adm.params.section_org_desc', locale)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('adm.params.org_name', locale)}</Label>
              <Input value={params.org_nom} onChange={e => set("org_nom", e.target.value)} placeholder="Lexora Mauritius" />
            </div>
            <div className="space-y-2">
              <Label>{t('adm.params.org_email', locale)}</Label>
              <Input type="email" value={params.org_email} onChange={e => set("org_email", e.target.value)} placeholder="admin@lexora.mu" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('adm.params.logo_url', locale)}</Label>
            <Input value={params.org_logo_url} onChange={e => set("org_logo_url", e.target.value)} placeholder="https://..." />
          </div>
        </CardContent>
      </Card>

      {/* ── 2. WATI WhatsApp ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t('adm.params.section_wati', locale)}</CardTitle>
          <CardDescription>{t('adm.params.section_wati_desc', locale)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('adm.params.wati_token', locale)}</Label>
            <Input type="password" value={params.wati_token} onChange={e => set("wati_token", e.target.value)} placeholder="Bearer eyJ..." />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('adm.params.phone_id', locale)}</Label>
              <Input value={params.wati_phone_id} onChange={e => set("wati_phone_id", e.target.value)} placeholder="2307XXXXXXXX" />
            </div>
            <div className="space-y-2">
              <Label>{t('adm.params.webhook_url', locale)}</Label>
              <Input value={params.wati_webhook_url} onChange={e => set("wati_webhook_url", e.target.value)} placeholder="https://lexora.mu/api/webhooks/wati" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 3. Configuration email ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t('adm.params.section_email', locale)}</CardTitle>
          <CardDescription>{t('adm.params.section_email_desc', locale)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('adm.params.from_email', locale)}</Label>
              <Input type="email" value={params.email_from} onChange={e => set("email_from", e.target.value)} placeholder="noreply@lexora.mu" />
            </div>
            <div className="space-y-2">
              <Label>{t('adm.params.reply_to', locale)}</Label>
              <Input type="email" value={params.email_reply_to} onChange={e => set("email_reply_to", e.target.value)} placeholder="admin@lexora.mu" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 4. Taux de change ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t('adm.params.section_fx', locale)}</CardTitle>
          <CardDescription>{t('adm.params.section_fx_desc', locale)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>USD → MUR</Label>
              <Input type="number" value={params.taux_change_usd_mur} onChange={e => set("taux_change_usd_mur", e.target.value)} placeholder="Ex: 45.50" />
            </div>
            <div className="space-y-2">
              <Label>EUR → MUR</Label>
              <Input type="number" value={params.taux_change_eur_mur} onChange={e => set("taux_change_eur_mur", e.target.value)} placeholder="Ex: 49.00" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 5. Paramètres généraux ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t('adm.params.section_general', locale)}</CardTitle>
          <CardDescription>{t('adm.params.section_general_desc', locale)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('adm.params.fiscal_start', locale)}</Label>
              <Input value={params.exercice_fiscal_debut} onChange={e => set("exercice_fiscal_debut", e.target.value)} placeholder="01-01 ou 01-07" />
            </div>
            <div className="space-y-2">
              <Label>{t('adm.params.primary_currency', locale)}</Label>
              <Select value={params.devise_principale} onValueChange={v => set("devise_principale", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MUR">MUR — Roupie mauricienne</SelectItem>
                  <SelectItem value="USD">USD — Dollar américain</SelectItem>
                  <SelectItem value="EUR">EUR — Euro</SelectItem>
                  <SelectItem value="GBP">GBP — Livre sterling</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 6. Notifications ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t('adm.params.section_notif', locale)}</CardTitle>
          <CardDescription>{t('adm.params.section_notif_desc', locale)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: "notif_email" as const,     label: t('adm.params.notif_email', locale),      desc: t('adm.params.notif_email_desc', locale) },
            { key: "notif_new_users" as const, label: t('adm.params.notif_new_users', locale),  desc: t('adm.params.notif_new_users_desc', locale) },
            { key: "notif_uploads" as const,   label: t('adm.params.notif_uploads', locale),    desc: t('adm.params.notif_uploads_desc', locale) },
            { key: "notif_tva" as const,       label: t('adm.params.notif_tva', locale),        desc: t('adm.params.notif_tva_desc', locale) },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <p className="font-medium">{label}</p>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
              <Switch checked={params[key]} onCheckedChange={v => set(key, v)} />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end pb-8">
        <Button onClick={handleSave} disabled={saving} style={{ backgroundColor: "#D4AF37" }} className="gap-2 px-8">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t('adm.params.save_all_long', locale)}
        </Button>
      </div>
    </div>
    </ClientPageShell>
  )
}
