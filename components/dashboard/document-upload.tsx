"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Upload, File, X, Camera } from "lucide-react"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"

interface DocumentUploadProps {
  onUpload?: (files: UploadedFile[]) => void
  trigger?: React.ReactNode
}

interface UploadedFile {
  name: string
  size: string
  category: string
}

export function DocumentUpload({ onUpload, trigger }: DocumentUploadProps) {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [category, setCategory] = useState("")
  const [isDragging, setIsDragging] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    setFiles((prev) => [...prev, ...droppedFiles])
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      setFiles((prev) => [...prev, ...selectedFiles])
    }
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B"
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
    return (bytes / (1024 * 1024)).toFixed(1) + " MB"
  }

  const handleUpload = () => {
    if (files.length > 0 && category) {
      const uploadedFiles: UploadedFile[] = files.map((file) => ({
        name: file.name,
        size: formatFileSize(file.size),
        category,
      }))
      onUpload?.(uploadedFiles)
      setFiles([])
      setCategory("")
      setOpen(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2">
            <Upload className="h-4 w-4" />
            Upload Document
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
          <DialogDescription>
            Upload financial documents for your accountant to review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
          >
            <input
              type="file"
              multiple
              onChange={handleFileSelect}
              className="absolute inset-0 cursor-pointer opacity-0"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png"
            />
            <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              Drag and drop files here
            </p>
            <p className="text-xs text-muted-foreground">or click to browse</p>
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Selected files ({files.length})
              </p>
              <div className="max-h-32 space-y-2 overflow-y-auto">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <File className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {file.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => removeFile(index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="category">Document Category</FieldLabel>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoices">Invoices</SelectItem>
                  <SelectItem value="receipts">Receipts</SelectItem>
                  <SelectItem value="bank-statements">Bank Statements</SelectItem>
                  <SelectItem value="tax-documents">Tax Documents</SelectItem>
                  <SelectItem value="contracts">Contracts</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={files.length === 0 || !category}>
            Upload {files.length > 0 && `(${files.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
