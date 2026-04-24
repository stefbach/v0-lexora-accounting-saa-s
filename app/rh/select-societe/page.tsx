"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Building2, Plus, Loader2, UserCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import { ClientPanel, ClientSectionHeader } from "@/components/client/ClientKit"
import { useRHSocieteActive, type Societe } from "@/components/rh/RHSocieteActiveProvider"

/**
 * /rh/select-societe — écran de choix de la société active côté RH.
 *
 * Copie stricte de /client/select-societe :
 *   - 0 société  → message + bouton vers /rh/societe (création).
 *   - 1 société  → auto-select silencieux + redirect vers /rh.
 *   - ≥ 2 sociétés → grille de cartes cliquables.
 *
 * Cette page est dans la liste d'exceptions du middleware (bypassPaths).
 */
function MonEspaceSalarieBouton() {
  return (
    <Link href="/salarie">
      <Button variant="outline" size="sm" className="gap-2">
        <UserCircle className="h-4 w-4" />
        Mon espace salarié
      </Button>
    </Link>
  )
}

export default function SelectSocietePage() {
  const router = useRouter()
  const { societes, loading, error, switchSociete } = useRHSocieteActive()

  // 1 société → auto-select + redirect
  useEffect(() => {
    if (loading) return
    if (societes.length === 1) {
      switchSociete(societes[0].id)
      router.replace("/rh")
    }
  }, [loading, societes, switchSociete, router])

  const handleSelect = (id: string) => {
    switchSociete(id)
    router.push("/rh")
  }

  if (loading) {
    return (
      <ClientPageShell hideHero disableParticles>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "120px 0" }}>
          <Loader2 className="animate-spin" size={28} style={{ color: "#D4AF37" }} />
        </div>
      </ClientPageShell>
    )
  }

  // 1 société → écran d'attente très bref pendant la redirection
  if (societes.length === 1) {
    return (
      <ClientPageShell hideHero disableParticles>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "120px 0" }}>
          <Loader2 className="animate-spin" size={28} style={{ color: "#D4AF37" }} />
        </div>
      </ClientPageShell>
    )
  }

  // 0 société → onboarding
  if (societes.length === 0) {
    return (
      <ClientPageShell
        breadcrumbs={[{ label: "Espace RH", href: "/rh" }, { label: "Choix de la société" }]}
        kicker="Bienvenue"
        title="Aucune société n'est rattachée à votre compte"
        subtitle="Créez votre première société pour accéder à l'espace RH."
        actions={<MonEspaceSalarieBouton />}
      >
        <ClientPanel>
          <div style={{ textAlign: "center", padding: "40px 24px" }}>
            <Building2 size={48} style={{ color: "#D4AF37", margin: "0 auto 16px" }} aria-hidden="true" />
            <p style={{ marginBottom: "20px", color: "#475569", fontSize: "14px" }}>
              {error ?? "Votre compte ne voit encore aucune société. Cliquez ci-dessous pour en créer une."}
            </p>
            <Link
              href="/rh/societe"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 18px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #D4AF37 0%, #E4C547 100%)",
                color: "#0B0F2E",
                fontWeight: 700,
                fontSize: "14px",
                textDecoration: "none",
                boxShadow: "0 10px 24px -8px rgba(212,175,55,0.55)",
              }}
            >
              <Plus size={16} />
              Créer ma société
            </Link>
          </div>
        </ClientPanel>
      </ClientPageShell>
    )
  }

  // ≥ 2 sociétés → grille de choix
  return (
    <ClientPageShell
      breadcrumbs={[{ label: "Espace RH", href: "/rh" }, { label: "Choix de la société" }]}
      kicker="Espace RH"
      title="Quelle société souhaitez-vous gérer ?"
      subtitle={`Vous avez ${societes.length} sociétés rattachées. Sélectionnez celle sur laquelle vous voulez travailler — vous pourrez en changer à tout moment depuis la barre latérale.`}
      actions={<MonEspaceSalarieBouton />}
    >
      {error && (
        <div
          role="alert"
          style={{
            marginBottom: "16px",
            padding: "12px 16px",
            borderRadius: "10px",
            backgroundColor: "rgba(226,85,85,0.08)",
            border: "1px solid rgba(226,85,85,0.30)",
            color: "#B93B3B",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      )}
      <div
        style={{
          display: "grid",
          gap: "16px",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        }}
      >
        {societes.map((s) => (
          <SocieteCard key={s.id} societe={s} onSelect={() => handleSelect(s.id)} />
        ))}
      </div>
    </ClientPageShell>
  )
}

function SocieteCard({ societe, onSelect }: { societe: Societe; onSelect: () => void }) {
  return (
    <ClientPanel padded={false}>
      <div style={{ padding: "22px" }}>
        <ClientSectionHeader
          icon={Building2}
          title={societe.nom}
          subtitle={
            <>
              {societe.brn && <span>BRN {societe.brn}</span>}
              {societe.brn && societe.secteur_activite && <span>  ·  </span>}
              {societe.secteur_activite && <span>{societe.secteur_activite}</span>}
              {!societe.brn && !societe.secteur_activite && <span style={{ color: "#94A3B8" }}>—</span>}
            </>
          }
          accent="blue"
        />
        <button
          type="button"
          onClick={onSelect}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 18px",
            borderRadius: "10px",
            background: "linear-gradient(135deg, #D4AF37 0%, #E4C547 100%)",
            color: "#0B0F2E",
            fontWeight: 700,
            fontSize: "13px",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 10px 24px -8px rgba(212,175,55,0.55)",
          }}
        >
          Sélectionner
        </button>
      </div>
    </ClientPanel>
  )
}
