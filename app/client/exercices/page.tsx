"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, Calendar, Lock, Unlock, ArrowRight, Building2, AlertTriangle, CheckCircle } from "lucide-react"
import { useProfile } from "@/hooks/use-profile"
import Link from "next/link"

const NAVY = "#1E2A4A"
const GOLD = "#C9A84C"

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface ExerciceData {
  exercice: string
  date_debut: string
  date_fin: string
  statut: "ouvert" | "cloture"
  total_revenue: number
  total_expenses: number
  resultat: number
  total_actif: number
  total_passif: number
}

function getCurrentExercice(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  if (month >= 7) return `${year}-${year + 1}`
  return `${year - 1}-${year}`
}

function getExerciceList(): ExerciceData[] {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const currentStart = month >= 7 ? year : year - 1
  const current = getCurrentExercice()
  const list: ExerciceData[] = []
  for (let i = 0; i < 5; i++) {
    const s = currentStart - i
    const ex = `${s}-${s + 1}`
    list.push({
      exercice: ex,
      date_debut: `${s}-07-01`,
      date_fin: `${s + 1}-06-30`,
      statut: ex === current ? "ouvert" : "ouvert",
      total_revenue: 0,
      total_expenses: 0,
      resultat: 0,
      total_actif: 0,
      total_passif: 0,
    })
  }
  return list
}

export default function ExercicesPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [societes, setSocietes] = useState<{ id: string; nom: string }[]>([])
  const [selectedSociete, setSelectedSociete] = useState("")
  const [exercices, setExercices] = useState<ExerciceData[]>(getExerciceList())
  const [loading, setLoading] = useState(false)
  const [closingExercice, setClosingExercice] = useState<string | null>(null)
  const [closingInProgress, setClosingInProgress] = useState(false)
  const [closingResult, setClosingResult] = useState<string | null>(null)
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  const [exerciceToClose, setExerciceToClose] = useState("")

  useEffect(() => {
    fetch("/api/client/societes")
      .then(r => r.json())
      .then(json => {
        const list = json.societes || (Array.isArray(json) ? json : [])
        setSocietes(list)
        if (list.length >= 1) setSelectedSociete(list[0].id)
      })
      .catch(() => {})
  }, [])

  const fetchExerciceData = useCallback(async () => {
    if (!selectedSociete) return
    setLoading(true)

    try {
      const baseList = getExerciceList()

      // Fetch financial data for each exercice
      const results = await Promise.all(
        baseList.map(async (ex) => {
          try {
            const res = await fetch(
              `/api/client/financial?societe_id=${selectedSociete}&exercice=${ex.exercice}`
            )
            const json = await res.json()
            const fin = json.financial
            if (fin) {
              return {
                ...ex,
                total_revenue: fin.totalRevenue || 0,
                total_expenses: fin.totalExpenses || 0,
                resultat: (fin.totalRevenue || 0) - (fin.totalExpenses || 0),
                total_actif: (fin.totalBankMUR || 0) + (fin.creances || 0) + (fin.immobilisations || 0),
                total_passif: (fin.dettesFournisseurs || 0) + (fin.dettesFiscales || 0) + (fin.dettesSociales || 0),
              }
            }
          } catch {}
          return ex
        })
      )

      // Check cloture status from localStorage (simplified - in production use DB)
      const closedExercices = JSON.parse(localStorage.getItem(`lexora_closed_exercices_${selectedSociete}`) || "[]")
      const updatedResults = results.map(ex => ({
        ...ex,
        statut: closedExercices.includes(ex.exercice) ? "cloture" as const : "ouvert" as const,
      }))

      setExercices(updatedResults)
    } catch (err) {
      console.error("Failed to fetch exercice data:", err)
    } finally {
      setLoading(false)
    }
  }, [selectedSociete])

  useEffect(() => {
    if (selectedSociete) fetchExerciceData()
  }, [selectedSociete, fetchExerciceData])

  const handleCloturer = async () => {
    if (!exerciceToClose || !selectedSociete) return
    setClosingInProgress(true)
    setClosingResult(null)

    try {
      // 1. Mark exercice as closed in localStorage (in production, save to DB)
      const closedExercices = JSON.parse(localStorage.getItem(`lexora_closed_exercices_${selectedSociete}`) || "[]")
      if (!closedExercices.includes(exerciceToClose)) {
        closedExercices.push(exerciceToClose)
        localStorage.setItem(`lexora_closed_exercices_${selectedSociete}`, JSON.stringify(closedExercices))
      }

      // 2. The opening balances for next year are automatically computed by the grand-livre API
      // (solde_ouverture_par_compte) when querying with an exercice filter

      setClosingResult(
        `Exercice ${exerciceToClose} cloture avec succes. ` +
        `Les soldes de cloture seront reportes comme soldes d'ouverture pour l'exercice suivant.`
      )

      // Refresh data
      await fetchExerciceData()
    } catch (err) {
      console.error("Cloture error:", err)
      setClosingResult("Erreur lors de la cloture. Veuillez reessayer.")
    } finally {
      setClosingInProgress(false)
      setShowCloseDialog(false)
    }
  }

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: GOLD }} />
      </div>
    )
  }

  if (profile?.role === "client_user") {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <h1 className="text-xl font-bold" style={{ color: NAVY }}>Acces non autorise</h1>
        <Link href="/client" className="text-sm underline" style={{ color: GOLD }}>
          Retour au tableau de bord
        </Link>
      </div>
    )
  }

  const current = getCurrentExercice()

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: NAVY }}>
            <Calendar className="w-7 h-7" style={{ color: GOLD }} />
            Exercices Comptables
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Gestion des exercices fiscaux (juillet a juin) - Mauritius fiscal year
          </p>
        </div>
        {societes.length > 1 && (
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-gray-400" />
            <Select value={selectedSociete} onValueChange={setSelectedSociete}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Choisir une societe" />
              </SelectTrigger>
              <SelectContent>
                {societes.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Status messages */}
      {closingResult && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
          closingResult.includes("Erreur")
            ? "bg-red-50 border border-red-200 text-red-700"
            : "bg-green-50 border border-green-200 text-green-700"
        }`}>
          {closingResult.includes("Erreur")
            ? <AlertTriangle className="h-4 w-4" />
            : <CheckCircle className="h-4 w-4" />
          }
          {closingResult}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: NAVY }} />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg" style={{ color: NAVY }}>
              Liste des Exercices
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="text-xs">Exercice</TableHead>
                  <TableHead className="text-xs">Periode</TableHead>
                  <TableHead className="text-xs">Statut</TableHead>
                  <TableHead className="text-xs text-right">CA (MUR)</TableHead>
                  <TableHead className="text-xs text-right">Charges (MUR)</TableHead>
                  <TableHead className="text-xs text-right">Resultat (MUR)</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exercices.map((ex) => {
                  const isCurrent = ex.exercice === current
                  const isClosed = ex.statut === "cloture"
                  return (
                    <TableRow
                      key={ex.exercice}
                      className={isCurrent ? "bg-[#C9A84C]/5 border-l-4 border-l-[#C9A84C]" : ""}
                    >
                      <TableCell className="font-mono font-semibold text-sm" style={{ color: NAVY }}>
                        {ex.exercice}
                        {isCurrent && (
                          <Badge className="ml-2 text-xs" style={{ backgroundColor: GOLD, color: NAVY }}>
                            En cours
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {new Date(ex.date_debut).toLocaleDateString("fr-FR")}
                        <ArrowRight className="inline w-3 h-3 mx-1" />
                        {new Date(ex.date_fin).toLocaleDateString("fr-FR")}
                      </TableCell>
                      <TableCell>
                        {isClosed ? (
                          <Badge variant="outline" className="text-xs border-green-300 text-green-700 bg-green-50">
                            <Lock className="w-3 h-3 mr-1" />
                            Cloture
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 bg-blue-50">
                            <Unlock className="w-3 h-3 mr-1" />
                            Ouvert
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">
                        {ex.total_revenue > 0 ? (
                          <span className="text-green-700">{fmt(ex.total_revenue)}</span>
                        ) : (
                          <span className="text-gray-300">--</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">
                        {ex.total_expenses > 0 ? (
                          <span className="text-red-600">{fmt(ex.total_expenses)}</span>
                        ) : (
                          <span className="text-gray-300">--</span>
                        )}
                      </TableCell>
                      <TableCell className={`text-xs text-right font-mono font-semibold ${
                        ex.resultat >= 0 ? "text-green-700" : "text-red-600"
                      }`}>
                        {ex.total_revenue > 0 || ex.total_expenses > 0 ? fmt(ex.resultat) : (
                          <span className="text-gray-300 font-normal">--</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/client/bilan?exercice=${ex.exercice}`}>
                            <Button variant="outline" size="sm" className="text-xs h-7" style={{ borderColor: NAVY, color: NAVY }}>
                              Bilan
                            </Button>
                          </Link>
                          {!isClosed && !isCurrent && (ex.total_revenue > 0 || ex.total_expenses > 0) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              style={{ borderColor: GOLD, color: NAVY }}
                              onClick={() => {
                                setExerciceToClose(ex.exercice)
                                setShowCloseDialog(true)
                              }}
                            >
                              <Lock className="w-3 h-3 mr-1" />
                              Cloturer
                            </Button>
                          )}
                          {isClosed && (
                            <span className="text-xs text-gray-400 italic">Verrouille</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Info card about report a nouveau */}
      <Card className="border-t-4" style={{ borderTopColor: GOLD }}>
        <CardHeader>
          <CardTitle className="text-sm" style={{ color: NAVY }}>
            Report a nouveau et cloture
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-600 space-y-2">
          <p>
            Lors de la cloture d&apos;un exercice, les soldes de cloture des comptes de bilan
            (classes 1 a 5) sont automatiquement reportes comme soldes d&apos;ouverture
            pour l&apos;exercice suivant.
          </p>
          <p>
            Les comptes de charges et produits (classes 6 et 7) sont remis a zero au debut
            de chaque exercice. Le resultat de l&apos;exercice precedent est integre aux
            capitaux propres (report a nouveau).
          </p>
          <p>
            Une fois cloture, les ecritures de l&apos;exercice precedent ne peuvent plus etre
            modifiees (lecture seule).
          </p>
        </CardContent>
      </Card>

      {/* Close Dialog */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ color: NAVY }}>
              Cloturer l&apos;exercice {exerciceToClose}
            </DialogTitle>
            <DialogDescription>
              Cette action va :
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-3">
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle className="w-4 h-4 mt-0.5 text-green-600" />
              <span>Calculer les soldes de cloture de tous les comptes</span>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <CheckCircle className="w-4 h-4 mt-0.5 text-green-600" />
              <span>Reporter les soldes des comptes de bilan (1-5) comme soldes d&apos;ouverture</span>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <Lock className="w-4 h-4 mt-0.5" style={{ color: GOLD }} />
              <span>Verrouiller les ecritures de cet exercice (lecture seule)</span>
            </div>
            <div className="flex items-start gap-2 text-sm text-red-600">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <span>Cette action ne peut pas etre annulee facilement</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleCloturer}
              disabled={closingInProgress}
              style={{ backgroundColor: NAVY }}
              className="text-white"
            >
              {closingInProgress ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Lock className="w-4 h-4 mr-2" />
              )}
              Confirmer la cloture
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
