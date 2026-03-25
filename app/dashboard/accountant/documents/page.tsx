"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Search, Download, Eye, FileText, File, FileSpreadsheet, CheckCircle2 } from "lucide-react"

const initialDocuments = [
  { id: 1, client: "Acme Corp", name: "Invoice_March_2026.pdf", category: "Invoices", size: "245 KB", uploaded: "Mar 22, 2026", status: "Pending" },
  { id: 2, client: "Acme Corp", name: "Bank_Statement_Q1.pdf", category: "Bank Statements", size: "1.2 MB", uploaded: "Mar 20, 2026", status: "Pending" },
  { id: 3, client: "TechStart Inc", name: "Tax_Form_W2.pdf", category: "Tax Documents", size: "89 KB", uploaded: "Mar 19, 2026", status: "Reviewed" },
  { id: 4, client: "Global Solutions", name: "Expense_Report.xlsx", category: "Receipts", size: "156 KB", uploaded: "Mar 18, 2026", status: "Pending" },
  { id: 5, client: "Local Bakery", name: "Invoice_Feb_2026.pdf", category: "Invoices", size: "234 KB", uploaded: "Mar 17, 2026", status: "Reviewed" },
  { id: 6, client: "Green Energy Co", name: "Contract_Renewal.pdf", category: "Contracts", size: "534 KB", uploaded: "Mar 15, 2026", status: "Pending" },
  { id: 7, client: "Smith & Associates", name: "Payroll_March.xlsx", category: "Tax Documents", size: "78 KB", uploaded: "Mar 14, 2026", status: "Reviewed" },
]

const getFileIcon = (fileName: string) => {
  const ext = fileName.split(".").pop()?.toLowerCase()
  if (ext === "pdf") return <FileText className="h-5 w-5 text-destructive" />
  if (["xlsx", "xls", "csv"].includes(ext || "")) return <FileSpreadsheet className="h-5 w-5 text-chart-4" />
  return <File className="h-5 w-5 text-muted-foreground" />
}

export default function AccountantDocumentsPage() {
  const [documents, setDocuments] = useState(initialDocuments)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      doc.name.toLowerCase().includes(search.toLowerCase()) ||
      doc.client.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === "all" || doc.status.toLowerCase() === statusFilter.toLowerCase()
    return matchesSearch && matchesStatus
  })

  const handleMarkReviewed = (docId: number) => {
    setDocuments(documents.map(doc => 
      doc.id === docId ? { ...doc, status: "Reviewed" } : doc
    ))
  }

  const stats = {
    total: documents.length,
    pending: documents.filter((d) => d.status === "Pending").length,
    reviewed: documents.filter((d) => d.status === "Reviewed").length,
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">All Documents</h1>
        <p className="mt-1 text-muted-foreground">
          Review documents from all your clients.
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-foreground">{stats.total}</div>
            <p className="text-sm text-muted-foreground">Total Documents</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-chart-5">{stats.pending}</div>
            <p className="text-sm text-muted-foreground">Pending Review</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-chart-4">{stats.reviewed}</div>
            <p className="text-sm text-muted-foreground">Reviewed</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Documents</CardTitle>
              <CardDescription>All client documents requiring attention</CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative w-full sm:w-48">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="reviewed">Reviewed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocuments.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {getFileIcon(doc.name)}
                      <span className="font-medium">{doc.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{doc.client}</TableCell>
                  <TableCell className="text-muted-foreground">{doc.category}</TableCell>
                  <TableCell className="text-muted-foreground">{doc.uploaded}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        doc.status === "Reviewed"
                          ? "border-chart-4/30 bg-chart-4/10 text-chart-4"
                          : "border-chart-5/30 bg-chart-5/10 text-chart-5"
                      }
                    >
                      {doc.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" title="View">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Download">
                        <Download className="h-4 w-4" />
                      </Button>
                      {doc.status === "Pending" && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          title="Mark as Reviewed"
                          onClick={() => handleMarkReviewed(doc.id)}
                        >
                          <CheckCircle2 className="h-4 w-4 text-chart-4" />
                        </Button>
                      )}
                    </div>
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
