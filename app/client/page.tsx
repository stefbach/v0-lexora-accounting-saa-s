"use client"

import { useState, useCallback, useEffect } from "react"
import { useProfile } from "@/hooks/use-profile"
import Link from "next/link"
import {
  Upload, FileText, TrendingUp, AlertTriangle, CheckCircle,
  Loader2, Lightbulb, BarChart3, Wallet, CircleDollarSign,
  Banknote, ArrowRight, Clock, Check, Sparkles, Bell,
} from "lucide-react"
import { ClientPageShell } from "@/components/layout/ClientPageShell"
import {
  ClientPanel, ClientSectionHeader, ClientKpi, ClientChip, ClientEmpty,
} from "@/components/client/ClientKit"

const FONT = "'Poppins', sans-serif"

function fmtMUR(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} MUR`
}

interface AlertData { id: string; niveau: "red" | "orange" | "blue"; message: string }
interface ActionData { quoi: string; pourQuand: string; combien: string; fait: boolean }
interface DocumentData { id: string; nom: string; date: string; statut: string }
interface UploadData { id: string; nom: string; date: string; statut: string }
interface KpiData {
  chiffreAffaires: number | null
  depenses: number | null
  benefice: number | null
  tresorerie: number | null
  tendanceCA: string | null
}
interface BriefData { resume_texte: string | null; conseil_texte: string | null }

/* ------------------------------------------------------------------ */
/*  Simple view — for client_user role                                 */
/* ------------------------------------------------------------------ */

function ClientUserDashboard({ firstName }: { firstName: string }) {
  const [dragOver, setDragOver] = useState(false)
  const [recentUploads, setRecentUploads] = useState<UploadData[]>([])
  const [loadingUploads, setLoadingUploads] = useState(true)

  useEffect(() => {
    fetch("/api/client/societes")
      .then((r) => r.json())
      .then(() => setRecentUploads([]))
      .catch(() => setRecentUploads([]))
      .finally(() => setLoadingUploads(false))
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true) }, [])
  const onDragLeave = useCallback(() => setDragOver(false), [])
  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false) }, [])

  return (
    <ClientPageShell
      breadcrumbs={[{ label: "Espace client", href: "/client" }]}
      kicker="Bienvenue"
      title={`Bonjour ${firstName}`}
      subtitle="Déposez vos documents ci-dessous, votre comptable s'en occupe."
    >
      <div style={{ display: "grid", gap: "24px", maxWidth: "860px" }}>
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          style={{
            padding: "56px 24px",
            textAlign: "center",
            cursor: "pointer",
            borderRadius: "18px",
            background: dragOver
              ? "linear-gradient(180deg, rgba(212,175,55,0.12) 0%, rgba(212,175,55,0.04) 100%)"
              : "linear-gradient(180deg, #FFFFFF 0%, #F7F9FF 100%)",
            border: dragOver ? "2px dashed #D4AF37" : "2px dashed #D8DFED",
            boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 18px 40px -24px rgba(15,23,42,0.16)",
            transition: "all 0.25s ease-out",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: "64px", height: "64px", borderRadius: "16px",
              background: "linear-gradient(135deg, rgba(212,175,55,0.22) 0%, rgba(212,175,55,0.08) 100%)",
              border: "1px solid rgba(212,175,55,0.40)",
              color: "#A88925",
              boxShadow: "0 14px 32px -10px rgba(212,175,55,0.55)",
              marginBottom: "18px",
            }}
          >
            <Upload size={28} strokeWidth={1.8} />
          </div>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: "18px", color: "#0B0F2E", letterSpacing: "-0.01em" }}>
            Déposez vos fichiers ici
          </div>
          <div style={{ marginTop: "6px", color: "#475569", fontSize: "13px" }}>
            PDF, images, Excel — ou cliquez pour choisir
          </div>
          <button
            type="button"
            style={{
              marginTop: "18px",
              display: "inline-flex", alignItems: "center", gap: "8px",
              padding: "10px 22px", borderRadius: "10px",
              background: "linear-gradient(135deg, #D4AF37 0%, #E4C547 100%)",
              color: "#0B0F2E", fontWeight: 700, fontSize: "13px",
              border: "none", cursor: "pointer",
              boxShadow: "0 10px 24px -8px rgba(212,175,55,0.55)",
              fontFamily: FONT,
            }}
          >
            <Upload size={14} /> Choisir un fichier
          </button>
        </div>

        <ClientPanel>
          <ClientSectionHeader
            icon={FileText}
            title="Mes envois récents"
            subtitle="Suivez en direct le traitement de vos documents."
            accent="blue"
          />
          {loadingUploads ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
              <Loader2 className="animate-spin" size={24} style={{ color: "#D4AF37" }} />
            </div>
          ) : recentUploads.length === 0 ? (
            <ClientEmpty
              icon={FileText}
              title="Aucun envoi récent"
              description="Déposez vos premiers documents ci-dessus — ils apparaîtront ici avec leur statut."
              accent="blue"
            />
          ) : (
            <div style={{ display: "grid", gap: "8px" }}>
              {recentUploads.map((u) => (
                <UploadRow key={u.id} upload={u} />
              ))}
            </div>
          )}
        </ClientPanel>
      </div>
    </ClientPageShell>
  )
}

function UploadRow({ upload }: { upload: UploadData }) {
  const chipAccent: "blue" | "orange" | "green" =
    upload.statut === "Traite" ? "green" : upload.statut === "En cours" ? "orange" : "blue"
  return (
    <div
      style={{
        display: "grid", gridTemplateColumns: "1fr auto auto",
        alignItems: "center", gap: "16px",
        padding: "12px 16px",
        borderRadius: "12px",
        border: "1px solid #E6EBF7",
        backgroundColor: "#FFFFFF",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
        <FileText size={16} style={{ color: "#2A6FCC", flexShrink: 0 }} />
        <span style={{ fontWeight: 500, color: "#0B0F2E", fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {upload.nom}
        </span>
      </div>
      <span style={{ fontSize: "12px", color: "#475569" }}>{upload.date}</span>
      <ClientChip accent={chipAccent}>{upload.statut}</ClientChip>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Full admin view — for client_admin                                 */
/* ------------------------------------------------------------------ */

function ClientAdminDashboard({ firstName, societe }: { firstName: string; societe: string }) {
  const [alerts, setAlerts] = useState<AlertData[]>([])
  const [actions, setActions] = useState<ActionData[]>([])
  const [documents, setDocuments] = useState<DocumentData[]>([])
  const [kpis, setKpis] = useState<KpiData>({
    chiffreAffaires: null, depenses: null, benefice: null, tresorerie: null, tendanceCA: null,
  })
  const [brief, setBrief] = useState<BriefData>({ resume_texte: null, conseil_texte: null })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const socRes = await fetch("/api/client/societes")
        const socData = await socRes.json()
        const societes = socData.societes || []

        if (societes.length > 0) {
          const firstSociete = societes[0]
          const societeId = firstSociete.id
          const now = new Date()
          const periode = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`

          const [briefResult, financialResult] = await Promise.allSettled([
            fetch("/api/brief-client", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                client_id: firstSociete.comptable?.id || "",
                societe_id: societeId,
                periode,
              }),
            }).then((r) => r.json()),
            fetch("/api/client/financial").then((r) => r.json()),
          ])

          if (briefResult.status === "fulfilled") {
            const briefData = briefResult.value
            if (briefData.success) {
              setBrief({
                resume_texte: briefData.resume_texte || null,
                conseil_texte: briefData.conseil_texte || null,
              })
              if (briefData.alertes && Array.isArray(briefData.alertes)) {
                setAlerts(
                  briefData.alertes.map((msg: string, i: number) => ({
                    id: `ba-${i}`,
                    niveau: i === 0 ? ("red" as const) : i === 1 ? ("orange" as const) : ("blue" as const),
                    message: msg,
                  }))
                )
              }
            }
          }

          if (financialResult.status === "fulfilled") {
            const finData = financialResult.value.financial
            if (finData) {
              setKpis({
                chiffreAffaires: finData.totalRevenue ?? null,
                depenses: finData.totalExpenses ?? null,
                benefice: finData.resultat ?? null,
                tresorerie: finData.totalBankMUR ?? null,
                tendanceCA:
                  finData.lastMonthRevenue && finData.totalRevenue
                    ? `${finData.lastMonthRevenue > 0 ? "+" : ""}${Math.round(
                        ((finData.monthlyRevenue - finData.lastMonthRevenue) / finData.lastMonthRevenue) * 100
                      )}% vs mois dernier`
                    : null,
              })
            }
          }
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false)
      }
    }
    fetchDashboardData()
  }, [])

  if (loading) {
    return (
      <ClientPageShell hideHero disableParticles>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "120px 0" }}>
          <Loader2 className="animate-spin" size={28} style={{ color: "#D4AF37" }} />
        </div>
      </ClientPageShell>
    )
  }

  const currentMonth = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
  const beneficePositive = kpis.benefice !== null && kpis.benefice >= 0
  const caTrendPositive = kpis.tendanceCA ? kpis.tendanceCA.startsWith("+") : undefined

  return (
    <ClientPageShell
      breadcrumbs={[
        { label: "Espace client", href: "/client" },
        { label: "Tableau de bord" },
      ]}
      kicker={`${societe} · ${currentMonth}`}
      title={`Bonjour ${firstName}`}
      subtitle={
        brief.resume_texte ||
        "Les données de votre tableau de bord seront disponibles une fois vos documents traités par votre comptable."
      }
    >
      <div style={{ display: "grid", gap: "24px" }}>
        {/* KPIs */}
        <div>
          <ClientSectionHeader
            icon={BarChart3}
            title="Mes 4 chiffres clés"
            subtitle="Extraits automatiquement de vos écritures du mois."
            accent="blue"
          />
          <div
            style={{
              display: "grid",
              gap: "16px",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <ClientKpi
              label="Chiffre d'affaires"
              value={kpis.chiffreAffaires !== null ? fmtMUR(kpis.chiffreAffaires) : "—"}
              delta={kpis.tendanceCA || undefined}
              deltaPositive={caTrendPositive}
              icon={BarChart3}
              accent="blue"
              hint={kpis.chiffreAffaires === null ? "Pas encore de données" : undefined}
            />
            <ClientKpi
              label="Dépenses"
              value={kpis.depenses !== null ? fmtMUR(kpis.depenses) : "—"}
              icon={Wallet}
              accent="orange"
              hint={kpis.depenses === null ? "Pas encore de données" : undefined}
            />
            <ClientKpi
              label="Bénéfice"
              value={kpis.benefice !== null ? fmtMUR(kpis.benefice) : "—"}
              delta={kpis.benefice !== null ? (beneficePositive ? "Positif" : "Négatif") : undefined}
              deltaPositive={beneficePositive}
              icon={CircleDollarSign}
              accent={beneficePositive ? "green" : "red"}
              hint={kpis.benefice === null ? "Pas encore de données" : undefined}
            />
            <ClientKpi
              label="Trésorerie"
              value={kpis.tresorerie !== null ? fmtMUR(kpis.tresorerie) : "—"}
              delta={kpis.tresorerie !== null ? "Sain" : undefined}
              deltaPositive={kpis.tresorerie !== null && kpis.tresorerie >= 0}
              icon={Banknote}
              accent="green"
              hint={kpis.tresorerie === null ? "Pas encore de données" : undefined}
            />
          </div>
        </div>

        {/* Actions + Alertes in 2 columns */}
        <div
          style={{
            display: "grid",
            gap: "24px",
            gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          }}
        >
          <ClientPanel>
            <ClientSectionHeader
              icon={CheckCircle}
              title="Mes actions ce mois"
              subtitle="Les échéances et obligations à traiter."
              accent="gold"
            />
            {actions.length === 0 ? (
              <ClientEmpty
                icon={CheckCircle}
                title="Aucune action requise"
                description="Votre comptable vous avertira dès qu'une action sera nécessaire."
                accent="green"
              />
            ) : (
              <div style={{ display: "grid", gap: "10px" }}>
                {actions.map((a, i) => (
                  <ActionRow key={i} action={a} />
                ))}
              </div>
            )}
          </ClientPanel>

          <ClientPanel>
            <ClientSectionHeader
              icon={Bell}
              title="Mes alertes"
              subtitle="Points de vigilance détectés par votre comptable."
              accent="red"
            />
            {alerts.length === 0 ? (
              <ClientEmpty
                icon={CheckCircle}
                title="Aucune alerte"
                description="Tout est sous contrôle — rien à signaler pour le moment."
                accent="green"
              />
            ) : (
              <div style={{ display: "grid", gap: "10px" }}>
                {alerts.map((a) => (
                  <AlertCard key={a.id} alert={a} />
                ))}
              </div>
            )}
          </ClientPanel>
        </div>

        {/* Conseil du mois — gold panel */}
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            padding: "24px 28px",
            borderRadius: "18px",
            background: "linear-gradient(135deg, rgba(212,175,55,0.10) 0%, rgba(212,175,55,0.02) 100%)",
            border: "1px solid rgba(212,175,55,0.32)",
            boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 18px 40px -24px rgba(212,175,55,0.35)",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: "absolute", top: 0, left: 0, right: 0, height: "3px",
              background: "linear-gradient(90deg, #D4AF37 0%, #E4C547 50%, rgba(212,175,55,0) 100%)",
            }}
          />
          <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
            <div
              aria-hidden="true"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: "44px", height: "44px", flexShrink: 0,
                borderRadius: "12px",
                background: "linear-gradient(135deg, rgba(212,175,55,0.28) 0%, rgba(212,175,55,0.10) 100%)",
                border: "1px solid rgba(212,175,55,0.45)",
                color: "#A88925",
                boxShadow: "0 10px 24px -10px rgba(212,175,55,0.55)",
              }}
            >
              <Lightbulb size={20} strokeWidth={1.8} />
            </div>
            <div>
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "#A88925",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  marginBottom: "4px",
                }}
              >
                <Sparkles size={11} style={{ display: "inline", marginRight: "6px", verticalAlign: "middle" }} />
                Conseil du mois
              </div>
              <h3
                style={{
                  margin: "0 0 8px",
                  fontFamily: FONT,
                  fontSize: "17px",
                  fontWeight: 700,
                  color: "#0B0F2E",
                  letterSpacing: "-0.01em",
                }}
              >
                Recommandation de votre comptable
              </h3>
              <p
                style={{
                  margin: 0,
                  fontFamily: FONT,
                  fontSize: "14px",
                  color: "#334155",
                  lineHeight: 1.7,
                }}
              >
                {brief.conseil_texte ||
                  "Les conseils personnalisés apparaîtront ici une fois vos données analysées par votre comptable."}
              </p>
            </div>
          </div>
        </div>

        {/* Documents récents */}
        <ClientPanel>
          <ClientSectionHeader
            icon={FileText}
            title="Documents récents"
            subtitle="Les derniers documents traités par votre comptable."
            accent="blue"
            actions={
              <Link
                href="/client/documents"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  borderRadius: "10px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#2A6FCC",
                  backgroundColor: "rgba(65,145,255,0.10)",
                  border: "1px solid rgba(65,145,255,0.25)",
                  textDecoration: "none",
                  fontFamily: FONT,
                }}
              >
                Voir tous
                <ArrowRight size={12} />
              </Link>
            }
          />
          {documents.length === 0 ? (
            <ClientEmpty
              icon={FileText}
              title="Aucun document disponible"
              description="Les documents traités apparaîtront ici. Vous pouvez également en déposer depuis l'espace Documents."
              accent="blue"
            />
          ) : (
            <div style={{ display: "grid", gap: "8px" }}>
              {documents.map((d) => (
                <DocumentRow key={d.id} doc={d} />
              ))}
            </div>
          )}
        </ClientPanel>
      </div>
    </ClientPageShell>
  )
}

function ActionRow({ action }: { action: ActionData }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        gap: "16px",
        padding: "14px 16px",
        borderRadius: "12px",
        backgroundColor: "#FFFFFF",
        border: "1px solid #E6EBF7",
      }}
    >
      <div>
        <div style={{ fontFamily: FONT, fontSize: "14px", fontWeight: 600, color: "#0B0F2E" }}>
          {action.quoi}
        </div>
        <div style={{ marginTop: "2px", display: "flex", gap: "12px", fontSize: "12px", color: "#475569" }}>
          <span>
            <Clock size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />
            {action.pourQuand}
          </span>
          <span style={{ fontWeight: 600, color: "#0B0F2E", fontVariantNumeric: "tabular-nums" }}>
            {action.combien}
          </span>
        </div>
      </div>
      {action.fait ? (
        <ClientChip accent="green" icon={Check}>Fait</ClientChip>
      ) : (
        <ClientChip accent="orange" icon={Clock}>À faire</ClientChip>
      )}
    </div>
  )
}

function AlertCard({ alert }: { alert: AlertData }) {
  const colors = {
    red:    { border: "#E25555", bg: "rgba(226,85,85,0.08)",  dot: "#E25555" },
    orange: { border: "#E8A84C", bg: "rgba(232,168,76,0.08)", dot: "#E8A84C" },
    blue:   { border: "#4191FF", bg: "rgba(65,145,255,0.08)", dot: "#4191FF" },
  }[alert.niveau]

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        padding: "14px 16px",
        borderRadius: "12px",
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}55`,
      }}
    >
      <span
        aria-hidden="true"
        className="relative flex h-2.5 w-2.5 shrink-0"
        style={{ marginTop: "4px" }}
      >
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
          style={{ backgroundColor: colors.dot }}
        />
        <span
          className="relative inline-flex h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: colors.dot, boxShadow: `0 0 8px ${colors.dot}` }}
        />
      </span>
      <p
        style={{
          margin: 0,
          fontFamily: FONT,
          fontSize: "13px",
          color: "#334155",
          lineHeight: 1.6,
        }}
      >
        {alert.message}
      </p>
    </div>
  )
}

function DocumentRow({ doc }: { doc: DocumentData }) {
  const accent: "blue" | "orange" | "green" =
    doc.statut === "Classe"
      ? "green"
      : doc.statut === "Question du comptable"
        ? "orange"
        : "blue"
  const label =
    doc.statut === "Analyse en cours" ? "Analyse" : doc.statut === "Question du comptable" ? "Question" : doc.statut

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        alignItems: "center",
        gap: "16px",
        padding: "12px 16px",
        borderRadius: "12px",
        backgroundColor: "#FFFFFF",
        border: "1px solid #E6EBF7",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
        <FileText size={16} style={{ color: "#2A6FCC", flexShrink: 0 }} />
        <span
          style={{
            fontWeight: 500,
            color: "#0B0F2E",
            fontSize: "14px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {doc.nom}
        </span>
      </div>
      <span style={{ fontSize: "12px", color: "#475569", fontVariantNumeric: "tabular-nums" }}>
        {doc.date}
      </span>
      <ClientChip accent={accent} icon={doc.statut === "Analyse en cours" ? Loader2 : doc.statut === "Classe" ? CheckCircle : AlertTriangle}>
        {label}
      </ClientChip>
    </div>
  )
}

export default function ClientDashboard() {
  const { profile, loading } = useProfile()
  const [societe, setSociete] = useState<string>("")
  const [loadingSociete, setLoadingSociete] = useState(true)

  useEffect(() => {
    fetch("/api/client/societes")
      .then((r) => r.json())
      .then((data) => {
        const societes = data.societes || []
        if (societes.length > 0) setSociete(societes[0].nom || "")
      })
      .catch(() => {})
      .finally(() => setLoadingSociete(false))
  }, [])

  if (loading || loadingSociete) {
    return (
      <ClientPageShell hideHero disableParticles>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "120px 0" }}>
          <Loader2 className="animate-spin" size={28} style={{ color: "#D4AF37" }} />
        </div>
      </ClientPageShell>
    )
  }

  const fullName = profile?.full_name || ""
  const firstName = fullName.split(" ")[0] || ""
  const isClientUser = profile?.role === "client_user"

  if (isClientUser) {
    return <ClientUserDashboard firstName={firstName} />
  }

  return <ClientAdminDashboard firstName={firstName} societe={societe || "Mon entreprise"} />
}
