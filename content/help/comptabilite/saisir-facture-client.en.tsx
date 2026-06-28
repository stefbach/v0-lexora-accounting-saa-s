import { ArticleProse, H2, OL, LI, P, Note, Code } from "../article-shell"

export default function SaisieFactureClient() {
  return (
    <ArticleProse>
      <P>
        Entering a customer invoice automatically generates the corresponding
        accounting entry (sale + output VAT + customer receivable) and feeds the
        collection schedule.
      </P>
      <H2>1. Create the invoice</H2>
      <OL>
        <LI>Open <strong>Sales &gt; Invoices</strong> then click <strong>New invoice</strong>.</LI>
        <LI>Select the <strong>customer</strong> (or create one on the fly).</LI>
        <LI>Enter the <strong>invoice date</strong> and the <strong>due date</strong>.</LI>
        <LI>Add the <strong>lines</strong> with quantity, unit price (excl. VAT) and VAT rate (15&nbsp;% standard, 0&nbsp;% for exports).</LI>
      </OL>
      <H2>2. Automatic account posting</H2>
      <P>The generated entry follows the principles of the PCM&nbsp;:</P>
      <OL>
        <LI><Code>411 — Clients</Code> : debited with the gross amount (incl. VAT).</LI>
        <LI><Code>706 — Prestations de services</Code> or <Code>707 — Ventes de marchandises</Code> : credited with the net amount (excl. VAT).</LI>
        <LI><Code>4457 — TVA collectée</Code> : credited with the VAT due.</LI>
      </OL>
      <Note>
        Lexora automatically checks that the entry total is balanced
        (debit = credit). If there is an anomaly, the invoice remains a draft.
      </Note>
      <H2>3. Validation and sending</H2>
      <OL>
        <LI>Check the PDF preview.</LI>
        <LI>Click <strong>Validate</strong> to make the invoice final (the entry is locked).</LI>
        <LI>Click <strong>Send by email</strong> to send the PDF to the customer with a payment link.</LI>
      </OL>
      <Note>
        A validated invoice can no longer be modified. To correct an error, issue
        a <strong>credit note</strong> that will reverse the original entry.
      </Note>
    </ArticleProse>
  )
}
