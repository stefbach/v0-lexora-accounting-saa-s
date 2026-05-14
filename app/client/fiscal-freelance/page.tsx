"use client"

import Link from "next/link"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileText, CalendarClock, AlertTriangle, CheckCircle } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"
import { RequireRole, NON_CLIENT_USER_ROLES } from "@/components/client/RequireRole"
import { t, getLocale, type Locale } from "@/lib/i18n"

export default function FiscalFreelancePage() {
  const locale = getLocale()
  const { profile } = useProfile()

  if (profile?.role === "client_user") {
    return <RequireRole roles={NON_CLIENT_USER_ROLES}>{null}</RequireRole>
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>
          {t('mra.freelance.title', locale)}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('mra.freelance.subtitle', locale)}
        </p>
      </div>

      {/* Déclaration annuelle */}
      <Card className="border-2" style={{ borderColor: "#D4AF37" }}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "#D4AF3720" }}>
              <FileText className="h-5 w-5" style={{ color: "#D4AF37" }} />
            </div>
            <div>
              <CardTitle style={{ color: "#0B0F2E" }}>{t('mra.freelance.annual_title', locale)}</CardTitle>
              <Badge className="bg-green-100 text-green-700 border-green-200 mt-1">
                <CheckCircle className="h-3 w-3 mr-1" />
                {t('mra.freelance.handled_by_accountant', locale)}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg p-4" style={{ backgroundColor: "#0B0F2E08" }}>
            <p className="text-sm" style={{ color: "#0B0F2E" }}>
              {t('mra.freelance.annual_text_prefix', locale)}
              <strong>{t('mra.freelance.deadline_date', locale)}</strong>{t('mra.freelance.annual_text_suffix', locale)}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <CalendarClock className="h-5 w-5" style={{ color: "#0B0F2E" }} />
            <div>
              <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>{t('mra.freelance.deadline_label', locale)}</p>
              <p className="text-sm text-muted-foreground">{t('mra.freelance.deadline_date', locale)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-sm font-medium" style={{ color: "#0B0F2E" }}>{t('mra.freelance.status_label', locale)}</p>
              <p className="text-sm text-muted-foreground">
                {t('mra.freelance.status_value', locale)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Seuil VAT */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5" style={{ color: "#D4AF37" }} />
            <CardTitle style={{ color: "#0B0F2E" }}>{t('mra.freelance.vat_title', locale)}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 bg-yellow-50/50">
            <p className="text-sm" style={{ color: "#0B0F2E" }}>
              <strong>{t('mra.freelance.vat_threshold_strong', locale)}</strong>
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              {t('mra.freelance.vat_text', locale)}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="py-4">
                <p className="text-sm text-muted-foreground">{t('mra.freelance.estimated_revenue', locale)}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "#0B0F2E" }}>
                  3 360 000 MUR
                </p>
                <Badge className="bg-green-100 text-green-700 border-green-200 mt-2">
                  {t('mra.freelance.below_threshold', locale)}
                </Badge>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4">
                <p className="text-sm text-muted-foreground">{t('mra.freelance.vat_threshold', locale)}</p>
                <p className="text-2xl font-bold mt-1" style={{ color: "#0B0F2E" }}>
                  6 000 000 MUR
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {t('mra.freelance.not_required', locale)}
                </p>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">
            {t('mra.freelance.indicative_note', locale)}
          </p>
        </CardContent>
      </Card>

      {/* Rappel simple */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm" style={{ color: "#0B0F2E" }}>
            {t('mra.freelance.remember_title', locale)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                {t('mra.freelance.tip1', locale)}
              </p>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                {t('mra.freelance.tip2', locale)}
              </p>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                {t('mra.freelance.tip3', locale)}
              </p>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
