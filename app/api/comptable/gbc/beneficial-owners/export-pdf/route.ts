import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import React from 'react'
import { renderToBuffer, Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Export PDF — Registre des bénéficiaires effectifs (UBO).
 *
 * Document obligatoire FSC :
 *   • Identification de tous les UBOs ≥ 10% (ou contrôle effectif)
 *   • Sanctions screening + PEP flag
 *   • Attestation directeur
 *
 * Référentiel : Companies Act 2001 + FATF Recommendation 24.
 */

const styles = StyleSheet.create({
  page:       { padding: 36, fontFamily: 'Helvetica', fontSize: 9, color: '#1a1a1a', lineHeight: 1.4 },
  header:     { borderBottomWidth: 1, borderBottomColor: '#0B0F2E', paddingBottom: 10, marginBottom: 14 },
  company:    { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', marginBottom: 2 },
  title:      { fontSize: 13, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  subtitle:   { fontSize: 9, color: '#666', marginTop: 2 },
  section:    { marginTop: 12, marginBottom: 4 },
  sectionTtl: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', marginBottom: 6, textTransform: 'uppercase' },
  uboCard:    { borderWidth: 0.5, borderColor: '#ccc', padding: 8, marginBottom: 8, borderRadius: 3 },
  uboHead:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, paddingBottom: 4, borderBottomWidth: 0.3, borderBottomColor: '#ddd' },
  uboName:    { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0B0F2E' },
  uboPct:     { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#4f46e5' },
  field:      { flexDirection: 'row', marginTop: 2 },
  fieldLabel: { width: 110, fontSize: 8, color: '#666' },
  fieldVal:   { flex: 1, fontSize: 9 },
  flag:       { fontSize: 8, paddingVertical: 1, paddingHorizontal: 4, borderRadius: 2, fontFamily: 'Helvetica-Bold', marginLeft: 4 },
  warn:       { backgroundColor: '#fef3c7', color: '#92400e' },
  ok:         { backgroundColor: '#d1fae5', color: '#065f46' },
  err:        { backgroundColor: '#fee2e2', color: '#991b1b' },
  summary:    { backgroundColor: '#f4f4f8', padding: 10, marginTop: 8, borderRadius: 3 },
  notes:      { marginTop: 18, fontSize: 8, color: '#666', lineHeight: 1.5 },
  attest:     { marginTop: 24, paddingTop: 16, borderTopWidth: 0.5, borderTopColor: '#999' },
  attestRow:  { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30 },
  sigBox:     { width: 200, borderTopWidth: 0.5, borderTopColor: '#444', paddingTop: 4, fontSize: 8, textAlign: 'center', color: '#666' },
  footer:     { position: 'absolute', bottom: 24, left: 36, right: 36, fontSize: 7, color: '#aaa', textAlign: 'center', borderTopWidth: 0.3, borderTopColor: '#ccc', paddingTop: 6 },
})

const MOIS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
function today(): string {
  const dt = new Date()
  return `${dt.getDate()} ${MOIS_FR[dt.getMonth()]} ${dt.getFullYear()}`
}
function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  try {
    const dt = new Date(d)
    return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
  } catch { return d as string }
}

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    if (!societe_id) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })

    const supabase = getAdminClient()
    const [{ data: ubos }, { data: history }, { data: societe }] = await Promise.all([
      supabase.from('beneficial_owners').select('*').eq('societe_id', societe_id).is('effective_to', null).order('pct_detention', { ascending: false }),
      supabase.from('beneficial_owners_history').select('*').eq('societe_id', societe_id).order('changed_at', { ascending: false }).limit(20),
      supabase.from('societes').select('nom, brn, regime').eq('id', societe_id).single(),
    ])

    const list: any[] = ubos || []
    const totalPct = list.reduce((s, u) => s + Number(u.pct_detention || 0), 0)
    const warning = totalPct < 75 ? 'Détention déclarée < 75% — vérifier UBOs manquants ≥10%' : null

    const elt = React.createElement
    const doc = elt(Document, {},
      elt(Page, { size: 'A4', style: styles.page },
        elt(View, { style: styles.header },
          elt(Text, { style: styles.company }, societe?.nom || '—'),
          societe?.brn && elt(Text, { style: styles.subtitle }, `BRN : ${societe.brn} · Régime : ${(societe?.regime || 'GBC').toUpperCase()}`),
          elt(Text, { style: styles.title }, 'Registre des Bénéficiaires Effectifs (UBO)'),
          elt(Text, { style: styles.subtitle }, `Date d'émission : ${today()} · Référentiel : Companies Act 2001 + FATF R.24 + FSC AML/CFT`),
        ),

        // Résumé
        elt(View, { style: styles.summary },
          elt(View, { style: { flexDirection: 'row', justifyContent: 'space-between' } },
            elt(Text, { style: { fontSize: 9 } }, `Nombre d'UBOs actifs : ${list.length}`),
            elt(Text, { style: { fontSize: 9 } }, `Détention totale déclarée : ${totalPct.toFixed(2)}%`),
            elt(Text, { style: { fontSize: 9 } }, `Événements audit trail : ${(history || []).length}`),
          ),
          warning && elt(Text, { style: { fontSize: 8, color: '#92400e', marginTop: 4 } }, `Avertissement : ${warning}`),
        ),

        // Liste des UBOs
        elt(View, { style: styles.section },
          elt(Text, { style: styles.sectionTtl }, 'UBOs déclarés actifs'),
          list.length === 0
            ? elt(Text, { style: { fontSize: 9, color: '#888', padding: 6 } }, 'Aucun UBO déclaré.')
            : elt(View, {}, ...list.map((u: any) => elt(View, { key: u.id, style: styles.uboCard },
                elt(View, { style: styles.uboHead },
                  elt(View, { style: { flexDirection: 'row', alignItems: 'center' } },
                    elt(Text, { style: styles.uboName }, `${u.prenom || ''} ${u.nom || ''}`),
                    u.is_pep && elt(Text, { style: [styles.flag, styles.warn] }, 'PEP'),
                    u.sanctions_screened && u.sanctions_clear === false && elt(Text, { style: [styles.flag, styles.err] }, 'SANCTIONS'),
                    u.sanctions_screened && u.sanctions_clear === true && elt(Text, { style: [styles.flag, styles.ok] }, 'SANCTIONS OK'),
                  ),
                  elt(Text, { style: styles.uboPct }, `${Number(u.pct_detention || 0).toFixed(2)}%`),
                ),
                elt(View, { style: styles.field },
                  elt(Text, { style: styles.fieldLabel }, 'Nationalité'),
                  elt(Text, { style: styles.fieldVal }, u.nationalite || '—'),
                ),
                elt(View, { style: styles.field },
                  elt(Text, { style: styles.fieldLabel }, 'Date de naissance'),
                  elt(Text, { style: styles.fieldVal }, fmtDate(u.date_naissance)),
                ),
                elt(View, { style: styles.field },
                  elt(Text, { style: styles.fieldLabel }, 'Pays résidence'),
                  elt(Text, { style: styles.fieldVal }, u.pays_residence || '—'),
                ),
                elt(View, { style: styles.field },
                  elt(Text, { style: styles.fieldLabel }, 'Adresse'),
                  elt(Text, { style: styles.fieldVal }, u.adresse_complete || '—'),
                ),
                elt(View, { style: styles.field },
                  elt(Text, { style: styles.fieldLabel }, 'Pièce d\'identité'),
                  elt(Text, { style: styles.fieldVal }, `${u.id_type || '—'} n° ${u.id_number || '—'} (${u.id_country || '—'}) — exp. ${fmtDate(u.id_expiry)}`),
                ),
                elt(View, { style: styles.field },
                  elt(Text, { style: styles.fieldLabel }, 'Nature contrôle'),
                  elt(Text, { style: styles.fieldVal }, u.nature_controle || '—'),
                ),
                u.is_pep && elt(View, { style: styles.field },
                  elt(Text, { style: styles.fieldLabel }, 'PEP — détails'),
                  elt(Text, { style: styles.fieldVal }, u.pep_details || '—'),
                ),
                u.last_verified_at && elt(View, { style: styles.field },
                  elt(Text, { style: styles.fieldLabel }, 'Dernière attestation'),
                  elt(Text, { style: styles.fieldVal }, fmtDate(u.last_verified_at)),
                ),
                u.notes && elt(View, { style: styles.field },
                  elt(Text, { style: styles.fieldLabel }, 'Notes'),
                  elt(Text, { style: styles.fieldVal }, u.notes),
                ),
              )),
            ),
        ),

        elt(View, { style: styles.attest },
          elt(Text, { style: { fontSize: 9, fontFamily: 'Helvetica-Bold' } }, 'Attestation'),
          elt(Text, { style: { fontSize: 9, marginTop: 4 } }, `Je certifie sur l'honneur que les informations ci-dessus relatives aux bénéficiaires effectifs de ${societe?.nom || 'la société'} sont exactes et à jour à la date d'émission, conformément aux exigences du Companies Act 2001 et aux recommandations FATF.`),
          elt(View, { style: styles.attestRow },
            elt(View, { style: styles.sigBox },
              elt(Text, {}, 'Directeur / Représentant autorisé'),
            ),
            elt(View, { style: styles.sigBox },
              elt(Text, {}, `Date : ${today()}`),
            ),
          ),
        ),

        elt(View, { style: styles.notes },
          elt(Text, {}, '• Tout UBO détenant ≥ 10 % du capital ou exerçant un contrôle effectif doit être déclaré.'),
          elt(Text, {}, '• Les UBOs marqués PEP (Politically Exposed Person) sont soumis à une diligence renforcée (EDD).'),
          elt(Text, {}, '• Le screening sanctions doit être renouvelé annuellement (UN/EU/OFAC/UK lists).'),
          elt(Text, {}, `• Document généré le ${today()} à partir des données Lexora.`),
        ),

        elt(View, { style: styles.footer },
          elt(Text, {}, `${societe?.nom || ''} · Registre UBO · Confidentiel — FSC / AML`),
        ),
      ),
    )

    const buffer = await renderToBuffer(doc as any)
    const fname = `gbc-ubo_${(societe?.nom || 'societe').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fname}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erreur PDF' }, { status: 500 })
  }
}
