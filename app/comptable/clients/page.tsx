"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { ChevronRight, Search, Loader2, Plus, Users } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { EmptyState } from "@/components/ui/empty-state"
import { useProfile } from "@/hooks/use-profile"
import { t, getLocale } from "@/lib/i18n"

interface Client {
  id: string
  full_name: string
  email: string
  role: string
  phone: string | null
  is_active: boolean
  created_at: string
}

interface Dossier {
  id: string
  client_id: string
  societe_id: string
  societe: { id: string; nom: string } | null
}

interface Societe {
  id: string
  nom: string
  comptable_id: string | null
}

export default function ComptableClientsPage() {
  const locale = getLocale()
  const [search, setSearch] = useState("")
  const [clients, setClients] = useState<Client[]>([])
  const [dossiers, setDossiers] = useState<Dossier[]>([])
  const [societes, setSocietes] = useState<Societe[]>([])
  const [loading, setLoading] = useState(true)
  const { profile } = useProfile()
  const [success, setSuccess] = useState<string | null>(null)

  // Create dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formName, setFormName] = useState("")
  const [formEmail, setFormEmail] = useState("")
  const [formPhone, setFormPhone] = useState("")
  const [formPassword, setFormPassword] = useState("")
  const [formRole, setFormRole] = useState("client_admin")
  const [formClientType, setFormClientType] = useState<"individuel" | "societe">("individuel")
  // Individual fields
  const [formBrn, setFormBrn] = useState("")
  const [formTva, setFormTva] = useState("")
  const [formStatutTva, setFormStatutTva] = useState("false")
  const [formAdresse, setFormAdresse] = useState("")
  // Society fields
  const [formSocNom, setFormSocNom] = useState("")
  const [formSocBrn, setFormSocBrn] = useState("")
  const [formSocTva, setFormSocTva] = useState("")
  const [formSocStatutTva, setFormSocStatutTva] = useState("false")
  const [formSocAdresse, setFormSocAdresse] = useState("")

  const fetchData = useCallback(async () => {
    try {
      const [clientsRes, societesRes] = await Promise.all([
        fetch("/api/comptable/clients"),
        fetch("/api/comptable/societes"),
      ])
      const [clientsData, societesData] = await Promise.all([
        clientsRes.json(),
        societesRes.json(),
      ])
      if (clientsData.clients) setClients(clientsData.clients)
      if (clientsData.dossiers) setDossiers(clientsData.dossiers || [])
      if (societesData.societes) setSocietes(societesData.societes)
    } catch {
      console.error("Failed to fetch data")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(null), 5000); return () => clearTimeout(t) } }, [success])

  const isComptableAdmin = profile?.role === "comptable"

  const filteredClients = clients.filter(
    (c) => c.full_name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase())
  )

  const getClientSocietes = (clientId: string) =>
    dossiers.filter((d) => d.client_id === clientId && d.societe).map((d) => d.societe!)

  const getClientSocieteCount = (clientId: string) =>
    getClientSocietes(clientId).length

  const resetForm = () => {
    setFormName(""); setFormEmail(""); setFormPhone(""); setFormPassword(""); setFormRole("client_admin"); setFormClientType("individuel"); setFormBrn(""); setFormTva(""); setFormStatutTva("false"); setFormAdresse(""); setFormSocNom(""); setFormSocBrn(""); setFormSocTva(""); setFormSocStatutTva("false"); setFormSocAdresse(""); setError(null)
  }

  const handleCreate = async () => {
    setError(null)
    if (!formName || !formEmail || !formPassword) { setError(t('cab.clients.err_required_fields', locale)); return }
    if (formPassword.length < 6) { setError(t('cab.clients.err_password_short', locale)); return }
    if (formClientType === "societe" && !formSocNom) { setError(t('cab.clients.err_company_name_required', locale)); return }
    setCreating(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formEmail, password: formPassword, full_name: formName, role: formRole, phone: formPhone || null }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || t('cab.clients.err_generic', locale)); return }

      const newUserId = data.user?.id
      if (newUserId) {
        if (formClientType === "societe") {
          // Create the société with its details
          const socRes = await fetch("/api/admin/societes", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nom: formSocNom,
              brn: formSocBrn || null,
              numero_tva_mra: formSocTva || null,
              statut_tva: formSocStatutTva === "true",
              adresse: formSocAdresse || null,
            }),
          })
          const socData = await socRes.json()
          if (socRes.ok && socData.societe?.id) {
            await fetch("/api/admin/dossiers", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ client_id: newUserId, societe_id: socData.societe.id, comptable_id: profile?.id || null }),
            })
          }
          setSuccess(`${t('cab.clients.success_client', locale)} ${formName} ${t('cab.clients.success_with_company', locale)} ${formSocNom} !`)
        } else {
          // Individual: create personal société
          const socRes = await fetch("/api/admin/societes", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nom: `${formName} — ${t('cab.clients.personal_suffix', locale)}`,
              brn: formBrn || null,
              numero_tva_mra: formTva || null,
              statut_tva: formStatutTva === "true",
              adresse: formAdresse || null,
            }),
          })
          const socData = await socRes.json()
          if (socRes.ok && socData.societe?.id) {
            await fetch("/api/admin/dossiers", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ client_id: newUserId, societe_id: socData.societe.id, comptable_id: profile?.id || null }),
            })
          }
          setSuccess(`${t('cab.clients.success_individual_pre', locale)} ${formName} ${t('cab.clients.success_individual_post', locale)}`)
        }
      }
      resetForm(); setDialogOpen(false); fetchData()
    } catch { setError(t('cab.clients.err_connection', locale)) } finally { setCreating(false) }
  }

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>
            {isComptableAdmin ? t('cab.clients.title_admin', locale) : t('cab.clients.title_dedie', locale)}
          </h1>
          <p className="text-muted-foreground">
            {isComptableAdmin ? t('cab.clients.subtitle_admin', locale) : t('cab.clients.subtitle_dedie', locale)}
          </p>
        </div>
        {isComptableAdmin && (
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm() }}>
            <DialogTrigger asChild>
              <Button style={{ backgroundColor: "#0B0F2E" }}><Plus className="mr-2 h-4 w-4" />{t('cab.clients.add', locale)}</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader><DialogTitle>{t('cab.clients.dialog_title', locale)}</DialogTitle><DialogDescription>{t('cab.clients.dialog_desc', locale)}</DialogDescription></DialogHeader>
              <div className="space-y-4 py-4">
                {/* Client type selector */}
                <div className="space-y-2">
                  <Label>{t('cab.clients.fld_type', locale)}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className={`rounded-lg border-2 p-3 text-left transition-colors ${formClientType === "individuel" ? "border-amber-400 bg-amber-50" : "border-border hover:bg-muted/50"}`}
                      onClick={() => setFormClientType("individuel")}
                    >
                      <p className="text-sm font-medium">{t('cab.clients.type_individual', locale)}</p>
                      <p className="text-xs text-muted-foreground">{t('cab.clients.type_individual_desc', locale)}</p>
                    </button>
                    <button
                      type="button"
                      className={`rounded-lg border-2 p-3 text-left transition-colors ${formClientType === "societe" ? "border-amber-400 bg-amber-50" : "border-border hover:bg-muted/50"}`}
                      onClick={() => setFormClientType("societe")}
                    >
                      <p className="text-sm font-medium">{t('cab.clients.type_company', locale)}</p>
                      <p className="text-xs text-muted-foreground">{t('cab.clients.type_company_desc', locale)}</p>
                    </button>
                  </div>
                </div>

                {/* Common client fields */}
                <div className="space-y-2"><Label>{t('cab.clients.fld_full_name', locale)}</Label><Input placeholder="Ex: Jean-Marc Dupont" value={formName} onChange={(e) => setFormName(e.target.value)} /></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>{t('cab.clients.fld_email', locale)}</Label><Input type="email" placeholder="Ex: jm@tibok.mu" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} /></div>
                  <div className="space-y-2"><Label>{t('cab.clients.fld_phone', locale)}</Label><Input placeholder="Ex: +230 5678 9012" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} /></div>
                </div>
                <div className="space-y-2"><Label>{t('cab.clients.fld_password', locale)}</Label><Input type="password" placeholder={t('cab.clients.password_placeholder', locale)} value={formPassword} onChange={(e) => setFormPassword(e.target.value)} /></div>
                <div className="space-y-2"><Label>{t('cab.clients.fld_role', locale)}</Label>
                  <Select value={formRole} onValueChange={setFormRole}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="client_admin">{t('cab.clients.role_client_admin', locale)}</SelectItem><SelectItem value="client_user">{t('cab.clients.role_client_user', locale)}</SelectItem></SelectContent>
                  </Select>
                </div>

                {/* Individual-specific fields */}
                {formClientType === "individuel" && (
                  <div className="space-y-4 rounded-lg border p-4 bg-muted/20">
                    <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>{t('cab.clients.individual_details', locale)}</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2"><Label>{t('cab.clients.fld_brn', locale)}</Label><Input placeholder="Ex: C07012345" value={formBrn} onChange={(e) => setFormBrn(e.target.value)} /></div>
                      <div className="space-y-2"><Label>{t('cab.clients.fld_vat_no', locale)}</Label><Input placeholder="Ex: VAT-20260001" value={formTva} onChange={(e) => setFormTva(e.target.value)} /></div>
                    </div>
                    <div className="space-y-2"><Label>{t('cab.clients.fld_address', locale)}</Label><Input placeholder="Ex: Port Louis, Mauritius" value={formAdresse} onChange={(e) => setFormAdresse(e.target.value)} /></div>
                    <div className="space-y-2"><Label>{t('cab.clients.fld_vat_status', locale)}</Label>
                      <Select value={formStatutTva} onValueChange={setFormStatutTva}><SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="true">{t('cab.clients.vat_subject', locale)}</SelectItem><SelectItem value="false">{t('cab.clients.vat_not_subject', locale)}</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Society-specific fields */}
                {formClientType === "societe" && (
                  <div className="space-y-4 rounded-lg border p-4 bg-muted/20">
                    <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>{t('cab.clients.company_details', locale)}</p>
                    <div className="space-y-2"><Label>{t('cab.clients.fld_company_name', locale)}</Label><Input placeholder="Ex: TIBOK Ltd" value={formSocNom} onChange={(e) => setFormSocNom(e.target.value)} /></div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2"><Label>{t('cab.clients.fld_brn', locale)}</Label><Input placeholder="Ex: C07012345" value={formSocBrn} onChange={(e) => setFormSocBrn(e.target.value)} /></div>
                      <div className="space-y-2"><Label>{t('cab.clients.fld_vat_no', locale)}</Label><Input placeholder="Ex: VAT-20260001" value={formSocTva} onChange={(e) => setFormSocTva(e.target.value)} /></div>
                    </div>
                    <div className="space-y-2"><Label>{t('cab.clients.fld_address', locale)}</Label><Input placeholder="Ex: Ebène, Mauritius" value={formSocAdresse} onChange={(e) => setFormSocAdresse(e.target.value)} /></div>
                    <div className="space-y-2"><Label>{t('cab.clients.fld_vat_status', locale)}</Label>
                      <Select value={formSocStatutTva} onValueChange={setFormSocStatutTva}><SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="true">{t('cab.clients.vat_subject', locale)}</SelectItem><SelectItem value="false">{t('cab.clients.vat_not_subject', locale)}</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {error && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">{error}</div>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm() }}>{t('cab.clients.cancel', locale)}</Button>
                <Button style={{ backgroundColor: "#D4AF37" }} onClick={handleCreate} disabled={creating}>
                  {creating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('cab.clients.creating', locale)}</> : t('cab.clients.create_btn', locale)}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {success && <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">{success}</div>}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder={t('cab.clients.search', locale)} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : filteredClients.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Users}
              title={t('cab.clients.empty', locale)}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('cab.clients.col_client', locale)}</TableHead>
                  <TableHead>{t('cab.clients.col_companies', locale)}</TableHead>
                  <TableHead>{t('cab.clients.col_role', locale)}</TableHead>
                  <TableHead>{t('cab.clients.col_status', locale)}</TableHead>
                  <TableHead>{t('cab.clients.col_last_activity', locale)}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => {
                  const clientSocietes = getClientSocietes(client.id)
                  const societeCount = clientSocietes.length
                  return (
                    <TableRow key={client.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <div>
                          <p className="font-medium">{client.full_name}</p>
                          <p className="text-xs text-muted-foreground">{client.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {societeCount === 0 ? (
                          <Badge variant="outline" className="text-xs">{t('cab.clients.badge_individual', locale)}</Badge>
                        ) : societeCount === 1 ? (
                          <Badge variant="outline" style={{ borderColor: "#D4AF37", color: "#0B0F2E" }}>{clientSocietes[0].nom}</Badge>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" style={{ borderColor: "#D4AF37", color: "#0B0F2E" }}>{clientSocietes[0].nom}</Badge>
                            <Badge variant="outline" className="text-xs">+{societeCount - 1}</Badge>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={client.role === "client_admin" ? "bg-amber-50 text-amber-700" : "bg-gray-50 text-gray-600"}>
                          {client.role === "client_admin" ? t('cab.clients.badge_admin', locale) : t('cab.clients.badge_user', locale)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={client.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
                          {client.is_active ? t('cab.clients.badge_active', locale) : t('cab.clients.badge_inactive', locale)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(client.created_at).toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR')}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/comptable/clients/${client.id}`}>
                            {t('cab.clients.view', locale)} <ChevronRight className="ml-1 h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
    </ClientPageShell>
  )
}
