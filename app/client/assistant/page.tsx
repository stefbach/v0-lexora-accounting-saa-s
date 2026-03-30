"use client"

import dynamic from "next/dynamic"

// The assistant uses the exact same Documents & OCR page as the client admin
// The OCR automatically detects document type — no manual category selection needed
// The société is auto-selected from the user's profile
const DocumentsPage = dynamic(() => import("@/app/client/documents/page"), { ssr: false })

export default function AssistantPage() {
  return <DocumentsPage />
}
