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
import { t, getLocale } from "@/lib/i18n"
import type { Document, DocumentType } from "@/lib/types"

interface DocumentTableProps {
  documents: Document[]
  showSociete?: boolean
  showActions?: boolean
  onView?: (doc: Document) => void
}

const typeConfig: Record<DocumentType, { labelKey: string; className: string }> = {
  facture_fournisseur: {
    labelKey: "scmsc.doc.type_facture_fournisseur",
    className: "bg-purple-100 text-purple-800 border-purple-200",
  },
  facture_client: {
    labelKey: "scmsc.doc.type_facture_client",
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  releve_bancaire: {
    labelKey: "scmsc.doc.type_releve_bancaire",
    className: "bg-green-100 text-green-800 border-green-200",
  },
  fiche_paie: {
    labelKey: "scmsc.doc.type_fiche_paie",
    className: "bg-orange-100 text-orange-800 border-orange-200",
  },
  charges_sociales: {
    labelKey: "scmsc.doc.type_charges_sociales",
    className: "bg-teal-100 text-teal-800 border-teal-200",
  },
  contrat: {
    labelKey: "scmsc.doc.type_contrat",
    className: "bg-indigo-100 text-indigo-800 border-indigo-200",
  },
  rapport: {
    labelKey: "scmsc.doc.type_rapport",
    className: "bg-violet-100 text-violet-800 border-violet-200",
  },
  rapport_mensuel: {
    labelKey: "scmsc.doc.type_rapport_mensuel",
    className: "bg-violet-100 text-violet-800 border-violet-200",
  },
  autre: {
    labelKey: "scmsc.doc.type_autre",
    className: "bg-gray-100 text-gray-800 border-gray-200",
  },
}

export function DocumentTable({
  documents,
  showSociete = true,
  showActions = true,
  onView,
}: DocumentTableProps) {
  const locale = getLocale()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('scmsc.doc.col_fichier', locale)}</TableHead>
          <TableHead>{t('scmsc.doc.col_date', locale)}</TableHead>
          <TableHead>{t('scmsc.doc.col_type_detecte', locale)}</TableHead>
          {showSociete && <TableHead>{t('scmsc.doc.col_societe_detectee', locale)}</TableHead>}
          <TableHead>{t('scmsc.doc.col_statut', locale)}</TableHead>
          {showActions && <TableHead>{t('scmsc.doc.col_actions', locale)}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={showSociete && showActions ? 6 : showSociete || showActions ? 5 : 4}
              className="text-center text-muted-foreground"
            >
              {t('scmsc.doc.aucun_document', locale)}
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
                    {t(typeInfo.labelKey, locale)}
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
                    title={t('scmsc.doc.voir_document', locale)}
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
