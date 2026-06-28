import { ArticleProse, H2, OL, LI, P, Note } from "../article-shell"

export default function CreerSociete() {
  return (
    <ArticleProse>
      <P>
        This procedure lets you create a new company (a new accounting file)
        in Lexora. You must have the <strong>Administrator</strong> or{" "}
        <strong>Accountant</strong> role to perform this action.
      </P>
      <H2>1. Open the creation wizard</H2>
      <OL>
        <LI>Sign in to your Lexora workspace.</LI>
        <LI>Open the user menu in the top right, then click <strong>My companies</strong>.</LI>
        <LI>Click <strong>New company</strong>.</LI>
      </OL>
      <H2>2. Enter the legal information</H2>
      <OL>
        <LI>Enter the <strong>company name</strong> exactly as registered with the <em>Registrar of Companies</em>.</LI>
        <LI>Enter the <strong>BRN</strong> (Business Registration Number) — 9 characters beginning with C.</LI>
        <LI>Enter the <strong>TAN</strong> (Tax Account Number) if the company is subject to corporate income tax.</LI>
        <LI>If the company is VAT-registered, tick <strong>VAT registered</strong> and enter the VAT number.</LI>
      </OL>
      <H2>3. Set up the financial year</H2>
      <OL>
        <LI>Choose the <strong>financial year start date</strong>. By default, Lexora suggests 1&nbsp;July (the standard Mauritian fiscal year).</LI>
        <LI>Select the <strong>main currency</strong> (MUR by default).</LI>
        <LI>Choose the <strong>chart of accounts</strong> (PCM&nbsp;— Plan Comptable Mauricien — by default).</LI>
      </OL>
      <Note>
        The choice of chart of accounts is permanent. To change it, you will need to create a new company and migrate the entries.
      </Note>
      <H2>4. Invite collaborators</H2>
      <P>
        Once the company is created, you can invite other users from the{" "}
        <strong>Team</strong> tab and assign them a role (Administrator,
        Accountant, Viewer, etc.). Permissions are managed by the multi-tenant
        RLS system&nbsp;: each user only sees the data of the companies they
        have been granted access to.
      </P>
    </ArticleProse>
  )
}
