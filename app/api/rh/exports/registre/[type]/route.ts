/**
 * Export de registre Workers' Rights Act S.116 — sprint G6.
 *
 * GET /api/rh/exports/registre/<type>?societe_id=...&annee=2026&mois=4&format=xlsx
 *
 *   type   : hours | salary | leave | overtime | absence
 *   format : xlsx (par défaut) | pdf
 *
 * Réservé aux admin / rh.
 * Retourne un fichier attaché (Content-Disposition: attachment) nommé
 *   registre_<type>_<societe_short>_<annee>[_<MM>].<ext>
 */
import { NextResponse } from 'next/server'
import { apiError } from '@/lib/api-error'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import React from 'react'
import { renderToBuffer, Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer'
import {
  REGISTRE_META,
  getRegistre,
  getColumnsForType,
  type RegistreType,
} from '@/lib/rh/registres-s116'

export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['admin', 'rh']
const VALID_TYPES: RegistreType[] = ['hours', 'salary', 'leave', 'overtime', 'absence']

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function safeSlug(s: string | null | undefined): string {
  return (s || '').toString().normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'societe'
}

// ─── PDF ──────────────────────────────────────────────────────────────
const pdfStyles = StyleSheet.create({
  page: { padding: 24, fontSize: 8.5, fontFamily: 'Helvetica' },
  header: { borderBottomWidth: 2, borderBottomColor: '#0B0F2E', paddingBottom: 6, marginBottom: 10 },
  title: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#0B0F2E' },
  subtitle: { fontSize: 9, color: '#555', marginTop: 2 },
  legal: { fontSize: 7.5, color: '#888', marginTop: 3 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#0B0F2E', color: 'white', padding: '3 4' },
  thCell: { flex: 1, fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: 'white' },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e5e5e5', padding: '2 4' },
  rowAlt: { backgroundColor: '#f8f9fa' },
  tdCell: { flex: 1, fontSize: 7.5, color: '#111' },
  footer: { marginTop: 12, fontSize: 7, color: '#888', textAlign: 'center' },
})

function renderPdf(
  rows: any[],
  columns: Array<{ key: string; label: string }>,
  type: RegistreType,
  societeNom: string,
  annee: number,
  mois: number | null,
): Promise<Buffer> {
  const meta = REGISTRE_META[type]
  const dateFmt = new Date().toLocaleDateString('fr-FR')
  const periodeLabel = mois != null
    ? `${String(mois).padStart(2, '0')}/${annee}`
    : `Année ${annee}`

  const doc = React.createElement(Document, {},
    React.createElement(Page, { size: 'A4', orientation: 'landscape', style: pdfStyles.page },
      React.createElement(View, { style: pdfStyles.header },
        React.createElement(Text, { style: pdfStyles.title }, `${meta.englishTitle} — ${meta.title}`),
        React.createElement(Text, { style: pdfStyles.subtitle }, `${societeNom} — ${periodeLabel}`),
        React.createElement(Text, { style: pdfStyles.legal }, `Generated ${dateFmt}. Workers' Rights Act 2019 S.116 — Retention 5 years minimum.`),
      ),
      React.createElement(View, { style: pdfStyles.tableHeader },
        ...columns.map(c =>
          React.createElement(Text, { style: pdfStyles.thCell, key: c.key }, c.label),
        ),
      ),
      ...rows.map((row, i) =>
        React.createElement(View,
          { style: i % 2 === 0 ? pdfStyles.row : [pdfStyles.row, pdfStyles.rowAlt], key: `r${i}` },
          ...columns.map(c =>
            React.createElement(Text, { style: pdfStyles.tdCell, key: c.key },
              formatCell(row[c.key]),
            ),
          ),
        ),
      ),
      React.createElement(Text, { style: pdfStyles.footer },
        `${rows.length} records — Signed electronically ${dateFmt} — Lexora HR`,
      ),
    ),
  )
  return renderToBuffer(doc as any) as any
}

function formatCell(v: any): string {
  if (v == null) return '—'
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v)
    return v.toFixed(2)
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-')
    return `${d}/${m}/${y}`
  }
  return s
}

// ─── Route handler ────────────────────────────────────────────────────
export async function GET(
  request: Request,
  context: { params: { type: string } | Promise<{ type: string }> },
) {
  try {
    const supabaseAuth = await createServerClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return apiError('unauthorized', 401)

    const supabase = getAdminClient()
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    const role = (profile as any)?.role || ''
    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json(
        { error: 'Accès réservé aux RH et administrateurs (WRA S.116).' },
        { status: 403 },
      )
    }

    const params = await (Promise.resolve(context.params) as Promise<Record<string, string>>)
    const type = String(params.type || '').toLowerCase() as RegistreType
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Type invalide. Attendu : ${VALID_TYPES.join(', ')}` },
        { status: 400 },
      )
    }

    const { searchParams } = new URL(request.url)
    const societeId = searchParams.get('societe_id')
    const anneeRaw = searchParams.get('annee')
    const moisRaw = searchParams.get('mois')
    const format = (searchParams.get('format') || 'xlsx').toLowerCase()

    if (!societeId) return NextResponse.json({ error: 'societe_id requis' }, { status: 400 })
    const annee = anneeRaw ? parseInt(anneeRaw, 10) : new Date().getFullYear()
    if (!Number.isFinite(annee)) {
      return NextResponse.json({ error: 'annee invalide' }, { status: 400 })
    }
    const mois = moisRaw ? parseInt(moisRaw, 10) : null
    if (mois != null && (!Number.isFinite(mois) || mois < 1 || mois > 12)) {
      return NextResponse.json({ error: 'mois invalide (1-12)' }, { status: 400 })
    }

    const { data: soc } = await supabase
      .from('societes').select('nom').eq('id', societeId).maybeSingle()
    const societeNom = (soc as any)?.nom || 'Société'

    const rows = await getRegistre(supabase, type, societeId, annee, mois)
    const columns = getColumnsForType(type)

    const fileBase = `registre_${type}_${safeSlug(societeNom)}_${annee}${mois != null ? `_${String(mois).padStart(2, '0')}` : ''}`

    if (format === 'pdf') {
      const buffer = await renderPdf(rows, columns, type, societeNom, annee, mois)
      return new NextResponse(buffer as unknown as BodyInit, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${fileBase}.pdf"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    // xlsx (default)
    const header = columns.map(c => c.label)
    const dataRows = rows.map(r => columns.map(c => {
      const v = (r as any)[c.key]
      if (v == null) return ''
      return v
    }))
    const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows])
    // Auto-width approximatif : prendre la longueur max par colonne.
    ws['!cols'] = columns.map(c => ({
      wch: Math.min(40, Math.max(10, c.label.length + 2)),
    }))
    const wb = XLSX.utils.book_new()
    const sheetName = REGISTRE_META[type].englishTitle.slice(0, 28)
    XLSX.utils.book_append_sheet(wb, ws, sheetName)

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileBase}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Erreur serveur' },
      { status: 500 },
    )
  }
}
