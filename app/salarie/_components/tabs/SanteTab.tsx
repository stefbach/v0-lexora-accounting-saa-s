"use client"
import { useState } from "react"
import { Card } from "@/components/ui/card"
import {
  LayoutDashboard, Video, Calendar, FileText, Pill, Activity,
  CreditCard, User, Stethoscope, ShieldCheck, HeartPulse, Scan,
  Clock, CheckCircle, MapPin, X, Play,
} from "lucide-react"
import { NAVY } from "../shared/constants"

// Extrait du monolithe page.tsx pendant le sprint-salarie V0.1.
// Iso-fonctionnel. La simplification vers un CTA unique viendra en V3.4.
export function SanteTab({ employe }: { employe: any }) {
  const [santeTab, setSanteTab] = useState("dashboard")
  const TEAL = "#2a9d8f"

  const santeNav = [
    { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
    { id: "salle_attente", label: "Salle d'attente", icon: Video },
    { id: "rdv", label: "RDV a venir", icon: Calendar },
    { id: "consultations", label: "Vos Consultations", icon: FileText },
    { id: "pharmacie", label: "Pharmacie (Ordonnances)", icon: Pill },
    { id: "analyses", label: "Analyses & Examens", icon: Activity },
    { id: "abonnement", label: "Abonnement", icon: CreditCard },
    { id: "famille", label: "Famille", icon: User },
    { id: "second_avis", label: "Second Avis Medical", icon: Stethoscope },
    { id: "assurance", label: "Validation Assurance", icon: ShieldCheck },
    { id: "suivi", label: "Suivi Chronique", icon: HeartPulse },
    { id: "silentcheck", label: "SilentCheck", icon: Scan },
  ]

  const ProcessFlow = ({ title, icon: FlowIcon, steps }: { title: string; icon: any; steps: { icon: any; label: string; desc: string; color: string }[] }) => (
    <Card className="rounded-2xl border shadow-sm mb-4">
      <div className="p-5">
        <div className="flex items-center gap-2 mb-5">
          <FlowIcon className="h-5 w-5" style={{ color: TEAL }} />
          <h3 className="text-base font-semibold" style={{ color: NAVY }}>{title}</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          {steps.map((step, i) => (
            <div key={i} className="flex flex-col items-center text-center">
              <div className="h-14 w-14 rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: `${step.color}12` }}>
                <step.icon className="h-6 w-6" style={{ color: step.color }} />
              </div>
              <p className="text-xs font-semibold" style={{ color: NAVY }}>{step.label}</p>
              <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )

  return (
    <div className="flex gap-0 -mx-4 md:-mx-6 min-h-[70vh]">
      <div className="hidden md:flex flex-col w-56 shrink-0 bg-white border-r pt-4">
        <div className="px-4 mb-5">
          <span className="text-2xl font-black tracking-tight" style={{ color: TEAL }}>TIB</span>
          <span className="text-2xl font-black tracking-tight bg-clip-text" style={{ color: "#2563eb" }}>O</span>
          <span className="text-2xl font-black tracking-tight" style={{ color: TEAL }}>K</span>
        </div>
        <nav className="flex-1 px-2 space-y-0.5">
          {santeNav.map(item => (
            <button key={item.id} onClick={() => setSanteTab(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-sm transition-all ${
                santeTab === item.id ? "text-white font-medium" : "text-gray-600 hover:bg-gray-50"
              }`}
              style={santeTab === item.id ? { backgroundColor: TEAL } : {}}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="md:hidden flex overflow-x-auto gap-1 bg-white border-b px-2 py-2 -mt-2 mb-3 sticky top-0 z-10">
        {santeNav.slice(0, 6).map(item => (
          <button key={item.id} onClick={() => setSanteTab(item.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-all ${
              santeTab === item.id ? "text-white" : "text-gray-500 bg-gray-100"
            }`}
            style={santeTab === item.id ? { backgroundColor: TEAL } : {}}
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex-1 p-4 md:p-6 overflow-y-auto">
        {santeTab === "dashboard" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl md:text-2xl font-bold" style={{ color: NAVY }}>Bonjour {employe?.prenom}</h2>
              <p className="text-gray-400 text-sm">Votre sante au bout des doigts</p>
            </div>

            <Card className="rounded-2xl border-0 shadow-md overflow-hidden">
              <div className="h-1.5 w-full" style={{ backgroundColor: TEAL }} />
              <div className="p-8 text-center">
                <div className="h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${TEAL}10` }}>
                  <Video className="h-7 w-7" style={{ color: TEAL }} />
                </div>
                <p className="text-lg font-semibold" style={{ color: TEAL }}>Consultation immediate ou sur Rendez-vous</p>
                <div className="flex items-center justify-center gap-3 mt-3">
                  <span className="px-3 py-1 rounded-full text-xs border" style={{ borderColor: TEAL, color: TEAL }}>Securise</span>
                  <span className="px-3 py-1 rounded-full text-xs border" style={{ borderColor: TEAL, color: TEAL }}>Certifie</span>
                </div>
                <button className="mt-5 w-full md:w-auto px-8 py-3.5 rounded-full text-white font-semibold text-sm flex items-center justify-center gap-2 mx-auto transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ backgroundColor: TEAL }}
                  onClick={() => window.open("https://tibok.mu", "_blank", "noopener,noreferrer")}
                >
                  Commencer <Play className="h-4 w-4" style={{ marginLeft: 2 }} />
                </button>
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { icon: FileText, label: "Vos Consultations", desc: "Rapports et ordonnances", tab: "consultations" },
                { icon: Pill, label: "Pharmacie (Ordonnances)", desc: "Gerer vos commandes", tab: "pharmacie" },
              ].map((item, i) => (
                <button key={i} onClick={() => setSanteTab(item.tab)}
                  className="w-full text-left rounded-2xl border shadow-sm overflow-hidden hover:shadow-md transition-all active:scale-[0.99]">
                  <div className="h-1" style={{ backgroundColor: TEAL }} />
                  <div className="p-4 flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${TEAL}10` }}>
                      <item.icon className="h-5 w-5" style={{ color: TEAL }} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold" style={{ color: NAVY }}>{item.label}</p>
                      <p className="text-xs text-gray-400">{item.desc}</p>
                    </div>
                    <Play className="h-4 w-4 text-gray-300 shrink-0" />
                  </div>
                </button>
              ))}
            </div>

            <button onClick={() => setSanteTab("suivi")}
              className="w-full text-left rounded-2xl border shadow-sm overflow-hidden hover:shadow-md transition-all active:scale-[0.99]">
              <div className="h-1" style={{ backgroundColor: TEAL }} />
              <div className="p-4 flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${TEAL}10` }}>
                  <HeartPulse className="h-5 w-5" style={{ color: TEAL }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold" style={{ color: NAVY }}>Suivi Maladies Chroniques</p>
                  <p className="text-xs text-gray-400">Tension, glycemie, poids</p>
                </div>
                <Play className="h-4 w-4 text-gray-300 shrink-0" />
              </div>
            </button>

            <ProcessFlow title="Comment ca marche - Pharmacie" icon={Pill} steps={[
              { icon: CreditCard, label: "Paiement", desc: "Paiement securise de Rs 800", color: TEAL },
              { icon: Clock, label: "File d'attente", desc: "Rejoignez la file virtuelle", color: "#f59e0b" },
              { icon: Video, label: "Consultation video", desc: "Consultez un medecin qualifie", color: TEAL },
              { icon: Stethoscope, label: "Diagnostic", desc: "Recevez votre diagnostic", color: "#059669" },
              { icon: FileText, label: "Ordonnance numerique", desc: "Generee automatiquement", color: "#2563eb" },
            ]} />

            <ProcessFlow title="Comment ca marche - Laboratoire" icon={Activity} steps={[
              { icon: CreditCard, label: "Paiement", desc: "Paiement securise de Rs 800", color: TEAL },
              { icon: Clock, label: "File d'attente", desc: "Rejoignez la file virtuelle", color: "#f59e0b" },
              { icon: Video, label: "Consultation video", desc: "Consultez un medecin qualifie", color: TEAL },
              { icon: Stethoscope, label: "Diagnostic", desc: "Recevez votre diagnostic", color: "#059669" },
              { icon: FileText, label: "Ordonnance numerique", desc: "Generee automatiquement", color: "#2563eb" },
            ]} />
            <div className="ml-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 px-5 pb-5">
                {[
                  { icon: CheckCircle, label: "Validation analyses", desc: "Validez vos analyses prescrites", color: TEAL },
                  { icon: Calendar, label: "Choix du laboratoire", desc: "Selectionnez le labo et le mode", color: "#f59e0b" },
                  { icon: CreditCard, label: "Paiement analyses", desc: "Paiement securise", color: TEAL },
                  { icon: Stethoscope, label: "Prelevement", desc: "A domicile ou au laboratoire", color: "#7c3aed" },
                  { icon: FileText, label: "Resultats", desc: "Sur votre espace patient", color: "#2563eb" },
                ].map((step, i) => (
                  <div key={i} className="flex flex-col items-center text-center">
                    <div className="h-14 w-14 rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: `${step.color}12` }}>
                      <step.icon className="h-6 w-6" style={{ color: step.color }} />
                    </div>
                    <p className="text-xs font-semibold" style={{ color: NAVY }}>{step.label}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{step.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <ProcessFlow title="Comment ca marche - Radiologie" icon={Scan} steps={[
              { icon: CreditCard, label: "Paiement", desc: "Paiement securise de Rs 800", color: TEAL },
              { icon: Clock, label: "File d'attente", desc: "Rejoignez la file virtuelle", color: "#f59e0b" },
              { icon: Video, label: "Consultation video", desc: "Consultez un medecin qualifie", color: TEAL },
              { icon: Stethoscope, label: "Diagnostic", desc: "Recevez votre diagnostic", color: "#059669" },
              { icon: FileText, label: "Ordonnance numerique", desc: "Generee automatiquement", color: "#2563eb" },
            ]} />
            <div className="ml-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 px-5 pb-5">
                {[
                  { icon: CheckCircle, label: "Validation examens", desc: "Validez vos examens prescrits", color: TEAL },
                  { icon: Calendar, label: "Choix du centre", desc: "Selectionnez le centre de radiologie", color: "#f59e0b" },
                  { icon: CreditCard, label: "Paiement examens", desc: "Paiement securise", color: TEAL },
                  { icon: MapPin, label: "Rendez-vous", desc: "Presentez-vous au centre", color: "#7c3aed" },
                  { icon: FileText, label: "Resultats", desc: "Resultats et images sur votre espace", color: "#2563eb" },
                ].map((step, i) => (
                  <div key={i} className="flex flex-col items-center text-center">
                    <div className="h-14 w-14 rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: `${step.color}12` }}>
                      <step.icon className="h-6 w-6" style={{ color: step.color }} />
                    </div>
                    <p className="text-xs font-semibold" style={{ color: NAVY }}>{step.label}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{step.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {santeTab !== "dashboard" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button onClick={() => setSanteTab("dashboard")} className="h-8 w-8 rounded-lg flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors">
                <X className="h-4 w-4 text-gray-500" />
              </button>
              <h2 className="text-lg font-bold" style={{ color: NAVY }}>
                {santeNav.find(n => n.id === santeTab)?.label}
              </h2>
            </div>
            <Card className="rounded-2xl">
              <div className="p-12 text-center">
                <div className="h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${TEAL}10` }}>
                  {(() => { const NavIcon = santeNav.find(n => n.id === santeTab)?.icon || HeartPulse; return <NavIcon className="h-7 w-7" style={{ color: TEAL }} /> })()}
                </div>
                <p className="text-sm font-semibold" style={{ color: NAVY }}>
                  {santeNav.find(n => n.id === santeTab)?.label}
                </p>
                <p className="text-xs text-gray-400 mt-2 max-w-sm mx-auto">
                  Cette section sera connectee a votre espace TIBOK. Cliquez ci-dessous pour acceder a la plateforme complete.
                </p>
                <button className="mt-5 px-6 py-3 rounded-full text-white font-medium text-sm inline-flex items-center gap-2 transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ backgroundColor: TEAL }}
                  onClick={() => window.open("https://tibok.mu", "_blank", "noopener,noreferrer")}
                >
                  Ouvrir sur TIBOK <Play className="h-4 w-4" />
                </button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
