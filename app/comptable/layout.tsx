import { AdminSidebarUnified } from "@/components/layout/AdminSidebarUnified"

export default function ComptableLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebarUnified />
      <main className="flex-1 overflow-auto ml-64">{children}</main>
    </div>
  )
}
