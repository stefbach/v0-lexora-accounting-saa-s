import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { userHasAccessToEmploye } from '@/lib/rh/access'
import React from 'react'
import { renderToBuffer, Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'

export const dynamic = 'force-dynamic'

const styles = StyleSheet.create({
  page: { padding: 48, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a', lineHeight: 1.6 },
  header: { marginBottom: 24, borderBottomWidth: 2, borderBottomColor: '#0B0F2E', paddingBottom: 12 },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 10, textAlign: 'center', color: '#666' },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#0B0F2E', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 180, fontFamily: 'Helvetica-Bold', color: '#444' },
  value: { flex: 1, color: '#1a1a1a' },
  divider: { borderBottomWidth: 1, borderBottomColor: '#e0e0e0', marginVertical: 10 },
  clause: { marginBottom: 8, textAlign: 'justify' },
  footer: { position: 'absolute', bottom: 32, left: 48, right: 48, borderTopWidth: 1, borderTopColor: '#ccc', paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 8, color: '#999' },
  signatureBlock: { marginTop: 32, flexDirection: 'row', justifyContent: 'space-between' },
  signatureBox: { width: '45%', borderWidth: 1, borderColor: '#ccc', padding: 12, minHeight: 60 },
  signatureLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  signatureDate: { fontSize: 8, color: '#666', marginTop: 8 },
})

const MOIS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d + 'T12:00:00')
  return `${dt.getDate()} ${MOIS_FR[dt.getMonth()]} ${dt.getFullYear()}`
}

function formatMontant(n: number | null | undefined): string {
  if (!n && n !== 0) return '—'
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) + ' MUR'
}

type Params = { params: Promise<{ id: string }> }

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    // Sprint 16 FIX 1 — admin client (bypass RLS) + queries séparées
    // (pas de FK join qui casse sur auth.users ref, Sprint 8 pattern).
    const supabase = getAdminClient()
    const { id } = await params

    const { data: contrat, error } = await supabase
      .from('contrats_employes').select('*').eq('id', id).maybeSingle()
    if (error || !contrat) return NextResponse.json({ error: 'Contrat introuvable' }, { status: 404 })

    const { data: emp } = contrat.employe_id
      ? await supabase.from('employes').select('id, prenom, nom, poste, email, nic_number, nic, societe_id').eq('id', contrat.employe_id).maybeSingle()
      : { data: null }
    const { data: soc } = emp?.societe_id
      ? await supabase.from('societes').select('id, nom, ern, brn, adresse, telephone').eq('id', emp.societe_id).maybeSingle()
      : { data: null }
    const today = new Date()
    const dateGeneration = `${today.getDate()} ${MOIS_FR[today.getMonth()]} ${today.getFullYear()}`

    const doc = React.createElement(Document, {},
      React.createElement(Page, { size: 'A4', style: styles.page },
        // En-tête
        React.createElement(View, { style: styles.header },
          React.createElement(Text, { style: styles.title }, `CONTRAT DE TRAVAIL — ${contrat.type_contrat?.toUpperCase()}`),
          React.createElement(Text, { style: styles.subtitle }, `Généré le ${dateGeneration} · Réf. ${id.slice(0, 8).toUpperCase()}`)
        ),

        // Parties
        React.createElement(View, { style: styles.section },
          React.createElement(Text, { style: styles.sectionTitle }, 'Parties'),
          React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.label }, 'Employeur :'),
            React.createElement(Text, { style: styles.value }, soc?.nom || '—')
          ),
          soc?.ern && React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.label }, 'ERN :'),
            React.createElement(Text, { style: styles.value }, soc.ern)
          ),
          React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.label }, 'Employé(e) :'),
            React.createElement(Text, { style: styles.value }, `${emp?.prenom || ''} ${emp?.nom || ''}`.trim() || '—')
          ),
          React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.label }, 'Email :'),
            React.createElement(Text, { style: styles.value }, emp?.email || '—')
          ),
        ),

        React.createElement(View, { style: styles.divider }),

        // Conditions
        React.createElement(View, { style: styles.section },
          React.createElement(Text, { style: styles.sectionTitle }, 'Conditions du contrat'),
          React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.label }, 'Type de contrat :'),
            React.createElement(Text, { style: styles.value }, contrat.type_contrat || '—')
          ),
          React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.label }, 'Secteur :'),
            React.createElement(Text, { style: styles.value }, contrat.secteur || 'Général')
          ),
          React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.label }, 'Poste :'),
            React.createElement(Text, { style: styles.value }, contrat.poste || emp?.poste || '—')
          ),
          React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.label }, 'Date de début :'),
            React.createElement(Text, { style: styles.value }, formatDate(contrat.date_debut))
          ),
          contrat.date_fin && React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.label }, 'Date de fin :'),
            React.createElement(Text, { style: styles.value }, formatDate(contrat.date_fin))
          ),
          React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.label }, 'Salaire brut mensuel :'),
            React.createElement(Text, { style: styles.value }, formatMontant(contrat.salaire_brut))
          ),
          React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.label }, 'Statut :'),
            React.createElement(Text, { style: styles.value }, contrat.statut || 'brouillon')
          ),
        ),

        contrat.notes && React.createElement(View, { style: styles.section },
          React.createElement(View, { style: styles.divider }),
          React.createElement(Text, { style: styles.sectionTitle }, 'Notes / Clauses spéciales'),
          React.createElement(Text, { style: styles.clause }, contrat.notes)
        ),

        // Sprint 16 FIX 1 — Bloc signatures avec image signature dirigeant
        React.createElement(View, { style: styles.signatureBlock },
          React.createElement(View, { style: styles.signatureBox },
            React.createElement(Text, { style: styles.signatureLabel }, "L'Employeur"),
            // Image signature dirigeant si data URI disponible
            contrat.signature_image_dirigeant_url
              ? React.createElement(Image, { src: contrat.signature_image_dirigeant_url, style: { height: 40, width: 120, objectFit: 'contain' } } as any)
              : null,
            React.createElement(Text, { style: styles.signatureLabel }, contrat.signature_nom_complet || soc?.nom || ''),
            contrat.date_signature_dirigeant
              ? React.createElement(Text, { style: styles.signatureDate }, `Signé le ${formatDate(contrat.date_signature_dirigeant)}`)
              : contrat.date_signature
                ? React.createElement(Text, { style: styles.signatureDate }, `Signé le ${formatDate(contrat.date_signature)}`)
                : null,
          ),
          React.createElement(View, { style: styles.signatureBox },
            React.createElement(Text, { style: styles.signatureLabel }, "L'Employé(e)"),
            React.createElement(Text, { style: styles.signatureLabel }, `${emp?.prenom || ''} ${emp?.nom || ''}`.trim()),
            contrat.date_signature_employe
              ? React.createElement(Text, { style: styles.signatureDate }, `Signé le ${formatDate(contrat.date_signature_employe)}`)
              : null,
          )
        ),

        // Footer
        React.createElement(View, { style: styles.footer },
          React.createElement(Text, { style: styles.footerText }, `Lexora RH · ${soc?.nom || ''}`),
          React.createElement(Text, { style: styles.footerText }, `Réf. ${id.slice(0, 8).toUpperCase()} · Conforme WRA 2019`)
        )
      )
    )

    const buffer = await renderToBuffer(doc)
    const nomFichier = `contrat_${(emp?.nom || 'employe').toLowerCase().replace(/\s+/g, '_')}_${id.slice(0, 8)}.pdf`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nomFichier}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur PDF' }, { status: 500 })
  }
}
