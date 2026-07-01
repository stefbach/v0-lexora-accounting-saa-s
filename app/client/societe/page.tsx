"use client"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Loader2, Save, Building2, Phone, Banknote, Settings, MapPin, CheckCircle } from "lucide-react"
import { t, getLocale, type Locale } from "@/lib/i18n"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

type Tab = "details" | "contact" | "payroll" | "bank"

function TabButton({ id, label, active, onClick }: { id: Tab; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="tab"
      id={`tab-${id}`}
      aria-selected={active}
      aria-controls={`tabpanel-${id}`}
      tabIndex={active ? 0 : -1}
      className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${active ? "text-white" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}
      style={active ? { backgroundColor: NAVY } : {}}>
      {label}
    </button>
  )
}

// Each tab is a separate component with its own state to avoid re-render issues
function DetailsTab({ data, onSave, locale }: { data: any; onSave: (d: any) => void; locale: Locale }) {
  const [f, setF] = useState({ ...data })
  const u = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))

  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const importRegister = async (file: File) => {
    setScanning(true); setScanMsg(null)
    try {
      const b64 = await new Promise<string>((res, rej) => {
        const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file)
      })
      const resp = await fetch('/api/client/societes/import-register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ societe_id: f.id, pdf_base64: b64 }),
      })
      const d = await resp.json()
      if (!resp.ok) throw new Error(d.error || 'Numérisation échouée')
      const sf = d.societeFields || {}
      const ex = d.extracted || {}
      const merged: Record<string, any> = {}
      for (const [k, v] of Object.entries(sf)) if (v) merged[k] = v
      if (ex.date_incorporation && /^\d{4}-\d{2}-\d{2}$/.test(ex.date_incorporation)) merged.date_incorporation = ex.date_incorporation
      setF((p: any) => ({ ...p, ...merged }))
      const nb = Object.keys(merged).length
      setScanMsg({ kind: 'ok', text: locale === 'en' ? `${nb} field(s) pre-filled from the register. Review and Save.` : `${nb} champ(s) pré-remplis depuis le registre. Vérifie et Enregistre.` })
    } catch (e: any) {
      setScanMsg({ kind: 'err', text: e?.message || 'Erreur' })
    } finally { setScanning(false) }
  }

  return (
    <div className="space-y-6">
      {/* Numérisation intelligente d'un registre CBRD */}
      <div className="rounded-xl border border-dashed p-4 flex flex-wrap items-center gap-3" style={{ borderColor: GOLD, background: 'rgba(212,175,55,0.06)' }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: NAVY }}><Building2 className="w-4 h-4" style={{ color: GOLD }} /></div>
        <div className="flex-1 min-w-[200px]">
          <div className="text-sm font-semibold" style={{ color: NAVY }}>{locale === 'en' ? 'Scan a company register (CBRD)' : 'Numériser un registre (CBRD)'}</div>
          <div className="text-xs text-gray-500">{locale === 'en' ? 'Upload the PDF register — the AI fills in the company details automatically.' : "Dépose le registre PDF — l'IA remplit automatiquement les informations de la société."}</div>
        </div>
        <label className="inline-flex items-center h-9 px-4 rounded-md text-sm font-semibold cursor-pointer shrink-0" style={{ background: NAVY, color: GOLD }}>
          {scanning ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Building2 className="w-4 h-4 mr-1.5" />}
          {scanning ? (locale === 'en' ? 'Scanning…' : 'Numérisation…') : (locale === 'en' ? 'Upload PDF' : 'Charger le PDF')}
          <input type="file" accept="application/pdf" className="hidden" disabled={scanning}
            onChange={(e) => { const file = e.target.files?.[0]; if (file) importRegister(file); e.currentTarget.value = '' }} />
        </label>
      </div>
      {scanMsg && (
        <div className={`text-sm rounded-md p-2 border ${scanMsg.kind === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{scanMsg.text}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div><Label>{t('core.socset.company_name', locale)} *</Label><Input value={f.nom || ""} onChange={e => u("nom", e.target.value)} /></div>
          <div><Label>{t('core.socset.short_name', locale)}</Label><Input value={f.short_name || ""} onChange={e => u("short_name", e.target.value)} placeholder="Ex: DDS" /></div>
          <div><Label>{t('core.socset.ern', locale)}</Label><Input value={f.ern || ""} onChange={e => u("ern", e.target.value)} placeholder="Ex: 02276097" /></div>
          <div><Label>{t('core.socset.npf_number', locale)}</Label><Input value={f.npf_number || ""} onChange={e => u("npf_number", e.target.value)} placeholder="Ex: 02276097" /></div>
          <div><Label>{t('core.socset.incorporation_date', locale)}</Label><Input type="date" value={f.date_incorporation || ""} onChange={e => u("date_incorporation", e.target.value)} /></div>
        </div>
        <div className="space-y-4">
          <div><Label>{t('core.socset.brn', locale)}</Label><Input value={f.brn || ""} onChange={e => u("brn", e.target.value)} placeholder="Ex: C20173522" /></div>
          <div><Label>{t('core.socset.vat_number_mra', locale)}</Label><Input value={f.numero_tva_mra || ""} onChange={e => u("numero_tva_mra", e.target.value)} /></div>
          <div><Label>{t('core.socset.nature_business', locale)}</Label><Input value={f.nature_business || ""} onChange={e => u("nature_business", e.target.value)} placeholder="Ex: BPO, Télémedecine" /></div>
          <div><Label>{t('core.socset.sector', locale)}</Label><Input value={f.secteur_activite || ""} onChange={e => u("secteur_activite", e.target.value)} /></div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <Switch checked={f.statut_tva === true} onCheckedChange={v => u("statut_tva", v)} />
            <Label>{t('core.socset.vat_subject', locale)}</Label>
          </div>
        </div>
      </div>
      <Button onClick={() => onSave(f)} style={{ backgroundColor: NAVY }} className="text-white">
        <Save className="h-4 w-4 mr-2" /> {t('core.socset.save', locale)}
      </Button>
    </div>
  )
}

function ContactTab({ data, onSave, locale }: { data: any; onSave: (d: any) => void; locale: Locale }) {
  const [f, setF] = useState({ ...data })
  const u = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">{t('core.socset.contact_person', locale)}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div><Label>{t('core.socset.name', locale)}</Label><Input value={f.contact_name || ""} onChange={e => u("contact_name", e.target.value)} placeholder="Stephane Bach" /></div>
          <div><Label>{t('core.socset.position', locale)}</Label><Input value={f.contact_position || ""} onChange={e => u("contact_position", e.target.value)} placeholder="CEO" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">{t('core.socset.coordinates', locale)}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div><Label>{t('core.socset.address', locale)}</Label><Input value={f.adresse || ""} onChange={e => u("adresse", e.target.value)} placeholder="Bourdet Road" /></div>
          <div><Label>{t('core.socset.phone', locale)}</Label><Input value={f.telephone || ""} onChange={e => u("telephone", e.target.value)} placeholder="52503644" /></div>
          <div><Label>{t('core.socset.address2', locale)}</Label><Input value={f.adresse2 || ""} onChange={e => u("adresse2", e.target.value)} /></div>
          <div><Label>{t('core.socset.fax', locale)}</Label><Input value={f.fax || ""} onChange={e => u("fax", e.target.value)} /></div>
          <div><Label>{t('core.socset.city', locale)}</Label><Input value={f.ville || ""} onChange={e => u("ville", e.target.value)} placeholder="Grand Baie" /></div>
          <div><Label>{t('core.socset.email', locale)}</Label><Input type="email" value={f.email || ""} onChange={e => u("email", e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">{t('core.socset.specific_email', locale)}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div><Label>{t('core.socset.email_response_requests', locale)}</Label><Input type="email" value={f.email || ""} onChange={e => u("email", e.target.value)} /></div>
          <div><Label>{t('core.socset.email_dco', locale)}</Label><Input type="email" value={f.email_dco || ""} onChange={e => u("email_dco", e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500 flex items-center gap-2"><MapPin className="h-4 w-4" /> {t('core.socset.gps_location', locale)}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div><Label>{t('core.socset.latitude', locale)}</Label><Input type="number" step="any" value={f.latitude || ""} onChange={e => u("latitude", e.target.value)} /></div>
          <div><Label>{t('core.socset.longitude', locale)}</Label><Input type="number" step="any" value={f.longitude || ""} onChange={e => u("longitude", e.target.value)} /></div>
          <div><Label>{t('core.socset.clocking_radius', locale)}</Label><Input type="number" value={f.distance_pointage || 50} onChange={e => u("distance_pointage", parseInt(e.target.value))} /></div>
        </CardContent>
      </Card>

      <Button onClick={() => onSave(f)} style={{ backgroundColor: NAVY }} className="text-white">
        <Save className="h-4 w-4 mr-2" /> {t('core.socset.save', locale)}
      </Button>
    </div>
  )
}

function PayrollTab({ data, onSave, locale }: { data: any; onSave: (d: any) => void; locale: Locale }) {
  const [f, setF] = useState({ ...data })
  const u = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">{t('core.socset.periods', locale)}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>{t('core.socset.month_closing_day', locale)}</Label>
              <Select value={String(f.period_closing_day || 24)} onValueChange={v => u("period_closing_day", parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({ length: 28 }, (_, i) => i + 1).map(d => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>{t('core.socset.pay_day', locale)}</Label>
              <Select value={String(f.pay_day || 28)} onValueChange={v => u("pay_day", parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({ length: 31 }, (_, i) => i + 1).map(d => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">{t('core.socset.salary_calc', locale)}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>{t('core.socset.frequency', locale)}</Label>
              <Select value={f.salary_frequency || "monthly"} onValueChange={v => u("salary_frequency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{t('core.socset.monthly', locale)}</SelectItem>
                  <SelectItem value="fortnightly">{t('core.socset.fortnightly', locale)}</SelectItem>
                  <SelectItem value="weekly">{t('core.socset.weekly', locale)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t('core.socset.eoy_bonus', locale)}</Label>
              <Select value={f.eoy_bonus_mode || "separated"} onValueChange={v => u("eoy_bonus_mode", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="separated">{t('core.socset.separated_payslip', locale)}</SelectItem>
                  <SelectItem value="included">{t('core.socset.included_payslip', locale)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">{t('core.socset.declarations', locale)}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>{t('core.socset.declaration_type', locale)}</Label>
              <Select value={f.declaration_type || "MRA_PACO"} onValueChange={v => u("declaration_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MRA_PACO">MRA (PACO)</SelectItem>
                  <SelectItem value="MRA_DIRECT">MRA Direct</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">{t('core.socset.payslip', locale)}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>{t('core.socset.template', locale)}</Label>
              <Select value={f.payslip_template || "basic"} onValueChange={v => u("payslip_template", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">{t('core.socset.basic', locale)}</SelectItem>
                  <SelectItem value="detailed">{t('core.socset.detailed', locale)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t('core.socset.print_language', locale)}</Label>
              <Select value={f.payslip_language || "fr"} onValueChange={v => u("payslip_language", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">{t('core.socset.french', locale)}</SelectItem>
                  <SelectItem value="en">{t('core.socset.english', locale)}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      <Button onClick={() => onSave(f)} style={{ backgroundColor: NAVY }} className="text-white">
        <Save className="h-4 w-4 mr-2" /> {t('core.socset.save', locale)}
      </Button>
    </div>
  )
}

function BankTab({ data, onSave, locale }: { data: any; onSave: (d: any) => void; locale: Locale }) {
  const [f, setF] = useState({ ...data })
  const u = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))
  const [bankAccounts, setBankAccounts] = useState<any[]>([])
  const [bankError, setBankError] = useState(false)

  useEffect(() => {
    if (data.id) {
      setBankError(false)
      fetch(`/api/comptable/banque?societe_id=${data.id}`)
        .then(r => { if (!r.ok) throw new Error(); return r.json() })
        .then(d => setBankAccounts(d.comptes || []))
        .catch(() => setBankError(true))
    }
  }, [data.id])

  const devises = f.devises_actives ? (typeof f.devises_actives === 'string' ? JSON.parse(f.devises_actives) : f.devises_actives) : ['MUR', 'EUR', 'USD']
  const allDevises = ['MUR', 'EUR', 'USD', 'GBP', 'JPY', 'ZAR', 'INR', 'MGA', 'SCR', 'NZD', 'CHF', 'AUD', 'CAD', 'SGD']

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">{t('core.socset.bank_accounts', locale)}</CardTitle></CardHeader>
          <CardContent>
            {bankError ? (
              <p className="text-red-500 text-sm py-4 text-center">{t('core.socset.bank_load_error', locale)}</p>
            ) : bankAccounts.length === 0 ? (
              <p className="text-gray-400 text-sm py-4 text-center">{t('core.socset.no_bank_account', locale)}</p>
            ) : (
              <div className="space-y-3">
                {bankAccounts.map((b: any) => (
                  <div key={b.id} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <Badge style={{ backgroundColor: NAVY }} className="text-white">{b.banque}</Badge>
                      <Badge variant="outline">{b.devise}</Badge>
                    </div>
                    <div className="mt-2 text-sm space-y-1">
                      <p><span className="text-gray-500">{t('core.socset.account', locale)}:</span> {b.numero_compte || "—"}</p>
                      <p><span className="text-gray-500">{t('core.socset.iban', locale)}:</span> {b.iban || "—"}</p>
                      {b.solde_actuel != null && <p><span className="text-gray-500">{t('core.socset.balance', locale)}:</span> <span className="font-mono font-medium">{Number(b.solde_actuel).toLocaleString(locale === 'en' ? 'en-GB' : 'fr-FR')} {b.devise}</span></p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">{t('core.socset.currencies_enabled', locale)}</CardTitle></CardHeader>
          <CardContent>
            <fieldset>
              <legend className="sr-only">{t('core.socset.currencies_enabled', locale)}</legend>
              <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('core.socset.currencies_enabled', locale)}>
                {allDevises.map(d => (
                  <label key={d} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={devises.includes(d)}
                      aria-label={d}
                      onChange={e => {
                        const next = e.target.checked ? [...devises, d] : devises.filter((x: string) => x !== d)
                        u("devises_actives", next)
                      }}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm font-medium">{d}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </CardContent>
        </Card>
      </div>

      <Button onClick={() => onSave(f)} style={{ backgroundColor: NAVY }} className="text-white">
        <Save className="h-4 w-4 mr-2" /> {t('core.socset.save', locale)}
      </Button>
    </div>
  )
}

// Main page
export default function SocieteSettingsPage() {
  const locale = getLocale()
  // W2-C problème 2 : respecter le provider plutôt que de refetch + forcer
  // unique[0]. Le cookie active_societe_id / acting_as_societe et le choix
  // utilisateur doivent persister, comme dans toutes les autres pages /client/*.
  const {
    societes,
    societeId,
    societe,
    loading,
    switchSociete,
    refresh,
  } = useSocieteActive()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<Tab>("details")

  const handleSave = async (data: any) => {
    if (!societeId) return
    setSaving(true); setSaved(false)
    try {
      const res = await fetch("/api/admin/societes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: societeId, ...data }),
      })
      const result = await res.json()
      if (result.error) alert(t('core.socset.error_prefix', locale) + ": " + result.error)
      else {
        setSaved(true)
        // Re-fetch global de la liste : la sidebar, le sélecteur global et
        // toutes les autres pages voient l'update sans reload.
        await refresh()
        setTimeout(() => setSaved(false), 3000)
      }
    } catch { alert(t('core.socset.network_error', locale)) }
    setSaving(false)
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>

  if (!societeId || !societe) {
    return (
      <div className="p-6">
        <p className="text-gray-500">{t('core.socset.no_active_societe', locale) || "Aucune société active. Sélectionnez-en une dans le menu."}</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>{t('core.socset.title', locale)}</h1>
          <p className="text-gray-500 text-sm">{t('core.socset.subtitle', locale)}</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <Badge className="bg-green-100 text-green-700"><CheckCircle className="h-3 w-3 mr-1" /> {t('core.socset.saved', locale)}</Badge>}
          {societes.length > 1 && (
            <Select value={societeId} onValueChange={switchSociete}>
              <SelectTrigger className="w-[220px]" aria-label={t('core.socset.title', locale)}><SelectValue /></SelectTrigger>
              <SelectContent>
                {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b" role="tablist" aria-label={t('core.socset.title', locale)}>
        <TabButton id="details" label={t('core.socset.tab_details', locale)} active={tab === "details"} onClick={() => setTab("details")} />
        <TabButton id="contact" label={t('core.socset.tab_contact', locale)} active={tab === "contact"} onClick={() => setTab("contact")} />
        <TabButton id="payroll" label={t('core.socset.tab_payroll', locale)} active={tab === "payroll"} onClick={() => setTab("payroll")} />
        <TabButton id="bank" label={t('core.socset.tab_bank', locale)} active={tab === "bank"} onClick={() => setTab("bank")} />
      </div>

      {/* Tab content — key={societeId} forces re-mount when société changes */}
      {societe && (
        <div
          role="tabpanel"
          id={`tabpanel-${tab}`}
          aria-labelledby={`tab-${tab}`}
          tabIndex={0}
          className="focus:outline-none"
        >
          {tab === "details" && <DetailsTab key={`details-${societeId}`} data={societe} onSave={handleSave} locale={locale} />}
          {tab === "contact" && <ContactTab key={`contact-${societeId}`} data={societe} onSave={handleSave} locale={locale} />}
          {tab === "payroll" && <PayrollTab key={`payroll-${societeId}`} data={societe} onSave={handleSave} locale={locale} />}
          {tab === "bank" && <BankTab key={`bank-${societeId}`} data={societe} onSave={handleSave} locale={locale} />}
        </div>
      )}
    </div>
  )
}
