"use client"
import { useState, useEffect, useMemo } from "react"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PlanningShift, JourCode, ShiftType } from "@/types/planning"
import { t, getLocale } from "@/lib/i18n"

const JOURS: { code: JourCode; label: string; short: string }[] = [
  { code: "lun", label: "Lundi",    short: "Lu" },
  { code: "mar", label: "Mardi",    short: "Ma" },
  { code: "mer", label: "Mercredi", short: "Me" },
  { code: "jeu", label: "Jeudi",    short: "Je" },
  { code: "ven", label: "Vendredi", short: "Ve" },
  { code: "sam", label: "Samedi",   short: "Sa" },
  { code: "dim", label: "Dimanche", short: "Di" },
]

const SHIFT_TYPES: { value: ShiftType; tkey: string }[] = [
  { value: "normal",       tkey: "rhpl.typeNormal" },
  { value: "nuit",         tkey: "rhpl.typeNuit" },
  { value: "repos",        tkey: "rhpl.typeRepos" },
  { value: "astreinte",    tkey: "rhpl.typeAstreinte" },
  { value: "ferie",        tkey: "rhpl.typeFerie" },
  { value: "teletravail",  tkey: "rhpl.typeTeletravail" },
  { value: "garde",        tkey: "rhpl.typeGarde" },
]

function genShiftId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `s_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
}

function emptyShift(): PlanningShift {
  return {
    id: genShiftId(),
    code: "",
    label: "",
    type: "normal",
    debut: "09:00",
    fin: "17:00",
    flexible: false,
    pause_minutes: 60,
    heures_requises: 7,
    jours: ["lun", "mar", "mer", "jeu", "ven"],
    couleur: "#2196F3",
    actif: true,
  }
}

/**
 * Calcule les heures effectives nettes (en h, arrondi à 0.25) à partir des
 * horaires et de la pause. Supporte les shifts qui traversent minuit
 * (ex: nuit 22:00 → 06:00).
 */
function computeNetHours(debut: string | null, fin: string | null, pauseMin: number): number {
  if (!debut || !fin) return 0
  const [dh, dm] = debut.split(":").map(Number)
  const [fh, fm] = fin.split(":").map(Number)
  let delta = (fh * 60 + fm) - (dh * 60 + dm)
  if (delta <= 0) delta += 24 * 60
  const net = (delta - pauseMin) / 60
  return Math.round(net * 4) / 4
}

interface Props {
  shift: PlanningShift | null        // null = create mode
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (shift: PlanningShift) => void
  existingCodes: string[]             // codes des autres shifts (pour unicité)
  maxHeuresJour?: number              // seuil issu de la règle WRA (pour alerte)
}

export function ShiftEditDialog({
  shift, open, onOpenChange, onSave, existingCodes, maxHeuresJour,
}: Props) {
  const locale = getLocale()
  const [form, setForm] = useState<PlanningShift>(() => shift || emptyShift())
  const [userEditedHeures, setUserEditedHeures] = useState(false)

  // Reset form à l'ouverture
  useEffect(() => {
    if (open) {
      setForm(shift ? { ...shift } : emptyShift())
      setUserEditedHeures(false)
    }
  }, [open, shift])

  const isRepos = form.type === "repos"

  // Auto-recalcul des heures requises quand l'utilisateur n'a pas override
  const autoHeures = useMemo(
    () => computeNetHours(form.debut, form.fin, form.pause_minutes),
    [form.debut, form.fin, form.pause_minutes],
  )
  useEffect(() => {
    if (!userEditedHeures && !isRepos) {
      setForm(prev => ({ ...prev, heures_requises: autoHeures }))
    }
  }, [autoHeures, userEditedHeures, isRepos])

  // Validation
  const codeNormalized = form.code.trim().toUpperCase()
  const codeConflict = codeNormalized !== "" && existingCodes.includes(codeNormalized)
  const needsDebutFin = !isRepos
  const missingHoraires = needsDebutFin && (!form.debut || !form.fin)
  const missingJours = form.jours.length === 0
  const heuresOver = maxHeuresJour !== undefined && form.heures_requises > maxHeuresJour && !isRepos
  const heuresIncoherent = !isRepos && form.debut && form.fin
    && Math.abs(form.heures_requises - autoHeures) > 0.25

  const canSave = form.label.trim().length > 0
    && codeNormalized.length > 0
    && codeNormalized.length <= 3
    && !codeConflict
    && !missingHoraires
    && !missingJours

  const toggleJour = (j: JourCode) => {
    setForm(prev => ({
      ...prev,
      jours: prev.jours.includes(j) ? prev.jours.filter(x => x !== j) : [...prev.jours, j],
    }))
  }

  const handleSave = () => {
    if (!canSave) return
    // On normalise le code en uppercase avant de sauvegarder
    const out: PlanningShift = {
      ...form,
      code: codeNormalized,
      // Reset horaires/pause si repos
      debut: isRepos ? null : form.debut,
      fin: isRepos ? null : form.fin,
      pause_minutes: isRepos ? 0 : form.pause_minutes,
      heures_requises: isRepos ? 0 : form.heures_requises,
      // Reset flex si repos ou si flexible=false
      flexible: isRepos ? false : form.flexible,
      debut_min: isRepos ? undefined : (form.flexible ? form.debut_min : undefined),
      debut_max: isRepos ? undefined : (form.flexible ? form.debut_max : undefined),
    }
    onSave(out)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{shift ? t('rhpl.modifierCreneau', locale) : t('rhpl.nouveauCreneau', locale)}</DialogTitle>
          <DialogDescription>
            {t('rhpl.dialogDescription', locale)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Code + Label */}
          <div className="grid grid-cols-[100px_1fr] gap-3">
            <div>
              <Label>{t('rhpl.code', locale)}</Label>
              <Input
                value={form.code}
                maxLength={3}
                onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder={t('rhpl.codePlaceholder', locale)}
                className={cn(codeConflict && "border-red-500")}
              />
              {codeConflict && (
                <p className="text-xs text-red-600 mt-1 flex items-start gap-1">
                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                  {t('rhpl.codeDejaUtilise', locale)}
                </p>
              )}
            </div>
            <div>
              <Label>{t('rhpl.libelle', locale)}</Label>
              <Input
                value={form.label}
                onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
                placeholder={t('rhpl.libellePlaceholder', locale)}
              />
            </div>
          </div>

          {/* Type */}
          <div>
            <Label>{t('rhpl.type', locale)}</Label>
            <Select value={form.type} onValueChange={(v) => setForm(p => ({ ...p, type: v as ShiftType }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SHIFT_TYPES.map(st => (
                  <SelectItem key={st.value} value={st.value}>{t(st.tkey, locale)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Horaires */}
          {!isRepos && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('rhpl.debut', locale)}</Label>
                <Input
                  type="time"
                  value={form.debut || ""}
                  onChange={e => setForm(p => ({ ...p, debut: e.target.value || null }))}
                />
              </div>
              <div>
                <Label>{t('rhpl.fin', locale)}</Label>
                <Input
                  type="time"
                  value={form.fin || ""}
                  onChange={e => setForm(p => ({ ...p, fin: e.target.value || null }))}
                />
              </div>
            </div>
          )}

          {/* Flexible */}
          {!isRepos && (
            <div className="rounded-lg border p-3 space-y-3 bg-slate-50">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">{t('rhpl.horairesFlexibles', locale)}</Label>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t('rhpl.horairesFlexiblesHint', locale)}
                  </p>
                </div>
                <Switch
                  checked={form.flexible}
                  onCheckedChange={(v) => setForm(p => ({ ...p, flexible: v }))}
                />
              </div>
              {form.flexible && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">{t('rhpl.debutMin', locale)}</Label>
                    <Input
                      type="time"
                      value={form.debut_min || ""}
                      onChange={e => setForm(p => ({ ...p, debut_min: e.target.value || undefined }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">{t('rhpl.debutMax', locale)}</Label>
                    <Input
                      type="time"
                      value={form.debut_max || ""}
                      onChange={e => setForm(p => ({ ...p, debut_max: e.target.value || undefined }))}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Pause + Heures requises */}
          {!isRepos && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('rhpl.pauseMinutes', locale)}</Label>
                <Input
                  type="number"
                  min={0}
                  max={240}
                  value={form.pause_minutes}
                  onChange={e => setForm(p => ({ ...p, pause_minutes: Math.max(0, Math.min(240, Number(e.target.value) || 0)) }))}
                />
              </div>
              <div>
                <Label>{t('rhpl.heuresRequises', locale)}</Label>
                <Input
                  type="number"
                  step={0.25}
                  min={0}
                  max={24}
                  value={form.heures_requises}
                  onChange={e => {
                    setUserEditedHeures(true)
                    setForm(p => ({ ...p, heures_requises: Math.max(0, Math.min(24, Number(e.target.value) || 0)) }))
                  }}
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  {t('rhpl.autoCalcule', locale)} ({autoHeures}h)
                </p>
              </div>
            </div>
          )}

          {heuresOver && (
            <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-md p-2 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{t('rhpl.depasseMaxPrefix', locale)} ({maxHeuresJour}h).</span>
            </div>
          )}
          {heuresIncoherent && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{t('rhpl.heuresIncoherentPrefix', locale)} (≈{autoHeures}{t('rhpl.heuresNettesSuffix', locale)}).</span>
            </div>
          )}

          {/* Jours */}
          <div>
            <Label>{t('rhpl.joursAppliques', locale)}</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {JOURS.map(j => {
                const checked = form.jours.includes(j.code)
                return (
                  <label
                    key={j.code}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 border rounded-md cursor-pointer text-xs transition-all select-none",
                      checked ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300",
                    )}
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggleJour(j.code)} />
                    <span>{j.short}</span>
                  </label>
                )
              })}
            </div>
            {missingJours && (
              <p className="text-xs text-red-600 mt-1">{t('rhpl.selectionnezJour', locale)}</p>
            )}
          </div>

          {/* Couleur + Actif */}
          <div className="grid grid-cols-[1fr_auto] gap-4 items-center">
            <div>
              <Label>{t('rhpl.couleur', locale)}</Label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={form.couleur}
                  onChange={e => setForm(p => ({ ...p, couleur: e.target.value }))}
                  className="h-9 w-12 rounded border cursor-pointer"
                  aria-label={t('rhpl.couleurDuCreneau', locale)}
                />
                <Input
                  value={form.couleur}
                  onChange={e => setForm(p => ({ ...p, couleur: e.target.value }))}
                  className="w-28 font-mono text-xs"
                  placeholder="#RRGGBB"
                />
              </div>
            </div>
            <div>
              <Label>{t('rhpl.actif', locale)}</Label>
              <div className="mt-2">
                <Switch
                  checked={form.actif}
                  onCheckedChange={(v) => setForm(p => ({ ...p, actif: v }))}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('rhpl.annuler', locale)}</Button>
          <Button disabled={!canSave} onClick={handleSave} className="text-white" style={{ backgroundColor: "#0B0F2E" }}>
            {t('rhpl.enregistrer', locale)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
