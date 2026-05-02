"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Info } from "lucide-react"
import { OnboardingShell, loadDraft, saveDraft } from "@/components/onboarding/OnboardingShell"
import { listSecteurs, getSecteurTemplate } from "@/lib/onboarding/templates-secteur"

const NAVY = "#0B0F2E"
const DEVISES = ["MUR", "EUR", "USD", "GBP", "ZAR", "INR"]

export default function OnboardingSocietePage() {
  const router = useRouter()
  const [nom, setNom] = useState("")
  const [brn, setBrn] = useState("")
  const [adresse, setAdresse] = useState("")
  const [secteur, setSecteur] = useState<string>("services")
  const [devise, setDevise] = useState("MUR")
  const [exerciceType, setExerciceType] = useState<"fiscal_jul_jun" | "calendaire">("fiscal_jul_jun")
  const [statutTva, setStatutTva] = useState<boolean>(true)
  const [numeroTvaMra, setNumeroTvaMra] = useState("")
  const [error, setError] = useState<string | null>(null)

  // Restore draft
  useEffect(() => {
    const d = loadDraft()
    if (d.societe) {
      setNom(d.societe.nom ?? "")
      setBrn(d.societe.brn ?? "")
      setAdresse(d.societe.adresse ?? "")
      setSecteur(d.societe.secteur ?? "services")
      setDevise(d.societe.devise_principale ?? "MUR")
      setExerciceType(d.societe.exercice_type ?? "fiscal_jul_jun")
      setStatutTva(d.societe.statut_tva ?? true)
      setNumeroTvaMra(d.societe.numero_tva_mra ?? "")
    }
  }, [])

  // Auto-update statut TVA quand le secteur change (template par défaut)
  useEffect(() => {
    const tpl = getSecteurTemplate(secteur)
    setStatutTva(tpl.statut_tva_par_defaut)
  }, [secteur])

  const tpl = getSecteurTemplate(secteur)

  const canNext = nom.trim().length > 1

  const handleNext = () => {
    setError(null)
    if (!canNext) {
      setError("Le nom de la société est requis (au moins 2 caractères).")
      return
    }
    saveDraft({
      societe: {
        nom: nom.trim(),
        brn: brn.trim(),
        adresse: adresse.trim(),
        secteur,
        devise_principale: devise,
        exercice_type: exerciceType,
        statut_tva: statutTva,
        numero_tva_mra: numeroTvaMra.trim() || undefined,
      },
    })
    router.push("/onboarding/comptes-bancaires")
  }

  return (
    <OnboardingShell
      step={1}
      title="Créons votre société"
      subtitle="Quelques informations clés. Vous pourrez tout modifier ensuite dans les paramètres."
      onNext={handleNext}
      canNext={canNext}
      hideBack
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="nom">Nom de la société <span className="text-red-500">*</span></Label>
          <Input
            id="nom"
            placeholder="Ex: Acme Trading Ltd"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="brn">BRN (Business Registration N°)</Label>
            <Input
              id="brn"
              placeholder="Ex: C12345678"
              value={brn}
              onChange={(e) => setBrn(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="devise">Devise principale</Label>
            <Select value={devise} onValueChange={setDevise}>
              <SelectTrigger id="devise"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEVISES.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="adresse">Adresse du siège</Label>
          <Textarea
            id="adresse"
            placeholder="Ex: 21 Royal Road, Curepipe, Mauritius"
            value={adresse}
            onChange={(e) => setAdresse(e.target.value)}
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="secteur">Secteur d&apos;activité</Label>
          <Select value={secteur} onValueChange={setSecteur}>
            <SelectTrigger id="secteur"><SelectValue /></SelectTrigger>
            <SelectContent>
              {listSecteurs().map((s) => (
                <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{tpl.description}</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="exercice">Exercice fiscal</Label>
            <Select value={exerciceType} onValueChange={(v) => setExerciceType(v as typeof exerciceType)}>
              <SelectTrigger id="exercice"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fiscal_jul_jun">Juillet → Juin (Maurice)</SelectItem>
                <SelectItem value="calendaire">Année calendaire (Janv → Déc)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="statut_tva">Statut TVA</Label>
            <Select
              value={statutTva ? "true" : "false"}
              onValueChange={(v) => setStatutTva(v === "true")}
            >
              <SelectTrigger id="statut_tva"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Assujetti à la TVA</SelectItem>
                <SelectItem value="false">Non assujetti / exonéré</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {statutTva && (
          <div className="space-y-2">
            <Label htmlFor="tva_mra">Numéro TVA MRA (optionnel)</Label>
            <Input
              id="tva_mra"
              placeholder="Ex: VAT-20230001"
              value={numeroTvaMra}
              onChange={(e) => setNumeroTvaMra(e.target.value)}
            />
          </div>
        )}

        <Alert className="border-amber-200 bg-amber-50/50">
          <Info className="h-4 w-4" style={{ color: NAVY }} />
          <AlertDescription className="text-sm">
            <strong>{tpl.label}</strong> — {tpl.note}
          </AlertDescription>
        </Alert>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}
      </div>
    </OnboardingShell>
  )
}
