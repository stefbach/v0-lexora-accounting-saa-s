"use client"

import { ClientSidebar } from "@/components/layout/ClientSidebar"

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <ClientSidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
