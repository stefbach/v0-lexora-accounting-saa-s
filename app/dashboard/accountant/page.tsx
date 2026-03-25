import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Building2, FileText, Clock, CheckCircle2 } from "lucide-react"
import Link from "next/link"

const stats = [
  {
    title: "Active Clients",
    value: "24",
    icon: Building2,
    description: "clients assigned",
  },
  {
    title: "Pending Reviews",
    value: "12",
    icon: Clock,
    description: "documents to review",
  },
  {
    title: "Completed This Week",
    value: "18",
    icon: CheckCircle2,
    description: "reviews completed",
  },
  {
    title: "Total Documents",
    value: "456",
    icon: FileText,
    description: "across all clients",
  },
]

const clientsNeedingAttention = [
  { name: "Acme Corp", issue: "3 new documents pending review", priority: "high" },
  { name: "TechStart Inc", issue: "Q1 tax filing due in 5 days", priority: "high" },
  { name: "Global Solutions", issue: "Missing bank statements", priority: "medium" },
  { name: "Local Bakery", issue: "2 invoices need verification", priority: "low" },
]

const recentActivity = [
  { client: "Acme Corp", action: "Uploaded Invoice_March.pdf", time: "10 min ago" },
  { client: "Smith & Associates", action: "Reviewed Q4 Tax Report", time: "1 hour ago" },
  { client: "Green Energy Co", action: "Requested bank statements", time: "2 hours ago" },
  { client: "TechStart Inc", action: "Completed payroll review", time: "3 hours ago" },
]

export default function AccountantDashboard() {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Welcome back, Sarah</h1>
        <p className="mt-1 text-muted-foreground">
          Here&apos;s what needs your attention today.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Clients Needing Attention</CardTitle>
            <CardDescription>Priority tasks for your clients</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {clientsNeedingAttention.map((client, index) => (
                <Link
                  key={index}
                  href="/dashboard/accountant/clients"
                  className="flex items-start justify-between rounded-lg border border-border p-3 transition-colors hover:bg-secondary/50"
                >
                  <div>
                    <p className="font-medium text-foreground">{client.name}</p>
                    <p className="text-sm text-muted-foreground">{client.issue}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      client.priority === "high"
                        ? "bg-destructive/10 text-destructive"
                        : client.priority === "medium"
                        ? "bg-chart-5/10 text-chart-5"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {client.priority}
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest updates from your clients</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity, index) => (
                <div
                  key={index}
                  className="flex items-start justify-between border-b border-border pb-4 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{activity.client}</p>
                    <p className="text-sm text-muted-foreground">{activity.action}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{activity.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
