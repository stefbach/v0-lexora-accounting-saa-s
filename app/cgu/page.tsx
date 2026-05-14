"use client"

import {
  Info,
  Building2,
  LayoutGrid,
  KeyRound,
  Users,
  ShieldCheck,
  Lock,
  XCircle,
  AlertTriangle,
  Scale,
  Brain,
  HeartPulse,
} from "lucide-react"
import {
  LegalShell,
  LegalSection,
  LegalField,
  LegalSubtitle,
} from "@/components/legal/LegalShell"
import { t, getLocale, type Locale } from "@/lib/i18n"

export default function CGUPage() {
  const locale: Locale = getLocale()
  return (
    <LegalShell
      eyebrow={t('pub.cgu.eyebrow', locale)}
      title={t('pub.cgu.title', locale)}
      subtitle={
        <span dangerouslySetInnerHTML={{ __html: t('pub.cgu.subtitle_html', locale) }} />
      }
    >
      {/* 1. Préambule */}
      <LegalSection icon={Info} title={t('pub.cgu.s1_title', locale)}>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s1_p1', locale) }} />
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s1_p2', locale) }} />
        <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s1_p3', locale) }} />
      </LegalSection>

      {/* 2. Identité */}
      <LegalSection icon={Building2} title={t('pub.cgu.s2_title', locale)}>
        <dl style={{ margin: 0 }}>
          <LegalField label={t('pub.cgu.s2_l1', locale)} value="Lexora" />
          <LegalField label={t('pub.cgu.s2_l2', locale)} value="Digital Data Solutions Ltd" />
          <LegalField label={t('pub.cgu.s2_l3', locale)} value={t('pub.cgu.s2_l3_v', locale)} />
          <LegalField label={t('pub.cgu.s2_l4', locale)} value="C20173522" />
          <LegalField label={t('pub.cgu.s2_l5', locale)} value="27816949" />
          <LegalField label={t('pub.cgu.s2_l6', locale)} value={t('pub.cgu.s2_l6_v', locale)} />
          <LegalField label={t('pub.cgu.s2_l7', locale)} value="+230 4687378" />
          <LegalField
            label={t('pub.cgu.s2_l8', locale)}
            value={
              <a href="mailto:contact@lexora.finance" style={{ color: "#4191FF", textDecoration: "none", fontWeight: 600 }}>
                contact@lexora.finance
              </a>
            }
          />
        </dl>
      </LegalSection>

      {/* 3. Description */}
      <LegalSection icon={LayoutGrid} title={t('pub.cgu.s3_title', locale)}>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s3_p1', locale) }} />
        <ul style={{ margin: "0 0 14px", paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s3_list', locale) }} />
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s3_p2', locale) }} />

        <LegalSubtitle>{t('pub.cgu.s3_1_title', locale)}</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s3_1_p1', locale) }} />
        <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s3_1_p2', locale) }} />
      </LegalSection>

      {/* 4. Conditions d'accès */}
      <LegalSection icon={KeyRound} title={t('pub.cgu.s4_title', locale)}>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s4_p1', locale) }} />
        <ul style={{ margin: "0 0 14px", paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s4_list1', locale) }} />
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s4_p2', locale) }} />

        <LegalSubtitle>{t('pub.cgu.s4_1_title', locale)}</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s4_1_p1', locale) }} />
        <ul style={{ margin: "0 0 14px", paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s4_1_list', locale) }} />
        <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s4_1_p2', locale) }} />

        <LegalSubtitle>{t('pub.cgu.s4_2_title', locale)}</LegalSubtitle>
        <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s4_2_p1', locale) }} />
      </LegalSection>

      {/* 5. Obligations */}
      <LegalSection icon={Users} title={t('pub.cgu.s5_title', locale)}>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s5_p1', locale) }} />
        <ul style={{ margin: 0, paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s5_list', locale) }} />
      </LegalSection>

      {/* 6. Sécurité */}
      <LegalSection icon={ShieldCheck} title={t('pub.cgu.s6_title', locale)}>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s6_p1', locale) }} />
        <ul style={{ margin: "0 0 14px", paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s6_list', locale) }} />
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s6_p2', locale) }} />
        <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s6_p3', locale) }} />
      </LegalSection>

      {/* 7. PI */}
      <LegalSection icon={Lock} title={t('pub.cgu.s7_title', locale)}>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s7_p1', locale) }} />
        <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s7_p2', locale) }} />
      </LegalSection>

      {/* 8. Suspension */}
      <LegalSection icon={XCircle} title={t('pub.cgu.s8_title', locale)}>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s8_p1', locale) }} />
        <ul style={{ margin: 0, paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s8_list', locale) }} />
      </LegalSection>

      {/* 9. Limitations */}
      <LegalSection icon={AlertTriangle} title={t('pub.cgu.s9_title', locale)}>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s9_p1', locale) }} />
        <ul style={{ margin: 0, paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s9_list', locale) }} />
      </LegalSection>

      {/* 10. Resp */}
      <LegalSection icon={HeartPulse} title={t('pub.cgu.s10_title', locale)}>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s10_p1', locale) }} />
        <ul style={{ margin: 0, paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s10_list', locale) }} />
      </LegalSection>

      {/* 11. Droit */}
      <LegalSection icon={Scale} title={t('pub.cgu.s11_title', locale)}>
        <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s11_p1', locale) }} />
      </LegalSection>

      {/* 12. IA */}
      <LegalSection icon={Brain} title={t('pub.cgu.s12_title', locale)}>
        <LegalSubtitle>{t('pub.cgu.s12_1_title', locale)}</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s12_1_p1', locale) }} />

        <LegalSubtitle>{t('pub.cgu.s12_2_title', locale)}</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s12_2_p1', locale) }} />
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s12_2_p2', locale) }} />

        <LegalSubtitle>{t('pub.cgu.s12_3_title', locale)}</LegalSubtitle>
        <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.cgu.s12_3_p1', locale) }} />
      </LegalSection>
    </LegalShell>
  )
}
