"use client"

import { useState, useEffect } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Calculator, FileText, Save, Printer, Loader2 } from "lucide-react"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

function formatMUR(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " MUR"
}

const ISIC_SECTORS = [
  { code: "A", label: "A - Agriculture, sylviculture et pêche" },
  { code: "B", label: "B - Industries extractives" },
  { code: "C", label: "C - Industrie manufacturière" },
  { code: "D", label: "D - Production et distribution d'électricité, de gaz" },
  { code: "E", label: "E - Distribution d'eau, assainissement" },
  { code: "F", label: "F - Construction" },
  { code: "G", label: "G - Commerce de gros et de détail" },
  { code: "H", label: "H - Transports et entreposage" },
  { code: "I", label: "I - Hébergement et restauration" },
  { code: "J", label: "J - Information et communication" },
  { code: "K", label: "K - Activités financières et d'assurance" },
  { code: "L", label: "L - Activités immobilières" },
  { code: "M", label: "M - Activités spécialisées, scientifiques et techniques" },
  { code: "N", label: "N - Activités de services administratifs et de soutien" },
  { code: "O", label: "O - Administration publique" },
  { code: "P", label: "P - Enseignement" },
  { code: "Q", label: "Q - Santé humaine et action sociale" },
  { code: "R", label: "R - Arts, spectacles et activités récréatives" },
  { code: "S", label: "S - Autres activités de services" },
  { code: "T", label: "T - Activités des ménages en tant qu'employeurs" },
  { code: "U", label: "U - Activités des organisations extraterritoriales" },
]

export default function ITForm3Page() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Company details
  const [companyName, setCompanyName] = useState("")
  const [brn, setBrn] = useState("")
  const [tan, setTan] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [mobile, setMobile] = useState("")
  const [assessmentYear, setAssessmentYear] = useState("2026")
  const [closingDate, setClosingDate] = useState("")

  // Business activity
  const [sector, setSector] = useState("")
  const [typeActivity, setTypeActivity] = useState("")
  const [detailActivity, setDetailActivity] = useState("")

  // Yes/No questions
  const [inOperation, setInOperation] = useState(true)
  const [relatedParty, setRelatedParty] = useState(true)
  const [armLength, setArmLength] = useState(true)
  const [dividendsPaid, setDividendsPaid] = useState(false)
  const [foreignIncome, setForeignIncome] = useState(true)
  const [firstYear, setFirstYear] = useState(false)

  // Revenue (Schedule A)
  const [revenuAffaires, setRevenuAffaires] = useState(0)
  const [revenuEmploi, setRevenuEmploi] = useState(0)
  const [revenuLocatif, setRevenuLocatif] = useState(0)
  const [revenuInterets, setRevenuInterets] = useState(0)
  const [dividendes, setDividendes] = useState(0)
  const [autresRevenus, setAutresRevenus] = useState(0)

  // Deductions
  const [annualAllowance, setAnnualAllowance] = useState(0)
  const [autresDeductions, setAutresDeductions] = useState(0)

  // Tax calculation
  const [tauxIS, setTauxIS] = useState(15)
  const [apsPayé, setApsPayé] = useState(0)

  // Computed
  const [totalRevenus, setTotalRevenus] = useState(0)
  const [totalDeductions, setTotalDeductions] = useState(0)
  const [revenuImposable, setRevenuImposable] = useState(0)
  const [impotCalcule, setImpotCalcule] = useState(0)
  const [csrAmount, setCsrAmount] = useState(0)
  const [apsApplicable, setApsApplicable] = useState(false)
  const [apsQuarterly, setApsQuarterly] = useState(0)
  const [soldeAPayer, setSoldeAPayer] = useState(0)

  // Fetch data on mount
  useEffect(() => {
    async function fetchData() {
      try {
        const [socRes, finRes] = await Promise.all([
          fetch("/api/client/societes"),
          fetch("/api/client/financial"),
        ])

        if (socRes.ok) {
          const socData = await socRes.json()
          const soc = Array.isArray(socData) ? socData[0] : socData?.data?.[0] || socData
          if (soc) {
            setCompanyName(soc.nom || soc.name || "")
            setBrn(soc.brn || "")
            setTan(soc.numero_tva_mra || soc.tan || "")
            setEmail(soc.email || "")
            setPhone(soc.telephone || soc.phone || "")
          }
        }

        if (finRes.ok) {
          const finData = await finRes.json()
          const fin = Array.isArray(finData) ? finData[0] : finData
          if (fin) {
            setRevenuAffaires(fin.totalRevenue || fin.total_revenue || fin.chiffre_affaires || 0)
          }
        }
      } catch (e) {
        console.error("Error fetching data:", e)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const handleCalculer = () => {
    const totRev = revenuAffaires + revenuEmploi + revenuLocatif + revenuInterets + dividendes + autresRevenus
    const totDed = annualAllowance + autresDeductions
    const revImp = Math.max(0, totRev - totDed)
    const impot = revImp * (tauxIS / 100)
    const isAps = revenuAffaires > 10_000_000
    const quarterly = isAps ? impot / 4 : 0
    const csr = revImp > 10_000_000 ? revImp * 0.02 : 0
    const solde = impot - apsPayé + csr

    setTotalRevenus(totRev)
    setTotalDeductions(totDed)
    setRevenuImposable(revImp)
    setImpotCalcule(impot)
    setApsApplicable(isAps)
    setApsQuarterly(quarterly)
    setCsrAmount(csr)
    setSoldeAPayer(solde)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        companyName,
        brn,
        tan,
        email,
        phone,
        mobile,
        assessmentYear,
        closingDate,
        sector,
        typeActivity,
        detailActivity,
        questions: { inOperation, relatedParty, armLength, dividendsPaid, foreignIncome, firstYear },
        revenus: { revenuAffaires, revenuEmploi, revenuLocatif, revenuInterets, dividendes, autresRevenus, totalRevenus },
        deductions: { annualAllowance, autresDeductions, totalDeductions },
        taxCalculation: { revenuImposable, tauxIS, impotCalcule, apsApplicable, apsQuarterly, csrAmount, apsPayé, soldeAPayer },
      }
      await fetch("/api/comptable/it-form3", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    } catch (e) {
      console.error("Error saving:", e)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
        <span className="ml-3 text-lg" style={{ color: NAVY }}>Chargement du formulaire IT Form 3...</span>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto print:p-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: NAVY }}>
            <FileText className="w-7 h-7" style={{ color: GOLD }} />
            IT Form 3 - Return of Income (Company)
          </h1>
          <p className="text-sm text-gray-500 mt-1">Mauritius Revenue Authority - Formulaire de retour de revenus pour sociétés</p>
        </div>
        <Badge className="text-sm px-3 py-1" style={{ backgroundColor: GOLD, color: NAVY }}>
          Assessment Year {assessmentYear}
        </Badge>
      </div>

      <Tabs defaultValue="form" className="w-full">
        <TabsList className="print:hidden">
          <TabsTrigger value="form">Formulaire</TabsTrigger>
          <TabsTrigger value="summary">Résumé & Calcul</TabsTrigger>
        </TabsList>

        <TabsContent value="form" className="space-y-6 mt-4">
          {/* Section 1 - Company Details */}
          <Card className="border-t-4" style={{ borderTopColor: NAVY }}>
            <CardHeader>
              <CardTitle className="text-lg" style={{ color: NAVY }}>Section 1 - Détails de la Société</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom complet de la société</Label>
                <Input value={companyName} onChange={e => setCompanyName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>BRN (Business Registration Number)</Label>
                <Input value={brn} onChange={e => setBrn(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>TAN (Tax Account Number)</Label>
                <Input value={tan} onChange={e => setTan(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Mobile</Label>
                <Input value={mobile} onChange={e => setMobile(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Devise</Label>
                <Input value="MUR" disabled className="bg-gray-50" />
              </div>
              <div className="space-y-2">
                <Label>Assessment Year</Label>
                <Select value={assessmentYear} onValueChange={setAssessmentYear}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2025">2025</SelectItem>
                    <SelectItem value="2026">2026</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Date de clôture des comptes</Label>
                <Input type="date" value={closingDate} onChange={e => setClosingDate(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* Section 2 - Business Activity */}
          <Card className="border-t-4" style={{ borderTopColor: NAVY }}>
            <CardHeader>
              <CardTitle className="text-lg" style={{ color: NAVY }}>Section 2 - Activité Commerciale</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>Secteur (Classification ISIC)</Label>
                <Select value={sector} onValueChange={setSector}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner le secteur" />
                  </SelectTrigger>
                  <SelectContent>
                    {ISIC_SECTORS.map(s => (
                      <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type d&apos;activité</Label>
                <Input value={typeActivity} onChange={e => setTypeActivity(e.target.value)} placeholder="ex: Services informatiques" />
              </div>
              <div className="space-y-2">
                <Label>Détail de l&apos;activité</Label>
                <Input value={detailActivity} onChange={e => setDetailActivity(e.target.value)} placeholder="ex: Développement logiciel et conseil" />
              </div>
            </CardContent>
          </Card>

          {/* Section 3 - Yes/No Questions */}
          <Card className="border-t-4" style={{ borderTopColor: NAVY }}>
            <CardHeader>
              <CardTitle className="text-lg" style={{ color: NAVY }}>Section 3 - Questions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "La société était-elle en exploitation durant cette période ?", value: inOperation, setter: setInOperation },
                { label: "Y a-t-il eu des transactions avec des parties liées ?", value: relatedParty, setter: setRelatedParty },
                { label: "Les transactions avec parties liées sont-elles à des conditions de pleine concurrence (arm's length) ?", value: armLength, setter: setArmLength },
                { label: "Des dividendes ont-ils été versés ?", value: dividendsPaid, setter: setDividendsPaid },
                { label: "La société a-t-elle perçu des revenus de source étrangère ?", value: foreignIncome, setter: setForeignIncome },
                { label: "Est-ce la première année d'imposition ?", value: firstYear, setter: setFirstYear },
              ].map((q, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <span className="text-sm text-gray-700">{q.label}</span>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name={`q${i}`}
                        checked={q.value}
                        onChange={() => q.setter(true)}
                        className="accent-[#C9A84C]"
                      />
                      <span className="text-sm font-medium">Oui</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name={`q${i}`}
                        checked={!q.value}
                        onChange={() => q.setter(false)}
                        className="accent-[#C9A84C]"
                      />
                      <span className="text-sm font-medium">Non</span>
                    </label>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Section 4 - Revenue */}
          <Card className="border-t-4" style={{ borderTopColor: GOLD }}>
            <CardHeader>
              <CardTitle className="text-lg" style={{ color: NAVY }}>Section 4 - Revenus (Schedule A)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "Chiffre d'affaires (Revenu des affaires)", value: revenuAffaires, setter: setRevenuAffaires },
                { label: "Revenu d'emploi", value: revenuEmploi, setter: setRevenuEmploi },
                { label: "Revenu locatif", value: revenuLocatif, setter: setRevenuLocatif },
                { label: "Revenu d'intérêts", value: revenuInterets, setter: setRevenuInterets },
                { label: "Dividendes", value: dividendes, setter: setDividendes },
                { label: "Autres revenus", value: autresRevenus, setter: setAutresRevenus },
              ].map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-4">
                  <Label className="flex-1 text-sm">{r.label}</Label>
                  <div className="w-56">
                    <Input
                      type="number"
                      value={r.value || ""}
                      onChange={e => r.setter(parseFloat(e.target.value) || 0)}
                      className="text-right"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 pt-3 border-t-2" style={{ borderTopColor: NAVY }}>
                <span className="font-bold text-base" style={{ color: NAVY }}>TOTAL REVENUS</span>
                <span className="font-bold text-base w-56 text-right" style={{ color: NAVY }}>
                  {formatMUR(totalRevenus)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Section 5 - Deductions */}
          <Card className="border-t-4" style={{ borderTopColor: GOLD }}>
            <CardHeader>
              <CardTitle className="text-lg" style={{ color: NAVY }}>Section 5 - Déductions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <Label className="flex-1 text-sm">Annual Allowance (Amortissement annuel)</Label>
                <div className="w-56">
                  <Input
                    type="number"
                    value={annualAllowance || ""}
                    onChange={e => setAnnualAllowance(parseFloat(e.target.value) || 0)}
                    className="text-right"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label className="flex-1 text-sm">Autres déductions</Label>
                <div className="w-56">
                  <Input
                    type="number"
                    value={autresDeductions || ""}
                    onChange={e => setAutresDeductions(parseFloat(e.target.value) || 0)}
                    className="text-right"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 pt-3 border-t-2" style={{ borderTopColor: NAVY }}>
                <span className="font-bold text-base" style={{ color: NAVY }}>TOTAL DEDUCTIONS</span>
                <span className="font-bold text-base w-56 text-right" style={{ color: NAVY }}>
                  {formatMUR(totalDeductions)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Section 6 - Tax Rate */}
          <Card className="border-t-4" style={{ borderTopColor: GOLD }}>
            <CardHeader>
              <CardTitle className="text-lg" style={{ color: NAVY }}>Section 6 - Paramètres de calcul</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Taux IS (%)</Label>
                <Input
                  type="number"
                  value={tauxIS}
                  onChange={e => setTauxIS(parseFloat(e.target.value) || 0)}
                  className="text-right"
                />
              </div>
              <div className="space-y-2">
                <Label>APS déjà payé</Label>
                <Input
                  type="number"
                  value={apsPayé || ""}
                  onChange={e => setApsPayé(parseFloat(e.target.value) || 0)}
                  className="text-right"
                  placeholder="0.00"
                />
              </div>
            </CardContent>
          </Card>

          {/* Section 7 - Declaration */}
          <Card className="border-t-4" style={{ borderTopColor: NAVY }}>
            <CardHeader>
              <CardTitle className="text-lg" style={{ color: NAVY }}>Section 7 - Déclaration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <Label className="flex-1 text-sm">Nom du comptable</Label>
                <Input value="MAGELLAN HUB LTD" disabled className="w-56 bg-gray-50 text-right" />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label className="flex-1 text-sm">Montant d&apos;impôt à payer</Label>
                <span className="w-56 text-right font-semibold" style={{ color: NAVY }}>{formatMUR(Math.max(0, soldeAPayer))}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label className="flex-1 text-sm">Montant à rembourser</Label>
                <span className="w-56 text-right font-semibold text-green-600">{formatMUR(Math.max(0, -soldeAPayer))}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary" className="space-y-6 mt-4">
          {/* Tax Calculation Summary */}
          <Card className="border-2" style={{ borderColor: NAVY }}>
            <CardHeader style={{ backgroundColor: NAVY }}>
              <CardTitle className="text-lg text-white flex items-center gap-2">
                <Calculator className="w-5 h-5" style={{ color: GOLD }} />
                Résumé du Calcul d&apos;Impôt
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">Total Revenus</span>
                <span className="font-medium">{formatMUR(totalRevenus)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">Total Déductions</span>
                <span className="font-medium text-red-600">- {formatMUR(totalDeductions)}</span>
              </div>
              <div className="flex justify-between py-2 border-b-2" style={{ borderColor: NAVY }}>
                <span className="font-bold" style={{ color: NAVY }}>Revenu Imposable</span>
                <span className="font-bold" style={{ color: NAVY }}>{formatMUR(revenuImposable)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">Taux IS</span>
                <span className="font-medium">{tauxIS}%</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="font-semibold" style={{ color: NAVY }}>Impôt Calculé</span>
                <span className="font-semibold" style={{ color: NAVY }}>{formatMUR(impotCalcule)}</span>
              </div>

              {apsApplicable && (
                <div className="rounded-lg p-4 mt-2" style={{ backgroundColor: `${GOLD}15` }}>
                  <p className="text-sm font-semibold mb-2" style={{ color: NAVY }}>
                    APS Applicable (CA &gt; 10M MUR)
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {["Q1", "Q2", "Q3", "Q4"].map(q => (
                      <div key={q} className="text-center p-2 bg-white rounded border">
                        <p className="text-xs text-gray-500">{q}</p>
                        <p className="font-semibold text-sm" style={{ color: NAVY }}>{formatMUR(apsQuarterly)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {csrAmount > 0 && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">CSR 2% (profit &gt; 10M MUR)</span>
                  <span className="font-medium">{formatMUR(csrAmount)}</span>
                </div>
              )}

              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">APS Payé</span>
                <span className="font-medium text-green-600">- {formatMUR(apsPayé)}</span>
              </div>

              <div className="flex justify-between py-3 rounded-lg px-4 mt-2" style={{ backgroundColor: NAVY }}>
                <span className="text-white font-bold text-lg">Solde à Payer</span>
                <span className="font-bold text-lg" style={{ color: GOLD }}>{formatMUR(soldeAPayer)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Company summary for print */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg" style={{ color: NAVY }}>Informations de la Société</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Société:</span> <span className="font-medium">{companyName}</span></div>
              <div><span className="text-gray-500">BRN:</span> <span className="font-medium">{brn}</span></div>
              <div><span className="text-gray-500">TAN:</span> <span className="font-medium">{tan}</span></div>
              <div><span className="text-gray-500">Assessment Year:</span> <span className="font-medium">{assessmentYear}</span></div>
              <div><span className="text-gray-500">Comptable:</span> <span className="font-medium">MAGELLAN HUB LTD</span></div>
              <div><span className="text-gray-500">Clôture:</span> <span className="font-medium">{closingDate || "Non définie"}</span></div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 print:hidden sticky bottom-0 bg-white py-4 border-t">
        <Button
          onClick={handleCalculer}
          className="flex items-center gap-2"
          style={{ backgroundColor: NAVY, color: "white" }}
        >
          <Calculator className="w-4 h-4" />
          Calculer IS
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2"
          style={{ backgroundColor: GOLD, color: NAVY }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Sauvegarder
        </Button>
        <Button
          onClick={() => window.print()}
          variant="outline"
          className="flex items-center gap-2"
          style={{ borderColor: NAVY, color: NAVY }}
        >
          <Printer className="w-4 h-4" />
          Exporter PDF
        </Button>
      </div>
    </div>
  )
}
