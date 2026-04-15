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

const FONT = "'Poppins', sans-serif"

interface Societe {
  id: string; nom: string; brn: string; ern: string
  numero_tva_mra: string; secteur_activite: string
  adresse: string; telephone: string; email: string; statut_tva: boolean
}

const SECTEURS = ["Technologies de l'information","Santé","Commerce","Finance","Immobilier","Tourisme","Transport","Agriculture","Éducation","Autre"]

const EMPTY = { nom:"", brn:"", ern:"", numero_tva_mra:"", secteur_activite:"", adresse:"", telephone:"", email:"", statut_tva: false }

export default function SocietesPage() {
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
      alert("Erreur réseau : " + (e instanceof Error ? e.message : String(e)))
      return
    }
    setSaving(false)
    if (d.error) { alert("Erreur : " + d.error); return }
    setOpen(false); setForm(EMPTY); setEditId(null); load()
  }

  const openEdit = (s: Societe) => {
    setForm({ nom:s.nom, brn:s.brn||"", ern:s.ern||"", numero_tva_mra:s.numero_tva_mra||"", secteur_activite:s.secteur_activite||"", adresse:s.adresse||"", telephone:s.telephone||"", email:s.email||"", statut_tva:s.statut_tva||false })
    setEditId(s.id); setOpen(true)
  }

  const F = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f=>({...f,[k]:e.target.value}))

  const count = societes.length

  return (
    <ClientPageShell
      breadcrumbs={[
        { label: "Espace client", href: "/client" },
        { label: "Mes Sociétés" },
      ]}
      kicker={count > 0 ? `${count} ${count > 1 ? "sociétés actives" : "société active"}` : "Aucune société"}
      title="Mes Sociétés"
      subtitle="Administrez vos entités juridiques — BRN, ERN, TVA, secteur, coordonnées. Les documents, la paie et la comptabilité sont rattachés à chaque société."
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
              <Plus className="w-4 h-4 mr-2"/>Nouvelle société
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle style={{ fontFamily: FONT, letterSpacing:"-0.01em" }}>{editId ? "Modifier" : "Créer"} une société</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <div><Label>Nom de la société <span className="text-red-500">*</span></Label><Input value={form.nom} onChange={F("nom")} placeholder="Digital Data Solutions Ltd"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>BRN</Label><Input value={form.brn} onChange={F("brn")} placeholder="C20173522"/></div>
                <div><Label>ERN (MRA)</Label><Input value={form.ern} onChange={F("ern")} placeholder="ERN-xxx"/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>N° TVA MRA</Label><Input value={form.numero_tva_mra} onChange={F("numero_tva_mra")} placeholder="27816949"/></div>
                <div>
                  <Label>TVA assujetti</Label>
                  <Select value={form.statut_tva?"oui":"non"} onValueChange={v=>setForm(f=>({...f,statut_tva:v==="oui"}))}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent><SelectItem value="oui">Oui</SelectItem><SelectItem value="non">Non</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Secteur d&apos;activité</Label>
                <Select value={form.secteur_activite} onValueChange={v=>setForm(f=>({...f,secteur_activite:v}))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner"/></SelectTrigger>
                  <SelectContent>{SECTEURS.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Adresse</Label><Input value={form.adresse} onChange={F("adresse")} placeholder="Port Louis, Maurice"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Téléphone</Label><Input value={form.telephone} onChange={F("telephone")} placeholder="+230 xxx xxxx"/></div>
                <div><Label>Email</Label><Input value={form.email} onChange={F("email")} placeholder="contact@société.mu"/></div>
              </div>
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
                {saving ? "Enregistrement..." : editId ? "Modifier" : "Créer la société"}
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
          title="Aucune société"
          description="Créez votre première société pour commencer à rattacher documents, paie et comptabilité."
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
              <Plus className="w-4 h-4 mr-2"/>Créer la première société
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
            <SocieteCard key={s.id} societe={s} index={idx} onEdit={() => openEdit(s)} />
          ))}
        </div>
      )}
    </ClientPageShell>
  )
}

/* ------------------------------------------------------------------ */

function SocieteCard({ societe: s, index, onEdit }: { societe: Societe; index: number; onEdit: () => void }) {
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
                {s.brn && <ClientChip accent="blue">BRN · {s.brn}</ClientChip>}
                {s.ern && <ClientChip accent="blue">ERN · {s.ern}</ClientChip>}
                {s.statut_tva && <ClientChip accent="green" icon={Check}>TVA assujetti</ClientChip>}
                {s.numero_tva_mra && <ClientChip accent="gold">N° TVA {s.numero_tva_mra}</ClientChip>}
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
            aria-label="Modifier"
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
          <QuickLink href={`/client/documents?societe_id=${s.id}`} icon={FileText} label="Documents" accent="#4191FF" />
          <QuickLink href={`/rh/employes?societe_id=${s.id}`} icon={Users} label="Employés" accent="#D4AF37" />
          <QuickLink href={`/client/mes-comptes?societe_id=${s.id}`} icon={BookOpen} label="Grand Livre" accent="#2ECC8A" />
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
