import { ArticleProse, H2, OL, LI, P, Note, UL } from "../article-shell"

export default function ComprendreBalance() {
  return (
    <ArticleProse>
      <P>
        The <strong>trial balance</strong> is the central document of a period&apos;s
        accounting&nbsp;: it lists all general ledger accounts with their debit and
        credit totals and their balance. It is the basis for all controls and for
        producing the financial statements.
      </P>
      <H2>1. Open the trial balance</H2>
      <OL>
        <LI>Open <strong>Accounting &gt; Trial balance</strong>.</LI>
        <LI>Choose the <strong>period</strong> (month, quarter, financial year).</LI>
        <LI>Select the <strong>level of detail</strong> (class, root, full account).</LI>
      </OL>
      <H2>2. Reading the columns</H2>
      <UL>
        <LI><strong>Period debit</strong>&nbsp;: sum of debit movements over the chosen period.</LI>
        <LI><strong>Period credit</strong>&nbsp;: sum of credit movements over the period.</LI>
        <LI><strong>Debit balance</strong> / <strong>Credit balance</strong>&nbsp;: the account&apos;s net balance (only one of the two is non-zero).</LI>
      </UL>
      <H2>3. Consistency checks</H2>
      <OL>
        <LI>The <strong>total debits</strong> must always equal the <strong>total credits</strong> (the double-entry principle).</LI>
        <LI>Accounts in classes&nbsp;1 to 5 are balance sheet accounts, classes&nbsp;6 and&nbsp;7 are income statement accounts.</LI>
        <LI>Before filing the VAT return, check that the balance of account <em>4457 — TVA collectée</em> matches the cumulative total of invoices issued.</LI>
        <LI>Third-party accounts (411, 401) must be substantiated by the <strong>subsidiary ledger</strong>.</LI>
      </OL>
      <Note>
        A debit/credit imbalance in the trial balance reveals a corrupted entry or
        an import problem. Lexora blocks the validation of unbalanced entries,
        but a data migration may introduce the anomaly. Run the
        <em> Integrity check</em> report to identify the faulty entry.
      </Note>
    </ArticleProse>
  )
}
