"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Mail, Building2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"

const initialAccountants = [
  { id: 1, name: "Sarah Johnson", email: "sarah@example.com", clients: 24, status: "Active", specialty: "Tax Planning" },
  { id: 2, name: "Michael Chen", email: "michael@example.com", clients: 18, status: "Active", specialty: "Auditing" },
  { id: 3, name: "Jennifer Lee", email: "jennifer@example.com", clients: 31, status: "Active", specialty: "Bookkeeping" },
  { id: 4, name: "David Miller", email: "david@example.com", clients: 12, status: "On Leave", specialty: "Financial Advisory" },
  { id: 5, name: "Amanda White", email: "amanda@example.com", clients: 27, status: "Active", specialty: "Corporate Tax" },
]

export default function AccountantsPage() {
  const [accountants, setAccountants] = useState(initialAccountants)
  const [search, setSearch] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [newAccountant, setNewAccountant] = useState({ name: "", email: "", specialty: "" })

  const filteredAccountants = accountants.filter(
    (acc) =>
      acc.name.toLowerCase().includes(search.toLowerCase()) ||
      acc.email.toLowerCase().includes(search.toLowerCase())
  )

  const handleAddAccountant = () => {
    if (newAccountant.name && newAccountant.email) {
      setAccountants([
        ...accountants,
        {
          id: accountants.length + 1,
          ...newAccountant,
          clients: 0,
          status: "Active",
        },
      ])
      setNewAccountant({ name: "", email: "", specialty: "" })
      setIsDialogOpen(false)
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Accountants</h1>
          <p className="mt-1 text-muted-foreground">
            Manage your accounting professionals.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Accountant
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Accountant</DialogTitle>
              <DialogDescription>
                Add a new accountant to your organization.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">Full Name</FieldLabel>
                <Input
                  id="name"
                  value={newAccountant.name}
                  onChange={(e) => setNewAccountant({ ...newAccountant, name: e.target.value })}
                  placeholder="Enter full name"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  value={newAccountant.email}
                  onChange={(e) => setNewAccountant({ ...newAccountant, email: e.target.value })}
                  placeholder="Enter email address"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="specialty">Specialty</FieldLabel>
                <Input
                  id="specialty"
                  value={newAccountant.specialty}
                  onChange={(e) => setNewAccountant({ ...newAccountant, specialty: e.target.value })}
                  placeholder="e.g., Tax Planning, Auditing"
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddAccountant}>Add Accountant</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-6">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search accountants..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredAccountants.map((accountant) => (
          <Card key={accountant.id} className="transition-shadow hover:shadow-md">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {accountant.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-base">{accountant.name}</CardTitle>
                    <CardDescription className="text-sm">{accountant.specialty}</CardDescription>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    accountant.status === "Active"
                      ? "border-chart-4/30 bg-chart-4/10 text-chart-4"
                      : "border-chart-5/30 bg-chart-5/10 text-chart-5"
                  }
                >
                  {accountant.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>{accountant.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  <span>{accountant.clients} clients assigned</span>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  View Profile
                </Button>
                <Button variant="outline" size="sm" className="flex-1">
                  Assign Clients
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
