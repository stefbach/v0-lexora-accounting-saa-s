import { ArticleProse, H2, OL, LI, P, Note, UL } from "../article-shell"

export default function ImporterReleveBancaire() {
  return (
    <ArticleProse>
      <P>
        Importing the bank statement is the first step of reconciliation&nbsp;:
        it consists of loading into Lexora the transactions provided by your bank,
        so they can then be matched with the accounting entries.
      </P>
      <H2>1. Accepted formats</H2>
      <UL>
        <LI><strong>CSV</strong> (Excel or delimited text)&nbsp;;</LI>
        <LI><strong>OFX</strong> (Open Financial Exchange) — recommended for MCB, SBM, ABSA, BCP&nbsp;;</LI>
        <LI><strong>MT940</strong> (SWIFT standard) — commonly used by international banks&nbsp;;</LI>
        <LI><strong>PDF</strong> with automatic recognition (OCR), for unstructured statements.</LI>
      </UL>
      <H2>2. Procedure</H2>
      <OL>
        <LI>Open <strong>Treasury &gt; Bank reconciliation</strong>.</LI>
        <LI>Select the <strong>bank account</strong> to populate.</LI>
        <LI>Click on <strong>Import</strong> and drop the file (drag-and-drop or selection).</LI>
        <LI>Lexora automatically detects the format. Check the preview&nbsp;: dates, descriptions, debit/credit amounts, currency.</LI>
        <LI>If a transaction is already present (previous import), Lexora flags it and marks it as a duplicate&nbsp;: you can exclude it.</LI>
        <LI>Validate the import.</LI>
      </OL>
      <Note>
        For non-standard CSV files, Lexora offers a mapping assistant&nbsp;: manually
        match the &quot;Date&quot;, &quot;Description&quot;, &quot;Debit&quot;,
        &quot;Credit&quot;, &quot;Amount&quot; columns, then save the mapping for the following
        imports.
      </Note>
      <H2>3. Next step</H2>
      <P>
        Once imported, the statement appears in the <strong>Reconciliation</strong> tab.
        Lexora suggests an automatic match based on the amount and the description.
        Unreconciled transactions are flagged&nbsp;: create the
        missing entry (bank charges, internal transfers, ATM, etc.) to settle the account.
      </P>
    </ArticleProse>
  )
}
