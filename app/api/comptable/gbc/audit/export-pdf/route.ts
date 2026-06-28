/**
 * GET /api/comptable/gbc/audit/export-pdf?societe_id=…&exercice=…
 * Exporte le dossier d'audit-readiness en PDF (deliverable auditeur).
 * ⚠️ Pré-audit — pas une opinion d'audit (disclaimer en page de garde).
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { assertSocieteAccess, SocieteAccessError } from '@/lib/supabase/assert-societe-access'
import { generateAuditFile, AuditDataError } from '@/lib/accounting/audit/server'
import React from 'react'
import { renderToBuffer, Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function getAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const styles = StyleSheet.create({
  page: { padding: 36, fontFamily: 'Helvetica', fontSize: 9, color: '#1a1a1a', lineHeight: 1.4 },
  header: { borderBottomWidth: 1, borderBottomColor: '#0B0F2E', paddingBottom: 10, marginBottom: 12 },
  company: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: '#0B0F2E' },
  title: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 4 },
  subtitle: { fontSize: 8, color: '#666', marginTop: 2 },
  disclaimer: { backgroundColor: '#FEF3C7', borderWidth: 0.5, borderColor: '#D97706', padding: 8, marginBottom: 12, fontSize: 8, color: '#92400E' },
  section: { marginTop: 10, marginBottom: 4 },
  sectionTtl: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', marginBottom: 6, textTransform: 'uppercase' },
  cards: { flexDirection: 'row', gap: 8 },
  card: { flex: 1, borderWidth: 0.5, borderColor: '#ddd', borderRadius: 3, padding: 6 },
  cardLbl: { fontSize: 7, color: '#888', textTransform: 'uppercase' },
  cardVal: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', marginTop: 2 },
  thead: { flexDirection: 'row', paddingVertical: 4, backgroundColor: '#f4f4f8', borderBottomWidth: 0.5, borderBottomColor: '#999' },
  row: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.3, borderBottomColor: '#eee' },
  th: { fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: '#444' },
  cLabel: { flex: 3, fontSize: 8 },
  cAmt: { flex: 1, fontSize: 8, textAlign: 'right' },
  finding: { marginBottom: 5, paddingLeft: 6, borderLeftWidth: 2 },
  findTtl: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  findExp: { fontSize: 8, color: '#555', marginTop: 1 },
  footer: { position: 'absolute', bottom: 24, left: 36, right: 36, fontSize: 7, color: '#aaa', textAlign: 'center', borderTopWidth: 0.3, borderTopColor: '#ccc', paddingTop: 6 },
})

const fmt = (n: number | null | undefined) =>
  n == null || isNaN(Number(n)) ? '—' : Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const SEV_COLOR: Record<string, string> = { critical: '#DC2626', warning: '#D97706', info: '#2563EB' }
const SEV_LABEL: Record<string, string> = { critical: 'CRITIQUE', warning: 'AVERTISSEMENT', info: 'INFO' }

export async function GET(request: Request) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const { searchParams } = new URL(request.url)
    const societe_id = searchParams.get('societe_id')
    const exercice = searchParams.get('exercice')
    if (!societe_id || !exercice) return NextResponse.json({ error: 'societe_id et exercice requis' }, { status: 400 })

    const admin = getAdminClient()
    try {
      await assertSocieteAccess(admin, user.id, societe_id)
    } catch (err) {
      if (err instanceof SocieteAccessError) return apiError('access_denied', 403)
      throw err
    }

    const { societe, file } = await generateAuditFile(admin, societe_id, exercice, new Date().toISOString())

    const elt = React.createElement
    const doc = elt(Document, {},
      elt(Page, { size: 'A4', style: styles.page, wrap: true },
        elt(View, { style: styles.header },
          elt(Text, { style: styles.company }, societe.nom || '—'),
          elt(Text, { style: styles.subtitle }, `Régime : ${file.regime.toUpperCase()} · Devise : ${file.devise} · Exercice : ${file.exercice}${file.exercice_n1 ? ` (comparatif ${file.exercice_n1})` : ''}`),
          elt(Text, { style: styles.title }, "Dossier d'audit-readiness (pré-audit)"),
        ),

        elt(View, { style: styles.disclaimer },
          elt(Text, {}, file.disclaimer),
        ),

        // Synthèse
        elt(View, { style: styles.section },
          elt(Text, { style: styles.sectionTtl }, 'Synthèse'),
          elt(View, { style: styles.cards },
            elt(View, { style: styles.card },
              elt(Text, { style: styles.cardLbl }, 'Balance'),
              elt(Text, { style: styles.cardVal }, file.equilibre ? 'Équilibrée' : 'Déséquilibrée'),
            ),
            elt(View, { style: styles.card },
              elt(Text, { style: styles.cardLbl }, 'Matérialité'),
              elt(Text, { style: styles.cardVal }, `${fmt(file.materialite.seuil)}`),
            ),
            elt(View, { style: styles.card },
              elt(Text, { style: styles.cardLbl }, 'Constats crit. / avert.'),
              elt(Text, { style: styles.cardVal }, `${file.resume.nb_findings_critical} / ${file.resume.nb_findings_warning}`),
            ),
            elt(View, { style: styles.card },
              elt(Text, { style: styles.cardLbl }, 'Pièces fournies'),
              elt(Text, { style: styles.cardVal }, `${file.resume.pbc_fournis} / ${file.resume.pbc_total}`),
            ),
          ),
        ),

        // Tests de cohérence
        elt(View, { style: styles.section },
          elt(Text, { style: styles.sectionTtl }, `Tests de cohérence (${file.findings.length})`),
          file.findings.length === 0
            ? elt(Text, { style: { fontSize: 8, color: '#16A34A' } }, 'Aucune anomalie détectée par les tests automatiques.')
            : elt(View, {}, ...file.findings.map((f, i) =>
                elt(View, { key: i, style: [styles.finding, { borderLeftColor: SEV_COLOR[f.severity] || '#999' }] },
                  elt(Text, { style: [styles.findTtl, { color: SEV_COLOR[f.severity] || '#333' }] }, `[${SEV_LABEL[f.severity] || ''}] ${f.titre}`),
                  elt(Text, { style: styles.findExp }, f.explication),
                ),
              )),
        ),

        // Feuilles maîtresses
        elt(View, { style: styles.section },
          elt(Text, { style: styles.sectionTtl }, 'Feuilles maîtresses (N / N-1)'),
          elt(View, { style: styles.thead },
            elt(Text, { style: [styles.cLabel, styles.th] }, 'Rubrique'),
            elt(Text, { style: [styles.cAmt, styles.th] }, 'Solde N'),
            elt(Text, { style: [styles.cAmt, styles.th] }, 'Solde N-1'),
            elt(Text, { style: [styles.cAmt, styles.th] }, 'Variation'),
          ),
          ...file.leadSchedules.map((ls) =>
            elt(View, { key: ls.code, style: styles.row },
              elt(Text, { style: styles.cLabel }, `${ls.caption}${ls.flagged ? '  ⚑' : ''}`),
              elt(Text, { style: styles.cAmt }, fmt(ls.total_n)),
              elt(Text, { style: styles.cAmt }, fmt(ls.total_n1)),
              elt(Text, { style: styles.cAmt }, `${fmt(ls.variation)}${ls.variation_pct != null ? ` (${Math.round(ls.variation_pct)}%)` : ''}`),
            ),
          ),
        ),

        // PBC list
        elt(View, { style: styles.section },
          elt(Text, { style: styles.sectionTtl }, 'Pièces à fournir (PBC list)'),
          elt(View, { style: styles.thead },
            elt(Text, { style: [styles.cLabel, styles.th] }, 'Pièce'),
            elt(Text, { style: [styles.cAmt, styles.th] }, 'Oblig.'),
            elt(Text, { style: [styles.cAmt, styles.th] }, 'Détenu'),
          ),
          ...file.pbc.map((p) =>
            elt(View, { key: p.code, style: styles.row },
              elt(Text, { style: styles.cLabel }, `[${p.categorie}] ${p.intitule}`),
              elt(Text, { style: styles.cAmt }, p.obligatoire ? 'Oui' : 'Non'),
              elt(Text, { style: styles.cAmt }, p.fourni ? 'Oui' : 'Non'),
            ),
          ),
        ),

        elt(View, { style: styles.footer },
          elt(Text, {}, `${societe.nom} · Dossier de pré-audit · Exercice ${file.exercice} · Généré par Lexora · Confidentiel`),
        ),
      ),
    )

    const buffer = await renderToBuffer(doc as any)
    const fname = `audit-readiness_${(societe.nom || 'societe').replace(/\s+/g, '_')}_${file.exercice}.pdf`
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fname}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    if (e instanceof AuditDataError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: e?.message || 'Erreur PDF' }, { status: 500 })
  }
}
