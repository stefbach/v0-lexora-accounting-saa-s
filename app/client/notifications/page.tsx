"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { MessageSquare, Mail, Bell, CheckCircle, AlertCircle, Clock } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"
import { RequireRole, NON_CLIENT_USER_ROLES } from "@/components/client/RequireRole"
import Link from "next/link"
import { t, getLocale } from "@/lib/i18n"

interface NotificationItem {
  id: string
  type: "whatsapp" | "email"
  message: string
  date: string
  statut: "pending" | "sent" | "failed"
}

const notifications: NotificationItem[] = []

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getStatutBadge(statut: string, locale: 'fr' | 'en') {
  switch (statut) {
    case "sent":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200">
          <CheckCircle className="h-3 w-3 mr-1" />
          {t('core.notif.sent', locale)}
        </Badge>
      )
    case "pending":
      return (
        <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
          <Clock className="h-3 w-3 mr-1" />
          {t('core.notif.pending', locale)}
        </Badge>
      )
    case "failed":
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200">
          <AlertCircle className="h-3 w-3 mr-1" />
          {t('core.notif.failed', locale)}
        </Badge>
      )
    default:
      return <Badge variant="secondary">{statut}</Badge>
  }
}

function getTypeIcon(type: "whatsapp" | "email") {
  if (type === "whatsapp") {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
        <MessageSquare className="h-5 w-5 text-green-600" />
      </div>
    )
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100">
      <Mail className="h-5 w-5 text-blue-600" />
    </div>
  )
}

export default function NotificationsPage() {
  const locale = getLocale()
  const { profile } = useProfile()
  const [filter, setFilter] = useState("tous")

  if (profile?.role === "client_user") {
    return <RequireRole roles={NON_CLIENT_USER_ROLES}>{null}</RequireRole>
  }

  const filteredNotifications = notifications.filter((n) => {
    if (filter === "tous") return true
    return n.type === filter
  })

  const totalCount = notifications.length
  const whatsappCount = notifications.filter((n) => n.type === "whatsapp").length
  const emailCount = notifications.filter((n) => n.type === "email").length
  const pendingCount = notifications.filter((n) => n.statut === "pending").length

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>
          {t('core.notif.title', locale)}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('core.notif.subtitle', locale)}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('core.notif.total', locale)}
            </CardTitle>
            <Bell className="h-5 w-5" style={{ color: "#0B0F2E" }} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>
              {totalCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              WhatsApp
            </CardTitle>
            <MessageSquare className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>
              {whatsappCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Email
            </CardTitle>
            <Mail className="h-5 w-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "#0B0F2E" }}>
              {emailCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('core.notif.pending', locale)}
            </CardTitle>
            <Clock className="h-5 w-5" style={{ color: "#D4AF37" }} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "#D4AF37" }}>
              {pendingCount}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notifications List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle style={{ color: "#0B0F2E" }}>{t('core.notif.all_notifications', locale)}</CardTitle>
              <CardDescription>{t('core.notif.filter_by_type', locale)}</CardDescription>
            </div>
            <Tabs value={filter} onValueChange={setFilter}>
              <TabsList>
                <TabsTrigger value="tous">
                  {t('core.notif.tab_all', locale)} ({totalCount})
                </TabsTrigger>
                <TabsTrigger value="whatsapp">
                  WhatsApp ({whatsappCount})
                </TabsTrigger>
                <TabsTrigger value="email">
                  Email ({emailCount})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                className="flex items-start gap-4 rounded-lg border bg-white p-4 transition-colors hover:bg-gray-50"
              >
                {getTypeIcon(notification.type)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 leading-relaxed">
                    {notification.message}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {formatDateTime(notification.date)}
                  </p>
                </div>
                <div className="shrink-0">
                  {getStatutBadge(notification.statut, locale)}
                </div>
              </div>
            ))}
            {filteredNotifications.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Bell className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p>{t('core.notif.no_notifications', locale)}</p>
                <p className="text-xs mt-1">{t('core.notif.appear_here', locale)}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
