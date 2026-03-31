"use client"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Loader2, Save, Building2, Phone, Banknote, Settings, MapPin, CheckCircle } from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

type Tab = "details" | "contact" | "payroll" | "bank"

function TabButton({ id, label, active, onClick }: { id: Tab; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${active ? "text-white" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}
      style={active ? { backgroundColor: NAVY } : {}}>
      {label}
    </button>
  )
}

// Each tab is a separate component with its own state to avoid re-render issues
function DetailsTab({ data, onSave }: { data: any; onSave: (d: any) => void }) {
  const [f, setF] = useState({ ...data })
  const u = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div><Label>Nom de la société *</Label><Input value={f.nom || ""} onChange={e => u("nom", e.target.value)} /></div>
          <div><Label>Nom court</Label><Input value={f.short_name || ""} onChange={e => u("short_name", e.target.value)} placeholder="Ex: DDS" /></div>
          <div><Label>ERN (Employer Registration Number)</Label><Input value={f.ern || ""} onChange={e => u("ern", e.target.value)} placeholder="Ex: 02276097" /></div>
          <div><Label>NPF No.</Label><Input value={f.npf_number || ""} onChange={e => u("npf_number", e.target.value)} placeholder="Ex: 02276097" /></div>
          <div><Label>Date d'incorporation</Label><Input type="date" value={f.date_incorporation || ""} onChange={e => u("date_incorporation", e.target.value)} /></div>
        </div>
        <div className="space-y-4">
          <div><Label>BRN (Business Registration Number)</Label><Input value={f.brn || ""} onChange={e => u("brn", e.target.value)} placeholder="Ex: C20173522" /></div>
          <div><Label>Numéro TVA MRA</Label><Input value={f.numero_tva_mra || ""} onChange={e => u("numero_tva_mra", e.target.value)} /></div>
          <div><Label>Nature of Business</Label><Input value={f.nature_business || ""} onChange={e => u("nature_business", e.target.value)} placeholder="Ex: BPO, Télémedecine" /></div>
          <div><Label>Secteur d'activité</Label><Input value={f.secteur_activite || ""} onChange={e => u("secteur_activite", e.target.value)} /></div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <Switch checked={f.statut_tva === true} onCheckedChange={v => u("statut_tva", v)} />
            <Label>Assujetti à la TVA</Label>
          </div>
        </div>
      </div>
      <Button onClick={() => onSave(f)} style={{ backgroundColor: NAVY }} className="text-white">
        <Save className="h-4 w-4 mr-2" /> Enregistrer
      </Button>
    </div>
  )
}

function ContactTab({ data, onSave }: { data: any; onSave: (d: any) => void }) {
  const [f, setF] = useState({ ...data })
  const u = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Personne de contact</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div><Label>Nom</Label><Input value={f.contact_name || ""} onChange={e => u("contact_name", e.target.value)} placeholder="Stephane Bach" /></div>
          <div><Label>Fonction</Label><Input value={f.contact_position || ""} onChange={e => u("contact_position", e.target.value)} placeholder="CEO" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Coordonnées</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div><Label>Adresse</Label><Input value={f.adresse || ""} onChange={e => u("adresse", e.target.value)} placeholder="Bourdet Road" /></div>
          <div><Label>Téléphone</Label><Input value={f.telephone || ""} onChange={e => u("telephone", e.target.value)} placeholder="52503644" /></div>
          <div><Label>Adresse 2</Label><Input value={f.adresse2 || ""} onChange={e => u("adresse2", e.target.value)} /></div>
          <div><Label>Fax</Label><Input value={f.fax || ""} onChange={e => u("fax", e.target.value)} /></div>
          <div><Label>Ville</Label><Input value={f.ville || ""} onChange={e => u("ville", e.target.value)} placeholder="Grand Baie" /></div>
          <div><Label>Email</Label><Input type="email" value={f.email || ""} onChange={e => u("email", e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Email spécifique</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div><Label>Email réponse demandes</Label><Input type="email" value={f.email || ""} onChange={e => u("email", e.target.value)} /></div>
          <div><Label>Email DCO (Data Controller)</Label><Input type="email" value={f.email_dco || ""} onChange={e => u("email_dco", e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500 flex items-center gap-2"><MapPin className="h-4 w-4" /> Localisation GPS (pour pointage)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div><Label>Latitude</Label><Input type="number" step="any" value={f.latitude || ""} onChange={e => u("latitude", e.target.value)} /></div>
          <div><Label>Longitude</Label><Input type="number" step="any" value={f.longitude || ""} onChange={e => u("longitude", e.target.value)} /></div>
          <div><Label>Rayon pointage (mètres)</Label><Input type="number" value={f.distance_pointage || 50} onChange={e => u("distance_pointage", parseInt(e.target.value))} /></div>
        </CardContent>
      </Card>

      <Button onClick={() => onSave(f)} style={{ backgroundColor: NAVY }} className="text-white">
        <Save className="h-4 w-4 mr-2" /> Enregistrer
      </Button>
    </div>
  )
}

function PayrollTab({ data, onSave }: { data: any; onSave: (d: any) => void }) {
  const [f, setF] = useState({ ...data })
  const u = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Périodes</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>Jour de clôture du mois</Label>
              <Select value={String(f.period_closing_day || 24)} onValueChange={v => u("period_closing_day", parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({ length: 28 }, (_, i) => i + 1).map(d => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Jour de paiement</Label>
              <Select value={String(f.pay_day || 28)} onValueChange={v => u("pay_day", parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({ length: 31 }, (_, i) => i + 1).map(d => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Calcul salaire</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>Fréquence</Label>
              <Select value={f.salary_frequency || "monthly"} onValueChange={v => u("salary_frequency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensuel</SelectItem>
                  <SelectItem value="fortnightly">Bimensuel</SelectItem>
                  <SelectItem value="weekly">Hebdomadaire</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>EOY Bonus (13ème mois)</Label>
              <Select value={f.eoy_bonus_mode || "separated"} onValueChange={v => u("eoy_bonus_mode", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="separated">Bulletin séparé</SelectItem>
                  <SelectItem value="included">Inclus dans le bulletin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Déclarations</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>Type de déclaration</Label>
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
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Bulletin de paie</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>Template</Label>
              <Select value={f.payslip_template || "basic"} onValueChange={v => u("payslip_template", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="detailed">Détaillé</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Langue d'impression</Label>
              <Select value={f.payslip_language || "fr"} onValueChange={v => u("payslip_language", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      <Button onClick={() => onSave(f)} style={{ backgroundColor: NAVY }} className="text-white">
        <Save className="h-4 w-4 mr-2" /> Enregistrer
      </Button>
    </div>
  )
}

function BankTab({ data, onSave }: { data: any; onSave: (d: any) => void }) {
  const [f, setF] = useState({ ...data })
  const u = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))
  const [bankAccounts, setBankAccounts] = useState<any[]>([])

  useEffect(() => {
    if (data.id) {
      fetch(`/api/comptable/banque?societe_id=${data.id}`).then(r => r.json()).then(d => setBankAccounts(d.comptes || [])).catch(() => {})
    }
  }, [data.id])

  const devises = f.devises_actives ? (typeof f.devises_actives === 'string' ? JSON.parse(f.devises_actives) : f.devises_actives) : ['MUR', 'EUR', 'USD']
  const allDevises = ['MUR', 'EUR', 'USD', 'GBP', 'JPY', 'ZAR', 'INR', 'MGA', 'SCR', 'NZD', 'CHF', 'AUD', 'CAD', 'SGD']

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Comptes bancaires</CardTitle></CardHeader>
          <CardContent>
            {bankAccounts.length === 0 ? (
              <p className="text-gray-400 text-sm py-4 text-center">Aucun compte bancaire. Les comptes sont créés automatiquement lors de l'upload d'un relevé bancaire.</p>
            ) : (
              <div className="space-y-3">
                {bankAccounts.map((b: any) => (
                  <div key={b.id} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <Badge style={{ backgroundColor: NAVY }} className="text-white">{b.banque}</Badge>
                      <Badge variant="outline">{b.devise}</Badge>
                    </div>
                    <div className="mt-2 text-sm space-y-1">
                      <p><span className="text-gray-500">Compte:</span> {b.numero_compte || "—"}</p>
                      <p><span className="text-gray-500">IBAN:</span> {b.iban || "—"}</p>
                      {b.solde_actuel != null && <p><span className="text-gray-500">Solde:</span> <span className="font-mono font-medium">{Number(b.solde_actuel).toLocaleString("fr-FR")} {b.devise}</span></p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">Devises activées</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              {allDevises.map(d => (
                <label key={d} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50">
                  <input type="checkbox" checked={devises.includes(d)}
                    onChange={e => {
                      const next = e.target.checked ? [...devises, d] : devises.filter((x: string) => x !== d)
                      u("devises_actives", next)
                    }}
                    className="rounded border-gray-300" />
                  <span className="text-sm font-medium">{d}</span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Button onClick={() => onSave(f)} style={{ backgroundColor: NAVY }} className="text-white">
        <Save className="h-4 w-4 mr-2" /> Enregistrer
      </Button>
    </div>
  )
}

// Main page
export default function SocieteSettingsPage() {
  const [societes, setSocietes] = useState<any[]>([])
  const [societeId, setSocieteId] = useState("")
  const [societe, setSociete] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<Tab>("details")

  useEffect(() => {
    Promise.all([
      fetch("/api/comptable/societes").then(r => r.json()).catch(() => ({ societes: [] })),
      fetch("/api/client/societes").then(r => r.json()).catch(() => ({ societes: [] })),
    ]).then(([d1, d2]) => {
      const all = [...(d1.societes || []), ...(d2.societes || [])]
      const unique = Array.from(new Map(all.map((s: any) => [s.id, s])).values())
      setSocietes(unique)
      if (unique.length >= 1) { setSocieteId(unique[0].id); setSociete(unique[0]) }
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (societeId) {
      const s = societes.find(s => s.id === societeId)
      if (s) setSociete(s)
    }
  }, [societeId, societes])

  const handleSave = async (data: any) => {
    setSaving(true); setSaved(false)
    try {
      const res = await fetch("/api/admin/societes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: societeId, ...data }),
      })
      const result = await res.json()
      if (result.error) alert("Erreur: " + result.error)
      else {
        setSaved(true)
        setSociete(data)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch { alert("Erreur réseau") }
    setSaving(false)
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>Paramètres Société</h1>
          <p className="text-gray-500 text-sm">Configuration complète de votre entreprise</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <Badge className="bg-green-100 text-green-700"><CheckCircle className="h-3 w-3 mr-1" /> Enregistré</Badge>}
          {societes.length > 1 && (
            <Select value={societeId} onValueChange={setSocieteId}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {societes.map(s => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <TabButton id="details" label="Détails société" active={tab === "details"} onClick={() => setTab("details")} />
        <TabButton id="contact" label="Contact" active={tab === "contact"} onClick={() => setTab("contact")} />
        <TabButton id="payroll" label="Paie" active={tab === "payroll"} onClick={() => setTab("payroll")} />
        <TabButton id="bank" label="Banque" active={tab === "bank"} onClick={() => setTab("bank")} />
      </div>

      {/* Tab content */}
      {societe && (
        <div>
          {tab === "details" && <DetailsTab data={societe} onSave={handleSave} />}
          {tab === "contact" && <ContactTab data={societe} onSave={handleSave} />}
          {tab === "payroll" && <PayrollTab data={societe} onSave={handleSave} />}
          {tab === "bank" && <BankTab data={societe} onSave={handleSave} />}
        </div>
      )}
    </div>
  )
}
