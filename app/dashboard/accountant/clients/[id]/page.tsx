"use client"

import { useState } from "react"
import { use } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Download, Eye, FileText, File, FileSpreadsheet, CheckCircle2 } from "lucide-react"
import Link from "next/link"
import { DocumentUpload } from "@/components/dashboard/document-upload"

const clientData = {
  id: 1,
  name: "Acme Corp",
  contact: "John Smith",
  email: "john@acme.com",
  phone: "(555) 123-4567",
  address: "123 Business St, New York, NY 10001",
}

const initialDocuments = [
  { id: 1, name: "Invoice_March_2026.pdf", category: "Invoices", size: "245 KB", uploaded: "Mar 22, 2026", status: "Pending" },
  { id: 2, name: "Bank_Statement_Q1.pdf", category: "Bank Statements", size: "1.2 MB", uploaded: "Mar 20, 2026", status: "Pending" },
  { id: 3, name: "Receipt_Office_Supplies.jpg", category: "Receipts", size: "156 KB", uploaded: "Mar 18, 2026", status: "Pending" },
  { id: 4, name: "Tax_Form_W2.pdf", category: "Tax Documents", size: "89 KB", uploaded: "Mar 15, 2026", status: "Reviewed" },
  { id: 5, name: "Vendor_Contract.pdf", category: "Contracts", size: "534 KB", uploaded: "Mar 10, 2026", status: "Reviewed" },
]

const getFileIcon = (fileName: string) => {
  const ext = fileName.split(".").pop()?.toLowerCase()
  if (ext === "pdf") return <FileText className="h-5 w-5 text-destructive" />
  if (["xlsx", "xls", "csv"].includes(ext || "")) return <FileSpreadsheet className="h-5 w-5 text-chart-4" />
  return <File className="h-5 w-5 text-muted-foreground" />
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [documents, setDocuments] = useState(initialDocuments)

  const handleMarkReviewed = (docId: number) => {
    setDocuments(documents.map(doc => 
      doc.id === docId ? { ...doc, status: "Reviewed" } : doc
    ))
  }

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

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <Link
          href="/dashboard/accountant/clients"
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Clients
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{clientData.name}</h1>
            <p className="mt-1 text-muted-foreground">Client ID: {id}</p>
          </div>
          <DocumentUpload onUpload={handleUpload} />
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Contact</p>
            <p className="font-medium text-foreground">{clientData.contact}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="font-medium text-foreground">{clientData.email}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Phone</p>
            <p className="font-medium text-foreground">{clientData.phone}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Documents</p>
            <p className="font-medium text-foreground">{documents.length} total</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>Review and manage client documents</CardDescription>
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
                <TableHead className="w-32">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
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
