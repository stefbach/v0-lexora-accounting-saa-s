import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, DollarSign, TrendingUp, Calendar, ArrowUpRight, ArrowDownRight } from "lucide-react"

const financialStats = [
  {
    title: "Total Revenue",
    value: "$124,500",
    change: "+12.5%",
    trend: "up",
    icon: DollarSign,
    description: "vs last month",
  },
  {
    title: "Expenses",
    value: "$45,230",
    change: "+8.2%",
    trend: "up",
    icon: TrendingUp,
    description: "vs last month",
  },
  {
    title: "Documents",
    value: "67",
    change: "+5",
    trend: "up",
    icon: FileText,
    description: "this month",
  },
  {
    title: "Next Filing",
    value: "Apr 15",
    change: "21 days",
    trend: "neutral",
    icon: Calendar,
    description: "Q1 Tax Return",
  },
]

const recentTransactions = [
  { description: "Invoice #1234 - Client Payment", amount: "+$5,400", date: "Mar 22", type: "income" },
  { description: "Office Supplies", amount: "-$245", date: "Mar 21", type: "expense" },
  { description: "Software Subscription", amount: "-$99", date: "Mar 20", type: "expense" },
  { description: "Invoice #1233 - Client Payment", amount: "+$3,200", date: "Mar 18", type: "income" },
  { description: "Marketing Services", amount: "-$1,500", date: "Mar 15", type: "expense" },
]

const upcomingDeadlines = [
  { title: "Q1 Tax Filing", date: "Apr 15, 2026", status: "Upcoming" },
  { title: "Monthly Bookkeeping", date: "Mar 31, 2026", status: "Due Soon" },
  { title: "Payroll Processing", date: "Mar 28, 2026", status: "Due Soon" },
]

export default function ClientDashboard() {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Welcome back, Acme Corp</h1>
        <p className="mt-1 text-muted-foreground">
          Here&apos;s an overview of your financial status.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {financialStats.map((stat) => (
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
                  <ArrowUpRight className="h-3 w-3 text-chart-4" />
                ) : stat.trend === "down" ? (
                  <ArrowDownRight className="h-3 w-3 text-destructive" />
                ) : null}
                <span
                  className={
                    stat.trend === "up"
                      ? "text-chart-4"
                      : stat.trend === "down"
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }
                >
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
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>Your latest financial activity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentTransactions.map((transaction, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between border-b border-border pb-4 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {transaction.description}
                    </p>
                    <p className="text-xs text-muted-foreground">{transaction.date}</p>
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      transaction.type === "income" ? "text-chart-4" : "text-foreground"
                    }`}
                  >
                    {transaction.amount}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Deadlines</CardTitle>
            <CardDescription>Important dates to remember</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {upcomingDeadlines.map((deadline, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between border-b border-border pb-4 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{deadline.title}</p>
                    <p className="text-xs text-muted-foreground">{deadline.date}</p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      deadline.status === "Due Soon"
                        ? "bg-chart-5/10 text-chart-5"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {deadline.status}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Your Accountant</CardTitle>
            <CardDescription>Contact information for your assigned accountant</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <span className="text-lg font-semibold text-primary">SJ</span>
              </div>
              <div>
                <p className="font-medium text-foreground">Sarah Johnson</p>
                <p className="text-sm text-muted-foreground">sarah@lexora.com</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
