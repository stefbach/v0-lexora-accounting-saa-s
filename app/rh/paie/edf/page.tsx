'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { FileSpreadsheet, RefreshCw, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { t, getLocale } from "@/lib/i18n"

// ─── Types ───────────────────────────────────────────────────────────────────

interface DeclarationEDF {
  id: string
  societe_id: string
  exercice: string
  annee_assessment?: string
  nb_employes: number
  total_salaires_bruts: number
  total_csg_salarie: number
  total_csg_patronal: number
  total_paye: number
  total_nsf: number
  total_training_levy: number
  total_prgf: number
  date_limite?: string
  date_soumission?: string
  reference_mra?: string
  statut: string
  notes?: string
}

interface Societe {
  id: string
  nom: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-MU', { style: 'currency', currency: 'MUR', minimumFractionDigits: 0 }).format(n)

const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—'

const EXERCICES = [
  'FY2022-2023',
  'FY2023-2024',
  'FY2024-2025',
  'FY2025-2026'
]

const STATUT_LABELS: Record<string, string> = {
  a_faire: 'À faire',
  en_cours: 'En cours',
  soumis: 'Soumis',
  accepte: 'Accepté'
}

const STATUT_COLORS: Record<string, string> = {
  a_faire: 'bg-gray-100 text-gray-700',
  en_cours: 'bg-blue-100 text-blue-700',
  soumis: 'bg-yellow-100 text-yellow-700',
  accepte: 'bg-green-100 text-green-700'
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function EDFPage() {
  const locale = getLocale()
  const params = useParams()
  // Fonctionne en mode direct /rh/paie/edf OU via /comptable/clients/[clientId]/[societeId]/edf
  const societeIdParam = params?.societeId as string | undefined

  const [societes, setSocietes] = useState<Societe[]>([])
  const [selectedSocieteId, setSelectedSocieteId] = useState(societeIdParam || '')
  const [exercice, setExercice] = useState('FY2024-2025')
  const [declaration, setDeclaration] = useState<DeclarationEDF | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  const [referenceForm, setReferenceForm] = useState('')
  const [notesForm, setNotesForm] = useState('')

  // Charger les sociétés si pas de societeId dans params
  useEffect(() => {
    if (!societeIdParam) {
      fetch('/api/comptable/societes')
        .then(r => r.json())
        .then(d => setSocietes(d.societes || d || []))
        .catch(console.error)
    }
  }, [societeIdParam])

  const fetchDeclaration = useCallback(async () => {
    if (!selectedSocieteId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/comptable/edf?societe_id=${selectedSocieteId}`)
      if (res.ok) {
        const d = await res.json()
        const decl = d.declarations?.find((x: DeclarationEDF) => x.exercice === exercice)
        setDeclaration(decl || null)
        if (decl) {
          setReferenceForm(decl.reference_mra || '')
          setNotesForm(decl.notes || '')
        }
      }
    } finally {
      setLoading(false)
    }
  }, [selectedSocieteId, exercice])

  useEffect(() => { fetchDeclaration() }, [fetchDeclaration])

  const handleGenerer = async () => {
    if (!selectedSocieteId) return
    setGenerating(true)
    try {
      const res = await fetch('/api/comptable/edf/generer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ societe_id: selectedSocieteId, exercice })
      })
      const data = await res.json()
      if (res.ok) {
        await fetchDeclaration()
      } else {
        alert(`Erreur : ${data.error}`)
      }
    } finally {
      setGenerating(false)
    }
  }

  const handleMarquerSoumis = async () => {
    if (!declaration) return
    setSaving(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      await fetch(`/api/comptable/edf?id=${declaration.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statut: 'soumis',
          date_soumission: today,
          reference_mra: referenceForm,
          notes: notesForm
        })
      })
      await fetchDeclaration()
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNotes = async () => {
    if (!declaration) return
    setSaving(true)
    try {
      await fetch(`/api/comptable/edf?id=${declaration.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference_mra: referenceForm, notes: notesForm })
      })
      await fetchDeclaration()
    } finally {
      setSaving(false)
    }
  }

  const deadlineStatus = (() => {
    if (!declaration?.date_limite) return null
    const diffDays = Math.ceil((new Date(declaration.date_limite).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (diffDays < 0) return 'depasse'
    if (diffDays <= 30) return 'urgent'
    return 'ok'
  })()

  const totalARemettreEtat = declaration
    ? declaration.total_paye + declaration.total_nsf + declaration.total_training_levy + declaration.total_prgf
    : 0

  return (
    <ClientPageShell hideHero disableParticles>
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0B0F2E' }}>
            {t('rha.a.edf.title', locale)}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('rha.a.edf.subtitle', locale)}
          </p>
        </div>
        {declaration && (
          <Badge className={STATUT_COLORS[declaration.statut]}>
            {STATUT_LABELS[declaration.statut]}
          </Badge>
        )}
      </div>

      {/* Sélecteurs */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            {!societeIdParam && (
              <div>
                <Label className="text-xs">Société</Label>
                <Select value={selectedSocieteId} onValueChange={setSelectedSocieteId}>
                  <SelectTrigger className="w-56 mt-1">
                    <SelectValue placeholder="Choisir une société..." />
                  </SelectTrigger>
                  <SelectContent>
                    {societes.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label className="text-xs">Exercice fiscal</Label>
              <Select value={exercice} onValueChange={setExercice}>
                <SelectTrigger className="w-48 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXERCICES.map(e => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleGenerer}
              disabled={!selectedSocieteId || generating}
              style={{ backgroundColor: '#D4AF37', color: 'white' }}
            >
              {generating ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Génération...</>
              ) : (
                <><FileSpreadsheet className="h-4 w-4 mr-2" /> Générer depuis bulletins de paie</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Alertes deadline */}
      {deadlineStatus === 'depasse' && declaration && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-medium">
            Deadline EDF dépassée ! Date limite : {fmtDate(declaration.date_limite)}
          </span>
        </div>
      )}
      {deadlineStatus === 'urgent' && declaration && (
        <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg text-orange-700">
          <Clock className="h-5 w-5" />
          <span className="font-medium">
            Deadline EDF approche : {fmtDate(declaration.date_limite)}
          </span>
        </div>
      )}

      {/* Tableau récapitulatif */}
      {loading ? (
        <Card>
          <CardContent className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#D4AF37' }} />
          </CardContent>
        </Card>
      ) : declaration ? (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" style={{ color: '#D4AF37' }} />
                <CardTitle className="text-base">
                  Récapitulatif EDF — {exercice}
                </CardTitle>
                <Badge variant="secondary">{declaration.nb_employes} employé(s)</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rubrique</TableHead>
                    <TableHead className="text-right">Montant (MUR)</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Nombre d&apos;employés</TableCell>
                    <TableCell className="text-right">{declaration.nb_employes}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">Actifs sur la période</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Masse salariale brute</TableCell>
                    <TableCell className="text-right">{fmt(declaration.total_salaires_bruts)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">Total salaires bruts</TableCell>
                  </TableRow>
                  <TableRow className="bg-blue-50">
                    <TableCell className="font-medium">CSG salarié</TableCell>
                    <TableCell className="text-right">{fmt(declaration.total_csg_salarie)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">Contribution Social Généralisée — salarié</TableCell>
                  </TableRow>
                  <TableRow className="bg-blue-50">
                    <TableCell className="font-medium">CSG patronal</TableCell>
                    <TableCell className="text-right">{fmt(declaration.total_csg_patronal)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">Contribution Social Généralisée — employeur</TableCell>
                  </TableRow>
                  <TableRow className="bg-purple-50">
                    <TableCell className="font-medium">PAYE (Pay As You Earn)</TableCell>
                    <TableCell className="text-right">{fmt(declaration.total_paye)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">Impôt sur le revenu retenu à la source</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">NSF (National Savings Fund)</TableCell>
                    <TableCell className="text-right">{fmt(declaration.total_nsf)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">Salarié + Patronal</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Training Levy</TableCell>
                    <TableCell className="text-right">{fmt(declaration.total_training_levy)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">1% masse salariale</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">PRGF</TableCell>
                    <TableCell className="text-right">{fmt(declaration.total_prgf)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">Portable Retirement Gratuity Fund</TableCell>
                  </TableRow>
                  <TableRow className="bg-yellow-50 font-bold">
                    <TableCell className="font-bold">TOTAL À REMETTRE MRA</TableCell>
                    <TableCell className="text-right font-bold text-lg">{fmt(totalARemettreEtat)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">PAYE + NSF + Training Levy + PRGF</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Statut soumission */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" style={{ color: '#D4AF37' }} />
                <CardTitle className="text-base">Soumission MRA</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Date limite de soumission</p>
                  <p className={`font-semibold mt-1 ${
                    deadlineStatus === 'depasse' ? 'text-red-600' :
                    deadlineStatus === 'urgent' ? 'text-orange-600' : ''
                  }`}>
                    {fmtDate(declaration.date_limite)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">31 août {declaration.annee_assessment}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Date de soumission</p>
                  <p className="font-semibold mt-1">{fmtDate(declaration.date_soumission)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Statut</p>
                  <Badge className={`mt-1 ${STATUT_COLORS[declaration.statut]}`}>
                    {STATUT_LABELS[declaration.statut]}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Référence MRA</Label>
                  <Input
                    value={referenceForm}
                    onChange={e => setReferenceForm(e.target.value)}
                    placeholder="MRA-EDF-XXXX-YYYY"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    value={notesForm}
                    onChange={e => setNotesForm(e.target.value)}
                    placeholder="Observations..."
                    rows={2}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleSaveNotes}
                  disabled={saving}
                  variant="outline"
                >
                  Enregistrer notes
                </Button>
                {declaration.statut !== 'soumis' && declaration.statut !== 'accepte' && (
                  <Button
                    onClick={handleMarquerSoumis}
                    disabled={saving}
                    style={{ backgroundColor: '#0B0F2E', color: 'white' }}
                  >
                    {saving ? 'Enregistrement...' : 'Marquer soumis à la MRA'}
                  </Button>
                )}
                {declaration.statut === 'soumis' && (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="text-sm font-medium">
                      Soumis le {fmtDate(declaration.date_soumission)}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {!selectedSocieteId
                ? 'Sélectionnez une société pour voir les déclarations EDF'
                : `Aucune déclaration EDF pour ${exercice}. Cliquez sur "Générer depuis bulletins de paie" pour créer.`}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
    </ClientPageShell>
  )
}
