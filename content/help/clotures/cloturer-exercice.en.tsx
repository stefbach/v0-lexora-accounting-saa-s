import { ArticleProse, H2, OL, LI, P, Note, UL } from "../article-shell"

export default function CloturerExercice() {
  return (
    <ArticleProse>
      <P>
        The year-end close is the set of accounting operations that
        allow the accounts to be finalised at the financial year-end date and
        the financial statements to be produced (balance sheet, income statement, statement of cash
        flows, notes).
      </P>
      <H2>1. Pre-close (month preceding the year-end close)</H2>
      <OL>
        <LI>Enter all customer and supplier invoices.</LI>
        <LI>Import and reconcile all bank statements.</LI>
        <LI>Match the third-party accounts (411, 401, 421).</LI>
        <LI>Check VAT consistency&nbsp;: returns filed, balances 4456/4457.</LI>
      </OL>
      <H2>2. Inventory work</H2>
      <UL>
        <LI><strong>Inventories</strong>&nbsp;: physical stocktake, valuation at cost or net realisable value (IAS 2).</LI>
        <LI><strong>Fixed assets</strong>&nbsp;: recognition of depreciation charges, impairment tests (IAS 36).</LI>
        <LI><strong>Provisions</strong>&nbsp;: doubtful receivables, litigation, warranties, IAS&nbsp;19 (retirement obligations).</LI>
        <LI><strong>Prepaid expenses and deferred income</strong>&nbsp;: allocation to the financial year (CCA / PCA).</LI>
        <LI><strong>Accrued expenses / accrued income</strong>&nbsp;: invoices not yet received (FNP), accrued commissions.</LI>
        <LI><strong>Exchange differences</strong>&nbsp;: revaluation of foreign currency positions at the closing rate (IAS 21).</LI>
      </UL>
      <H2>3. Corporate income tax calculation (CIT)</H2>
      <OL>
        <LI>Determine the taxable profit&nbsp;: accounting profit + add-backs &minus; deductions.</LI>
        <LI>Apply the rate of 15&nbsp;% (Mauritian standard rate) or 3&nbsp;% (<em>Global Business</em> regime, subject to conditions).</LI>
        <LI>Recognise the <strong>tax charge</strong> and the <strong>deferred tax</strong> (IAS 12) on temporary differences.</LI>
      </OL>
      <H2>4. Production of the financial statements</H2>
      <OL>
        <LI>Open <strong>Year-end close &gt; Financial year</strong>.</LI>
        <LI>Run the <strong>closing pack</strong>&nbsp;: Lexora produces the balance sheet, the income statement, the statement of changes in equity, the statement of cash flows and the notes.</LI>
        <LI>Check each item. Anomalies (balance sheet discrepancy, unmatched accounts) are listed in the <strong>Closing controls</strong> panel.</LI>
      </OL>
      <H2>5. Locking and archiving</H2>
      <OL>
        <LI>Once the statements are validated, click on <strong>Close the financial year</strong>. All entries are locked.</LI>
        <LI>Lexora generates the <strong>opening entry</strong> on the 1st&nbsp;day of the following financial year.</LI>
        <LI>The complete file (PDF + journals + general ledger + trial balance) is archived in <strong>Documents &gt; Year-end closes</strong> and kept for <strong>10&nbsp;years</strong>.</LI>
      </OL>
      <Note>
        The year-end close is an <strong>irreversible</strong> operation. To correct an
        error after the close, you must go through a supervised
        re-opening procedure (Administrator role), which will be traced in the audit
        log.
      </Note>
    </ArticleProse>
  )
}
