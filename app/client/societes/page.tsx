"use client"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Building2, Plus, FileText, Users, BookOpen, Edit, Loader2, Check, Sparkles } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { ClientPanel, ClientEmpty, ClientChip } from "@/components/client/ClientKit"
import { t, getLocale } from "@/lib/i18n"

const FONT = "'Poppins', sans-serif"

interface Societe {
  id: string; nom: string; brn: string; ern: string
  numero_tva_mra: string; secteur_activite: string
  adresse: string; telephone: string; email: string; statut_tva: boolean
}

const SECTEURS = ["Technologies de l'information","Santé","Commerce","Finance","Immobilier","Tourisme","Transport","Agriculture","Éducation","Autre"]

const EMPTY = { nom:"", brn:"", ern:"", numero_tva_mra:"", secteur_activite:"", adresse:"", telephone:"", email:"", statut_tva: false, regime: "domestic", devise_fonctionnelle: "MUR", fsc_license_number: "", fsc_license_type: "", tax_residency_country: "MU" }

const REGIME_OPTIONS = [
  { value: "domestic", label: "PME Maurice (domestic)", devise: "MUR", description: "IFRS for SMEs · IS 15% · MRA standard" },
  { value: "gbc1", label: "GBC1 — Global Business License", devise: "USD", description: "FSC · Full IFRS · PER 80% · substance CIGA · UBO ≥10%" },
  { value: "authorised_company", label: "Authorised Company", devise: "USD", description: "FSC · non résidente Maurice · UBO obligatoire" },
  { value: "holding", label: "Holding consolidante", devise: "USD", description: "IFRS 10 + Goodwill IFRS 3 · possible Pillar Two si MNE" },
  { value: "branch_foreign_pe", label: "Succursale étrangère", devise: "EUR", description: "Reporting siège + IAS 21 monnaie fonctionnelle" },
]

export default function SocietesPage() {
  const locale = getLocale()
  const [societes, setSocietes] = useState<Societe[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [editId, setEditId] = useState<string|null>(null)

  const load = async () => {
    setLoading(true)
    const d = await fetch("/api/client/societes").then(r=>r.json())
    setSocietes(d.societes || [])
    setLoading(false)
  }
  useEffect(()=>{ load() },[])

  const save = async () => {
    if (!form.nom) return
    setSaving(true)
    const method = editId ? "PATCH" : "POST"
    const url = editId ? `/api/client/societes?id=${editId}` : "/api/client/societes"
    let d: any
    try {
      const res = await fetch(url, { method, headers:{"Content-Type":"application/json"}, body: JSON.stringify(form) })
      d = await res.json()
    } catch (e) {
      setSaving(false)
      alert(t('core.soc.network_error', locale) + " : " + (e instanceof Error ? e.message : String(e)))
      return
    }
    setSaving(false)
    if (d.error) { alert(t('core.soc.error_prefix', locale) + " : " + d.error); return }
    setOpen(false); setForm(EMPTY); setEditId(null); load()
  }

  const openEdit = (s: Societe) => {
    setForm({ nom:s.nom, brn:s.brn||"", ern:s.ern||"", numero_tva_mra:s.numero_tva_mra||"", secteur_activite:s.secteur_activite||"", adresse:s.adresse||"", telephone:s.telephone||"", email:s.email||"", statut_tva:s.statut_tva||false, regime:(s as any).regime||"domestic", devise_fonctionnelle:(s as any).devise_fonctionnelle||"MUR", fsc_license_number:(s as any).fsc_license_number||"", fsc_license_type:(s as any).fsc_license_type||"", tax_residency_country:(s as any).tax_residency_country||"MU" })
    setEditId(s.id); setOpen(true)
  }

  const F = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f=>({...f,[k]:e.target.value}))

  const count = societes.length

  return (
    <ClientPageShell
      breadcrumbs={[
        { label: t('core.soc.breadcrumb_client', locale), href: "/client" },
        { label: t('core.soc.my_companies', locale) },
      ]}
      kicker={count > 0 ? `${count} ${count > 1 ? t('core.soc.active_many', locale) : t('core.soc.active_one', locale)}` : t('core.soc.none', locale)}
      title={t('core.soc.my_companies', locale)}
      subtitle={t('core.soc.subtitle', locale)}
      actions={
        <Dialog open={open} onOpenChange={o=>{ setOpen(o); if(!o){setForm(EMPTY);setEditId(null)} }}>
          <DialogTrigger asChild>
            <Button
              style={{
                background: "linear-gradient(135deg, #D4AF37 0%, #E4C547 100%)",
                color: "#0B0F2E",
                fontWeight: 700,
                borderRadius: "10px",
                border: "none",
                boxShadow: "0 10px 24px -8px rgba(212,175,55,0.55)",
                fontFamily: FONT,
              }}
            >
              <Plus className="w-4 h-4 mr-2"/>{t('core.soc.new_company', locale)}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle style={{ fontFamily: FONT, letterSpacing:"-0.01em" }}>{editId ? t('core.soc.edit', locale) : t('core.soc.create', locale)} {t('core.soc.a_company', locale)}</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <div><Label>{t('core.soc.company_name', locale)} <span className="text-red-500">*</span></Label><Input value={form.nom} onChange={F("nom")} placeholder="Digital Data Solutions Ltd"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t('core.soc.brn', locale)}</Label><Input value={form.brn} onChange={F("brn")} placeholder="C20173522"/></div>
                <div><Label>{t('core.soc.ern_mra', locale)}</Label><Input value={form.ern} onChange={F("ern")} placeholder="ERN-xxx"/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t('core.soc.vat_number_mra', locale)}</Label><Input value={form.numero_tva_mra} onChange={F("numero_tva_mra")} placeholder="27816949"/></div>
                <div>
                  <Label>{t('core.soc.vat_subject', locale)}</Label>
                  <Select value={form.statut_tva?"oui":"non"} onValueChange={v=>setForm(f=>({...f,statut_tva:v==="oui"}))}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent><SelectItem value="oui">{t('core.soc.yes', locale)}</SelectItem><SelectItem value="non">{t('core.soc.no', locale)}</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>{t('core.soc.sector', locale)}</Label>
                <Select value={form.secteur_activite} onValueChange={v=>setForm(f=>({...f,secteur_activite:v}))}>
                  <SelectTrigger><SelectValue placeholder={t('core.soc.select', locale)}/></SelectTrigger>
                  <SelectContent>{SECTEURS.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t('core.soc.address', locale)}</Label><Input value={form.adresse} onChange={F("adresse")} placeholder="Port Louis, Maurice"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t('core.soc.phone', locale)}</Label><Input value={form.telephone} onChange={F("telephone")} placeholder="+230 xxx xxxx"/></div>
                <div><Label>{t('core.soc.email', locale)}</Label><Input value={form.email} onChange={F("email")} placeholder="contact@société.mu"/></div>
              </div>

              {/* Phase K — Régime fiscal/réglementaire */}
              <div className="pt-3 mt-3 border-t border-slate-200">
                <Label className="text-sm font-semibold">Type de société (régime)</Label>
                <p className="text-xs text-slate-500 mb-2">Détermine les modules IFRS et obligations FSC activés.</p>
                <Select
                  value={form.regime}
                  onValueChange={v => setForm(f => ({
                    ...f,
                    regime: v,
                    // Pré-remplit la devise fonctionnelle suggérée selon régime
                    devise_fonctionnelle: REGIME_OPTIONS.find(o => o.value === v)?.devise || f.devise_fonctionnelle,
                  }))}
                >
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    {REGIME_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.regime && REGIME_OPTIONS.find(o => o.value === form.regime) && (
                  <p className="text-xs text-slate-500 mt-1">{REGIME_OPTIONS.find(o => o.value === form.regime)?.description}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Devise fonctionnelle (IAS 21)</Label>
                  <Select value={form.devise_fonctionnelle} onValueChange={v => setForm(f => ({...f, devise_fonctionnelle: v}))}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MUR">MUR — Roupies Mauriciennes</SelectItem>
                      <SelectItem value="USD">USD — Dollar US</SelectItem>
                      <SelectItem value="EUR">EUR — Euro</SelectItem>
                      <SelectItem value="GBP">GBP — Livre Sterling</SelectItem>
                      <SelectItem value="ZAR">ZAR — Rand Sud-Africain</SelectItem>
                      <SelectItem value="INR">INR — Roupie Indienne</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Pays résidence fiscale</Label>
                  <Input value={form.tax_residency_country} onChange={F("tax_residency_country")} placeholder="MU"/>
                </div>
              </div>

              {/* Champs FSC (visibles uniquement si GBC1 ou Authorised Company) */}
              {(form.regime === 'gbc1' || form.regime === 'authorised_company') && (
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                  <div className="col-span-2 text-xs font-semibold text-slate-700">Licence FSC</div>
                  <div>
                    <Label>N° licence FSC</Label>
                    <Input value={form.fsc_license_number} onChange={F("fsc_license_number")} placeholder="C12345678"/>
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Input value={form.fsc_license_type} onChange={F("fsc_license_type")} placeholder="GBL / Authorised Company"/>
                  </div>
                </div>
              )}

              <Button
                onClick={save}
                disabled={saving||!form.nom}
                className="w-full"
                style={{
                  background: "linear-gradient(135deg, #4191FF 0%, #D4AF37 100%)",
                  color: "#0B0F2E",
                  fontWeight: 700,
                  borderRadius: "10px",
                  border: "none",
                  fontFamily: FONT,
                }}
              >
                {saving ? t('core.soc.saving', locale) : editId ? t('core.soc.modify', locale) : t('core.soc.create_company', locale)}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      {loading ? (
        <div style={{ display:"flex", justifyContent:"center", padding:"120px 0" }}>
          <Loader2 className="animate-spin" size={28} style={{ color: "#D4AF37" }} />
        </div>
      ) : societes.length === 0 ? (
        <ClientEmpty
          icon={Building2}
          title={t('core.soc.none', locale)}
          description={t('core.soc.create_first', locale)}
          accent="gold"
          action={
            <Button
              onClick={()=>setOpen(true)}
              style={{
                background: "linear-gradient(135deg, #D4AF37 0%, #E4C547 100%)",
                color: "#0B0F2E",
                fontWeight: 700,
                borderRadius: "10px",
                border: "none",
                fontFamily: FONT,
                padding: "10px 22px",
              }}
            >
              <Plus className="w-4 h-4 mr-2"/>{t('core.soc.create_first_btn', locale)}
            </Button>
          }
        />
      ) : (
        <div
          style={{
            display: "grid",
            gap: "18px",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          }}
        >
          {societes.map((s, idx) => (
            <SocieteCard key={s.id} societe={s} index={idx} onEdit={() => openEdit(s)} locale={locale} />
          ))}
        </div>
      )}
    </ClientPageShell>
  )
}

/* ------------------------------------------------------------------ */

function SocieteCard({ societe: s, index, onEdit, locale }: { societe: Societe; index: number; onEdit: () => void; locale: 'fr' | 'en' }) {
  const accentColors = ["#4191FF", "#D4AF37", "#2ECC8A", "#E8A84C"]
  const accent = accentColors[index % accentColors.length]

  return (
    <ClientPanel padded={false}>
      {/* Accent stripe */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          height: "3px",
          background: `linear-gradient(90deg, ${accent} 0%, ${accent}33 100%)`,
          borderTopLeftRadius: "18px",
          borderTopRightRadius: "18px",
        }}
      />
      <div style={{ padding: "22px 22px 18px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", minWidth: 0 }}>
            <div
              aria-hidden="true"
              style={{
                flexShrink: 0,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: "44px", height: "44px", borderRadius: "12px",
                background: `linear-gradient(135deg, ${accent}26 0%, ${accent}0A 100%)`,
                border: `1px solid ${accent}44`,
                color: accent,
                boxShadow: `0 10px 24px -10px ${accent}55`,
              }}
            >
              <Building2 size={20} strokeWidth={1.8} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#0B0F2E",
                  letterSpacing: "-0.01em",
                  lineHeight: 1.3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {s.nom}
              </div>
              <div style={{ marginTop: "6px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {s.brn && <ClientChip accent="blue">{t('core.soc.brn', locale)} · {s.brn}</ClientChip>}
                {s.ern && <ClientChip accent="blue">ERN · {s.ern}</ClientChip>}
                {s.statut_tva && <ClientChip accent="green" icon={Check}>{t('core.soc.vat_subject_chip', locale)}</ClientChip>}
                {s.numero_tva_mra && <ClientChip accent="gold">{t('core.soc.vat_number_chip', locale)} {s.numero_tva_mra}</ClientChip>}
              </div>
              {s.secteur_activite && (
                <div
                  style={{
                    marginTop: "8px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12px",
                    color: "#475569",
                    fontWeight: 500,
                  }}
                >
                  <Sparkles size={11} style={{ color: accent }} />
                  {s.secteur_activite}
                </div>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            aria-label={t('core.soc.modify', locale)}
            style={{ flexShrink: 0, color: "#475569", borderRadius: "8px" }}
          >
            <Edit className="w-4 h-4"/>
          </Button>
        </div>

        {/* Contact row (if any) */}
        {(s.adresse || s.telephone || s.email) && (
          <div
            style={{
              marginTop: "14px",
              paddingTop: "12px",
              borderTop: "1px dashed #D8DFED",
              display: "grid",
              gap: "4px",
              fontSize: "12px",
              color: "#475569",
            }}
          >
            {s.adresse && <div>📍 {s.adresse}</div>}
            {s.telephone && <div>☎ {s.telephone}</div>}
            {s.email && <div>✉ {s.email}</div>}
          </div>
        )}

        {/* Quick actions grid */}
        <div
          style={{
            marginTop: "14px",
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "8px",
          }}
        >
          <QuickLink href={`/client/documents?societe_id=${s.id}`} icon={FileText} label={t('core.soc.documents', locale)} accent="#4191FF" />
          <QuickLink href={`/rh/employes?societe_id=${s.id}`} icon={Users} label={t('core.soc.employees', locale)} accent="#D4AF37" />
          <QuickLink href={`/client/grand-livre?societe_id=${s.id}`} icon={BookOpen} label={t('core.soc.general_ledger', locale)} accent="#2ECC8A" />
        </div>
      </div>
    </ClientPanel>
  )
}

function QuickLink({ href, icon: Icon, label, accent }: { href: string; icon: any; label: string; accent: string }) {
  return (
    <a
      href={href}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: "4px",
        padding: "10px 6px",
        borderRadius: "10px",
        backgroundColor: "#F7F9FF",
        border: "1px solid #E6EBF7",
        color: "#334155",
        fontSize: "11px", fontWeight: 600,
        textDecoration: "none",
        transition: "all 0.18s",
      }}
      onMouseEnter={(e)=>{
        e.currentTarget.style.backgroundColor = `${accent}11`
        e.currentTarget.style.borderColor = `${accent}44`
        e.currentTarget.style.color = accent
      }}
      onMouseLeave={(e)=>{
        e.currentTarget.style.backgroundColor = "#F7F9FF"
        e.currentTarget.style.borderColor = "#E6EBF7"
        e.currentTarget.style.color = "#334155"
      }}
    >
      <Icon size={16} strokeWidth={1.8} />
      <span>{label}</span>
    </a>
  )
}
