import { ArticleProse, H2, OL, LI, P, Note } from "../article-shell"

export default function LettrageManuel() {
  return (
    <ArticleProse>
      <P>
        <strong>Matching</strong> (reconciliation) consists of pairing, within a
        third-party account (customer or supplier), the entries that offset each
        other — typically an invoice and its payment. A correctly matched account
        shows only the transactions that are genuinely outstanding.
      </P>
      <H2>1. When to use manual matching?</H2>
      <P>
        Lexora offers automatic matching based on amounts and descriptions.
        You should resort to manual matching in the following cases&nbsp;:
      </P>
      <OL>
        <LI>partial payment of an invoice&nbsp;;</LI>
        <LI>a payment grouping several invoices&nbsp;;</LI>
        <LI>a discrepancy of a few cents (exchange difference or rounding)&nbsp;;</LI>
        <LI>atypical transactions (credit note, discount, bad debt loss).</LI>
      </OL>
      <H2>2. Procedure</H2>
      <OL>
        <LI>Open <strong>Accounting &gt; Matching</strong>.</LI>
        <LI>Select the <strong>third-party account</strong> (for example <em>411 — Clients</em>).</LI>
        <LI>Filter on the relevant third party.</LI>
        <LI>Tick the entries to be matched (the balance is calculated at the bottom of the screen).</LI>
        <LI>If the balance is zero, click <strong>Match</strong>. A letter is assigned (A, B, C, …).</LI>
        <LI>If a discrepancy remains, click <strong>Match with difference</strong> and post the difference to an adjustment account (discount, exchange loss, irrecoverable debt).</LI>
      </OL>
      <Note>
        To undo a match, open the same interface, click the letter in the
        &quot;Letter&quot; column then click <strong>Unmatch</strong>. The entries
        become open again.
      </Note>
    </ArticleProse>
  )
}
