import { ArticleProse, H2, OL, LI, P, Note, UL, Code } from "../article-shell"

export default function ProvisionsIas19() {
  return (
    <ArticleProse>
      <P>
        The standard <strong>IAS&nbsp;19 — Employee Benefits</strong> requires the
        recognition, at the end of each financial year, of an actuarial provision
        for post-employment obligations. In Mauritius, the main application concerns
        the <em>Portable Retirement Gratuity Fund</em>
        (PRGF) and the severance benefits provided for by the <em>Workers&apos; Rights Act 2019</em>.
      </P>
      <H2>1. Scope</H2>
      <UL>
        <LI><strong>Defined contribution plans</strong> (PRGF, outsourced pension funds)&nbsp;: the expense equals the contribution for the period — no IAS 19 provision.</LI>
        <LI><strong>Defined benefit plans</strong> (retirement gratuity, end-of-career benefits)&nbsp;: actuarial provision mandatory.</LI>
      </UL>
      <H2>2. Calculation method (PUC)</H2>
      <P>
        IAS&nbsp;19 uses the <em>Projected Unit Credit</em> method. Each period of service gives rise to a fraction of the benefit, which is then&nbsp;:
      </P>
      <OL>
        <LI>projected to the probable date of departure (taking salary inflation into account)&nbsp;;</LI>
        <LI>discounted at the rate of government bonds with an equivalent duration&nbsp;;</LI>
        <LI>weighted by the probability of presence at maturity (mortality, resignation).</LI>
      </OL>
      <Note>
        Lexora includes a simplified actuarial module for SMEs&nbsp;: you simply
        enter the headcount table (entry date, salary, age) and
        the assumptions (discount rate, salary inflation rate, turnover
        rate). For listed or large companies, an external actuary
        remains necessary.
      </Note>
      <H2>3. Entering the provision in Lexora</H2>
      <OL>
        <LI>Open <strong>Payroll &gt; IAS 19</strong>.</LI>
        <LI>Enter the <strong>actuarial assumptions</strong> for the financial year (discount rate published by the Bank of Mauritius, salary progression rate).</LI>
        <LI>Import or update the <strong>headcount table</strong>.</LI>
        <LI>Run the calculation. Lexora produces&nbsp;:
          <UL>
            <LI>the <strong>Defined Benefit Obligation</strong> (DBO) at opening and at closing&nbsp;;</LI>
            <LI>the <strong>current service cost</strong> (expense for the year)&nbsp;;</LI>
            <LI>the <strong>interest cost</strong>&nbsp;;</LI>
            <LI>the <strong>actuarial gains and losses</strong>, recognised in other comprehensive income (OCI).</LI>
          </UL>
        </LI>
        <LI>Validate. The following entries are generated :
          <UL>
            <LI><Code>6815 — IAS 19 retirement expense</Code> as a debit&nbsp;;</LI>
            <LI><Code>1531 — Provision for retirement obligations</Code> as a credit&nbsp;;</LI>
            <LI><Code>1071 — Actuarial reserves (OCI)</Code> for the gains and losses.</LI>
          </UL>
        </LI>
      </OL>
      <H2>4. Disclosures in the notes</H2>
      <P>
        IAS&nbsp;19 requires disclosure, in the notes to the financial statements&nbsp;: the nature of the
        plan, the actuarial assumptions, the opening/closing reconciliation
        of the DBO, and a sensitivity analysis to the main assumptions (±0.5&nbsp;point).
        Lexora automatically generates IFRS-compliant notes 21 and 22.
      </P>
    </ArticleProse>
  )
}
