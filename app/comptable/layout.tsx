import { ComptableSidebarNew } from "@/components/layout/ComptableSidebarNew"

export default function ComptableLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <ComptableSidebarNew />
      <main className="flex-1 overflow-auto ml-64">{children}</main>
    </div>
  )
}
