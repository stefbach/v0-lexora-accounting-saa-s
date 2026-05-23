'use client'

import { useState } from 'react'

export type ApprovalStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'POSTED'

export interface ApprovalEntity {
  id: string
  entityType: 'JOURNAL_ENTRY' | 'INVOICE' | 'PAYSLIP' | 'PAYMENT' | 'CHART_ACCOUNT'
  entityRef: string
  status: ApprovalStatus
  amount?: number
  createdBy: { id: string; name: string }
  createdAt: Date
  reviewedBy?: { id: string; name: string }
  reviewedAt?: Date
  rejectionReason?: string
  notes?: string
  requiresMultipleApprovers: boolean
  approverThreshold?: number  // Amount threshold for additional approval
}

interface ApprovalWorkflowProps {
  entity: ApprovalEntity
  currentUser: { id: string; name: string; role: 'PREPARER' | 'REVIEWER' | 'APPROVER' | 'DIRECTOR' }
  onApprove: (notes: string) => Promise<void>
  onReject: (reason: string) => Promise<void>
  onSubmitForReview: () => Promise<void>
  onPost?: () => Promise<void>
}

const STATUS_COLORS: Record<ApprovalStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING_REVIEW: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  REJECTED: 'bg-red-100 text-red-700',
  POSTED: 'bg-green-100 text-green-700',
}

const STATUS_LABELS: Record<ApprovalStatus, string> = {
  DRAFT: 'Brouillon',
  PENDING_REVIEW: 'En attente de revue',
  APPROVED: 'Approuvée',
  REJECTED: 'Rejetée',
  POSTED: 'Comptabilisée',
}

export function ApprovalWorkflow({ entity, currentUser, onApprove, onReject, onSubmitForReview, onPost }: ApprovalWorkflowProps) {
  const [showApprovalForm, setShowApprovalForm] = useState(false)
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  // SOD: Preparer cannot approve their own work
  const isOwnWork = currentUser.id === entity.createdBy.id
  const canSubmit = entity.status === 'DRAFT' && (currentUser.role === 'PREPARER' || currentUser.role === 'REVIEWER')
  const canApprove = entity.status === 'PENDING_REVIEW' && !isOwnWork &&
                     ['REVIEWER', 'APPROVER', 'DIRECTOR'].includes(currentUser.role)
  const canPost = entity.status === 'APPROVED' && ['APPROVER', 'DIRECTOR'].includes(currentUser.role)
  const needsDirector = entity.amount && entity.approverThreshold && entity.amount > entity.approverThreshold

  const handleApprove = async () => {
    setLoading(true)
    try {
      await onApprove(notes)
      setShowApprovalForm(false)
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    if (!reason.trim()) return
    setLoading(true)
    try {
      await onReject(reason)
      setShowRejectForm(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="px-6 py-3 border-b bg-gradient-to-r from-amber-50 to-orange-50">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Workflow d&apos;Approbation</h3>
          <span className={`px-3 py-1 rounded text-sm font-medium ${STATUS_COLORS[entity.status]}`}>
            {STATUS_LABELS[entity.status]}
          </span>
        </div>
      </div>

      {/* Timeline */}
      <div className="p-6">
        <div className="space-y-4">
          {/* Step 1: Created */}
          <TimelineStep
            label="Préparation"
            user={entity.createdBy}
            time={entity.createdAt}
            complete
            icon="📝"
          />

          {/* Step 2: Review */}
          <TimelineStep
            label="Revue"
            user={entity.reviewedBy}
            time={entity.reviewedAt}
            complete={['APPROVED', 'POSTED', 'REJECTED'].includes(entity.status)}
            icon={entity.status === 'REJECTED' ? '❌' : '👀'}
            current={entity.status === 'PENDING_REVIEW'}
          />

          {/* Step 3: Posting */}
          <TimelineStep
            label="Comptabilisation"
            user={entity.status === 'POSTED' ? entity.reviewedBy : undefined}
            time={entity.status === 'POSTED' ? entity.reviewedAt : undefined}
            complete={entity.status === 'POSTED'}
            icon="✅"
            current={entity.status === 'APPROVED'}
          />
        </div>

        {/* SOD warning */}
        {entity.status === 'PENDING_REVIEW' && isOwnWork && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            ⚠ <strong>Séparation des tâches:</strong> Vous ne pouvez pas approuver votre propre travail.
            Un autre utilisateur doit réviser et approuver cette écriture.
          </div>
        )}

        {/* Director approval required */}
        {needsDirector && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-700">
            🔔 <strong>Approbation Directeur requise:</strong> Montant {entity.amount?.toLocaleString('fr-FR')} dépasse le seuil de {entity.approverThreshold?.toLocaleString('fr-FR')}.
          </div>
        )}

        {/* Reject reason */}
        {entity.status === 'REJECTED' && entity.rejectionReason && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm">
            <strong className="text-red-700">Motif du rejet:</strong>
            <p className="mt-1 text-red-600">{entity.rejectionReason}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-6 py-3 border-t bg-gray-50 flex justify-end gap-2">
        {canSubmit && (
          <button
            onClick={() => onSubmitForReview()}
            disabled={loading}
            className="px-4 py-1.5 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
          >
            📤 Soumettre pour revue
          </button>
        )}

        {canApprove && (
          <>
            <button
              onClick={() => setShowRejectForm(true)}
              disabled={loading}
              className="px-4 py-1.5 text-sm border border-red-300 text-red-700 rounded hover:bg-red-50"
            >
              ✕ Rejeter
            </button>
            <button
              onClick={() => setShowApprovalForm(true)}
              disabled={loading}
              className="px-4 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
            >
              ✓ Approuver
            </button>
          </>
        )}

        {canPost && onPost && (
          <button
            onClick={() => onPost()}
            disabled={loading}
            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            📊 Comptabiliser
          </button>
        )}
      </div>

      {/* Approval modal */}
      {showApprovalForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="font-bold mb-3">Confirmer l&apos;approbation</h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes d'approbation (optionnel)..."
              rows={3}
              className="w-full px-3 py-2 border rounded text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowApprovalForm(false)} className="px-4 py-2 border rounded">Annuler</button>
              <button onClick={handleApprove} disabled={loading} className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50">
                {loading ? 'En cours...' : 'Confirmer l\'approbation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {showRejectForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="font-bold mb-3 text-red-700">Rejeter cette opération</h3>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motif du rejet (obligatoire)..."
              rows={4}
              required
              className="w-full px-3 py-2 border rounded text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowRejectForm(false)} className="px-4 py-2 border rounded">Annuler</button>
              <button
                onClick={handleReject}
                disabled={loading || !reason.trim()}
                className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
              >
                {loading ? 'Rejet en cours...' : 'Confirmer le rejet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TimelineStep({
  label, user, time, complete, current, icon
}: {
  label: string; user?: { name: string }; time?: Date; complete: boolean; current?: boolean; icon: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${
        complete ? 'bg-green-100' : current ? 'bg-yellow-100 animate-pulse' : 'bg-gray-100'
      }`}>
        {complete ? '✓' : current ? icon : '○'}
      </div>
      <div className="flex-1 pt-1.5">
        <div className="font-medium text-sm">{label}</div>
        {user && (
          <div className="text-xs text-gray-600 mt-0.5">
            {user.name}{time && ` • ${time.toLocaleString('fr-FR')}`}
          </div>
        )}
        {!user && !complete && (
          <div className="text-xs text-gray-400 mt-0.5">En attente...</div>
        )}
      </div>
    </div>
  )
}
