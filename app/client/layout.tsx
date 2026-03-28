"use client"
import { ClientSidebarFull } from "@/components/layout/ClientSidebarFull"

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <ClientSidebarFull />
      <main className="flex-1 overflow-auto ml-64">{children}</main>
    </div>
  )
}
