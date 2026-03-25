"use client"

import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from "react"
import { cn } from "@/lib/utils"
import { Upload, File, X, FileText, Image, Table2 } from "lucide-react"

interface UploadZoneProps {
  onUpload?: (files: File[]) => void
  accept?: string[]
  maxSize?: number
}

const DEFAULT_ACCEPT = [".pdf", ".jpeg", ".jpg", ".png", ".xlsx"]
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024 // 10 MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function getFileIcon(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "pdf":
      return FileText
    case "jpeg":
    case "jpg":
    case "png":
      return Image
    case "xlsx":
    case "xls":
      return Table2
    default:
      return File
  }
}

export function UploadZone({
  onUpload,
  accept = DEFAULT_ACCEPT,
  maxSize = DEFAULT_MAX_SIZE,
}: UploadZoneProps) {
  const [files, setFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const validateFiles = useCallback(
    (fileList: File[]): File[] => {
      const valid: File[] = []
      for (const file of fileList) {
        const ext = "." + file.name.split(".").pop()?.toLowerCase()
        if (!accept.includes(ext) && !accept.includes(ext.replace(".", ""))) {
          setError(`Format non supporté : ${file.name}`)
          continue
        }
        if (file.size > maxSize) {
          setError(
            `Fichier trop volumineux : ${file.name} (${formatFileSize(file.size)}). Maximum : ${formatFileSize(maxSize)}`
          )
          continue
        }
        valid.push(file)
      }
      return valid
    },
    [accept, maxSize]
  )

  const addFiles = useCallback(
    (newFiles: File[]) => {
      setError(null)
      const validated = validateFiles(newFiles)
      if (validated.length > 0) {
        setFiles((prev) => [...prev, ...validated])
      }
    },
    [validateFiles]
  )

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      const droppedFiles = Array.from(e.dataTransfer.files)
      addFiles(droppedFiles)
    },
    [addFiles]
  )

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        addFiles(Array.from(e.target.files))
        e.target.value = ""
      }
    },
    [addFiles]
  )

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleUpload = useCallback(() => {
    if (files.length > 0 && onUpload) {
      onUpload(files)
      setFiles([])
    }
  }, [files, onUpload])

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors",
          isDragging
            ? "border-amber-500 bg-amber-50"
            : "border-muted-foreground/25 hover:border-amber-500/50 hover:bg-muted/50"
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Upload className="h-6 w-6" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium">
            Glissez-déposez vos fichiers ici
          </p>
          <p className="text-xs text-muted-foreground">
            ou cliquez pour parcourir
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          PDF, JPEG, PNG, XLSX — Max {formatFileSize(maxSize)}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept.join(",")}
          onChange={handleInputChange}
          className="hidden"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {files.length} fichier{files.length > 1 ? "s" : ""} sélectionné{files.length > 1 ? "s" : ""}
          </p>
          <ul className="space-y-2">
            {files.map((file, index) => {
              const Icon = getFileIcon(file.name)
              return (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 truncate">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                  <button
                    onClick={() => removeFile(index)}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-muted"
                    title="Retirer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              )
            })}
          </ul>
          <button
            onClick={handleUpload}
            className="inline-flex h-9 items-center justify-center rounded-md bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
          >
            <Upload className="mr-2 h-4 w-4" />
            Téléverser
          </button>
        </div>
      )}
    </div>
  )
}
