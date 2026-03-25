import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, FileText, BarChart3, Shield, Clock, Zap } from "lucide-react"

const features = [
  {
    icon: Users,
    title: "Multi-Role Access",
    description: "Separate dashboards for admins, accountants, and clients with role-specific permissions and views.",
  },
  {
    icon: FileText,
    title: "Document Management",
    description: "Securely upload, organize, and share financial documents between accountants and clients.",
  },
  {
    icon: BarChart3,
    title: "Real-Time Analytics",
    description: "Interactive dashboards with live financial metrics, charts, and customizable reports.",
  },
  {
    icon: Shield,
    title: "Bank-Level Security",
    description: "Enterprise-grade encryption and compliance with SOC 2, GDPR, and financial regulations.",
  },
  {
    icon: Clock,
    title: "Automated Workflows",
    description: "Schedule recurring tasks, automate reminders, and streamline approval processes.",
  },
  {
    icon: Zap,
    title: "Instant Collaboration",
    description: "Real-time updates and notifications keep everyone aligned on financial matters.",
  },
]

export function Features() {
  return (
    <section id="features" className="bg-secondary/30 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Everything you need to manage finances
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Built for accounting professionals who demand efficiency, security, and collaboration.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="border-border/50 bg-card transition-shadow hover:shadow-md">
              <CardHeader>
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
