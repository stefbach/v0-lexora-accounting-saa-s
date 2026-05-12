"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"

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

function FacturePreviewContent() {
  const searchParams = useSearchParams()
  const [data, setData] = useState<InvoiceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [templateData, setTemplateData] = useState<{ entete_html?: string; pied_page_html?: string; mentions_legales?: string } | null>(null)

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
            const settings = JSON.parse(localStorage.getItem("lexora_invoice_settings") || "{}")
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
  if (!data) return <div className="flex items-center justify-center min-h-screen"><p className="text-gray-500">Aucune facture a afficher. Creez une facture depuis le formulaire.</p></div>

  const s = data.settings || {} as InvoiceData["settings"]
  const c = data.client || {} as InvoiceData["client"]
  const lignes = data.lignes || []
  const subtotalHT = lignes.reduce((sum, l) => sum + l.quantite * l.prix_unitaire, 0)
  const totalTVA = lignes.reduce((sum, l) => sum + l.quantite * l.prix_unitaire * l.taux_tva / 100, 0)
  const discount = data.remise_pct > 0 ? subtotalHT * data.remise_pct / 100 : (data.remise_montant || 0)
  const grandTotal = subtotalHT + totalTVA - discount
  const colors = (() => {
    // Prefer accent_color from invoice data (set in nouvelle-facture), fall back to localStorage template colors
    const fallback = { primaire: "#0B0F2E", secondaire: "#D4AF37" }
    try {
      const tc = localStorage.getItem("lexora_invoice_template_colors")
      const stored = tc ? JSON.parse(tc) : fallback
      if (data.accent_color) {
        return { primaire: data.accent_color, secondaire: stored.secondaire || fallback.secondaire }
      }
      return stored
    } catch { return fallback }
  })()

  return (
    <>
      <style jsx global>{`
        @media print {
          body { margin: 0; padding: 0; }
          .no-print { display: none !important; }
          .print-page { padding: 0 !important; margin: 0 !important; box-shadow: none !important; }
        }
        @page { size: A4; margin: 15mm; }
      `}</style>

      {/* Print button */}
      <div className="no-print fixed top-4 right-4 z-50 flex gap-2">
        <button onClick={() => window.print()} className="bg-[#0B0F2E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#2a3d6b] transition-colors">
          Imprimer / PDF
        </button>
        <button onClick={() => window.close()} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors">
          Fermer
        </button>
      </div>

      {/* Invoice */}
      <div className="print-page max-w-[210mm] mx-auto bg-white shadow-lg my-8 p-10" style={{ minHeight: "297mm", fontFamily: "Inter, system-ui, sans-serif" }}>
        {/* Header */}
        <div className="flex justify-between items-start mb-10">
          <div className="flex items-start gap-4">
            {(data.logo_url || s.logo_url) && (
              <img src={data.logo_url || s.logo_url} alt="Logo" className="w-16 h-16 object-contain" />
            )}
            <div>
              <h2 className="text-xl font-bold" style={{ color: colors.primaire }}>{s.nom || "Votre Entreprise"}</h2>
              {s.adresse && <p className="text-sm text-gray-600 whitespace-pre-line">{s.adresse}</p>}
              {s.telephone && <p className="text-sm text-gray-600">{s.telephone}</p>}
              {s.email && <p className="text-sm text-gray-600">{s.email}</p>}
              {s.website && <p className="text-sm text-gray-600">{s.website}</p>}
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-3xl font-black tracking-tight" style={{ color: data.type_document === 'avoir' ? '#DC2626' : colors.primaire }}>
              {data.type_document === 'avoir' ? 'AVOIR' : data.type_document === 'note_debit' ? 'NOTE DE DEBIT' : 'FACTURE'}
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {data.type_document === 'avoir' ? 'CREDIT NOTE' : data.type_document === 'note_debit' ? 'DEBIT NOTE' : 'INVOICE'}
            </p>
          </div>
        </div>

        {/* Invoice Info + Bill To */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div className="rounded-lg p-4" style={{ backgroundColor: colors.primaire + "08" }}>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: colors.primaire }}>Facture a / Bill to</h3>
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
              <span className="text-sm text-gray-500">N. Facture:</span>
              <span className="font-mono font-bold" style={{ color: colors.primaire }}>{data.numero_facture}</span>
            </div>
            <div className="flex justify-end gap-8">
              <span className="text-sm text-gray-500">Date:</span>
              <span className="text-sm">{fmtDate(data.date_facture)}</span>
            </div>
            <div className="flex justify-end gap-8">
              <span className="text-sm text-gray-500">Echeance:</span>
              <span className="text-sm">{fmtDate(data.date_echeance)}</span>
            </div>
            <div className="flex justify-end gap-8">
              <span className="text-sm text-gray-500">Devise:</span>
              <span className="text-sm font-semibold">{data.devise}</span>
            </div>
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
                  <th className="text-right text-white text-xs font-semibold py-3 px-3 w-16">Qte</th>
                  <th className="text-right text-white text-xs font-semibold py-3 px-3 w-32">
                    Prix unit.{isForeign && <div className="text-[10px] font-normal opacity-80">{data.devise} / MUR</div>}
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
                        <div>{fmt(pu)} {isForeign ? data.devise : ""}</div>
                        {isForeign && <div className="text-[11px] text-gray-600 mt-0.5">≈ {fmt(puMur)} MUR</div>}
                      </td>
                      <td className="py-3 px-3 text-sm text-right align-top">{l.taux_tva}%</td>
                      <td className="py-3 px-4 text-sm text-right font-mono font-semibold align-top">
                        <div>{fmt(montant)} {isForeign ? data.devise : ""}</div>
                        {isForeign && <div className="text-[11px] text-gray-600 font-normal mt-0.5">≈ {fmt(montantMur)} MUR</div>}
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
              <span className="font-mono">{fmt(subtotalHT)} {data.devise}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm text-red-600">
                <span>Remise{data.remise_pct > 0 ? ` (${data.remise_pct}%)` : ""}</span>
                <span className="font-mono">-{fmt(discount)} {data.devise}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">TVA {data.client_offshore ? "(Zero-rated export)" : "(15%)"}</span>
              <span className="font-mono">{fmt(totalTVA)} {data.devise}</span>
            </div>
            <div className="border-t-2 pt-2 flex justify-between font-bold text-lg" style={{ borderColor: colors.primaire }}>
              <span style={{ color: colors.primaire }}>Total TTC</span>
              <span className="font-mono" style={{ color: colors.primaire }}>{fmt(grandTotal)} {data.devise}</span>
            </div>
            {data.devise !== "MUR" && data.taux_change > 0 && (
              <>
                <div className="flex justify-between text-sm pt-1">
                  <span className="text-gray-700 font-medium">Equivalent MUR</span>
                  <span className="font-mono font-medium">{fmt(grandTotal * data.taux_change)} MUR</span>
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

        {/* Payment Details */}
        {(s.banque_nom || s.banque_iban) && (
          <div className="rounded-lg p-4 mb-6 border" style={{ borderColor: colors.secondaire + "40" }}>
            <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: colors.primaire }}>Coordonnees de paiement / Payment Details</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {s.banque_nom && <div><span className="text-gray-500">Banque: </span><span className="font-medium">{s.banque_nom}</span></div>}
              {s.banque_compte && <div><span className="text-gray-500">Compte: </span><span className="font-mono">{s.banque_compte}</span></div>}
              {s.banque_iban && <div><span className="text-gray-500">IBAN: </span><span className="font-mono">{s.banque_iban}</span></div>}
              {s.banque_swift && <div><span className="text-gray-500">SWIFT/BIC: </span><span className="font-mono">{s.banque_swift}</span></div>}
            </div>
          </div>
        )}

        {/* Terms */}
        {data.termes && (
          <div className="mb-6">
            <h3 className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: colors.primaire }}>Termes et conditions</h3>
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
              {data.qr_code_data && (
                <div className="flex-shrink-0 text-center">
                  <img
                    src={data.qr_code_data}
                    alt="MRA QR Code"
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

