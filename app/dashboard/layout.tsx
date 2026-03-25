import { DashboardNav } from "@/components/dashboard/dashboard-nav"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-secondary/20">
      <DashboardNav />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
