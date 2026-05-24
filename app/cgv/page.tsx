"use client"

import {
  Info,
  Package,
  KeyRound,
  Calculator,
  Briefcase,
  CreditCard,
  Undo2,
  RefreshCcw,
  UserCog,
  ShieldCheck,
  Scale,
  Brain,
} from "lucide-react"
import {
  LegalShell,
  LegalSection,
  LegalField,
  LegalSubtitle,
} from "@/components/legal/LegalShell"
import { t, getLocale, type Locale } from "@/lib/i18n"

export default function CGVPage() {
  const locale: Locale = getLocale()
  return (
    <LegalShell
      eyebrow={t('pub.cgv.eyebrow', locale)}
      title={t('pub.cgv.title', locale)}
      subtitle={
        <span dangerouslySetInnerHTML={{ __html: t('pub.cgv.subtitle_html', locale) }} />
      }
    >
      {/* Préambule */}
      <LegalSection icon={Info} title={t('pub.cgv.s0_title', locale)}>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s0_p1', locale) }} />
        <dl style={{ margin: 0 }}>
          <LegalField label={t('pub.cgv.l_vat', locale)} value="27816949" />
          <LegalField label={t('pub.cgv.l_phone', locale)} value="+230 5259 1043" />
          <LegalField
            label={t('pub.cgv.l_email', locale)}
            value={
              <a href="mailto:sbach@digital-data-solutions.net" style={{ color: "#4191FF", textDecoration: "none", fontWeight: 600 }}>
                sbach@digital-data-solutions.net
              </a>
            }
          />
        </dl>
      </LegalSection>

      {/* 1. Objet */}
      <LegalSection icon={Info} title={t('pub.cgv.s1_title', locale)}>
        <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s1_p1', locale) }} />
      </LegalSection>

      {/* 2. Description */}
      <LegalSection icon={Package} title={t('pub.cgv.s2_title', locale)}>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s2_p1', locale) }} />
        <ul style={{ margin: "0 0 14px", paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s2_list', locale) }} />
      </LegalSection>

      {/* 3. Conditions accès */}
      <LegalSection icon={KeyRound} title={t('pub.cgv.s3_title', locale)}>
        <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s3_p1', locale) }} />
        <ul style={{ margin: "8px 0 0", paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s3_list', locale) }} />
      </LegalSection>

      {/* 4. Tarification */}
      <LegalSection icon={Calculator} title={t('pub.cgv.s4_title', locale)}>
        <LegalSubtitle>{t('pub.cgv.s4_1_title', locale)}</LegalSubtitle>
        <p style={{ margin: "0 0 8px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s4_1_p1', locale) }} />
        <dl style={{ margin: "0 0 14px" }}>
          <LegalField label="Solo" value={t('pub.cgv.s4_solo', locale)} />
          <LegalField label="Business" value={t('pub.cgv.s4_business', locale)} />
          <LegalField label="PME" value={t('pub.cgv.s4_pme', locale)} />
          <LegalField label="Enterprise" value={t('pub.cgv.s4_enterprise', locale)} />
        </dl>

        <LegalSubtitle>{t('pub.cgv.s4_2_title', locale)}</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s4_2_p1', locale) }} />
        <ul style={{ margin: "0 0 14px", paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s4_2_list', locale) }} />
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s4_2_p2', locale) }} />

        <LegalSubtitle>{t('pub.cgv.s4_3_title', locale)}</LegalSubtitle>
        <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s4_3_p1', locale) }} />

        <LegalSubtitle>{t('pub.cgv.s4_4_title', locale)}</LegalSubtitle>
        <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s4_4_p1', locale) }} />
      </LegalSection>

      {/* 5. Programme EC */}
      <LegalSection icon={Briefcase} title={t('pub.cgv.s5_title', locale)} accentColor="#D4AF37">
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s5_p1', locale) }} />

        <LegalSubtitle>{t('pub.cgv.s5_1_title', locale)}</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s5_1_p1', locale) }} />
        <ul style={{ margin: "0 0 14px", paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s5_1_list', locale) }} />

        <LegalSubtitle>{t('pub.cgv.s5_2_title', locale)}</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s5_2_p1', locale) }} />

        <LegalSubtitle>{t('pub.cgv.s5_3_title', locale)}</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s5_3_p1', locale) }} />

        <LegalSubtitle>{t('pub.cgv.s5_4_title', locale)}</LegalSubtitle>
        <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s5_4_p1', locale) }} />
      </LegalSection>

      {/* 6. Paiement */}
      <LegalSection icon={CreditCard} title={t('pub.cgv.s6_title', locale)}>
        <ul style={{ margin: 0, paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s6_list', locale) }} />
      </LegalSection>

      {/* 7. Rétractation */}
      <LegalSection icon={Undo2} title={t('pub.cgv.s7_title', locale)}>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s7_p1', locale) }} />
        <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s7_p2', locale) }} />
      </LegalSection>

      {/* 8. Résiliation */}
      <LegalSection icon={RefreshCcw} title={t('pub.cgv.s8_title', locale)}>
        <ul style={{ margin: 0, paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s8_list', locale) }} />
      </LegalSection>

      {/* 9. Responsabilités */}
      <LegalSection icon={UserCog} title={t('pub.cgv.s9_title', locale)}>
        <ul style={{ margin: 0, paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s9_list', locale) }} />
      </LegalSection>

      {/* 10. Données */}
      <LegalSection icon={ShieldCheck} title={t('pub.cgv.s10_title', locale)}>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s10_p1', locale) }} />
        <ul style={{ margin: 0, paddingLeft: "20px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s10_list', locale) }} />
        <p style={{ margin: "12px 0 0" }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s10_p2', locale) }} />
      </LegalSection>

      {/* 11. Litiges */}
      <LegalSection icon={Scale} title={t('pub.cgv.s11_title', locale)}>
        <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s11_p1', locale) }} />
      </LegalSection>

      {/* 12. IA */}
      <LegalSection icon={Brain} title={t('pub.cgv.s12_title', locale)}>
        <LegalSubtitle>{t('pub.cgv.s12_1_title', locale)}</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s12_1_p1', locale) }} />
        <LegalSubtitle>{t('pub.cgv.s12_2_title', locale)}</LegalSubtitle>
        <p style={{ margin: "0 0 12px" }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s12_2_p1', locale) }} />
        <LegalSubtitle>{t('pub.cgv.s12_3_title', locale)}</LegalSubtitle>
        <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: t('pub.cgv.s12_3_p1', locale) }} />
      </LegalSection>
    </LegalShell>
  )
}
