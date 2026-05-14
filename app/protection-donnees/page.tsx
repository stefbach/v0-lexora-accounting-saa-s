"use client"

import {
  Building2,
  Target,
  Database,
  HandshakeIcon,
  ShieldCheck,
  Clock,
  UserCheck,
  UserCog,
  Brain,
} from "lucide-react"
import {
  LegalShell,
  LegalSection,
  LegalField,
  LegalSubtitle,
} from "@/components/legal/LegalShell"
import { t, getLocale, type Locale } from "@/lib/i18n"

export default function ProtectionDonneesPage() {
  const locale: Locale = getLocale()
  return (
    <LegalShell
      eyebrow={t('pub.pd.eyebrow', locale)}
      title={t('pub.pd.title', locale)}
      subtitle={
        <span dangerouslySetInnerHTML={{ __html: t('pub.pd.subtitle_html', locale) }} />
      }
    >
      {/* 1. Responsable */}
      <LegalSection icon={Building2} title={t('pub.pd.s1_title', locale)}>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s1_p1', locale) }} />
        <dl style={{ margin: 0 }}>
          <LegalField label={t('pub.pd.l_company', locale)} value="Digital Data Solutions Ltd" />
          <LegalField label={t('pub.pd.l_form', locale)} value={t('pub.pd.l_form_v', locale)} />
          <LegalField label={t('pub.pd.l_reg', locale)} value="C20173522" />
          <LegalField label={t('pub.pd.l_seat', locale)} value={t('pub.pd.l_seat_v', locale)} />
          <LegalField label={t('pub.pd.l_vat', locale)} value="27816949" />
          <LegalField
            label={t('pub.pd.l_dpo', locale)}
            value={
              <a href="mailto:dpo@lexora.finance" style={{ color: "#4191FF", textDecoration: "none", fontWeight: 600 }}>
                dpo@lexora.finance
              </a>
            }
          />
        </dl>
      </LegalSection>

      {/* 2. Finalités */}
      <LegalSection icon={Target} title={t('pub.pd.s2_title', locale)}>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s2_p1', locale) }} />
        <ul style={{ margin: 0, paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s2_list', locale) }} />
        <p style={{ margin: "12px 0 0", fontWeight: 600, color: "#0B0F2E" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s2_p2', locale) }} />
      </LegalSection>

      {/* 3. Nature */}
      <LegalSection icon={Database} title={t('pub.pd.s3_title', locale)}>
        <p style={{ margin: "0 0 10px" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s3_p1', locale) }} />
        <LegalSubtitle>{t('pub.pd.s3_g1_title', locale)}</LegalSubtitle>
        <ul style={{ margin: "0 0 12px", paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s3_g1_list', locale) }} />

        <LegalSubtitle>{t('pub.pd.s3_g2_title', locale)}</LegalSubtitle>
        <ul style={{ margin: "0 0 12px", paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s3_g2_list', locale) }} />

        <LegalSubtitle>{t('pub.pd.s3_g3_title', locale)}</LegalSubtitle>
        <ul style={{ margin: "0 0 12px", paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s3_g3_list', locale) }} />

        <LegalSubtitle>{t('pub.pd.s3_g4_title', locale)}</LegalSubtitle>
        <ul style={{ margin: 0, paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s3_g4_list', locale) }} />
      </LegalSection>

      {/* 4. Consentement */}
      <LegalSection icon={HandshakeIcon} title={t('pub.pd.s4_title', locale)}>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s4_p1', locale) }} />
        <ul style={{ margin: 0, paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s4_list', locale) }} />
        <p style={{ margin: "12px 0 0" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s4_p2', locale) }} />
      </LegalSection>

      {/* 5. Sécurité */}
      <LegalSection icon={ShieldCheck} title={t('pub.pd.s5_title', locale)}>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s5_p1', locale) }} />
        <ul style={{ margin: 0, paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s5_list', locale) }} />
        <p style={{ margin: "12px 0 0" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s5_p2', locale) }} />
      </LegalSection>

      {/* 6. Durée */}
      <LegalSection icon={Clock} title={t('pub.pd.s6_title', locale)}>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s6_p1', locale) }} />
        <ul style={{ margin: 0, paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s6_list', locale) }} />
        <p style={{ margin: "12px 0 0" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s6_p2', locale) }} />
      </LegalSection>

      {/* 7. Droits */}
      <LegalSection icon={UserCheck} title={t('pub.pd.s7_title', locale)}>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s7_p1', locale) }} />
        <ul style={{ margin: 0, paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s7_list', locale) }} />
        <p style={{ margin: "12px 0 0" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s7_p2', locale) }} />
      </LegalSection>

      {/* 8. DPO */}
      <LegalSection icon={UserCog} title={t('pub.pd.s8_title', locale)}>
        <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s8_p1', locale) }} />
      </LegalSection>

      {/* 9. IA */}
      <LegalSection icon={Brain} title={t('pub.pd.s9_title', locale)}>
        <LegalSubtitle>{t('pub.pd.s9_1_title', locale)}</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s9_1_p1', locale) }} />
        <LegalSubtitle>{t('pub.pd.s9_2_title', locale)}</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s9_2_p1', locale) }} />
        <LegalSubtitle>{t('pub.pd.s9_3_title', locale)}</LegalSubtitle>
        <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.pd.s9_3_p1', locale) }} />
      </LegalSection>
    </LegalShell>
  )
}
