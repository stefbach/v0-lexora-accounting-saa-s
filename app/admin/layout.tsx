import { AdminSidebarUnified } from "@/components/layout/AdminSidebarUnified"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebarUnified />
      <main className="flex-1 overflow-auto bg-gray-50/50 ml-64">
        {children}
      </main>
    </div>
  )
}
