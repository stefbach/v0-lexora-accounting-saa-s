"use client"

import { useState, useEffect, Suspense } from "react"
import QRCode from "qrcode"
import { useSearchParams } from "next/navigation"
import { t, getLocale, type Locale } from '@/lib/i18n'

interface LigneFacture {
  id: string; description: string; quantite: number; prix_unitaire: number
  taux_tva: number; total: number
}
interface ContactDetail {
  nom?: string | null
  entreprise?: string | null
  adresse?: string | null
  code_postal?: string | null
  ville?: string | null
  pays?: string | null
  email?: string | null
  telephone?: string | null
  mobile?: string | null
  vat_number?: string | null
  brn?: string | null
  kbis?: string | null
}
interface InvoiceData {
  id?: string
  numero_facture: string; date_facture: string; date_echeance: string
  devise: string; taux_change: number
  montant_ht: number; montant_tva: number; montant_ttc: number
  lignes: LigneFacture[]; client_offshore: boolean
  remise_pct: number; remise_montant: number
  termes: string; notes_internes: string; template: string
  tiers: string; logo_url: string
  accent_color?: string
  template_id?: string
  contact_id?: string | null
  irn?: string; qr_code_data?: string; fiscalisation_date?: string
  mra_status?: string; type_document?: string
  facture_reference_id?: string
  client: {
    nom: string; entreprise: string; adresse: string; email: string
    vat_number: string; offshore: boolean
  }
  // Détail enrichi récupéré depuis factures_contacts (mig 245/246)
  contact?: ContactDetail | null
  settings: {
    nom: string; brn: string; vat_number: string; logo_url: string
    adresse: string; telephone: string; email: string; website: string
    banque_nom: string; banque_compte: string; banque_iban: string; banque_swift: string
    footer_text: string; mention_legale: string
  }
}

function fmt(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function fmtDate(d: string) { if (!d) return "-"; return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) }

/**
 * Métadonnées par type de document (mig 042 type_document) — pilote tout
 * le rendu différencié devis/avoir/note de débit/facture standard.
 *
 * `accent` peut surcharger la couleur primaire de la facture (rouge pour
 * avoir, orange pour note de débit) afin que le client identifie le type
 * au premier coup d'œil sur le PDF imprimé.
 */
type DocType = 'facture' | 'avoir' | 'note_debit' | 'devis'
interface DocTypeMeta {
  title_fr: string
  title_en: string
  echeance_label: string
  ref_label: string         // libellé pour facture_reference_id (avoir/note_debit)
  show_bank: boolean        // afficher coordonnées bancaires
  show_signature: boolean   // afficher zone "Bon pour accord" (devis)
  validity_note: string | null   // mention de validité (devis surtout)
  accent_override: string | null // couleur dominante surchargée
}
function getDocMeta(type: string | undefined): DocTypeMeta {
  switch (type) {
    case 'avoir':
      return {
        title_fr: 'AVOIR',
        title_en: 'CREDIT NOTE',
        echeance_label: 'Date d\'émission',
        ref_label: 'Avoir sur facture N°',
        show_bank: true, // pour le remboursement
        show_signature: false,
        validity_note: null,
        accent_override: '#DC2626',
      }
    case 'note_debit':
      return {
        title_fr: 'NOTE DE DÉBIT',
        title_en: 'DEBIT NOTE',
        echeance_label: 'Date d\'échéance',
        ref_label: 'En complément de facture N°',
        show_bank: true,
        show_signature: false,
        validity_note: null,
        accent_override: '#EA580C',
      }
    case 'devis':
      return {
        title_fr: 'DEVIS',
        title_en: 'QUOTATION',
        echeance_label: 'Valable jusqu\'au',
        ref_label: '',
        show_bank: false, // pas encore à payer
        show_signature: true,
        validity_note: 'Bon pour accord — Date et signature du client précédées de la mention « Bon pour accord ».',
        accent_override: null,
      }
    default:
      return {
        title_fr: 'FACTURE',
        title_en: 'INVOICE',
        echeance_label: 'Échéance',
        ref_label: '',
        show_bank: true,
        show_signature: false,
        validity_note: null,
        accent_override: null,
      }
  }
}

function FacturePreviewContent() {
  const locale = getLocale()
  const searchParams = useSearchParams()
  const [data, setData] = useState<InvoiceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [templateData, setTemplateData] = useState<{ entete_html?: string; pied_page_html?: string; mentions_legales?: string } | null>(null)
  // QR code PNG généré depuis qr_code_data (URL MRA verify) — la lib
  // qrcode produit un vrai PNG scannable, à la différence du faux SVG
  // stocké éventuellement en base.
  const [qrCodePng, setQrCodePng] = useState<string | null>(null)
  const [mraLoading, setMraLoading] = useState(false)
  const [mraMsg, setMraMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  async function handleFiscalise() {
    if (!data?.id) return
    setMraLoading(true)
    setMraMsg(null)
    try {
      const r = await fetch(`/api/client/factures/${data.id}/fiscalise`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok || j.ok === false) {
        setMraMsg({ kind: 'err', text: j.error || `Erreur fiscalisation (${r.status})` })
      } else {
        setMraMsg({
          kind: 'ok',
          text: j.already_fiscalise ? 'Facture déjà fiscalisée.' : `Fiscalisée — IRN ${j.irn}`,
        })
        setData(prev => prev ? {
          ...prev,
          irn: j.irn,
          qr_code_data: j.qr_code_image || j.qr_code_data,
          fiscalisation_date: j.fiscalisation_date,
          mra_status: 'fiscalise',
        } : prev)
      }
    } catch (e: any) {
      setMraMsg({ kind: 'err', text: e?.message || 'Erreur réseau' })
    } finally {
      setMraLoading(false)
    }
  }
  useEffect(() => {
    const qd = data?.qr_code_data
    if (!qd) { setQrCodePng(null); return }
    // Si qr_code_data est déjà un data URL d'image, on l'utilise tel quel
    if (qd.startsWith('data:image/')) { setQrCodePng(qd); return }
    // Sinon (URL HTTP du MRA), on génère un PNG scannable
    QRCode.toDataURL(qd, { width: 200, margin: 2, errorCorrectionLevel: 'M' })
      .then(setQrCodePng)
      .catch(() => setQrCodePng(null))
  }, [data?.qr_code_data])

  useEffect(() => {
    const factureId = searchParams.get("facture_id")
    if (factureId) {
      // Load from DB. On charge la facture + le contact lié (mig 246)
      // pour avoir adresse structurée, VAT, BRN. Si contact_id est null
      // on retombe sur le simple champ tiers (legacy).
      fetch(`/api/client/factures?id=${factureId}`)
        .then(r => r.json())
        .then(async d => {
          if (d.factures?.[0]) {
            const f = d.factures[0]
            // Settings société : DB d'abord (source de vérité — contient
            // VAT, BRN, coordonnées bancaires, logo, mentions légales),
            // fallback localStorage pour les anciens utilisateurs qui
            // n'ont pas encore migré leurs paramètres en base. Sans ce
            // chargement DB, ouvrir une facture sauvegardée depuis un
            // autre navigateur / device perdait VAT/BRN/banque.
            // Settings société : DB d'abord (source de vérité par societe_id).
            // Le fallback localStorage ne s'applique QUE si on n'a pas pu lire
            // la société en DB. Bug fix : avant, on commençait par charger
            // localStorage puis on merge la DB par-dessus avec ` || settings.xxx`
            // → si DDS n'a pas de logo_url en DB mais que localStorage avait
            // celui d'OCC (cache d'une session précédente), DDS héritait du
            // logo d'OCC. Inversion de l'ordre + retrait du fallback localStorage
            // intra-société.
            let settings: any = {}
            let socLoaded = false
            if (f.societe_id) {
              try {
                const socRes = await fetch('/api/client/societes')
                const socJson = await socRes.json()
                const soc = (socJson.societes || []).find((s: any) => s.id === f.societe_id)
                if (soc) {
                  socLoaded = true
                  settings = {
                    nom: soc.nom || '',
                    brn: soc.brn || '',
                    vat_number: soc.numero_tva_mra || soc.vat_number || '',
                    logo_url: soc.logo_url || '',
                    adresse: [soc.adresse, soc.adresse2, soc.ville].filter(Boolean).join('\n') || '',
                    telephone: soc.telephone || '',
                    email: soc.email || '',
                    website: soc.website || '',
                    banque_nom: soc.banque_nom || soc.bank_name || '',
                    banque_compte: soc.banque_compte || soc.bank_account_number || '',
                    banque_iban: soc.banque_iban || soc.iban || '',
                    banque_swift: soc.banque_swift || '',
                    footer_text: soc.facture_footer_text || '',
                    mention_legale: soc.facture_mention_legale || '',
                  }
                }
              } catch { /* fallback localStorage ci-dessous */ }
            }
            if (!socLoaded) {
              try {
                const ls = localStorage.getItem("lexora_invoice_settings")
                if (ls) settings = JSON.parse(ls)
              } catch { /* ignore */ }
            }
            let contact: ContactDetail | null = null
            if (f.contact_id) {
              try {
                const ct = await fetch(`/api/client/factures-contacts/${f.contact_id}`).then(r => r.json())
                contact = ct?.item || null
              } catch { /* contact non trouvé → fallback nom */ }
            }
            setData({
              ...f,
              client: {
                nom: contact?.nom || f.tiers,
                entreprise: contact?.entreprise || "",
                adresse: contact?.adresse || "",
                email: contact?.email || "",
                vat_number: contact?.vat_number || "",
                offshore: f.client_offshore,
              },
              contact,
              settings,
            })
          }
          setLoading(false)
        })
        .catch(() => setLoading(false))
    } else {
      // Load from sessionStorage
      try {
        const stored = sessionStorage.getItem("lexora_facture_preview")
        if (stored) setData(JSON.parse(stored))
      } catch { /* ignore */ }
      setLoading(false)
    }
  }, [searchParams])

  // Charger le template DB si template_id présent
  useEffect(() => {
    if (data?.template_id) {
      fetch(`/api/client/facture-template?id=${data.template_id}`)
        .then(r => r.json())
        .then(d => {
          const t = d.template || d.templates?.[0]
          if (t) setTemplateData({ entete_html: t.entete_html, pied_page_html: t.pied_page_html, mentions_legales: t.mentions_legales })
        })
        .catch(() => {})
    }
  }, [data?.template_id])

  // Auto-print if requested
  useEffect(() => {
    if (!loading && data && searchParams.get("print") === "true") {
      setTimeout(() => window.print(), 500)
    }
  }, [loading, data, searchParams])

  if (loading) return <div className="flex items-center justify-center min-h-screen"><p>Chargement...</p></div>
  if (!data) return <div className="flex items-center justify-center min-h-screen"><p className="text-gray-500">{t('inv.pv.no_invoice', locale)}</p></div>

  const s = data.settings || {} as InvoiceData["settings"]
  const c = data.client || {} as InvoiceData["client"]
  const lignes = data.lignes || []
  const subtotalHT = lignes.reduce((sum, l) => sum + l.quantite * l.prix_unitaire, 0)
  const totalTVA = lignes.reduce((sum, l) => sum + l.quantite * l.prix_unitaire * l.taux_tva / 100, 0)
  const discount = data.remise_pct > 0 ? subtotalHT * data.remise_pct / 100 : (data.remise_montant || 0)
  const grandTotal = subtotalHT + totalTVA - discount
  // AVOIR / CREDIT NOTE : affiche les montants en NÉGATIF côté client
  // (convention comptable : un avoir = remboursement / annulation).
  // Les valeurs en base restent positives, on inverse uniquement à
  // l'affichage. Note de débit reste positive (c'est un complément
  // à payer au fournisseur).
  const signMul = data.type_document === 'avoir' ? -1 : 1
  const fmtSigned = (n: number) => fmt(n * signMul)
  const docMeta = getDocMeta(data.type_document)
  const colors = (() => {
    // Pour avoir/note de débit, on surcharge la couleur d'accent par la
    // couleur du type de doc (rouge/orange) pour bien distinguer du flux
    // facture standard. Pour devis/facture, on garde le accent_color.
    const fallback = { primaire: "#0B0F2E", secondaire: "#D4AF37" }
    try {
      const tc = localStorage.getItem("lexora_invoice_template_colors")
      const stored = tc ? JSON.parse(tc) : fallback
      const primaire = docMeta.accent_override
        || data.accent_color
        || stored.primaire
        || fallback.primaire
      return { primaire, secondaire: stored.secondaire || fallback.secondaire }
    } catch { return { ...fallback, primaire: docMeta.accent_override || fallback.primaire } }
  })()

  return (
    <>
      <style jsx global>{`
        @media print {
          body { margin: 0; padding: 0; }
          html, body { background: white; }
          .no-print { display: none !important; }
          /* Masquer tout élément du layout global qui n'a rien à faire
             sur le PDF imprimé : sidebar client/comptable, bandeau cabinet,
             bouton d'aide flottant, toasts. Ces éléments ne sont pas
             dans la zone .print-page mais sont sur la même page DOM, et
             apparaîtraient sinon en surimpression (le ? rond observé). */
          aside,
          header,
          nav,
          [role="banner"],
          [role="navigation"],
          [data-sidebar],
          [data-banner],
          [data-floating-help] { display: none !important; }
          /* Filet de sécurité : tout bouton ou div positionné en fixed
             qui se trouverait HORS de la zone .print-page (sidebar mobile
             hamburger, toasters, widgets d'aide, etc.). Ne touche pas
             aux éléments fixed à L'INTÉRIEUR de la facture (il n'y en a
             pas, mais ça reste safe). */
          body > button[class*="fixed"],
          body > div > button[class*="fixed"],
          body > main > button[class*="fixed"],
          [class*="fixed"][class*="top-4"][class*="left-4"] { display: none !important; }
          /* Forcer la facture à tenir sur 1 page A4 :
             - retirer min-height: 297mm qui force toujours 1 page pleine
               et provoque débordement quand combiné aux marges @page.
             - retirer ombre / padding écran qui poussent vers une 2e page.
             - retirer ml-64 du <main> qui décalait la facture à droite. */
          main { margin-left: 0 !important; }
          .print-page {
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            min-height: auto !important;
            max-width: 100% !important;
            page-break-after: avoid;
            page-break-inside: auto;
          }
        }
        @page { size: A4; margin: 12mm; }
      `}</style>

      {/* Print + MRA buttons */}
      <div className="no-print fixed top-4 right-4 z-50 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          {data.id && data.type_document !== 'devis' && (
            data.irn ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-green-100 text-green-800 border border-green-200">
                ✓ MRA fiscalisée
              </span>
            ) : (
              <button
                onClick={handleFiscalise}
                disabled={mraLoading}
                className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                title="Soumettre cette facture à la MRA EBS"
              >
                {mraLoading ? 'Fiscalisation…' : 'Fiscaliser MRA'}
              </button>
            )
          )}
          <button onClick={() => window.print()} className="bg-[#0B0F2E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#2a3d6b] transition-colors">
            {t('inv.pv.print_pdf', locale)}
          </button>
          <button onClick={() => window.close()} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors">
            {t('inv.pv.close', locale)}
          </button>
        </div>
        {mraMsg && (
          <div className={`max-w-md px-3 py-2 rounded-lg text-xs font-medium shadow ${mraMsg.kind === 'ok' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {mraMsg.text}
          </div>
        )}
      </div>

      {/* Invoice */}
      <div className="print-page max-w-[210mm] mx-auto bg-white shadow-lg my-8 p-10" style={{ minHeight: "297mm", fontFamily: "Inter, system-ui, sans-serif" }}>
        {/* Header */}
        <div className="flex justify-between items-start mb-10">
          <div className="flex items-start gap-4">
            {/* Logo société masqué intentionnellement (cohérence avec le PDF
                final — voir app/api/client/factures/[id]/pdf/route.ts). */}
            <div>
              <h2 className="text-xl font-bold" style={{ color: colors.primaire }}>{s.nom || t('inv.pv.your_company', locale)}</h2>
              {s.adresse && <p className="text-sm text-gray-600 whitespace-pre-line">{s.adresse}</p>}
              {s.telephone && <p className="text-sm text-gray-600">{s.telephone}</p>}
              {s.email && <p className="text-sm text-gray-600">{s.email}</p>}
              {s.website && <p className="text-sm text-gray-600">{s.website}</p>}
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-3xl font-black tracking-tight" style={{ color: colors.primaire }}>
              {docMeta.title_fr}
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">{docMeta.title_en}</p>
          </div>
        </div>

        {/* Invoice Info + Bill To */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div className="rounded-lg p-4" style={{ backgroundColor: colors.primaire + "08" }}>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: colors.primaire }}>
              {/* Libellé neutre — évite "Facture à" sur un Devis ou Avoir.
                  Pour un avoir on parle plutôt du destinataire du remboursement. */}
              {data.type_document === 'avoir' ? 'Émis pour / Issued to' : 'Destinataire / Bill to'}
            </h3>
            {/* Affichage enrichi depuis factures_contacts si dispo (mig 246) :
                entreprise (gras) + nom + adresse + code_postal/ville + pays
                + email + tel/mobile + VAT + BRN + KBIS. Fallback sur les
                champs legacy si pas de contact lié. */}
            {(() => {
              const ct = data.contact
              const nom = ct?.entreprise || ct?.nom || c.nom || c.entreprise || data.tiers || "-"
              const sousNom = ct?.entreprise && ct?.nom && ct.nom !== ct.entreprise ? ct.nom : null
              const adresse = ct?.adresse || c.adresse
              const villeLine = ct && (ct.code_postal || ct.ville)
                ? [ct.code_postal, ct.ville].filter(Boolean).join(' ')
                : null
              const email = ct?.email || c.email
              const tels = [ct?.telephone, ct?.mobile].filter(Boolean).join(' / ')
              const vat = ct?.vat_number || c.vat_number
              return (
                <>
                  <p className="font-semibold text-gray-900">{nom}</p>
                  {sousNom && <p className="text-sm text-gray-600">{sousNom}</p>}
                  {adresse && <p className="text-sm text-gray-600 whitespace-pre-line">{adresse}</p>}
                  {villeLine && <p className="text-sm text-gray-600">{villeLine}</p>}
                  {ct?.pays && <p className="text-sm text-gray-600">{ct.pays}</p>}
                  {email && <p className="text-sm text-gray-600">{email}</p>}
                  {tels && <p className="text-sm text-gray-600">Tel: {tels}</p>}
                  {vat && <p className="text-sm text-gray-600">VAT: {vat}</p>}
                  {ct?.brn && <p className="text-sm text-gray-600">BRN: {ct.brn}</p>}
                  {ct?.kbis && <p className="text-sm text-gray-600">{ct.kbis}</p>}
                </>
              )
            })()}
          </div>
          <div className="text-right space-y-1.5">
            <div className="flex justify-end gap-8">
              {/* Pas de répétition du type de doc — il est déjà affiché
                  en grand en haut à droite. On garde juste "N°". */}
              <span className="text-sm text-gray-500">N°:</span>
              <span className="font-mono font-bold" style={{ color: colors.primaire }}>{data.numero_facture}</span>
            </div>
            <div className="flex justify-end gap-8">
              <span className="text-sm text-gray-500">Date:</span>
              <span className="text-sm">{fmtDate(data.date_facture)}</span>
            </div>
            {/* Échéance / Validité / etc. — label adapté au type de doc */}
            {data.date_echeance && (
              <div className="flex justify-end gap-8">
                <span className="text-sm text-gray-500">{docMeta.echeance_label}:</span>
                <span className="text-sm">
                  {data.type_document !== 'devis' && data.date_facture === data.date_echeance
                    ? 'À réception de facture'
                    : fmtDate(data.date_echeance)}
                </span>
              </div>
            )}
            <div className="flex justify-end gap-8">
              <span className="text-sm text-gray-500">Devise:</span>
              <span className="text-sm font-semibold">{data.devise}</span>
            </div>
            {/* Référence facture d'origine (avoir / note de débit) */}
            {docMeta.ref_label && data.facture_reference_id && (
              <div className="flex justify-end gap-8 mt-1">
                <span className="text-sm text-gray-500">{docMeta.ref_label}:</span>
                <span className="font-mono text-sm font-semibold">{data.facture_reference_id.slice(0, 8)}</span>
              </div>
            )}
            {data.client_offshore && (
              <div className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                Export / Zero-rated
              </div>
            )}
          </div>
        </div>

        {/* Line Items Table — affichage double devise (EUR/USD/GBP + MUR)
            quand devise étrangère. Chaque cellule Prix unitaire et Montant
            empile la valeur en devise + l'équivalent MUR juste en dessous.
            Le header de colonnes l'indique : "Prix unit. (EUR / MUR)". */}
        {(() => {
          const isForeign = data.devise !== "MUR" && Number(data.taux_change) > 1.0001
          const taux = Number(data.taux_change) || 1
          return (
            <table className="w-full mb-6" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: colors.primaire }}>
                  <th className="text-left text-white text-xs font-semibold py-3 px-4 rounded-tl-lg">Description</th>
                  <th className="text-right text-white text-xs font-semibold py-3 px-3 w-16">{t('inv.pv.qty', locale)}</th>
                  <th className="text-right text-white text-xs font-semibold py-3 px-3 w-32">
                    {t('inv.pv.unit_price_short', locale)}{isForeign && <div className="text-[10px] font-normal opacity-80">{data.devise} / MUR</div>}
                  </th>
                  <th className="text-right text-white text-xs font-semibold py-3 px-3 w-16">TVA</th>
                  <th className="text-right text-white text-xs font-semibold py-3 px-4 rounded-tr-lg w-32">
                    Montant{isForeign && <div className="text-[10px] font-normal opacity-80">{data.devise} / MUR</div>}
                  </th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => {
                  const pu = Number(l.prix_unitaire) || 0
                  const qte = Number(l.quantite) || 0
                  const montant = qte * pu * (1 + (l.taux_tva || 0) / 100)
                  const puMur = pu * taux
                  const montantMur = montant * taux
                  return (
                    <tr key={l.id || i} className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                      <td className="py-3 px-4 text-sm align-top">{l.description || "—"}</td>
                      <td className="py-3 px-3 text-sm text-right align-top">{qte}</td>
                      <td className="py-3 px-3 text-sm text-right font-mono align-top">
                        <div>{fmtSigned(pu)} {isForeign ? data.devise : ""}</div>
                        {isForeign && <div className="text-[11px] text-gray-600 mt-0.5">({fmtSigned(puMur)} MUR)</div>}
                      </td>
                      <td className="py-3 px-3 text-sm text-right align-top">{l.taux_tva}%</td>
                      <td className="py-3 px-4 text-sm text-right font-mono font-semibold align-top">
                        <div>{fmtSigned(montant)} {isForeign ? data.devise : ""}</div>
                        {isForeign && <div className="text-[11px] text-gray-600 font-normal mt-0.5">({fmtSigned(montantMur)} MUR)</div>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        })()}

        {/* Totals */}
        <div className="flex justify-end mb-8">
          <div className="w-72 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Sous-total HT</span>
              <span className="font-mono">{fmtSigned(subtotalHT)} {data.devise}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-red-600">
                <span>Remise{data.remise_pct > 0 ? ` (${data.remise_pct}%)` : ""}</span>
                <span className="font-mono">-{fmt(discount)} {data.devise}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">TVA {data.client_offshore ? "(Zero-rated export)" : "(15%)"}</span>
              <span className="font-mono">{fmtSigned(totalTVA)} {data.devise}</span>
            </div>
            <div className="border-t-2 pt-2 flex justify-between font-bold text-lg" style={{ borderColor: colors.primaire }}>
              <span style={{ color: colors.primaire }}>Total TTC</span>
              <span className="font-mono" style={{ color: colors.primaire }}>{fmtSigned(grandTotal)} {data.devise}</span>
            </div>
            {data.devise !== "MUR" && data.taux_change > 0 && (
              <>
                <div className="flex justify-between text-sm pt-1">
                  <span className="text-gray-700 font-medium">Equivalent MUR</span>
                  <span className="font-mono font-medium">{fmtSigned(grandTotal * data.taux_change)} MUR</span>
                </div>
                <div className="mt-2 px-3 py-2 rounded-md text-[11px] italic text-gray-600 bg-gray-50 border border-gray-200 text-right">
                  Taux de change appliqué : 1 {data.devise} = {fmt(data.taux_change)} MUR
                  <br />
                  (cours du {fmtDate(data.date_facture)})
                </div>
              </>
            )}
          </div>
        </div>

        {/* Payment Details — masqué pour les devis (rien à payer pour le
            moment). Pour avoir : libellé adapté "Remboursement effectué
            sur le compte ci-dessous". */}
        {docMeta.show_bank && (s.banque_nom || s.banque_iban) && (
          <div className="rounded-lg p-4 mb-6 border" style={{ borderColor: colors.secondaire + "40" }}>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: colors.primaire }}>
              {data.type_document === 'avoir'
                ? 'Remboursement / Refund — Compte créditeur'
                : 'Coordonnees de paiement / Payment Details'}
            </h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {s.banque_nom && <div><span className="text-gray-500">Banque: </span><span className="font-medium">{s.banque_nom}</span></div>}
              {s.banque_compte && <div><span className="text-gray-500">Compte: </span><span className="font-mono">{s.banque_compte}</span></div>}
              {s.banque_iban && <div><span className="text-gray-500">IBAN: </span><span className="font-mono">{s.banque_iban}</span></div>}
              {s.banque_swift && <div><span className="text-gray-500">SWIFT/BIC: </span><span className="font-mono">{s.banque_swift}</span></div>}
            </div>
          </div>
        )}

        {/* Zone signature (devis uniquement) — emplacement standard pour
            la mention "Bon pour accord" + date + signature client. */}
        {docMeta.show_signature && (
          <div className="rounded-lg p-4 mb-6 border-2 border-dashed" style={{ borderColor: colors.primaire + "40" }}>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: colors.primaire }}>
              Bon pour accord / Accepted by client
            </h3>
            {docMeta.validity_note && (
              <p className="text-xs text-gray-600 mb-4 italic">{docMeta.validity_note}</p>
            )}
            <div className="grid grid-cols-2 gap-6 mt-4">
              <div>
                <p className="text-xs text-gray-500 mb-6">Date :</p>
                <div className="border-b border-gray-300 h-8"></div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-6">Signature précédée de « Bon pour accord » :</p>
                <div className="border-b border-gray-300 h-8"></div>
              </div>
            </div>
          </div>
        )}

        {/* Terms */}
        {data.termes && (
          <div className="mb-6">
            <h3 className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: colors.primaire }}>{t('inv.pv.terms', locale)}</h3>
            <p className="text-xs text-gray-600 whitespace-pre-line">{data.termes}</p>
          </div>
        )}

        {/* MRA Fiscalisation - IRN + QR Code */}
        {data.irn && (
          <div className="mb-6 border rounded-lg p-4" style={{ borderColor: colors.primaire + '30', backgroundColor: colors.primaire + '04' }}>
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.primaire }}>
                  MRA e-Invoice / Fiscalisation
                </h3>
                <div className="space-y-1">
                  <div className="flex gap-2 text-sm">
                    <span className="text-gray-500 whitespace-nowrap">Invoice Reference Number (IRN):</span>
                    <span className="font-mono font-bold" style={{ color: colors.primaire }}>{data.irn}</span>
                  </div>
                  {data.fiscalisation_date && (
                    <div className="flex gap-2 text-sm">
                      <span className="text-gray-500 whitespace-nowrap">Date de fiscalisation:</span>
                      <span className="text-sm">{new Date(data.fiscalisation_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )}
                  {data.type_document && data.type_document !== 'facture' && (
                    <div className="flex gap-2 text-sm">
                      <span className="text-gray-500">Type:</span>
                      <span className="font-medium" style={{ color: data.type_document === 'avoir' ? '#DC2626' : colors.primaire }}>
                        {data.type_document === 'avoir' ? 'Avoir / Credit Note' : 'Note de debit / Debit Note'}
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-gray-400 mt-2">
                  This invoice has been fiscalised with the Mauritius Revenue Authority (MRA) Invoice Fiscalization Platform.
                </p>
              </div>
              {qrCodePng && (
                <div className="flex-shrink-0 text-center">
                  <img
                    src={qrCodePng}
                    alt="MRA QR Code — scannable"
                    className="w-24 h-24 border rounded"
                    style={{ borderColor: colors.primaire + '20' }}
                  />
                  <p className="text-[8px] text-gray-400 mt-1">Scan to verify</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pied de page template (HTML personnalisé) */}
        {templateData?.pied_page_html && (
          <div className="mt-6 pt-4 border-t border-gray-100"
            dangerouslySetInnerHTML={{ __html: templateData.pied_page_html }}
          />
        )}

        {/* Mentions légales template */}
        {templateData?.mentions_legales && !templateData?.pied_page_html && (
          <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 text-center">
            {templateData.mentions_legales}
          </div>
        )}

        {/* Footer standard */}
        <div className="mt-auto pt-8 border-t border-gray-200">
          {s.footer_text && (
            <p className="text-center text-sm text-gray-500 mb-2">{s.footer_text}</p>
          )}
          <p className="text-center text-xs font-medium" style={{ color: colors.primaire }}>
            {s.mention_legale || `VAT Reg No: ${s.vat_number || "XXXXX"} | BRN: ${s.brn || "XXXXX"}`}
          </p>
        </div>
      </div>
    </>
  )
}

export default function FacturePreviewPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">Chargement...</div>}>
      <FacturePreviewContent />
    </Suspense>
  )
}

