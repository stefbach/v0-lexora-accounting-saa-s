"use client"

/**
 * TicketReceipt — aperçu + impression d'un ticket de caisse (reçu 80 mm).
 *
 * Reçoit un TicketModel (lib/pos/ticket.ts, pur) et l'affiche dans une boîte de
 * dialogue. « Imprimer » ouvre une fenêtre dédiée au format ticket (police
 * monospace, largeur ~80 mm) et déclenche l'impression — sans interférer avec
 * la mise en page de l'application.
 */

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Printer, X } from "lucide-react"
import type { TicketModel } from "@/lib/pos/ticket"

function fmt(n: number): string {
  return new Intl.NumberFormat("en-MU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
}

function ticketHtml(t: TicketModel): string {
  const lignes = t.lignes
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.designation)}${l.sku ? ` <span class="sku">${escapeHtml(String(l.sku))}</span>` : ""}<br/>` +
        `<span class="muted">${l.quantite} × ${fmt(l.prix_unitaire_ht)} HT · TVA ${l.taux_tva}%</span></td>` +
        `<td class="r">${fmt(l.montant_ttc)}</td></tr>`,
    )
    .join("")
  const paiements = t.paiements
    .map((p) => `<tr><td>${escapeHtml(p.libelle)}${p.reference ? ` (${escapeHtml(String(p.reference))})` : ""}</td><td class="r">${fmt(p.montant)}</td></tr>`)
    .join("")
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(t.numero_ticket)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; width: 72mm; margin: 0 auto; }
  h1 { font-size: 15px; text-align: center; margin: 0 0 2px; }
  .center { text-align: center; }
  .muted { color: #444; font-size: 10px; }
  .sku { color: #666; font-size: 10px; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 2px 0; }
  td.r { text-align: right; white-space: nowrap; }
  .tot td { font-weight: bold; }
  .big { font-size: 14px; }
</style></head><body>
  <h1>${escapeHtml(t.societe)}</h1>
  <div class="center muted">Ticket ${escapeHtml(t.numero_ticket)}<br/>${escapeHtml(t.date)}</div>
  <hr/>
  <table>${lignes}</table>
  <hr/>
  <table>
    <tr><td>Total HT</td><td class="r">${fmt(t.total_ht)}</td></tr>
    <tr><td>TVA</td><td class="r">${fmt(t.total_tva)}</td></tr>
    <tr class="tot big"><td>TOTAL TTC</td><td class="r">${fmt(t.total_ttc)} MUR</td></tr>
  </table>
  <hr/>
  <table>${paiements}
    ${t.rendu > 0 ? `<tr><td>Reçu espèces</td><td class="r">${fmt(t.recu_especes)}</td></tr><tr class="tot"><td>Rendu</td><td class="r">${fmt(t.rendu)}</td></tr>` : ""}
  </table>
  <hr/>
  <div class="center muted">Merci de votre visite !</div>
  <script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}</script>
</body></html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string))
}

export function printTicket(t: TicketModel) {
  const w = window.open("", "_blank", "width=380,height=640")
  if (!w) return
  w.document.write(ticketHtml(t))
  w.document.close()
}

export function TicketReceipt({
  ticket, open, onOpenChange,
}: { ticket: TicketModel | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  if (!ticket) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Ticket {ticket.numero_ticket}</DialogTitle></DialogHeader>
        <div className="font-mono text-xs border rounded-lg p-4 bg-white max-h-[60vh] overflow-y-auto">
          <div className="text-center font-bold text-sm">{ticket.societe}</div>
          <div className="text-center text-slate-500 mb-2">{ticket.date}</div>
          <div className="border-t border-dashed my-2" />
          {ticket.lignes.map((l, i) => (
            <div key={i} className="flex justify-between gap-2 mb-1">
              <span>{l.designation} <span className="text-slate-400">{l.quantite}×{fmt(l.prix_unitaire_ht)}</span></span>
              <span className="tabular-nums">{fmt(l.montant_ttc)}</span>
            </div>
          ))}
          <div className="border-t border-dashed my-2" />
          <div className="flex justify-between"><span>Total HT</span><span className="tabular-nums">{fmt(ticket.total_ht)}</span></div>
          <div className="flex justify-between"><span>TVA</span><span className="tabular-nums">{fmt(ticket.total_tva)}</span></div>
          <div className="flex justify-between font-bold"><span>TOTAL TTC</span><span className="tabular-nums">{fmt(ticket.total_ttc)} MUR</span></div>
          <div className="border-t border-dashed my-2" />
          {ticket.paiements.map((p, i) => (
            <div key={i} className="flex justify-between"><span>{p.libelle}</span><span className="tabular-nums">{fmt(p.montant)}</span></div>
          ))}
          {ticket.rendu > 0 && (
            <>
              <div className="flex justify-between"><span>Reçu espèces</span><span className="tabular-nums">{fmt(ticket.recu_especes)}</span></div>
              <div className="flex justify-between font-bold"><span>Rendu</span><span className="tabular-nums">{fmt(ticket.rendu)}</span></div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}><X className="h-4 w-4 mr-1" /> Fermer</Button>
          <Button onClick={() => printTicket(ticket)}><Printer className="h-4 w-4 mr-1" /> Imprimer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
