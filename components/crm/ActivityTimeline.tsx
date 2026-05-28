"use client"

import {
  StickyNote,
  Mail,
  MailOpen,
  PhoneOutgoing,
  PhoneIncoming,
  Users,
  Linkedin,
  MessageCircle,
  Activity as ActivityIcon,
  ArrowRightLeft,
  Sparkles,
  Download,
  Send,
} from "lucide-react"
import type { CrmActivity, CrmActivityType } from "@/lib/crm/types"
import { Button } from "@/components/ui/button"

const ICONS: Record<CrmActivityType, typeof StickyNote> = {
  note: StickyNote,
  email_sent: Mail,
  email_received: MailOpen,
  call_outbound: PhoneOutgoing,
  call_inbound: PhoneIncoming,
  meeting: Users,
  linkedin_dm: Linkedin,
  whatsapp_msg: MessageCircle,
  status_change: ArrowRightLeft,
  enrichment_run: Sparkles,
  ingest: Download,
  outreach_trigger: Send,
}

const LABELS: Record<CrmActivityType, string> = {
  note: "Note",
  email_sent: "Email envoye",
  email_received: "Email recu",
  call_outbound: "Appel sortant",
  call_inbound: "Appel entrant",
  meeting: "Reunion",
  linkedin_dm: "LinkedIn DM",
  whatsapp_msg: "WhatsApp",
  status_change: "Changement de statut",
  enrichment_run: "Enrichissement IA",
  ingest: "Import",
  outreach_trigger: "Outreach declenche",
}

function relativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = Math.max(0, now - then)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return "a l'instant"
  const min = Math.floor(sec / 60)
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `il y a ${d}j`
  const m = Math.floor(d / 30)
  if (m < 12) return `il y a ${m} mois`
  const y = Math.floor(m / 12)
  return `il y a ${y} an${y > 1 ? "s" : ""}`
}

interface Props {
  activities: CrmActivity[]
  onAddActivity?: () => void
}

export function ActivityTimeline({ activities, onAddActivity }: Props) {
  if (!activities || activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ActivityIcon className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground mb-4">Aucune activite enregistree</p>
        {onAddActivity && (
          <Button size="sm" variant="outline" onClick={onAddActivity}>
            Ajouter une activite
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="relative">
      {onAddActivity && (
        <div className="mb-4 flex justify-end">
          <Button size="sm" variant="outline" onClick={onAddActivity}>
            + Ajouter une activite
          </Button>
        </div>
      )}
      <ol className="relative border-l border-gray-200 ml-4 space-y-6">
        {activities.map((a) => {
          const Icon = ICONS[a.type] ?? StickyNote
          return (
            <li key={a.id} className="ml-6">
              <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-white ring-4 ring-white border border-gray-200">
                <Icon className="h-3 w-3 text-gray-600" />
              </span>
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-sm font-semibold text-gray-900">
                  {a.sujet || LABELS[a.type] || a.type}
                </h4>
                <time className="text-xs text-muted-foreground">{relativeTime(a.created_at)}</time>
              </div>
              <p className="text-xs text-muted-foreground mb-1">{LABELS[a.type] || a.type}{a.direction ? ` · ${a.direction}` : ""}</p>
              {a.contenu && (
                <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">{a.contenu}</p>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
