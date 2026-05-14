"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ClipboardList, CheckCircle, XCircle, Clock, Users, MapPin, CreditCard, Calendar,
  ArrowRight, Loader2, Filter
} from "lucide-react"
import { t, getLocale, type Locale } from '@/lib/i18n'

const NAVY = "#0B0F2E"
const GOLD = "#D4AF37"

type RequestType = "address_update" | "bank_update" | "leave_request"
type RequestStatus = "pending" | "approved" | "rejected"

interface HRRequest {
  id: string
  employeeName: string
  date: string
  type: RequestType
  details: string
  oldValue?: string
  newValue?: string
  leaveType?: string
  leaveDates?: string
  leaveDays?: number
  status: RequestStatus
}

const TYPE_ICONS: Record<RequestType, React.ComponentType<{ className?: string }>> = {
  address_update: MapPin,
  bank_update: CreditCard,
  leave_request: Calendar,
}

export default function DemandesRHPage() {
  const locale = getLocale()
  const TYPE_LABELS: Record<RequestType, string> = {
    address_update: t('hr.demandes.type_address', locale),
    bank_update: t('hr.demandes.type_bank', locale),
    leave_request: t('hr.demandes.type_leave', locale),
  }
  const STATUS_CONFIG: Record<RequestStatus, { label: string; color: string; bg: string }> = {
    pending: { label: t('hr.demandes.status_pending', locale), color: "text-amber-700", bg: "bg-amber-100" },
    approved: { label: t('hr.demandes.status_approved', locale), color: "text-green-700", bg: "bg-green-100" },
    rejected: { label: t('hr.demandes.status_rejected', locale), color: "text-red-700", bg: "bg-red-100" },
  }
  const [requests, setRequests] = useState<HRRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("all")

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        // Load real leave requests from conges API
        const congesRes = await fetch("/api/rh/conges?statut=en_attente")
        const congesJson = await congesRes.json()
        const conges = congesJson.conges || []

        const leaveRequests: HRRequest[] = conges.map((c: any, i: number) => ({
          id: c.id || `leave-${i}`,
          employeeName: c.employe ? `${c.employe.nom || ""} ${c.employe.prenom || ""}`.trim() : `Employe ${i + 1}`,
          date: c.created_at ? new Date(c.created_at).toLocaleDateString("fr-FR") : new Date().toLocaleDateString("fr-FR"),
          type: "leave_request" as RequestType,
          details: `${c.type_conge || "Conge annuel"}: ${c.date_debut || "---"} au ${c.date_fin || "---"}`,
          leaveType: c.type_conge || "Conge annuel",
          leaveDates: `${c.date_debut || "---"} au ${c.date_fin || "---"}`,
          leaveDays: c.nb_jours || 1,
          status: c.statut === "approuve" ? "approved" as RequestStatus : c.statut === "refuse" ? "rejected" as RequestStatus : "pending" as RequestStatus,
        }))

        // Mock address/bank update requests for demonstration
        const mockRequests: HRRequest[] = [
          {
            id: "addr-001",
            employeeName: "Ramkissoon Priya",
            date: "25/03/2026",
            type: "address_update",
            details: "Changement d'adresse de residence",
            oldValue: "12 Rue des Fleurs, Rose Hill",
            newValue: "45 Avenue du Jardin, Quatre Bornes",
            status: "pending",
          },
          {
            id: "bank-001",
            employeeName: "Doorgakant Avinash",
            date: "22/03/2026",
            type: "bank_update",
            details: "Changement de compte bancaire",
            oldValue: "MCB - 000123456789",
            newValue: "SBM - 000987654321",
            status: "pending",
          },
          {
            id: "addr-002",
            employeeName: "Lutchmun Sheila",
            date: "18/03/2026",
            type: "address_update",
            details: "Changement d'adresse",
            oldValue: "7 Impasse Labourdonnais, Curepipe",
            newValue: "22 Rue Sivananda, Vacoas",
            status: "approved",
          },
          {
            id: "bank-002",
            employeeName: "Doobun Rajiv",
            date: "15/03/2026",
            type: "bank_update",
            details: "Mise a jour compte bancaire",
            oldValue: "SBM - 000456789123",
            newValue: "MCB - 000321654987",
            status: "rejected",
          },
        ]

        setRequests([...leaveRequests, ...mockRequests])
      } catch {
        // Fallback to mock only
        setRequests([
          {
            id: "addr-001",
            employeeName: "Ramkissoon Priya",
            date: "25/03/2026",
            type: "address_update",
            details: "Changement d'adresse de residence",
            oldValue: "12 Rue des Fleurs, Rose Hill",
            newValue: "45 Avenue du Jardin, Quatre Bornes",
            status: "pending",
          },
          {
            id: "bank-001",
            employeeName: "Doorgakant Avinash",
            date: "22/03/2026",
            type: "bank_update",
            details: "Changement de compte bancaire",
            oldValue: "MCB - 000123456789",
            newValue: "SBM - 000987654321",
            status: "pending",
          },
          {
            id: "leave-mock-1",
            employeeName: "Bheekhoo Neeta",
            date: "20/03/2026",
            type: "leave_request",
            details: "Conge annuel: 01/04/2026 au 05/04/2026",
            leaveType: "Conge annuel",
            leaveDates: "01/04/2026 au 05/04/2026",
            leaveDays: 5,
            status: "pending",
          },
        ])
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const handleAction = (id: string, action: "approved" | "rejected") => {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status: action } : r))
  }

  const filtered = requests.filter(r => {
    if (filterType !== "all" && r.type !== filterType) return false
    if (filterStatus !== "all" && r.status !== filterStatus) return false
    return true
  })

  const pendingCount = requests.filter(r => r.status === "pending").length

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: NAVY }}>{t('hr.demandes.title', locale)}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('hr.demandes.subtitle', locale)}</p>
        </div>
        {pendingCount > 0 && (
          <Badge className="text-sm px-3 py-1" style={{ backgroundColor: GOLD, color: NAVY }}>
            {pendingCount} {t('hr.demandes.pending_count', locale)}
          </Badge>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t('hr.demandes.kpi_total', locale), value: String(requests.length), icon: ClipboardList, color: "text-blue-600", bg: "bg-blue-50" },
          { label: t('hr.demandes.kpi_pending', locale), value: String(pendingCount), icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
          { label: t('hr.demandes.kpi_approved', locale), value: String(requests.filter(r => r.status === "approved").length), icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
          { label: t('hr.demandes.kpi_rejected', locale), value: String(requests.filter(r => r.status === "rejected").length), icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
        ].map(k => (
          <Card key={k.label} className="border border-gray-200">
            <CardContent className="p-4 overflow-x-auto">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg ${k.bg} flex items-center justify-center`}>
                  <k.icon className={`w-4 h-4 ${k.color}`} />
                </div>
              </div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{k.label}</p>
              <p className="text-xl font-bold mt-0.5" style={{ color: NAVY }}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Filter className="w-4 h-4 text-gray-400" />
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[200px] h-9">
            <SelectValue placeholder={t('hr.demandes.filter_type_ph', locale)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('hr.demandes.all_types', locale)}</SelectItem>
            <SelectItem value="address_update">{t('hr.demandes.type_address', locale)}</SelectItem>
            <SelectItem value="bank_update">{t('hr.demandes.type_bank', locale)}</SelectItem>
            <SelectItem value="leave_request">{t('hr.demandes.type_leave', locale)}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[200px] h-9">
            <SelectValue placeholder={t('hr.demandes.status', locale)} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('hr.demandes.all_statuses', locale)}</SelectItem>
            <SelectItem value="pending">{t('hr.demandes.status_pending', locale)}</SelectItem>
            <SelectItem value="approved">{t('hr.demandes.status_approved', locale)}</SelectItem>
            <SelectItem value="rejected">{t('hr.demandes.status_rejected', locale)}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Requests Table */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold" style={{ color: NAVY }}>
            {t('hr.demandes.requests', locale)} ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: GOLD }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t('hr.demandes.no_requests', locale)}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('hr.demandes.employee', locale)}</TableHead>
                  <TableHead>{t('hr.demandes.date', locale)}</TableHead>
                  <TableHead>{t('hr.demandes.type', locale)}</TableHead>
                  <TableHead>{t('hr.demandes.details', locale)}</TableHead>
                  <TableHead>{t('hr.demandes.status', locale)}</TableHead>
                  <TableHead>{t('hr.demandes.actions', locale)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => {
                  const TypeIcon = TYPE_ICONS[r.type]
                  const statusCfg = STATUS_CONFIG[r.status]
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.employeeName}</TableCell>
                      <TableCell className="text-sm text-gray-500">{r.date}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <TypeIcon className="w-4 h-4 text-gray-400" />
                          <span className="text-sm">{TYPE_LABELS[r.type]}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[300px]">
                        {r.type === "leave_request" ? (
                          <div className="text-sm">
                            <p>{r.leaveType}: {r.leaveDates}</p>
                            <p className="text-xs text-gray-400">{r.leaveDays} {t('hr.demandes.days', locale)}</p>
                          </div>
                        ) : (
                          <div className="text-sm">
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400 text-xs line-through">{r.oldValue}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <ArrowRight className="w-3 h-3 text-gray-300" />
                              <span className="text-xs font-medium">{r.newValue}</span>
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${statusCfg.bg} ${statusCfg.color} text-xs`}>
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r.status === "pending" ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleAction(r.id, "approved")}
                              className="h-8 px-2 hover:bg-green-50"
                              title={t('hr.demandes.approve', locale)}
                            >
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleAction(r.id, "rejected")}
                              className="h-8 px-2 hover:bg-red-50"
                              title={t('hr.demandes.reject', locale)}
                            >
                              <XCircle className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">---</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
