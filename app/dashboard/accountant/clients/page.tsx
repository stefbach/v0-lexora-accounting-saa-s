"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, FileText, Eye, DollarSign, TrendingUp } from "lucide-react"
import Link from "next/link"

const clients = [
  { 
    id: 1, 
    name: "Acme Corp", 
    contact: "John Smith", 
    email: "john@acme.com",
    revenue: "$124,500",
    pendingDocs: 3,
    status: "Active",
    lastActivity: "10 min ago"
  },
  { 
    id: 2, 
    name: "TechStart Inc", 
    contact: "Emily Davis", 
    email: "emily@techstart.com",
    revenue: "$89,200",
    pendingDocs: 0,
    status: "Active",
    lastActivity: "2 hours ago"
  },
  { 
    id: 3, 
    name: "Global Solutions", 
    contact: "Robert Wilson", 
    email: "robert@global.com",
    revenue: "$256,800",
    pendingDocs: 5,
    status: "Pending Review",
    lastActivity: "1 day ago"
  },
  { 
    id: 4, 
    name: "Local Bakery", 
    contact: "Maria Garcia", 
    email: "maria@bakery.com",
    revenue: "$45,300",
    pendingDocs: 2,
    status: "Active",
    lastActivity: "3 hours ago"
  },
  { 
    id: 5, 
    name: "Smith & Associates", 
    contact: "James Smith", 
    email: "james@smithassoc.com",
    revenue: "$178,900",
    pendingDocs: 0,
    status: "Active",
    lastActivity: "5 hours ago"
  },
  { 
    id: 6, 
    name: "Green Energy Co", 
    contact: "Lisa Anderson", 
    email: "lisa@greenenergy.com",
    revenue: "$312,400",
    pendingDocs: 1,
    status: "Active",
    lastActivity: "1 hour ago"
  },
]

export default function AccountantClientsPage() {
  const [search, setSearch] = useState("")

  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(search.toLowerCase()) ||
      client.contact.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">My Clients</h1>
        <p className="mt-1 text-muted-foreground">
          View and manage your assigned clients.
        </p>
      </div>

      <div className="mb-6">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredClients.map((client) => (
          <Card key={client.id} className="transition-shadow hover:shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">{client.name}</CardTitle>
                  <CardDescription>{client.contact}</CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className={
                    client.status === "Active"
                      ? "border-chart-4/30 bg-chart-4/10 text-chart-4"
                      : "border-chart-5/30 bg-chart-5/10 text-chart-5"
                  }
                >
                  {client.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{client.revenue}</p>
                    <p className="text-xs text-muted-foreground">Revenue</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{client.pendingDocs}</p>
                    <p className="text-xs text-muted-foreground">Pending</p>
                  </div>
                </div>
              </div>
              <p className="mb-4 text-xs text-muted-foreground">
                Last activity: {client.lastActivity}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 gap-1" asChild>
                  <Link href={`/dashboard/accountant/clients/${client.id}`}>
                    <Eye className="h-3 w-3" />
                    View
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="flex-1 gap-1" asChild>
                  <Link href={`/dashboard/accountant/clients/${client.id}/financials`}>
                    <TrendingUp className="h-3 w-3" />
                    Financials
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
