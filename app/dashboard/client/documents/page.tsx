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
import { Badge } from "@/components/ui/badge"
import { Search, Download, Eye, FileText, File, FileSpreadsheet } from "lucide-react"
import { DocumentUpload } from "@/components/dashboard/document-upload"

const initialDocuments = [
  { id: 1, name: "Invoice_March_2026.pdf", category: "Invoices", size: "245 KB", uploaded: "Mar 22, 2026", status: "Reviewed" },
  { id: 2, name: "Bank_Statement_Q1.pdf", category: "Bank Statements", size: "1.2 MB", uploaded: "Mar 20, 2026", status: "Pending" },
  { id: 3, name: "Receipt_Office_Supplies.jpg", category: "Receipts", size: "156 KB", uploaded: "Mar 18, 2026", status: "Reviewed" },
  { id: 4, name: "Tax_Form_W2.pdf", category: "Tax Documents", size: "89 KB", uploaded: "Mar 15, 2026", status: "Reviewed" },
  { id: 5, name: "Vendor_Contract.pdf", category: "Contracts", size: "534 KB", uploaded: "Mar 10, 2026", status: "Pending" },
  { id: 6, name: "Expense_Report_Feb.xlsx", category: "Receipts", size: "78 KB", uploaded: "Mar 5, 2026", status: "Reviewed" },
]

const getFileIcon = (fileName: string) => {
  const ext = fileName.split(".").pop()?.toLowerCase()
  if (ext === "pdf") return <FileText className="h-5 w-5 text-destructive" />
  if (["xlsx", "xls", "csv"].includes(ext || "")) return <FileSpreadsheet className="h-5 w-5 text-chart-4" />
  return <File className="h-5 w-5 text-muted-foreground" />
}

export default function ClientDocumentsPage() {
  const [documents, setDocuments] = useState(initialDocuments)
  const [search, setSearch] = useState("")

  const filteredDocuments = documents.filter(
    (doc) =>
      doc.name.toLowerCase().includes(search.toLowerCase()) ||
      doc.category.toLowerCase().includes(search.toLowerCase())
  )

  const handleUpload = (files: { name: string; size: string; category: string }[]) => {
    const newDocs = files.map((file, index) => ({
      id: documents.length + index + 1,
      name: file.name,
      category: file.category.charAt(0).toUpperCase() + file.category.slice(1).replace("-", " "),
      size: file.size,
      uploaded: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      status: "Pending" as const,
    }))
    setDocuments([...newDocs, ...documents])
  }

  const stats = {
    total: documents.length,
    reviewed: documents.filter((d) => d.status === "Reviewed").length,
    pending: documents.filter((d) => d.status === "Pending").length,
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Documents</h1>
          <p className="mt-1 text-muted-foreground">
            Upload and manage your financial documents.
          </p>
        </div>
        <DocumentUpload onUpload={handleUpload} />
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
            <div className="text-2xl font-bold text-chart-4">{stats.reviewed}</div>
            <p className="text-sm text-muted-foreground">Reviewed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-chart-5">{stats.pending}</div>
            <p className="text-sm text-muted-foreground">Pending Review</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>All Documents</CardTitle>
              <CardDescription>View and manage your uploaded documents</CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
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
                <TableHead>Document</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
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
                  <TableCell className="text-muted-foreground">{doc.category}</TableCell>
                  <TableCell className="text-muted-foreground">{doc.size}</TableCell>
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
