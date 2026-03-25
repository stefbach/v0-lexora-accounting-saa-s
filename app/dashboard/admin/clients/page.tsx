"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, MoreHorizontal } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"

const initialClients = [
  { id: 1, company: "Acme Corp", contact: "John Smith", email: "john@acme.com", accountant: "Sarah Johnson", status: "Active", documents: 45 },
  { id: 2, company: "TechStart Inc", contact: "Emily Davis", email: "emily@techstart.com", accountant: "Michael Chen", status: "Active", documents: 32 },
  { id: 3, company: "Global Solutions", contact: "Robert Wilson", email: "robert@global.com", accountant: "Jennifer Lee", status: "Pending Review", documents: 18 },
  { id: 4, company: "Local Bakery", contact: "Maria Garcia", email: "maria@bakery.com", accountant: "Sarah Johnson", status: "Active", documents: 67 },
  { id: 5, company: "Smith & Associates", contact: "James Smith", email: "james@smithassoc.com", accountant: "Amanda White", status: "Active", documents: 24 },
  { id: 6, company: "Green Energy Co", contact: "Lisa Anderson", email: "lisa@greenenergy.com", accountant: "Michael Chen", status: "Inactive", documents: 12 },
]

const accountants = ["Sarah Johnson", "Michael Chen", "Jennifer Lee", "David Miller", "Amanda White"]

export default function ClientsPage() {
  const [clients, setClients] = useState(initialClients)
  const [search, setSearch] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [newClient, setNewClient] = useState({
    company: "",
    contact: "",
    email: "",
    accountant: "",
  })

  const filteredClients = clients.filter(
    (client) =>
      client.company.toLowerCase().includes(search.toLowerCase()) ||
      client.contact.toLowerCase().includes(search.toLowerCase()) ||
      client.email.toLowerCase().includes(search.toLowerCase())
  )

  const handleAddClient = () => {
    if (newClient.company && newClient.contact && newClient.email) {
      setClients([
        ...clients,
        {
          id: clients.length + 1,
          ...newClient,
          status: "Pending Review",
          documents: 0,
        },
      ])
      setNewClient({ company: "", contact: "", email: "", accountant: "" })
      setIsDialogOpen(false)
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clients</h1>
          <p className="mt-1 text-muted-foreground">
            Manage client accounts and their assigned accountants.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Client
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
              <DialogDescription>
                Create a new client account and assign an accountant.
              </DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="company">Company Name</FieldLabel>
                <Input
                  id="company"
                  value={newClient.company}
                  onChange={(e) => setNewClient({ ...newClient, company: e.target.value })}
                  placeholder="Enter company name"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="contact">Contact Person</FieldLabel>
                <Input
                  id="contact"
                  value={newClient.contact}
                  onChange={(e) => setNewClient({ ...newClient, contact: e.target.value })}
                  placeholder="Enter contact name"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  value={newClient.email}
                  onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                  placeholder="Enter email address"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="accountant">Assigned Accountant</FieldLabel>
                <Select
                  value={newClient.accountant}
                  onValueChange={(value) => setNewClient({ ...newClient, accountant: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an accountant" />
                  </SelectTrigger>
                  <SelectContent>
                    {accountants.map((acc) => (
                      <SelectItem key={acc} value={acc}>
                        {acc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddClient}>Add Client</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>All Clients</CardTitle>
              <CardDescription>{clients.length} total clients</CardDescription>
            </div>
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
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Accountant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Documents</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.company}</TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm">{client.contact}</p>
                      <p className="text-xs text-muted-foreground">{client.email}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{client.accountant}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        client.status === "Active"
                          ? "border-chart-4/30 bg-chart-4/10 text-chart-4"
                          : client.status === "Pending Review"
                          ? "border-chart-5/30 bg-chart-5/10 text-chart-5"
                          : "border-muted-foreground/30 bg-muted text-muted-foreground"
                      }
                    >
                      {client.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{client.documents}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>View Dashboard</DropdownMenuItem>
                        <DropdownMenuItem>Edit</DropdownMenuItem>
                        <DropdownMenuItem>Reassign Accountant</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
