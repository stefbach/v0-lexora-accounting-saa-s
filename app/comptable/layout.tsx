import { ComptableSidebar } from "@/components/layout/ComptableSidebar"

export default function ComptableLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <ComptableSidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
