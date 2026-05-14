"use client"

/**
 * /inscription — futuristic adaptive lead capture.
 *
 * Two-role form (Expert-Comptable | Entreprise) with an "I don't know"
 * escape hatch. Each role surfaces a tailored set of fields (cabinet
 * profile vs. company profile) plus a shared needs-checklist over the
 * 7 Lexora modules and a free-form message. Submits to FormSubmit
 * (same backend pattern as components/contact.tsx).
 *
 * Design: dark navy, live particle field, glassmorphic card, animated
 * role selector, check-grid for module needs, success state with
 * CheckCircle. Respects prefers-reduced-motion via the motion helpers.
 */

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import {
  Sparkles,
  Briefcase,
  Building2,
  HelpCircle,
  Loader2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  FileSearch,
  BookOpen,
  FileText,
  Users,
  Scale,
  Landmark,
  HeartPulse,
  type LucideIcon,
} from "lucide-react"
import { LexoraLogo } from "@/components/LexoraLogo"
import { ParticleField } from "@/components/ParticleField"
import { FadeSlide, PressableWrap } from "@/components/ui/motion"
import { Button } from "@/components/ui/button"
import { t, getLocale, type Locale } from "@/lib/i18n"

type Role = "expert" | "entreprise" | "unknown"

type Needs = Record<string, boolean>

const buildModules = (locale: Locale): { key: string; label: string; icon: LucideIcon; accent: "blue" | "gold" | "green" }[] => [
  { key: "ocr",       label: t('adm.inscription.mod_ocr', locale),         icon: FileSearch,  accent: "blue" },
  { key: "compta",    label: t('adm.inscription.mod_compta', locale),      icon: BookOpen,    accent: "gold" },
  { key: "facturation", label: t('adm.inscription.mod_facturation', locale), icon: FileText,    accent: "blue" },
  { key: "rh",        label: t('adm.inscription.mod_rh', locale),          icon: Users,       accent: "gold" },
  { key: "juridique", label: t('adm.inscription.mod_juridique', locale),   icon: Scale,       accent: "blue" },
  { key: "fiscal",    label: t('adm.inscription.mod_fiscal', locale),      icon: Landmark,    accent: "gold" },
  { key: "sante",     label: t('adm.inscription.mod_sante', locale),       icon: HeartPulse,  accent: "green" },
]

const ACCENTS = {
  blue: "#4191FF",
  gold: "#D4AF37",
  green: "#2ECC8A",
} as const

const FONT = "'Poppins', sans-serif"

function InscriptionPageInner() {
  const locale = getLocale()
  const MODULES = buildModules(locale)
  const prefersReducedMotion = useReducedMotion()
  const params = useSearchParams()
  const roleParam = params?.get("role") ?? null
  const initialRole: Role =
    roleParam === "expert" || roleParam === "expert-comptable"
      ? "expert"
      : roleParam === "unknown"
        ? "unknown"
        : "entreprise"

  const [role, setRole] = React.useState<Role>(initialRole)

  // Shared contact
  const [firstName, setFirstName] = React.useState("")
  const [lastName, setLastName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [message, setMessage] = React.useState("")

  // Expert-Comptable specific
  const [cabinetName, setCabinetName] = React.useState("")
  const [mipaId, setMipaId] = React.useState("")
  const [clientsCount, setClientsCount] = React.useState<string>("")

  // Entreprise specific
  const [companyName, setCompanyName] = React.useState("")
  const [brn, setBrn] = React.useState("")
  const [sector, setSector] = React.useState("")
  const [employees, setEmployees] = React.useState<number>(10)

  const [needs, setNeeds] = React.useState<Needs>({})
  const [agree, setAgree] = React.useState(false)

  const [sending, setSending] = React.useState(false)
  const [sent, setSent] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const toggleNeed = (key: string) =>
    setNeeds((prev) => ({ ...prev, [key]: !prev[key] }))

  const selectedNeeds = Object.entries(needs).filter(([, v]) => v).map(([k]) => k)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!firstName || !email || !agree) {
      setError(t('adm.inscription.req_required', locale))
      return
    }
    setSending(true)
    try {
      const roleLabel =
        role === "expert" ? "Expert-Comptable"
        : role === "entreprise" ? "Entreprise / Professionnel"
        : "À préciser"

      const body: Record<string, string> = {
        Role: roleLabel,
        Prénom: firstName,
        Nom: lastName,
        Email: email,
        Téléphone: phone || "—",
        Message: message || "—",
        Modules_intéressés:
          selectedNeeds.length > 0
            ? selectedNeeds
                .map((k) => MODULES.find((m) => m.key === k)?.label ?? k)
                .join(", ")
            : "Aucun précisé",
        _subject: `[Lexora inscription] ${roleLabel} — ${firstName} ${lastName}`,
        _template: "table",
      }
      if (role === "expert") {
        body.Cabinet = cabinetName || "—"
        body["N° MIPA"] = mipaId || "—"
        body["Clients actifs"] = clientsCount || "—"
      } else if (role === "entreprise") {
        body.Société = companyName || "—"
        body.BRN = brn || "—"
        body.Secteur = sector || "—"
        body["Effectif salariés"] = String(employees)
      }

      const res = await fetch(
        "https://formsubmit.co/ajax/contact@lexora.finance",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      )
      if (!res.ok) {
        setError(t('adm.inscription.err_send', locale))
        return
      }
      setSent(true)
    } catch {
      setError(t('adm.inscription.err_connection', locale))
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ backgroundColor: "#0B0F2E", fontFamily: FONT }}
    >
      {/* Live particle field */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ opacity: 0.5 }}
      >
        <ParticleField
          density={0.9}
          color="rgba(65,145,255,0.70)"
          linkColor="rgba(65,145,255,0.20)"
          linkDistance={140}
          speed={0.25}
        />
      </div>
      {/* Ambient glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 45% 45% at 20% 20%, rgba(65,145,255,0.22) 0%, transparent 70%), radial-gradient(ellipse 45% 45% at 80% 80%, rgba(212,175,55,0.18) 0%, transparent 70%)",
        }}
      />

      {/* NAV */}
      <header
        className="relative z-10"
        style={{ borderBottom: "1px solid rgba(30,39,96,0.6)" }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6">
          <LexoraLogo href="/" size="md" showBaseline />
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-white/5"
            style={{
              color: "#A8AFC7",
              borderColor: "rgba(30,39,96,0.9)",
            }}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            {t('adm.inscription.back', locale)}
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-14 sm:px-6">
        {/* HERO */}
        <FadeSlide delay={0} y={16}>
          <div className="mb-10 text-center">
            <span
              className="mb-5 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-widest"
              style={{
                backgroundColor: "rgba(212,175,55,0.10)",
                color: "#D4AF37",
                borderColor: "rgba(212,175,55,0.32)",
              }}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {t('adm.inscription.badge', locale)}
            </span>
            <h1
              className="mb-5 text-4xl font-bold tracking-tight md:text-6xl"
              style={{
                color: "#E8EAFC",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1.05,
              }}
            >
              {t('adm.inscription.hero_join', locale)}{" "}
              <span
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, #4191FF 0%, #D4AF37 50%, #2ECC8A 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                Lexora
              </span>
            </h1>
            <p
              className="mx-auto max-w-2xl text-base md:text-lg"
              style={{
                color: "#A8AFC7",
                fontWeight: 300,
                lineHeight: 1.7,
              }}
            >
              {t('adm.inscription.hero_desc', locale)}
            </p>
          </div>
        </FadeSlide>

        {/* FORM CARD */}
        <FadeSlide delay={0.15} y={20}>
          <form
            onSubmit={handleSubmit}
            className="relative overflow-hidden rounded-3xl p-6 sm:p-10"
            style={{
              backgroundColor: "rgba(16,24,71,0.75)",
              border: "1px solid rgba(65,145,255,0.28)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              boxShadow:
                "0 40px 80px -30px rgba(0,0,0,0.6), 0 0 0 1px rgba(232,234,252,0.04), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            {sent ? (
              <div className="py-14 text-center">
                <motion.div
                  initial={prefersReducedMotion ? false : { scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(46,204,138,0.28) 0%, rgba(46,204,138,0.08) 100%)",
                    border: "1px solid rgba(46,204,138,0.55)",
                    boxShadow: "0 0 40px rgba(46,204,138,0.40)",
                  }}
                >
                  <CheckCircle2
                    size={36}
                    strokeWidth={2}
                    style={{ color: "#2ECC8A" }}
                    aria-hidden="true"
                  />
                </motion.div>
                <h2
                  className="mb-3 text-2xl font-bold md:text-3xl"
                  style={{ color: "#E8EAFC", letterSpacing: "-0.02em" }}
                >
                  {t('adm.inscription.thanks', locale)} {firstName || ""} — {t('adm.inscription.thanks_suffix', locale)}
                </h2>
                <p
                  className="mx-auto max-w-md text-sm md:text-base"
                  style={{ color: "#A8AFC7", lineHeight: 1.7 }}
                >
                  {t('adm.inscription.success_desc', locale)}
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  <PressableWrap>
                    <Link href="/tarifs">
                      <Button
                        size="lg"
                        className="px-6"
                        style={{
                          backgroundColor: "#4191FF",
                          color: "#FFFFFF",
                          fontWeight: 600,
                          borderRadius: "10px",
                        }}
                      >
                        {t('adm.inscription.see_pricing', locale)}
                        <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                      </Button>
                    </Link>
                  </PressableWrap>
                  <PressableWrap>
                    <Link href="/">
                      <Button
                        size="lg"
                        variant="outline"
                        className="px-6"
                        style={{
                          border: "1px solid rgba(232,234,252,0.20)",
                          backgroundColor: "rgba(232,234,252,0.04)",
                          color: "#E8EAFC",
                          fontWeight: 500,
                          borderRadius: "10px",
                        }}
                      >
                        {t('adm.inscription.back_home', locale)}
                      </Button>
                    </Link>
                  </PressableWrap>
                </div>
              </div>
            ) : (
              <>
                {/* ROLE SELECTOR */}
                <div className="mb-8">
                  <label
                    className="mb-3 block text-xs font-bold uppercase tracking-[0.16em]"
                    style={{ color: "#D4AF37" }}
                  >
                    {t('adm.inscription.step1', locale)}
                  </label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <RoleCard
                      selected={role === "entreprise"}
                      onClick={() => setRole("entreprise")}
                      icon={Building2}
                      title={t('adm.inscription.role_entreprise', locale)}
                      desc={t('adm.inscription.role_entreprise_desc', locale)}
                      accent={ACCENTS.blue}
                    />
                    <RoleCard
                      selected={role === "expert"}
                      onClick={() => setRole("expert")}
                      icon={Briefcase}
                      title={t('adm.inscription.role_expert', locale)}
                      desc={t('adm.inscription.role_expert_desc', locale)}
                      accent={ACCENTS.gold}
                    />
                    <RoleCard
                      selected={role === "unknown"}
                      onClick={() => setRole("unknown")}
                      icon={HelpCircle}
                      title={t('adm.inscription.role_unknown', locale)}
                      desc={t('adm.inscription.role_unknown_desc', locale)}
                      accent={ACCENTS.green}
                    />
                  </div>
                </div>

                {/* ROLE-SPECIFIC FIELDS */}
                <div className="mb-8">
                  <label
                    className="mb-3 block text-xs font-bold uppercase tracking-[0.16em]"
                    style={{ color: "#D4AF37" }}
                  >
                    {role === "expert" ? t('adm.inscription.step2_cabinet', locale) : t('adm.inscription.step2_struct', locale)}
                  </label>
                  <AnimatePresence mode="wait">
                    {role === "expert" && (
                      <motion.div
                        key="expert"
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
                        transition={{ duration: 0.25 }}
                        className="grid gap-4 sm:grid-cols-2"
                      >
                        <Field
                          label={t('adm.inscription.cabinet_name', locale)}
                          value={cabinetName}
                          onChange={setCabinetName}
                          placeholder={t('adm.inscription.cabinet_name_ph', locale)}
                        />
                        <Field
                          label={t('adm.inscription.mipa', locale)}
                          value={mipaId}
                          onChange={setMipaId}
                          placeholder={t('adm.inscription.mipa_ph', locale)}
                        />
                        <Field
                          label={t('adm.inscription.clients_active', locale)}
                          value={clientsCount}
                          onChange={setClientsCount}
                          placeholder={t('adm.inscription.clients_active_ph', locale)}
                          span={2}
                        />
                      </motion.div>
                    )}

                    {role === "entreprise" && (
                      <motion.div
                        key="entreprise"
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
                        transition={{ duration: 0.25 }}
                        className="grid gap-4 sm:grid-cols-2"
                      >
                        <Field
                          label={t('adm.inscription.company_name', locale)}
                          value={companyName}
                          onChange={setCompanyName}
                          placeholder={t('adm.inscription.company_name_ph', locale)}
                        />
                        <Field
                          label={t('adm.inscription.brn', locale)}
                          value={brn}
                          onChange={setBrn}
                          placeholder={t('adm.inscription.brn_ph', locale)}
                        />
                        <Field
                          label={t('adm.inscription.sector', locale)}
                          value={sector}
                          onChange={setSector}
                          placeholder={t('adm.inscription.sector_ph', locale)}
                          span={2}
                        />
                        <div className="sm:col-span-2">
                          <label
                            className="mb-2 block text-xs font-medium"
                            style={{ color: "#A8AFC7" }}
                          >
                            {t('adm.inscription.employees_label', locale)}{" "}
                            <strong style={{ color: "#D4AF37" }}>{employees}</strong>
                          </label>
                          <input
                            type="range"
                            min={1}
                            max={200}
                            value={employees}
                            onChange={(e) => setEmployees(Number(e.target.value))}
                            className="w-full"
                            style={{
                              appearance: "none",
                              height: "6px",
                              borderRadius: "3px",
                              background: `linear-gradient(to right, #D4AF37 0%, #D4AF37 ${((employees - 1) / 199) * 100}%, rgba(232,234,252,0.10) ${((employees - 1) / 199) * 100}%, rgba(232,234,252,0.10) 100%)`,
                              outline: "none",
                            }}
                          />
                          <p
                            className="mt-1 text-xs"
                            style={{ color: "#A8AFC7" }}
                          >
                            {t('adm.inscription.employees_hint', locale)}
                          </p>
                        </div>
                      </motion.div>
                    )}

                    {role === "unknown" && (
                      <motion.div
                        key="unknown"
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
                        transition={{ duration: 0.25 }}
                        className="rounded-xl p-5"
                        style={{
                          backgroundColor: "rgba(46,204,138,0.08)",
                          border: "1px solid rgba(46,204,138,0.35)",
                          color: "#A8AFC7",
                          fontSize: "14px",
                          lineHeight: 1.65,
                        }}
                      >
                        {t('adm.inscription.unknown_help', locale)}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* NEEDS */}
                <div className="mb-8">
                  <label
                    className="mb-3 block text-xs font-bold uppercase tracking-[0.16em]"
                    style={{ color: "#D4AF37" }}
                  >
                    {t('adm.inscription.step3', locale)}
                  </label>
                  <p className="mb-4 text-xs" style={{ color: "#A8AFC7" }}>
                    {t('adm.inscription.step3_hint', locale)}
                  </p>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {MODULES.map((m) => {
                      const checked = !!needs[m.key]
                      const color = ACCENTS[m.accent]
                      return (
                        <button
                          type="button"
                          key={m.key}
                          onClick={() => toggleNeed(m.key)}
                          aria-pressed={checked}
                          className="group relative flex flex-col items-start gap-2 rounded-xl p-4 text-left transition-all"
                          style={{
                            backgroundColor: checked
                              ? `${color}1F`
                              : "rgba(232,234,252,0.04)",
                            border: `1px solid ${checked ? color : "rgba(232,234,252,0.08)"}`,
                            boxShadow: checked
                              ? `0 0 0 1px ${color}, 0 10px 24px -10px ${color}55`
                              : "none",
                          }}
                        >
                          <span
                            className="flex h-10 w-10 items-center justify-center rounded-lg"
                            style={{
                              background: `linear-gradient(135deg, ${color}33 0%, ${color}11 100%)`,
                              border: `1px solid ${color}40`,
                            }}
                            aria-hidden="true"
                          >
                            <m.icon size={18} strokeWidth={1.8} style={{ color }} />
                          </span>
                          <span
                            className="text-sm font-semibold"
                            style={{ color: "#E8EAFC", letterSpacing: "-0.005em" }}
                          >
                            {m.label}
                          </span>
                          {checked && (
                            <CheckCircle2
                              size={14}
                              strokeWidth={2.5}
                              className="absolute right-3 top-3"
                              style={{ color }}
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* CONTACT */}
                <div className="mb-8">
                  <label
                    className="mb-3 block text-xs font-bold uppercase tracking-[0.16em]"
                    style={{ color: "#D4AF37" }}
                  >
                    {t('adm.inscription.step4', locale)}
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label={t('adm.inscription.first_name', locale)}
                      value={firstName}
                      onChange={setFirstName}
                      placeholder={t('adm.inscription.first_name_ph', locale)}
                      required
                    />
                    <Field
                      label={t('adm.inscription.last_name', locale)}
                      value={lastName}
                      onChange={setLastName}
                      placeholder={t('adm.inscription.last_name_ph', locale)}
                    />
                    <Field
                      label={t('adm.inscription.email', locale)}
                      value={email}
                      onChange={setEmail}
                      placeholder={t('adm.inscription.email_ph', locale)}
                      type="email"
                      required
                    />
                    <Field
                      label={t('adm.inscription.phone', locale)}
                      value={phone}
                      onChange={setPhone}
                      placeholder={t('adm.inscription.phone_ph', locale)}
                      type="tel"
                    />
                    <div className="sm:col-span-2">
                      <label
                        className="mb-2 block text-xs font-medium"
                        style={{ color: "#A8AFC7" }}
                      >
                        {t('adm.inscription.message_label', locale)}
                      </label>
                      <textarea
                        rows={4}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder={t('adm.inscription.message_ph', locale)}
                        className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors focus:ring-2"
                        style={{
                          backgroundColor: "rgba(11,15,46,0.7)",
                          border: "1px solid rgba(232,234,252,0.10)",
                          color: "#E8EAFC",
                          fontFamily: FONT,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* CONSENT */}
                <label
                  className="mb-6 flex items-start gap-3 rounded-xl p-4"
                  style={{
                    backgroundColor: "rgba(232,234,252,0.04)",
                    border: "1px solid rgba(232,234,252,0.08)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={agree}
                    onChange={(e) => setAgree(e.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 cursor-pointer"
                    style={{ accentColor: "#4191FF" }}
                  />
                  <span className="text-xs" style={{ color: "#A8AFC7", lineHeight: 1.6 }}>
                    {t('adm.inscription.consent_pre', locale)}{" "}
                    <strong style={{ color: "#E8EAFC" }}>
                      {t('adm.inscription.consent_org', locale)}
                    </strong>{" "}
                    {t('adm.inscription.consent_mid', locale)}{" "}
                    <Link
                      href="/protection-donnees"
                      className="underline"
                      style={{ color: "#4191FF" }}
                    >
                      {t('adm.inscription.consent_charter', locale)}
                    </Link>{" "}
                    {t('adm.inscription.consent_and', locale)}{" "}
                    <Link
                      href="/cgu"
                      className="underline"
                      style={{ color: "#4191FF" }}
                    >
                      {t('adm.inscription.consent_cgu', locale)}
                    </Link>
                    .
                  </span>
                </label>

                {error && (
                  <div
                    role="alert"
                    className="mb-5 rounded-xl px-4 py-3 text-sm"
                    style={{
                      backgroundColor: "rgba(232,168,76,0.10)",
                      border: "1px solid rgba(232,168,76,0.40)",
                      color: "#E8A84C",
                    }}
                  >
                    {error}
                  </div>
                )}

                {/* SUBMIT */}
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                  <p className="text-xs" style={{ color: "#A8AFC7" }}>
                    {t('adm.inscription.footer_note', locale)}
                  </p>
                  <PressableWrap>
                    <Button
                      type="submit"
                      size="lg"
                      disabled={sending}
                      className="min-w-[240px] px-8 text-base font-bold"
                      style={{
                        background:
                          "linear-gradient(90deg, #4191FF 0%, #D4AF37 100%)",
                        color: "#0B0F2E",
                        borderRadius: "12px",
                        fontWeight: 700,
                        boxShadow:
                          "0 12px 28px -10px rgba(212,175,55,0.55), 0 0 0 1px rgba(212,175,55,0.25)",
                      }}
                    >
                      {sending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                          {t('adm.inscription.sending', locale)}
                        </>
                      ) : (
                        <>
                          {t('adm.inscription.send', locale)}
                          <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
                        </>
                      )}
                    </Button>
                  </PressableWrap>
                </div>
              </>
            )}
          </form>
        </FadeSlide>

        {/* REASSURANCE STRIP */}
        {!sent && (
          <FadeSlide delay={0.3} y={12}>
            <div
              className="mt-10 grid gap-4 text-sm sm:grid-cols-3"
              style={{ color: "#A8AFC7" }}
            >
              {[
                { k: t('adm.inscription.security', locale), v: t('adm.inscription.security_v', locale) },
                { k: t('adm.inscription.compliance', locale), v: t('adm.inscription.compliance_v', locale) },
                { k: t('adm.inscription.no_commitment', locale), v: t('adm.inscription.no_commitment_v', locale) },
              ].map((item) => (
                <div
                  key={item.k}
                  className="rounded-xl p-4"
                  style={{
                    backgroundColor: "rgba(232,234,252,0.04)",
                    border: "1px solid rgba(232,234,252,0.08)",
                  }}
                >
                  <div
                    className="mb-1 text-xs font-bold uppercase tracking-widest"
                    style={{ color: "#D4AF37" }}
                  >
                    {item.k}
                  </div>
                  <div style={{ color: "#E8EAFC", fontSize: "13px" }}>{item.v}</div>
                </div>
              ))}
            </div>
          </FadeSlide>
        )}
      </main>
    </div>
  )
}

function RoleCard({
  selected,
  onClick,
  icon: Icon,
  title,
  desc,
  accent,
}: {
  selected: boolean
  onClick: () => void
  icon: LucideIcon
  title: string
  desc: string
  accent: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="group relative overflow-hidden rounded-2xl p-5 text-left transition-all"
      style={{
        backgroundColor: selected ? `${accent}1F` : "rgba(232,234,252,0.04)",
        border: `1px solid ${selected ? accent : "rgba(232,234,252,0.08)"}`,
        boxShadow: selected ? `0 10px 30px -10px ${accent}70, 0 0 0 1px ${accent}` : "none",
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{
            background: `linear-gradient(135deg, ${accent}33 0%, ${accent}11 100%)`,
            border: `1px solid ${accent}50`,
          }}
          aria-hidden="true"
        >
          <Icon size={20} strokeWidth={1.8} style={{ color: accent }} />
        </span>
        {selected && (
          <CheckCircle2
            size={18}
            strokeWidth={2.5}
            style={{ color: accent }}
            aria-hidden="true"
          />
        )}
      </div>
      <div className="text-base font-bold" style={{ color: "#E8EAFC", letterSpacing: "-0.01em" }}>
        {title}
      </div>
      <div className="mt-0.5 text-xs" style={{ color: "#A8AFC7" }}>
        {desc}
      </div>
    </button>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  span,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: "text" | "email" | "tel"
  required?: boolean
  span?: 2
}) {
  return (
    <div className={span === 2 ? "sm:col-span-2" : ""}>
      <label
        className="mb-2 block text-xs font-medium"
        style={{ color: "#A8AFC7" }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-xl px-4 py-3 text-sm outline-none focus:ring-2"
        style={{
          backgroundColor: "rgba(11,15,46,0.7)",
          border: "1px solid rgba(232,234,252,0.10)",
          color: "#E8EAFC",
          fontFamily: FONT,
        }}
      />
    </div>
  )
}

// useSearchParams requires a Suspense boundary in App Router.
export default function InscriptionPage() {
  return (
    <React.Suspense fallback={<div style={{ backgroundColor: "#0B0F2E", minHeight: "100vh" }} />}>
      <InscriptionPageInner />
    </React.Suspense>
  )
}
