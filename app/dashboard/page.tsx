import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Shield, UserCircle, Building2, ArrowRight } from "lucide-react"
import Link from "next/link"

const roles = [
  {
    title: "Admin",
    description: "Manage users, accountants, and clients across your organization.",
    icon: Shield,
    href: "/dashboard/admin",
    features: ["User management", "Accountant assignments", "Organization settings"],
  },
  {
    title: "Accountant",
    description: "View and manage your assigned clients and their financial documents.",
    icon: UserCircle,
    href: "/dashboard/accountant",
    features: ["Client overview", "Document review", "Financial reporting"],
  },
  {
    title: "Client",
    description: "Access your financial dashboard and upload documents for review.",
    icon: Building2,
    href: "/dashboard/client",
    features: ["Financial overview", "Document uploads", "Deadline tracking"],
  },
]

export default function DashboardPage() {
  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-foreground">Welcome to Lexora</h1>
          <p className="mt-2 text-muted-foreground">
            Select your role to access the appropriate dashboard.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {roles.map((role) => (
            <Link key={role.title} href={role.href}>
              <Card className="h-full transition-all hover:border-primary/50 hover:shadow-lg">
                <CardHeader>
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <role.icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="flex items-center justify-between">
                    {role.title}
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </CardTitle>
                  <CardDescription>{role.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {role.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          For demo purposes, all roles are accessible. In production, users would be
          automatically directed to their assigned role.
        </p>
      </div>
    </div>
  )
}
