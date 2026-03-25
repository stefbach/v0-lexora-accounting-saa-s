"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  LogOut,
  UserCircle,
  Building2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { useState } from "react"

const adminNavItems = [
  { href: "/dashboard/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/admin/users", label: "Users", icon: Users },
  { href: "/dashboard/admin/accountants", label: "Accountants", icon: UserCircle },
  { href: "/dashboard/admin/clients", label: "Clients", icon: Building2 },
  { href: "/dashboard/admin/settings", label: "Settings", icon: Settings },
]

const accountantNavItems = [
  { href: "/dashboard/accountant", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/accountant/clients", label: "My Clients", icon: Building2 },
  { href: "/dashboard/accountant/documents", label: "Documents", icon: FileText },
  { href: "/dashboard/accountant/settings", label: "Settings", icon: Settings },
]

const clientNavItems = [
  { href: "/dashboard/client", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/client/documents", label: "Documents", icon: FileText },
  { href: "/dashboard/client/settings", label: "Settings", icon: Settings },
]

export function DashboardNav() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const isAdmin = pathname.startsWith("/dashboard/admin")
  const isAccountant = pathname.startsWith("/dashboard/accountant")
  const isClient = pathname.startsWith("/dashboard/client")

  const navItems = isAdmin
    ? adminNavItems
    : isAccountant
    ? accountantNavItems
    : isClient
    ? clientNavItems
    : adminNavItems

  const roleLabel = isAdmin ? "Admin" : isAccountant ? "Accountant" : isClient ? "Client" : "Dashboard"

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
              <span className="text-sm font-bold text-sidebar-primary-foreground">L</span>
            </div>
            <span className="text-lg font-semibold text-sidebar-foreground">Lexora</span>
          </Link>
        )}
        {collapsed && (
          <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
            <span className="text-sm font-bold text-sidebar-primary-foreground">L</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {!collapsed && (
          <div className="mb-4 rounded-lg bg-sidebar-accent/50 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wider text-sidebar-foreground/60">
              {roleLabel} Portal
            </p>
          </div>
        )}

        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="border-t border-sidebar-border p-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className="mb-2 w-full justify-center text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {!collapsed && <span className="ml-2">Collapse</span>}
        </Button>
        <Link
          href="/"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
            collapsed && "justify-center"
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </Link>
      </div>
    </aside>
  )
}
