import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, UserCircle, Building2, FileText, TrendingUp, TrendingDown } from "lucide-react"

const stats = [
  {
    title: "Total Users",
    value: "1,247",
    change: "+12%",
    trend: "up",
    icon: Users,
    description: "from last month",
  },
  {
    title: "Accountants",
    value: "84",
    change: "+3",
    trend: "up",
    icon: UserCircle,
    description: "active this month",
  },
  {
    title: "Clients",
    value: "1,163",
    change: "+8%",
    trend: "up",
    icon: Building2,
    description: "from last month",
  },
  {
    title: "Documents",
    value: "15,420",
    change: "+234",
    trend: "up",
    icon: FileText,
    description: "uploaded this month",
  },
]

const recentActivity = [
  { user: "John Smith", action: "created a new client account", time: "2 minutes ago", type: "create" },
  { user: "Sarah Johnson", action: "uploaded 5 documents", time: "15 minutes ago", type: "upload" },
  { user: "Michael Chen", action: "approved client verification", time: "1 hour ago", type: "approve" },
  { user: "Emily Davis", action: "updated billing information", time: "2 hours ago", type: "update" },
  { user: "Robert Wilson", action: "added new accountant", time: "3 hours ago", type: "create" },
]

export default function AdminDashboard() {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Overview of your organization's activity and metrics.
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
              <div className="mt-1 flex items-center gap-1 text-xs">
                {stat.trend === "up" ? (
                  <TrendingUp className="h-3 w-3 text-chart-4" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-destructive" />
                )}
                <span className={stat.trend === "up" ? "text-chart-4" : "text-destructive"}>
                  {stat.change}
                </span>
                <span className="text-muted-foreground">{stat.description}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest actions across your organization</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity, index) => (
                <div
                  key={index}
                  className="flex items-start justify-between border-b border-border pb-4 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {activity.user}
                    </p>
                    <p className="text-sm text-muted-foreground">{activity.action}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{activity.time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common administrative tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <QuickActionButton label="Add New User" href="/dashboard/admin/users" />
              <QuickActionButton label="Add Accountant" href="/dashboard/admin/accountants" />
              <QuickActionButton label="Add Client" href="/dashboard/admin/clients" />
              <QuickActionButton label="View Reports" href="/dashboard/admin" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function QuickActionButton({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      className="flex items-center justify-center rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
    >
      {label}
    </a>
  )
}
