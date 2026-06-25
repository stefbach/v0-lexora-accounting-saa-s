/**
 * Centralised English help content for Lexora — mirrors HELP_CONTENT (FR)
 * key by key. Used when the user has selected English as their language.
 *
 * British English. Mauritian tax acronyms (MRA, VAT, TDS, CIT, PAYE, NSF,
 * CSG, GBC, FSC, ROC, SFT, APS, IRN, BRN, TAN, CIGA, UBO) are kept as-is.
 */

import type { HelpEntry } from './content'

export const HELP_CONTENT_EN: Record<string, HelpEntry> = {
  // ========================================================================
  // CLIENT ROOT — FULL ONBOARDING JOURNEY
  // ========================================================================
  '/client': {
    title: "Client workspace — onboarding and overview",
    audience: 'client',
    intro:
      "Welcome to Lexora, your accounting, HR and tax platform for Mauritius. This page orients you whether you are an SME owner discovering accounting, an accountant in practice, or the CFO of a multi-entity group. Everything Mauritian law requires (VAT Act 1998, Income Tax Act 1995, Workers Rights Act 2019, Companies Act 2001, FSC for GBC) is automated here — all you have to do is validate and pay.",
    steps: [
      {
        title: "1. Create your Lexora account",
        body:
          "Go to <b>lexora.finance</b>, click <b>Sign up</b>, enter email and password. You receive a confirmation link. Once validated, you land on an empty workspace: that is normal, you are about to configure everything in 30 minutes.",
      },
      {
        title: "2. Create your first company",
        body:
          "Menu <b>Settings → My companies → New</b>. Fill in <b>BRN</b> (Business Registration Number, 9 digits issued by the CBRD), <b>TAN</b> (MRA Tax Account Number, 1 letter + 9 digits), <b>VAT number</b> if already registered, business sector, currency (MUR by default), financial year (July-June or January-December).",
        warning:
          "No VAT number yet? Fine, you can add it later once obtained (see the VAT help for the procedure).",
      },
      {
        title: "3. Configure your invoicing details",
        body:
          "Menu <b>Settings → Invoicing</b>. Upload your logo, check the address shown on invoices, add your <b>MUR IBAN</b> (and foreign IBAN if you invoice in USD/EUR), set default payment terms (30 days net is standard) and customise legal mentions.",
      },
      {
        title: "4. Connect your banks (automatic scraping)",
        body:
          "Menu <b>Management → Bank Access</b>. Enter your Internet Banking credentials (MCB, SBM, ABC, MauBank, AfrAsia, Bank One). Lexora encrypts AES-256-GCM and fetches balance and transactions every night at 02:00 UTC. You never download a statement again.",
        warning:
          "If your bank has compulsory 2FA OTP, disable it for this profile or create a read-only sub-user dedicated to Lexora.",
      },
      {
        title: "5. Configure your MRA access",
        body:
          "Menu <b>Management → MRA Access</b>. Enter your <b>eservices.mra.mu</b> username and password. The Playwright robot can submit VAT, PAYE, CSG/NSF, TDS, CIT automatically. If you prefer to submit yourself, you can leave this empty — Lexora will still generate the CSV/XML files.",
      },
      {
        title: "6. Import your employees",
        body:
          "Menu <b>HR → Employees → Import</b> (CSV) or one by one. For each: first name, last name, joining date, basic salary, IBAN, contract type (CDI/CDD), CSG category A or B. Lexora computes PAYE, NSF, CSG, PRGF, leave, severance per the <b>Workers Rights Act 2019</b>.",
      },
      {
        title: "7. Connect Telegram (recommended)",
        body:
          "Menu <b>My Profile → Telegram</b>. Generate a 6-character code, open <b>@LexoraAgent_bot</b> on your phone and type <b>/start CODE</b>. You can now: photograph a supplier invoice and Lexora captures it, ask for a \"morning brief\", file VAT, validate payroll. All from mobile.",
      },
      {
        title: "8. Start scanning your documents",
        body:
          "Menu <b>Documents → Import</b>, or photo via Telegram, or email forwarding to documents@your-tenant.lexora.finance. The <b>Claude AI OCR</b> identifies: supplier invoice, bank statement, contract, receipt. For invoices it extracts supplier, date, amounts net/VAT/gross, suggests a ledger account. One-click validation.",
      },
      {
        title: "9. Issue your first customer invoices",
        body:
          "Menu <b>Sales → New invoice</b>. Pick the customer (created on the fly), add lines, Lexora computes 15% VAT and gross. Issue → PDF generated, automatic number (prefix + YYYY-NNNNN), class 4/7 entries booked, optional email to customer.",
      },
      {
        title: "10. Steer from the dashboard",
        body:
          "Menu <b>Dashboard</b>. You see real-time cash, turnover, expenses, profit, alerts (MRA deadlines T-7, overdue invoices, documents pending). Drill-down on every indicator for details.",
      },
      {
        title: "11. MRA deadlines handled automatically",
        body:
          "On the 5th of the following month, Lexora prepares VAT, PAYE, CSG/NSF, TDS. The Telegram bot sends: <em>\"VAT May 2026 ready: MUR 247,500 to pay before the 20th\"</em> with a direct link. You validate → robot submits → all you have to do is pay by transfer. Penalties avoided.",
      },
      {
        title: "12. Scale to large groups",
        body:
          "If you manage 5, 50 or 500 companies: multi-company selector at the top, IFRS 10 consolidation in Tools → Consolidation, team and per-client assignments in Practice → Team. Telegram supports several active companies with the <b>/society</b> command.",
      },
    ],
    pitfalls: [
      "Filling an incorrect BRN or TAN: your MRA returns will be rejected. Double-check at company creation.",
      "Forgetting to validate the sign-up email: you cannot log in, the link expires after 24 hours.",
      "Entering an IBAN with spaces or dashes: some fields only accept the raw IBAN (26 characters in Mauritius). Lexora cleans automatically but verify.",
      "Not activating Telegram: you miss deadline reminders and photo capture. It is free, do it.",
      "Sharing the same bank account between two companies: Lexora misclassifies transactions. One account = one company.",
    ],
    externalLinks: [
      { label: "Sign up to Lexora", url: "https://lexora.finance/signup", description: "Account creation (free during trial)." },
      { label: "Corporate and Business Registration Department (CBRD)", url: "https://onlinebrd.govmu.org/", description: "Obtain BRN, file Annual Return." },
      { label: "MRA — eServices portal", url: "https://eservices.mra.mu", description: "All tax returns (VAT, PAYE, CIT, TDS)." },
      { label: "FSC Mauritius", url: "https://www.fscmauritius.org", description: "Regulator for GBC, AC, Investment Dealer." },
      { label: "Lexora Telegram bot", url: "https://t.me/LexoraAgent_bot", description: "Link once and everything is mobile-ready." },
    ],
    tips: [
      "Keyboard shortcut <b>?</b> on any page opens the contextual help.",
      "The floating help button at the bottom right explains every page you visit — click it systematically in the first weeks.",
      "For groups > 10 companies, ask to enable <b>Practice mode</b> which adds portfolio, team assignments and internal billing.",
      "Multinationals > 50 companies: enable <b>Tools → IFRS 10 Consolidation</b> to generate consolidated accounts automatically with intra-group elimination.",
      "Independent accountant managing several SMEs: use the practice dashboard to see all your clients on one screen.",
    ],
  },

  // ========================================================================
  // TAX — VAT
  // ========================================================================
  '/comptable/tva': {
    title: 'VAT return — Mauritius (VAT Act 1998)',
    audience: 'comptable',
    intro:
      "Mauritian VAT (Value Added Tax, standard rate <b>15%</b>) is governed by the VAT Act 1998. Any business with turnover above <b>MUR 6 million</b> over 12 rolling months MUST register and collect VAT. This page automatically consolidates VAT collected (customer invoices) and deductible (supplier invoices) for the period, computes the balance to pay or carry forward, and generates the Schedule A / B / VAT3 / VAT4 files to upload to eservices.mra.mu before the 20th of the following month.",
    steps: [
      {
        title: "1. Understand who must register",
        body:
          "Compulsory if <b>annual turnover ≥ MUR 6 M</b>, or activity listed Schedule 4 of the VAT Act (professional services: lawyers, accountants, architects, engineers, doctors... no threshold). Importers: VAT paid at customs on CIF value. Voluntary registration possible below threshold if you have heavy deductible VAT (exports, B2B).",
      },
      {
        title: "2. Obtain your VAT number (if not yet)",
        body:
          "Go to <b>eservices.mra.mu → VAT Registration</b>. Form <b>VAT3</b> with supporting documents: BRN certificate (CBRD), lease/property deed of head office, articles of association, director's NIC + KYC, turnover forecast. MRA processing time: <b>10 to 15 working days</b>. You receive your VATRN format VAT + 8 digits.",
        warning:
          "Until you have the VATRN, you CANNOT invoice with VAT. If you do anyway, you must remit to MRA without being able to deduct.",
      },
      {
        title: "3. Know the rates and exemptions",
        body:
          "<b>15%</b> = standard (majority). <b>0%</b> (zero-rated) = exports, international transport, certain Schedule 2 products. <b>Exempt</b> Schedule 1 = rice, flour, essential medicines, education, banking services, residential housing rent, medical care. <b>Crucial difference</b>: zero-rated allows upstream deduction, exempt does not.",
      },
      {
        title: "4. Choose your frequency",
        body:
          "<b>Monthly (VAT3)</b> compulsory if turnover > MUR 10 M/year. <b>Quarterly (VAT4)</b> otherwise. In Lexora: company settings → VAT regime. The selection drives the deadline calendar and file format.",
      },
      {
        title: "5. Lexora calculates automatically",
        body:
          "From customer invoices (VAT collected) and supplier invoices (VAT deductible), Lexora computes by rate and account: 15% base, 0% base, exempt base, VAT collected, VAT deductible (with pro-rata rule for mixed activity), VAT due or credit carried forward. You see the detail invoice by invoice by clicking each line.",
        warning:
          "A <b>draft</b> invoice is NOT counted — issue them before closing. A foreign-currency invoice is converted at the MRA rate of the invoice date (IAS 21).",
      },
      {
        title: "6. Handle special cases",
        body:
          "<b>Reverse charge</b> (section 21A) on services imported from non-residents: you self-liquidate VAT (15% collected + 15% deductible if taxable activity). <b>Goods import</b>: VAT paid at customs shown in Schedule B. <b>GBC Partial Exemption</b>: 80% deemed inputs pro-rata. <b>Real estate sale</b>: exempt except new < 5 years (15%).",
      },
      {
        title: "7. Generate the MRA files",
        body:
          "Tab <b>MRA export</b>: Lexora produces <b>Schedule A</b> (detailed sales CSV), <b>Schedule B</b> (purchases CSV), <b>VAT3.xml</b> or <b>VAT4.xml</b> (summary). Check the PDF summary before sending (totals by rate, VAT/turnover ratio, comparison vs previous month).",
      },
      {
        title: "8. Submit on eservices.mra.mu",
        body:
          "Log in with TAN + password. Menu <b>VAT → Submit Return</b>. Choose the period. Upload Schedule A and B CSVs. Upload the XML summary. Check the pre-filled totals (amount payable at bottom). Click <b>Submit</b>. You receive an acknowledgement with MRA reference.",
        warning:
          "Strict deadline: <b>20th of the following month</b>. Beyond: <b>5% penalty</b> + <b>0.5% per month</b> interest. MRA closes the portal on the 20th at 23:59.",
      },
      {
        title: "9. Pay the balance",
        body:
          "Bank transfer <b>MCB-MRA Real-Time</b> or <b>SBM-MRA</b> or standard Internet Banking with MRA reference (TAN + period). 1 working day delay. You can also pay through the MRA portal by direct debit. Mark the return as <b>paid</b> in Lexora once done so it disappears from alerts.",
      },
      {
        title: "10. Full automation via Telegram",
        body:
          "If you configured <b>Management → MRA Access</b>, ask the bot: <em>\"submit May VAT\"</em>. The Playwright robot logs into eservices.mra.mu, uploads the files, validates, sends you the MRA acknowledgement as a Telegram attachment. All you have to do is pay.",
      },
    ],
    pitfalls: [
      "Forgetting a supplier invoice (PDF left in mailbox) means losing 15% of deductible VAT. Scan all your documents before the 5th of the month.",
      "Wrong rate on an invoice line (0% instead of 15%) understates VAT collected, triggering MRA reassessment + 5% penalty.",
      "Forgetting reverse charge on foreign invoice (e.g. AWS, Google Ads, foreign consulting): MRA recomputes at 15% + penalty. Lexora auto-flags non-resident suppliers.",
      "Invoicing with VAT without holding a VATRN: serious offence, fine up to MUR 200,000 + full remittance.",
      "Period not locked on Lexora side: post-filing edits desync the return. Lock via <b>Accounting → Closings</b>.",
      "Forgetting to mark an export invoice as <b>zero-rated</b> with customs evidence: MRA refuses 0%, applies 15%.",
    ],
    externalLinks: [
      { label: "MRA — eServices portal (login + submit)", url: "https://eservices.mra.mu", description: "Sign-in to submit the return." },
      { label: "MRA — VAT registration (form VAT1)", url: "https://www.mra.mu/index.php/eservices/value-added-tax-vat", description: "How to obtain a VATRN for the first time." },
      { label: "VAT Act 1998 — full text", url: "https://www.mra.mu/download/VATAct.pdf", description: "Applicable law, Schedules 1 to 5." },
      { label: "MRA — Practical VAT guide", url: "https://www.mra.mu/download/VATGuide.pdf", description: "All rates, special cases, examples." },
      { label: "MRA — Official exchange rates", url: "https://www.mra.mu/index.php/exchange-rates", description: "For foreign-currency invoices (IAS 21)." },
      { label: "MRA VAT Helpdesk", url: "https://www.mra.mu/index.php/contact-us", description: "For rate, exemption or dispute questions." },
    ],
    tips: [
      "Enable Telegram reminders T-7 / T-3 / T-1 for VAT — you get a mobile message with amount and direct link.",
      "For multinationals: use <b>Tools → Consolidated VAT export</b> to generate the files for all your Mauritian companies in one ZIP.",
      "If you exceed MUR 100 M turnover, request the MRA <b>Large Taxpayer</b> status — dedicated contact, extended deadlines in force-majeure cases.",
      "VAT entries are posted automatically: 4456 deductible VAT, 4457 VAT collected, 4455 VAT payable. Verify in the ledger.",
      "For pure export companies (zero-rated), you systematically have a <b>VAT credit</b> refundable. Claim refund annually with MRA form VAT22.",
    ],
  },

  // ========================================================================
  // HR — PAYROLL + MRA PAYE/CSG/NSF/PRGF
  // ========================================================================
  '/rh/paie': {
    title: 'Monthly payroll + MRA returns (PAYE, CSG, NSF, PRGF)',
    audience: 'comptable',
    intro:
      "Full payroll cycle: variables → calculation → payslips → accounting → salary transfers → MRA social returns. Lexora applies automatically the <b>2025-2026 PAYE schedule</b> (5 brackets from 0% to 20%), <b>CSG</b> (Contribution Sociale Généralisée, 1.5% or 3% employee + employer depending on category), <b>NSF</b> (National Savings Fund, 2.5% employer + 1% employee capped at MUR 19,700), <b>PRGF</b> (Portable Retirement Gratuity Fund, 4.5% employer). MRA deadline: <b>20th of the following month</b>.",
    steps: [
      {
        title: "1. Prerequisite: employees up to date",
        body:
          "Before calculation, verify in <b>HR → Employees</b>: basic salary, IBAN, NIC, NID, CSG category (A ≤ MUR 50,000 or B > 50,000), joining date. A missing IBAN puts the employee in the <em>NO_BANK</em> file.",
      },
      {
        title: "2. Enter the month's variables",
        body:
          "Tab <b>Variables</b>: overtime (1.5x the first 10 hours weekly, 2x beyond or Sunday/holiday — WRA s.18), bonuses, commissions, transport allowance, unjustified absences, unpaid leave. Direct entry or via Telegram: <em>\"Jean 8h OT 1.5x May\"</em>.",
      },
      {
        title: "3. Run the calculation",
        body:
          "Button <b>Calculate the month</b>. For each employee Lexora computes: gross (base + OT + bonuses), allowances (IET MUR 325,000/year, dependants), <b>PAYE</b> (0/10/12.5/15/17.5/20% by bracket), <b>NSF</b> (1% employee + 2.5% employer on slice up to MUR 19,700), <b>CSG</b> (cat. A: 1.5%/3% ; cat. B: 3%/6%), <b>PRGF</b> (4.5% employer), net pay.",
      },
      {
        title: "4. Check the payslips",
        body:
          "Tab <b>Payslips</b>: list with gross, deductions, net. Compare with previous month: variation > 10% is flagged. Click a payslip to see PAYE detail by bracket, CSG base, NSF base.",
        warning:
          "If a net is negative (e.g. too many advances), correct before validating or the transfer will fail.",
      },
      {
        title: "5. Validate the payslips",
        body:
          "Click <b>Validate</b> on each (or <b>Validate all</b>). The payslip becomes official: PDF generated, emailed to the employee, copy in <b>Documents → Payslips</b>.",
      },
      {
        title: "6. Lock the period",
        body:
          "Button <b>Lock May 2026</b>. Critical action: automatic posting (account 6411 Gross salaries, 4310 Net staff, 4311 PAYE due, 4312 NSF due, 4313 CSG due, 4314 PRGF due) + no further modification possible.",
        warning:
          "Destructive action. Get a second pair of eyes. Via Telegram, the bot asks explicit confirmation with a numerical recap.",
      },
      {
        title: "7. Generate salary transfers",
        body:
          "Tab <b>Exports → Salary transfers</b>. One CSV per beneficiary bank (MCB, SBM, ABC…) in SCT XML or proprietary CSV depending on bank. Upload to Internet Banking → <em>Bulk Payment</em> → execute.",
      },
      {
        title: "8. Generate MRA files",
        body:
          "Tabs <b>PAYE-MRA</b>, <b>CSG/NSF-MRA</b>, <b>PRGF-MRA</b>. For each: PDF summary + employee-level CSV. CSV format is strict (compulsory header, fixed column order, NID 14 digits).",
      },
      {
        title: "9. Submit on eservices.mra.mu",
        body:
          "Log in with MRA TAN. Menu <b>PAYE → Monthly Return</b>: upload PAYE CSV. <b>CSG/NSF</b>: upload combined CSV. <b>PRGF</b>: separate module. Verify totals, validate, note references.",
        warning:
          "Deadline <b>20th of the following month</b>. 5% penalty + interest beyond.",
      },
      {
        title: "10. Pay the contributions",
        body:
          "Balance due = PAYE withheld + CSG (employee + employer parts) + NSF (employee + employer parts) + PRGF. Transfer to MRA with reference TAN + period. Once done, mark as <b>paid</b> in Lexora.",
      },
      {
        title: "11. Full Telegram automation",
        body:
          "Workflow driven from your phone: <em>\"calculate May payroll\"</em> → <em>\"lock\"</em> → <em>\"generate transfers\"</em> → <em>\"submit PAYE CSG NSF\"</em>. The bot confirms each destructive step and sends you MRA acknowledgements as attachments.",
      },
    ],
    pitfalls: [
      "Wrong CSG category (A vs B): all deductions wrong. Cat A = ≤ MUR 50,000/month, cat B = > MUR 50,000.",
      "Period not locked: missing posting, MRA returns inconsistent with accounting, audit alert.",
      "Missing IBAN on an employee: appears in 'NO_BANK', manual transfer (time loss).",
      "Forgotten overtime or bonus: under-paid payslip, unhappy employee, Industrial Court litigation risk.",
      "NSF: not capping at MUR 19,700 means over-contribution and unnecessary loss.",
      "Forgetting PRGF: offence since 2020. 4.5% on every private-sector employee (except where an equivalent private pension exists).",
      "Submission after the 20th: automatic 5% penalty on each line (PAYE, CSG, NSF, PRGF separately).",
    ],
    externalLinks: [
      { label: "MRA — eServices portal (PAYE, CSG, NSF)", url: "https://eservices.mra.mu", description: "Submit monthly returns." },
      { label: "MRA — Official PAYE calculator", url: "https://www.mra.mu/index.php/individuals/calculate-your-paye", description: "Check a special case." },
      { label: "MRA — Income Tax Act 1995", url: "https://www.mra.mu/download/ITAct.pdf", description: "Legal basis for PAYE." },
      { label: "Workers Rights Act 2019", url: "https://labour.govmu.org/Documents/Legislations/WRA2019.pdf", description: "OT, leave, severance, EOY bonus." },
      { label: "NSF — Mauritius Revenue Authority", url: "https://www.mra.mu/index.php/employees/nsf", description: "NSF rate and cap." },
      { label: "CSG — MRA", url: "https://www.mra.mu/index.php/employees/csg", description: "Categories A and B." },
      { label: "PRGF — Portable Retirement Gratuity Fund", url: "https://www.prgf.mu", description: "Mandatory 4.5% scheme since 2020." },
    ],
    tips: [
      "Enable four-eyes validation for payrolls > MUR 1 M via Bot Permissions — Management confirms before lock.",
      "For groups: Lexora handles multi-company payroll with consolidated transfer from a central account and intra-group recharge.",
      "Individual payslips accessible to employees through the Lexora portal or Telegram (<b>/payslip</b> command).",
      "Bot sends T-7 / T-3 / T-1 reminder for the MRA deadline with amount due.",
      "If you have > 100 staff, ask MRA for the direct e-Filing module (API) — saves submission time.",
    ],
  },

  // ========================================================================
  // BANKING — CREDENTIALS
  // ========================================================================
  '/client/direction/bank-credentials': {
    title: 'Bank access — Nightly automatic scraping',
    audience: 'client',
    intro:
      "Configure Internet Banking credentials so Lexora fetches balances and transactions every night at 02:00 UTC. Credentials encrypted <b>AES-256-GCM</b> — nobody can read them in plain text, not even a Lexora admin. <b>Current status</b>: <em>MCB enabled</em>. SBM, ABC, MauBank, MyT Money, AfrAsia, Bank One: framework ready, activation case-by-case (their Internet Banking CSS selectors must be validated once — ~30 min per bank). Meanwhile, manual CSV/MT940 upload supported via <em>Bank accounts → Import statement</em>.",
    steps: [
      { title: "1. Check that your bank is enabled", body: "Today: <b>MCB ✅</b>. Other banks: code ready, selectors to be mapped (one-shot step). If your bank is not yet enabled and you need it, contact support — activation within 24-48 h." },
      { title: "2. Get your credentials", body: "MCB: username + password (+ secondary PIN for business accounts). Avoid an account with mandatory SMS 2FA: Lexora requests the OTP via Telegram at scrape time, but the automated OTP flow is not yet shipped.", warning: "<b>Ideally create a read-only sub-user</b> dedicated to Lexora — no payment initiation rights." },
      { title: "3. Create a read-only user (recommended)", body: "On your Internet Banking: <b>User Management → Create User</b>. Role <em>View Only</em>. This user can see balances and history without initiating payments. Maximum safety if Lexora credentials are ever compromised." },
      { title: "4. Enter credentials in Lexora", body: "For each company account, click <b>Configure</b>. Enter username, password, secondary PIN if applicable, and the associated Lexora bank account. AES-256-GCM encryption server-side before writing to database." },
      { title: "5. Enable scraping", body: "Tick <b>Automatic scraping enabled</b>. The Playwright worker runs every day at <b>02:00 UTC</b> (06:00 Mauritius time) and fetches balance and previous-day transactions." },
      { title: "6. Run a test scrape", body: "Button <b>Scrape now</b>. The robot attempts a connection (~30-60s). Three possible outcomes: <em>OK</em> (balance + transactions injected), <em>manual_needed</em> (OTP/CAPTCHA detected → screenshot sent on Telegram, submit OTP manually), <em>failed</em> (invalid password or bank lockout)." },
      { title: "7. Watch for anomalies", body: "Telegram bot alerts if: scraped balance differs > 5% from Lexora balance, > 30% change in 24h, transaction > MUR 1 M, 3 consecutive login failures. Anomalies stored in <code>bank_scrape_anomalies</code> for audit." },
      { title: "8. Quarterly maintenance", body: "If you change your bank password (forced every 90 days by MCB Business), update it here too or scraping fails daily." },
    ],
    pitfalls: [
      "Changing bank password without updating Lexora: daily scraping failure.",
      "Concurrent sessions: if you are manually logged in at 02:00 UTC, some banks disconnect the robot.",
      "MCB Business secondary PIN expires every 90 days — add a note in Notes to remember.",
      "Account opened less than 30 days ago: web access often blocked by default, wait for full activation.",
      "Wrong sub-account associated in Lexora: transactions injected into the wrong accounting bank journal, broken reconciliation.",
      "MCB Terms of Use may restrict automation. You authorize Lexora as an agent — confirm with your relationship manager that this is compatible with your contract.",
    ],
    externalLinks: [
      { label: "MCB Internet Banking", url: "https://ibank.mcb.mu" },
      { label: "SBM Internet Banking", url: "https://internetbanking.sbmgroup.mu" },
      { label: "ABC Banking", url: "https://www.abcbank.mu" },
      { label: "MauBank Online", url: "https://internetbanking.maubank.mu" },
      { label: "AfrAsia Bank", url: "https://www.afrasiabank.com" },
      { label: "Bank One", url: "https://www.bankone.mu" },
    ],
    tips: [
      "Trigger an ad-hoc scrape from Telegram (Management role): <em>\"scrape MCB current account\"</em>.",
      "Scraped transactions automatically feed bank reconciliation (rules R1-R7, see lexora-rapprochement-rules skill).",
      "For groups: configure once per company, scraping runs in parallel without limit.",
      "If MCB requires an OTP (standard case), the scraper switches to <em>manual_needed</em>, captures a screenshot and sends a Telegram notification. You receive the OTP by SMS, log in manually the first time to authorize the device, after which subsequent scrapes may proceed without OTP.",
      "Fallback always available: manual CSV/MT940 upload in <em>Bank accounts → Import statement</em> if scraping fails.",
    ],
  },

  // ========================================================================
  // MRA CREDENTIALS
  // ========================================================================
  '/client/direction/mra-credentials': {
    title: 'MRA access — Automatic submission robot',
    audience: 'client',
    intro:
      "Configure credentials for the <b>MRA eServices</b> portals. MRA Mauritius does NOT have a single portal: VAT, CIT, PAYE, CSG/NSF, TDS, PRGF each go through their own URL (eservices3, eservices38, eservices). Lexora handles these multiple portals transparently. Playwright robot submits on your behalf. Credentials encrypted AES-256-GCM, unreadable even by a Lexora admin. Compatible with all company types (resident, GBC, AC).",
    steps: [
      { title: "1. Check your TAN", body: "The <b>TAN</b> (Tax Account Number) format <code>X12345678</code> is allocated at incorporation. Visible on MRA correspondence. No TAN, no return can be filed." },
      { title: "2. Create the eServices account", body: "On <b>eservices.mra.mu</b> → <b>Register</b>: TAN + email + phone + SMS OTP. Activate modules <b>VAT</b>, <b>PAYE</b>, <b>CIT</b>, <b>TDS</b> in <em>Profile → Services</em>." },
      { title: "3. Enter credentials in Lexora", body: "Username (often the TAN), password, and explicit TAN if different. Server-side AES-256-GCM encryption before writing to database. No plaintext access even by Lexora admin." },
      { title: "4. Enable automatic submission", body: "Tick <b>Automatic submission active</b>. Ask the Telegram bot: <em>\"submit May PAYE\"</em> → Playwright robot connects to the correct MRA portal based on the declaration type → uploads the file generated by Lexora → captures the acknowledgement screenshot → you receive Telegram confirmation within seconds.", warning: "<b>If MRA triggers a CAPTCHA or OTP</b>: the robot returns <em>manual_needed</em>, captures a screenshot and sends it on Telegram. You finalize the submission manually." },
      { title: "5. Test the connection", body: "Button <b>Test</b>. Robot logs in (~20s) to the VAT portal (most stable case) and lists current obligations. Success: OK + returns due. Failure: precise message (password expired, locked, captcha, etc.) with screenshot." },
      { title: "6. Submission history", body: "History tab: every attempt with date, type, period, amount, MRA reference, screenshot of the acknowledgement or error. Search by reference for audit. 7-year retention (mig 248)." },
      { title: "7. Renew password every 90 days", body: "MRA forces password change every 90 days. Bot alerts 7 days in advance. Change on MRA first, THEN update here. Otherwise all auto submissions fail starting the day after the change." },
    ],
    pitfalls: [
      "MRA password expired: all auto submissions silently fail until updated.",
      "VAT/PAYE/CIT/TDS modules not activated on eServices: <em>Service not available</em> error. Activate them in Profile before first run.",
      "3 consecutive login failures: MRA locks account 30 min. The robot respects an automatic cooldown to avoid this.",
      "Account created by an accountant who left: password unknown. Request reset via MRA helpdesk with a director's letter.",
      "2FA OTP activated without telling Lexora: robot stuck at SMS step, systematic <em>manual_needed</em> status.",
      "Using a robot for MRA submissions may be regulated. For licensed tax practices, <b>MNS</b> accreditation grants access to official APIs that are more robust — discuss with your tax adviser.",
    ],
    externalLinks: [
      { label: "MRA eServices (central)", url: "https://eservices.mra.mu", description: "Main portal — login, profile, services." },
      { label: "MRA VAT Return", url: "https://eservices3.mra.mu/vatreturn/", description: "VAT submission — dedicated portal." },
      { label: "MRA Central Login (CIT)", url: "https://eservices38.mra.mu/centralLogin/login", description: "Corporate Income Tax." },
      { label: "MRA — New account registration", url: "https://eservices.mra.mu/eFilingProj/onlineRegistration.html", description: "Create an account using TAN." },
      { label: "MRA Helpdesk", url: "https://www.mra.mu/index.php/contact-us", description: "Reset password, unlock account." },
    ],
    tips: [
      "A single credential pair covers all 6 MRA portals — the robot routes to the right one automatically based on the declaration type.",
      "For multi-client practices: each company has its own encrypted credentials. The robot switches without intervention.",
      "Temporary deactivation (MRA audit in progress, tax inspection): untick <b>Auto submission</b>, Lexora keeps generating the files but stops submitting.",
      "Enable four-eyes validation for submissions > MUR 500,000: management confirms via Telegram before the robot launches the upload.",
      "Fallback always available: if the robot ends up in <em>manual_needed</em>, the Telegram bot sends you the files as attachments for manual upload on the MRA portal.",
    ],
  },

  // ========================================================================
  // EMAIL ACCOUNTS
  // ========================================================================
  '/client/email-accounts': {
    title: 'Email accounts — Outgoing mail in Lexora',
    audience: 'all',
    intro:
      "Configure email accounts used to send invoices, reminders, payslips, reports, notifications. One account per company (shared with management+) or personal (you only). Providers: <b>SMTP</b> (Gmail, OVH, Outlook, custom) and <b>Resend</b> (transactional API, better deliverability).",
    steps: [
      { title: "1. Choose your provider", body: "<b>SMTP</b>: simple, < 500 emails/day. <b>Resend</b>: transactional, verified domain required, ideal for bulk send (reminders, payslip batches)." },
      { title: "2a. Gmail: App Password", body: "Enable <b>2FA</b> on Google first (mandatory). Go to <b>myaccount.google.com/apppasswords</b>. Create an App Password <em>Lexora</em>. Copy the 16 characters.", warning: "App Passwords page inaccessible = 2FA not enabled. Activate it in Security → 2-Step Verification." },
      { title: "2b. Outlook / OVH / custom", body: "Get host (smtp-mail.outlook.com), port (587 STARTTLS or 465 SSL), username (full email), password (normal or App Password)." },
      { title: "2c. Resend: verified domain", body: "On <b>resend.com/domains</b> → Add Domain (acme.io). Configure DNS (SPF TXT, DKIM CNAME, DMARC TXT) with your registrar. Wait for verification ~10 min. Generate API key in resend.com/api-keys." },
      { title: "3. Fill in the form", body: "Label (<em>Invoicing Acme</em>), From email, From name. Type: <b>Personal</b> or <b>Company</b>. Tick <b>Default</b> if you want this account everywhere." },
      { title: "4. Test", body: "Test button: email sent to your From. Inbox: OK. Spam: check SPF/DKIM/DMARC. Error: precise message (auth failed, domain unverified)." },
      { title: "5. Use in Lexora", body: "Invoices → Send button uses default. Auto reminders (cron 08:00 UTC). Payslips. You can route by module (Settings → Notifications)." },
    ],
    pitfalls: [
      "Gmail with normal password: 'Username and Password not accepted'. App Password compulsory.",
      "Resend with unverified domain: status 422 at send.",
      "No SPF on your domain: catastrophic deliverability, emails to spam.",
      "Google password change without updating Lexora: all sends break.",
      "Gmail 500/day limit. Beyond: switch to Resend.",
    ],
    externalLinks: [
      { label: "Google App Passwords", url: "https://myaccount.google.com/apppasswords" },
      { label: "Resend Domains", url: "https://resend.com/domains" },
      { label: "Resend API Keys", url: "https://resend.com/api-keys" },
      { label: "Deliverability tester", url: "https://www.mail-tester.com" },
    ],
    tips: [
      "Telegram agent sends reminders automatically via these accounts.",
      "Brand 'Acme Accounting &lt;contact@acme.io&gt;' instead of Lexora default: configure Resend with your domain.",
      "Practice: configure one account per client so every invoice goes out from the client's domain.",
      "Multinationals: route emails per subsidiary (Settings → Routing) following local charters.",
    ],
  },

  // ========================================================================
  // GOOGLE ACCOUNTS (Calendar)
  // ========================================================================
  '/client/settings/google-accounts': {
    title: 'Google accounts (Calendar) — OAuth connection',
    audience: 'all',
    intro:
      "Connect your Google account so Lexora can manage your calendar from Telegram: create client meetings, add Google Meet, find free slots across attendees, edit/cancel events. OAuth 2.0 — Lexora NEVER sees your Google password, only a revocable token.",
    steps: [
      { title: "1. Prepare", body: "Sign in only to the Google account you want to link. Otherwise log out from others or use private browsing." },
      { title: "2. Connect Google", body: "Redirect to Google consent. Permissions: <em>View and edit events on your calendar</em>, email, profile.", warning: "If you see 'Application not verified' or 'Access blocked': your email is not in Test Users on the Google Cloud side. Ask the Lexora admin." },
      { title: "3. Authorise", body: "Click <b>Authorise</b>. Back to this page with your Google email and <em>Connected</em> badge. Refresh token stored encrypted." },
      { title: "4. Multiple accounts (optional)", body: "Link several accounts (personal + practice + company). Pick the <b>default</b>. The bot asks which calendar if several." },
      { title: "5. Use from Telegram", body: "<em>\"list my meetings this week\"</em>, <em>\"meeting with marie tomorrow 2pm video\"</em>, <em>\"find a 1h slot with jean@acme.com and paul@acme.com Tuesday\"</em>, <em>\"cancel the 4pm meeting\"</em>. Auto Meet links." },
      { title: "6. Revoke", body: "Any time on <b>myaccount.google.com/permissions</b>. Lexora side: <b>Disconnect</b> button." },
    ],
    pitfalls: [
      "Auto-selection of another Google account: log out from others or use private browsing.",
      "Reconnecting an already-linked account: revoke first on Google side.",
      "App in Testing mode until Google verification requested (useful > 100 users).",
      "Switching primary Google account: old events stay in the old calendar.",
    ],
    externalLinks: [
      { label: "My Google permissions", url: "https://myaccount.google.com/permissions" },
      { label: "My Google Calendar", url: "https://calendar.google.com" },
      { label: "Google Workspace", url: "https://workspace.google.com" },
    ],
    tips: [
      "Events created via Telegram appear in Google Calendar + invitations sent to attendees.",
      "Practice: link a shared <em>meetings@firm.io</em> account for team collaboration.",
      "Outlook Calendar supported via Microsoft Graph — ask support if you use 365.",
    ],
  },

  // ========================================================================
  // TELEGRAM PERMISSIONS
  // ========================================================================
  '/client/telegram-permissions': {
    title: 'Telegram bot permissions — Roles and capabilities',
    audience: 'client',
    intro:
      "Configure who can use <b>@LexoraAgent_bot</b> and with which rights. You link employees (6-character code), set roles (Employee → Manager → HR → Accountant → Management), and refine capabilities. Full audit of every Telegram action.",
    steps: [
      { title: "1. Roles matrix", body: "<b>Employee</b>: see own payslips, clock in, request leave. <b>Manager</b>: + approve team leave. <b>HR</b>: + OT, bonuses, payroll. <b>Accountant</b>: + bank, invoices, MRA, journal entries. <b>Management</b>: EVERYTHING, including transfers, deletion, credentials." },
      { title: "2. Members list", body: "<b>Members</b> table: users with a Lexora account linked to this company. Change role or customise capabilities (<b>Permissions</b> button)." },
      { title: "3. HR employees not linked", body: "<b>HR employees</b> table: active employees without a Lexora account. Click <b>Generate code</b> to create account + Telegram code." },
      { title: "4. Generate a code", body: "Choose role (default Employee), custom capabilities if needed. <b>Generate code</b> → 6-character code + link <code>t.me/LexoraAgent_bot?start=CODE</code> + ready-to-send message (WhatsApp, email, SMS).", warning: "Code expires after <b>15 minutes</b>. Otherwise regenerate." },
      { title: "5. Employee activation", body: "They click the link or search the bot, type <b>/start CODE</b>. Instant activation. Bot greets by first name + announces role + suggests useful commands." },
      { title: "6. Override capabilities", body: "<b>Permissions</b> button on a member → matrix of ~40 capabilities. Tick/untick finely. Override > default role." },
      { title: "7. Audit", body: "Every action tracked in <code>telegram_actions</code>: who, when, what, amount. Column <em>Audit (30 days)</em>. CSV export for external audit." },
      { title: "8. Revoke", body: "<b>Revoke</b> button on a member: token invalidated immediately. Useful on departures." },
    ],
    pitfalls: [
      "Missing email on the employee: cannot generate code.",
      "Several employees with the same email: only one link possible.",
      "Granting Management to a junior: risks (MRA submissions, MUR 1 M transfers).",
      "Custom capabilities forgotten after role change: review after every change.",
      "Code shared to the wrong WhatsApp number: someone else links. Revoke immediately.",
    ],
    tips: [
      "Destructive actions → recap + <em>Confirm</em>/<em>Cancel</em> buttons before execution.",
      "Bot uses first name and role naturally in replies.",
      "Practice: a collaborator can be linked to several client companies.",
      "Enable <b>four-eyes validation</b> for transfers > MUR 500,000.",
      "Multinationals: integrate SAML SSO (Settings → SSO) to manage roles centrally.",
    ],
  },

  // ========================================================================
  // ACCOUNTING — DASHBOARD
  // ========================================================================
  '/comptable': {
    title: 'Accounting dashboard',
    audience: 'comptable',
    intro:
      "Overview of activity across all companies you follow: today's alerts, pending invoices, MRA deadlines (VAT, PAYE, CIT, TDS), real-time bank balances, financial KPIs, assigned tasks. Starting point each morning, for accountants in practice as well as group CFOs.",
    steps: [
      { title: "1. Select a company", body: "Top selector. All indicators filter on the active company. Quick switch via Practice menu for multi-client." },
      { title: "2. Read today's alerts", body: "Missing documents, overdue invoices, imminent MRA deadlines (T-7 / T-3 / T-1), bank anomalies (> 30% variation), unjustified absent employees. Click each alert to resolve it directly." },
      { title: "3. Check cash", body: "Balances of all active bank accounts, refreshed nightly if scraping configured (Management → Bank Access). Key indicator: 30-day projected cash including known deadlines." },
      { title: "4. Monthly KPIs", body: "Turnover, expenses, profit, gross margin, DSO (Days Sales Outstanding), DPO. Compare with previous month and year. Drill-down on each KPI." },
      { title: "5. Assigned tasks", body: "Your monthly task list: May VAT, June payroll, journal entries, invoices to issue. Prioritised by deadline." },
      { title: "6. Acting as client", body: "<em>Acting as</em> button on a client → you see Lexora as if you were the director. Useful for data entry / checks." },
    ],
    pitfalls: [
      "Frozen indicator: check the selected company + up-to-date data (invoices issued, entries posted).",
      "Wrong KPI: a poorly entered manual journal can pollute the profit. Check the ledger for class 6/7 accounts.",
    ],
    tips: [
      "<em>\"morning brief\"</em> to the Telegram bot → condensed mobile summary.",
      "Enable Telegram alerts (Bot Permissions) so you never miss a deadline.",
      "Practice: use the practice dashboard to see all clients in one view (Practice → Dashboard).",
    ],
  },

  // ========================================================================
  // CUSTOMER INVOICES
  // ========================================================================
  '/comptable/factures-clients': {
    title: 'Customer invoices — Issue and follow-up',
    audience: 'comptable',
    intro:
      "List of all invoices issued to customers. You create, validate, email, track payments and trigger automatic reminders. Every issued invoice generates accounting entries (411 Customer / 707 Sale / 4457 VAT collected), feeds turnover and the month's VAT calculation.",
    steps: [
      { title: "1. Create an invoice", body: "<b>New invoice</b>. Pick the customer (or create on the fly with BRN, email, address). Add lines (services catalogue or free). Lexora applies 15% VAT (or 0% export, or exempt) + gross automatically." },
      { title: "2. Check the terms", body: "Issue date, due date (default 30 days net), payment terms, currency (MUR / USD / EUR with MRA daily rate for accounting conversion)." },
      { title: "3. Issue the invoice", body: "Transition <em>draft → pending</em>. PDF generated, automatic number (company prefix + YYYY-NNNNN), accounting entries posted, immutable.", warning: "After issue, no editing — only cancellation via credit note." },
      { title: "4. Email", body: "<b>Send</b> button → email with attached PDF to customer contact. Tracked in history." },
      { title: "5. Track payments", body: "When the customer pays, register the payment (amount, date, method, bank reference). Lexora updates the balance and closes if fully paid. If bank scraping is active, automatic letterage." },
      { title: "6. Automatic reminders", body: "If unpaid at due date, reminders T+7, T+15, T+30 per company settings. You can disable for a given customer." },
      { title: "7. Credit notes", body: "Total or partial cancellation → <b>Create credit note</b> button. Distinct number, reversed entries." },
    ],
    pitfalls: [
      "Unissued draft: NOT counted in VAT collected or turnover. Issue before the VAT return.",
      "Issuing without contact email: cannot send automatically.",
      "Missing customer BRN if cumulative > MUR 100,000/year: Schedule A rejected by MRA.",
      "Wrong VAT rate (15% instead of 0% export): VAT collected understated, MRA review.",
      "Issue date before the last issued invoice: broken chronological numbering.",
    ],
    tips: [
      "Create via Telegram: <em>\"invoice acme 50000 mur consulting september\"</em> → draft prepared.",
      "Subscriptions / rent: use <b>Recurrences</b> (auto-generation each month).",
      "Practice: you can issue while in client mode (Acting as).",
      "Multinationals: intra-group invoices with dedicated template + Transfer Pricing flag (see GBC).",
    ],
  },

  // ========================================================================
  // SUPPLIER INVOICES
  // ========================================================================
  '/comptable/fournisseurs': {
    title: 'Supplier invoices — Capture and payment',
    audience: 'comptable',
    intro:
      "Capture and follow-up of received invoices. Key difference vs customer invoices: here you DEDUCT VAT and PAY the supplier. Deductible VAT feeds the VAT3, expenses (class 6) feed the income statement, payment credits your bank. You can capture manually, import by OCR or Telegram photo.",
    steps: [
      { title: "1. Capture or import", body: "<b>New supplier invoice</b> for manual entry. Otherwise drop the PDF in Documents → Claude OCR extracts supplier, amount, VAT, date. One-click validation." },
      { title: "2. Map to ledger accounts", body: "Lexora suggests an expense account (class 6) based on description: 60x goods purchases, 61x external services, 62x other services (transport, comm, banking), 63x taxes, 64x personnel charges, 65x other, 66x finance." },
      { title: "3. Identify deductible VAT", body: "Recoverable only if supplier is VAT-registered in Mauritius and invoice compliant (compulsory mentions: VATRN, rate, amount). No recovery on blocked expenses (passenger car fuel, executive entertainment, etc.)." },
      { title: "4. Reverse charge on imported services", body: "If supplier is non-resident (AWS, Google, foreign consultant): tick <b>Reverse charge</b>. Lexora self-liquidates 15% (collected + deductible) — neutral except for partially exempt activity." },
      { title: "5. TDS where applicable", body: "Lexora flags if TDS due (resident professional services 5%, non-resident 10%, rent 5%, etc.). Withhold from the net payment (see TDS help)." },
      { title: "6. Record the payment", body: "When paid, mark <b>paid</b>: date, method (transfer, cheque, card), reference. Automatic bank entry." },
    ],
    pitfalls: [
      "Capturing without VAT when there is some: you lose 15% deductible VAT.",
      "Wrong expense account: income statement distorted (e.g. rent in 6068 instead of 613).",
      "Forgetting reverse charge on a foreign supplier: MRA recomputes + penalty.",
      "Forgetting TDS on an eligible payment: 5% penalty + interest.",
      "Duplicate: importing the same invoice twice (PDF + email): double posting. The bot flags likely duplicates.",
    ],
    tips: [
      "Photo of receipt / invoice to the Telegram bot → OCR + entry in seconds.",
      "The bot can also list supplier invoices due this week: <em>\"supplier payments due\"</em>.",
      "For groups: generate a consolidated export of intra-group supplier invoices for reconciliation.",
      "Enable <b>automatic matching</b>: Lexora pairs PO → GRN → invoice (3-way match).",
    ],
  },

  // ========================================================================
  // BANKING
  // ========================================================================
  '/comptable/banque': {
    title: 'Bank statements — Import and follow-up',
    audience: 'comptable',
    intro:
      "View and import bank statements per account. Imported transactions feed automatic reconciliation and give a real-time cash view. Without up-to-date statements, no reconciliation and no reliable steering.",
    steps: [
      { title: "1. Import a statement", body: "Drop the bank PDF or CSV (downloaded from Internet Banking) into Documents. OCR extracts transactions and updates the account." },
      { title: "2. Enable scraping (recommended)", body: "Management → Bank Access: configured once, Lexora fetches every night. No more manual import." },
      { title: "3. Check transactions", body: "Table of account transactions. Filter by period, amount, description. Click a transaction to see details / link to an invoice." },
      { title: "4. Run reconciliation", body: "Once transactions imported, go to <b>Reconciliation</b>. Lexora proposes automatic matches (rules R1-R7) you confirm in one click." },
      { title: "5. Control balance", body: "Scraped balance compared to Lexora balance. Gap > 5% → Telegram alert + investigation required (missed transaction, unbooked operation)." },
    ],
    pitfalls: [
      "Importing the same statement twice: duplicates. Check overlap dates before import.",
      "No scraping or regular import: impossible to reconcile properly, stale cash view.",
      "Wrong account associated with the import: transactions in the wrong bank journal. Fix via bulk reassignment.",
    ],
    externalLinks: [
      { label: "MCB Internet Banking", url: "https://ibank.mcb.mu" },
      { label: "SBM Internet Banking", url: "https://internetbanking.sbmgroup.mu" },
    ],
    tips: [
      "Configure scraping to remove 100% of bank data entry.",
      "For multi-bank groups: consolidated cash dashboard (Tools → Group cash).",
    ],
  },

  // ========================================================================
  // BANK RECONCILIATION
  // ========================================================================
  '/comptable/rapprochement': {
    title: 'Bank reconciliation — Concept and automation',
    audience: 'comptable',
    intro:
      "Bank reconciliation is the process of <b>matching each statement line with an accounting entry</b>. One of the pillars of accounting: without reconciliation, your Lexora bank balance drifts and you no longer know what you really received/paid. <b>Letterage</b> is the action of marking an invoice as <em>paid</em> by matching it with a bank transaction. Lexora automates via 7 deterministic rules (R1-R7) + machine learning on descriptions.",
    steps: [
      { title: "1. Understand why", body: "Secures the bank balance (truth = what the bank says), detects errors/omissions (invoice issued but never received), prevents fraud (unauthorised payment), prepares the balance sheet (account 512 must reflect reality)." },
      { title: "2. Prerequisite: up-to-date statements", body: "Reconciliation is only possible if bank transactions are imported (nightly scraping or CSV/PDF import). Check the <b>Banking</b> page." },
      { title: "3. Run automatic reconciliation", body: "<b>Run reconciliation</b> button. Lexora applies: <b>R1</b> exact amount + invoice reference. <b>R2</b> exact amount + customer/supplier name in description. <b>R3</b> amount + date ± 3 days. <b>R4</b> multi-invoice transfer (exact sum). <b>R5</b> salaries (SALARY description + amount). <b>R6</b> bank charges (typical description). <b>R7</b> interest." },
      { title: "4. Validate suggestions", body: "Table of proposed matches with confidence score. Score > 95%: one-click validation. Score 70-95%: verify. Score < 70%: Lexora does not propose, handle manually." },
      { title: "5. Handle unreconciled", body: "Standalone transactions → 3 options: (a) link manually to an invoice, (b) create a free entry (bank charges, internal transfer, interest), (c) park if no info." },
      { title: "6. Link with PCM", body: "Letterage updates <b>411 Customers</b> (out when customer pays) or <b>401 Suppliers</b> (out when you pay) and <b>512 Bank</b>. Everything tracked in the ledger." },
      { title: "7. Lock the month", body: "When everything is lettered, lock the period. No more edits without explicit unlock (Management right). Reliable balance sheet at that date." },
      { title: "8. Reconciliation statement", body: "<b>Reconciliation statement</b> button → official document for the auditor: accounting balance + outstanding transactions = bank balance." },
    ],
    pitfalls: [
      "Letterage of the wrong invoice in haste: the real one stays unpaid in Lexora. Unlink and correct.",
      "Forgetting to record a transfer between internal accounts: both accounts wrong. Always create the mirror 580 Internal transfers entry.",
      "Bank charges not posted: Lexora balance higher than bank. Pass a 627 Bank services entry.",
      "Period not locked: post-edits desync the balance sheet.",
      "Disabling auto rules out of distrust: you spend 10x longer. Trust the engine, sample-check.",
    ],
    tips: [
      "Salaries are auto-lettered after payroll lock (matching journal SAL ↔ statement).",
      "Add your own rules: Tools → Letterage rules (e.g. <em>any line containing 'CEB' → account 627 Electricity</em>).",
      "Groups: intercompany reconciliation via <b>Cross-letterage</b> (offsets intra-group balances).",
      "Multinationals: reconciliation rules per transfer type (SWIFT, SEPA, ACH) with automatic deductible fees.",
    ],
  },

  // ========================================================================
  // JOURNAL ENTRIES
  // ========================================================================
  '/client/ecritures': {
    title: 'Journal entries — Full ledger',
    audience: 'comptable',
    intro:
      "An <b>accounting entry</b> records an economic transaction with a <b>debit</b> and a <b>credit</b> of equal total (double-entry rule). Each entry is classified by <b>journal code</b>: <b>VTE</b> sales, <b>ACH</b> purchases, <b>BNQ</b> bank, <b>CAI</b> cash, <b>SAL</b> payroll, <b>OD</b> miscellaneous. Lexora generates 95% of entries automatically (invoices, payroll, bank) — you only enter manually OD (adjustments, provisions, depreciation).",
    steps: [
      { title: "1. Understand double-entry", body: "Every transaction has two sides. Example: sales 100 MUR → debit 411 Customer 100, credit 707 Sale 87, credit 4457 VAT 13. Total debit (100) = total credit (100). Without balance, Lexora refuses." },
      { title: "2. Journal codes", body: "<b>VTE</b> = customer invoices (auto). <b>ACH</b> = supplier invoices (auto). <b>BNQ</b> = bank + transfers (auto via reconciliation). <b>CAI</b> = cash. <b>SAL</b> = payroll (auto on lock). <b>OD</b> = manual: adjustments, provisions, depreciation, opening balances." },
      { title: "3. Filter by journal and period", body: "Top selectors. Search by entry number, description, amount, account. CSV/PDF export possible." },
      { title: "4. Enter a manual OD", body: "<b>New entry</b>. OD journal, date, clear description. Add debit/credit lines (1 or more accounts). Total debit must equal total credit or validation is blocked." },
      { title: "5. Typical OD cases", body: "Leave provision (auto via Provisions), depreciation of fixed assets (auto via Fixed assets), FNP/CCA adjustments (accruals, prepayments), opening balances of the financial year." },
      { title: "6. Drill-down to the document", body: "Click an auto entry → you access the source document (invoice PDF, payslip, bank transaction). Full audit trail." },
      { title: "7. Auditor export", body: "<b>Export</b> button → CSV in <b>FEC</b> format (Standard Audit File), PDF summary, IFRS format for international groups." },
      { title: "8. Monthly lock", body: "A locked period (closing) prevents edits. To fix an error, post a reversal OD in the open period." },
    ],
    pitfalls: [
      "Unbalanced entry: Lexora blocks. Protective, do not circumvent.",
      "Wrong account (e.g. 411 instead of 401): distorted balance sheet. Check the account label before validation.",
      "Date outside the period: entry refused if the period is locked. Choose a date within the open month.",
      "OD on a third-party account without supporting document: audit risk. Always attach.",
      "Editing an auto entry (invoice): recommendation is to post an OD instead of editing the issued invoice.",
    ],
    tips: [
      "Depreciation: Lexora computes monthly from the Fixed Assets module.",
      "IFRS provisions (IAS 19 leave, IAS 37 risks, IAS 36 impairment): dedicated modules generate the OD.",
      "Multinationals: multi-GAAP export (Mauritian PCM, IFRS, US GAAP) per configuration.",
      "Powerful search: <em>account:6411 amount:&gt;100000 date:2026-05*</em> in the search bar.",
    ],
  },

  // ========================================================================
  // TRIAL BALANCE
  // ========================================================================
  '/comptable/clients/[clientId]/[societeId]/balance': {
    title: 'Trial balance — Control before closing',
    audience: 'comptable',
    intro:
      "The trial balance lists all accounts in the Mauritian Chart of Accounts (PCM) with their balance at a given date. The accountant's universal control tool: before each monthly or annual close, check the trial balance for anomalies, unsettled suspense accounts, classification errors. If the balance is in equilibrium (Σ debit = Σ credit), accounting is consistent.",
    steps: [
      { title: "1. Pick the date", body: "Cumulative balance at month/quarter/year end. Lexora consolidates all entries up to this date." },
      { title: "2. Check equilibrium", body: "<b>Total debit = Total credit</b>. If a gap: an entry has been edited outside the process. Investigate immediately via the journal." },
      { title: "3. Analyse by PCM class", body: "Classes 1 (equity), 2 (fixed assets), 3 (inventory), 4 (third parties), 5 (cash), 6 (expenses), 7 (income). Check consistency: 6 vs 7 = profit. 1+2+3+4+5 = balance sheet." },
      { title: "4. Drill-down on a balance", body: "Click an abnormal balance (47x suspense not cleared, customer receivable > 90 days) → details of the entries composing it." },
      { title: "5. Suspense accounts to clear", body: "47x (suspense, pending) must be zero at closing. 4711 Internal transfers: to clear. 4716 Errors: to investigate." },
      { title: "6. Auditor export", body: "Formatted PDF or CSV FEC format. Sign-off stamp by accounting manager." },
    ],
    pitfalls: [
      "Non-zero suspense (47x): pending entry, clear before closing.",
      "411 Customer in credit (instead of debit): unrefunded overpayment. Resolve.",
      "401 Supplier in debit: unrecovered advance. Resolve.",
      "Class 6 or 7 account still active after annual close: forgotten balance roll-over.",
    ],
    tips: [
      "Year N vs N-1 comparison on same date: Tools → Comparative balance.",
      "Groups: consolidated balance multi-companies with intra-group elimination (Tools → Consolidation).",
    ],
  },

  // ========================================================================
  // CHART OF ACCOUNTS
  // ========================================================================
  '/client/plan-comptable': {
    title: 'Mauritian Chart of Accounts (PCM)',
    audience: 'comptable',
    intro:
      "The <b>Mauritian Chart of Accounts (PCM)</b> is the standardised hierarchical account structure every Mauritian company must use. Lexora ships with a standard PCM inspired by adapted SYSCOHADA + IFRS, which you can enrich with sub-accounts. Structure in <b>7 classes</b>: 1 equity, 2 fixed assets, 3 inventory, 4 third parties, 5 cash, 6 expenses, 7 income. The longer the number, the more specific the account.",
    steps: [
      { title: "1. Understand the 7 classes", body: "<b>1</b> = equity + long-term debt (share capital 101, profit 12, financial debt 16). <b>2</b> = fixed assets (intangible 20, tangible 21, financial 26). <b>3</b> = inventory (raw materials 31, goods 37). <b>4</b> = third parties (customers 411, suppliers 401, State 44, staff 42). <b>5</b> = cash (bank 512, cash 53). <b>6</b> = expenses (60 purchases, 61 external services, 62 other services, 63 taxes, 64 staff, 65 other, 66 finance, 67 exceptional, 68 depreciation). <b>7</b> = income (70 sales, 75 other, 76 finance, 77 exceptional)." },
      { title: "2. Search an account", body: "Search by number or label. Used accounts show a padlock (cannot delete while entries reference them)." },
      { title: "3. Create a sub-account", body: "<b>New account</b>. Number = parent + 1 to 3 digits (e.g. 6061 = sub-account of 606 Purchases). Clear label, IFRS classification, reporting classification." },
      { title: "4. Analytics (cost centres)", body: "For project/branch tracking, enable analytics (Settings → Accounting). Every entry line can be tagged with a cost centre (e.g. Mauritius, Réunion, Madagascar)." },
      { title: "5. Link with the ledger", body: "Each account is available in <b>Ledger</b> with all its entries and running balance. The basis for trial balance and balance sheet." },
      { title: "6. IFRS mapping for groups", body: "If reporting in IFRS (full or SMEs), Lexora generates automatic PCM → IFRS mapping (e.g. 21x → PP&E IAS 16, 16x → Borrowings IFRS 9)." },
    ],
    pitfalls: [
      "Editing a used account: all entries inherit the new label. OK for label, NEVER for number.",
      "Creating too many useless sub-accounts: unreadable ledger. Stick to useful analytical distinctions.",
      "Deleting an account referenced by a recurring import (bank statement): future breakage. Archive instead.",
    ],
    tips: [
      "Lexora standard PCM covers 90% of SME needs. Add only when necessary.",
      "For GBC: USD sub-accounts (512100) in parallel to MUR (512000).",
      "Multinationals: multi-GAAP active (PCM + IFRS + other country GAAP) with automatic mapping.",
    ],
  },

  // ========================================================================
  // CONTACTS (third parties)
  // ========================================================================
  '/client/contacts': {
    title: 'Third parties — Customers and suppliers',
    audience: 'comptable',
    intro:
      "Centralised directory of customers and suppliers: name, MRA BRN, email, phone, address, payment terms, IBAN. Used everywhere in Lexora (invoices, reminders, transfers, reconciliation). A well-populated third party = fast invoicing + zero MRA errors + effective automatic reminders.",
    steps: [
      { title: "1. Create a third party", body: "<b>New</b>. Type: Customer / Supplier / Both. Trading name, legal name, MRA BRN (9 digits), MRA TAN if applicable, VATRN if supplier is registered." },
      { title: "2. Contact details", body: "Email (compulsory for invoice send), phone, full address, country (resident vs non-resident impacts VAT + TDS)." },
      { title: "3. Commercial terms", body: "Default payment delay (30, 60, 90 days), method (transfer, cheque), IBAN, usual currency, optional discount rate." },
      { title: "4. Link to invoices", body: "When creating an invoice, the third party is selected, its details auto-fill the PDF. You can always override on the fly." },
      { title: "5. Third-party history", body: "<b>History</b> tab: all invoices issued/received, payments, outstanding, average DSO. Useful for risk assessment." },
      { title: "6. Credit assessment (IFRS 9)", body: "For large customers, Lexora computes a PD (probability of default) and proposes an IFRS 9 ECL provision. See IFRS 9 help." },
    ],
    pitfalls: [
      "Missing or incorrect BRN: if customer turnover > MUR 100,000/year, Schedule A rejected by MRA.",
      "Missing email: invoice / reminder send impossible.",
      "Missing country for supplier: reverse charge and TDS not flagged correctly.",
      "Duplicates: <em>Acme Ltd</em> and <em>ACME LTD</em> created separately: scattered outstanding. Enable deduplication.",
    ],
    tips: [
      "Bulk CSV import from your previous tool — BRN column compulsory for MRA matching.",
      "For groups: tag intercompany on internal third parties to ease consolidation and elimination.",
      "Multinationals: KYC documents attached (CDD, PEP/sanctions screening) — built-in AML module.",
    ],
  },

  // ========================================================================
  // HR — DASHBOARD
  // ========================================================================
  '/rh': {
    title: 'HR dashboard',
    audience: 'all',
    intro:
      "Overview of human resources: active headcount, pending leave requests, alerts (CDD contracts ending, maternity returns, length of service), upcoming payrolls, payroll cost. Steer the HR function each morning or delegate to your Telegram bot which sends you a recap.",
    steps: [
      { title: "1. Active headcount", body: "Total employees by contract (CDI, CDD, seasonal, intern). Click for detailed list. Monthly evolution visualised." },
      { title: "2. Pending requests", body: "Leave to approve (by manager or management). Approve/refuse in one click here or via Telegram." },
      { title: "3. HR alerts", body: "CDDs ending < 30 days (renew or close), upcoming maternity returns, employees approaching 5 years (WRA Vacation Leave entitlement), joining anniversaries." },
      { title: "4. Payroll cost", body: "Total monthly employer cost (gross + employer charges NSF + CSG + PRGF). Year-on-year comparison." },
      { title: "5. HR KPIs", body: "Turnover, absenteeism, payroll/turnover ratio, average OT rate. Key indicators for CFO or HR Director." },
    ],
    tips: [
      "Telegram bot sends proactive notification at 09:00 daily: new requests, late employees, etc.",
      "For groups: HR KPIs per entity + group consolidated.",
      "Multinationals: HR reporting per country with local legal rules (Mauritius WRA, France code du travail, etc.).",
    ],
  },

  // ========================================================================
  // HR — EMPLOYEES
  // ========================================================================
  '/rh/employes': {
    title: 'Employees — HR file',
    audience: 'all',
    intro:
      "Source of truth for payroll and the HR file. Create, edit, archive an employee. Data directly affects payroll (PAYE, NSF, CSG, PRGF), WRA calculations (leave, severance, EOY bonus) and salary transfers.",
    steps: [
      { title: "1. Create an employee", body: "<b>New</b>. First name, last name, position, department, joining date (key for seniority), basic salary, currency (MUR by default). Employee code auto-generated." },
      { title: "2. Identity and legal", body: "<b>NID</b> Mauritius (14 digits), passport, NIC, nationality, status (resident/expat with WAP). For expats: work permit attached." },
      { title: "3. Email + phone", body: "Email compulsory (payslip by email + Telegram bot link). Phone for urgent notifications and OTP." },
      { title: "4. Bank details", body: "Mauritius IBAN (26 characters MU + digits), bank, branch code. Without IBAN → <em>NO_BANK</em> file at salary transfer (manual)." },
      { title: "5. CSG category", body: "<b>A</b> = salary ≤ MUR 50,000/month (rate 1.5% employee + 3% employer). <b>B</b> = > 50,000 (rate 3% employee + 6% employer). Correct category = accurate payroll." },
      { title: "6. Contract", body: "<b>Contracts</b> tab: type (CDI, CDD, seasonal, intern), start/end date, basic salary, fixed contractual allowances, clauses (non-compete, confidentiality)." },
      { title: "7. Activation", body: "Once complete, the employee enters payroll computation and can receive a Telegram code via Bot Permissions." },
      { title: "8. Archive on departure", body: "Enter departure date in the file. Lexora excludes from payroll starting the following month and triggers end-of-contract calculations (see /rh/depart)." },
    ],
    pitfalls: [
      "Departure date entered by mistake: employee removed from payroll. Double-check.",
      "Incomplete IBAN: NO_BANK file, manual transfer.",
      "Wrong CSG category: all deductions wrong (employee and MRA).",
      "Incorrect Mauritius NID (wrong 14 digits): MRA return rejected.",
      "Duplicate employee (same NID twice): PAYE calculations distorted. Enable deduplication.",
    ],
    tips: [
      "Bulk CSV import from your previous HR tool (template provided).",
      "Profile photo useful for payslips and org chart.",
      "For groups: employee transfer between companies via <b>Internal mobility</b> without break of seniority.",
      "Multinationals: country-specific fields (FR social security number, US SSN, etc.).",
    ],
  },

  // ========================================================================
  // HR — LEAVE
  // ========================================================================
  '/rh/conges': {
    title: 'Leave — Requests, approval, balances',
    audience: 'all',
    intro:
      "Manage leave requests per <b>Workers Rights Act 2019</b>: <b>AL</b> Annual Leave (22 days/year), <b>SL</b> Sick Leave (15 days/year with certificate + 6 without), <b>VL</b> Vacation Leave (30 days after 5 years), <b>FML</b> Family Leave, <b>ML</b> Maternity (14 weeks), <b>PL</b> Paternity (5 days). Workflow request → manager/management approval → balance decrement → IAS 19 provision.",
    steps: [
      { title: "1. Employee submits request", body: "<b>Request leave</b>. Type, start/end dates, reason. Lexora computes working days (excluding weekends + Mauritian public holidays) and checks the balance." },
      { title: "2. Manager notification", body: "Telegram push + appears in <em>Pending</em>. <em>Approve</em>/<em>Refuse</em> buttons directly, with reason field if refused." },
      { title: "3. Balance update", body: "If approved: days removed from balance. If refused: decision communicated with reason." },
      { title: "4. Monthly accrual", body: "AL accrues at 1.83 days/month (22/12). SL at 1.25 days/month. Lexora calculates each month-end." },
      { title: "5. Year carry-overs", body: "Per WRA: untaken AL carry over 6 months (then forfeited unless employer agreement). Lexora alerts on 31 Dec." },
      { title: "6. IAS 19 provision", body: "For IFRS groups: Lexora computes monthly the provision for accrued unused leave (see /rh/provisions/conges)." },
      { title: "7. Team calendar", body: "Calendar view: who is off when, potential conflicts (two team leads same week), minimum coverage." },
    ],
    pitfalls: [
      "Request beyond available balance: auto refusal unless you allow negative balance for that employee.",
      "Sickness > 6 days without medical certificate: certificate-based SL (15 days) does not unlock.",
      "Forgetting to approve a request: blocks the employee who cannot plan.",
      "Manually changing the balance without supporting evidence: audit issue. Always validate through the module.",
    ],
    externalLinks: [
      { label: "Workers Rights Act 2019 — Text", url: "https://labour.govmu.org/Documents/Legislations/WRA2019.pdf" },
      { label: "Ministry of Labour Mauritius", url: "https://labour.govmu.org" },
    ],
    tips: [
      "Employee can request leave via Telegram: <em>\"I'm taking 3 days off 15-17 May\"</em>.",
      "Manager approves from Telegram with a button.",
      "Practices: client → approval by practice accounting team if delegation set up.",
    ],
  },

  // ========================================================================
  // HR — CLOCKING
  // ========================================================================
  '/rh/pointage': {
    title: 'Clocking — Hours and presence',
    audience: 'all',
    intro:
      "Tracking of arrival and departure times to: (1) compute WRA-eligible overtime, (2) detect unjustified absences, (3) justify salaries to auditors. Manual clocking, badge reader, or Telegram (ideal for remote work).",
    steps: [
      { title: "1. Manual entry (occasional)", body: "<b>New clocking</b>. Employee, date, entry and exit times. Useful for retrospective corrections." },
      { title: "2. Telegram clocking (recommended)", body: "Each employee linked to the bot types <b>/in</b> (arrival) and <b>/out</b> (departure), or natural language <em>\"I'm starting\"</em> / <em>\"I'm finishing\"</em>. Optional geolocation." },
      { title: "3. Badge reader clocking (optional)", body: "If you have a physical reader with API, integration possible. Ask support." },
      { title: "4. No-show detection", body: "If planned and no clock-in, bot alerts manager + employee after 10 min." },
      { title: "5. Hours worked calculation", body: "Monthly total per employee, compared to schedule. Positive gap > 10h = eligible overtime." },
      { title: "6. Link with payroll", body: "Detected overtime flows to <b>HR → Payroll → OT</b> for manager approval then payslip integration." },
    ],
    pitfalls: [
      "Forgetting to clock out: working time overstated. Bot sends reminder at 7pm if no /out.",
      "Bulk manual clocking the following month: audit suspicion. Prefer real-time.",
      "Without a defined schedule, no-show detection impossible. Configure schedules in /rh/planning.",
    ],
    tips: [
      "Remote work: Telegram is enough, no physical reader needed.",
      "Automatic monthly absenteeism report at month-end.",
      "Multinationals: multi-timezone clocking supported (Singapore, Paris, Mauritius simultaneously).",
    ],
  },

  // ========================================================================
  // HR — SCHEDULING
  // ========================================================================
  '/rh/planning': {
    title: 'Scheduling — Shifts and hours',
    audience: 'all',
    intro:
      "Weekly team schedules (shifts, hours, breaks). Used for: no-show detection, overtime calculation, minimum service coverage, public holiday compensation entitlement. Essential for rotation-based sectors (hospitality, retail, manufacturing).",
    steps: [
      { title: "1. Create a shift template", body: "<b>Templates</b> tab: e.g. <em>Office 9am-6pm</em>, <em>Evening 2pm-10pm</em>. Start/end times, active days, breaks (1h lunch unpaid standard)." },
      { title: "2. Assign an employee", body: "Drag-and-drop on a day. You can plan one week or one month ahead." },
      { title: "3. Check coverage", body: "Coverage table per day/hour: minimum team respected? Leave conflicts? Lexora flags gaps." },
      { title: "4. Publish", body: "Once validated, <b>Publish</b>. Employees see their schedule (Lexora + email + Telegram). Bot monitors clockings against those hours." },
      { title: "5. Modifications", body: "Edit a published schedule → automatic notification to affected employee via Telegram/email. Logs kept." },
    ],
    pitfalls: [
      "Editing a published schedule without notice: dispute. Auto notification helps but also tell verbally for urgent changes.",
      "Forgetting public holidays: schedule overlaps a holiday, double premium WRA s.20.",
      "No break included: actual working time > legal 8h, possible reassessment.",
    ],
    tips: [
      "Import existing schedules from Excel (template provided).",
      "Multinationals: multi-country scheduling with local rules (35h FR, 40h US, 45h Mauritius).",
    ],
  },

  // ========================================================================
  // HR — BONUSES
  // ========================================================================
  '/rh/paie/primes': {
    title: 'Bonuses — Add to payslip',
    audience: 'comptable',
    intro:
      "Add variable bonuses to the month's payslip: performance, seniority, exceptional, 13th month pro-rata. They add to gross and impact PAYE, NSF, CSG, PRGF. Lexora applies deductions automatically per the schedule.",
    steps: [
      { title: "1. Select employee + period", body: "Pick the employee and the month. The bonus will be integrated into the next payslip (as long as the period is not locked)." },
      { title: "2. Bonus type", body: "Individual performance, team performance, seniority, exceptional, 13th month pro-rata, meal voucher, transport allowance, gratuity. Configurable catalogue." },
      { title: "3. Amount in MUR", body: "Enter the gross amount. Lexora applies PAYE by bracket, NSF, CSG per schedule automatically." },
      { title: "4. Supporting document (recommended)", body: "Attach evidence (signed bonus letter, management decision) — useful for audit and tax inspection." },
      { title: "5. Payroll integration", body: "On monthly calculation, bonus added to gross. Visible on the payslip with a dedicated line." },
    ],
    tips: [
      "Via Telegram: <em>\"bonus 5000 mur for marie may\"</em> → bot saves it here automatically.",
      "For annual bonuses, schedule them in advance: Lexora pushes them to the right month.",
      "Multinationals: country-specific bonus schemes (US stock options, FR intéressement) supported.",
    ],
  },

  // ========================================================================
  // HR — OVERTIME
  // ========================================================================
  '/rh/paie/ot': {
    title: 'Overtime (OT)',
    audience: 'comptable',
    intro:
      "Capture of overtime per <b>WRA s.18</b>: <b>1.5x</b> for the first 10 hours per week beyond 45h, <b>2x</b> beyond or Sunday/public holiday. Lexora computes the premium automatically and integrates it into the payslip.",
    steps: [
      { title: "1. Pick employee + month", body: "Top selector. You see hours already captured for the month." },
      { title: "2. Add hours", body: "Date, number of hours, rate (1.5x or 2x), reason. Auto calculation = hours × hourly rate × multiplier." },
      { title: "3. Manager approval", body: "Direct manager approves the hours before payslip integration (configurable workflow)." },
      { title: "4. Payroll integration", body: "On monthly calculation, OT added to gross. Visible on payslip with daily breakdown." },
      { title: "5. OT cap", body: "WRA caps at 90h OT/month and 24h OT/week. Lexora alerts on excess." },
    ],
    externalLinks: [
      { label: "WRA 2019 — Section 18 OT", url: "https://labour.govmu.org/Documents/Legislations/WRA2019.pdf" },
    ],
    tips: [
      "Via Telegram: <em>\"Jean 8h OT 1.5x May\"</em> → bot captures automatically.",
      "Auto detection from clockings: if clocking > schedule, propose OT for approval.",
      "Manager can approve in bulk from Telegram: <em>\"approve team OT\"</em>.",
    ],
  },

  // ========================================================================
  // TAX — TDS
  // ========================================================================
  '/client/mra-tds': {
    title: 'TDS — Tax Deducted at Source (ITA Section 111A)',
    audience: 'comptable',
    intro:
      "<b>TDS</b> is a withholding tax on certain payments to suppliers (Income Tax Act 1995 Section 111A). The payer (you) withholds a % of the payment and remits it to MRA for the beneficiary's account. Rates: <b>5%</b> resident professional services, <b>10%</b> non-resident, <b>15%</b> non-resident interest, <b>5%</b> commercial rent, <b>3%</b> commission, <b>15%</b> non-resident royalties, <b>0.75%</b> contracts > MUR 300,000 (construction, services to the State). Monthly return before <b>20th of the following month</b>.",
    steps: [
      { title: "1. Understand who is concerned", body: "Payer = any company paying the natures listed in Section 111A. Beneficiary = resident or non-resident receiving such income. TDS is credited against the beneficiary's income tax (who receives a certificate)." },
      { title: "2. Lexora flags automatically", body: "On each supplier invoice, Lexora identifies: nature (professional services, rent, interest, royalties), resident/non-resident status, amount — and applies the appropriate TDS rate. You see a <em>TDS 5%</em> badge on the invoice." },
      { title: "3. Withhold at payment", body: "On payment: you pay the supplier the amount <em>net of TDS</em>, and keep the TDS for MRA. Accounting: Debit 401 Supplier (gross), Credit 4421 TDS payable (TDS), Credit 512 Bank (net)." },
      { title: "4. Issue the TDS certificate", body: "<b>TDS certificates</b> tab → one PDF per supplier per payment, showing nature, gross amount, TDS withheld, period. Email to the supplier." },
      { title: "5. Monthly return", body: "<b>File monthly TDS</b>. Lexora generates the employer CSV (name, BRN/TAN beneficiary, gross amount, TDS withheld). Check before export." },
      { title: "6. Submit on eservices.mra.mu", body: "Menu <b>TDS → Monthly Return</b>. Upload the CSV. Validate. Note the reference. Deadline <b>20th of the following month</b>." },
      { title: "7. Pay", body: "Transfer to MRA of total TDS withheld, with reference TAN + period. Mark as paid in Lexora." },
    ],
    pitfalls: [
      "Forgetting TDS on an eligible payment: <b>5% penalty + interest</b>. Verify each flagged invoice.",
      "Wrong rate (5% instead of 10% for non-resident): understatement, MRA reassessment.",
      "Paying gross without withholding: you must remit TDS out of your own pocket to MRA (pure loss).",
      "No certificate issued to supplier: dispute by supplier who cannot claim credit.",
      "Submission after the 20th: automatic 5% penalty.",
    ],
    externalLinks: [
      { label: "MRA Portal eServices (TDS)", url: "https://eservices.mra.mu" },
      { label: "Section 111A ITA — MRA Guide", url: "https://www.mra.mu/index.php/eservices/tax-deduction-at-source-tds" },
      { label: "Income Tax Act 1995", url: "https://www.mra.mu/download/ITAct.pdf" },
    ],
    tips: [
      "Enable <b>auto-flag</b> on supplier creation: Lexora pre-fills the expected TDS rate based on category.",
      "For groups: configurable intra-group exclusion (no TDS on internal billing).",
      "Multinationals: cross-country TDS matrix (Mauritius → France 0% via DTA, Mauritius → US 30%, etc.). Treaty Mapping module.",
      "The Telegram bot can submit TDS automatically: <em>\"submit May TDS\"</em>.",
    ],
  },

  // ========================================================================
  // TAX — CIT
  // ========================================================================
  '/client/mra-cit': {
    title: 'CIT — Corporate Income Tax + quarterly APS',
    audience: 'comptable',
    intro:
      "Mauritian corporate income tax (Income Tax Act 1995). Standard rate <b>15%</b>. For <b>GBC1</b> under <b>Partial Exemption</b>: 80% of certain eligible income is exempt (deemed deduction), effective rate = 3%. System: <b>APS</b> (Advance Payment System) quarterly = 25% of estimated annual tax, paid in year, then annual final return 6 months after year-end.",
    steps: [
      { title: "1. Understand the taxable base", body: "<b>Accounting profit</b> (income statement) → <b>tax adjustments</b>: non-deductible expenses (fines, unsupported, passenger car portion), non-taxable income, tax depreciation ≠ accounting, tax loss carry-forward → <b>taxable base</b>. Lexora computes automatically." },
      { title: "2. Estimate annual tax", body: "Estimated base × 15% (or 3% if GBC1 PER). Lexora proposes an estimate from realised + projection." },
      { title: "3. Quarterly APS", body: "<b>4 APS per year</b> = 25% × estimated annual tax. Deadlines: <b>3 months</b> after each quarter end. For July-June year: Q1 → 31 Dec, Q2 → 31 March, Q3 → 30 June, Q4 → 30 September (often merged with annual return)." },
      { title: "4. Submit APS on eservices.mra.mu", body: "Menu <b>CIT → APS</b>. Lexora generates the calculation. Upload on portal. Pay the amount." },
      { title: "5. Annual return", body: "<b>6 months after year-end</b>. Form <b>IT Form 4</b> with: signed audited financial statements if thresholds met, detailed tax profit calculation, APS table paid, balance due or refund. Lexora prepares everything." },
      { title: "6. Documents to attach", body: "Balance sheet + income statement + notes, audit report if applicable (turnover > MUR 50 M or debt/equity > 75%), book-to-tax reconciliation, APS schedule, capital allowances schedule (tax depreciation)." },
      { title: "7. GBC1 case — Partial Exemption", body: "80% of eligible income (intercompany interest, foreign dividends, aircraft leasing income, etc.) deemed exempt. Conditions: economic substance (CIGA — Core Income Generating Activities documented with qualified Mauritius employees + operating expenses + place of management)." },
      { title: "8. Pay the balance", body: "Annual return balance = final tax - APS paid. Negative: refund (~3 months delay). Positive: pay within 30 days of filing." },
    ],
    pitfalls: [
      "Under-estimating APS: penalty if annual balance > 25% above cumulative advances (Section 50).",
      "GBC1 without CIGA documentation: MRA refuses Partial Exemption, reassesses at 15%. Document rigorously (employee CVs, local invoices, board minutes).",
      "Forgetting non-deductible expenses in adjustments: base undervalued, reassessment + penalty.",
      "No audit when thresholds met: return rejected.",
      "Submission beyond 6 months post-close: 5% penalty + 1% per month interest.",
    ],
    externalLinks: [
      { label: "MRA Portal CIT", url: "https://eservices.mra.mu" },
      { label: "MRA CIT Guide", url: "https://www.mra.mu/index.php/eservices/income-tax-companies" },
      { label: "Income Tax Act 1995", url: "https://www.mra.mu/download/ITAct.pdf" },
      { label: "FSC — GBC1 Partial Exemption", url: "https://www.fscmauritius.org/media/55020/per-guidelines.pdf" },
    ],
    tips: [
      "Lexora projects annual tax continuously — you see the expected amount in real time.",
      "For groups: tax consolidation possible if parent + subs > 75% (group relief Section 32A).",
      "GBC1: dedicated CIGA module to document substance (see /client/gbc-dashboard).",
      "Pillar Two multinationals: built-in Top-Up Tax modules (see GBC).",
      "Telegram bot: <em>\"CIT update year N\"</em> → annual tax projection + APS due.",
    ],
  },

  // ========================================================================
  // CLIENT — PROFILE
  // ========================================================================
  '/client/profil': {
    title: 'My profile — Personal account',
    audience: 'client',
    intro:
      "Your Lexora personal information: name, email, password, language, notification preferences. Also where you link your account to Telegram to use the bot.",
    steps: [
      { title: "1. Update your info", body: "Full name, email, phone. Used for Lexora email signatures and notifications." },
      { title: "2. Change your password", body: "Dedicated button. Pick strong (min 12 chars, mix letters/digits/symbols)." },
      { title: "3. Enable 2FA", body: "Recommended. Lexora generates a QR to scan with Google Authenticator or Authy. Secures your access." },
      { title: "4. Connect Telegram", body: "Telegram section: <b>Generate code</b>, open Telegram, search <b>@LexoraAgent_bot</b>, type <b>/start CODE</b>. You can now drive Lexora from mobile." },
      { title: "5. Choose your language", body: "French (Mauritius) or English. Affects UI and bot replies." },
      { title: "6. Notification preferences", body: "Email vs Telegram push vs SMS. Granular per alert type (MRA deadlines, invoices, anomalies, payroll)." },
    ],
    tips: [
      "Enable 2FA — your Lexora access gives access to banking, payroll, tax. Secure it.",
      "If you change email: validate the new via emailed link, notifications switch automatically.",
    ],
  },

  // ========================================================================
  // TELEGRAM CONFIG (personal)
  // ========================================================================
  '/client/telegram-config': {
    title: 'Telegram configuration (personal)',
    audience: 'all',
    intro:
      "Link your Lexora account to <b>@LexoraAgent_bot</b> on Telegram. Once linked, you can drive Lexora from your phone: create invoices, validate payroll, file VAT, check cash. Different from Bot Permissions which manages other users' rights — here it is YOUR personal link.",
    steps: [
      { title: "1. Generate a code", body: "<b>Generate code</b>. 6-character code valid 15 min." },
      { title: "2. Open Telegram", body: "On your phone, search <b>@LexoraAgent_bot</b> or use the provided link." },
      { title: "3. Type /start CODE", body: "Start a conversation with the bot and send <b>/start ABCXYZ</b> (replace ABCXYZ with your code). Account linked." },
      { title: "4. Test", body: "Send <em>hello</em>. Bot should greet you by first name + tell you how it can help per your role." },
      { title: "5. Switch company", body: "If you manage several companies, the bot asks which to activate via <b>/society</b> or via menu." },
      { title: "6. Unlink (optional)", body: "Unlink any time: <b>/logout</b> in chat or <b>Disconnect</b> button here." },
    ],
    pitfalls: [
      "Expired code (> 15 min): regenerate.",
      "Telegram number change: /logout on the old phone then reconnect with a new code.",
      "Bot seems inactive after link: restart the conversation with /start (no code).",
    ],
    tips: [
      "If managing several companies, /society lets you switch in one command.",
      "Bot remembers your preferences (language, date format, default currency).",
      "You can mute notifications by schedule (e.g. no message before 8am, no message after 8pm) via <em>memory_set</em>.",
    ],
  },

  // ========================================================================
  // PRACTICE — DASHBOARD
  // ========================================================================
  '/comptable/cabinet': {
    title: 'Practice dashboard',
    audience: 'comptable',
    intro:
      "Aggregated view of all clients followed by the practice: monthly tasks per client (VAT, payroll, MRA, invoices), cumulative KPIs, critical alerts, collaborators in charge. Designed for practices managing 5 to 500 clients.",
    steps: [
      { title: "1. Overview", body: "Practice KPIs: client count, monthly tasks, % completion, late items, ongoing fees." },
      { title: "2. Filter by client", body: "Selector. Client tags (urgent, ongoing, on hold, VIP). Tag freely." },
      { title: "3. Work in progress", body: "Assigned task list: May VAT, June payroll, journal entries, invoices to issue, returns to validate. With deadline and status." },
      { title: "4. Acting as", body: "Button on a client → switch to client mode. You see Lexora as the company's director. Ideal for entry/check." },
      { title: "5. Client communication", body: "Received messages, pending requests, validations awaited from client. Centralised interactions." },
      { title: "6. Team performance", body: "Hours per collaborator, productivity, assigned clients." },
    ],
    tips: [
      "Assign collaborators per client (Practice → Team) — each sees own scope.",
      "Automated practice billing: Tools → Practice billing → convertible time-tracking into invoices.",
      "Multi-practice (network): consolidated reporting via Tools → Practice network.",
    ],
  },

  // ========================================================================
  // DOCUMENTS
  // ========================================================================
  '/client/documents': {
    title: 'Documents — File hub + OCR',
    audience: 'all',
    intro:
      "All documents (supplier invoices, bank statements, contracts, payslips, supporting docs) stored in Lexora. The <b>Claude Vision AI OCR</b> extracts information automatically and proposes the creation of matching invoices/entries. 10-year retention compliant with Mauritian tax requirements (Section 6 VAT Act + ITA).",
    steps: [
      { title: "1. Drop a document", body: "Drag-and-drop or <b>Import</b> button. Formats PDF, JPG, PNG, XLSX. Max <b>20 MB</b> per file. Multi-upload supported." },
      { title: "2. Automatic OCR", body: "Claude analyses: detected type (supplier invoice, bank statement, payslip, contract, receipt), supplier, amounts net/VAT/gross, date, BRN, suggested ledger account." },
      { title: "3. Validate creation", body: "If OCR correct: one click creates the supplier invoice or records the statement. Otherwise correct fields before validation." },
      { title: "4. Classification", body: "Documents sorted by type (Supplier invoice, Banking, HR, Legal, Other), period, company. Full-text search on OCR content." },
      { title: "5. Audit archive", body: "Every document is linked to its accounting entry (drill-down from ledger). Essential for audit." },
      { title: "6. Email forwarding", body: "Forward supplier invoices to <em>documents@your-tenant.lexora.finance</em> — Lexora ingests automatically. No more drag-and-drop." },
    ],
    pitfalls: [
      "Blurry photo / creased paper: less reliable OCR. Correct manually.",
      "'Error' status: click <b>Reanalyse</b> to retry.",
      "Duplicate: same PDF imported twice: bot flags likely duplicate based on hash + amount.",
      "Personal docs mixed with business: sort upstream.",
    ],
    tips: [
      "Photo of doc directly to Telegram bot → ingested and proposed for creation.",
      "Magic email forwarding: create a rule in your mailbox to redirect <em>contact-supplier@*</em> to Lexora.",
      "For groups: multi-tenant, each company has its own ingest address.",
      "Multinationals: multilingual OCR (FR, EN, ZH, JA, AR, etc.).",
    ],
  },

  // ========================================================================
  // FINANCIAL DASHBOARD
  // ========================================================================
  '/client/tableau-de-bord-financier': {
    title: 'Financial dashboard (director view)',
    audience: 'client',
    intro:
      "Overview of your company's financial health for the non-accountant director: cash, turnover, expenses, profit, in clear numbers. Computed in real time from invoices and entries. Different from the accounting dashboard: here no jargon, just business indicators.",
    steps: [
      { title: "1. Period", body: "Current month by default. Switch to compare (previous month, quarter, year)." },
      { title: "2. Cash", body: "Balance of all active bank accounts (scraped). 30-day projected cash (expected collections - upcoming payments)." },
      { title: "3. Turnover and expenses", body: "<b>Turnover</b> = customer invoices issued in the period (net). <b>Expenses</b> = supplier invoices received + salaries + social charges. <b>Profit</b> = turnover - expenses." },
      { title: "4. Gross margin", body: "(Turnover - cost of sales) / turnover. Profitability indicator of the core activity." },
      { title: "5. Drill-down", body: "Click a number → details: invoices composing turnover, cash transactions, expenses by category." },
      { title: "6. Month variation", body: "% change vs previous month. Sharp drop = red alert to investigate." },
    ],
    tips: [
      "<em>\"financial brief\"</em> to the Telegram bot → 5-second mobile summary.",
      "For official accounting balance sheet / income statement, go to Accounting → Balance sheet / Ledger.",
      "Groups: consolidated dashboard multi-companies with intra-group elimination (Tools → Consolidation).",
      "Multinationals: auto currency conversion at daily MRA rate for group view.",
    ],
  },

  // ========================================================================
  // FACTURES (client view)
  // ========================================================================
  '/client/factures': {
    title: 'My customer invoices (director view)',
    audience: 'client',
    intro:
      "Simplified view for the director: who has paid, who owes, how much you invoice monthly. Without accounting jargon (no 411 class here). If you are a practice accountant, prefer Accounting → Customer invoices for the accounting view.",
    steps: [
      { title: "1. Quick filter", body: "Status (pending / paid / overdue), by customer, by period. Free search across all fields." },
      { title: "2. Create an invoice", body: "<b>New invoice</b>. Pick the customer, add lines, VAT computed. Issue when ready." },
      { title: "3. Send to customer", body: "An issued invoice can be emailed with attached PDF. Lexora tracks sending (open, PDF click)." },
      { title: "4. Record payments", body: "When the customer pays, open the invoice → <b>Record payment</b>. If bank scraping is active, auto letterage without input." },
      { title: "5. Reminder", body: "If late, trigger manually or let the auto schedule (T+7/T+15/T+30)." },
    ],
    tips: [
      "Create via Telegram: <em>\"invoice ACME 50000 MUR consulting\"</em>.",
      "Recurring subscriptions → /client/recurrences.",
      "You can duplicate a similar invoice to save time.",
    ],
  },

  // ========================================================================
  // NEW INVOICE
  // ========================================================================
  '/client/nouvelle-facture': {
    title: 'New customer invoice',
    audience: 'client',
    intro:
      "Create a customer invoice. Lexora applies compliant numbering automatically (company prefix + YYYY-NNNNN), computes VAT per applicable rate (15% standard, 0% export, exempt), generates the PDF to Mauritian standards (compulsory mentions VAT Act s.20).",
    steps: [
      { title: "1. Pick the customer", body: "Select from list or create on the fly (name, BRN compulsory if > MUR 100k/year cumulative, email, address, payment terms)." },
      { title: "2. Add lines", body: "For each service: description, quantity, unit price, VAT rate (15% / 0% / exempt). Pick from services catalogue if defined." },
      { title: "3. Check totals", body: "Net total, VAT by rate, gross. If wrong, return to lines. Lexora blocks issue if total = 0." },
      { title: "4. Terms and notes", body: "Issue date (default today), due date (default +30 days), payment terms, internal notes (not visible to customer), footer notes (visible)." },
      { title: "5. Currency and exchange rate", body: "If invoice in USD/EUR/GBP, daily MRA rate applied (IAS 21). Auto conversion for MUR accounting." },
      { title: "6. Draft vs Issue", body: "<b>Draft</b> = editable, not booked, not VAT-counted. <b>Issue</b> = PDF generated, auto number, entries posted, immutable." },
    ],
    pitfalls: [
      "Issuing without contact email: cannot send automatically.",
      "Wrong VAT rate: wrong VAT return, MRA review.",
      "Missing customer BRN when annual cumulative > MUR 100k: Schedule A rejected.",
      "Issue date before the last issued invoice: broken numbering. Lexora alerts.",
      "Missing compulsory mentions (VATRN, address): invoice unenforceable. Lexora checks automatically.",
    ],
    tips: [
      "<b>Duplicate</b> from a similar existing invoice to go fast.",
      "Per-customer templates: Lexora memorises a customer's usual lines and prefills.",
      "Multi-currency for exporters and GBC: one-click currency switch.",
    ],
  },

  // ========================================================================
  // NEW INVOICE AI
  // ========================================================================
  '/client/nouvelle-facture-ia': {
    title: 'New AI invoice (natural language)',
    audience: 'client',
    intro:
      "Describe your invoice in natural language — Claude AI extracts customer, lines, amounts, VAT. Faster than the form for simple cases. Ideal mobile + busy directors.",
    steps: [
      { title: "1. Write in English (or French)", body: "Ex: <em>\"Invoice ACME Ltd, consulting September 2026, MUR 50,000 net + 15% VAT, 30 days\"</em>." },
      { title: "2. AI proposes a draft", body: "Lexora identifies the customer (searches your base), creates lines, computes VAT. Live PDF preview." },
      { title: "3. Adjust if needed", body: "Edit each line before validation. AI is quick but imperfect on complex cases (multi-currency, recharges, allocations)." },
      { title: "4. Issue", body: "Click <b>Issue</b>. Invoice moves to normal accounting." },
    ],
    pitfalls: [
      "Ambiguous customer (two with same name): AI asks for clarification.",
      "Description too vague: AI creates 1 generic line. Be precise.",
    ],
    tips: [
      "Same from Telegram with the bot (even faster).",
      "For large invoice batches, prefer CSV import or recurrences.",
    ],
  },

  // ========================================================================
  // RECURRENCES
  // ========================================================================
  '/client/recurrences': {
    title: 'Recurring invoices',
    audience: 'client',
    intro:
      "Configure invoices that generate automatically (rent, subscriptions, recurring contracts). Saves 100% of capture time for predictable income.",
    steps: [
      { title: "1. Create a template", body: "<b>New template</b>. Customer, lines, frequency (monthly, quarterly, annual), start date, issue day (e.g. 1st of month), optional end date." },
      { title: "2. Daily cron", body: "Every day at 06:00 UTC, Lexora checks due templates and clones an invoice as <em>pending</em>. You get a notification." },
      { title: "3. Pause / resume", body: "Suspend a template (customer on hold, temporary freeze) without deleting. One-click resume." },
      { title: "4. Future modifications", body: "Edit the template: only FUTURE invoices inherit. Already issued ones stay immutable." },
      { title: "5. Annual indexation", body: "Option: auto annual indexation (% or fixed amount). Useful for rent + subscriptions." },
    ],
    pitfalls: [
      "Editing the template does not touch already generated invoices. For those, issue a credit note.",
      "Forgotten suspended template: missing income for months. Review regularly.",
      "End date reached: template stops without alert. Reactivate if needed.",
    ],
    tips: [
      "Create via Telegram: <em>\"rent ACME 50000 MUR every month from 1 June\"</em>.",
      "Multi-recurrences possible: monthly rent + quarterly maintenance on same customer.",
      "Multinationals: multi-currency recurrences (USD rent with MUR conversion for accounting).",
    ],
  },

  // ========================================================================
  // REMINDERS
  // ========================================================================
  '/client/relances': {
    title: 'Invoice reminders',
    audience: 'client',
    intro:
      "Automatic follow-up of unpaid invoices. Lexora sends reminders by email per configurable cadence (T+7 friendly, T+15 firm, T+30 formal demand). You can suspend per customer, customise templates, exclude VIPs.",
    steps: [
      { title: "1. Configure cadence", body: "Invoicing settings. E.g. friendly T+7, firm T+15, formal demand T+30. Customise templates with variables {{customer_name}}, {{amount}}, {{invoice_date}}." },
      { title: "2. Daily cron sends", body: "Every day at 08:00 UTC, reminders emailed to late customers. You get a summary." },
      { title: "3. Suspend a reminder", body: "For a customer awaiting a promised payment, suspend then reactivate later. Avoids harassment." },
      { title: "4. History per invoice", body: "For each invoice, see all sent reminders (date, level, mode, open/click)." },
      { title: "5. Escalation", body: "Beyond T+30 unpaid, Lexora suggests moving to contentious (formal demand + bailiff)." },
    ],
    tips: [
      "Telegram bot alerts every morning if > 5 invoices overdue.",
      "Per-customer customisation: VIP → no auto reminder, handled manually.",
      "Multinationals: multilingual templates per customer language.",
    ],
  },

  // ========================================================================
  // BALANCE SHEET
  // ========================================================================
  '/client/bilan': {
    title: 'Balance sheet',
    audience: 'client',
    intro:
      "The balance sheet shows the <b>financial position at a given date</b>: what the company OWNS (assets) versus what it OWES (liabilities). A snapshot of net worth. Format compliant with <b>IFRS for SMEs</b> or <b>Full IFRS</b> (GBC), with current/non-current split.",
    steps: [
      { title: "1. Pick the date", body: "Month-end, quarter, year. Lexora consolidates all entries up to this date." },
      { title: "2. Read ASSETS", body: "What you own: fixed assets (land, buildings, equipment, software), inventory, customer receivables (invoices not yet collected), cash. Sorted by increasing liquidity." },
      { title: "3. Read LIABILITIES", body: "What you owe: equity (share capital + reserves + accumulated profit), financial debt (bank loans), supplier payables, tax liabilities (VAT + tax + PAYE payable), social liabilities (CSG, NSF)." },
      { title: "4. Check equilibrium", body: "Total ASSETS = Total LIABILITIES (always, the golden rule). If a gap, an entry is missing/erroneous — Lexora indicates which." },
      { title: "5. N vs N-1 comparison", body: "Column by column evolution. Equity variation = profit of the year. Cash variation = activity + investment + financing (linked to cash flow)." },
      { title: "6. Official PDF export", body: "IFRS-compliant format, to give to the banker (loan application), auditor, ROC (Annual Return), or administration." },
    ],
    pitfalls: [
      "Non-zero suspense account (47x): clear before official issue.",
      "Inventory not stock-taken: balance sheet distorted. Monthly physical inventory.",
      "Forgotten provisions (leave, warranty, litigation): balance sheet too favourable.",
      "Depreciation not posted: assets overvalued.",
    ],
    tips: [
      "For groups: consolidated balance sheet IFRS 10 with intra-group elimination (Tools → Consolidation).",
      "GBC: Full IFRS mandatory + functional currency (IAS 21).",
      "Multinationals: multi-GAAP balance sheet (Mauritian PCM + foreign local GAAP).",
    ],
  },

  // ========================================================================
  // LEDGER
  // ========================================================================
  '/client/grand-livre': {
    title: 'Ledger — Account-by-account detail',
    audience: 'client',
    intro:
      "The <b>ledger</b> is the detailed journal of EVERY accounting transaction account by account. For each account in the <b>Mauritian Chart of Accounts (PCM)</b>, it lists chronological movements with running balance. The #1 tool for: tracing a specific transaction, checking a balance, preparing the balance sheet, providing details to the auditor. Difference vs accounting journal: here we look at one account at a time; in the journal, all entries in chronological order.",
    steps: [
      { title: "1. Link with PCM", body: "The ledger is the detailed mirror of the PCM. Every PCM account (411 Customers, 401 Suppliers, 512 Bank, 6411 Salaries, 707 Sales, etc.) has its page in the ledger. Account balance = sum of movements since opening." },
      { title: "2. Pick an account", body: "List on the left organised by PCM class (1 to 7), or search by number/label. Used accounts in bold, unused in grey." },
      { title: "3. Filter the period", body: "Start date / end date. Lexora shows: <b>opening balance</b> (cumulative before start date), <b>movements</b> in the period, <b>closing balance</b>." },
      { title: "4. Read the details", body: "For each movement: date, source journal (VTE/ACH/BNQ/SAL/OD), entry number, description, debit, credit, running balance. One line = one half of an entry." },
      { title: "5. Drill-down to the document", body: "Click an entry → access the source document: customer invoice PDF, supplier invoice scan, payslip, bank statement. Full audit trail." },
      { title: "6. Automatic feed", body: "Lexora auto-feeds the ledger from: customer invoices (VTE), supplier invoices (ACH), bank statements + reconciliation (BNQ), locked payroll (SAL), manual OD." },
      { title: "7. Audit export", body: "Formatted PDF or CSV in <b>FEC</b> format (Standard Audit File — used by auditors and MRA on tax inspection)." },
      { title: "8. What each class is for", body: "Class 1-5 = balance sheet (equity, fixed assets, inventory, third parties, cash). Class 6-7 = income statement (expenses + income). The ledger materialises everything." },
    ],
    pitfalls: [
      "Abnormal balance on 411 (customer in credit) or 401 (supplier in debit): overpayment/advance to resolve.",
      "Non-zero balance on suspense 47x: pending entry, investigate before closing.",
      "Movement without supporting document: audit flag. Always attach.",
    ],
    tips: [
      "Powerful search in ledger: <em>account:6411 description:salary amount:&gt;100000</em>.",
      "Compare evolutions: Tools → Comparative ledger N vs N-1 on an account.",
      "For groups: group consolidated ledger (Tools → Consolidation).",
      "Multinationals: multi-currency ledger (USD account, MUR conversion at each movement).",
    ],
  },

  // ========================================================================
  // MRA HUB
  // ========================================================================
  '/client/mra-hub': {
    title: 'MRA Hub — Centre for all tax obligations',
    audience: 'all',
    intro:
      "Centralised view of all MRA + ROC + FSC returns: <b>VAT</b> (monthly/quarterly), <b>PAYE</b> + <b>CSG/NSF</b> + <b>PRGF</b> (monthly), <b>TDS</b> (monthly), <b>CIT</b> annual + quarterly <b>APS</b>, <b>ROC Annual Return</b>, <b>FSC GBC filing</b>, <b>SFT</b> AML/CFT. Deadlines and statuses in one view. Lexora prepares each return automatically, you validate, the robot submits or you upload manually.",
    steps: [
      { title: "1. Understand your obligations", body: "Per your company: <b>SME</b> = VAT + PAYE/CSG/NSF + CIT + ROC. <b>SME with assets</b> = + depreciation. <b>VAT-registered company</b> = mandatory VAT. <b>GBC1</b> = + FSC filing + CIGA substance + Transfer Pricing. <b>Multinational</b> = + Pillar Two GloBE + Country-by-Country reporting." },
      { title: "2. Deadline calendar", body: "List sorted by closest deadline. Colour codes: red < 3 days, orange < 7 days, green > 7 days. Filters by type." },
      { title: "3. Open a return", body: "You access the form/summary per type (VAT → VAT page, PAYE → Payroll page, CIT → CIT page). Data pre-computed by Lexora." },
      { title: "4. Validate and generate files", body: "Lexora produces CSV/XML compliant with MRA format. PDF summary for human validation." },
      { title: "5. Submit to MRA", body: "Two options: (a) <b>Manual</b>: upload files to eservices.mra.mu yourself. (b) <b>Automatic</b>: the Playwright robot submits on your behalf (see Management → MRA Access)." },
      { title: "6. Pay the balance", body: "Bank transfer to MRA via Internet Banking with reference TAN + period. Mark as <b>paid</b> in Lexora once done." },
      { title: "7. Archive", body: "MRA acknowledgements auto-archived in Documents → MRA. 10-year retention (Section 6 VAT Act + ITA requirement)." },
    ],
    pitfalls: [
      "Forgetting an obligation (typical: PRGF, TDS, SFT): automatic penalty.",
      "Submitting without paying: MRA records non-compliance until payment.",
      "Editing a return after filing: amendment procedure required (specific form).",
      "Repeated lateness: triggers MRA tax inspection.",
    ],
    externalLinks: [
      { label: "MRA — eServices portal", url: "https://eservices.mra.mu", description: "All MRA modules in one portal." },
      { label: "MRA — Tax calendar", url: "https://www.mra.mu/index.php/eservices/tax-calendar", description: "Official annual deadlines." },
      { label: "MRA — Tax forms", url: "https://www.mra.mu/index.php/forms-publications", description: "Official downloadable forms." },
      { label: "FSC Mauritius", url: "https://www.fscmauritius.org", description: "Regulator GBC / AC / IFE." },
      { label: "FIU Mauritius (SFT)", url: "https://www.fiumauritius.org", description: "Suspicious Transactions Reports." },
    ],
    tips: [
      "Enable Telegram T-7 / T-3 / T-1 reminders for each deadline.",
      "Playwright robot submits automatically if Management → MRA Access configured.",
      "For groups: consolidated obligations dashboard across all group companies (Tools → Group calendar).",
      "Multinationals: Pillar Two GloBE module for 15% Top-Up Tax if group turnover > €750M.",
    ],
  },

  // ========================================================================
  // ROC Annual Return
  // ========================================================================
  '/client/mra-roc': {
    title: 'ROC — Annual Return (Companies Act 2001)',
    audience: 'all',
    intro:
      "Every Mauritian-incorporated company must file an <b>Annual Return</b> with the <b>Registrar of Companies (ROC)</b> within <b>28 days of the Annual General Meeting</b> (AGM). Annual confirmation of legal existence: shareholders, directors, registered office, capital, financial statements. Fees ~MUR 2,000. Non-filing = penalties + risk of ex officio strike-off (Section 215).",
    steps: [
      { title: "1. Hold the annual AGM", body: "AGM within <b>15 months</b> after incorporation (first), then yearly. Minutes to draft with: accounts approval, director appointments/reappointments, dividends, auditor." },
      { title: "2. Prepare financial statements", body: "Balance sheet + income statement + notes. Audited if thresholds met (turnover > MUR 50 M or assets > MUR 50 M or > 50 employees). Lexora generates statements per IFRS for SMEs." },
      { title: "3. Shareholders list", body: "Form 1 (Members' Register): name, address, number of shares, % holding. Up to date at AGM date." },
      { title: "4. Directors list", body: "Identity, role, appointment date, residence. At least 1 Mauritius-resident director compulsory." },
      { title: "5. File on eROC", body: "Portal <b>onlinebrd.govmu.org</b>. Sign in with BRN + password. Menu <b>Annual Return</b>. Fill in or upload form. Attach financial statements PDF." },
      { title: "6. Pay", body: "~MUR 2,000 (varies by company type). Credit card or transfer. Receipt generated." },
      { title: "7. 10-year retention", body: "You receive official confirmation. Archive in Lexora (Documents → ROC) — audit requirement." },
    ],
    pitfalls: [
      "Beyond 28 days post-AGM: progressive penalties + strike-off risk Section 215.",
      "First AGM missed within 15 months post-incorporation: company exposed to strike-off.",
      "Financial statements unaudited when thresholds met: filing rejected.",
      "Missing Mauritius-resident director: company non-compliant.",
      "Share capital changed without articles amendment: ROC refuses.",
    ],
    externalLinks: [
      { label: "eROC Mauritius portal", url: "https://onlinebrd.govmu.org/", description: "Online filing of Annual Return + other forms." },
      { label: "Companies Act 2001", url: "https://onlinebrd.govmu.org/Documents/CompaniesAct.pdf", description: "Full text, Sections 215+." },
      { label: "ROC Guide", url: "https://companies.govmu.org", description: "Official documentation." },
    ],
    tips: [
      "Lexora generates financial statements automatically as of AGM date.",
      "For groups: multi-company, Lexora files in bulk via eROC robot (if enabled).",
      "GBC: ROC + FSC filing in parallel, same financial statements.",
      "Multinationals: Mauritius Annual Return + equivalents in each jurisdiction (Companies House UK, RCS LUX, etc.).",
    ],
  },

  // ========================================================================
  // SFT — AML/CFT
  // ========================================================================
  '/client/mra-sft': {
    title: 'SFT — Statement of Financial Transactions (AML/CFT)',
    audience: 'comptable',
    intro:
      "Mandatory declaration to the <b>FIU</b> (Financial Intelligence Unit) or MRA of certain financial transactions: cash > MUR 500,000, international transfers > USD 100,000, unusual schemes (structuring, suspicious counterparty). <b>AML/CFT</b> regime (Anti-Money Laundering / Counter Financing of Terrorism). Deadline 5 working days after detection. Non-declaration: fine up to MUR 100,000 + director imprisonment.",
    steps: [
      { title: "1. Identify the thresholds", body: "<b>CTR</b> (Cash Transaction Report) if cash > MUR 500k on a single linked transaction. <b>STR</b> (Suspicious Transaction Report) without threshold: any unusual scheme (sub-threshold structuring, undisclosed PEP counterparty, inconsistent profile)." },
      { title: "2. Document each transaction", body: "Amount, parties (with UBO if entity), reason stated by client, commercial evidence, consistency analysis (supplier KYC, normality), conclusion (suspect/not suspect + reason)." },
      { title: "3. File with FIU", body: "<b>Submit SFT</b> button. STR or CTR form per case. Upload on FIU portal. Deadline <b>5 working days</b> after detection." },
      { title: "4. Absolute confidentiality (Tipping-off)", body: "You must <b>never inform the client</b> that a report was made. <b>Very serious</b> offence: Section 36 FIAMLA, up to 5 years imprisonment." },
      { title: "5. 7-year retention", body: "All documents (analysis, declaration, exchanges) kept 7 years minimum. Lexora auto-archives in Documents → AML." },
    ],
    pitfalls: [
      "Non-declaration: fine up to MUR 100,000 + director imprisonment.",
      "Tipping-off (informing the client): serious offence, up to 5 years imprisonment.",
      "Under-declaration (CTR instead of STR for suspicious): same as non-declaration.",
      "5-day deadline missed: documented offence.",
    ],
    externalLinks: [
      { label: "FIU Mauritius", url: "https://www.fiumauritius.org", description: "STR/CTR portal + AML/CFT guides." },
      { label: "FIAMLA — Full text", url: "https://www.fiumauritius.org/legislation", description: "Applicable law." },
      { label: "FATF Guidance", url: "https://www.fatf-gafi.org", description: "International AML/CFT standards." },
    ],
    tips: [
      "Lexora scans transactions and flags those potentially reportable (heuristics + AI).",
      "For GBC: enhanced AML/CFT regime (FSC + FIU), mandatory written procedures.",
      "Multinationals: cross-border CFT module with local rules (EU 5AMLD, US BSA, UK MLR).",
      "MLRO mandatory for GBC: Money Laundering Reporting Officer. Lexora integrates the workflow.",
    ],
  },

  // ========================================================================
  // DEADLINES
  // ========================================================================
  '/client/echeances': {
    title: 'Tax and social deadlines — Calendar',
    audience: 'all',
    intro:
      "Calendar of all obligations: <b>VAT</b> (20th of following month), <b>PAYE/CSG/NSF/PRGF</b> (20th), <b>TDS</b> (20th), <b>CIT APS</b> (3 months after each quarter end), <b>annual CIT</b> (6 months post year-end), <b>ROC Annual Return</b> (28d post-AGM), <b>FSC GBC filing</b> (6 months post year-end). One view, no oversights.",
    steps: [
      { title: "1. Chronological view", body: "Deadlines sorted by closest. < 3 days = red, 3-7 days = orange, > 7 days = green." },
      { title: "2. Mark as filed / paid", body: "Once submitted AND paid, mark it to remove from follow-up." },
      { title: "3. Filter by type", body: "VAT only, payroll only, CIT only, all. Filter by company if multi-company." },
      { title: "4. Automatic reminders", body: "If enabled: email + Telegram T-7, T-3, T-1, day D. With amount due and direct portal link." },
      { title: "5. Annual view", body: "12-month overview: you see total monthly load to plan cash." },
    ],
    tips: [
      "Telegram bot sends T-7 / T-3 / T-1 reminders with amount and link.",
      "For groups: consolidated calendar across all group companies.",
      "Multinationals: multi-jurisdiction calendar (Mauritius + other countries).",
    ],
  },

  // ========================================================================
  // SOCIAL CONTRIBUTIONS
  // ========================================================================
  '/client/declarations-sociales': {
    title: 'Social contributions (CSG, NSF, PRGF)',
    audience: 'all',
    intro:
      "Mandatory monthly social contributions on salaries. <b>CSG</b> (Contribution Sociale Généralisée) replaces the former NPF since 2020: cat A 1.5% emp + 3% employer (salary ≤ MUR 50k), cat B 3% emp + 6% employer (> 50k). <b>NSF</b> (National Savings Fund): 1% emp + 2.5% employer capped at MUR 19,700/month. <b>PRGF</b> (Portable Retirement Gratuity Fund): 4.5% employer on total salary (since 2020, replaces old severance regime). MRA deadline: <b>20th of the following month</b>.",
    steps: [
      { title: "1. Compute payroll", body: "HR → Payroll. CSG/NSF/PRGF computed automatically on each payslip per employee category." },
      { title: "2. Check bases", body: "Base = gross salary + bonuses + overtime (per specific rules for each contribution)." },
      { title: "3. Lock payroll", body: "Prerequisite to filing. Immutable payslips, entries posted (account 4312 NSF, 4313 CSG, 4314 PRGF)." },
      { title: "4. Generate MRA files", body: "HR → Payroll → MRA Exports. Combined CSG/NSF CSV + separate PRGF CSV. Strict format: compulsory header, ordered columns, 14-digit NID." },
      { title: "5. Submit on eservices.mra.mu", body: "Modules <b>CSG/NSF Return</b> and <b>PRGF Return</b>. Upload CSVs, validate, pay balance. MRA reference received." },
      { title: "6. Pay the balance", body: "Transfer to MRA. Balance = CSG (emp + employer) + NSF (emp + employer) + PRGF (employer)." },
    ],
    pitfalls: [
      "CSG category error (A vs B): all contributions wrong.",
      "Not capping NSF at MUR 19,700: over-contribution, pure loss.",
      "Forgetting PRGF (introduced 2020): offence. Unless you have an equivalent private pension scheme (with FSC certificate).",
      "Beyond 20th: 5% penalty + interest per month.",
    ],
    externalLinks: [
      { label: "MRA — CSG", url: "https://www.mra.mu/index.php/employees/csg" },
      { label: "MRA — NSF", url: "https://www.mra.mu/index.php/employees/nsf" },
      { label: "PRGF", url: "https://www.prgf.mu" },
    ],
    tips: [
      "Lexora monthly verifies CSG category (auto-switches A→B if salary exceeds 50k).",
      "Multinationals: equivalent regimes per country (URSSAF FR, NICs UK) integrated.",
    ],
  },

  // ========================================================================
  // GBC DASHBOARD
  // ========================================================================
  '/client/gbc-dashboard': {
    title: 'GBC — Global Business dashboard',
    audience: 'all',
    intro:
      "Dashboard dedicated to <b>Global Business</b> companies (GBC) regulated by <b>FSC Mauritius</b>. Overview: status (GBC1 under Partial Exemption or Authorised Company), substance obligations (CIGA), Transfer Pricing, CRS/FATCA, UBO, Pillar Two GloBE (for MNE > €750M), annual FSC filings.",
    steps: [
      { title: "1. Identify your status", body: "<b>GBC1</b> (Partial Exemption Regime): 15% nominal, 80% deemed exempt on certain income = 3% effective. <b>Authorised Company (AC)</b>: 15% nominal but often exempt if non-Mauritius tax resident + excluded activities. Strict conditions." },
      { title: "2. CIGA substance", body: "Critical conditions: <b>Core Income-Generating Activities</b> in Mauritius. Document: qualified resident employees (CVs, contracts, payroll), local operating expenses (rent, advisory), Mauritius board meetings (signed minutes)." },
      { title: "3. Key deadlines", body: "<b>FSC Annual Return</b>: 6 months post year-end, fees USD 1,750 (GBC1) or USD 350 (AC). <b>Audit mandatory</b>. <b>CIT</b>: Form 3 (GBC) filed with documented exemption. <b>CbCR</b> if consolidated MNE > €750M." },
      { title: "4. Transfer Pricing", body: "Mandatory TP documentation for intra-group transactions: Master File, Local File, method (CUP, TNMM, Cost Plus). OECD BEPS Action 13 compliance." },
      { title: "5. CRS / FATCA", body: "Annual reporting of accounts held by non-residents (CRS for OECD, FATCA for US). XML format, submission via FSC portal." },
      { title: "6. UBO (Beneficial Ownership)", body: "UBO register of natural persons holding > 25% directly or indirectly. Update within 14 days of change. Lexora keeps up to date automatically." },
      { title: "7. Pillar Two GloBE (if applicable)", body: "For multinationals > €750M: Top-Up Tax 15% global minimum. GloBE Income calculations, Adjusted Covered Taxes, ETR by jurisdiction. Lexora dedicated module." },
    ],
    pitfalls: [
      "Insufficiently documented CIGA substance: loss of PER, reassessment at 15% + penalties.",
      "Undocumented TP: MRA can requalify transfer prices + major reassessment.",
      "Outdated UBO: offence Section 12 FATCA Act, fine up to MUR 5 M.",
      "AC becoming tax resident in error (effective seat in Mauritius): loss of exemption.",
      "Ignoring Pillar Two when MNE > €750M: top-up tax calculated by foreign jurisdiction.",
    ],
    externalLinks: [
      { label: "FSC Mauritius", url: "https://www.fscmauritius.org", description: "Regulator GBC, AC, Investment Dealer." },
      { label: "FSC — Partial Exemption Guidelines", url: "https://www.fscmauritius.org/media/55020/per-guidelines.pdf" },
      { label: "OECD BEPS", url: "https://www.oecd.org/tax/beps/", description: "Transfer Pricing + Pillar Two standards." },
      { label: "MRA — CRS / FATCA", url: "https://www.mra.mu/index.php/eservices/automatic-exchange-of-information" },
    ],
    tips: [
      "Dedicated Lexora modules: CIGA documentation, TP Master/Local File, CRS/FATCA reporting, Pillar Two GloBE.",
      "Annual audit mandatory for GBC — Lexora exports IFRS statements ready for Big4.",
      "Multi-jurisdiction holding structure: Lexora handles multiple related entities with IFRS 10 consolidation.",
      "Beneficial Ownership: Lexora integrates KYC data and computes UBO in cascade.",
    ],
  },

  // ========================================================================
  // HR — DEPARTURE
  // ========================================================================
  '/rh/depart': {
    title: "Employee departure — Full process",
    audience: 'all',
    intro:
      "Process to manage a departure: resignation, dismissal, end of CDD, retirement, death. Lexora computes notice, severance (Section 70 WRA), final settlement (pro-rata salary + accrued leave + pro-rata 13th month + severance), generates the work certificate, files the MRA PAYE Exit Statement.",
    steps: [
      { title: "1. Enter departure date", body: "Employee file → field <em>departure_date</em>. Triggers automatic calculations. Type: resignation / dismissal / end CDD / retirement / death / mutually agreed termination." },
      { title: "2. WRA notice", body: "<b>Section 53 WRA 2019</b>: minimum notice <b>30 days</b> if seniority ≥ 1 year, 7 days if < 1 year. Notice given OR paid if not served (compensating allowance)." },
      { title: "3. Severance calculation", body: "<b>Section 70 WRA</b>: indemnity = <b>3 months × years of service</b> × 12-month average salary, no explicit cap. Exception: retirement ≥ 60 = 1 month × years (lighter regime). Lexora computes automatically." },
      { title: "4. Final settlement", body: "Components: (a) pro-rata salary to departure date, (b) accrued leave to pay out, (c) pro-rata EOY 13th month if departure before December, (d) severance, (e) unpaid OT. Special <em>Final Settlement</em> payslip." },
      { title: "5. Certificate and filings", body: "Generate the <b>work certificate</b> (WRA mandatory). File departure with MRA via <b>PAYE Exit Statement</b> (Form PAY11). Stop NSF enrolment." },
      { title: "6. Asset return", body: "Checklist: laptop, badge, phone, company car, Lexora access revoked, Telegram account unlinked. To tick in Lexora." },
      { title: "7. Archive", body: "Employee file moves to <b>Archived</b>. Data retained 10 years (audit + potential litigation evidence)." },
    ],
    pitfalls: [
      "Forgetting notice: Industrial Court litigation (jurisdiction over labour matters in Mauritius).",
      "Wrong severance calculation (missed partial years, wrong average salary): costly. Check via WRA s.70.",
      "Skipping PAYE Exit Statement: employee cannot justify income for personal income tax.",
      "Forgotten asset return: asset loss, security flaw (laptop with client data access).",
      "Dismissal without valid grounds + formal procedure: tribunal may requalify as unfair, ordering 6-24 months' salary.",
    ],
    externalLinks: [
      { label: "Workers Rights Act 2019", url: "https://labour.govmu.org/Documents/Legislations/WRA2019.pdf" },
      { label: "Industrial Court Mauritius", url: "https://industrialcourt.govmu.org" },
      { label: "MRA — PAYE Exit Statement", url: "https://www.mra.mu/index.php/eservices/paye" },
    ],
    tips: [
      "Lexora offers a step-by-step departure workflow, nothing is forgotten.",
      "Mutually agreed terminations: WRA-compliant PDF template generated.",
      "Multinationals: country-specific rules (US at-will, FR mutual agreement, UK statutory).",
    ],
  },

  // ========================================================================
  // HR — SEVERANCE
  // ========================================================================
  '/rh/severance': {
    title: 'Severance — Calculation simulator',
    audience: 'comptable',
    intro:
      "Simulation tool for end-of-contract indemnity (Section 70 WRA). Distinct from /rh/depart which runs the full process — here you just do the calculation to plan or provision. Formula: <b>3 months × years of service × 12-month average salary</b>. Retirement ≥ 60 case: <b>1 month × years</b>.",
    steps: [
      { title: "1. Parameters", body: "Pick employee, joining date (auto HR file), planned departure date, reason (resignation/dismissal/retirement/end CDD)." },
      { title: "2. Detailed calculation", body: "Lexora shows: seniority in years (with pro-rata months), 12-month average salary, applicable multiplier (3 or 1), total amount." },
      { title: "3. Scenario variants", body: "Test several scenarios (immediate departure vs in 6 months) to compare impact." },
      { title: "4. IAS 19 provision", body: "If anticipating a departure: provision via <b>Provisions → Severance</b>. Accounting impact: Debit 6815 Provision charge, Credit 1581 Severance provision." },
      { title: "5. Export", body: "Simulation PDF to present to the Board or consult lawyer before termination." },
    ],
    pitfalls: [
      "Confusing base salary with average salary (which includes regular bonuses): understatement.",
      "Forgetting partial years (8 years 7 months = 8.58 years, not 8): calculation gap.",
      "Retirement < 60: classic 3-month formula, not 1-month.",
    ],
    tips: [
      "Retirement ≥ 60 = major difference (1 month vs 3 months × years). Plan departures accordingly.",
      "For a large group: global provision computed automatically for at-risk employees.",
    ],
  },

  // ========================================================================
  // HR — EOY BONUS
  // ========================================================================
  '/rh/eoy-bonus': {
    title: 'End-of-Year Bonus (13th month) — WRA calculation',
    audience: 'comptable',
    intro:
      "The <b>13th month</b> is mandatory per <b>Section 49 WRA 2019</b>: <b>1/12 of annual remuneration per month worked</b>, paid in December (or pro-rata on departure). Applies to all private sector employees who worked ≥ 1 month in the year. Includes salary + allowances + regular bonuses (not exceptional).",
    steps: [
      { title: "1. Eligibility", body: "All employees who worked ≥ 1 calendar month in the year. CDD, seasonal, part-time included. Unpaid interns excluded." },
      { title: "2. Run the calculation", body: "<b>Compute EOY {year}</b> button. Lexora applies: (annual total remuneration × months worked) / 12. Remuneration = base salary + allowances + regular bonuses." },
      { title: "3. Check per employee", body: "Table with: months worked, average remuneration, EOY computed. Compare with previous year." },
      { title: "4. Validate and pay", body: "EOY payslip <b>separate</b> from regular December payslip. Subject to PAYE per standard schedule + CSG + NSF." },
      { title: "5. Payment deadline", body: "<b>By 31 December</b> of the year concerned (Section 49 WRA). Delay = offence." },
      { title: "6. Monthly provision", body: "For interim balance sheets: provision 1/12 each month (Lexora does it automatically via Provisions module)." },
    ],
    pitfalls: [
      "Forgetting seasonal / part-time: Industrial Court litigation.",
      "Computing on base salary only: error, WRA says 'remuneration' which includes allowances.",
      "Paying after 31 December: offence, interest due to employee.",
      "Including exceptional bonuses in the base: overstatement, pure loss.",
    ],
    externalLinks: [
      { label: "WRA 2019 — Section 49", url: "https://labour.govmu.org/Documents/Legislations/WRA2019.pdf" },
    ],
    tips: [
      "Lexora provisions monthly 1/12 in account 4286 — balance sheet always correct.",
      "For groups: consolidated EOY across companies.",
      "Multinationals: local equivalents (FR gratification, optional US Christmas bonus).",
    ],
  },

  // ========================================================================
  // HR — MRA RETURNS
  // ========================================================================
  '/rh/declarations-mra': {
    title: 'MRA payroll returns (PAYE, CSG, NSF, PRGF)',
    audience: 'comptable',
    intro:
      "MRA file generation + submission page for monthly payroll. Difference vs /client/declarations-sociales (product view): here it is the execution page in the payroll module. Workflow: lock payroll → generate files → submit MRA → pay balance. Fixed deadline <b>20th of the following month</b>. 5% penalty + interest beyond.",
    steps: [
      { title: "1. Prerequisite: locked payroll", body: "Lock the period in <b>HR → Payroll</b> before filing. Validated and posted payslips." },
      { title: "2. PAYE-MRA tab", body: "PDF summary + per-employee CSV (NID, name, gross, PAYE withheld). Strict MRA format, pre-export validation." },
      { title: "3. CSG/NSF-MRA tab", body: "Combined employer + employee CSV with categories A/B. NSF cap MUR 19,700 applied automatically." },
      { title: "4. PRGF-MRA tab", body: "Separate CSV. Calculation = 4.5% × total gross all employees. Unless equivalent private pension with FSC certificate." },
      { title: "5. Submit on eservices.mra.mu", body: "Login → modules PAYE, CSG/NSF Return, PRGF Return. Upload CSVs. Note references. Playwright robot can do this automatically (see Management → MRA Access)." },
      { title: "6. Pay", body: "Transfer to MRA, reference TAN + period. Balance = PAYE + CSG (emp + employer) + NSF (emp + employer) + PRGF (employer). Mark as paid in Lexora." },
    ],
    externalLinks: [
      { label: "MRA — eServices portal", url: "https://eservices.mra.mu" },
    ],
    tips: [
      "Configure Management → MRA Access for auto submission via Telegram robot.",
      "For groups: bulk multi-company submission from the practice dashboard.",
      "Months in arrears: Lexora submits in strict chronological order (MRA requires it).",
    ],
  },

  // ========================================================================
  // HR — LEAVE PROVISION
  // ========================================================================
  '/rh/provisions/conges': {
    title: 'Leave provision (IAS 19)',
    audience: 'comptable',
    intro:
      "Mandatory IFRS accounting provision for leave accrued but not yet taken by employees. Reference: <b>IAS 19 Employee Benefits</b>. Lexora computes automatically each month and posts the entry. Critical for the balance sheet: without provision, social liability is understated, audit refuses opinion.",
    steps: [
      { title: "1. IAS 19 principle", body: "Accrued paid leave (1.83 days/month in AL) is a debt to the employee. As long as not taken, a provision must be set up to comply with the true-and-fair-view principle." },
      { title: "2. Automatic monthly calculation", body: "Month-end: for each employee, days accrued not taken × daily salary (1/22 of monthly salary) × employer charges = individual provision. Total = overall provision." },
      { title: "3. Automatic entry", body: "Debit <b>6411 Salaries</b> (expense), Credit <b>4282 Leave provision</b>. Reverse on effective leave taking (Debit 4282, Credit 421 Personnel)." },
      { title: "4. Monthly tracking", body: "Table: opening provision + month accruals - month takings = closing provision. Annual evolution visible." },
      { title: "5. Audit", body: "Auditor checks: number of accrued days consistent with attendance, correct daily rate, employer charges included, provision = actual outstanding." },
      { title: "6. For IFRS groups", body: "Included in <b>Other employee benefits</b> on the consolidated balance sheet. You can split per company + group total (Tools → Consolidation)." },
    ],
    pitfalls: [
      "Computing without employer charges: understatement (forgets NSF + CSG + PRGF employer).",
      "Forgetting reversal at effective leave taking: double counting.",
      "Provisioning for employees who left without settlement: wrong balance sheet.",
      "Keeping a frozen provision without recalculation: fundamental error.",
    ],
    tips: [
      "Lexora recomputes at each payroll lock — no manual effort.",
      "For groups: sensitivity presented (impact +/- 10% turnover or rate).",
      "Multinationals: different local rules (FR CP 25 days × 1/12, RTT, etc.) supported.",
    ],
  },

  // ========================================================================
  // PRACTICE — CLIENT PORTFOLIO
  // ========================================================================
  '/comptable/clients': {
    title: 'Practice client portfolio',
    audience: 'comptable',
    intro:
      "All clients followed by the practice: companies, tasks in progress, status, assigned collaborators, ongoing fees. View designed to manage 5 to 500 clients efficiently. Different from the practice dashboard (KPI) — here it is the operational directory.",
    steps: [
      { title: "1. Filter and search", body: "By name, sector, tag (urgent, VIP, late), assigned collaborator, status (active, on hold, lost)." },
      { title: "2. Open a client", body: "Detail: client companies (a client can have several companies), monthly tasks, recent interactions, contacts." },
      { title: "3. Acting as", body: "Switch to client mode: you see Lexora as if you were the director. Useful for data entry/checks without changing session." },
      { title: "4. Assign collaborators", body: "<b>Team</b> tab per client: who does what. Auto permissions per assignment." },
      { title: "5. Fees", body: "Tracking of the practice agreement: monthly fixed fee, ad-hoc, outstanding, late payments." },
      { title: "6. Communication", body: "Centralises emails exchanged with this client. Send validation requests to the client (electronic accounts signature)." },
    ],
    tips: [
      "Assign collaborators per client to scope who sees/edits what (confidentiality security).",
      "Customisable client tags: urgent, legacy, premium, at-risk.",
      "Multi-practice (network): consolidated reporting per partner.",
    ],
  },

  // ========================================================================
  // PRACTICE — TEAM
  // ========================================================================
  '/comptable/equipe': {
    title: 'Practice team',
    audience: 'comptable',
    intro:
      "Management of practice collaborators: who does what, on which clients, with which rights. Optional time-tracking for hourly billing. Essential for practices > 3 collaborators.",
    steps: [
      { title: "1. Add a collaborator", body: "<b>Invite</b>. Email, role (partner / senior / junior / intern), client assignments." },
      { title: "2. Assign clients", body: "Each collaborator only sees their assigned clients (except admin/partner). Confidentiality security + clarity." },
      { title: "3. Time-tracking (optional)", body: "Time capture per client/task. Built-in stopwatch. Weekly/monthly reporting per collaborator." },
      { title: "4. Practice hourly billing", body: "Time-tracking → practice invoices automatically (hourly rate per collaborator or per client)." },
      { title: "5. Productivity KPI", body: "Billable vs non-billable hours, recovery rate, clients handled, deadlines met." },
      { title: "6. Collaborator departure", body: "Deactivate account, transfer clients to another, archive access. History preserved." },
    ],
    tips: [
      "For partners: team dashboard with margins per collaborator.",
      "SAML SSO for practices > 20 collaborators (AD/Okta integration).",
      "Multi-office: reporting per office + consolidated practice.",
    ],
  },

  // ========================================================================
  // ALERTS
  // ========================================================================
  '/client/alertes': {
    title: 'Alerts and notifications',
    audience: 'all',
    intro:
      "Alert centre: tax deadlines, overdue invoices, missing documents, bank anomalies, absent employees, expiring contracts. Granular by severity (Critical / Important / Info), with Telegram push, email, SMS per preferences.",
    steps: [
      { title: "1. Filter by severity", body: "<b>Critical</b> (immediate: MRA deadline T-1, invoice > 60d unpaid, major bank anomaly). <b>Important</b> (handle this week). <b>Info</b> (to follow)." },
      { title: "2. Resolve an alert", body: "Click to access the concerned page. Disappears once resolved (or mark as 'ignored' with justification)." },
      { title: "3. Enable Telegram push", body: "Configure in Bot Permissions. Criticals as immediate push. Important as morning recap." },
      { title: "4. Customise thresholds", body: "You can adjust (e.g. alert at T-14 instead of T-7) via memory_set or Settings → Alerts." },
      { title: "5. Alert history", body: "All alerts (resolved, ignored, expired) in archive. Useful for audit or retrospective." },
    ],
    tips: [
      "Bot delivers a <em>morning brief</em> at 09:00 with critical recap + day's actions.",
      "Multi-company: alerts filterable per company.",
      "Multinationals: routing by country/team (Mauritius CFO sees Mauritius, etc.).",
    ],
  },

  // ========================================================================
  // INVOICING SETTINGS
  // ========================================================================
  '/client/facturation-settings': {
    title: 'Invoicing settings',
    audience: 'client',
    intro:
      "Configure everything related to invoices: numbering, logo, payment terms, reminders, IBAN, legal mentions, signature. Compliant with compulsory mentions <b>Section 20 VAT Act</b> (name, address, BRN, VATRN, invoice number, date, description, base, VAT, total).",
    steps: [
      { title: "1. Numbering", body: "Format: prefix (e.g. ACME) + YYYY + sequential number (5 digits). Customisable. Strict chronology required by MRA — Lexora blocks if you skip." },
      { title: "2. Logo and details", body: "Upload PNG/JPG logo (recommended 200x200px). Check full address, BRN, VATRN, IBAN shown on PDF." },
      { title: "3. Default payment terms", body: "Delay (30, 60 days net, etc.), method (transfer, cheque), text shown. You can override per customer." },
      { title: "4. Reminder cadence", body: "1st T+7 (friendly), 2nd T+15 (firm), 3rd T+30 (formal demand). Customise templates with variables {{name}}, {{amount}}, {{date}}." },
      { title: "5. Legal mentions", body: "Footer text: terms, late interest (1.5x Mauritian legal rate if unpaid), jurisdiction." },
      { title: "6. Signature", body: "Electronic signature or scanned director's signature to authenticate invoices." },
    ],
    pitfalls: [
      "Missing compulsory mentions: invoice unenforceable, MRA refuses on inspection.",
      "Non-chronological numbering (skipping a number): offence. Lexora blocks.",
      "Changing logo mid-year: old PDF invoices keep the old logo.",
    ],
    tips: [
      "Multilingual: EN/FR invoices per customer language.",
      "Per-company branding for practices: each client has its own templates.",
      "For groups: distinct intra-group vs external templates.",
    ],
  },

  // ========================================================================
  // HR SETTINGS
  // ========================================================================
  '/client/parametres-rh': {
    title: 'HR settings',
    audience: 'all',
    intro:
      "HR rules applicable to the whole company: leave (accrual, carry-overs), working hours, payroll, Mauritius public holidays, CSG categories. Must reflect WRA + applicable collective agreements.",
    steps: [
      { title: "1. Leave rules", body: "Opening balance on hiring, monthly accrual (AL 1.83/month, SL 1.25), carry-overs (max 6 months post year-end), usage period, VL rights after 5 years." },
      { title: "2. Working hours", body: "<b>45h/week</b> WRA standard, <b>8h/day</b>, breaks (1h unpaid lunch). OT calculation base. Sector collective bargaining possible (hospitality 48h)." },
      { title: "3. Payroll settings", body: "Pay day (25th or end of current month), method (transfer, cheque), default accounting accounts (6411 salaries, 4310 net, 4311/12/13/14 contributions)." },
      { title: "4. Mauritius public holidays", body: "Official calendar: 1 Jan, 2 Jan, Chinese NY, Thaipoosam Cavadee, Independence Day (12 March), Labour Day (1 May), Eid, Assumption, Diwali, Christmas, Boxing Day. Lexora keeps up to date." },
      { title: "5. CSG categories", body: "MUR 50,000/month threshold to switch A → B. Lexora switches automatically if salary exceeds." },
      { title: "6. EOY Bonus", body: "Payment date parameter (1-31 Dec) and calculation base (base salary only or with allowances)." },
    ],
    tips: [
      "If a collective agreement applies (hospitality, manufacturing), configure specific rules.",
      "Multinationals: HR rules per country with local calendars.",
      "Annual audit of settings: Lexora alerts if a parameter is obsolete vs new law.",
    ],
  },

  // ========================================================================
  // COMPANIES
  // ========================================================================
  '/client/societes': {
    title: 'My companies',
    audience: 'client',
    intro:
      "List of companies you manage in your Lexora tenant. Quick switch between companies (top selector), add a new one, archive. For a practice: each client can have several companies (group with subsidiaries).",
    steps: [
      { title: "1. Switch company", body: "Top selector. All of Lexora filters on the active company (invoices, banking, HR, tax)." },
      { title: "2. Create a company", body: "<b>New</b>. Trading name, legal name, BRN (9-digit CBRD), MRA TAN, VATRN if VAT-registered, business sector, incorporation date, financial year (July-June classic or other)." },
      { title: "3. Status and type", body: "SME / GBC1 / Authorised Company / commercial company. Type affects: tax (15% vs 3% effective), requirements (audit, FSC filing, substance), enabled modules." },
      { title: "4. Edit", body: "Details, logo, tax settings, bank accounts, financial year. Some edits require CBRD article amendment (capital, name, registered office)." },
      { title: "5. Archive (do not delete)", body: "Company ceasing activity: <b>Archive</b>. Data kept 10 years for audit. Never delete except on data-entry error." },
      { title: "6. Group (parent + subsidiaries)", body: "Define relationships: parent company, subsidiaries held > 50% (IFRS 10 consolidation), holdings 20-50% (equity method), associates." },
    ],
    pitfalls: [
      "Do NOT delete a company with accounting entries — archive instead.",
      "Wrong BRN/TAN/VATRN: all returns rejected.",
      "Poorly defined financial year: balance sheet on wrong period.",
    ],
    tips: [
      "For groups: you can manage 50, 500, 5,000 companies in the same tenant. No limit.",
      "Practices: clients in various phases (active, on hold, lost).",
      "Multinationals: automatic IFRS 10 consolidation with intra-group elimination (Tools → Consolidation).",
    ],
  },

  // ========================================================================
  // USERS
  // ========================================================================
  '/client/utilisateurs': {
    title: 'Company users — Lexora accounts',
    audience: 'client',
    intro:
      "Who can access this company in Lexora: directors, accountants, employees. Different from Bot Permissions (Telegram capabilities) — here it is access to the Lexora web UI. Security: invite by email, change role, deactivate on departure.",
    steps: [
      { title: "1. Invite a user", body: "<b>Invite</b>. Email + role (Management / Accountant / HR / Manager / Employee). Email sent with account creation link." },
      { title: "2. Role and permissions", body: "Role determines accessible modules + allowed actions. Management = everything. Employee = own file + payslips + leave request." },
      { title: "3. Change a role", body: "Edit the line. Immediate effect at next sign-in." },
      { title: "4. Deactivate an account", body: "On a collaborator's departure: <b>Deactivate</b>. History preserved, access revoked. Not deletion (for audit)." },
      { title: "5. Multi-company", body: "A user can be linked to several companies (practices, groups). Lexora top selector to switch." },
      { title: "6. SSO (Enterprise)", body: "For groups > 50 users: integrate SAML SSO with your IdP (AD, Okta, Auth0). Settings → SSO." },
    ],
    tips: [
      "For Telegram bot, also go to Bot Permissions for fine capabilities.",
      "Enable compulsory 2FA (Settings → Security) for Management accounts.",
      "Multinationals: user groups per BU/country with delegated local admin.",
    ],
  },

  // ========================================================================
  // LEX FACTURES (AI)
  // ========================================================================
  '/client/lex-factures': {
    title: 'Lex — AI invoicing',
    audience: 'client',
    intro:
      "AI module dedicated to invoicing: natural language creation, anomaly detection (duplicates, VAT errors, abnormal customer price), smart reminders adapted to payer history. For those who like to move fast.",
    steps: [
      { title: "1. Create in natural language", body: "<em>\"invoice acme 50k consulting september\"</em> → AI extracts everything and proposes a draft. Faster than the form." },
      { title: "2. Anomaly detection", body: "AI scans your invoices and flags: duplicates (same customer, same amount, close dates), VAT errors (rate inconsistent with catalogue), abnormal price vs customer history." },
      { title: "3. Smart reminders", body: "AI analyses each customer's payment history (average DSO, usual delays) and suggests personalised messages (tone, urgency)." },
      { title: "4. Collection prediction", body: "AI estimates the likely collection date of each pending invoice from history. Refines your cash projection." },
      { title: "5. At-risk customer detection", body: "AI scores each customer 0 to 100 (default risk). Score > 70 = vigilance, terms to review." },
    ],
    tips: [
      "Same from Telegram with the bot.",
      "AI improves with your history — accuracy increases after 3 months of use.",
      "For groups: model trained on whole-group history (more accurate).",
    ],
  },

  // ========================================================================
  // LEX OCR
  // ========================================================================
  '/client/lex-ocr': {
    title: 'Lex OCR — Document recognition',
    audience: 'client',
    intro:
      "Drop a PDF or photo → the <b>Claude Vision</b> AI reads content and extracts supplier, amounts, dates, VAT, line details. Different from Documents (management view) — here it is OCR with immediate structured extraction. Ideal for quick supplier invoice capture.",
    steps: [
      { title: "1. Drop a document", body: "PDF, JPG, PNG, XLSX. Max 20 MB. Multi-upload supported." },
      { title: "2. AI analyses", body: "Claude Vision identifies: type (supplier invoice, receipt, statement, contract), structures fields (supplier, date, amounts per VAT rate, detailed lines if table)." },
      { title: "3. Confidence per field", body: "Each field has a confidence score. High → green. Medium → orange (verify). Low → red (correct)." },
      { title: "4. Validate or correct", body: "Proposed summary. One click to create supplier invoice (with accounting entry + deductible VAT) or other entry." },
      { title: "5. Learning", body: "The more you use it, the more AI adapts to your recurring suppliers (memorises their format)." },
    ],
    tips: [
      "Send to Telegram bot → same result from your phone (photo in seconds).",
      "Email forwarding to documents@your-tenant.lexora.finance for auto ingestion without drag-and-drop.",
      "Multinationals: multilingual OCR FR/EN/ZH/JA/AR/etc.",
    ],
  },

  // ========================================================================
  // EXCHANGE RATES
  // ========================================================================
  '/client/taux-change': {
    title: 'Exchange rates — History and application',
    audience: 'comptable',
    intro:
      "History of MUR exchange rates against major currencies (EUR, USD, GBP, ZAR, INR, etc.). Updated daily at 05:30 UTC from official sources MRA + BoM. Essential for: foreign-currency invoicing (IAS 21), backdated entries, group consolidation, accounting of exchange gains/losses.",
    steps: [
      { title: "1. Today's rate", body: "Official rates applied for automatic conversion of foreign-currency invoices. Table view MUR/EUR, MUR/USD, etc." },
      { title: "2. History", body: "Rates of recent months/years. Search by date for backdated entries or audit. IAS 21 compliance." },
      { title: "3. Automatic application", body: "When you issue an invoice in USD, Lexora applies the daily rate automatically for MUR valuation (accounting + VAT collected)." },
      { title: "4. Manual refresh", body: "<b>Refresh</b> button if needed (otherwise auto at 05:30 UTC every day). Source: Bank of Mauritius + MRA." },
      { title: "5. FX gains/losses", body: "At closing, Lexora computes FX differences on foreign-currency receivables/payables: routed to account 766 (gains) or 666 (losses) automatically." },
      { title: "6. Functional currency (IAS 21)", body: "If your company keeps accounting in USD (typical GBC) rather than MUR: Settings → Functional Currency. Automatic conversion for Mauritius reporting." },
    ],
    externalLinks: [
      { label: "MRA — Official rates", url: "https://www.mra.mu/index.php/exchange-rates" },
      { label: "Bank of Mauritius", url: "https://www.bom.mu/markets/exchange-rates" },
    ],
    tips: [
      "For GBC: functional currency USD often more relevant than MUR.",
      "Multinationals: conversion to the group's presentation currency (IFRS consolidation).",
      "Hedge accounting module (IFRS 9) for FX hedging.",
    ],
  },

  // ========================================================================
  // CLIENT — RECONCILIATION (director view)
  // ========================================================================
  '/client/rapprochement': {
    title: 'Bank reconciliation — Director view',
    audience: 'client',
    intro:
      "Steering view of reconciliation: at a glance you see which accounts are up to date, the matching rate, transactions still outstanding and the residual gap between bank balance and accounting balance. Not the accounting mechanics (R1-R7 rules, 411/401 letterage, BNQ entries — that lives in <em>/comptable/rapprochement</em>), just the health status. Essential to validate balance-sheet reliability before any decision (investment, dividend, loan).",
    steps: [
      { title: "1. Health card per account", body: "For each bank account (MCB, SBM, AfrAsia, etc.): <b>scraped balance</b>, <b>Lexora accounting balance</b>, <b>gap</b>, <b>% transactions reconciled</b>, last reconciliation date. Green if gap < 1%, orange 1-5%, red > 5%." },
      { title: "2. Outstanding transactions", body: "List of transactions not yet reconciled with age. Beyond 30 days, alert: your accountant may have forgotten, ask them." },
      { title: "3. Approve batches", body: "If your accountant prepared a batch of matches with > 95% confidence, validate the whole lot in one click. Otherwise leave the detail to them." },
      { title: "4. Steer the residual gap", body: "The gap between bank and accounting balance must be explained (issued cheques not yet debited, transfers in flight). Lexora lists justifications. Unexplained gap > MUR 50,000 = escalate to Management." },
      { title: "5. Official reconciliation statement", body: "Generate the PDF for your auditor or banker: accounting balance + outstanding items = bank balance. Electronically signed." },
      { title: "6. Drill into accounting detail", body: "If you want to understand a specific line, click → you switch to <b>/comptable/rapprochement</b> with context. Reserved to Director and Accountant roles." },
      { title: "7. Lock the period", body: "When satisfied, lock the month. No further modification. The published balance sheet is frozen.", warning: "Before locking, check no transaction has been outstanding for more than 60 days." },
    ],
    pitfalls: [
      "Locking a month with an unexplained gap > 5%: the published balance sheet is wrong, the auditor issues a qualification.",
      "Batch-approving matches with < 90% confidence: letterage errors surface in the next balance sheet.",
      "Ignoring transactions outstanding > 90 days: often fraud or a missed entry.",
      "Confusing this page (status) with /comptable/rapprochement (action): the letterage button is not here.",
    ],
    tips: [
      "Enable the <em>bank gap</em> Telegram alert: push notification if the gap exceeds your threshold.",
      "For groups: consolidated multi-company dashboard with overall reconciliation rate.",
      "Multinationals: <em>reconciliation maturity</em> KPI per BU for internal benchmark.",
    ],
  },

  // ========================================================================
  // CLIENT — LEGAL CONTRACTS
  // ========================================================================
  '/client/contrats': {
    title: 'Legal contracts — AI assistant',
    audience: 'client',
    intro:
      "Module to generate and manage Mauritian legal contracts, based on the <b>Mauritius Civil Code</b> (1808 Act, Code Napoléon transposition, articles 1101-1369 on contractual obligations) and the <b>Workers' Rights Act 2019</b> for employment contracts. The AI assistant offers <b>32 templates</b>: commercial/residential lease, CDI, CDD, NDA, property sale, mission contract, services agreement, mandate, loan, suretyship, shareholders' agreement, share transfer, etc. Generation in under 2 minutes with clauses tailored to your sector.",
    steps: [
      { title: "1. Pick the contract type", body: "Catalogue of 32 types grouped in 5 families: <b>Employment</b> (CDI, CDD, internship, freelance), <b>Property</b> (commercial/residential lease, sale, lease-to-own), <b>Commercial</b> (services, distribution, agency), <b>Corporate</b> (shareholders' agreement, share transfer, capital increase), <b>Confidentiality</b> (NDA, non-compete, IP)." },
      { title: "2. Fill in the parties", body: "Pick contracting parties from Contacts (auto-filled: BRN, address, representative). For an individual: Mauritian NID + address + capacity (director, employee, owner)." },
      { title: "3. Specific parameters", body: "Per contract type: amount, duration, place of performance, jurisdiction (Mauritian courts by default). AI suggests standard clauses and flags sensitive options (non-compete, exclusivity)." },
      { title: "4. Mandatory legal clauses", body: "AI automatically injects clauses required by law: <b>WRA s.5-12</b> for employment contracts (duration, pay, leave, notice), <b>Civil Code art.1709-1762</b> for leases, <b>Companies Act 2001 s.190</b> for shareholders' agreements.", warning: "An illegal clause (waiver of non-negotiable WRA rights) voids the entire contract. Lexora blocks it." },
      { title: "5. Customise and review", body: "WYSIWYG editor. AI offers <b>improve / simplify / tighten</b> on any clause on demand. Change tracking enabled." },
      { title: "6. Legal validation", body: "<b>AI review</b> button: Claude analyses the final draft, detects inconsistencies, missing clauses, risks. For > MUR 1m or sensitive matters, request external counsel review (optional <b>Lex Avocats Mauritius</b> integration)." },
      { title: "7. Electronic signature", body: "Send for e-signature compliant with the <b>Electronic Transactions Act 2000</b>. SMS/email to signatories, real-time tracking. Time-stamped final PDF." },
      { title: "8. Archiving and alerts", body: "Stored in <b>Documents</b> with tags. Auto alerts: lease end T-90, CDD renewal T-30, NDA expiry T-365. No forgotten contract." },
    ],
    pitfalls: [
      "Commercial lease without indexation clause: rent frozen for 9 years, dead loss for the lessor. Lexora suggests the Mauritius CCI index.",
      "CDD without a valid ground (WRA Section 17: 4 limited grounds): reclassification as CDI + damages.",
      "NDA without limited duration and defined scope: treated as unwritten by Mauritian courts.",
      "Non-compete clause without financial consideration: invalid. Mandatory indemnification (Supreme Court 2019).",
      "Forgetting the jurisdiction clause: disputes potentially brought abroad, costly. Specify <em>Mauritian courts</em>.",
    ],
    externalLinks: [
      { label: "Mauritius Civil Code", url: "https://mauritiusassembly.govmu.org/Documents/Acts/MauritiusCivilCode.pdf", description: "Articles 1101-1369 — obligations and contracts." },
      { label: "Workers' Rights Act 2019", url: "https://mauritiusassembly.govmu.org/Documents/Acts/WRA2019.pdf", description: "Mauritian employment contracts." },
      { label: "Electronic Transactions Act 2000", url: "https://mauritiusassembly.govmu.org/Documents/Acts/ETA2000.pdf", description: "Legally valid e-signatures." },
      { label: "Bar Council Mauritius", url: "https://barcouncil.mu", description: "Lawyer directory for external review." },
    ],
    tips: [
      "For groups: library of customised templates (typical clauses validated by counsel).",
      "Multinationals: templates by jurisdiction (Mauritius, France OHADA, UK common law) auto-selected per parties.",
      "Enable the quarterly automated review of active contracts: Lexora flags those to renegotiate.",
      "Telegram bot: <em>\"generate NDA for supplier X\"</em> → draft ready in 60 seconds.",
    ],
  },

  // ========================================================================
  // CLIENT — PRODUCT/SERVICE CATALOGUE
  // ========================================================================
  '/client/catalogue': {
    title: 'Product and service catalogue',
    audience: 'client',
    intro:
      "Reference list of billable products and services: description, unit net price, VAT rate, internal code, revenue account (class 7). Used to accelerate invoicing (selection in 2 clicks instead of retyping everything), standardise wording across invoices and guarantee VAT-rate consistency (15% / 0% zero-rated / exempt per VAT Act 1998 Schedules).",
    steps: [
      { title: "1. Create an item", body: "<b>New</b>. Internal code (e.g. CONS-DEV), description (as it appears on the invoice), net price MUR, VAT rate (15% / 0% / exempt), revenue account (706 services, 707 sales, 708 ancillary)." },
      { title: "2. Categorise", body: "Tags: family (services, goods, subscriptions), seasonal yes/no, active/archived. Powerful filters for catalogues > 100 lines." },
      { title: "3. Multi-currency", body: "Base price in MUR + fixed prices in USD/EUR for exports. Otherwise Lexora converts at daily rate at invoicing time (IAS 21)." },
      { title: "4. Zero-rated VAT case", body: "Exports of goods, international transport, items in VAT Act Schedule 2 → <b>0%</b> with upstream deduction. Attach customs evidence to the item for audit.", warning: "If you apply 0% without proof, MRA reclassifies to 15% on audit + 5% penalty + interest." },
      { title: "5. Exempt VAT case", body: "Rice, flour, essential medicines, residential rental, banking services, healthcare, education → <b>exempt</b>. No VAT collected but no upstream deduction either." },
      { title: "6. Bulk import", body: "CSV: code, description, price, VAT, account. Ideal for catalogues coming from an ERP/Excel. Template provided in Help → Imports." },
      { title: "7. Link to invoice", body: "In <b>New invoice</b>, search by code or description, add in one click. Tariffs overridable ad hoc (customer discount)." },
      { title: "8. Price history", body: "Every price change is tracked. You can generate a <em>price evolution over 12 months</em> report to steer margin." },
    ],
    pitfalls: [
      "Duplicate codes (CONS-DEV and CONS_DEV): confusion at invoicing. Enable deduplication.",
      "Wrong VAT rate on a recurring item: under-declared VAT on hundreds of invoices, huge reassessment.",
      "Wrong revenue account (706 instead of 707): mis-allocated turnover, distorted analytics.",
      "Item deleted while still referenced in past invoices: wording preserved on old ones but audit issue.",
      "Prices not updated for 2 years: eroded margin. Schedule an annual review.",
    ],
    externalLinks: [
      { label: "MRA — VAT Schedules 1 and 2", url: "https://www.mra.mu/download/VATAct.pdf", description: "Official exempt and zero-rated lists." },
    ],
    tips: [
      "Enable <em>fuzzy search</em>: typing <em>consulting</em> finds <em>CONS-DEV Development consulting</em>.",
      "For groups: group-wide catalogue + per-company overrides (useful for multi-country consultancies).",
      "Multinationals: customs <em>HS Code</em> for exported goods, automatic per-country breakdown.",
      "Telegram bot: <em>\"invoice acme 3 days CONS-DEV\"</em> → uses the catalogue tariff directly.",
    ],
  },

  // ========================================================================
  // CLIENT — BANK (multi-account director view)
  // ========================================================================
  '/client/banque': {
    title: 'Bank — Multi-account overview',
    audience: 'client',
    intro:
      "Multi-bank cash dashboard: consolidated real-time balances (MCB, SBM, AfrAsia, ABC, MauBank, Bank One), threshold alerts, outgoing transfers pending approval, 30/60/90-day cash projections. Different from <em>/comptable/banque</em> (which handles BNQ entries, journal and letterage) and from <em>/client/rapprochement</em> (matching status). Here you steer <b>cash</b> across all your accounts on one screen.",
    steps: [
      { title: "1. Consolidated view", body: "Cards per account: bank name, masked IBAN, currency, current scraped balance, 30-day average balance, T-1 variation. Consolidated total in MUR (auto-conversion for USD/EUR accounts at daily rate)." },
      { title: "2. Threshold alerts", body: "Configure per account: low threshold (e.g. < MUR 100,000 → Telegram push), high threshold (> MUR 5m → suggest term deposit). Automatic opportunity assessment." },
      { title: "3. Pending transfers", body: "List of transfers prepared by the accountant, awaiting Management validation (two-step workflow). Approve/reject in one click with MFA (Telegram OTP)." },
      { title: "4. 30/60/90-day projection", body: "Lexora projects the future balance by integrating: customer invoices due (expected collections), supplier invoices (payments), salaries (T+25 or month-end), MRA deadlines (T+20). Green if positive, red if going overdraft." },
      { title: "5. Per-account drill", body: "Click a card → latest transactions, plain text (in/out), with letterage already done by the accountant. You do NOT see entries, just the movement." },
      { title: "6. Banker export", body: "Multi-account summary PDF for a banker meeting (overdraft, credit, deposit negotiation). Professional layout." },
      { title: "7. Multi-currency", body: "Display in MUR + source currency. FX sensitivity: if EUR drops 5%, estimated impact on group cash." },
    ],
    pitfalls: [
      "Confusing scraped balance (bank) and accounting balance (Lexora): the scraped one is the truth, the accounting one may lag.",
      "Ignoring a low-threshold alert: unnegotiated overdraft = 1.5% / month interest.",
      "Not enabling dual approval for transfers above threshold: fraud risk (real and frequent: fake director email).",
      "Forgetting pending tax withholdings (PAYE, CSG, NSF, VAT) in the projection: false sense of cash.",
    ],
    externalLinks: [
      { label: "MCB Internet Banking", url: "https://ibank.mcb.mu" },
      { label: "SBM Internet Banking", url: "https://internetbanking.sbmgroup.mu" },
      { label: "Bank of Mauritius — Statistics", url: "https://www.bom.mu" },
    ],
    tips: [
      "Enable the <em>group position</em> if you steer several companies: consolidated cash at holding level.",
      "Telegram bot: <em>\"cash brief\"</em> → multi-account summary sent at 09:00 every day.",
      "For multinationals: cross-country cash aggregation with USD conversion for group IFRS reporting.",
      "Quick link to <b>/comptable/rapprochement</b> if you see an abnormal gap — direct your accountant to investigate.",
    ],
  },

  // ========================================================================
  // CLIENT — VAT (director view)
  // ========================================================================
  '/client/tva': {
    title: 'VAT — Director view',
    audience: 'client',
    intro:
      "Director-focused VAT steering view: how much you owe this month, return status (drafted / submitted / paid), MRA deadline, historical comparison. Not the accounting mechanics (Schedule A/B computation, VAT3 generation, VAT-collected/deductible entries — that lives in <em>/comptable/tva</em>), just the essentials to decide and earmark cash. Legal framework: <b>VAT Act 1998</b>, standard rate <b>15%</b>, deadline <b>20th of the following month</b>.",
    steps: [
      { title: "1. Key figure of the month", body: "VAT payable balance (VAT collected − VAT deductible). Green if < MUR 100k, orange < MUR 500k, red > MUR 500k. Earmark cash accordingly." },
      { title: "2. Return status", body: "<b>Draft</b> (accountant working), <b>Ready</b> (Management to validate), <b>Submitted</b> (MRA acknowledgement), <b>Paid</b> (transfer done). Each transition triggers Telegram notifications." },
      { title: "3. MRA deadline", body: "Cut-off date: 20th of the following month for VAT3 (monthly if turnover > MUR 10m/year), 20th of the month after end-of-quarter for VAT4. Countdown visible.", warning: "Late = <b>5% of the amount due + 0.5% per month interest</b>. On MUR 1m of VAT, that is MUR 50,000 instant penalty." },
      { title: "4. 12-month trend", body: "Chart of VAT collected vs deductible vs monthly balance. Detects anomalies: unusual peak (big contract?), suspicious dip (forgotten invoicing?)." },
      { title: "5. Historical comparison", body: "Current month vs same month Y-1. If gap > 30%, Lexora alerts (real activity change or capture error?)." },
      { title: "6. One-click validation", body: "If you trust your accountant: <b>Validate and submit</b> button with Telegram MFA. Playwright robot files on eservices.mra.mu, payment is on you." },
      { title: "7. Payment tracking", body: "Once submitted, the app shows transfer details (TAN reference + period). Mark paid once transfer executed. Automatic matching button against bank statement." },
    ],
    pitfalls: [
      "Validating without checking the summary: you are signing your accountant's error. At least scan the totals and the VAT/turnover ratio.",
      "Forgetting to pay even after submission: penalties accrue anyway. Submission is not payment.",
      "Earmarking too little cash for the 20th: overdraft on D-day = interest + damaged image with the bank.",
      "Ignoring the trend: a balance climbing steadily can signal lost deductible VAT (supplier invoices not captured).",
    ],
    externalLinks: [
      { label: "MRA — eServices portal", url: "https://eservices.mra.mu", description: "Track submission acknowledgement and pay." },
      { label: "VAT Act 1998", url: "https://www.mra.mu/download/VATAct.pdf", description: "Reference law." },
    ],
    tips: [
      "Enable T-7 / T-3 / T-1 Telegram alerts: reminder with amount and direct link to the page.",
      "For groups: VAT dashboard across companies on one screen, consolidated payable total.",
      "Multinationals: USD/EUR conversion for group reporting + FX sensitivity.",
      "If your VAT balance is structurally in credit (pure export), claim annual refund via VAT22 — discuss with your accountant.",
    ],
  },

  // ========================================================================
  // CLIENT — INCOME TAX RETURN FORM 3
  // ========================================================================
  '/client/it-form3': {
    title: 'Income Tax Return Form 3 — Individuals',
    audience: 'client',
    intro:
      "The <b>Income Tax Return Form 3</b> (IT Form 3) is the annual obligation of Mauritian tax-resident individuals under <b>Section 95 Income Tax Act 1995 (ITA)</b> and the <b>Income Tax (Returns) Regulations</b>. Concerns directors/shareholders/employees paid by the company: declare worldwide income, deductions (mortgage interest, medical, education, EDB), compute tax due and the balance after PAYE already withheld. Deadline: <b>30 September</b> of the year following the fiscal year (Jul-Jun) or <b>15 October</b> for electronic filing.",
    steps: [
      { title: "1. Check your status", body: "Mauritian tax resident if you spend <b>≥ 183 days/year</b> in Mauritius OR <b>≥ 270 days cumulated over 3 years</b> (ITA s.73). Non-resident: only Mauritian-source income. Lexora computes automatically from declared travel." },
      { title: "2. Enter your personal TAN", body: "Personal Tax Account Number (different from the company TAN): 1 letter + 9 digits, obtained on eservices.mra.mu at first individual registration. No TAN means no filing.", warning: "Do not confuse personal TAN and company TAN. Mistake = automatic MRA rejection + MUR 5,000 penalty." },
      { title: "3. Income summary", body: "<b>Salaries</b> (auto from your Lexora payroll if you are an employee of the company), <b>dividends</b> (exempt in Mauritius since 2007 for residents — Section 7), <b>bank interest</b> (exempt < MUR 200,000/year), <b>rental income</b> net, <b>foreign income</b> (remitted or not — ITA s.74)." },
      { title: "4. Income Exemption Threshold (IET) deductions", body: "Category A single without dependant: <b>MUR 325,000</b>. B (1 dependant): 435,000. C (2): 535,000. D (3): 600,000. E (4+): 660,000. F (retired): 380,000. Lexora computes per your family situation." },
      { title: "5. Specific deductions", body: "<b>Mortgage interest</b> main residence (cap MUR 300,000/year), <b>medical expenses</b> (cap MUR 20,000/dependant), <b>tuition fees</b> (up to MUR 135,000/child for tertiary), <b>donations</b> to MRA-approved bodies, <b>private pension contributions</b> (up to MUR 50,000)." },
      { title: "6. Applicable PAYE scale", body: "<b>Solidarity Levy</b> 25% if income > MUR 3m/year. 2025-2026 main scale: 0% up to MUR 390,000, 2% up to 430,000, 4% up to 470,000, 6% up to 530,000, 8% up to 645,000, 10% up to 800,000, 12% up to 980,000, 14% up to 1.16m, 16% up to 1.52m, 18% up to 1.88m, <b>20%</b> above." },
      { title: "7. PAYE already withheld", body: "Pull the total PAYE withheld by the employer (info on your Statement of Emoluments delivered by the company before 15 August). Lexora pre-fills automatically if you are an employee in the tenant." },
      { title: "8. Balance to pay or refund", body: "Balance = Tax due − PAYE withheld − APS (Advance Payment System if applicable). If positive: pay before 30 September (or 15 October for electronic filing). If negative: MRA refund within 60 days." },
      { title: "9. File on eservices.mra.mu", body: "Login with personal TAN + password. <b>Income Tax Return</b> module → <b>Form 3</b>. Upload the PDF generated by Lexora. Record the MRA reference, that is your legal acknowledgement." },
      { title: "10. Archive and keep 5 years", body: "Mandatory <b>5-year</b> retention (ITA s.96). Lexora archives automatically with time stamp. On audit, produce in one click." },
    ],
    pitfalls: [
      "Omitting foreign income (interest, UK dividends, France property): MRA audit = reassessment + 50% penalty + interest. Mauritius exchanges via CRS with 110+ countries.",
      "Wrong IET category (forgetting a dependant child or counting an adult): tax difference up to MUR 300,000.",
      "Late filing: penalty <b>MUR 2,000</b> + 5% of balance + 0.5% monthly interest (ITA s.122).",
      "Confusing filing with payment: filing is not enough, pay before the deadline.",
      "Under-declaring income if you are a director paid via dividends <em>dressed up</em> as current-account repayments: reclassification + Solidarity Levy.",
      "Forgetting APS (Advance Payment) if income > MUR 4m/year: 4 mandatory quarterly instalments.",
    ],
    externalLinks: [
      { label: "Income Tax Act 1995", url: "https://mauritiusassembly.govmu.org/Documents/Acts/IncomeTaxAct1995.pdf", description: "Section 95 onwards." },
      { label: "Income Tax (Returns) Regulations", url: "https://www.mra.mu/download/IncomeTaxReturnsRegulations.pdf", description: "Practical filing rules." },
      { label: "MRA — Form 3 Guide", url: "https://www.mra.mu/index.php/individual/income-tax-return", description: "Official individual guide." },
      { label: "MRA — Income Exemption Threshold (IET)", url: "https://www.mra.mu/index.php/taxes-duties/individual/ind-income-exemption-threshold", description: "Categories A to F updated yearly." },
      { label: "ROC — Companies Act 2001", url: "https://mauritiusassembly.govmu.org/Documents/Acts/CompaniesAct2001.pdf", description: "For directors: transparency obligations." },
    ],
    tips: [
      "Telegram bot: <em>\"prepare my Form 3\"</em> → Lexora drafts it, you validate from mobile.",
      "For group directors: multi-tenant supported, a single Form 3 consolidates all your declared Mauritius income.",
      "Multinationals: if you are tax resident in Mauritius with foreign sources, check the <b>bilateral tax treaties</b> (Mauritius has > 45) to avoid double taxation.",
      "<b>Lex Tax Optimiser</b> module (premium): simulate your tax for 3 scenarios (high salary vs salary + dividend vs salary + reimbursed expenses), pick the most legally optimal.",
    ],
  },

  // ========================================================================
  // HR — LEGAL
  // ========================================================================
  '/rh/juridique': {
    title: 'HR legal — Contracts, terminations, litigation',
    audience: 'comptable',
    intro:
      "HR legal hub: generation and tracking of employment contracts (CDI, CDD, internship, freelance), amendments (salary, role, working time changes), termination procedures (resignation, disciplinary/economic dismissal, mutual agreement, end of CDD), Industrial Court litigation. All compliant with the <b>Workers' Rights Act 2019</b> and Mauritius Supreme Court case law. Essential to avoid reclassifications, damages (up to 24 months' salary) and Ministry of Labour fines.",
    steps: [
      { title: "1. WRA-compliant initial contract", body: "CDI / CDD / internship / freelance templates pre-loaded with mandatory <b>WRA Section 5</b> clauses: parties' identity, start date, place of work, role, weekly duration, pay, probation period, notice, jurisdiction." },
      { title: "2. Amendments", body: "Any substantial change (salary, role, working time, place) requires a signed amendment. Without employee consent the employer cannot impose (save exceptional WRA Article 38). Lexora generates, tracks signature, archives." },
      { title: "3. Disciplinary procedure (WRA Section 64-69)", body: "Misconduct → <b>written summons</b> 24h to 7 days before hearing → <b>preliminary hearing</b> with representation allowed → <b>written reasoned</b> sanction notification. Sanctions: warning, reprimand, suspension, dismissal. Lexora steers each step with time-stamped seals.", warning: "Skipping a step or breaching deadlines = systematic unfair dismissal at court. Cost: 6 to 24 months' salary in damages." },
      { title: "4. Economic dismissal (WRA Section 72A)", body: "Justification: real economic difficulty (declining turnover, restructuring, closure). Procedure: <b>Ministry of Labour notification 30 days before</b>, redeployment search, order of dismissals (seniority, family burden, performance). Severance + notice." },
      { title: "5. Mutual agreement termination", body: "Formalised agreement: written convention, indemnity ≥ statutory severance, Ministry of Labour endorsement. Avoids litigation. Lexora generates a compliant convention." },
      { title: "6. Industrial Court litigation", body: "On summons: documents centralised (contract, amendments, payroll, sanctions, correspondence), file built, lawyer chosen (integrated directory), hearings tracked, IAS 37 IFRS provisioning of the dispute." },
      { title: "7. WRA updates", body: "Lexora tracks WRA amendments (2022, 2024) and flags contracts to update: e.g. Vacation Leave 22 days after 5 years, EOY bonus inclusive of allowances, etc." },
      { title: "8. Annual legal audit", body: "<b>HR audit</b> button: Lexora checks each employee file for WRA compliance. PDF report with gaps to fix (missing clause, unreasoned sanction, etc.)." },
    ],
    pitfalls: [
      "Verbal or SMS dismissal: void by law, reclassification + 12-month-minimum salary damages.",
      "Disciplinary procedure without preliminary hearing: systematic unfair dismissal.",
      "CDD renewed > 2 times or > 24 cumulated months (WRA Section 19): automatic reclassification as CDI.",
      "Non-notification to Ministry of Labour for collective dismissal > 10: fine up to MUR 100,000 + nullity.",
      "Failing to provision a likely dispute (IAS 37): misleading balance sheet, auditor qualification.",
      "Non-compete clause without financial consideration: invalid since the 2019 Supreme Court ruling.",
    ],
    externalLinks: [
      { label: "Workers' Rights Act 2019 (full text)", url: "https://mauritiusassembly.govmu.org/Documents/Acts/WRA2019.pdf", description: "Reference text." },
      { label: "Ministry of Labour Mauritius", url: "https://labour.govmu.org", description: "Dismissal notifications, mutual agreements, advice." },
      { label: "Industrial Court Mauritius", url: "https://industrialcourt.govmu.org", description: "Court with jurisdiction over employment disputes." },
      { label: "Bar Council Mauritius", url: "https://barcouncil.mu", description: "Directory of employment lawyers." },
      { label: "Mauritius Employers' Federation", url: "https://mef.mu", description: "Employer advice, templates, case law." },
    ],
    tips: [
      "Enable the <em>quarterly legal review</em>: Lexora flags CDDs ending, sanctions to archive, disputes to provision.",
      "For groups: harmonise HR legal rules across companies via headquarter-approved templates.",
      "Multinationals: <em>employment law by country</em> comparison engine (Mauritius WRA, France code du travail, UK ERA 1996) for international mobility.",
      "Telegram bot: <em>\"HR legal audit\"</em> → summary PDF, auto-escalation to Management on major gaps.",
    ],
  },

  // ========================================================================
  // HR — EMPLOYEE GROUPS
  // ========================================================================
  '/rh/groupes': {
    title: 'Employee groups — Teams, departments, scope',
    audience: 'all',
    intro:
      "Hierarchical organisation of employees into groups: <b>departments</b> (Finance, Sales, Production, IT, HR), <b>teams</b> (sub-departments), <b>manager scope</b> (who sees/manages whom in Lexora and Telegram), <b>validation hierarchy</b> (who approves what: leave, expenses, transfers). Foundation for clean delegation, salary-data confidentiality (WRA Section 51: payroll confidentiality) and scalability (> 50 employees).",
    steps: [
      { title: "1. Create a department", body: "<b>New department</b>. Name, code (FIN, SAL, IT, etc.), head (existing employee), optional annual budget for analytical tracking. Linked cost centre automatically (analytical accounting)." },
      { title: "2. Create a team (sub-group)", body: "Within the department: <b>New team</b>. Name, team lead, scope (customers, products, geography). 3-level hierarchy supported: company → department → team → employee." },
      { title: "3. Assign employees", body: "Drag-and-drop or multi-select. One employee = 1 main department + 0-N secondary teams (matrix possible). Assignment effective date tracked." },
      { title: "4. Configure manager scope", body: "For each manager: <b>which employees do they see?</b> (direct team, descendants, all). <b>What can they approve?</b> (leave ≤ 5 days, expenses ≤ MUR 10,000, payroll no). Fine granularity." },
      { title: "5. Validation hierarchy", body: "Workflow per type: leave > 5 days → team lead → HR Director. Expenses > MUR 50,000 → manager → CFO. Transfer > MUR 500,000 → accountant → Management → Telegram MFA. Each step tracked." },
      { title: "6. Salary confidentiality", body: "WRA Section 51: pay is confidential. Lexora masks by default other employees' salary to any manager (except HR Director and Management). Case-by-case activation (proven business need).", warning: "A pay confidentiality breach exposes the employer to damages. Never over-assign salary visibility rights." },
      { title: "7. Internal mobility", body: "Department / team change without breaking seniority. Auto-generated amendment (WRA Section 38 if substantial change requires employee consent). History preserved for severance calculation." },
      { title: "8. Group reporting", body: "HR KPIs broken down per department/team: headcount, payroll mass, turnover, absenteeism, OT rate. Cross-team comparisons to spot risk areas." },
    ],
    pitfalls: [
      "Manager with too broad a scope (sees entire company): salary info leak, HR conflict, resignations.",
      "Validation hierarchy not configured: everything bubbles up to the CFO who becomes a bottleneck.",
      "Backdated assignment without amendment: employee challenge (unconsented substantial change).",
      "Deleting an active department without reassignment: employees with no manager, payroll suspended.",
      "Forgetting to link the department to an analytical cost centre: margin analysis by BU impossible.",
    ],
    externalLinks: [
      { label: "Workers' Rights Act 2019 — Sections 38 and 51", url: "https://mauritiusassembly.govmu.org/Documents/Acts/WRA2019.pdf", description: "Substantial change and pay confidentiality." },
    ],
    tips: [
      "Enable the <em>visual org chart</em> (Settings → Display): clickable hierarchical trombinoscope.",
      "For groups: matrix organisation across companies (one employee can sit in several group entities with different contracts).",
      "Multinationals: <em>cross-border</em> groups with local rules (Mauritius WRA / France code du travail / UK ERA) auto-applied by location.",
      "Telegram bot: <em>/group FIN</em> → list members and today's status (present, on leave, on mission).",
    ],
  },

  // ========================================================================
  // HR — GEOLOCATION
  // ========================================================================
  '/rh/geolocalisation': {
    title: 'Field employee geolocation',
    audience: 'all',
    intro:
      "Real-time GPS tracking of field employees (construction, delivery, security, technical services, sales reps). Geolocated clock-ins (entry/exit with verified coordinates), trip tracking for kilometre reimbursement, alerts on exit from authorised zone. Compliance with <b>Mauritius Data Protection Act 2017</b>: explicit employee consent + limited purpose + access right.",
    steps: [
      { title: "1. Employee consent (mandatory)", body: "Consent form electronically signed by each concerned employee, compliant with the <b>Data Protection Act 2017</b>. Specifies: purpose (clock-in/safety), data collected (GPS, speed), retention (12 months max), access and rectification rights. No consent = unlawful collection.", warning: "Geolocating without consent = fine up to MUR 200,000 + employee damages. Lexora blocks activation without archived consent." },
      { title: "2. Configure authorised zones", body: "Geofencing: draw legitimate zones on map (site, agency, route perimeter). Exit zone → manager alert (phone out of coverage, emergency?)." },
      { title: "3. Mobile employee app", body: "Download <b>Lexora Field</b> (Android/iOS). Login with Telegram code. Clock in/out = one button, automatic GPS. The app does NOT track continuously (only at clock-ins + validated trips)." },
      { title: "4. Geolocated clock-ins", body: "Entry: selfie + GPS + time stamp. Exit same. Anti-fraud: if GPS spoofing detected (speed/altitude inconsistency), clock-in refused." },
      { title: "5. Professional trips", body: "The employee starts a trip in the app, drives, ends at destination. Lexora computes km, duration, average speed. Auto-link with <b>/rh/trajets-km</b> for reimbursement." },
      { title: "6. Manager dashboard", body: "Real-time map of active employees (with consent), trip history, validated geolocated clock-ins rate. Filters by team, zone, period." },
      { title: "7. Retention and purge", body: "GPS data kept max 12 months, then automatic anonymisation. Aggregated statistics (total km per month) kept without personal data." },
      { title: "8. Employee rights", body: "Any employee can request: access to their data, rectification, deletion, export. Lexora generates a full PDF in one click (GDPR-like compliance)." },
    ],
    pitfalls: [
      "Activating without written consent: serious DPA 2017 breach, MUR 200,000 fine + DPC (Data Protection Commissioner) complaint.",
      "Geolocating a sedentary employee (no business justification): disproportionate, DPC sanction.",
      "Retention beyond 12 months without justification: DPA breach, automatic purge.",
      "Sharing location with unauthorised employees: personal data leak.",
      "Undetected GPS spoofing: fake clock-ins, payroll fraud (unworked hours)."
    ],
    externalLinks: [
      { label: "Mauritius Data Protection Act 2017", url: "https://mauritiusassembly.govmu.org/Documents/Acts/DPA2017.pdf", description: "Legal data-protection framework." },
      { label: "Data Protection Office Mauritius", url: "https://dataprotection.govmu.org", description: "Supervisory authority, guidance." },
      { label: "ICTA Mauritius", url: "https://www.icta.mu", description: "Telecoms and digital regulator." },
    ],
    tips: [
      "Use the <em>aggregated view</em> (activity-zone heatmap) rather than individual where possible: less intrusive, better accepted.",
      "For construction/security groups: per-site geofencing with automatic team rotation.",
      "Multinationals: EU GDPR compliance if employees are temporarily expatriated in Europe.",
      "Telegram bot: <em>/field-team</em> → real-time status and zone-exit alerts.",
    ],
  },

  // ========================================================================
  // HR — KM ALLOWANCE (scale)
  // ========================================================================
  '/rh/frais-km': {
    title: 'Kilometre scale — Transport allowances',
    audience: 'comptable',
    intro:
      "Configure the kilometre reimbursement scale applied to employees' professional trips (customer visits, sites, missions). Different from <em>/rh/trajets-km</em> which is the trip declaration screen — here you configure the <b>calculation rules</b>. In Mauritius there is no statutory scale: the employer sets policy (rate per km, caps, vehicle types), often inspired by the MRA scale for company cars or market average rates.",
    steps: [
      { title: "1. Define vehicle categories", body: "Typically: <b>Motorcycle/scooter</b>, <b>Car < 1300cc</b>, <b>Car 1300-2000cc</b>, <b>Car > 2000cc</b>, <b>4x4/utility</b>. Each category has a different MUR/km rate reflecting real cost (fuel + wear + insurance)." },
      { title: "2. Enter MUR/km rates", body: "2026 Mauritius indicative market: motorcycle 5-7 MUR/km, small car 12-15 MUR/km, mid car 18-22 MUR/km, 4x4 25-30 MUR/km. You can modulate per policy (generous or strict)." },
      { title: "3. Monthly cap per employee", body: "Optional cap to avoid abuse: e.g. 10,000 km/month max or MUR 50,000/month max. Beyond, the excess is not reimbursed (or needs Management approval)." },
      { title: "4. Home-to-work commute", body: "In Mauritius, the home-to-work commute is NOT a professional trip and is NOT reimbursable per km (unless explicit employer agreement). Lexora auto-excludes unless configured otherwise." },
      { title: "5. Required evidence", body: "<b>Mandatory evidence</b> policy above a threshold (e.g. > MUR 5,000/month): toll receipts, fuel invoices, signed mission orders. Otherwise refused. Keep 7 years (MRA audit)." },
      { title: "6. Tax treatment", body: "Properly evidenced km allowances = <b>deductible expense</b> company (ITA Section 19) + <b>tax-free</b> for employee (no PAYE/CSG/NSF). If flat-rate without evidence = <b>reclassified as salary</b> by MRA, fully taxed.", warning: "Unsupported flat-rate km allowance > MUR 2,500/month = benefit in kind reclassified, MRA reassessment + 50% penalty." },
      { title: "7. Accounting link", body: "Expense account: <b>6251 Staff km expenses</b> or <b>6256 Travel allowances</b>. Analytical cost centre per mission/project." },
      { title: "8. Annual review", body: "Recommendation: review rates annually based on fuel inflation (MRA STC), rule changes, employee feedback. Lexora alerts if rates not reviewed in > 18 months." },
    ],
    pitfalls: [
      "Rate economically unjustified: MRA reclassifies as disguised salary.",
      "No monthly cap: possible abuse, employees inflate mileage.",
      "Confusing professional trips and home-to-work commute: costly and fiscally risky.",
      "No evidence: MRA refuses deductibility on audit, expense not opposable.",
      "Single rate for all vehicles: unfair (4x4 costs 5x a scooter), employee pushback.",
    ],
    externalLinks: [
      { label: "Income Tax Act 1995 — Section 19", url: "https://mauritiusassembly.govmu.org/Documents/Acts/IncomeTaxAct1995.pdf", description: "Deductibility of business expenses." },
      { label: "MRA — Statement of Tax Computation Guide", url: "https://www.mra.mu/index.php/taxes-duties/corporate", description: "Deductible expense treatment." },
    ],
    tips: [
      "Compare your scale to <em>sector practices</em> (MEF publishes benchmarks).",
      "For multinationals: per-country scale (Mauritius MUR/km vs France EUR/km vs UK GBP/mile).",
      "Enable auto-calculation via geolocation (cf. <em>/rh/geolocalisation</em>): validated GPS trip = reimbursement triggered without manual entry.",
      "Telegram bot: <em>\"km scale\"</em> → the employee instantly sees what their mission will reimburse.",
    ],
  },

  // ========================================================================
  // HR — KM TRIPS (declaration)
  // ========================================================================
  '/rh/trajets-km': {
    title: 'Kilometre trips — Declaration and reimbursement',
    audience: 'all',
    intro:
      "Page where employees declare their professional trips (customer mission, site, delivery) to claim reimbursement per the scale configured in <em>/rh/frais-km</em>. Workflow: employee entry → manager validation → auto calculation → integration to payroll or expense note. Geolocation possible (via mobile app) for automatic validation. Tax compliance: evidence required for company deductibility and employee exemption.",
    steps: [
      { title: "1. Employee entry", body: "Form: date, departure, arrival (free text or embedded Google Maps), purpose (customer X, site Y), estimated km or GPS if mobile app enabled, vehicle used (per scale categories)." },
      { title: "2. Attached evidence", body: "PDF/photo: toll receipt, fuel invoice, mission order. Above the configured threshold (e.g. MUR 5,000/month), mandatory. Otherwise validation refused." },
      { title: "3. Automatic calculation", body: "Lexora applies: km × MUR/km rate (per vehicle category) − monthly cap if any. Displays amount to be validated by the manager." },
      { title: "4. Manager validation", body: "Notification (web + Telegram). Manager sees detail, approves / refuses / asks for correction. Target turnaround 48h. Beyond, auto-escalation to HR Director." },
      { title: "5. Accounting validation", body: "After the manager, the accountant checks consistency (km vs mission duration, link to a customer invoice if billable). For groups: internal rules applied." },
      { title: "6. Payment", body: "Two possible modes: (a) embedded in next month's payslip (<em>km allowance</em> line), (b) separate expense note with immediate bank transfer. Company policy choice." },
      { title: "7. Customer rebilling (if mission)", body: "If the mission is billable to the customer, Lexora suggests including km in the next customer invoice with or without margin. Direct link with the invoicing module." },
      { title: "8. Archive and audit", body: "Retention 7 years (tax-statute-of-limitation period). On MRA audit, immediate production of detail (trips + evidence) in one click." },
    ],
    pitfalls: [
      "Entering km without evidence: refused by accounting, employee unpaid, conflict.",
      "Fake trips later detected: serious disciplinary offence + company reimbursement (WRA Section 65).",
      "Forgetting to categorise the vehicle: default rate applied, reimbursement gap.",
      "Manager approving without checking: possible fraud, shared responsibility.",
      "Rebilling the customer without contractual agreement: customer dispute.",
    ],
    tips: [
      "Enable <em>Telegram entry</em>: the employee sends <em>/trip 45km customer X 1300cc</em> and the declaration is created.",
      "Link with geolocation: validated GPS trip = auto declaration, one-click manager validation.",
      "For groups: harmonised cross-company validation policy.",
      "Multinationals: local trip currency (km Mauritius in MUR, France in EUR, etc.) with auto-conversion for reporting.",
    ],
  },

  // ========================================================================
  // HR — PAYROLL EXPORTS
  // ========================================================================
  '/rh/exports/paie': {
    title: 'Payroll exports — Payslips, transfers, returns',
    audience: 'comptable',
    intro:
      "Hub to export every payroll file generated by Lexora: <b>PDF payslips</b> (employee delivery + archive), <b>bank transfer file</b> (CSV/XML SEPA-like Mauritius), <b>MRA returns</b> (PAYE/CSG/NSF/PRGF in CSV/XML), <b>accounting entries</b> (CSV in FEC or IFRS format). Different from <em>/rh/declarations-mra</em> which is the MRA submission screen — here you export raw files for external processing (bank, other system, audit). Legal framework: <b>NSF Act 1976</b>, <b>CSG Act 2021</b>, <b>WRA 2019 Section 31</b> (mandatory payslip).",
    steps: [
      { title: "1. Select the period", body: "Month, quarter or year. Multi-company if applicable (practice, group). Pre-requisite: payroll locked (otherwise figures still move)." },
      { title: "2. Individual PDF payslips", body: "Batch generation of one PDF per employee compliant with <b>WRA Section 31</b>: gross, detailed deductions (PAYE, NSF, CSG), allowances, net, employer charges, year-to-date. Auto email + archive in Documents." },
      { title: "3. Bank transfer file", body: "MCB / SBM / AfrAsia / ABC format (each bank's proprietary CSV) or SEPA-like format. For each employee: IBAN, name, net amount, reference (salary month/year). Direct upload to Internet Banking for batch execution.", warning: "Check IBANs before export: a wrong IBAN = rejected transfer and bank fees (MUR 200-500/rejection)." },
      { title: "4. PAYE MRA export", body: "Strict MRA CSV format with columns: employee NID, name, taxable gross, PAYE withheld, period. Compatible with eservices.mra.mu upload. Lexora validates format before export.", warning: "MRA deadline: <b>20th of the following month</b>. Beyond, 5% + 0.5%/month penalty (ITA Section 122)." },
      { title: "5. CSG/NSF MRA export", body: "Combined employer + employee CSV with categories A (≤ MUR 50,000) or B (> MUR 50,000). <b>NSF Act 1976</b>: cap MUR 19,700. <b>CSG Act 2021</b>: 1.5% or 3% employee + 3% or 6% employer." },
      { title: "6. PRGF export", body: "Separate CSV. Calculation: <b>4.5%</b> of total gross all employees, except FSC exemption (equivalent private pension attested)." },
      { title: "7. Accounting entries export", body: "CSV in <b>FEC</b> (Fichier des Écritures Comptables) or IFRS format for ERP integration. Accounts: 6411 gross salaries, 4310 staff net, 4311 PAYE, 4312 NSF, 4313 CSG, 4314 PRGF, 645x employer charges." },
      { title: "8. Archiving and retention", body: "All exports auto-archived in Documents with time stamp. Retention <b>10 years</b> (audit + MRA limitation, ITA Section 113). Download anytime." },
    ],
    pitfalls: [
      "Exporting before payroll lock: figures inconsistent with what you later submit.",
      "IBAN with spaces/dashes in CSV: some banks reject batch, delayed salaries (WRA dispute).",
      "Wrong CSG category (A instead of B): MRA recalculates, reassessment + penalty.",
      "Forgetting to deliver the payslip to the employee (WRA Section 31): breach, fine up to MUR 25,000 per missing payslip.",
      "CSV format not MRA-compliant (separator, UTF-8 BOM encoding): rejected on upload, fatal delay on the 20th.",
    ],
    externalLinks: [
      { label: "MRA — eServices portal", url: "https://eservices.mra.mu", description: "Upload PAYE/CSG/NSF files." },
      { label: "NSF Act 1976", url: "https://mauritiusassembly.govmu.org/Documents/Acts/NSFAct1976.pdf", description: "National Savings Fund act." },
      { label: "Social Contributions and Social Benefits Act 2021 (CSG)", url: "https://mauritiusassembly.govmu.org/Documents/Acts/CSGAct2021.pdf", description: "CSG act replacing NPF." },
      { label: "Workers' Rights Act 2019 — Section 31", url: "https://mauritiusassembly.govmu.org/Documents/Acts/WRA2019.pdf", description: "Mandatory payslip." },
    ],
    tips: [
      "Enable payslip <em>electronic signing</em> (employee + employer): opposable in dispute.",
      "For groups: consolidated multi-company export pack in a single ZIP.",
      "Multinationals: per-country exports (DSN France, FPS UK, ATO Single Touch Payroll Australia) with auto-mapping engine.",
      "Telegram bot: <em>\"payroll exports May\"</em> → all files generated and sent as Telegram attachments in 30 seconds.",
    ],
  },

  // ========================================================================
  // HR — PAYROLL VARIABLES IMPORT
  // ========================================================================
  '/rh/import-paie': {
    title: 'Payroll variables import — Bulk Excel',
    audience: 'comptable',
    intro:
      "Bulk import of monthly payroll variables: exceptional bonuses, overtime not captured via clock-ins, unjustified absences, specific deductions, allowances. Major time-saver for companies > 30 employees or those with many variable elements (commission-based sales, construction OT, hospitality service charge). CSV/XLSX format, pre-import validation, direct integration to the month's payroll calculation.",
    steps: [
      { title: "1. Download the template", body: "<b>Excel template</b> button. Columns: employee code (or NID), variable code (BONUS, OT15, ABS, DED, ALLOW), label, MUR amount or hours, effective date. One line = one variable." },
      { title: "2. Fill the file", body: "Capture from Excel or export from your clock-in / commission / KPI tool. You can mix variable types in a single file. Multiple lines per employee OK." },
      { title: "3. Upload and pre-validation", body: "Drag-and-drop the file. Lexora validates: existing employee codes, known variable codes, numeric formats OK, duplicates detected. Errors listed line by line." },
      { title: "4. Impact preview", body: "Before integration: per-employee summary with gross before / variables / gross after. You see total payroll-mass impact. Anomalies detected (variable > 200% salary = check)." },
      { title: "5. Validate or correct", body: "Edit directly in Lexora (edit mode) or re-upload the corrected file. Lexora keeps attempt history for audit." },
      { title: "6. Integration to payroll", body: "<b>Integrate</b> button. Variables feed the month's payslip (with PAYE, NSF, CSG, PRGF auto-recomputed on the new base). Visible immediately in <em>/rh/paie</em>.", warning: "Once integrated, change only by reversal (new negative line). No direct delete to preserve audit trail." },
      { title: "7. Common variable codes", body: "<b>BONUS</b> exceptional bonus, <b>OT15</b> overtime × 1.5, <b>OT20</b> × 2 (Sunday/holiday), <b>ABS</b> unpaid absence, <b>DED</b> deduction (advance, loan), <b>ALLOW</b> allowance (transport, meal), <b>COMM</b> commission, <b>PERF</b> performance bonus." },
      { title: "8. Archive", body: "Source file + import log archived in Documents with time stamp. Retention 10 years (MRA audit / employee dispute)." },
    ],
    pitfalls: [
      "Wrong employee code (wrong NID): line ignored, variable unpaid, conflict with employee.",
      "Amount in EUR or USD not converted: huge over/under-payment. Lexora flags if > 200% of base salary.",
      "Importing a file twice: duplicates, overpayment. Lexora detects file hash and blocks.",
      "Effective date out of period: variable rejected (period closed).",
      "Confusing OT15 (1.5×) and OT20 (2×): recurrent error, check variable code.",
    ],
    tips: [
      "Build custom templates per context (commission month vs annual bonus month).",
      "For groups: multi-company import in a single file with <em>company</em> column.",
      "Multinationals: currency per line (MUR, USD, EUR) with auto-conversion at daily rate.",
      "Telegram bot: <em>\"payroll variables May\"</em> → import status, anomalies to correct, direct link.",
    ],
  },

  // ========================================================================
  // HR — PAYROLL HISTORY
  // ========================================================================
  '/rh/historique-paie': {
    title: 'Payroll history — Payslip lookup',
    audience: 'all',
    intro:
      "Lookup and reprint of historical payslips: by employee, by period, by type (regular, EOY, severance, prorata exit). Different from <em>/rh/paie</em> which is the current-month entry/validation screen — here you search the archives. Mandatory retention <b>10 years</b> (WRA Section 31 + ITA Section 96). Essential to: reconstruct an employee's career, deliver attestations, MRA audit, Industrial Court litigation, severance calculation (12-month average salary).",
    steps: [
      { title: "1. Search by employee", body: "Employee selector (active or archived). List of all their payslips newest to oldest. Indicators: locked, paid, modified post-payment (if applicable)." },
      { title: "2. Search by period", body: "Filter by year / month / quarter. All payslips of a given month on one screen (useful for audit or employee comparison)." },
      { title: "3. PDF reprint", body: "Click a payslip → PDF identical to original (mention <em>duplicate</em> if reprinted). Time stamp and electronic signature preserved.", warning: "No edit of a historical payslip. To fix: book a reversal in the current month (regularisation)." },
      { title: "4. Annual Statement of Emoluments", body: "Auto generation every August for fiscal year Jul-Jun: per-employee annual summary (gross, PAYE withheld, NSF, CSG) to deliver to employees for their personal Income Tax Return Form 3.", warning: "Statutory deadline: <b>15 August</b> each year (ITA Section 100). Beyond: MUR 5,000 fine per missing employee." },
      { title: "5. On-demand attestations", body: "One-click generation: employer attestation, certificate of employment (departure), salary attestation (bank, lease, visa). WRA + Civil Code compliant templates." },
      { title: "6. 12-month average salary calculation", body: "For severance (WRA Section 70) or indemnity: Lexora computes the gross average over the last 12 months (including allowances, regular bonuses, OT). Legally opposable basis." },
      { title: "7. Bulk audit export", body: "Multi-employee / multi-period selection → ZIP of all PDFs. Format expected by external auditors (PwC, KPMG, EY, BDO) or MRA on audit." },
      { title: "8. Advanced search", body: "Filters: amount > X, bonuses > X, OT > X hours, employees > 5 years' seniority. Detect historical anomalies (internal HR audit)." },
    ],
    pitfalls: [
      "Deleting a historical payslip: NEVER. MRA audit requires 10-year preservation (ITA Section 96).",
      "Not generating Statement of Emoluments before 15 August: ITA breach, fines per employee.",
      "Computing the 12-month average on base salary only (without allowances): under-estimated severance, likely dispute.",
      "Reprinting without <em>duplicate</em> mark: possible confusion with original, risk of double presentation.",
      "Not keeping import variables (source Excel): unable to justify an amount on audit.",
    ],
    externalLinks: [
      { label: "Workers' Rights Act 2019 — Section 31", url: "https://mauritiusassembly.govmu.org/Documents/Acts/WRA2019.pdf", description: "Mandatory payslip and retention." },
      { label: "Income Tax Act 1995 — Sections 96 and 100", url: "https://mauritiusassembly.govmu.org/Documents/Acts/IncomeTaxAct1995.pdf", description: "10-year retention + Statement of Emoluments." },
      { label: "MRA — Statement of Emoluments", url: "https://www.mra.mu/index.php/eservices/paye", description: "Procedure and template." },
    ],
    tips: [
      "Enable <em>employee self-service</em> to their own history: they pull their payslips without bothering HR.",
      "For groups: consolidated cross-company history in case of internal mobility (seniority preserved).",
      "Multinationals: multi-country history with currency normalisation for comparative calculations.",
      "Telegram bot: <em>\"Jean's payslips 2025\"</em> → all PDFs sent as attachments.",
    ],
  },

  // ========================================================================
  // HR — ANNOUNCEMENTS
  // ========================================================================
  '/rh/annonces': {
    title: 'Internal announcements — Employee communication',
    audience: 'all',
    intro:
      "Internal communication centre to broadcast announcements to employees: general information (new processes, events, movements), reminders (deadlines, holidays, training), celebrations (birthdays, promotions, births), changes (HR policy, org chart). Multi-channel delivery: Lexora web (sidebar badge), Telegram push, email. Fine targeting by department, team, status. For SMEs and groups, replaces the chaotic pro WhatsApp group with a centralised, traceable channel.",
    steps: [
      { title: "1. Create an announcement", body: "<b>New announcement</b>. Title, body (rich: images, links, lists), category (info / reminder / celebration / change / urgent), priority (low / medium / high / critical)." },
      { title: "2. Target the audience", body: "Whole company, OR department(s), OR team(s), OR custom list. Exclusion possible (e.g. everyone except interim). Lexora indicates the targeted headcount." },
      { title: "3. Delivery channels", body: "Tick: <b>Lexora web</b> (sidebar badge with unread counter), <b>Telegram push</b> (immediate mobile notification), <b>Email</b> (for formal announcements). Critical announcement → all channels mandatory." },
      { title: "4. Scheduling", body: "Immediate publication OR scheduled (date + time). Ideal for D-3 announcements (e.g. <em>public holiday Friday 12 March, office closed</em>). Auto expiry possible after date." },
      { title: "5. Read receipt", body: "Tick <b>Request read receipt</b> for critical announcements (policy change, safety). Each employee must click <em>Read and understood</em>. Real-time coverage reporting." },
      { title: "6. Recurring templates", body: "Save your typical announcements: <em>public holiday</em>, <em>new joiner</em>, <em>exceptional closure</em>, <em>deadline reminder</em>. Reuse in 30 seconds." },
      { title: "7. Statistics", body: "Per announcement: open rate (web + email), reactions (like, comments if enabled), read receipts. Steer internal comms with KPIs." },
      { title: "8. Archive", body: "All announcements archived with date, audience, metrics. Full-text search. Indefinite retention (corporate memory)." },
    ],
    pitfalls: [
      "Saturating employees (> 10 announcements/week): fatigue, no one reads anymore. Editorial discipline.",
      "Sensitive announcement (mass dismissal, merger) broadcast without prep: panic, departures. Always validate with Management + HR.",
      "Not requesting a read receipt on safety announcements (fire, COVID): you do not know who is informed.",
      "Targeting too broad: lack of relevance, ignored. Segment finely.",
      "Announcement without expiry: clutters the feed indefinitely, stale info on screen.",
    ],
    tips: [
      "Enable <em>recurring announcements</em>: e.g. <em>every Friday 4 pm, weekly reporting reminder</em>.",
      "For groups: cross-company announcements possible (e.g. group CEO message to all subsidiary employees).",
      "Multinationals: auto multi-language translation (FR/EN/Mandarin/Hindi per employee location).",
      "Telegram bot: <em>/announcements</em> command → summary of the last 5 active announcements on mobile.",
      "Moderate comments if you enable the feature (avoid WhatsApp-style drift).",
    ],
  },

  // ========================================================================
  // HR — GLOBAL SETTINGS
  // ========================================================================
  '/rh/parametres': {
    title: 'Global HR settings — Cross-cutting rules',
    audience: 'comptable',
    intro:
      "Configuration of cross-cutting HR rules for all companies in the tenant: <b>Mauritius public holidays</b>, <b>payroll rounding rules</b> (to nearest MUR, to nearest 5 MUR), <b>statutory NSF / CSG / PRGF rates</b>, <b>linked accounting accounts</b> per payroll line. Different from <em>/rh/societe</em> which is company-specific (BRN, payroll IBAN). Here is the common regulatory base. Compliance with <b>NSF Act 1976</b>, <b>CSG Act 2021</b>, <b>WRA 2019</b>.",
    steps: [
      { title: "1. Mauritius public holidays", body: "Official calendar maintained by Lexora: 1 Jan, 2 Jan, Thaipoosam Cavadee, Maha Shivaratri, Independence Day (12 Mar), Labour Day (1 May), Eid-ul-Fitr, Assumption (15 Aug), Ganesh Chaturthi, Diwali, Arrival of Indentured Labourers (2 Nov), Christmas, Boxing Day. You can add sector or convention-specific holidays." },
      { title: "2. Rounding rules", body: "Net pay rounded: to nearest MUR (standard), to nearest 5 MUR (transfer convenience), to nearest 10 MUR (rare). PAYE/NSF/CSG: always to nearest MUR (MRA requirement). Configure once for all." },
      { title: "3. NSF rates (NSF Act 1976)", body: "<b>Employee</b>: 1% of salary capped at <b>MUR 19,700/month</b> (so max MUR 197/month contribution). <b>Employer</b>: 2.5% of same cap (max MUR 492.5/month). Lexora updates on each revision (rare, last 2017)." },
      { title: "4. CSG rates (CSG Act 2021)", body: "<b>Category A</b> (salary ≤ MUR 50,000/month): 1.5% employee + 3% employer. <b>Category B</b> (> MUR 50,000): 3% employee + 6% employer. No cap. Auto switch A → B at threshold crossing." },
      { title: "5. PRGF rates (Portable Retirement Gratuity Fund)", body: "<b>4.5% employer</b> only (nothing employee). On total gross. Exemption if equivalent private pension certified by FSC (Section 13 PRGF Act 2019). Lexora applies exemption automatically if FSC certificate uploaded." },
      { title: "6. Linked accounting accounts", body: "Standard mapping to validate: <b>6411</b> gross salaries, <b>4310</b> net staff, <b>4311</b> PAYE payable, <b>4312</b> NSF payable, <b>4313</b> CSG payable, <b>4314</b> PRGF payable, <b>6451</b> NSF employer charges, <b>6452</b> CSG employer charges, <b>6453</b> PRGF employer charges. Adjustable per tenant chart of accounts." },
      { title: "7. Pay period", body: "Cut-off date (25th, 30/31, free). Payment day (25th, 30/31, T+5). Payslip generation lead time (1 to 5 days before payment). Mauritius standard: month-end cut-off, payment month-end or 25th." },
      { title: "8. Automatic audit", body: "Lexora alerts if a setting is stale: e.g. new NSF rate voted → red flag until re-validated. Avoids missing a legal update." },
    ],
    pitfalls: [
      "Wrong NSF/CSG rates: all payslips wrong, MRA reassessment + 50% penalty + interest.",
      "Wrong accounting mapping (4310 confused with 411): wrong balance sheet, unbalanced trial balance.",
      "Forgetting CSG A → B switch when an employee crosses MUR 50,000: under-contribution, reassessment.",
      "Holiday calendar misconfigured: wrong OT calculation (worked holidays = OT × 2, not × 1.5).",
      "Changing rates without historical audit: cannot cleanly compare Y vs Y-1.",
    ],
    externalLinks: [
      { label: "NSF Act 1976", url: "https://mauritiusassembly.govmu.org/Documents/Acts/NSFAct1976.pdf", description: "National Savings Fund act." },
      { label: "Social Contributions and Social Benefits Act 2021 (CSG)", url: "https://mauritiusassembly.govmu.org/Documents/Acts/CSGAct2021.pdf", description: "CSG act." },
      { label: "PRGF Act 2019", url: "https://mauritiusassembly.govmu.org/Documents/Acts/PRGFAct2019.pdf", description: "Portable Retirement Gratuity Fund." },
      { label: "Workers' Rights Act 2019", url: "https://mauritiusassembly.govmu.org/Documents/Acts/WRA2019.pdf", description: "Payroll and working-time rules." },
      { label: "Public Holidays Act", url: "https://mauritiusassembly.govmu.org/Documents/Acts/PublicHolidaysAct.pdf", description: "Mauritius official public holidays." },
    ],
    tips: [
      "Annual audit of settings (every July for MRA fiscal year Jul-Jun): full check in 30 minutes.",
      "For groups: shared settings at holding level + per-company overrides where a sector convention applies.",
      "Multinationals: multi-jurisdiction engine (Mauritius WRA + France code du travail + UK ERA + etc.).",
      "Enable <em>legal monitoring</em>: Lexora subscribes to MRA / Ministry of Labour publications and alerts on upcoming changes.",
    ],
  },

  // ========================================================================
  // HR — COMPANY SETTINGS
  // ========================================================================
  '/rh/societe': {
    title: 'Company — HR-specific settings',
    audience: 'comptable',
    intro:
      "HR settings tied to <b>a given company</b> in the tenant: employer <b>BRN</b>, <b>NSF employer number</b>, company <b>TAN</b>, payslip and certificate signatory, <b>payroll IBAN</b> (account from which salary transfers leave), logo and contact details shown on payslips. Different from <em>/rh/parametres</em> which covers cross-cutting rules (NSF/CSG rates, holidays). Here is the company's HR identity card, essential for MRA returns and legally opposable documents.",
    steps: [
      { title: "1. Employer identity", body: "<b>BRN</b> Business Registration Number (9 digits CBRD), <b>TAN</b> MRA (1 letter + 9 digits), <b>NSF Employer Registration Number</b> (to be obtained from NSF when the company is incorporated), incorporation date, business sector (NACE)." },
      { title: "2. Payslip signatory", body: "Identity of the signatory (HR Director, director) appearing on payslips and certificates: name, role, scanned or e-signature. Legally opposable (WRA Section 31)." },
      { title: "3. Payroll IBAN", body: "Bank account from which salary transfers leave. Different from the company general account if you separate operating and payroll cash (recommended for > 50 employees). IBAN Mauritius format: MU + 24 characters.", warning: "If payroll IBAN is wrong, all payslip transfers are rejected. Dry run recommended before first payroll." },
      { title: "4. Payslip details", body: "Shown in payslip header: legal name, address, phone, HR email, logo. WRA Section 31 compliance + true and fair view for audit." },
      { title: "5. Applicable collective bargaining agreement", body: "If the sector is subject to a CBA (hospitality, manufacturing, construction, retail): link to official text + specifics (48h working time in hospitality vs 45h standard, increased OT rates, sector bonuses)." },
      { title: "6. Internal payroll policy", body: "Internal document (PDF) attached: promotion rules, salary grid, probation periods, OT conditions (prior manager authorisation), applicable allowances. Referenced in contracts." },
      { title: "7. Company pay period", body: "If different from the tenant standard (cf. <em>/rh/parametres</em>): e.g. holding pays on the 25th, industrial subsidiary on the 5th of the following month. Override possible." },
      { title: "8. Company-specific accounts", body: "If you override default accounting accounts (e.g. different BU analytical account), configure here. Otherwise inherits tenant settings." },
    ],
    pitfalls: [
      "Wrong BRN or TAN: all monthly MRA returns rejected (PAYE, NSF, CSG, PRGF).",
      "No NSF Employer Registration Number: cannot file NSF, NSF Act 1976 breach.",
      "Non-authorised signatory (e.g. a plain manager, not a corporate officer): payslips contestable on dispute.",
      "Payroll IBAN identical to customer collection IBAN: cash confusion, risk of paying salaries with not-yet-cleared collections (overdraft).",
      "Forgetting the applicable CBA: wrong rules applied, possible dispute.",
    ],
    externalLinks: [
      { label: "CBRD — BRN verification", url: "https://onlinebrd.govmu.org", description: "Validate your BRN." },
      { label: "MRA — Employer registration", url: "https://www.mra.mu/index.php/eservices/employer-registration", description: "Obtain company TAN." },
      { label: "NSF Mauritius", url: "https://socialsecurity.govmu.org/Communities/NSF", description: "Obtain NSF Employer Registration Number." },
      { label: "Workers' Rights Act 2019", url: "https://mauritiusassembly.govmu.org/Documents/Acts/WRA2019.pdf", description: "Employer obligations." },
    ],
    tips: [
      "Payroll IBAN dry run: make a first MUR 10 transfer to an internal account to validate the pipeline.",
      "For groups: company-level settings inherited from tenant but overridable (useful for sector-specific entities).",
      "Multinationals: per-country <em>employer of record</em> profile (Mauritius, France, UK) if you employ abroad.",
      "Enable <em>annual check</em>: Lexora flags if BRN/TAN/NSF not confirmed in > 12 months.",
    ],
  },

  // ========================================================================
  // GBC — PARTIAL EXEMPTION REGIME (PER)
  // ========================================================================
  '/client/gbc-per': {
    title: 'GBC — Partial Exemption Regime (80%)',
    audience: 'all',
    intro:
      "The <b>Partial Exemption Regime</b> (PER) lets a <b>GBC</b> benefit from a <em>deemed</em> exemption of <b>80%</b> on certain categories of income. Combined with the <b>15%</b> headline rate, this brings the effective rate down to <b>3%</b> on eligible income — provided the company meets the substance (CIGA) requirements in Mauritius.",
    steps: [
      { title: "1. Income eligible for the 80%", body: "Main categories: <b>interest</b> (foreign source), <b>foreign-source dividends</b> not already exempt under the participation regime, income of a <b>leasing company</b>, profits of a foreign <b>permanent establishment</b>, income from <b>CIS / closed-end funds</b>, and collective investment scheme management income. See the Income Tax Act (Sub-Part C) and the 2nd Schedule." },
      { title: "2. Computing the effective rate", body: "Eligible income × 20% = taxable base, then × 15% = tax → <b>3% effective</b>. The remaining 80% is <em>deemed exempt</em>. Non-eligible income stays taxed at 15%." },
      { title: "3. Substance condition (CIGA)", body: "PER is granted only if the GBC demonstrates <b>adequate economic substance</b>: <em>Core Income-Generating Activities</em> carried out in Mauritius, an adequate number of qualified employees, proportionate operating expenditure. See the <em>/client/gbc-substance</em> help entry." },
      { title: "4. Exclusions", body: "No stacking: income already <b>fully exempt</b> (e.g. a dividend under the participation exemption) does not qualify for the 80%. Mauritian-source income and certain passive income outside the list are taxed at the full 15%. No foreign tax credit on top of the 80% on the same income (anti-double-dipping)." },
      { title: "5. Documentation to keep", body: "Income breakdown by category, proof of foreign source, CIGA file, computation of the 80% in the Form 3 (GBC income tax return). Annual audit is mandatory." },
    ],
    pitfalls: [
      "Applying the 80% with no substance file → MRA denies the exemption, reassessment at the full 15% plus penalties.",
      "Stacking the 80% deemed exemption AND a foreign tax credit on the same income (prohibited, anti-double-dipping).",
      "Classifying Mauritian-source income as eligible → reclassification.",
      "Failing to split income by category: without a clear breakdown the MRA may reject the whole claim.",
    ],
    externalLinks: [
      { label: "MRA — Income Tax Act", url: "https://www.mra.mu/index.php/taxes-duties/income-tax", description: "Corporate taxation and exemptions." },
      { label: "FSC — Partial Exemption Guidelines", url: "https://www.fscmauritius.org" },
      { label: "MRA — Companies (Form 3)", url: "https://www.mra.mu/index.php/eservices/corporate-tax" },
    ],
    tips: [
      "Lexora automatically splits the P&L by income category and computes the base at 3% vs 15%.",
      "Keep the CIGA file current at all times: the substance condition is tested every year, not once and for all.",
    ],
  },

  // ========================================================================
  // GBC — SUBSTANCE / CIGA
  // ========================================================================
  '/client/gbc-substance': {
    title: 'GBC — Economic Substance (CIGA)',
    audience: 'all',
    intro:
      "To keep its tax status and the <b>Partial Exemption Regime</b>, a GBC must prove genuine <b>economic substance</b> in Mauritius. The FSC checks that the <b>Core Income-Generating Activities (CIGA)</b> are effectively carried out locally, with qualified employees, local spending and governance in Mauritius.",
    steps: [
      { title: "1. CIGA carried out in Mauritius", body: "Identify and document the core income-generating activities (e.g. for a holding: decision-making over its investments; for a financing company: risk management and loan negotiation). They must be <b>directed and managed</b> from Mauritius." },
      { title: "2. Qualified resident employees", body: "An <b>adequate</b> number of qualified employees, resident in Mauritius, in line with the level of activity. Keep CVs, contracts, payslips, NSF/CSG evidence. Outsourcing to a Mauritian Management Company is allowed if supervised and documented." },
      { title: "3. Local operating expenditure (OPEX)", body: "A <b>minimum amount of expenditure</b> incurred in Mauritius, proportionate to the activity: office rent, fees of the licensed administrator, accounting, audit, local advisory." },
      { title: "4. Board of directors in Mauritius", body: "At least <b>2 resident directors</b> in Mauritius (GBC requirement). Board meetings held in Mauritius with <b>signed minutes</b>, effective quorum, strategic decisions taken locally. The place of effective management must be in Mauritius." },
      { title: "5. Documentation and filing", body: "Build an annual substance file: org chart, employment contracts, leases, board minutes, local expenditure statements. Reported in the FSC filing and kept available for the MRA." },
    ],
    pitfalls: [
      "A nominal board with no real meetings in Mauritius → place of effective management elsewhere, loss of the regime.",
      "No local employees or OPEX → the FSC may find substance inadequate.",
      "Unsupervised, undocumented outsourcing → does not count as substance.",
      "Strategic decisions taken outside Mauritius (by the parent) → tax residence reclassification.",
    ],
    externalLinks: [
      { label: "FSC Mauritius", url: "https://www.fscmauritius.org", description: "GBC substance requirements." },
      { label: "OECD — Substantial activities (BEPS Action 5)", url: "https://www.oecd.org/tax/beps/" },
    ],
    tips: [
      "Lexora offers a CIGA module: annual checklist, board minutes storage, tracking of local OPEX and headcount.",
      "Keep evidence that ≥ 2 resident directors actually sit on the board — this is the most scrutinised point.",
    ],
  },

  // ========================================================================
  // GBC — TRANSFER PRICING
  // ========================================================================
  '/client/gbc-transfer-pricing': {
    title: 'GBC — Transfer Pricing',
    audience: 'all',
    intro:
      "Transactions between related entities (intra-group) of a GBC must respect the <b>arm's length</b> principle. Mauritius aligns with <b>OECD BEPS Action 13</b>: Master File / Local File documentation and, for large groups, Country-by-Country Reporting.",
    steps: [
      { title: "1. Arm's length principle", body: "The price of an intra-group transaction must be the one <b>independent</b> parties would have agreed. Applies to intra-group loans (interest rate), management fees, royalties, re-invoicing of services, sales of goods." },
      { title: "2. Master File", body: "Group-wide overview of the MNE: organisational structure, description of activities, intangible assets, intra-group financing, consolidated financial and tax position." },
      { title: "3. Local File", body: "Detail of the Mauritian entity's transactions with related parties: amounts, nature, comparability analysis, method used and justification of the arm's length nature." },
      { title: "4. Selecting the method", body: "OECD methods: <b>CUP</b> (Comparable Uncontrolled Price — direct price comparison), <b>TNMM</b> (Transactional Net Margin Method — net margin on an indicator), <b>Cost Plus</b> (cost plus markup), Resale Price, Profit Split. Pick the most appropriate to the transaction and document why the others were rejected." },
      { title: "5. CbCR (large groups)", body: "If the consolidated MNE group exceeds <b>€750M</b> in revenue, a <b>Country-by-Country Report</b> is required (revenue, taxes, headcount by jurisdiction), exchanged between tax administrations." },
    ],
    pitfalls: [
      "Intra-group loan at 0% or off-market rate → reclassification, notional interest taxed.",
      "Management fees with no contract or proof of service rendered → deduction denied.",
      "No Local File → the MRA can disregard declared prices and rebuild the base.",
      "Method chosen without a documented comparability analysis → challengeable.",
    ],
    externalLinks: [
      { label: "OECD Transfer Pricing Guidelines", url: "https://www.oecd.org/tax/transfer-pricing/", description: "Methods and arm's length standards." },
      { label: "OECD BEPS Action 13", url: "https://www.oecd.org/tax/beps/beps-actions/action13/" },
      { label: "MRA", url: "https://www.mra.mu" },
    ],
    tips: [
      "Lexora generates a Master File / Local File template and tracks all intra-group transactions by related counterparty.",
      "For an intra-group loan, document the rate against a market benchmark (spread + base rate).",
    ],
  },

  // ========================================================================
  // GBC — BENEFICIAL OWNERSHIP (UBO)
  // ========================================================================
  '/client/gbc-ubo': {
    title: 'GBC — Beneficial Ownership (UBO)',
    audience: 'all',
    intro:
      "Every GBC must identify and declare its <b>ultimate beneficial owners</b> (UBO) — the natural persons who own or control the company. The reporting threshold is <b>25%</b> (direct or indirect ownership, or control). The register must be kept up to date and updated promptly after any change.",
    steps: [
      { title: "1. Definition of a UBO", body: "A natural person who, directly or indirectly, holds <b>≥ 25%</b> of the capital or voting rights, OR exercises control by other means (shareholders' agreement, right to appoint directors). Always trace up to a natural person (cascade)." },
      { title: "2. Indirect ownership (cascade)", body: "Compute the percentage by multiplying the ownership chains through intermediate holdings. A person owning 50% of a holding that owns 60% of the GBC controls 30% indirectly → UBO." },
      { title: "3. UBO register", body: "Maintain a register: identity, nationality, address, nature and extent of the interest, date of acquisition. Held by the company and its licensed administrator, available to the authorities." },
      { title: "4. Update within 14 days", body: "Any change of beneficial owner must be recorded within <b>14 days</b>. An outdated register is an offence." },
      { title: "5. FATCA Act / penalties", body: "Failure to keep or update the UBO register is an offence (Section 12 of the Mauritian Foreign Account Tax Compliance Act), punishable by a fine. This information also feeds the CRS/FATCA exchanges." },
    ],
    pitfalls: [
      "Declaring only direct shareholders without tracing the cascade up to natural persons.",
      "Register not updated within 14 days after a structural change.",
      "Forgetting control 'by other means' (shareholders' agreement, golden share) even below 25%.",
      "Confusing a corporate shareholder with the natural-person beneficial owner.",
    ],
    externalLinks: [
      { label: "FSC Mauritius", url: "https://www.fscmauritius.org", description: "Beneficial ownership obligations." },
      { label: "MRA — FATCA", url: "https://www.mra.mu/index.php/eservices/automatic-exchange-of-information" },
    ],
    tips: [
      "Lexora computes the UBO cascade automatically from KYC data and the ownership structure.",
      "Set up an alert: any change of shareholding triggers the 14-day reminder.",
    ],
  },

  // ========================================================================
  // GBC — PILLAR TWO (GloBE)
  // ========================================================================
  '/client/gbc-pillar-two': {
    title: 'GBC — Pillar Two / GloBE (15% Top-Up Tax)',
    audience: 'all',
    intro:
      "The OECD <b>Pillar Two</b> imposes a minimum effective tax rate of <b>15%</b> on multinational groups (MNE) with consolidated revenue above <b>€750M</b>. If a jurisdiction's ETR is below 15%, a <b>Top-Up Tax</b> is due to close the gap. A GBC at a 3% effective rate is directly concerned if it belongs to such a group.",
    steps: [
      { title: "1. Scope threshold", body: "MNE groups with annual consolidated revenue <b>≥ €750M</b> in at least 2 of the last 4 financial years (the Country-by-Country Report test). Below that, Pillar Two does not apply." },
      { title: "2. GloBE Income", body: "Start from each entity's IFRS accounting profit, then apply the <b>GloBE adjustments</b> (restating excluded dividends, gains, taxes, non-recurring items) to reach the <em>GloBE Income or Loss</em>." },
      { title: "3. Adjusted Covered Taxes", body: "Compute adjusted covered taxes: eligible current and deferred income tax, after corrections (tax credits, excluded non-covered taxes)." },
      { title: "4. ETR per jurisdiction", body: "<b>ETR = Adjusted Covered Taxes / GloBE Income</b>, aggregated <b>per jurisdiction</b> (jurisdictional blending). A Mauritian GBC at 3% pulls the Mauritius ETR below 15%." },
      { title: "5. Top-Up Tax", body: "Top-Up % = 15% − jurisdictional ETR; applied to the <em>Excess Profit</em> (GloBE Income − Substance-based Income Exclusion on payroll and tangible assets). Collected via IIR (parent), QDMTT (local) or UTPR." },
      { title: "6. Substance-based Income Exclusion (SBIE)", body: "Reduces the Top-Up Tax base by a percentage of payroll and the carrying value of tangible assets — rewarding real substance (consistent with CIGA)." },
    ],
    pitfalls: [
      "Assuming a 3% Mauritian rate has no consequence: the Top-Up Tax can be levied abroad (parent's IIR) if Mauritius has no QDMTT.",
      "Confusing accounting profit with GloBE Income (the adjustments are numerous).",
      "Forgetting jurisdictional blending and reasoning entity by entity.",
      "Neglecting the SBIE and overstating the Top-Up Tax due.",
    ],
    externalLinks: [
      { label: "OECD — Pillar Two / GloBE Rules", url: "https://www.oecd.org/tax/beps/", description: "Model Rules and administrative guidance." },
      { label: "MRA", url: "https://www.mra.mu" },
    ],
    tips: [
      "Lexora has a GloBE module: GloBE Income, Adjusted Covered Taxes and ETR per jurisdiction.",
      "Check whether the parent's jurisdiction applies an IIR: it is the one that will collect the Top-Up if Mauritius does not.",
    ],
  },

  // ========================================================================
  // GBC — CRS / FATCA
  // ========================================================================
  '/client/gbc-crs-fatca': {
    title: 'GBC — CRS / FATCA (automatic exchange)',
    audience: 'all',
    intro:
      "Mauritian financial institutions, including some GBCs, must report each year the accounts held by <b>non-residents</b> under <b>CRS</b> (OECD multi-jurisdiction standard) and <b>FATCA</b> (United States). Returns are filed in <b>XML</b> format through the MRA / FSC portals, within strict deadlines.",
    steps: [
      { title: "1. Am I a Reporting Financial Institution?", body: "Determined under the CRS/FATCA classification (Custodial Institution, Depository Institution, Investment Entity, Specified Insurance Company). Many GBC funds and investment structures are reporting <em>Investment Entities</em>." },
      { title: "2. Account due diligence", body: "Identify each account holder's tax residence (self-certification, indicia), distinguish pre-existing from new accounts, individual from entity accounts. For FATCA: identify <em>US persons</em>." },
      { title: "3. XML format", body: "Returns use the <b>CRS XML</b> schema (OECD) and the <b>FATCA XML</b> schema (IRS). Data: holder, TIN, balance, income (interest, dividends, disposal proceeds)." },
      { title: "4. Submission via the MRA portal", body: "Filed on the <b>MRA</b> automatic exchange of information portal (AEOI). FATCA then flows to the IRS via the Mauritius-USA IGA; CRS to partner jurisdictions." },
      { title: "5. Deadlines", body: "The CRS/FATCA return is annual. Respect the deadline published by the MRA each year (check the AEOI calendar — see link). A nil return may be required even with no reportable account." },
    ],
    pitfalls: [
      "Forgetting the <em>nil return</em> when required (no filing = offence even with no reportable account).",
      "Missing or unvalidated self-certifications → incomplete due diligence.",
      "XML schema error → rejection by the portal, filing deemed not made by the deadline.",
      "Confusing the holder's tax residence with nationality.",
    ],
    externalLinks: [
      { label: "MRA — Automatic Exchange of Information", url: "https://www.mra.mu/index.php/eservices/automatic-exchange-of-information", description: "AEOI portal, schemas and deadlines." },
      { label: "OECD — CRS", url: "https://www.oecd.org/tax/automatic-exchange/", description: "Common Reporting Standard." },
      { label: "FSC Mauritius", url: "https://www.fscmauritius.org" },
    ],
    tips: [
      "Lexora collects self-certifications and generates CRS/FATCA XML files compliant with the schemas in force.",
      "Check the MRA AEOI calendar every year: the deadline can vary.",
    ],
  },

  // ========================================================================
  // GBC — CONSOLIDATION IFRS 10
  // ========================================================================
  '/client/gbc-consolidation': {
    title: 'GBC — Consolidation (IFRS 10)',
    audience: 'all',
    intro:
      "A GBC holding that controls several entities must present <b>consolidated financial statements</b> under <b>IFRS 10</b>. Consolidation combines the accounts of the parent and the controlled subsidiaries as a single economic entity, after eliminating intra-group transactions.",
    steps: [
      { title: "1. The notion of control", body: "IFRS 10: an entity is consolidated if the holding <b>controls</b> it — power over the relevant activities, exposure to variable returns, and the ability to affect those returns. Control can exist without a voting majority (de facto control)." },
      { title: "2. Consolidation scope", body: "Includes all controlled subsidiaries (full consolidation). Investments under <em>significant influence</em> fall under IAS 28 (equity method), joint control under IFRS 11 — distinct from the IFRS 10 scope." },
      { title: "3. Harmonisation", body: "Align accounting policies, <b>functional currency</b> (IAS 21 translation of foreign subsidiaries: assets/liabilities at closing rate, profit at average rate, differences in OCI) and reporting dates." },
      { title: "4. Intra-group eliminations", body: "Eliminate: the parent's investment against the subsidiaries' equity (with goodwill / non-controlling interests), intra-group receivables/payables, intra-group sales and purchases, unrealised internal profits on inventories and fixed assets, intra-group dividends." },
      { title: "5. Non-controlling interests (NCI)", body: "The share of outside shareholders in subsidiaries not wholly owned: presented separately in equity and in consolidated profit." },
      { title: "6. Consolidated statements", body: "Produce the consolidated balance sheet, income statement, statement of comprehensive income (OCI), statement of changes in equity and cash flow statement, with notes. Audit is mandatory for the GBC." },
    ],
    pitfalls: [
      "Forgetting to eliminate unrealised internal profits on inventories/fixed assets → inflated consolidated profit.",
      "Wrong translation of foreign subsidiaries (closing rate vs average rate) → erroneous FX differences.",
      "Fully consolidating an entity under mere significant influence (should be equity-accounted).",
      "Mis-calculated non-controlling interests on a subsidiary not wholly owned.",
    ],
    externalLinks: [
      { label: "IFRS 10 — Consolidated Financial Statements", url: "https://www.ifrs.org/issued-standards/list-of-standards/ifrs-10-consolidated-financial-statements/" },
      { label: "IAS 21 — The Effects of Changes in Foreign Exchange Rates", url: "https://www.ifrs.org/issued-standards/list-of-standards/ias-21-the-effects-of-changes-in-foreign-exchange-rates/" },
    ],
    tips: [
      "Lexora manages several related entities and automates intra-group eliminations and IAS 21 translation.",
      "Define the group's presentation currency: foreign subsidiaries are translated into that currency.",
    ],
  },

  // ========================================================================
  // ROC — ANNUAL RETURN
  // ========================================================================
  '/client/annual-return': {
    title: 'Annual Return — Registrar of Companies',
    audience: 'all',
    intro:
      "Every Mauritian company must file an <b>Annual Return</b> each year with the <b>Registrar of Companies (CBRD)</b> under the <b>Companies Act 2001</b>. This filing confirms the company's legal information (directors, shareholders, registered office) and is distinct from the tax return (MRA) and the financial statements.",
    steps: [
      { title: "1. What the Annual Return is", body: "An official statement of the company's information at a given date: registered office, directors, secretary, shareholders and their holdings, share capital. Section 223 of the Companies Act 2001." },
      { title: "2. Who files what", body: "<b>Private companies</b> file a simplified Annual Return; some small private companies have lighter obligations. <b>Public companies</b> have extended obligations and also file audited financial statements with the Registrar." },
      { title: "3. Deadline", body: "The Annual Return is generally filed within <b>28 days</b> of the <em>annual meeting</em> (or the anniversary date depending on the company type). Check the date specific to your company on the CBRD portal." },
      { title: "4. Online filing", body: "Filed via the <b>Companies and Businesses Registration Department (CBRD)</b>, portal companies.govmu.org. Pay the <b>filing fees</b> online. Keep the acknowledgement." },
      { title: "5. Updates to report", body: "Any change of directors, registered office or secretary between two returns must be notified separately to the Registrar (dedicated forms), not only in the Annual Return." },
    ],
    pitfalls: [
      "Confusing the Annual Return (CBRD) with the tax return (MRA) or the annual accounts — these are three separate obligations.",
      "Late filing → penalties and risk of striking off the company.",
      "Forgetting to notify a change of director during the year (in addition to the return).",
      "Out-of-date shareholder information → return rejected or inconsistent with the UBO register.",
    ],
    externalLinks: [
      { label: "CBRD — Companies Registry", url: "https://companies.govmu.org", description: "Online filing of Annual Returns." },
      { label: "Companies Act 2001", url: "https://companies.govmu.org/Pages/legislations.aspx" },
      { label: "CBRD — BRN verification", url: "https://onlinebrd.govmu.org" },
    ],
    tips: [
      "Lexora reminds you of the Annual Return deadline and pre-fills the information to confirm.",
      "Check consistency between the Annual Return (shareholders) and the UBO register (beneficial owners).",
    ],
  },

  // ========================================================================
  // IFRS 16 — LEASES
  // ========================================================================
  '/client/leases': {
    title: 'IFRS 16 — Leases',
    audience: 'client',
    intro:
      "<b>IFRS 16</b> requires the lessee to recognise on the balance sheet almost all lease contracts: a <b>right-of-use asset</b> and a <b>lease liability</b>. The old operating/finance lease distinction is gone on the lessee side: nearly everything is capitalised.",
    steps: [
      { title: "1. Identify a lease", body: "A contract contains a lease if it conveys the <b>right to control the use</b> of an identified asset for a period in exchange for consideration. Distinguish it from a mere service contract." },
      { title: "2. Measure the lease liability", body: "At commencement: the <b>present value of future lease payments</b> (fixed, index-linked variable, purchase options reasonably certain, termination penalties). Discounted at the <b>interest rate implicit</b> in the lease or, failing that, the lessee's <b>incremental borrowing rate</b>." },
      { title: "3. Recognise the right-of-use asset", body: "Asset = initial lease liability + prepayments + initial direct costs + restoration costs − incentives received. Recorded under non-current assets." },
      { title: "4. Depreciation and interest expense", body: "The right-of-use asset is <b>depreciated</b> (usually straight-line over the lease term or useful life). The liability generates a <b>decreasing interest expense</b>. The total expense is front-loaded (higher early in the lease)." },
      { title: "5. Exemptions", body: "Two optional exemptions: <b>short-term</b> leases (≤ 12 months with no purchase option) and <b>low-value</b> asset leases (e.g. small equipment). Recognised as a straight-line expense, off balance sheet." },
      { title: "6. Reassessments", body: "Remeasure the liability on a lease modification, a change in index/rate, or a revision of options. Adjust the right-of-use asset accordingly." },
    ],
    pitfalls: [
      "Leaving operating leases off balance sheet as before IFRS 16 (except exemptions) → incomplete balance sheet.",
      "Using a wrong discount rate → erroneous liability and interest expense.",
      "Forgetting renewal options reasonably certain to be exercised in the lease term.",
      "Failing to remeasure the liability after an index-linked rent change.",
    ],
    externalLinks: [
      { label: "IFRS 16 — Leases", url: "https://www.ifrs.org/issued-standards/list-of-standards/ifrs-16-leases/" },
    ],
    tips: [
      "Lexora computes the discounting, the liability/interest schedule and the right-of-use asset depreciation.",
      "Document the rationale for the incremental borrowing rate used when the implicit rate is unknown.",
    ],
  },

  // ========================================================================
  // IFRS 9 — EXPECTED CREDIT LOSS (ECL)
  // ========================================================================
  '/client/ifrs9-ecl': {
    title: 'IFRS 9 — Expected Credit Loss (ECL)',
    audience: 'client',
    intro:
      "<b>IFRS 9</b> requires provisioning for <b>expected</b> credit losses (Expected Credit Loss) on a forward-looking basis, without waiting for a default to occur. The general approach relies on <b>3 stages</b> according to how credit risk has evolved since origination.",
    steps: [
      { title: "1. General 3-stage approach", body: "<b>Stage 1</b>: performing assets → 12-month ECL. <b>Stage 2</b>: significant increase in credit risk (SICR) → lifetime ECL. <b>Stage 3</b>: defaulted asset (credit-impaired) → lifetime ECL, interest computed on the net carrying amount." },
      { title: "2. SICR — Significant Increase in Credit Risk", body: "Determines the Stage 1 → Stage 2 move: rating downgrade, arrears (rebuttable presumption of SICR at <b>30 days</b> past due), deterioration of indicators. The move to default (Stage 3) is presumed at <b>90 days</b>." },
      { title: "3. PD / LGD / EAD parameters", body: "ECL = <b>PD × LGD × EAD</b> (discounted). <b>PD</b> probability of default, <b>LGD</b> loss given default (1 − recovery rate), <b>EAD</b> exposure at default. Stage 1 uses a 12-month PD, Stage 2/3 a lifetime PD." },
      { title: "4. Forward-looking information", body: "Incorporate weighted <b>macro-economic</b> scenarios (growth, unemployment, rates) that adjust PD and LGD. ECL is not purely historical: it anticipates the expected evolution." },
      { title: "5. Simplified approach (trade receivables)", body: "For <b>trade receivables</b> and contract assets, IFRS 9 allows a simplified approach: lifetime ECL directly via a <b>provision matrix</b> by ageing band, without tracking the 3 stages." },
      { title: "6. IFRS 7 disclosure", body: "Disclose in the notes: reconciliation of provisions by stage, methodology, macro assumptions, sensitivity analysis and credit quality of the portfolio (IFRS 7)." },
    ],
    pitfalls: [
      "Waiting for arrears to provision (the old IAS 39 'incurred loss' model) → non-compliant.",
      "Ignoring forward-looking information and provisioning only on history.",
      "Confusing SICR (Stage 2) with default (Stage 3) — the former does not suspend gross interest accrual.",
      "A provision matrix not updated with actual losses and macro outlook.",
    ],
    externalLinks: [
      { label: "IFRS 9 — Financial Instruments", url: "https://www.ifrs.org/issued-standards/list-of-standards/ifrs-9-financial-instruments/" },
      { label: "IFRS 7 — Disclosures", url: "https://www.ifrs.org/issued-standards/list-of-standards/ifrs-7-financial-instruments-disclosures/" },
    ],
    tips: [
      "Lexora computes ECL per stage, applies the forward-looking macro adjustment and produces the ageing matrix for trade receivables.",
      "Document the SICR thresholds used (30 days, rating downgrade): they must be consistent from one year to the next.",
    ],
  },

  // ========================================================================
  // EMPLOYEE — PORTAL
  // ========================================================================
  '/salarie': {
    title: 'My employee space',
    audience: 'all',
    intro:
      "Welcome to your Lexora <b>employee space</b>. From this portal you clock your hours, request leave, declare your trips and mileage expenses, view your payslips and your personal information. Everything is centralised and synced with the HR department.",
    steps: [
      { title: "1. Dashboard", body: "Overview: next working day, remaining leave balance, latest available payslip, requests pending approval. This is your starting point." },
      { title: "2. Time tracking", body: "Record your arrival and departure times (clock-in / clock-out). The system computes your worked hours and flags overtime. Clock in and out each day." },
      { title: "3. Leave requests", body: "Submit a leave request (annual, sick, special) by choosing the dates. The balance updates automatically. Your request goes to your manager for approval." },
      { title: "4. Trips / mileage expenses", body: "Declare your business trips: route, distance, purpose. Lexora computes the mileage allowance under the company scale. Attach supporting evidence if required." },
      { title: "5. Payslips", body: "View and download your payslips (PDF) month by month. Check gross salary, contributions (NSF, CSG), PAYE withheld, net pay." },
      { title: "6. My profile", body: "View your personal information: contact details, contract, payment IBAN. Report any error to HR — some data can only be changed by them." },
    ],
    pitfalls: [
      "Forgetting to clock out at the end of the day → incomplete hours, manual correction needed.",
      "Booking leave without sufficient balance → request refused or unpaid leave.",
      "Declaring a trip without evidence when it is required → allowance not approved.",
      "Wrong bank details in 'My profile' → salary transfer fails.",
    ],
    tips: [
      "Check your payslip as soon as it is available: report any anomaly to HR quickly.",
      "Plan your leave requests ahead: approval by your manager takes a little time.",
    ],
  },

  // ========================================================================
  // HR PAYROLL — MRA EXPORTS
  // ========================================================================
  '/rh/paie/exports-mra': {
    title: 'Payroll — MRA Exports (PAYE, NSF, CSG, PRGF)',
    audience: 'comptable',
    intro:
      "This space generates the social and tax return files to submit to the <b>MRA</b> each month: <b>PAYE</b> (tax withheld at source), <b>NSF</b> (National Savings Fund), <b>CSG</b> (Contribution Sociale Généralisée) and <b>PRGF</b> (Portable Retirement Gratuity Fund). Submission is done on the MRA portal.",
    steps: [
      { title: "1. PAYE", body: "Income tax withheld at source on salaries under the prevailing scale. Lexora generates the PAYE file (and the joint CSG/NSF return on the same MRA portal) with per-employee detail." },
      { title: "2. NSF (National Savings Fund)", body: "Contribution to the national savings fund, employer + employee share, on the contributory remuneration. Included in the monthly MRA return." },
      { title: "3. CSG (Contribution Sociale Généralisée)", body: "Replaced the former NPF as from Sept. 2020. Employer + employee contribution, rate depending on the remuneration level (salary band). Declared monthly to the MRA." },
      { title: "4. PRGF (Portable Retirement Gratuity Fund)", body: "Portable retirement gratuity fund (Workers' Rights Act): employer contribution for eligible employees, declared and paid to the MRA under the PRGF schedule." },
      { title: "5. Generation and checking", body: "Lexora produces the files in the format expected by the MRA portal from the validated payslips of the month. Check the totals by line before exporting." },
      { title: "6. Submission and payment", body: "File the documents on the MRA e-services portal and settle the amounts. Keep the acknowledgement for audit." },
    ],
    pitfalls: [
      "Submitting after the deadline (generally the <b>20th of the following month</b> for the joint PAYE/CSG/NSF return — check the exact MRA date) → penalties and interest.",
      "Exporting before all the month's payslips are validated → incomplete file.",
      "Forgetting a line (PRGF, training levy) → partial return, correction needed.",
      "Not keeping the MRA acknowledgement → missing proof of filing in case of audit.",
    ],
    externalLinks: [
      { label: "MRA — e-Services PAYE/CSG/NSF", url: "https://www.mra.mu/index.php/eservices/paye", description: "Monthly return submission." },
      { label: "MRA — CSG", url: "https://www.mra.mu/index.php/taxes-duties/csg", description: "Contribution Sociale Généralisée." },
    ],
    tips: [
      "Validate the month's payroll (see /rh/paie/validation) before generating the exports: the files depend on it.",
      "Check the exact deadline published by the MRA each month: the 20th is the general rule but may shift (public holiday).",
    ],
  },

  // ========================================================================
  // HR PAYROLL — SETTINGS
  // ========================================================================
  '/rh/paie/parametres': {
    title: 'Payroll — Settings (rates, scales, accounts)',
    audience: 'comptable',
    intro:
      "Here you configure the <b>payroll computation settings</b>: contribution rates (NSF, CSG, PRGF, training levy), PAYE scales, accounting accounts and default values. These settings feed every payslip — an error here propagates across the whole payroll.",
    steps: [
      { title: "1. Contribution rates", body: "Configure the <b>NSF</b>, <b>CSG</b> (by salary band), <b>PRGF</b> and <b>training levy</b> rates (employer / employee share). Update them at each regulatory change (annual Finance Act)." },
      { title: "2. PAYE scales", body: "Set the PAYE tax bands and the prevailing <em>Income Exemption Threshold</em> (IET). These scales determine the tax withheld each month." },
      { title: "3. Accounting accounts", body: "Map each payroll line to a chart-of-accounts account: staff costs (gross salaries), social contributions, payables to bodies (NSF, CSG, MRA), net pay." },
      { title: "4. Default values", body: "Define the default values applied to new employees (standard hours, allowances, mileage scale) to speed up record creation." },
      { title: "5. Validating the settings", body: "After any change, run a test payroll on a dummy employee to check that the rates and accounting mapping produce the expected result." },
    ],
    pitfalls: [
      "Not updating the rates after the Finance Act → wrong contributions and PAYE across the whole payroll.",
      "Wrong accounting account on a line → incorrect payroll entries, reconciliation impossible.",
      "Changing a rate mid-month without recomputing the payslips already generated.",
      "Confusing employer and employee share when configuring the rates.",
    ],
    externalLinks: [
      { label: "MRA — Income Tax / PAYE", url: "https://www.mra.mu/index.php/taxes-duties/income-tax", description: "Prevailing PAYE scales and IET." },
      { label: "MRA — CSG", url: "https://www.mra.mu/index.php/taxes-duties/csg" },
    ],
    tips: [
      "Enter the official rates/scales from the current Finance Act — Lexora cannot guess a regulatory value you have not entered.",
      "Keep a history of rate changes so you can correctly recompute a prior month's payroll.",
    ],
  },

  // ========================================================================
  // HR PAYROLL — VALIDATION
  // ========================================================================
  '/rh/paie/validation': {
    title: 'Payroll — Validation and month close',
    audience: 'comptable',
    intro:
      "Control step <b>before closing</b> the payroll month. You check each payslip, detect anomalies, correct them and then <b>lock</b> the payroll. Once validated, the payroll feeds the accounting entries and the MRA exports — so it must be correct before locking.",
    steps: [
      { title: "1. Month summary", body: "Overview: number of payslips, gross payroll cost, total contributions, total net pay. Compare with the previous month to spot an abnormal variation." },
      { title: "2. Checking the payslips", body: "Check payslip by payslip: base salary, overtime, bonuses, paid leave, contributions, PAYE, net. Check new joiners and leavers (pro rata)." },
      { title: "3. Anomaly detection", body: "Lexora flags discrepancies: negative net, large variation vs previous month, missing contribution, employee without IBAN, inconsistent rate. Resolve each anomaly before closing." },
      { title: "4. Corrections", body: "Reopen the payslips in error (line, rate, unrecorded absence) and recompute. As long as the payroll is not locked, corrections are free." },
      { title: "5. Locking / closing", body: "Once everything is checked, <b>lock</b> the month. This freezes the payslips, generates the payroll entries and unlocks the MRA exports. Any later correction will go through an adjustment, not a direct edit." },
    ],
    pitfalls: [
      "Locking with an unresolved anomaly (negative net, missing IBAN) → wrong payment or return.",
      "Not comparing with the previous month → an error in payroll cost goes unnoticed.",
      "Forgetting the pro rata for the month's joiners/leavers.",
      "Editing payroll after locking by bypassing the adjustment → accounting/MRA inconsistency.",
    ],
    tips: [
      "Lock only when all anomalies are at zero: it is the last barrier before accounting and the MRA.",
      "Keep a record of who validated and when: useful in case of audit or employee dispute.",
    ],
  },

}
