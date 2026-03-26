"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  ArrowLeft, TrendingUp, TrendingDown, ChevronRight, Upload,
  BarChart3, Landmark, Wallet, Calculator, FolderOpen,
} from "lucide-react"

function fmt(n: number) { return n.toLocaleString("fr-FR") + " MUR" }

const mockFournisseurs = [
  { fournisseur: "SAS 2E2J", numero: "F-2026-001", date: "2026-03-15", ht: 85000, tva: 12750, ttc: 97750, echeance: "2026-04-15", statut: "en_attente", compte: "622" },
  { fournisseur: "MCB Card Services", numero: "F-2026-002", date: "2026-03-10", ht: 12500, tva: 1875, ttc: 14375, echeance: "2026-03-31", statut: "paye", compte: "627" },
  { fournisseur: "Mauritius Telecom", numero: "F-2026-003", date: "2026-03-01", ht: 8900, tva: 1335, ttc: 10235, echeance: "2026-03-20", statut: "en_retard", compte: "626" },
  { fournisseur: "OpenAI API", numero: "F-2026-004", date: "2026-03-05", ht: 45000, tva: 0, ttc: 45000, echeance: "2026-04-05", statut: "paye", compte: "651" },
  { fournisseur: "MWPI Domiciliation", numero: "F-2026-005", date: "2026-03-01", ht: 25000, tva: 3750, ttc: 28750, echeance: "2026-04-01", statut: "en_attente", compte: "612" },
  { fournisseur: "Meta Ads", numero: "F-2026-006", date: "2026-03-12", ht: 32000, tva: 0, ttc: 32000, echeance: "2026-04-12", statut: "paye", compte: "623" },
]

const mockFacturesClients = [
  { client: "Mauritius Telecom", numero: "C-2026-001", date: "2026-03-01", ht: 250000, tva: 37500, ttc: 287500, echeance: "2026-04-01", statut: "impaye", jours: 25 },
  { client: "Rogers Capital", numero: "C-2026-002", date: "2026-03-05", ht: 180000, tva: 27000, ttc: 207000, echeance: "2026-04-05", statut: "solde", jours: 0 },
  { client: "Swan Insurance", numero: "C-2026-003", date: "2026-02-15", ht: 95000, tva: 14250, ttc: 109250, echeance: "2026-03-15", statut: "impaye", jours: 41 },
  { client: "Air Mauritius", numero: "C-2026-004", date: "2026-03-10", ht: 320000, tva: 48000, ttc: 368000, echeance: "2026-04-10", statut: "partiel", jours: 0 },
  { client: "MCB Group", numero: "C-2026-005", date: "2026-03-15", ht: 150000, tva: 22500, ttc: 172500, echeance: "2026-04-15", statut: "solde", jours: 0 },
]

const mockBanque = [
  { date: "2026-03-25", libelle: "VIR MAURITIUS TELECOM", debit: 0, credit: 207000, tiers: "Mauritius Telecom", compte: "411", statut: "rapproche" },
  { date: "2026-03-24", libelle: "PRLV MCB CARD SERVICES", debit: 14375, credit: 0, tiers: "MCB Card Services", compte: "627", statut: "rapproche" },
  { date: "2026-03-22", libelle: "VIR OPENAI LLC", debit: 45000, credit: 0, tiers: "OpenAI", compte: "651", statut: "rapproche" },
  { date: "2026-03-20", libelle: "VIR CC CONVENTION TRESO", debit: 0, credit: 500000, tiers: "Inter-sociétés", compte: "451", statut: "a_verifier" },
  { date: "2026-03-18", libelle: "PRLV MWPI DOMICILIATION", debit: 28750, credit: 0, tiers: "MWPI", compte: "612", statut: "rapproche" },
  { date: "2026-03-15", libelle: "VIR SALARY MARS", debit: 420000, credit: 0, tiers: "Salaires", compte: "421", statut: "rapproche" },
  { date: "2026-03-12", libelle: "TRANSACTION INCONNUE", debit: 15600, credit: 0, tiers: "?", compte: "?", statut: "non_identifie" },
  { date: "2026-03-10", libelle: "FRAIS BANCAIRES MCB", debit: 2500, credit: 0, tiers: "MCB", compte: "627", statut: "rapproche" },
]

const mockSalaires = [
  { employe: "Raj Kumar", brut: 85000, npf: 2550, paye: 4250, net: 78200, cout: 95750, statut: "paye" },
  { employe: "Priya Doobur", brut: 65000, npf: 1950, paye: 2250, net: 60800, cout: 72750, statut: "paye" },
  { employe: "Vikash Jeetun", brut: 55000, npf: 1650, paye: 1250, net: 52100, cout: 61750, statut: "paye" },
  { employe: "Nadia Ramgoolam", brut: 120000, npf: 3600, paye: 8750, net: 107650, cout: 134400, statut: "a_payer" },
  { employe: "Anil Doorgakant", brut: 95000, npf: 2850, paye: 5750, net: 86400, cout: 106550, statut: "paye" },
]

const mockCharges = [
  { periode: "Mars 2026", npf_p: 25200, npf_s: 12600, hrdc: 4200, nps: 1250, paye: 22250, total: 65500, statut: "conforme" },
  { periode: "Fév 2026", npf_p: 24800, npf_s: 12400, hrdc: 4130, nps: 1200, paye: 21800, total: 64330, statut: "conforme" },
  { periode: "Jan 2026", npf_p: 24500, npf_s: 12250, hrdc: 4080, nps: 1200, paye: 21500, total: 63530, statut: "ecart" },
]

const mockTVA = [
  { mois: "Mars 2026", collectee: 149250, deductible: 19710, nette: 129540, deadline: "20/04/2026", statut: "a_declarer", ref: "" },
  { mois: "Fév 2026", collectee: 135000, deductible: 22500, nette: 112500, deadline: "20/03/2026", statut: "declare", ref: "MRA-VAT-2026-0234" },
  { mois: "Jan 2026", collectee: 128000, deductible: 18900, nette: 109100, deadline: "20/02/2026", statut: "declare", ref: "MRA-VAT-2026-0112" },
]

const mockDossiers = [
  { nom: "Factures Fournisseurs", count: 12, anomalies: 0 },
  { nom: "Factures Clients", count: 8, anomalies: 0 },
  { nom: "Relevés Bancaires", count: 3, anomalies: 2 },
  { nom: "Fiches de Paie", count: 17, anomalies: 0 },
  { nom: "Charges Sociales MRA", count: 6, anomalies: 0 },
  { nom: "Déclarations TVA MRA", count: 4, anomalies: 0 },
  { nom: "Rapprochement Bancaire", count: 3, anomalies: 1 },
  { nom: "Immobilisations", count: 2, anomalies: 0 },
  { nom: "Contrats", count: 5, anomalies: 0 },
  { nom: "Rapports P&L", count: 3, anomalies: 0 },
  { nom: "Liasse Fiscale Annuelle", count: 0, anomalies: 0 },
  { nom: "Divers", count: 2, anomalies: 0 },
]

function stBadge(s: string) {
  if (["paye","solde","rapproche","declare","conforme"].includes(s)) return <Badge className="bg-green-100 text-green-700">{({paye:"Payé",solde:"Soldé",rapproche:"Rapproché",declare:"Déclaré",conforme:"Conforme"} as Record<string,string>)[s]}</Badge>
  if (["en_attente","a_declarer","a_verifier","a_payer","partiel"].includes(s)) return <Badge className="bg-orange-100 text-orange-700">{({en_attente:"En attente",a_declarer:"À déclarer",a_verifier:"À vérifier",a_payer:"À payer",partiel:"Partiel"} as Record<string,string>)[s]}</Badge>
  if (["en_retard","impaye","non_identifie","ecart"].includes(s)) return <Badge className="bg-red-100 text-red-700">{({en_retard:"En retard",impaye:"Impayé",non_identifie:"Non identifié",ecart:"Écart détecté"} as Record<string,string>)[s]}</Badge>
  return <Badge variant="outline">{s}</Badge>
}

export default function SocieteContextPage() {
  const params = useParams()
  const clientId = params.clientId as string
  const clientName = "Jean-Marc Dupont"
  const societeName = "TIBOK Ltd"

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
          { label: "CA du mois", value: 995000, icon: TrendingUp, green: true },
          { label: "Charges", value: 208400, icon: TrendingDown },
          { label: "Résultat", value: 786600, icon: BarChart3, green: true },
          { label: "TVA nette", value: 129540, icon: Calculator },
          { label: "Trésorerie", value: 2340000, icon: Landmark, green: true },
          { label: "Masse salariale", value: 420000, icon: Wallet },
        ].map((k) => (
          <Card key={k.label}><CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground mb-1">{k.label}</p>
            <p className={`text-lg font-bold ${k.green ? "text-green-700" : ""}`} style={!k.green ? { color: "#1E2A4A" } : undefined}>{fmt(k.value)}</p>
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
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="pnl">P&L</TabsTrigger>
          <TabsTrigger value="alertes">Alertes</TabsTrigger>
        </TabsList>

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
            <TableHead>Échéance</TableHead><TableHead>Statut</TableHead><TableHead>Compte</TableHead>
          </TableRow></TableHeader>
          <TableBody>{mockFournisseurs.map((f,i)=>(<TableRow key={i}><TableCell className="font-medium">{f.fournisseur}</TableCell><TableCell>{f.numero}</TableCell><TableCell>{f.date}</TableCell><TableCell className="text-right">{fmt(f.ht)}</TableCell><TableCell className="text-right">{fmt(f.tva)}</TableCell><TableCell className="text-right font-semibold">{fmt(f.ttc)}</TableCell><TableCell>{f.echeance}</TableCell><TableCell>{stBadge(f.statut)}</TableCell><TableCell><Badge variant="outline">{f.compte}</Badge></TableCell></TableRow>))}</TableBody>
          </Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="clients"><Card><CardContent className="p-0">
          <Table><TableHeader><TableRow>
            <TableHead>Client</TableHead><TableHead>N°</TableHead><TableHead>Date</TableHead>
            <TableHead className="text-right">HT</TableHead><TableHead className="text-right">TVA</TableHead><TableHead className="text-right">TTC</TableHead>
            <TableHead>Échéance</TableHead><TableHead>Statut</TableHead><TableHead className="text-right">Retard</TableHead>
          </TableRow></TableHeader>
          <TableBody>{mockFacturesClients.map((f,i)=>(<TableRow key={i}><TableCell className="font-medium">{f.client}</TableCell><TableCell>{f.numero}</TableCell><TableCell>{f.date}</TableCell><TableCell className="text-right">{fmt(f.ht)}</TableCell><TableCell className="text-right">{fmt(f.tva)}</TableCell><TableCell className="text-right font-semibold">{fmt(f.ttc)}</TableCell><TableCell>{f.echeance}</TableCell><TableCell>{stBadge(f.statut)}</TableCell><TableCell className={`text-right ${f.jours>30?"text-red-600 font-bold":f.jours>0?"text-orange-600":""}`}>{f.jours>0?f.jours+"j":"—"}</TableCell></TableRow>))}</TableBody>
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
              <TableHead>Tiers</TableHead><TableHead>Compte</TableHead><TableHead>Statut</TableHead>
            </TableRow></TableHeader>
            <TableBody>{mockBanque.map((b,i)=>(<TableRow key={i} className={b.statut==="non_identifie"?"bg-red-50":b.statut==="a_verifier"?"bg-orange-50":""}><TableCell>{b.date}</TableCell><TableCell className="font-medium">{b.libelle}</TableCell><TableCell className="text-right text-red-600">{b.debit>0?fmt(b.debit):""}</TableCell><TableCell className="text-right text-green-600">{b.credit>0?fmt(b.credit):""}</TableCell><TableCell>{b.tiers}</TableCell><TableCell><Badge variant="outline">{b.compte}</Badge></TableCell><TableCell>{stBadge(b.statut)}</TableCell></TableRow>))}</TableBody>
            </Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="salaires"><Card><CardContent className="p-0">
          <Table><TableHeader><TableRow>
            <TableHead>Employé</TableHead><TableHead className="text-right">Brut</TableHead><TableHead className="text-right">NPF</TableHead><TableHead className="text-right">PAYE</TableHead>
            <TableHead className="text-right">Net</TableHead><TableHead className="text-right">Coût</TableHead><TableHead>Statut</TableHead>
          </TableRow></TableHeader>
          <TableBody>{mockSalaires.map((s,i)=>(<TableRow key={i}><TableCell className="font-medium">{s.employe}</TableCell><TableCell className="text-right">{fmt(s.brut)}</TableCell><TableCell className="text-right">{fmt(s.npf)}</TableCell><TableCell className="text-right">{fmt(s.paye)}</TableCell><TableCell className="text-right font-semibold">{fmt(s.net)}</TableCell><TableCell className="text-right">{fmt(s.cout)}</TableCell><TableCell>{stBadge(s.statut)}</TableCell></TableRow>))}</TableBody>
          </Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="charges" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">NPF Total</p><p className="text-xl font-bold">{fmt(37800)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">HRDC</p><p className="text-xl font-bold">{fmt(4200)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">NPS</p><p className="text-xl font-bold">{fmt(1250)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">PAYE</p><p className="text-xl font-bold">{fmt(22250)}</p></CardContent></Card>
          </div>
          <Card><CardContent className="p-0">
            <Table><TableHeader><TableRow>
              <TableHead>Période</TableHead><TableHead className="text-right">NPF P.</TableHead><TableHead className="text-right">NPF S.</TableHead>
              <TableHead className="text-right">HRDC</TableHead><TableHead className="text-right">NPS</TableHead><TableHead className="text-right">PAYE</TableHead>
              <TableHead className="text-right">Total</TableHead><TableHead>Statut</TableHead>
            </TableRow></TableHeader>
            <TableBody>{mockCharges.map((c,i)=>(<TableRow key={i}><TableCell className="font-medium">{c.periode}</TableCell><TableCell className="text-right">{fmt(c.npf_p)}</TableCell><TableCell className="text-right">{fmt(c.npf_s)}</TableCell><TableCell className="text-right">{fmt(c.hrdc)}</TableCell><TableCell className="text-right">{fmt(c.nps)}</TableCell><TableCell className="text-right">{fmt(c.paye)}</TableCell><TableCell className="text-right font-semibold">{fmt(c.total)}</TableCell><TableCell>{stBadge(c.statut)}</TableCell></TableRow>))}</TableBody>
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
              <TableHead className="text-right">Nette</TableHead><TableHead>Deadline</TableHead><TableHead>Statut</TableHead><TableHead>Réf</TableHead>
            </TableRow></TableHeader>
            <TableBody>{mockTVA.map((t,i)=>(<TableRow key={i}><TableCell className="font-medium">{t.mois}</TableCell><TableCell className="text-right">{fmt(t.collectee)}</TableCell><TableCell className="text-right">{fmt(t.deductible)}</TableCell><TableCell className="text-right font-semibold">{fmt(t.nette)}</TableCell><TableCell>{t.deadline}</TableCell><TableCell>{stBadge(t.statut)}</TableCell><TableCell className="text-xs text-muted-foreground">{t.ref||"—"}</TableCell></TableRow>))}</TableBody>
            </Table></CardContent></Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold" style={{ color: "#1E2A4A" }}>Dossiers</h3>
            <Button size="sm" style={{ backgroundColor: "#C9A84C" }}><Upload className="mr-1 h-4 w-4" />Uploader</Button>
          </div>
          <div className="grid gap-2">
            {mockDossiers.map((d,i)=>(
              <Card key={i} className={`cursor-pointer hover:bg-muted/50 ${d.count===0?"opacity-50":""}`}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="h-5 w-5" style={{ color: "#C9A84C" }} />
                    <div><p className="text-sm font-medium">{d.nom}</p><p className="text-xs text-muted-foreground">{d.count} doc{d.count!==1?"s":""}{d.count===0?" — vide":""}</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.anomalies>0&&<Badge className="bg-red-100 text-red-700">{d.anomalies} anomalie{d.anomalies>1?"s":""}</Badge>}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
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
