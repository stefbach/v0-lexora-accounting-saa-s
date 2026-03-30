import { AdminSidebar } from "@/components/layout/AdminSidebar"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 overflow-auto bg-gray-50/50 md:ml-64">
        {children}
      </main>
    </div>
  )
}
