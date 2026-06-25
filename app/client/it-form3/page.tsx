"use client"

import { useState, useEffect } from "react"
import { getCurrentExercice } from "@/lib/fiscal-years"
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
import { Calculator, FileText, Save, Download, Loader2, Upload, CheckCircle, AlertCircle } from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { useSocieteActive } from "@/components/client/SocieteActiveProvider"
import { t, getLocale } from "@/lib/i18n"
import { computeCSR } from "@/lib/accounting/mra-csr"

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
  const locale = getLocale()
  const { societeId, societe } = useSocieteActive()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Company details
  const [companyName, setCompanyName] = useState("")
  const [brn, setBrn] = useState("")
  const [tan, setTan] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [mobile, setMobile] = useState("")
  const [assessmentYear, setAssessmentYear] = useState(getCurrentExercice().split('-')[1])
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
  // TDS (Tax Deducted at Source) retenu par les clients sur les honoraires,
  // loyers, services pro etc. Déductible en crédit d'impôt sur l'IT Form 3.
  const [tdsPaye, setTdsPaye] = useState(0)

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

  // Fetch data on mount and when assessment year or société changes
  useEffect(() => {
    const safetyTimeout = setTimeout(() => setLoading(false), 8000)
    const controller = new AbortController()
    async function fetchData() {
      setLoading(true)
      try {
        const yearNum = parseInt(assessmentYear)
        const exercice = `${yearNum - 1}-${yearNum}`
        const prevExercice = `${yearNum - 2}-${yearNum - 1}`

        if (!societeId) return
        const socParam = `&societe_id=${societeId}`
        const [finRes, prevFinRes, priorFormRes] = await Promise.all([
          fetch(`/api/client/financial?exercice=${exercice}${socParam}`, { signal: controller.signal }),
          fetch(`/api/client/financial?exercice=${prevExercice}${socParam}`, { signal: controller.signal }).catch(() => null),
          fetch(`/api/comptable/it-form3?societe_id=${societeId}&exercice=${prevExercice}`, { signal: controller.signal }).catch(() => null),
        ])

        if (controller.signal.aborted) return

        const soc = societe as (typeof societe & { name?: string; tan?: string; tan_societe?: string; phone?: string }) | null
        if (soc) {
          setCompanyName(soc.nom || soc.name || "")
          setBrn(soc.brn || "")
          setTan(soc.tan_societe || soc.numero_tva_mra || "")
          setEmail(soc.email || "")
          setPhone(soc.telephone || soc.phone || "")
        }

        if (finRes && finRes.ok) {
          const finData = await finRes.json()
          const fin = finData?.financial || (Array.isArray(finData) ? finData[0] : finData)
          if (fin) {
            setRevenuAffaires(fin.totalRevenue || fin.total_revenue || fin.chiffre_affaires || 0)
          }
        }

        if (prevFinRes && prevFinRes.ok) {
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

        if (priorFormRes && priorFormRes.ok) {
          try {
            const priorForm = await priorFormRes.json()
            const pf = priorForm?.form3 || priorForm?.data
            if (pf) {
              setPriorYearData({
                revenuAffaires: pf.revenus?.revenuAffaires ?? 0,
                totalRevenus: pf.revenus?.totalRevenus ?? 0,
                totalDeductions: pf.deductions?.totalDeductions ?? 0,
                revenuImposable: pf.taxCalculation?.revenuImposable ?? 0,
                impotCalcule: pf.taxCalculation?.impotCalcule ?? 0,
              })
            }
          } catch { /* prior form not available */ }
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        console.error("Error fetching IT Form 3 data:", e)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    fetchData()
    return () => { controller.abort(); clearTimeout(safetyTimeout) }
  }, [assessmentYear, societeId])

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
        setImportMessage(t('mra.itform3.import_success', locale))
      } else {
        setImportMessage(t('mra.itform3.import_error', locale))
      }
    } catch {
      setImportMessage(t('mra.itform3.import_error', locale))
    } finally {
      setImportingPdf(false)
    }
  }

  const handleCalculer = () => {
    const totRev = revenuAffaires + revenuEmploi + revenuLocatif + revenuInterets + dividendes + autresRevenus
    const totDed = annualAllowance + autresDeductions
    const revImp = Math.max(0, totRev - totDed)
    const impot = revImp * (tauxIS / 100)
    // APS (Advance Payment System) — ITA Section 111A : si tax_payable
    // de l'année N-1 > 50 000 MUR, l'entité doit payer APS trimestriel.
    // L'usage de revenuAffaires > 10M est un proxy ; le bon critère est
    // basé sur l'IT Form 3 N-1.
    const isAps = revenuAffaires > 10_000_000 || (priorYearData?.impotCalcule || 0) > 50_000
    const quarterly = isAps ? impot / 4 : 0
    // CSR = 2 % du chargeable income (ITA s.50L). Applicable à toutes
    // les sociétés résidentes, SAUF catégories exonérées (GBC1,
    // Authorised Company, Freeport, exonérées d'IS, production
    // audiovisuelle). L'exonération n'est PAS basée sur un seuil de
    // revenu. Cf. lib/accounting/mra-csr.ts et docs/audit-partials/
    // wave2-D-mra-fiscal.md Pb 2.b.
    const regime = (societe as { regime?: string | null } | null)?.regime ?? null
    const csrOverride = (societe as { csr_exempt?: boolean } | null)?.csr_exempt === true
    const csr = computeCSR(revImp, regime, csrOverride)
    // Solde = impôt + CSR − APS payé d'avance − TDS retenu à la source
    // par les clients (sur honoraires, loyers, etc. — ITA s.111A et 124)
    const solde = impot + csr - apsPayé - tdsPaye

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
    if (!societeId) { alert(t('mra.itform3.select_societe', locale)); return }
    setSaving(true)
    try {
      const yearNum = parseInt(assessmentYear)
      const payload = {
        societe_id: societeId,
        exercice: `${yearNum - 1}-${yearNum}`,
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
      const res = await fetch("/api/comptable/it-form3", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      if (res.ok) { alert(t('mra.itform3.save_success', locale)) } else { const err = await res.json(); alert(t('mra.itform3.save_error_prefix', locale) + (err.error || t('mra.itform3.server_error', locale))) }
    } catch (e) {
      console.error("Error saving:", e)
      alert(t('mra.itform3.save_error', locale))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: GOLD }} />
        <span className="ml-3 text-lg" style={{ color: NAVY }}>{t('mra.itform3.loading', locale)}</span>
      </div>
    )
  }

  return (
    <ClientPageShell
      breadcrumbs={[{ label: t('mra.itform3.breadcrumb_client', locale), href: "/client" }, { label: t('mra.itform3.breadcrumb_itform', locale) }]}
      kicker={`${t('mra.itform3.kicker_prefix', locale)} ${assessmentYear}`}
      title={t('mra.itform3.title', locale)}
      subtitle={t('mra.itform3.subtitle', locale)}
      actions={
        <>
          <Badge className="text-sm px-3 py-1" style={{ backgroundColor: GOLD, color: NAVY }}>
            {t('mra.itform3.assessment_year_badge', locale)} {assessmentYear}
          </Badge>
        </>
      }
    >
      <div className="space-y-6 max-w-5xl mx-auto print:p-2">

      {/* PDF Import Section */}
      <Card className="border-2 border-dashed print:hidden" style={{ borderColor: GOLD }}>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5" style={{ color: GOLD }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: NAVY }}>{t('mra.itform3.import_pdf_title', locale)}</p>
                <p className="text-xs text-gray-500">{t('mra.itform3.import_pdf_hint', locale)}</p>
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
                {importingPdf ? t('mra.itform3.importing', locale) : t('mra.itform3.upload_doc', locale)}
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

      <Tabs defaultValue="form" className="w-full" id="it-form-content">
        <TabsList className="print:hidden">
          <TabsTrigger value="form">{t('mra.itform3.tab_form', locale)}</TabsTrigger>
          <TabsTrigger value="summary">{t('mra.itform3.tab_summary', locale)}</TabsTrigger>
        </TabsList>

        <TabsContent value="form" className="space-y-6 mt-4">
          {/* Section 1 - Company Details */}
          <Card className="border-t-4" style={{ borderTopColor: NAVY }}>
            <CardHeader>
              <CardTitle className="text-lg" style={{ color: NAVY }}>{t('mra.itform3.s1_title', locale)}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('mra.itform3.lbl_company_name', locale)}</Label>
                <Input value={companyName} onChange={e => setCompanyName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('mra.itform3.lbl_brn', locale)}</Label>
                <Input value={brn} onChange={e => setBrn(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('mra.itform3.lbl_tan', locale)}</Label>
                <Input value={tan} onChange={e => setTan(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('mra.itform3.lbl_email', locale)}</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('mra.itform3.lbl_phone', locale)}</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('mra.itform3.lbl_mobile', locale)}</Label>
                <Input value={mobile} onChange={e => setMobile(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('mra.itform3.lbl_currency', locale)}</Label>
                <Input value="MUR" disabled className="bg-gray-50" />
              </div>
              <div className="space-y-2">
                <Label>{t('mra.itform3.lbl_assessment_year', locale)}</Label>
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
                <Label>{t('mra.itform3.lbl_closing_date', locale)}</Label>
                <Input type="date" value={closingDate} onChange={e => setClosingDate(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {/* Section 2 - Business Activity */}
          <Card className="border-t-4" style={{ borderTopColor: NAVY }}>
            <CardHeader>
              <CardTitle className="text-lg" style={{ color: NAVY }}>{t('mra.itform3.s2_title', locale)}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>{t('mra.itform3.lbl_sector', locale)}</Label>
                <Select value={sector} onValueChange={setSector}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('mra.itform3.placeholder_sector', locale)} />
                  </SelectTrigger>
                  <SelectContent>
                    {ISIC_SECTORS.map(s => (
                      <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('mra.itform3.lbl_type_activity', locale)}</Label>
                <Input value={typeActivity} onChange={e => setTypeActivity(e.target.value)} placeholder={t('mra.itform3.placeholder_type_activity', locale)} />
              </div>
              <div className="space-y-2">
                <Label>{t('mra.itform3.lbl_detail_activity', locale)}</Label>
                <Input value={detailActivity} onChange={e => setDetailActivity(e.target.value)} placeholder={t('mra.itform3.placeholder_detail_activity', locale)} />
              </div>
            </CardContent>
          </Card>

          {/* Section 3 - Yes/No Questions */}
          <Card className="border-t-4" style={{ borderTopColor: NAVY }}>
            <CardHeader>
              <CardTitle className="text-lg" style={{ color: NAVY }}>{t('mra.itform3.s3_title', locale)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: t('mra.itform3.q_in_operation', locale), value: inOperation, setter: setInOperation },
                { label: t('mra.itform3.q_related_party', locale), value: relatedParty, setter: setRelatedParty },
                { label: t('mra.itform3.q_arm_length', locale), value: armLength, setter: setArmLength },
                { label: t('mra.itform3.q_dividends_paid', locale), value: dividendsPaid, setter: setDividendsPaid },
                { label: t('mra.itform3.q_foreign_income', locale), value: foreignIncome, setter: setForeignIncome },
                { label: t('mra.itform3.q_first_year', locale), value: firstYear, setter: setFirstYear },
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
                      <span className="text-sm font-medium">{t('mra.itform3.yes', locale)}</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name={`q${i}`}
                        checked={!q.value}
                        onChange={() => q.setter(false)}
                        className="accent-[#D4AF37]"
                      />
                      <span className="text-sm font-medium">{t('mra.itform3.no', locale)}</span>
                    </label>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Section 4 - Revenue */}
          <Card className="border-t-4" style={{ borderTopColor: GOLD }}>
            <CardHeader>
              <CardTitle className="text-lg" style={{ color: NAVY }}>{t('mra.itform3.s4_title', locale)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: t('mra.itform3.rev_business', locale), value: revenuAffaires, setter: setRevenuAffaires },
                { label: t('mra.itform3.rev_employment', locale), value: revenuEmploi, setter: setRevenuEmploi },
                { label: t('mra.itform3.rev_rental', locale), value: revenuLocatif, setter: setRevenuLocatif },
                { label: t('mra.itform3.rev_interest', locale), value: revenuInterets, setter: setRevenuInterets },
                { label: t('mra.itform3.rev_dividends', locale), value: dividendes, setter: setDividendes },
                { label: t('mra.itform3.rev_other', locale), value: autresRevenus, setter: setAutresRevenus },
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
                <span className="font-bold text-base" style={{ color: NAVY }}>{t('mra.itform3.total_revenues', locale)}</span>
                <span className="font-bold text-base w-56 text-right" style={{ color: NAVY }}>
                  {formatMUR(totalRevenus)}
                </span>
              </div>

              {priorYearData && (
                <div className="mt-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 mb-2">
                    {t('mra.itform3.prior_ref_prefix', locale)} {parseInt(assessmentYear) - 1}
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t('mra.itform3.prior_ca', locale)}</span>
                      <span className="font-mono text-gray-600">{formatMUR(priorYearData.revenuAffaires)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t('mra.itform3.prior_total_rev', locale)}</span>
                      <span className="font-mono text-gray-600">{formatMUR(priorYearData.totalRevenus)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t('mra.itform3.prior_chargeable', locale)}</span>
                      <span className="font-mono text-gray-600">{formatMUR(priorYearData.revenuImposable)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">{t('mra.itform3.prior_tax', locale)}</span>
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
              <CardTitle className="text-lg" style={{ color: NAVY }}>{t('mra.itform3.s5_title', locale)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <Label className="flex-1 text-sm">{t('mra.itform3.annual_allowance', locale)}</Label>
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
                <Label className="flex-1 text-sm">{t('mra.itform3.other_deductions', locale)}</Label>
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
                <span className="font-bold text-base" style={{ color: NAVY }}>{t('mra.itform3.total_deductions', locale)}</span>
                <span className="font-bold text-base w-56 text-right" style={{ color: NAVY }}>
                  {formatMUR(totalDeductions)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Section 6 - Tax Rate */}
          <Card className="border-t-4" style={{ borderTopColor: GOLD }}>
            <CardHeader>
              <CardTitle className="text-lg" style={{ color: NAVY }}>{t('mra.itform3.s6_title', locale)}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('mra.itform3.lbl_tax_rate', locale)}</Label>
                <Input
                  type="number"
                  value={tauxIS}
                  onChange={e => setTauxIS(parseFloat(e.target.value) || 0)}
                  className="text-right"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('mra.itform3.lbl_aps_paid', locale)}</Label>
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
              <CardTitle className="text-lg" style={{ color: NAVY }}>{t('mra.itform3.s7_title', locale)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <Label className="flex-1 text-sm">{t('mra.itform3.lbl_accountant', locale)}</Label>
                <Input value={accountantName} onChange={e => setAccountantName(e.target.value)} className="w-56 text-right" placeholder={t('mra.itform3.placeholder_accountant', locale)} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label className="flex-1 text-sm">{t('mra.itform3.lbl_tax_due', locale)}</Label>
                <span className="w-56 text-right font-semibold" style={{ color: NAVY }}>{formatMUR(Math.max(0, soldeAPayer))}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label className="flex-1 text-sm">{t('mra.itform3.lbl_refund', locale)}</Label>
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
                {t('mra.itform3.summary_title', locale)}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">{t('mra.itform3.s_total_rev', locale)}</span>
                <span className="font-medium">{formatMUR(totalRevenus)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">{t('mra.itform3.s_total_ded', locale)}</span>
                <span className="font-medium text-red-600">- {formatMUR(totalDeductions)}</span>
              </div>
              <div className="flex justify-between py-2 border-b-2" style={{ borderColor: NAVY }}>
                <span className="font-bold" style={{ color: NAVY }}>{t('mra.itform3.s_chargeable', locale)}</span>
                <span className="font-bold" style={{ color: NAVY }}>{formatMUR(revenuImposable)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">{t('mra.itform3.s_tax_rate', locale)}</span>
                <span className="font-medium">{tauxIS}%</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="font-semibold" style={{ color: NAVY }}>{t('mra.itform3.s_tax_calc', locale)}</span>
                <span className="font-semibold" style={{ color: NAVY }}>{formatMUR(impotCalcule)}</span>
              </div>

              {apsApplicable && (
                <div className="rounded-lg p-4 mt-2" style={{ backgroundColor: `${GOLD}15` }}>
                  <p className="text-sm font-semibold mb-2" style={{ color: NAVY }}>
                    {t('mra.itform3.aps_applicable', locale)}
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
                  <span className="text-gray-600">{t('mra.itform3.csr_label', locale)}</span>
                  <span className="font-medium">{formatMUR(csrAmount)}</span>
                </div>
              )}

              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-600">{t('mra.itform3.aps_paid_label', locale)}</span>
                <span className="font-medium text-green-600">- {formatMUR(apsPayé)}</span>
              </div>

              <div className="flex justify-between py-3 rounded-lg px-4 mt-2" style={{ backgroundColor: NAVY }}>
                <span className="text-white font-bold text-lg">{t('mra.itform3.balance_due', locale)}</span>
                <span className="font-bold text-lg" style={{ color: GOLD }}>{formatMUR(soldeAPayer)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Company summary for print */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg" style={{ color: NAVY }}>{t('mra.itform3.company_info', locale)}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">{t('mra.itform3.company_label', locale)}</span> <span className="font-medium">{companyName}</span></div>
              <div><span className="text-gray-500">{t('mra.itform3.brn_label', locale)}</span> <span className="font-medium">{brn}</span></div>
              <div><span className="text-gray-500">{t('mra.itform3.tan_label', locale)}</span> <span className="font-medium">{tan}</span></div>
              <div><span className="text-gray-500">{t('mra.itform3.assessment_year_label', locale)}</span> <span className="font-medium">{assessmentYear}</span></div>
              <div><span className="text-gray-500">{t('mra.itform3.accountant_label', locale)}</span> <span className="font-medium">{accountantName || t('mra.itform3.not_defined_m', locale)}</span></div>
              <div><span className="text-gray-500">{t('mra.itform3.closing_label', locale)}</span> <span className="font-medium">{closingDate || t('mra.itform3.not_defined_f', locale)}</span></div>
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
          {t('mra.itform3.btn_compute', locale)}
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2"
          style={{ backgroundColor: GOLD, color: NAVY }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('mra.itform3.btn_save', locale)}
        </Button>
        <Button
          onClick={async () => {
            try {
              const { pdf, Document, Page, Text, View, StyleSheet } = await import('@react-pdf/renderer')
              const s = StyleSheet.create({
                page: { padding: 30, fontFamily: 'Helvetica', fontSize: 10 },
                title: { fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
                subtitle: { fontSize: 11, textAlign: 'center', color: '#555', marginBottom: 4 },
                sec: { marginBottom: 12 },
                secTitle: { fontSize: 11, fontWeight: 'bold', backgroundColor: '#f0f0f0', padding: 6, marginBottom: 4 },
                row: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#ddd' },
                label: { flex: 3, fontSize: 9 },
                val: { flex: 1, fontSize: 9, textAlign: 'right', fontWeight: 'bold' },
                footer: { position: 'absolute', bottom: 20, left: 30, right: 30, textAlign: 'center', fontSize: 7, color: '#999' },
              })
              const f = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              const R = ({ l, v }: { l: string; v: string }) => (
                <View style={s.row}><Text style={s.label}>{l}</Text><Text style={s.val}>{v}</Text></View>
              )
              const socData = societe
              const doc = (
                <Document>
                  <Page size="A4" style={s.page}>
                    <Text style={s.title}>IT FORM 3 — RETURN OF INCOME (COMPANY)</Text>
                    <Text style={s.subtitle}>Assessment Year {assessmentYear} — MRA</Text>
                    <Text style={{ ...s.subtitle, marginBottom: 20 }}>{companyName}{brn ? ` — BRN: ${brn}` : ''}</Text>
                    <View style={s.sec}>
                      <Text style={s.secTitle}>1. Company Information</Text>
                      <R l="Company Name" v={companyName} /><R l="BRN" v={brn || '—'} /><R l="TAN" v={tan || '—'} />
                      <R l="Address" v={socData?.adresse || '—'} /><R l="Assessment Year" v={assessmentYear} />
                    </View>
                    <View style={s.sec}>
                      <Text style={s.secTitle}>2. Income (MUR)</Text>
                      <R l="Gross Revenue" v={`${f(revenuAffaires)} MUR`} /><R l="Employment Income" v={`${f(revenuEmploi)} MUR`} />
                      <R l="Rental Income" v={`${f(revenuLocatif)} MUR`} /><R l="Interest Income" v={`${f(revenuInterets)} MUR`} />
                      <R l="Dividends" v={`${f(dividendes)} MUR`} /><R l="Other Income" v={`${f(autresRevenus)} MUR`} />
                      <R l="TOTAL INCOME" v={`${f(totalRevenus)} MUR`} />
                    </View>
                    <View style={s.sec}>
                      <Text style={s.secTitle}>3. Deductions (MUR)</Text>
                      <R l="Annual Allowance" v={`${f(annualAllowance)} MUR`} /><R l="Other Deductions" v={`${f(autresDeductions)} MUR`} />
                      <R l="TOTAL DEDUCTIONS" v={`${f(totalDeductions)} MUR`} />
                    </View>
                    <View style={s.sec}>
                      <Text style={s.secTitle}>4. Tax Computation (MUR)</Text>
                      <R l="Chargeable Income" v={`${f(revenuImposable)} MUR`} /><R l="Tax Rate" v={`${tauxIS}%`} />
                      <R l="Income Tax" v={`${f(impotCalcule)} MUR`} /><R l="APS Paid" v={`(${f(apsPayé)}) MUR`} />
                      <R l="CSR (2%)" v={`${f(csrAmount)} MUR`} /><R l="NET TAX DUE" v={`${f(soldeAPayer)} MUR`} />
                    </View>
                    <View style={s.sec}>
                      <Text style={s.secTitle}>5. Declaration</Text>
                      <Text style={{ fontSize: 8, marginBottom: 15, lineHeight: 1.4 }}>I/We declare that the information given in this return is true, correct and complete.</Text>
                      <R l="Name of Director" v="_______________" /><R l="Signature" v="_______________" />
                      <R l="Date" v="_______________" /><R l="Capacity" v="_______________" />
                    </View>
                    <Text style={s.footer}>Prepared by LEXORA — IT Form 3 — MRA — {companyName} (BRN: {brn})</Text>
                  </Page>
                </Document>
              )
              const blob = await pdf(doc).toBlob()
              const url = URL.createObjectURL(blob)
              const link = document.createElement('a')
              link.href = url
              link.download = `IT_Form3_${companyName.replace(/\s+/g, '_')}_${assessmentYear}.pdf`
              document.body.appendChild(link)
              link.click()
              document.body.removeChild(link)
              URL.revokeObjectURL(url)
            } catch (err) {
              console.error('PDF generation error:', err)
              alert(t('mra.itform3.pdf_error', locale))
            }
          }}
          variant="outline"
          className="flex items-center gap-2"
          style={{ borderColor: NAVY, color: NAVY }}
        >
          <Download className="w-4 h-4" />
          {t('mra.itform3.btn_download_pdf', locale)}
        </Button>
      </div>
      </div>
    </ClientPageShell>
  )
}
