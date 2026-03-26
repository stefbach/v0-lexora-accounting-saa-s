import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Eye } from "lucide-react"
import { DocumentStatusBadge } from "@/components/documents/DocumentStatusBadge"
import type { Document, DocumentType } from "@/lib/types"

interface DocumentTableProps {
  documents: Document[]
  showSociete?: boolean
  showActions?: boolean
  onView?: (doc: Document) => void
}

const typeConfig: Record<DocumentType, { label: string; className: string }> = {
  facture_fournisseur: {
    label: "Facture fournisseur",
    className: "bg-purple-100 text-purple-800 border-purple-200",
  },
  facture_client: {
    label: "Facture client",
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  releve_bancaire: {
    label: "Relevé bancaire",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  fiche_paie: {
    label: "Fiche de paie",
    className: "bg-orange-100 text-orange-800 border-orange-200",
  },
  charges_sociales: {
    label: "Charges sociales",
    className: "bg-teal-100 text-teal-800 border-teal-200",
  },
  contrat: {
    label: "Contrat",
    className: "bg-indigo-100 text-indigo-800 border-indigo-200",
  },
  autre: {
    label: "Autre",
    className: "bg-gray-100 text-gray-800 border-gray-200",
  },
}

export function DocumentTable({
  documents,
  showSociete = true,
  showActions = true,
  onView,
}: DocumentTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fichier</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Type détecté</TableHead>
          {showSociete && <TableHead>Société détectée</TableHead>}
          <TableHead>Statut</TableHead>
          {showActions && <TableHead>Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={showSociete && showActions ? 6 : showSociete || showActions ? 5 : 4}
              className="text-center text-muted-foreground"
            >
              Aucun document
            </TableCell>
          </TableRow>
        )}
        {documents.map((doc) => {
          const typeInfo = doc.type_document ? typeConfig[doc.type_document] : null
          return (
            <TableRow key={doc.id}>
              <TableCell className="font-medium">{doc.nom_fichier}</TableCell>
              <TableCell>
                {new Date(doc.created_at).toLocaleDateString("fr-FR")}
              </TableCell>
              <TableCell>
                {typeInfo ? (
                  <Badge variant="outline" className={cn(typeInfo.className)}>
                    {typeInfo.label}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              {showSociete && (
                <TableCell>
                  {doc.societe_detectee ?? (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
              )}
              <TableCell>
                <DocumentStatusBadge statut={doc.statut} />
              </TableCell>
              {showActions && (
                <TableCell>
                  <button
                    onClick={() => onView?.(doc)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
                    title="Voir le document"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </TableCell>
              )}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
