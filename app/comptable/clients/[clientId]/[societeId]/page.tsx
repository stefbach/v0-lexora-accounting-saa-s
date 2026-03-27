"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  ArrowLeft, TrendingUp, TrendingDown, ChevronRight, Upload,
  BarChart3, Landmark, Wallet, Calculator, FolderOpen, Loader2,
  FileText as FileIcon, CheckCircle, AlertTriangle as AlertIcon, Pencil,
} from "lucide-react"

function fmt(n: number) { return n.toLocaleString("fr-FR") + " MUR" }

const mockFournisseurs: any[] = []
const mockFacturesClients: any[] = []
const mockBanque: any[] = []
const mockSalaires: any[] = []
const mockCharges: any[] = []
const mockTVA: any[] = []
const mockDossiers: any[] = []

function stBadge(s: string) {
  if (["paye","solde","rapproche","declare","conforme"].includes(s)) return <Badge className="bg-green-100 text-green-700">{({paye:"Payé",solde:"Soldé",rapproche:"Rapproché",declare:"Déclaré",conforme:"Conforme"} as Record<string,string>)[s]}</Badge>
  if (["en_attente","a_declarer","a_verifier","a_payer","partiel"].includes(s)) return <Badge className="bg-orange-100 text-orange-700">{({en_attente:"En attente",a_declarer:"À déclarer",a_verifier:"À vérifier",a_payer:"À payer",partiel:"Partiel"} as Record<string,string>)[s]}</Badge>
  if (["en_retard","impaye","non_identifie","ecart"].includes(s)) return <Badge className="bg-red-100 text-red-700">{({en_retard:"En retard",impaye:"Impayé",non_identifie:"Non identifié",ecart:"Écart détecté"} as Record<string,string>)[s]}</Badge>
  return <Badge variant="outline">{s}</Badge>
}

export default function SocieteContextPage() {
  const params = useParams()
  const clientId = params.clientId as string
  const societeId = params.societeId as string
  const [clientName, setClientName] = useState("")
  const [societeName, setSocieteName] = useState("")

  useEffect(() => {
    async function fetchNames() {
      try {
        const [usersRes, socRes] = await Promise.all([fetch("/api/admin/users"), fetch("/api/admin/societes")])
        const [usersData, socData] = await Promise.all([usersRes.json(), socRes.json()])
        const client = usersData.users?.find((u: any) => u.id === clientId)
        if (client) setClientName(client.full_name)
        const soc = socData.societes?.find((s: any) => s.id === societeId)
        if (soc) setSocieteName(soc.nom)
      } catch {}
    }
    fetchNames()
  }, [clientId, societeId])

  // Documents state
  const [uploading, setUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [selectedDossier, setSelectedDossier] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; status: string; type?: string; date: string }>>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadError(null)
    setUploadSuccess(null)

    for (const file of Array.from(files)) {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("societe_id", societeId)

      try {
        const res = await fetch("/api/documents/upload", { method: "POST", body: formData })
        const data = await res.json()
        if (res.ok) {
          setUploadedFiles(prev => [{ name: file.name, status: "En cours de traitement", date: new Date().toLocaleDateString("fr-FR"), type: "Détection..." }, ...prev])
          setUploadSuccess(`${file.name} uploadé avec succès. Analyse en cours...`)
        } else {
          setUploadError(data.error || "Erreur lors de l'upload")
        }
      } catch {
        setUploadError("Erreur de connexion")
      }
    }
    setUploading(false)
    setTimeout(() => { setUploadSuccess(null); setUploadError(null) }, 5000)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(false)
    handleUpload(e.dataTransfer.files)
  }, [societeId])

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragActive(true) }, [])
  const handleDragLeave = useCallback(() => setDragActive(false), [])

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/comptable/clients" className="text-muted-foreground hover:text-foreground">Portefeuille</Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <Link href={`/comptable/clients/${clientId}`} className="text-muted-foreground hover:text-foreground">{clientName}</Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium" style={{ color: "#1E2A4A" }}>{societeName}</span>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/comptable/clients/${clientId}`}><ArrowLeft className="mr-1 h-4 w-4" />Retour au client</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "CA du mois", value: 0, icon: TrendingUp, green: true },
          { label: "Charges", value: 0, icon: TrendingDown },
          { label: "Résultat", value: 0, icon: BarChart3, green: true },
          { label: "TVA nette", value: 0, icon: Calculator },
          { label: "Trésorerie", value: 0, icon: Landmark, green: true },
          { label: "Masse salariale", value: 0, icon: Wallet },
        ].map((k) => (
          <Card key={k.label}><CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
            <p className={`text-lg font-bold ${k.green ? "text-green-700" : ""}`} style={!k.green ? { color: "#1E2A4A" } : undefined}>{k.value === 0 ? "—" : fmt(k.value)}</p>
          </CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Vue d&apos;ensemble</TabsTrigger>
          <TabsTrigger value="fournisseurs">Fournisseurs</TabsTrigger>
          <TabsTrigger value="clients">Factures Clients</TabsTrigger>
          <TabsTrigger value="banque">Banque</TabsTrigger>
          <TabsTrigger value="salaires">Salaires</TabsTrigger>
          <TabsTrigger value="charges">Charges Sociales</TabsTrigger>
          <TabsTrigger value="tva">TVA MRA</TabsTrigger>
          <TabsTrigger value="grand-livre">Grand Livre</TabsTrigger>
          <TabsTrigger value="etats-financiers">États Financiers</TabsTrigger>
          <TabsTrigger value="immobilisations">Immobilisations</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="pnl">P&L</TabsTrigger>
          <TabsTrigger value="alertes">Alertes</TabsTrigger>
        </TabsList>

        {/* Quick links to full pages */}
        <div className="flex flex-wrap gap-2 -mt-2">
          <Link href={`/comptable/clients/${clientId}/${societeId}/bilan`}>
            <Button variant="outline" size="sm" className="text-xs gap-1"><FileIcon className="h-3 w-3" />Bilan Officiel</Button>
          </Link>
          <Link href={`/comptable/clients/${clientId}/${societeId}/tableau-de-bord`}>
            <Button variant="outline" size="sm" className="text-xs gap-1"><BarChart3 className="h-3 w-3" />Tableau de Bord</Button>
          </Link>
          <Link href={`/comptable/clients/${clientId}/${societeId}/previsionnel`}>
            <Button variant="outline" size="sm" className="text-xs gap-1"><TrendingUp className="h-3 w-3" />Prévisionnel</Button>
          </Link>
          <Link href={`/comptable/clients/${clientId}/${societeId}/simulations`}>
            <Button variant="outline" size="sm" className="text-xs gap-1"><Calculator className="h-3 w-3" />Simulations</Button>
          </Link>
        </div>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card><CardHeader className="pb-2"><CardTitle className="text-base">Résumé du mois</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Factures fournisseurs</span><span className="font-medium">6 — {fmt(228135)}</span></div>
                <div className="flex justify-between"><span>Factures clients</span><span className="font-medium">5 — {fmt(1144250)}</span></div>
                <div className="flex justify-between"><span>Transactions bancaires</span><span className="font-medium">8 opérations</span></div>
                <div className="flex justify-between"><span>Fiches de paie</span><span className="font-medium">5 employés</span></div>
              </CardContent>
            </Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-base">Points d&apos;attention</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-500" />TVA Mars à déclarer avant le 20/04</div>
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-orange-500" />1 transaction non identifiée</div>
                <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-orange-500" />2 factures impayées ({fmt(396750)})</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="fournisseurs"><Card><CardContent className="p-0">
          <Table><TableHeader><TableRow>
            <TableHead>Fournisseur</TableHead><TableHead>N°</TableHead><TableHead>Date</TableHead>
            <TableHead className="text-right">HT</TableHead><TableHead className="text-right">TVA</TableHead><TableHead className="text-right">TTC</TableHead>
            <TableHead>Échéance</TableHead><TableHead>Statut</TableHead><TableHead>Compte</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>{mockFournisseurs.map((f,i)=>(<TableRow key={i}><TableCell className="font-medium">{f.fournisseur}</TableCell><TableCell>{f.numero}</TableCell><TableCell>{f.date}</TableCell><TableCell className="text-right">{fmt(f.ht)}</TableCell><TableCell className="text-right">{fmt(f.tva)}</TableCell><TableCell className="text-right font-semibold">{fmt(f.ttc)}</TableCell><TableCell>{f.echeance}</TableCell><TableCell>{stBadge(f.statut)}</TableCell><TableCell><Badge variant="outline">{f.compte}</Badge></TableCell><TableCell><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></TableCell></TableRow>))}</TableBody>
          </Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="clients"><Card><CardContent className="p-0">
          <Table><TableHeader><TableRow>
            <TableHead>Client</TableHead><TableHead>N°</TableHead><TableHead>Date</TableHead>
            <TableHead className="text-right">HT</TableHead><TableHead className="text-right">TVA</TableHead><TableHead className="text-right">TTC</TableHead>
            <TableHead>Échéance</TableHead><TableHead>Statut</TableHead><TableHead className="text-right">Retard</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>{mockFacturesClients.map((f,i)=>(<TableRow key={i}><TableCell className="font-medium">{f.client}</TableCell><TableCell>{f.numero}</TableCell><TableCell>{f.date}</TableCell><TableCell className="text-right">{fmt(f.ht)}</TableCell><TableCell className="text-right">{fmt(f.tva)}</TableCell><TableCell className="text-right font-semibold">{fmt(f.ttc)}</TableCell><TableCell>{f.echeance}</TableCell><TableCell>{stBadge(f.statut)}</TableCell><TableCell className={`text-right ${f.jours>30?"text-red-600 font-bold":f.jours>0?"text-orange-600":""}`}>{f.jours>0?f.jours+"j":"—"}</TableCell><TableCell><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></TableCell></TableRow>))}</TableBody>
          </Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="banque" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Solde MCB</p><p className="text-xl font-bold text-green-700">{fmt(2340000)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Non rapprochées</p><p className="text-xl font-bold text-orange-600">2</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Dernière MAJ</p><p className="text-xl font-bold">25/03/2026</p></CardContent></Card>
          </div>
          <Card><CardContent className="p-0">
            <Table><TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Libellé</TableHead><TableHead className="text-right">Débit</TableHead><TableHead className="text-right">Crédit</TableHead>
              <TableHead>Tiers</TableHead><TableHead>Compte</TableHead><TableHead>Statut</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>{mockBanque.map((b,i)=>(<TableRow key={i} className={b.statut==="non_identifie"?"bg-red-50":b.statut==="a_verifier"?"bg-orange-50":""}><TableCell>{b.date}</TableCell><TableCell className="font-medium">{b.libelle}</TableCell><TableCell className="text-right text-red-600">{b.debit>0?fmt(b.debit):""}</TableCell><TableCell className="text-right text-green-600">{b.credit>0?fmt(b.credit):""}</TableCell><TableCell>{b.tiers}</TableCell><TableCell><Badge variant="outline">{b.compte}</Badge></TableCell><TableCell>{stBadge(b.statut)}</TableCell><TableCell><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></TableCell></TableRow>))}</TableBody>
            </Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="salaires"><Card><CardContent className="p-0">
          <Table><TableHeader><TableRow>
            <TableHead>Employé</TableHead><TableHead className="text-right">Brut</TableHead><TableHead className="text-right">CSG 3%</TableHead><TableHead className="text-right">NSF 1.5%</TableHead><TableHead className="text-right">PAYE</TableHead>
            <TableHead className="text-right">Net</TableHead><TableHead className="text-right">Coût empl.</TableHead><TableHead>Statut</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>{mockSalaires.map((s,i)=>(<TableRow key={i}><TableCell className="font-medium">{s.employe}</TableCell><TableCell className="text-right">{fmt(s.brut)}</TableCell><TableCell className="text-right">{fmt(s.csg)}</TableCell><TableCell className="text-right">{fmt(s.nsf)}</TableCell><TableCell className="text-right">{fmt(s.paye)}</TableCell><TableCell className="text-right font-semibold">{fmt(s.net)}</TableCell><TableCell className="text-right">{fmt(s.cout)}</TableCell><TableCell>{stBadge(s.statut)}</TableCell><TableCell><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></TableCell></TableRow>))}</TableBody>
          </Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="charges" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-5">
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">CSG (3%+6%)</p><p className="text-xl font-bold">{fmt(37800)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">NSF (1.5%+2.5%)</p><p className="text-xl font-bold">{fmt(16800)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Training Levy</p><p className="text-xl font-bold">{fmt(4200)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">PAYE</p><p className="text-xl font-bold">{fmt(22250)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total mensuel</p><p className="text-xl font-bold" style={{ color: "#1E2A4A" }}>{fmt(81050)}</p></CardContent></Card>
          </div>
          <Card><CardContent className="p-0">
            <Table><TableHeader><TableRow>
              <TableHead>Période</TableHead><TableHead className="text-right">CSG Empl.</TableHead><TableHead className="text-right">CSG Patr.</TableHead>
              <TableHead className="text-right">NSF Empl.</TableHead><TableHead className="text-right">NSF Patr.</TableHead><TableHead className="text-right">Training</TableHead><TableHead className="text-right">PAYE</TableHead>
              <TableHead className="text-right">Total</TableHead><TableHead>Statut</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>{mockCharges.map((c,i)=>(<TableRow key={i}><TableCell className="font-medium">{c.periode}</TableCell><TableCell className="text-right">{fmt(c.csg_e)}</TableCell><TableCell className="text-right">{fmt(c.csg_p)}</TableCell><TableCell className="text-right">{fmt(c.nsf_e)}</TableCell><TableCell className="text-right">{fmt(c.nsf_p)}</TableCell><TableCell className="text-right">{fmt(c.training)}</TableCell><TableCell className="text-right">{fmt(c.paye)}</TableCell><TableCell className="text-right font-semibold">{fmt(c.total)}</TableCell><TableCell>{stBadge(c.statut)}</TableCell><TableCell><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></TableCell></TableRow>))}</TableBody>
            </Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="tva" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">TVA Collectée</p><p className="text-xl font-bold">{fmt(149250)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">TVA Déductible</p><p className="text-xl font-bold">{fmt(19710)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">TVA Nette</p><p className="text-xl font-bold text-red-600">{fmt(129540)}</p></CardContent></Card>
          </div>
          <Card><CardContent className="p-0">
            <Table><TableHeader><TableRow>
              <TableHead>Mois</TableHead><TableHead className="text-right">Collectée</TableHead><TableHead className="text-right">Déductible</TableHead>
              <TableHead className="text-right">Nette</TableHead><TableHead>Deadline</TableHead><TableHead>Statut</TableHead><TableHead>Réf</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>{mockTVA.map((t,i)=>(<TableRow key={i}><TableCell className="font-medium">{t.mois}</TableCell><TableCell className="text-right">{fmt(t.collectee)}</TableCell><TableCell className="text-right">{fmt(t.deductible)}</TableCell><TableCell className="text-right font-semibold">{fmt(t.nette)}</TableCell><TableCell>{t.deadline}</TableCell><TableCell>{stBadge(t.statut)}</TableCell><TableCell className="text-xs text-muted-foreground">{t.ref||"—"}</TableCell><TableCell><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></TableCell></TableRow>))}</TableBody>
            </Table></CardContent></Card>
        </TabsContent>

        {/* === GRAND LIVRE === */}
        <TabsContent value="grand-livre" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold" style={{ color: "#1E2A4A" }}>Grand Livre — {societeName}</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">Exporter Excel</Button>
              <Button variant="outline" size="sm">Imprimer</Button>
            </div>
          </div>
          {[
            { compte: "1000", nom: "Cash & Bank", entries: [
              { date: "2026-03-25", ref: "BQ-001", desc: "Encaissement Mauritius Telecom", debit: 207000, credit: 0, solde: 2340000 },
              { date: "2026-03-24", ref: "BQ-002", desc: "Paiement MCB Card Services", debit: 0, credit: 14375, solde: 2133000 },
              { date: "2026-03-15", ref: "SAL-001", desc: "Virement salaires mars", debit: 0, credit: 420000, solde: 2147375 },
            ]},
            { compte: "4000", nom: "Consultation Revenue (B2C)", entries: [
              { date: "2026-03-20", ref: "VTE-001", desc: "Factures consultations mars", debit: 0, credit: 650000, solde: 650000 },
              { date: "2026-03-10", ref: "VTE-002", desc: "Abonnements corporate mars", debit: 0, credit: 345000, solde: 995000 },
            ]},
            { compte: "6100", nom: "Salaries & Benefits", entries: [
              { date: "2026-03-15", ref: "SAL-001", desc: "Salaires bruts mars 2026", debit: 420000, credit: 0, solde: 420000 },
            ]},
            { compte: "6200", nom: "Technology & Hosting", entries: [
              { date: "2026-03-22", ref: "ACH-001", desc: "OpenAI API mars", debit: 45000, credit: 0, solde: 45000 },
              { date: "2026-03-10", ref: "ACH-002", desc: "Frais bancaires MCB", debit: 2500, credit: 0, solde: 47500 },
            ]},
          ].map((account) => (
            <Card key={account.compte}>
              <CardHeader className="py-3" style={{ backgroundColor: "#1E2A4A08" }}>
                <CardTitle className="text-sm">ACCOUNT: {account.compte} — {account.nom}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Réf</TableHead><TableHead>Description</TableHead>
                    <TableHead className="text-right">Débit (MUR)</TableHead><TableHead className="text-right">Crédit (MUR)</TableHead><TableHead className="text-right">Solde (MUR)</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {account.entries.map((e, i) => (
                      <TableRow key={i}>
                        <TableCell>{e.date}</TableCell><TableCell className="text-xs">{e.ref}</TableCell><TableCell>{e.desc}</TableCell>
                        <TableCell className="text-right">{e.debit > 0 ? fmt(e.debit) : ""}</TableCell>
                        <TableCell className="text-right">{e.credit > 0 ? fmt(e.credit) : ""}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt(e.solde)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* === ÉTATS FINANCIERS IFRS === */}
        <TabsContent value="etats-financiers" className="space-y-4">
          <div className="text-center mb-4">
            <h3 className="font-bold text-lg" style={{ color: "#1E2A4A" }}>DIGITAL DATA SOLUTIONS LTD (TIBOK)</h3>
            <p className="text-xs text-muted-foreground">Prepared in accordance with IFRS for SMEs — Companies Act 2001 Mauritius</p>
          </div>
          <Tabs defaultValue="bilan">
            <TabsList><TabsTrigger value="bilan">Balance Sheet</TabsTrigger><TabsTrigger value="pl">Profit & Loss</TabsTrigger></TabsList>
            <TabsContent value="bilan">
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Poste</TableHead><TableHead className="text-right">2025-2026 (MUR)</TableHead><TableHead className="text-right">2024-2025 (MUR)</TableHead></TableRow></TableHeader>
                  <TableBody>
                    <TableRow className="bg-muted/50 font-bold"><TableCell colSpan={3}>NON-CURRENT ASSETS</TableCell></TableRow>
                    <TableRow><TableCell className="pl-6">Property, Plant & Equipment</TableCell><TableCell className="text-right">{fmt(850000)}</TableCell><TableCell className="text-right">{fmt(720000)}</TableCell></TableRow>
                    <TableRow><TableCell className="pl-6">Intangible Assets</TableCell><TableCell className="text-right">{fmt(350000)}</TableCell><TableCell className="text-right">{fmt(200000)}</TableCell></TableRow>
                    <TableRow className="font-semibold border-t"><TableCell>Total Non-Current Assets</TableCell><TableCell className="text-right">{fmt(1200000)}</TableCell><TableCell className="text-right">{fmt(920000)}</TableCell></TableRow>
                    <TableRow className="bg-muted/50 font-bold"><TableCell colSpan={3}>CURRENT ASSETS</TableCell></TableRow>
                    <TableRow><TableCell className="pl-6">Trade Receivables</TableCell><TableCell className="text-right">{fmt(396750)}</TableCell><TableCell className="text-right">{fmt(280000)}</TableCell></TableRow>
                    <TableRow><TableCell className="pl-6">Cash & Bank</TableCell><TableCell className="text-right">{fmt(2340000)}</TableCell><TableCell className="text-right">{fmt(1800000)}</TableCell></TableRow>
                    <TableRow className="font-semibold border-t"><TableCell>Total Current Assets</TableCell><TableCell className="text-right">{fmt(2736750)}</TableCell><TableCell className="text-right">{fmt(2080000)}</TableCell></TableRow>
                    <TableRow className="font-bold border-t-2 text-lg"><TableCell>TOTAL ASSETS</TableCell><TableCell className="text-right">{fmt(3936750)}</TableCell><TableCell className="text-right">{fmt(3000000)}</TableCell></TableRow>
                    <TableRow className="bg-muted/50 font-bold"><TableCell colSpan={3}>EQUITY</TableCell></TableRow>
                    <TableRow><TableCell className="pl-6">Share Capital</TableCell><TableCell className="text-right">{fmt(100000)}</TableCell><TableCell className="text-right">{fmt(100000)}</TableCell></TableRow>
                    <TableRow><TableCell className="pl-6">Retained Earnings</TableCell><TableCell className="text-right">{fmt(2800000)}</TableCell><TableCell className="text-right">{fmt(2100000)}</TableCell></TableRow>
                    <TableRow className="font-semibold border-t"><TableCell>Total Equity</TableCell><TableCell className="text-right">{fmt(2900000)}</TableCell><TableCell className="text-right">{fmt(2200000)}</TableCell></TableRow>
                    <TableRow className="bg-muted/50 font-bold"><TableCell colSpan={3}>CURRENT LIABILITIES</TableCell></TableRow>
                    <TableRow><TableCell className="pl-6">Trade Payables</TableCell><TableCell className="text-right">{fmt(228135)}</TableCell><TableCell className="text-right">{fmt(180000)}</TableCell></TableRow>
                    <TableRow><TableCell className="pl-6">VAT Payable</TableCell><TableCell className="text-right">{fmt(129540)}</TableCell><TableCell className="text-right">{fmt(95000)}</TableCell></TableRow>
                    <TableRow><TableCell className="pl-6">CSG/NSF/PAYE Payable</TableCell><TableCell className="text-right">{fmt(81050)}</TableCell><TableCell className="text-right">{fmt(65000)}</TableCell></TableRow>
                    <TableRow className="font-semibold border-t"><TableCell>Total Current Liabilities</TableCell><TableCell className="text-right">{fmt(1036750)}</TableCell><TableCell className="text-right">{fmt(800000)}</TableCell></TableRow>
                    <TableRow className="font-bold border-t-2 text-lg"><TableCell>TOTAL EQUITY & LIABILITIES</TableCell><TableCell className="text-right">{fmt(3936750)}</TableCell><TableCell className="text-right">{fmt(3000000)}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </CardContent></Card>
            </TabsContent>
            <TabsContent value="pl">
              <Card><CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Poste</TableHead><TableHead className="text-right">2025-2026 (MUR)</TableHead><TableHead className="text-right">2024-2025 (MUR)</TableHead></TableRow></TableHeader>
                  <TableBody>
                    <TableRow className="bg-muted/50 font-bold"><TableCell colSpan={3}>REVENUE</TableCell></TableRow>
                    <TableRow><TableCell className="pl-6">Consultation Revenue (B2C)</TableCell><TableCell className="text-right text-green-700">{fmt(6500000)}</TableCell><TableCell className="text-right">{fmt(4800000)}</TableCell></TableRow>
                    <TableRow><TableCell className="pl-6">Corporate/B2B Revenue</TableCell><TableCell className="text-right text-green-700">{fmt(4200000)}</TableCell><TableCell className="text-right">{fmt(3200000)}</TableCell></TableRow>
                    <TableRow><TableCell className="pl-6">Pharmacy Revenue</TableCell><TableCell className="text-right text-green-700">{fmt(1240000)}</TableCell><TableCell className="text-right">{fmt(950000)}</TableCell></TableRow>
                    <TableRow className="font-bold border-t"><TableCell>TOTAL REVENUE</TableCell><TableCell className="text-right text-green-700">{fmt(11940000)}</TableCell><TableCell className="text-right">{fmt(8950000)}</TableCell></TableRow>
                    <TableRow className="bg-muted/50 font-bold"><TableCell colSpan={3}>OPERATING EXPENSES</TableCell></TableRow>
                    <TableRow><TableCell className="pl-6">Salaries & Benefits</TableCell><TableCell className="text-right text-red-600">{fmt(5040000)}</TableCell><TableCell className="text-right">{fmt(4200000)}</TableCell></TableRow>
                    <TableRow><TableCell className="pl-6">Technology & Hosting</TableCell><TableCell className="text-right text-red-600">{fmt(540000)}</TableCell><TableCell className="text-right">{fmt(420000)}</TableCell></TableRow>
                    <TableRow><TableCell className="pl-6">Marketing</TableCell><TableCell className="text-right text-red-600">{fmt(384000)}</TableCell><TableCell className="text-right">{fmt(300000)}</TableCell></TableRow>
                    <TableRow><TableCell className="pl-6">Professional Fees</TableCell><TableCell className="text-right text-red-600">{fmt(420000)}</TableCell><TableCell className="text-right">{fmt(360000)}</TableCell></TableRow>
                    <TableRow><TableCell className="pl-6">Rent & Utilities</TableCell><TableCell className="text-right text-red-600">{fmt(300000)}</TableCell><TableCell className="text-right">{fmt(280000)}</TableCell></TableRow>
                    <TableRow><TableCell className="pl-6">Depreciation</TableCell><TableCell className="text-right text-red-600">{fmt(180000)}</TableCell><TableCell className="text-right">{fmt(150000)}</TableCell></TableRow>
                    <TableRow><TableCell className="pl-6">Other Expenses</TableCell><TableCell className="text-right text-red-600">{fmt(636000)}</TableCell><TableCell className="text-right">{fmt(490000)}</TableCell></TableRow>
                    <TableRow className="font-bold border-t"><TableCell>TOTAL EXPENSES</TableCell><TableCell className="text-right text-red-600">{fmt(7500000)}</TableCell><TableCell className="text-right">{fmt(6200000)}</TableCell></TableRow>
                    <TableRow className="font-bold border-t-2 text-lg"><TableCell>PROFIT BEFORE TAX</TableCell><TableCell className="text-right text-green-700">{fmt(4440000)}</TableCell><TableCell className="text-right">{fmt(2750000)}</TableCell></TableRow>
                    <TableRow><TableCell className="pl-6">Income Tax (15%)</TableCell><TableCell className="text-right text-red-600">{fmt(666000)}</TableCell><TableCell className="text-right">{fmt(412500)}</TableCell></TableRow>
                    <TableRow className="font-bold border-t-2 text-lg bg-green-50"><TableCell>PROFIT AFTER TAX</TableCell><TableCell className="text-right text-green-700">{fmt(3774000)}</TableCell><TableCell className="text-right">{fmt(2337500)}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* === IMMOBILISATIONS === */}
        <TabsContent value="immobilisations" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold" style={{ color: "#1E2A4A" }}>Registre des Immobilisations — {societeName}</h3>
            <Button size="sm" style={{ backgroundColor: "#C9A84C" }}>+ Ajouter un actif</Button>
          </div>
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Description</TableHead><TableHead>Catégorie</TableHead><TableHead>Date achat</TableHead>
                <TableHead className="text-right">Coût (MUR)</TableHead><TableHead>Durée</TableHead>
                <TableHead className="text-right">Amort. cumulé</TableHead><TableHead className="text-right">Dotation année</TableHead>
                <TableHead className="text-right">Valeur nette</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {[
                  { desc: "Serveurs AWS dédiés", cat: "IT & Technology", date: "2024-01-15", cout: 450000, duree: "3 ans", amort: 150000, dot: 150000, vn: 150000 },
                  { desc: "MacBook Pro M3 (x5)", cat: "IT & Technology", date: "2024-06-01", cout: 625000, duree: "3 ans", amort: 138890, dot: 208333, vn: 277777 },
                  { desc: "Mobilier bureau", cat: "Furniture", date: "2023-03-01", cout: 180000, duree: "10 ans", amort: 54000, dot: 18000, vn: 108000 },
                  { desc: "Équipement médical", cat: "Equipment", date: "2024-09-01", cout: 320000, duree: "5 ans", amort: 32000, dot: 64000, vn: 224000 },
                  { desc: "Logiciel EHR licence", cat: "IT & Technology", date: "2025-01-01", cout: 200000, duree: "5 ans", amort: 0, dot: 40000, vn: 160000 },
                ].map((a, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{a.desc}</TableCell><TableCell><Badge variant="outline">{a.cat}</Badge></TableCell><TableCell>{a.date}</TableCell>
                    <TableCell className="text-right">{fmt(a.cout)}</TableCell><TableCell>{a.duree}</TableCell>
                    <TableCell className="text-right">{fmt(a.amort)}</TableCell><TableCell className="text-right">{fmt(a.dot)}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(a.vn)}</TableCell>
                    <TableCell><Button variant="ghost" size="sm"><Pencil className="h-3.5 w-3.5" /></Button></TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t-2">
                  <TableCell colSpan={3}>TOTAL</TableCell>
                  <TableCell className="text-right">{fmt(1775000)}</TableCell><TableCell></TableCell>
                  <TableCell className="text-right">{fmt(374890)}</TableCell><TableCell className="text-right">{fmt(480333)}</TableCell>
                  <TableCell className="text-right">{fmt(919777)}</TableCell><TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          {/* Upload Zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragActive ? "border-amber-400 bg-amber-50" : "border-muted-foreground/25 hover:border-muted-foreground/50"}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <input ref={fileInputRef} type="file" className="hidden" multiple accept=".pdf,.jpeg,.jpg,.png,.xlsx" onChange={(e) => handleUpload(e.target.files)} />
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#C9A84C" }} />
                <p className="text-sm text-muted-foreground">Upload en cours...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">Glissez-déposez vos fichiers ici</p>
                <p className="text-xs text-muted-foreground">PDF, JPEG, PNG, XLSX — max 10 MB</p>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => fileInputRef.current?.click()}>Parcourir</Button>
              </div>
            )}
          </div>

          {uploadSuccess && <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 flex items-center gap-2"><CheckCircle className="h-4 w-4" />{uploadSuccess}</div>}
          {uploadError && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 flex items-center gap-2"><AlertIcon className="h-4 w-4" />{uploadError}</div>}

          {/* Uploaded files */}
          {uploadedFiles.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Documents uploadés</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Fichier</TableHead><TableHead>Date</TableHead><TableHead>Type détecté</TableHead><TableHead>Statut</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {uploadedFiles.map((f, i) => (
                      <TableRow key={i}>
                        <TableCell className="flex items-center gap-2"><FileIcon className="h-4 w-4 text-muted-foreground" />{f.name}</TableCell>
                        <TableCell>{f.date}</TableCell>
                        <TableCell><Badge variant="outline">{f.type}</Badge></TableCell>
                        <TableCell><Badge className="bg-blue-100 text-blue-700">{f.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Dossiers */}
          <div>
            <h3 className="font-semibold mb-3" style={{ color: "#1E2A4A" }}>Dossiers de la société</h3>
            <div className="grid gap-2">
              {mockDossiers.map((d,i)=>(
                <Card key={i} className={`cursor-pointer hover:bg-muted/50 ${d.count===0?"opacity-50":""}`} onClick={() => setSelectedDossier(selectedDossier === d.nom ? null : d.nom)}>
                  <CardContent className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <FolderOpen className="h-5 w-5" style={{ color: "#C9A84C" }} />
                      <div><p className="text-sm font-medium">{d.nom}</p><p className="text-xs text-muted-foreground">{d.count} doc{d.count!==1?"s":""}{d.count===0?" — vide":""}</p></div>
                    </div>
                    <div className="flex items-center gap-2">
                      {d.anomalies>0&&<Badge className="bg-red-100 text-red-700">{d.anomalies} anomalie{d.anomalies>1?"s":""}</Badge>}
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${selectedDossier===d.nom?"rotate-90":""}`} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="pnl" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            {[{l:"CA",v:995000,c:"text-green-700"},{l:"Charges",v:208400},{l:"EBITDA",v:786600,c:"text-green-700"},{l:"Marge",v:"79.1%",c:"text-green-700"},{l:"Trésorerie",v:2340000},{l:"DSO",v:"18j"}].map((k,i)=>(
              <Card key={i}><CardContent className="pt-4"><p className="text-xs text-muted-foreground">{k.l}</p><p className={`text-lg font-bold ${k.c||""}`}>{typeof k.v==="number"?fmt(k.v):k.v}</p></CardContent></Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="alertes" className="space-y-3">
          {[
            {n:"critique",t:"TVA Mars 2026 non déclarée",d:"Pénalité en cours",m:129540,e:"20/03/2026"},
            {n:"important",t:"Facture Swan Insurance impayée > 30j",d:"41 jours de retard",m:109250,e:"15/03/2026"},
            {n:"informatif",t:"Transaction non identifiée",d:"15,600 MUR le 12/03",m:15600,e:""},
          ].map((a,i)=>(
            <Card key={i}><CardContent className="flex items-start gap-3 py-4">
              <div className={`mt-1 h-2.5 w-2.5 rounded-full shrink-0 ${a.n==="critique"?"bg-red-500":a.n==="important"?"bg-orange-500":"bg-blue-500"}`} />
              <div className="flex-1">
                <Badge className={a.n==="critique"?"bg-red-100 text-red-800":a.n==="important"?"bg-orange-100 text-orange-800":"bg-blue-100 text-blue-800"}>{a.n==="critique"?"Critique":a.n==="important"?"Important":"Info"}</Badge>
                <p className="text-sm font-medium mt-1">{a.t}</p><p className="text-xs text-muted-foreground">{a.d}</p>
              </div>
              <div className="text-right shrink-0"><p className="text-sm font-semibold">{fmt(a.m)}</p>{a.e&&<p className="text-xs text-muted-foreground">{a.e}</p>}</div>
              <Button variant="outline" size="sm">Traiter</Button>
            </CardContent></Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}
