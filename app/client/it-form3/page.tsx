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
import { Calculator, FileText, Save, Printer, Loader2, Upload, CheckCircle, AlertCircle } from "lucide-react"

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

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
  const [societes, setSocietes] = useState<any[]>([])
  const [selectedSociete, setSelectedSociete] = useState("")

  // Company details
  const [companyName, setCompanyName] = useState("")
  const [brn, setBrn] = useState("")
  const [tan, setTan] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [mobile, setMobile] = useState("")
  const [assessmentYear, setAssessmentYear] = useState("2026")
  const [closingDate, setClosingDate] = useState("")

  // Accountant
  const [accountantName, setAccountantName] = useState("")

  // PDF import
  const [importingPdf, setImportingPdf] = useState(false)
  const [importMessage, setImportMessage] = useState("")

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

  // Prior year reference data
  const [priorYearData, setPriorYearData] = useState<{
    revenuAffaires: number; totalRevenus: number; totalDeductions: number;
    revenuImposable: number; impotCalcule: number
  } | null>(null)

  // Fetch data on mount and when assessment year changes
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      try {
        // Determine exercice from assessment year
        // Assessment year 2026 = income year 2025-2026 (July 2025 - June 2026)
        const yearNum = parseInt(assessmentYear)
        const exercice = `${yearNum - 1}-${yearNum}`
        const prevExercice = `${yearNum - 2}-${yearNum - 1}`

        const [socRes, finRes, prevFinRes, priorFormRes] = await Promise.all([
          fetch("/api/client/societes"),
          fetch(`/api/client/financial?exercice=${exercice}`),
          fetch(`/api/client/financial?exercice=${prevExercice}`),
          fetch(`/api/comptable/it-form3?assessment_year=${yearNum - 1}`).catch(() => null),
        ])

        if (socRes.ok) {
          const socData = await socRes.json()
          const allSoc = socData.societes || (Array.isArray(socData) ? socData : [socData])
          setSocietes(allSoc)
          const soc = selectedSociete ? allSoc.find((s: any) => s.id === selectedSociete) : allSoc[0]
          if (soc) {
            if (!selectedSociete) setSelectedSociete(soc.id)
            setCompanyName(soc.nom || soc.name || "")
            setBrn(soc.brn || "")
            setTan(soc.numero_tva_mra || soc.tan || "")
            setEmail(soc.email || "")
            setPhone(soc.telephone || soc.phone || "")
          }
        }

        if (finRes.ok) {
          const finData = await finRes.json()
          const fin = finData?.financial || (Array.isArray(finData) ? finData[0] : finData)
          if (fin) {
            setRevenuAffaires(fin.totalRevenue || fin.total_revenue || fin.chiffre_affaires || 0)
          }
        }

        // Set prior year reference from previous year financial data
        if (prevFinRes.ok) {
          const prevFinData = await prevFinRes.json()
          const prevFin = prevFinData?.financial
          if (prevFin) {
            const prevRev = prevFin.totalRevenue || 0
            setPriorYearData({
              revenuAffaires: prevRev,
              totalRevenus: prevRev,
              totalDeductions: 0,
              revenuImposable: prevRev,
              impotCalcule: prevRev * 0.15,
            })
          }
        }

        // Try to load prior year IT Form 3 submission
        if (priorFormRes && priorFormRes.ok) {
          const priorForm = await priorFormRes.json()
          if (priorForm && priorForm.data) {
            const pf = priorForm.data
            setPriorYearData({
              revenuAffaires: pf.revenus?.revenuAffaires ?? 0,
              totalRevenus: pf.revenus?.totalRevenus ?? 0,
              totalDeductions: pf.deductions?.totalDeductions ?? 0,
              revenuImposable: pf.taxCalculation?.revenuImposable ?? 0,
              impotCalcule: pf.taxCalculation?.impotCalcule ?? 0,
            })
          }
        }
      } catch (e) {
        console.error("Error fetching data:", e)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [assessmentYear])

  const handleImportPdf = async (file: File) => {
    setImportingPdf(true)
    setImportMessage("")
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("hint", "IT Form 3 - Return of Income Company - Mauritius Revenue Authority")
      const res = await fetch("/api/documents/upload", { method: "POST", body: formData })
      if (res.ok) {
        const result = await res.json()
        const parsed = result?.n8n_result || result?.data || result
        if (parsed) {
          if (parsed.company_name) setCompanyName(parsed.company_name)
          if (parsed.brn) setBrn(parsed.brn)
          if (parsed.tan) setTan(parsed.tan)
          if (parsed.email) setEmail(parsed.email)
          if (parsed.phone) setPhone(parsed.phone)
          if (parsed.mobile) setMobile(parsed.mobile)
          if (parsed.sector) setSector(parsed.sector)
          if (parsed.type_activity) setTypeActivity(parsed.type_activity)
          if (parsed.detail_activity) setDetailActivity(parsed.detail_activity)
          if (parsed.accountant_name) setAccountantName(parsed.accountant_name)
          if (parsed.assessment_year) setAssessmentYear(parsed.assessment_year)
          if (parsed.closing_date) setClosingDate(parsed.closing_date)
          // Revenue fields
          const rev = Number(parsed.revenue ?? parsed.revenu_affaires ?? parsed.chiffre_affaires ?? 0)
          if (rev) setRevenuAffaires(rev)
          if (parsed.revenu_emploi !== undefined) setRevenuEmploi(Number(parsed.revenu_emploi) || 0)
          if (parsed.revenu_locatif !== undefined) setRevenuLocatif(Number(parsed.revenu_locatif) || 0)
          if (parsed.revenu_interets !== undefined) setRevenuInterets(Number(parsed.revenu_interets) || 0)
          if (parsed.dividendes !== undefined) setDividendes(Number(parsed.dividendes) || 0)
          if (parsed.autres_revenus !== undefined) setAutresRevenus(Number(parsed.autres_revenus) || 0)
          // Deductions
          if (parsed.annual_allowance !== undefined) setAnnualAllowance(Number(parsed.annual_allowance) || 0)
          if (parsed.autres_deductions !== undefined) setAutresDeductions(Number(parsed.autres_deductions) || 0)
          // Tax
          if (parsed.taux_is !== undefined) setTauxIS(Number(parsed.taux_is) || 15)
          if (parsed.aps_paye !== undefined) setApsPayé(Number(parsed.aps_paye) || 0)
        }
        setImportMessage("PDF importe avec succes. Verifiez les champs pre-remplis.")
      } else {
        setImportMessage("Erreur lors de l'import du PDF.")
      }
    } catch {
      setImportMessage("Erreur lors de l'import du PDF.")
    } finally {
      setImportingPdf(false)
    }
  }

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
        accountantName,
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
        <div className="flex items-center gap-2">
          {societes.length > 1 && (
            <Select value={selectedSociete} onValueChange={v => { setSelectedSociete(v); setLoading(true) }}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Société" /></SelectTrigger>
              <SelectContent>{societes.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Badge className="text-sm px-3 py-1" style={{ backgroundColor: GOLD, color: NAVY }}>
            Assessment Year {assessmentYear}
          </Badge>
        </div>
      </div>

      {/* PDF Import Section */}
      <Card className="border-2 border-dashed print:hidden" style={{ borderColor: GOLD }}>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5" style={{ color: GOLD }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: NAVY }}>Importer PDF officiel</p>
                <p className="text-xs text-gray-500">Importez votre IT Form 3 officiel (PDF) pour pre-remplir automatiquement le formulaire</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                id="pdf-import-itform3"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleImportPdf(file)
                  e.target.value = ""
                }}
              />
              <Button
                variant="outline"
                onClick={() => document.getElementById("pdf-import-itform3")?.click()}
                disabled={importingPdf}
                style={{ borderColor: GOLD, color: NAVY }}
                className="flex items-center gap-2"
              >
                {importingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importingPdf ? "Import en cours..." : "Uploader un document"}
              </Button>
            </div>
          </div>
          {importMessage && (
            <div className={`flex items-center gap-2 text-sm mt-3 ${importMessage.includes("Erreur") ? "text-red-600" : "text-green-700"}`}>
              {importMessage.includes("Erreur") ? <AlertCircle className="w-4 h-4 flex-shrink-0" /> : <CheckCircle className="w-4 h-4 flex-shrink-0" />}
              <span>{importMessage}</span>
            </div>
          )}
        </CardContent>
      </Card>

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
                    <SelectItem value="2024">2024</SelectItem>
                    <SelectItem value="2025">2025</SelectItem>
                    <SelectItem value="2026">2026</SelectItem>
                    <SelectItem value="2027">2027</SelectItem>
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
                        className="accent-[#D4AF37]"
                      />
                      <span className="text-sm font-medium">Oui</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name={`q${i}`}
                        checked={!q.value}
                        onChange={() => q.setter(false)}
                        className="accent-[#D4AF37]"
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

              {priorYearData && (
                <div className="mt-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 mb-2">
                    Reference: Assessment Year {parseInt(assessmentYear) - 1}
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">CA (prior year)</span>
                      <span className="font-mono text-gray-600">{formatMUR(priorYearData.revenuAffaires)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total Revenus</span>
                      <span className="font-mono text-gray-600">{formatMUR(priorYearData.totalRevenus)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Revenu Imposable</span>
                      <span className="font-mono text-gray-600">{formatMUR(priorYearData.revenuImposable)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Impot Calcule</span>
                      <span className="font-mono text-gray-600">{formatMUR(priorYearData.impotCalcule)}</span>
                    </div>
                  </div>
                </div>
              )}
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
                <Input value={accountantName} onChange={e => setAccountantName(e.target.value)} className="w-56 text-right" placeholder="Nom du comptable" />
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
              <div><span className="text-gray-500">Comptable:</span> <span className="font-medium">{accountantName || "Non defini"}</span></div>
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
