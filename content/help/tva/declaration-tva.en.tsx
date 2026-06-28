import { ArticleProse, H2, OL, LI, P, Note, UL } from "../article-shell"

export default function DeclarationTva() {
  return (
    <ArticleProse>
      <P>
        In Mauritius, VAT (15&nbsp;% standard rate) is administered by the <em>Mauritius
        Revenue Authority</em> (MRA). The filing frequency depends on turnover&nbsp;:
        monthly above 10&nbsp;million MUR of annual turnover, quarterly below.
      </P>
      <H2>1. Preparation</H2>
      <OL>
        <LI>Make sure all customer and supplier invoices for the period are entered and validated.</LI>
        <LI>Run the <strong>VAT Control</strong> report to detect documents with no rate or an inconsistent rate.</LI>
        <LI>Reconcile the balances of accounts <em>4457 — Output VAT</em> and <em>4456 — Input VAT</em> against the general ledger.</LI>
      </OL>
      <H2>2. Generating the return</H2>
      <OL>
        <LI>Open <strong>VAT &gt; Returns</strong>.</LI>
        <LI>Click on <strong>New return</strong> and select the period.</LI>
        <LI>Lexora automatically calculates&nbsp;:
          <UL>
            <LI>the <strong>output VAT</strong> on taxable sales and zero-rated exports&nbsp;;</LI>
            <LI>the <strong>input VAT</strong> on purchases and imports&nbsp;;</LI>
            <LI>the <strong>net VAT payable</strong> or the carried-forward <strong>VAT credit</strong>.</LI>
          </UL>
        </LI>
      </OL>
      <H2>3. Checks before validation</H2>
      <UL>
        <LI>Click on each box to display the detail of the documents that fed into the amount.</LI>
        <LI>Check transactions subject to special schemes (exports, free-zone sales, cross-border services).</LI>
        <LI>Compare with the previous return to spot any abnormal variations.</LI>
      </UL>
      <H2>4. Submission to the MRA</H2>
      <OL>
        <LI>Validate the return. Lexora generates the VAT 4 form as a PDF and an XML exchange file compatible with the MRA portal.</LI>
        <LI>Download the file and upload it to the MRA <em>e-Tax</em> portal, or copy the amounts line by line.</LI>
        <LI>Make the payment by bank transfer or direct debit before the <strong>20th of the month following</strong> the end of the period.</LI>
      </OL>
      <Note>
        Keep the filing acknowledgement and the payment receipt&nbsp;: they must
        be archived for <strong>10&nbsp;years</strong> in accordance with VAT Act §65.
      </Note>
    </ArticleProse>
  )
}
