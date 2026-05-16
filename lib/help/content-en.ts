/**
 * Centralised English help content for Lexora — mirrors HELP_CONTENT (FR)
 * key by key. Used when the user has selected English as their language.
 *
 * British English. Mauritian tax acronyms (MRA, VAT, TDS, CIT, PAYE, NSF,
 * CSG, GBC, FSC, ROC, SFT, APS, IRN, BRN) are kept as-is because they are
 * official terms.
 */

import type { HelpEntry } from './content'

export const HELP_CONTENT_EN: Record<string, HelpEntry> = {
  // ========================================================================
  // ROOTS — generic fallback for any page not specifically covered
  // ========================================================================
  '/client': {
    title: "Client workspace — overview",
    audience: 'client',
    intro:
      "Your steering workspace: invoicing, banking, tax (VAT, CIT, TDS, ROC), HR/payroll, GBC, documents. Each sub-page has its own help button in the bottom-right corner — click it for didactic explanations.",
    steps: [
      { title: "Navigation", body: "The left-hand menu groups the modules: <b>Sales</b> (invoices, quotes), <b>Accounting</b> (banking, journal entries, balance sheet), <b>Tax</b> (MRA hub, VAT, CIT, TDS, ROC), <b>HR</b> (employees, payroll, leave), <b>Settings</b> (companies, users, banking, MRA)." },
      { title: "Active company", body: "If you manage several companies, the selector at the top switches between them. Every page reacts to the active context." },
      { title: "Contextual help", body: "On every page, this button explains <b>what the page is for</b>, <b>how to use it</b>, the <b>common pitfalls</b> and the <b>useful links</b> (MRA portal, banks, etc.)." },
      { title: "Telegram bot", body: "For any off-page question (analysis, tax advice, creating an invoice from a photo), ask the Lexora bot on Telegram." },
    ],
    tips: [
      "The help button is always there, bottom right. If you cannot see it on a page, please report it.",
      "To move faster: the keyboard shortcut `?` opens the contextual help.",
    ],
  },

  // ========================================================================
  // TAX — VAT
  // ========================================================================
  '/comptable/tva': {
    title: 'VAT return — Mauritius',
    audience: 'comptable',
    intro:
      "This page consolidates the VAT collected (on your customer invoices) and deductible (on your supplier invoices) for the period. You obtain the balance to pay or to carry forward, and you can export the files to upload to the MRA portal.",
    steps: [
      {
        title: "Choose the period",
        body:
          "Select the month (monthly VAT 3 if turnover > MUR 10 M) or the quarter (VAT 4) at the top of the page. Lexora calculates automatically from the invoices already entered.",
      },
      {
        title: "Check the taxable bases",
        body:
          "The bases at 15%, zero-rated and exempt are calculated per line item. If a base looks abnormal, click on the detail to see the invoices included.",
        warning:
          "A draft invoice is NOT counted. Issue them before finalising your return.",
      },
      {
        title: "Generate the files",
        body:
          "Click on <b>Export Schedule A (sales)</b> and <b>Schedule B (purchases)</b>. You obtain two CSV files to upload to the MRA portal.",
      },
      {
        title: "Log in to the MRA",
        body:
          "Open <b>eservices.mra.mu</b> and log in with your TAN and MRA password. The button below takes you straight there.",
      },
      {
        title: "Upload the files to the portal",
        body:
          "On the MRA portal go to <b>VAT</b> then <b>Submit Return (VAT 3)</b> or <b>(VAT 4)</b> depending on your regime. Select the period, upload the two CSV files, enter the gross VAT total if requested, and validate.",
        warning:
          "The MRA blocks submissions after the 20th of the following month. 5% penalty plus interest beyond that date.",
      },
      {
        title: "Pay the balance (if due)",
        body:
          "After validation the MRA displays the amount payable. You can settle by transfer (MCB Real-Time) or via the bank-to-MRA portal. Mark the return as <b>paid</b> in Lexora once done so that it disappears from your follow-up list.",
      },
    ],
    pitfalls: [
      "Forgetting to enter a supplier invoice means you lose deductible VAT. Check the month's documents before closing.",
      "Wrong rate (0% vs 15% vs exempt): review the VAT codes in the services catalogue.",
      "Period not locked on the Lexora side: any later edits will desync your return.",
      "Incorrect MRA TAN: the return will not be accepted; check it under Management then MRA Access.",
    ],
    externalLinks: [
      { label: "MRA portal — Login", url: "https://eservices.mra.mu", description: "Log in to the MRA online services portal to submit the return." },
      { label: "Official VAT guide — MRA", url: "https://www.mra.mu/index.php/eservices/value-added-tax-vat", description: "Official documentation for the VAT Act 1998." },
      { label: "Daily exchange rates", url: "https://www.mra.mu/index.php/exchange-rates", description: "For invoices in foreign currency." },
    ],
    tips: [
      "Enable automatic submission via the Telegram bot so you never forget again (Management then MRA Access).",
      "The Telegram bot can generate and send you the MRA files as an attachment on demand (\"export VAT for May\").",
    ],
  },

  // ========================================================================
  // TAX — PAYE
  // ========================================================================
  '/rh/paie': {
    title: 'PAYE calculation and return',
    audience: 'comptable',
    intro:
      "This page handles the calculation of monthly payslips and the generation of MRA filing files (PAYE, CSG, NSF, PRGF). You steer the entire cycle: entering variables, calculation, validation, posting to the ledger, bank transfers and MRA submission.",
    steps: [
      {
        title: "Enter the month's variables",
        body:
          "Overtime (OT), variable bonuses, paid leave, absences. You can do this here or via the Telegram bot (\"Jean 8h OT 1.5x May\").",
      },
      {
        title: "Run the payroll calculation",
        body:
          "Click on <b>Calculate the month</b>. Lexora applies the 2025-2026 PAYE scale (11 brackets, 0% to 20%), CSG (1.5% or 3%), NSF (1%) and PRGF (4.5% employer).",
      },
      {
        title: "Check the payslips",
        body:
          "Compare with the previous month. If a net is very different, open the detail to check the variables or the tax calculation.",
      },
      {
        title: "Validate each payslip",
        body:
          "When you are confident, click <b>Validate</b> on each one. Until all are validated, you cannot lock the period.",
      },
      {
        title: "Lock the period",
        body:
          "<b>Lock</b> makes the payslips immutable and triggers automatic posting (4xx, 6xx, 422, 431, 437 journal entries). You will no longer be able to edit anything afterwards.",
        warning:
          "Destructive action. Ask a second pair of eyes to review, or use the Telegram bot which requires explicit confirmation.",
      },
      {
        title: "Generate the transfer files",
        body:
          "Go to <b>Exports then Salary transfers</b>. Lexora generates one CSV file per beneficiary bank (MCB, SBM, ABC and so on). Upload them to your Internet Banking to execute the payments.",
      },
      {
        title: "Generate the MRA returns",
        body:
          "Tabs <b>PAYE-MRA</b>, <b>CSG/NSF-MRA</b>, <b>PRGF-MRA</b>. PDF summary plus CSV detail for each. Upload the CSV files to eservices.mra.mu.",
      },
      {
        title: "Pay the social contributions",
        body:
          "MRA deadline: <b>20th of the following month</b> for PAYE and CSG. Beyond that: penalties. The Telegram bot sends you a reminder at D-7, D-3 and D-1.",
      },
    ],
    pitfalls: [
      "Period not locked: posting is missing, MRA returns are inconsistent.",
      "Missing bank details on an employee: they will appear in the 'NO_BANK' file to be completed manually.",
      "Forgetting an overtime hour or a bonus: payslip undervalued, employee unhappy.",
      "Wrong CSG rate: <= MUR 50,000/month = 1.5%, > 50,000 = 3%.",
    ],
    externalLinks: [
      { label: "MRA portal — eServices", url: "https://eservices.mra.mu", description: "Submission of PAYE, CSG, NSF, PRGF." },
      { label: "Workers Rights Act 2019", url: "https://labour.govmu.org/Pages/Workers-Rights-Act-2019.aspx", description: "Reference for employee rights (OT, leave, severance)." },
      { label: "MRA PAYE calculator", url: "https://www.mra.mu/index.php/individuals/calculate-your-paye", description: "Official verification tool." },
    ],
    tips: [
      "The Telegram bot can drive the whole workflow: 'calculate May's payroll', 'lock it', 'generate the transfers', 'submit PAYE'.",
      "You can pre-configure a four-eyes validation (management + admin) for payrolls over MUR 1 M via Telegram Permissions.",
    ],
  },

  // ========================================================================
  // BANK
  // ========================================================================
  '/client/direction/bank-credentials': {
    title: 'Bank access — Automatic scraping',
    audience: 'client',
    intro:
      "Configure the Internet Banking credentials of each account so that Lexora automatically fetches balances and transactions every night. No more downloading statements manually.",
    steps: [
      {
        title: "Get your Internet Banking credentials",
        body:
          "For MCB: Username + Password (and a secondary PIN if it is a business account). For SBM, ABC, MauBank, MyT Money, AfrAsia, Bank One: same idea.",
        warning:
          "Do NOT use a 2FA / OTP account: the robot cannot authenticate. Disable 2FA on this account or create a dedicated read-only account for Lexora.",
      },
      {
        title: "Enter them here",
        body:
          "For each account of the company, click <b>Configure</b>. Credentials are encrypted with <b>AES-256-GCM</b> before storage. No one, not even a Lexora administrator, can read them in clear.",
      },
      {
        title: "Enable scraping",
        body:
          "Tick <b>Automatic scraping enabled</b>. The robot runs every day at 02:00 UTC and retrieves the previous day's balance and transactions.",
      },
      {
        title: "Run a manual scrape to test",
        body:
          "Click <b>Scrape now</b>. The robot will attempt a connection. On success: status <em>Last scrape OK</em> plus the balance displayed. On failure: an explicit error message.",
      },
      {
        title: "Monitor anomalies",
        body:
          "The Telegram bot alerts you if the scraped balance differs by more than 5% from the balance in Lexora, or if a variation greater than 30% in 24 hours is detected. You can adjust these thresholds via the bot's memory_set tool.",
      },
    ],
    pitfalls: [
      "If you change your Internet Banking password, do not forget to update it here or scraping will fail.",
      "Some banks block concurrent sessions: if you are logged in in parallel, the robot may be disconnected.",
      "For JOINT accounts, the PIN may rotate every 90 days. Add a note in the Notes field as a reminder.",
    ],
    externalLinks: [
      { label: "MCB Internet Banking", url: "https://ibank.mcb.mu" },
      { label: "SBM Internet Banking", url: "https://internetbanking.sbmgroup.mu" },
      { label: "ABC Banking", url: "https://www.abcbank.mu" },
      { label: "MauBank Online", url: "https://internetbanking.maubank.mu" },
    ],
    tips: [
      "You can trigger a scrape from Telegram: 'scrape the MCB account' (Management role).",
      "Scraped transactions feed the automatic bank reconciliation on the Accounting side.",
    ],
  },

  // ========================================================================
  // MRA CREDENTIALS
  // ========================================================================
  '/client/direction/mra-credentials': {
    title: 'MRA access — Automatic submission of returns',
    audience: 'client',
    intro:
      "Configure the company's MRA credentials. A single username/password pair is used for ALL returns: PAYE, CSG/NSF, PRGF, VAT, TDS, CIT. The Lexora robot can submit returns on your behalf on eservices.mra.mu.",
    steps: [
      {
        title: "Check that the company has an MRA TAN",
        body:
          "The TAN (Tax Account Number) is allocated by the MRA on registration. You will find it on your MRA correspondence. Format: 1 letter + 9 digits.",
      },
      {
        title: "Create or retrieve the eServices MRA account",
        body:
          "Go to <b>eservices.mra.mu</b> then <b>Register</b> if not yet done. Otherwise log in to confirm you have access to the VAT, PAYE and CIT modules.",
      },
      {
        title: "Enter them here",
        body:
          "Username (often the TAN), Password, TAN if different from the username. All encrypted with AES-256-GCM. Lexora never sees them in clear.",
      },
      {
        title: "Enable automatic submission",
        body:
          "Tick <b>Automatic submission active</b>. From then on, when you validate a payroll or a VAT return in Lexora, you can ask the Telegram bot (Management role): 'submit May's PAYE to the MRA' and the robot will do it.",
        warning:
          "If the MRA has activated a 2FA OTP on your account, automatic submission is impossible: the Telegram bot will send you the files as attachments for manual submission.",
      },
      {
        title: "Monitor submissions",
        body:
          "Status <em>Last submission</em> plus MRA reference plus a screenshot of the receipt. If <em>manual required</em>, you receive the files as Telegram attachments to upload yourself.",
      },
    ],
    pitfalls: [
      "Expired MRA password: the robot will fail. The MRA forces a change every 90 days, so remember to update it here.",
      "Account without module activation: you must enable VAT/PAYE from the MRA portal Settings.",
      "Multiple failed attempts: the MRA locks the account for 30 minutes. Wait before retrying.",
    ],
    externalLinks: [
      { label: "MRA eServices portal", url: "https://eservices.mra.mu", description: "Login plus submission of returns." },
      { label: "MRA Helpdesk", url: "https://www.mra.mu/index.php/contact-us", description: "To reset a password or unblock an account." },
      { label: "Understanding the TAN", url: "https://www.mra.mu/index.php/individuals/tax-account-number-tan", description: "Official documentation." },
    ],
    tips: [
      "The robot submits PAYE/CSG/PRGF/VAT/TDS via the SAME portal: no need to configure multiple credentials.",
      "To enable the Playwright robot (auto-submit) the MRA account must not have 2FA. Otherwise the Telegram attachment fallback works very well.",
    ],
  },

  // ========================================================================
  // EMAIL ACCOUNTS
  // ========================================================================
  '/client/email-accounts': {
    title: 'Email accounts — Outbound sending',
    audience: 'all',
    intro:
      "Configure the email accounts Lexora will use to send emails (customer reminders, reports, notifications). Multiple accounts are possible: one per company (shared) or personal (yours only).",
    steps: [
      {
        title: "Choose your provider",
        body:
          "<b>SMTP</b> (Gmail App Password, OVH, Outlook): the simplest, works with any standard email account. <b>Resend</b>: a transactional service that requires a verified domain, ideal for bulk sending.",
      },
      {
        title: "For Gmail: generate an App Password",
        body:
          "Gmail blocks SMTP with a normal password. Go to <b>myaccount.google.com/apppasswords</b> (requires 2FA enabled on your Google account). Create an App Password called 'Lexora'. Copy the 16 characters.",
        warning:
          "If the App Passwords page is unavailable, it is because 2FA is not enabled. Enable it first in your Google account security settings.",
      },
      {
        title: "For Resend: create a verified domain",
        body:
          "Go to <b>resend.com/domains</b>. Add your domain (for example acme.io). Configure the DNS records (SPF, DKIM) at your host. Wait for verification (about 10 minutes). Then generate an API key.",
      },
      {
        title: "Fill in the form here",
        body:
          "Label, From email, From name (what the recipient sees). Type: Personal (you only) or Company (shared between all management+ members). Tick <b>Set as default</b> if you want this account to be the default.",
      },
      {
        title: "Test with the Test button",
        body:
          "A real email is sent to your From address. If you receive it: configuration is fine. Otherwise: a precise error message (invalid password, unverified domain, etc.).",
      },
    ],
    pitfalls: [
      "Gmail: using the normal password instead of an App Password will see the email rejected with 'Username and Password not accepted'.",
      "From email of a domain not verified on Resend: the email is rejected.",
      "If you change your Google App Password, update it here or sending will fail.",
    ],
    externalLinks: [
      { label: "Google App Passwords", url: "https://myaccount.google.com/apppasswords" },
      { label: "Resend Domains", url: "https://resend.com/domains" },
      { label: "Resend API Keys", url: "https://resend.com/api-keys" },
    ],
    tips: [
      "The Telegram agent can send emails automatically (reminders, reports) using the accounts you have configured here.",
      "To brand 'from Acme Accountants <contact@acme.io>' instead of 'Lexora <onboarding@resend.dev>', configure a Resend account with your domain.",
    ],
  },

  // ========================================================================
  // GOOGLE ACCOUNTS (Calendar)
  // ========================================================================
  '/client/settings/google-accounts': {
    title: 'Google accounts (Calendar) — OAuth connection',
    audience: 'all',
    intro:
      "Connect your Google account so that Lexora can manage your calendar directly from Telegram: create meetings, add Google Meet links, find free slots, edit or cancel events.",
    steps: [
      {
        title: "Click Connect Google",
        body:
          "You are redirected to the Google consent screen. Select the Google account you want to link (personal or work).",
      },
      {
        title: "Grant the permissions",
        body:
          "Google lists the permissions Lexora is requesting: <b>View and edit your calendar events</b>, plus your email and profile. Click <b>Allow</b>.",
        warning:
          "If you see 'Application not verified' or 'Access blocked', it means your email is not in the Test Users list on the Google Cloud side. Ask the administrator to add you.",
      },
      {
        title: "Check that the account is linked",
        body:
          "Back on this page you will see your Google email with a <em>Connected</em> badge. If you connect several accounts (personal plus practice), pick the default one.",
      },
      {
        title: "Use it from Telegram",
        body:
          "You can now tell the bot: 'list my meetings this week', 'meeting with Marie tomorrow at 2 pm by video', 'cancel the 4 pm one'. The bot creates Meet links automatically when you ask for a video call.",
      },
    ],
    pitfalls: [
      "If you are not using private browsing, Google may auto-select an account other than the one you want to link. Log out of other Google accounts beforehand.",
      "Missing refresh token: if you reconnect an already-linked account, revoke access first at myaccount.google.com/permissions, then reconnect.",
      "The app is in Testing mode until you request Google verification (useful for more than 100 users).",
    ],
    externalLinks: [
      { label: "My Google permissions", url: "https://myaccount.google.com/permissions", description: "Revoke Lexora's access if needed." },
      { label: "My Google Calendar", url: "https://calendar.google.com", description: "Web view of your events." },
    ],
    tips: [
      "You can connect several Google accounts (personal plus work). The bot will ask which one to use when creating a meeting.",
      "Events created via Telegram appear normally in your Google Calendar, with invitations sent to attendees.",
    ],
  },

  // ========================================================================
  // TELEGRAM PERMISSIONS
  // ========================================================================
  '/client/telegram-permissions': {
    title: 'Telegram bot permissions',
    audience: 'client',
    intro:
      "Configure who can use the Lexora Telegram bot and with what rights. You can link HR employees to the bot (code generation), change their roles, or customise their capabilities beyond their role.",
    steps: [
      {
        title: "Understand the role matrix",
        body:
          "8 roles are available: <b>Employee</b> (view payslips, request leave) then <b>Manager</b> (also validate team leave) then <b>HR</b> (also OT, bonuses, payroll) then <b>Accountant</b> (also banking, invoices, MRA) then <b>Management</b> (EVERYTHING). Each role has default capabilities visible in the matrix.",
      },
      {
        title: "List Members (active Lexora account)",
        body:
          "The <b>Members</b> table shows users who already have a Lexora account and are attached to this company. You can change their role or customise their capabilities (the <b>Permissions</b> button).",
      },
      {
        title: "List unlinked HR Employees",
        body:
          "The <b>HR Employees</b> table shows active employees from the HR record who do not yet have a Lexora account. Click <b>Generate code</b> to create an account plus a Telegram code to forward to the employee.",
      },
      {
        title: "Generate a Telegram code for an employee",
        body:
          "Choose the role in the dropdown (Employee by default). Tick the custom capabilities if you want to restrict or extend their rights. Click <b>Generate code</b>. You obtain a 6-character code plus a <em>t.me/LexoraBot?start=CODE</em> link plus a ready-to-send message (WhatsApp, email, SMS).",
        warning:
          "The code expires after 15 minutes. If the employee does not use it in time, regenerate it.",
      },
      {
        title: "The employee activates the bot",
        body:
          "They open Telegram, search for the bot, or click the link. They type <b>/start CODE</b>. Their account is activated instantly.",
      },
      {
        title: "Action audit",
        body:
          "Every action performed by the bot (sending an invoice, validating payroll, MRA submission) is logged in <code>telegram_actions</code>. You can see the stats in the <em>Audit (30d)</em> column for each member.",
      },
    ],
    pitfalls: [
      "Missing email on the employee: you cannot generate a code (the Lexora account needs an email to be created).",
      "Several employees with the same email: only one can be linked.",
      "Customised capabilities: if you tick capabilities beyond the role, the override applies. To return to the role default, click <b>Remove override</b> in the modal.",
    ],
    tips: [
      "For destructive actions (validating payroll, MRA submission, transfers), a summary plus confirmation buttons is sent to the user before execution.",
      "The bot knows each person's name and role and uses them naturally in its responses.",
    ],
  },

  // ========================================================================
  // ACCOUNTING — DASHBOARD
  // ========================================================================
  '/comptable': {
    title: 'Accountant dashboard',
    audience: 'comptable',
    intro:
      "Overview of the activity across all the companies you look after: alerts of the day, pending invoices, MRA deadlines, bank balances, financial KPIs. Your starting point every morning.",
    steps: [
      { title: "Select a company", body: "The selector at the top filters all indicators on the active company. You can switch between clients via the Practice menu." },
      { title: "Review the day's alerts", body: "Missing documents, overdue invoices, imminent MRA deadlines (D-7, D-3, D-1). Click on each alert to resolve it." },
      { title: "Check cash position", body: "Balances of all active bank accounts. If scraping is configured, balances are updated every night (see Bank Access)." },
      { title: "Track the month's KPIs", body: "Revenue, expenses, profit, gross margin. Compare with the previous month and last year." },
    ],
    pitfalls: [
      "If an indicator seems stuck, check that the company is correctly selected and that its data is up to date (invoices issued, journal entries posted).",
    ],
    tips: [
      "Ask the Telegram bot \"morning briefing\" to receive a condensed mobile summary.",
      "Enable Telegram alerts (Bot Permissions) so you never miss a deadline.",
    ],
  },

  // ========================================================================
  // ACCOUNTING — CUSTOMER INVOICES
  // ========================================================================
  '/comptable/factures-clients': {
    title: 'Customer invoices',
    audience: 'comptable',
    intro:
      "List of all invoices issued to the company's customers. You can create, validate, email, track payments and trigger automatic reminders.",
    steps: [
      { title: "Create an invoice", body: "Click <b>New invoice</b>. Choose the customer (or create one), add the lines (from the services catalogue or freely), and Lexora calculates VAT plus the total automatically." },
      { title: "Issue the invoice", body: "When you move from draft to <b>pending</b>, Lexora generates a PDF, allocates an automatic number (company prefix + YYYY-NNNNN) and creates the journal entries.", warning: "Once issued, you can no longer edit it: you can only cancel it via a credit note." },
      { title: "Send by email", body: "Click <b>Send</b> for an email with the PDF attached to the customer's contact. The send is logged." },
      { title: "Track payments", body: "When the customer pays, record the payment (amount, date, method, reference). Lexora updates the outstanding balance and closes the invoice once fully paid." },
      { title: "Automatic reminders", body: "If not paid by the due date, reminders go out at D+7, D+15, D+30 based on the company settings. You can disable them for a given customer." },
    ],
    pitfalls: [
      "Forgetting to issue (leaving it as a draft): the invoice is NOT counted in VAT collected or revenue.",
      "Issuing without an email contact: impossible to send automatically by email.",
    ],
    tips: [
      "Create an invoice via Telegram: \"invoice acme 50000 mur consulting september\" and the bot prepares it for you.",
      "For subscriptions and recurring rentals, use <b>Recurring invoices</b> (auto-generated every month).",
    ],
  },

  // ========================================================================
  // ACCOUNTING — SUPPLIER INVOICES
  // ========================================================================
  '/comptable/fournisseurs': {
    title: 'Supplier invoices',
    audience: 'comptable',
    intro:
      "Capture and tracking of invoices received from your suppliers. Deductible VAT is calculated for the MRA return and class 4 and 6 journal entries are posted automatically.",
    steps: [
      { title: "Enter or import", body: "Click <b>New supplier invoice</b> for manual capture. Otherwise drop the PDF into Documents and the OCR will extract the supplier, amount, VAT and date. You validate and it is created." },
      { title: "Allocate the accounts", body: "Lexora suggests an expense account (class 6) based on the description. Check and adjust if necessary (purchases 60x vs services 62x vs bank charges 627, etc.)." },
      { title: "Record the payment", body: "When you pay the supplier, mark the invoice as <b>paid</b> with the date and method (transfer, cheque, card). The bank entry is posted." },
    ],
    pitfalls: [
      "Entering without VAT when the invoice includes it means you lose deductible VAT.",
      "Wrong expense account: your income statement is distorted.",
    ],
    tips: [
      "You can send a photo of a receipt or invoice to the Telegram bot: it will OCR it and offer to create the entry.",
    ],
  },

  // ========================================================================
  // ACCOUNTING — BANK / STATEMENTS
  // ========================================================================
  '/comptable/banque': {
    title: 'Bank statements',
    audience: 'comptable',
    intro:
      "Review and import the bank statements of each account. Imported transactions are the raw material for automatic reconciliation.",
    steps: [
      { title: "Import a statement", body: "Drop the PDF or CSV from the bank (downloaded from Internet Banking) into Documents. The OCR extracts the transactions and updates the account." },
      { title: "Enable scraping (recommended)", body: "Management then Bank Access: configure your Internet Banking credentials once and Lexora pulls the data automatically every night." },
      { title: "Run reconciliation", body: "Once the transactions are imported, go to Bank reconciliation. Lexora proposes automatic matches between transactions and invoices." },
    ],
    pitfalls: [
      "Importing the same statement twice creates duplicates. Check for overlapping date ranges.",
      "Without scraping or regular imports, clean reconciliation is impossible.",
    ],
    externalLinks: [
      { label: "MCB Internet Banking", url: "https://ibank.mcb.mu" },
      { label: "SBM Internet Banking", url: "https://internetbanking.sbmgroup.mu" },
    ],
  },

  // ========================================================================
  // ACCOUNTING — RECONCILIATION
  // ========================================================================
  '/comptable/rapprochement': {
    title: 'Bank reconciliation',
    audience: 'comptable',
    intro:
      "Automatically match bank transactions with customer/supplier invoices and journal entries. Separates what is matched from what is still outstanding.",
    steps: [
      { title: "Run auto reconciliation", body: "Click <b>Run reconciliation</b>. Rules R1 to R7 apply: exact amount, description, period, references. Proposed matches can be confirmed in 1 click." },
      { title: "Handle the unmatched items", body: "For each remaining transaction, either match it manually to an invoice or post it as a free journal entry (bank charges, internal transfer, etc.)." },
      { title: "Lock the month", body: "Once everything is matched, lock the period. You will no longer be able to modify the posted entries except by explicit unlocking." },
    ],
    pitfalls: [
      "Matching a transaction hastily to the wrong invoice leaves that invoice unpaid in Lexora. Unmatch and correct.",
    ],
    tips: [
      "Salary payments are matched automatically with the SAL journal once payroll is locked.",
    ],
  },

  // ========================================================================
  // ACCOUNTING — JOURNAL
  // ========================================================================
  '/client/ecritures': {
    title: 'Accounting journal',
    audience: 'comptable',
    intro:
      "Chronological list of every journal entry, grouped by journal code (VTE sales, ACH purchases, BNQ banking, SAL salaries, OD miscellaneous).",
    steps: [
      { title: "Filter by journal and period", body: "Selectors at the top. Most entries are auto-generated (invoices, payroll, banking); you can also enter some manually (OD)." },
      { title: "Enter a manual OD", body: "Click <b>New entry</b>. Choose the OD journal, add the debit/credit lines (must balance) and a clear description." },
      { title: "Accounting export", body: "Click <b>Export</b> for a PDF summary or a CSV (FEC, IFRS) to provide to your statutory auditor." },
    ],
    pitfalls: [
      "Entering an unbalanced entry is impossible (Lexora blocks it). However, entries on the wrong accounts can still distort the balance sheet, so double-check before validating.",
    ],
  },

  // ========================================================================
  // ACCOUNTING — TRIAL BALANCE
  // ========================================================================
  '/comptable/clients/[clientId]/[societeId]/balance': {
    title: 'Trial balance',
    audience: 'comptable',
    intro:
      "Summary of the balances of every chart of accounts entry as at a given date. A control tool before monthly or annual close.",
    steps: [
      { title: "Choose the period", body: "Selector at the top: cumulative balance at month end, quarter end or year end." },
      { title: "Check it is balanced", body: "Total debit = Total credit. If unbalanced, an entry is inconsistent (Lexora indicates which one)." },
      { title: "Drill down on an account", body: "Click on an abnormal balance to see the entries that make it up." },
    ],
    pitfalls: [
      "A non-zero balance on a suspense account (47x) means an entry is pending and must be cleared before close.",
    ],
  },

  // ========================================================================
  // ACCOUNTING — CHART OF ACCOUNTS
  // ========================================================================
  '/client/plan-comptable': {
    title: 'Chart of accounts',
    audience: 'comptable',
    intro:
      "List of accounts in use (classes 1 to 7). Lexora starts with a SYSCOHADA chart adapted for Mauritius; you can create sub-accounts to refine it.",
    steps: [
      { title: "Search an account", body: "Search by number or description. Accounts in use show a padlock (they cannot be deleted while entries reference them)." },
      { title: "Create a sub-account", body: "Click <b>New account</b>. Number = parent + one digit (for example 6061 is a sub-account of 606). Use a clear description." },
    ],
    pitfalls: [
      "Editing an in-use account: every entry inherits the new description. You can do it, but think carefully first.",
    ],
  },

  // ========================================================================
  // ACCOUNTING — COUNTERPARTIES
  // ========================================================================
  '/client/contacts': {
    title: 'Counterparties (customers & suppliers)',
    audience: 'comptable',
    intro:
      "Directory of the company's customers and suppliers: name, BRN, email, telephone, address, payment terms. Used by invoices and reminders.",
    steps: [
      { title: "Create a counterparty", body: "Click <b>New</b>. Type (customer / supplier / both), company, MRA BRN, email, address, payment terms (30d net, 60d, etc.)." },
      { title: "Link to invoices", body: "When you create an invoice, choose the counterparty from the list. The details auto-fill the PDF." },
    ],
    pitfalls: [
      "Missing or incorrect BRN: the VAT return may be rejected by the MRA if the counterparty exceeds MUR 100,000/year.",
      "Missing email: impossible to send the invoice automatically.",
    ],
  },

  // ========================================================================
  // HR — DASHBOARD
  // ========================================================================
  '/rh': {
    title: 'HR dashboard',
    audience: 'all',
    intro:
      "HR overview: headcount, pending leave, alerts (expiring contracts, return from maternity, length of service), upcoming payrolls.",
    steps: [
      { title: "Active headcount", body: "Number of active employees, by contract type (permanent, fixed-term, etc.). Click for the full list." },
      { title: "Pending requests", body: "Leave to validate (manager / management). Approve or reject in 1 click from here or via Telegram." },
      { title: "HR alerts", body: "Fixed-term contracts about to expire, returns from maternity, employees approaching 5 years (long service leave), etc." },
    ],
    tips: [
      "The Telegram bot sends proactive notifications at 09:00 every day: new leave request, employee running late, etc.",
    ],
  },

  // ========================================================================
  // HR — EMPLOYEES
  // ========================================================================
  '/rh/employes': {
    title: 'Employees',
    audience: 'all',
    intro:
      "List of all employees (active plus archived). Create, edit and archive employees here. This is the source of truth for payroll and the HR record.",
    steps: [
      { title: "Create an employee", body: "Click <b>New</b>. Enter first name, last name, position, start date, basic salary, currency, bank details. The employee code is generated automatically." },
      { title: "Fill in email and phone", body: "Email is mandatory for the payslip sent by email and to link to the Telegram bot. Phone is for urgent notifications." },
      { title: "Add the contract", body: "Tab <b>Contracts</b>: type (permanent / fixed-term / seasonal etc.), start/end date, basic salary, fixed allowances." },
      { title: "Activate the HR record", body: "Once complete the employee appears in the payroll calculation and can receive a Telegram code via Bot Permissions." },
    ],
    pitfalls: [
      "Entering a leave date: the employee drops out of the payroll calculation from the following month. Check twice before saving.",
      "Incomplete bank details: the employee will end up in the 'NO BANK' file when running salary transfers.",
    ],
  },

  // ========================================================================
  // HR — LEAVE
  // ========================================================================
  '/rh/conges': {
    title: 'Leave',
    audience: 'all',
    intro:
      "Manage leave requests (AL, SL, VL, FML, ML, PL) and their validation. Shows the balance per employee plus the history.",
    steps: [
      { title: "Submit a request (employee)", body: "Click <b>Request leave</b>. Type (annual, sick, vacation, family, maternity, paternity), start/end dates, optional reason." },
      { title: "The manager receives the notification", body: "Telegram notification plus the request appears in 'Pending' here. <em>Validate</em> / <em>Reject</em> buttons directly." },
      { title: "Balance updated", body: "If validated, days are deducted from the balance. If rejected, the employee receives the decision with a reason." },
    ],
    pitfalls: [
      "Request on days without balance: auto-rejected (unless you allow a negative balance for that employee).",
      "Sickness without a medical certificate beyond 6 days: the SL balance with certificate (15 days) does not unlock. Ask the employee for the certificate.",
    ],
    externalLinks: [
      { label: "Workers Rights Act 2019 — Leave", url: "https://labour.govmu.org/Pages/Workers-Rights-Act-2019.aspx" },
    ],
  },

  // ========================================================================
  // HR — CLOCKING
  // ========================================================================
  '/rh/pointage': {
    title: 'Clock-ins',
    audience: 'all',
    intro:
      "Tracking employees' arrival and departure times. The basis for calculating overtime and unauthorised absences.",
    steps: [
      { title: "Manual entry", body: "Click <b>New clock-in</b>. Employee, date, in time and out time. For occasional corrections." },
      { title: "Clock in via Telegram", body: "Every employee linked to the bot can clock in by typing <b>/in</b> and <b>/out</b> (or \"I'm starting\" / \"I'm finishing\" in natural language). Simpler than a badge." },
      { title: "No-show monitoring", body: "If the schedule and the clock-in differ, the bot alerts the manager and the employee after 10 minutes (see Bot Permissions)." },
    ],
    tips: [
      "For remote work, Telegram clock-in is enough. No physical badge reader needed.",
    ],
  },

  // ========================================================================
  // HR — SCHEDULE
  // ========================================================================
  '/rh/planning': {
    title: 'Schedule',
    audience: 'all',
    intro:
      "Weekly team schedules (shifts, working hours). Used as the reference for absence detection and overtime calculation.",
    steps: [
      { title: "Create a shift template", body: "Tab <b>Templates</b>: for example \"Office 9-6\", \"Evening shift 2-10pm\". Hours, days, breaks." },
      { title: "Assign an employee", body: "Drag and drop an employee onto a day to allocate a shift. You can build schedules over 1 week or 1 month." },
      { title: "Publish", body: "Once validated, publish. Employees see their schedule and the Telegram bot monitors clock-ins against those times." },
    ],
    pitfalls: [
      "Editing a published schedule: employees are not notified automatically. Let them know via Telegram or email.",
    ],
  },

  // ========================================================================
  // HR — BONUSES
  // ========================================================================
  '/rh/paie/primes': {
    title: 'Bonuses',
    audience: 'comptable',
    intro:
      "Add variable bonuses to the current month's payroll: performance, length of service, exceptional. They add to the gross salary and impact PAYE / CSG / NSF.",
    steps: [
      { title: "Select employee and period", body: "Choose the employee concerned and the month. The bonus will be integrated into the next payslip." },
      { title: "Type of bonus", body: "Performance, length of service, exceptional bonus, pro-rated 13th month, etc. Configurable catalogue." },
      { title: "Amount in MUR", body: "Enter the gross amount. PAYE / CSG / NSF are applied automatically according to the scale." },
    ],
    tips: [
      "You can add a bonus via Telegram: \"5000 mur bonus for Marie May\" and the bot enters it here automatically.",
    ],
  },

  // ========================================================================
  // HR — OVERTIME
  // ========================================================================
  '/rh/paie/ot': {
    title: 'Overtime',
    audience: 'comptable',
    intro:
      "Capture of overtime worked by employees during the month. Calculated at 1.5x (first 10 weekly OT hours) or 2x (beyond that, Sundays, public holidays).",
    steps: [
      { title: "Choose the employee and the month", body: "Selector at the top. You see the hours already captured." },
      { title: "Add the hours", body: "Date, number of hours, rate (1.5x or 2x), reason. The calculation is added automatically to the payslip." },
    ],
    externalLinks: [
      { label: "Workers Rights Act 2019 — Overtime", url: "https://labour.govmu.org/Pages/Workers-Rights-Act-2019.aspx" },
    ],
    tips: [
      "Via Telegram: \"Jean 8h OT 1.5x May\": the bot captures it automatically.",
    ],
  },

  // ========================================================================
  // TAX — TDS
  // ========================================================================
  '/client/mra-tds': {
    title: 'TDS (Tax Deducted at Source)',
    audience: 'comptable',
    intro:
      "Withholding tax on payments (Section 111A ITA Mauritius). Professional services 5% residents / 10% non-residents, interest 15%, rent 5%, royalties 15%, commission 3%, contracts over MUR 300k at 0.75%.",
    steps: [
      { title: "Identify the relevant payments", body: "Lexora automatically flags supplier invoices that fall within TDS (based on service nature, amount and residency status)." },
      { title: "Generate the monthly return", body: "Click <b>Declare TDS for the month</b>. Lexora produces the CSV file and the summary to submit on eservices.mra.mu by the 20th of the following month." },
      { title: "Pay the withheld amount", body: "Pay the MRA. Mark the return as <b>paid</b> in Lexora." },
    ],
    pitfalls: [
      "Forgetting TDS on an eligible payment: 5% penalty plus interest. Check each flagged invoice.",
      "Late after the 20th of the following month: automatic MRA penalties.",
    ],
    externalLinks: [
      { label: "MRA TDS portal", url: "https://eservices.mra.mu" },
      { label: "Section 111A ITA — MRA guide", url: "https://www.mra.mu/index.php/eservices/tax-deduction-at-source-tds" },
    ],
  },

  // ========================================================================
  // TAX — CIT / APS
  // ========================================================================
  '/client/mra-cit': {
    title: 'CIT — Corporate Income Tax',
    audience: 'comptable',
    intro:
      "Corporate income tax (15% standard, 3% effective for GBC1 with the Partial Exemption Regime 80%). Annual return 6 months after year end plus quarterly APS.",
    steps: [
      { title: "Track the taxable result", body: "The income statement gives you the accounting result. Lexora applies tax adjustments (non-deductible expenses, etc.) to arrive at the taxable base." },
      { title: "Calculate APS", body: "Quarterly advance payment system. Lexora calculates 25% of the estimated tax each quarter. Submit to the MRA before the end of the quarter." },
      { title: "Annual return", body: "6 months after year end. Lexora consolidates all elements and deducts the APS paid. Balance to pay or refund." },
    ],
    pitfalls: [
      "Underestimating APS: penalty if the annual balance is more than 25% above the cumulative advances.",
      "For GBC1: forgetting to document substance (CIGA) means losing the 3% effective regime.",
    ],
    externalLinks: [
      { label: "MRA CIT portal", url: "https://eservices.mra.mu" },
      { label: "MRA CIT guide", url: "https://www.mra.mu/index.php/eservices/income-tax-companies" },
    ],
  },

  // ========================================================================
  // CLIENT — PROFILE
  // ========================================================================
  '/client/profil': {
    title: 'My profile',
    audience: 'client',
    intro:
      "Your personal information in Lexora: name, email, password, language, notification preferences. Plus the Telegram link to use the bot.",
    steps: [
      { title: "Update your details", body: "Full name, email, telephone. These details are used in signatures and notifications." },
      { title: "Change your password", body: "Dedicated button. Choose a strong password (12 characters minimum, mix of everything)." },
      { title: "Connect Telegram", body: "Telegram section: click <b>Generate a code</b>, open Telegram, search for @LexoraAgent_bot, type <b>/start CODE</b>. You will then be able to manage your books from Telegram." },
      { title: "Choose your language", body: "French (Mauritius) or English. Affects the UI and the Telegram bot's responses." },
    ],
    tips: [
      "Enable 2FA if Supabase offers it to secure your account.",
    ],
  },

  // ========================================================================
  // CLIENT — TELEGRAM CONFIG
  // ========================================================================
  '/client/telegram-config': {
    title: 'Telegram configuration (personal)',
    audience: 'all',
    intro:
      "Link your Lexora account to your Telegram account so you can use the @LexoraAgent_bot: managing invoices, payroll, calendar and banking from your phone.",
    steps: [
      { title: "Generate a code", body: "Click <b>Generate a code</b>. You will get a 6-character code valid for 15 minutes." },
      { title: "Open Telegram", body: "On your phone, search for <b>@LexoraAgent_bot</b> or use the direct link provided." },
      { title: "Type /start CODE", body: "Start a conversation with the bot and send <b>/start ABCXYZ</b> (replace ABCXYZ with your code). The account is linked." },
      { title: "Test", body: "Send \"hello\" to the bot. It should greet you by your first name and tell you what it can help you with based on your role." },
    ],
    pitfalls: [
      "Expired code (over 15 minutes): regenerate one.",
      "If you change Telegram number, run <b>/logout</b> on the old one and reconnect with a new code.",
    ],
    tips: [
      "If you manage several companies, the bot will ask which one to activate via <b>/societe</b>.",
    ],
  },

  // ========================================================================
  // PRACTICE — DASHBOARD
  // ========================================================================
  '/comptable/cabinet': {
    title: 'Practice dashboard',
    audience: 'comptable',
    intro:
      "Aggregate view of all the practice's clients: tasks of the month per client (VAT, payroll, MRA, invoices), cumulative KPIs, critical alerts, collaborators in charge.",
    steps: [
      { title: "Filter by client", body: "Overview or drill-down on a specific client. You can tag clients (urgent, in progress, pending, etc.)." },
      { title: "Work in progress", body: "List of tasks assigned to you (VAT May, payroll June, etc.) with deadline and status." },
      { title: "Acting as", body: "Button on a client to <b>switch into client mode</b>: you see Lexora as if you were the director of that company. Useful for data entry." },
    ],
    tips: [
      "Assign collaborators to each client (Collaborators tab): everyone sees their own scope.",
    ],
  },

  // ========================================================================
  // DOCUMENTS
  // ========================================================================
  '/client/documents': {
    title: 'Documents',
    audience: 'all',
    intro:
      "All documents (supplier invoices, bank statements, contracts, supporting documents) uploaded to Lexora. The OCR extracts the information automatically so you can invoice/post entries.",
    steps: [
      { title: "Upload a document", body: "Drag and drop or click <b>Import</b>. PDF, JPG, PNG, XLSX formats. Up to 20 MB per file." },
      { title: "Auto OCR", body: "Lexora analyses via Claude AI: type of document detected (supplier invoice, bank statement, payslip, etc.), amounts extracted, supplier, date." },
      { title: "Validate the creation", body: "If OCR is correct: 1 click to create the supplier invoice or record the statement. Otherwise, correct the fields before validating." },
    ],
    pitfalls: [
      "Poor quality document (blurry photo, crumpled paper): OCR is less reliable, correct it manually.",
      "If status is 'error', click <b>Re-analyse</b> to run OCR again.",
    ],
    tips: [
      "You can send a photo of a document straight to the Telegram bot: it ingests it and suggests the creation.",
    ],
  },

  // ========================================================================
  // FINANCIAL DASHBOARD + INVOICES (client view)
  // ========================================================================
  '/client/tableau-de-bord-financier': {
    title: 'Financial dashboard',
    audience: 'client',
    intro:
      "Overview of your company's financial health: cash position, revenue, expenses, profit. Everything is calculated in real time from the invoices and journal entries.",
    steps: [
      { title: "Select the period", body: "Current month by default. You can change it to compare." },
      { title: "Read the key indicators", body: "<b>Cash</b> = balance of all bank accounts. <b>Revenue</b> = customer invoices issued. <b>Expenses</b> = supplier invoices received. <b>Profit</b> = revenue minus expenses." },
      { title: "Drill down", body: "Click on a figure to see the detail (invoices making up the revenue, transactions in the cash position, etc.)." },
      { title: "Compare with the previous month", body: "The percentage change is shown. A sharp drop is an alert to investigate." },
    ],
    tips: [
      "Ask the Telegram bot \"financial briefing\" for a mobile summary.",
      "For the true accounting balance sheet / income statement, go to Accounting then Balance sheet / General ledger.",
    ],
  },

  '/client/factures': {
    title: 'Customer invoices (view)',
    audience: 'client',
    intro:
      "Review all the invoices issued to your customers. Track who has paid, who still owes, and trigger reminders.",
    steps: [
      { title: "Filter", body: "By status (pending / paid / overdue), by customer, by period. Search across every field." },
      { title: "Create an invoice", body: "Click <b>New invoice</b>. Choose the customer, add the lines (from the catalogue or free), Lexora calculates VAT and the total automatically." },
      { title: "Send to the customer", body: "A 'pending' invoice can be emailed with the PDF attached." },
      { title: "Record payments", body: "When the customer pays, open the invoice and click <b>Record payment</b>." },
    ],
    tips: [
      "Create an invoice via Telegram: \"invoice ACME 50000 MUR consulting\".",
      "For recurring subscriptions, go to Recurrences.",
    ],
  },

  '/client/nouvelle-facture': {
    title: 'New invoice',
    audience: 'client',
    intro:
      "Create a new customer invoice. Lexora automatically applies the numbering (company prefix + YYYY-NNNNN) and calculates VAT and the gross total from the lines.",
    steps: [
      { title: "Choose the customer", body: "Select from the list or create a new contact (name, BRN, email, address). BRN is important for VAT." },
      { title: "Add the lines", body: "For each service: description, quantity, unit price, VAT rate. You can pick from the services catalogue." },
      { title: "Check the totals", body: "Net, VAT 15%, gross. If wrong, return to the lines." },
      { title: "Terms and notes", body: "Due date (30 days by default), payment terms, internal notes (not visible to the customer)." },
      { title: "Issue or draft", body: "<b>Draft</b> = editable. <b>Issue</b> = PDF generated, automatic number, posted, immutable." },
    ],
    pitfalls: [
      "Issuing without a contact email: impossible to send automatically.",
      "Wrong VAT rate: your VAT return will be incorrect.",
    ],
    tips: [
      "For an invoice similar to an existing one, click <b>Duplicate</b> on the old one.",
    ],
  },

  '/client/nouvelle-facture-ia': {
    title: 'New invoice via AI',
    audience: 'client',
    intro:
      "Describe your invoice in natural language: Claude AI automatically extracts the customer, lines, amounts and VAT. Faster than the form.",
    steps: [
      { title: "Write in English (or French)", body: "Example: \"Invoice ACME Ltd, consulting September 2026, MUR 50,000 net + 15% VAT, 30 days\"." },
      { title: "AI proposes a draft", body: "Lexora identifies the customer (searches your database), creates the lines, calculates VAT. Review the preview." },
      { title: "Adjust if needed", body: "Edit each line before validating. The AI is fast but not perfect on complex cases." },
      { title: "Issue", body: "Click <b>Issue</b>. The invoice goes through to accounting." },
    ],
    tips: [
      "Same idea from Telegram with the bot.",
    ],
  },

  '/client/recurrences': {
    title: 'Recurring invoices',
    audience: 'client',
    intro:
      "Configure invoices that are generated automatically every month / quarter / year (rents, subscriptions, recurring contracts).",
    steps: [
      { title: "Create a template", body: "Click <b>New template</b>. Customer, lines, frequency, start date, day of issue, optional end date." },
      { title: "The daily cron", body: "Every day at 06:00 UTC, Lexora checks which templates are due and clones a 'pending' invoice." },
      { title: "Pause / resume", body: "You can suspend a template without deleting it." },
    ],
    pitfalls: [
      "Editing the terms: only FUTURE invoices inherit them.",
    ],
    tips: [
      "Create via Telegram: \"rent ACME 50000 MUR every month from 1 June\".",
    ],
  },

  '/client/relances': {
    title: 'Invoice reminders',
    audience: 'client',
    intro:
      "Automatic tracking of unpaid invoices. Lexora sends email reminders on a configurable cadence (D+7, D+15, D+30 after the due date).",
    steps: [
      { title: "Configure the delays", body: "Invoicing settings. For example friendly D+7, firm D+15, formal notice D+30. Customise the templates." },
      { title: "The daily cron sends them", body: "Every day at 08:00 UTC reminders are sent by email. You receive a summary." },
      { title: "Suspend a reminder", body: "For a customer awaiting a promised payment, suspend then re-enable later." },
      { title: "History", body: "For each invoice, see all reminders sent (date, level, channel)." },
    ],
    tips: [
      "The Telegram bot alerts you every morning if there are more than 5 overdue invoices.",
    ],
  },

  // ========================================================================
  // FINANCIAL STATEMENTS
  // ========================================================================
  '/client/bilan': {
    title: 'Balance sheet',
    audience: 'client',
    intro:
      "Statement of financial position at a given date: what the company OWNS (assets) versus what it OWES (liabilities). The reference for measuring solidity.",
    steps: [
      { title: "Choose the date", body: "Month, quarter or year end. Lexora consolidates every entry up to that date." },
      { title: "Read the assets", body: "Fixed assets, inventories, trade receivables, cash. What the company 'owns'." },
      { title: "Read the liabilities", body: "Capital plus retained earnings, payables to suppliers/banks, social contributions due." },
      { title: "Balance", body: "Total assets = Total liabilities. If there is a gap, an entry is missing or incorrect." },
      { title: "PDF export", body: "Format compliant with IFRS for SMEs / Full IFRS. To submit to the banker or statutory auditor." },
    ],
    pitfalls: [
      "A non-zero balance on a suspense account (47x): clear it before official issuance.",
    ],
  },

  '/client/grand-livre': {
    title: 'General ledger',
    audience: 'client',
    intro:
      "Account-by-account detail of every entry. For each chart of accounts entry, its movements and balance.",
    steps: [
      { title: "Choose an account", body: "List on the left, or search by number/description." },
      { title: "Filter the period", body: "Start/end date. Opening balance + movements + closing balance." },
      { title: "Drill down", body: "Click on an entry to view the source document (invoice, payment, OD)." },
      { title: "Export", body: "PDF or CSV (FEC for auditors)." },
    ],
  },

  // ========================================================================
  // MRA HUB + SPECIFIC RETURNS
  // ========================================================================
  '/client/mra-hub': {
    title: 'MRA hub — all your tax obligations',
    audience: 'all',
    intro:
      "Centralised view of every MRA return: VAT, PAYE, CSG/NSF, PRGF, TDS, CIT, ROC, FSC, SFT. Deadlines and statuses all in one place.",
    steps: [
      { title: "List of returns due", body: "Sorted by deadline. Returns within the next 7 days are highlighted." },
      { title: "Open a return", body: "You access the form / summary depending on the type (VAT, PAYE, CIT, etc.)." },
      { title: "Submit to the MRA", body: "Lexora generates the files. Upload them manually on eservices.mra.mu OR let the Telegram robot submit them (see MRA Access)." },
    ],
    externalLinks: [
      { label: "MRA eServices portal", url: "https://eservices.mra.mu" },
      { label: "Official MRA calendar", url: "https://www.mra.mu/index.php/eservices/tax-calendar" },
    ],
    tips: [
      "Enable Telegram notifications for D-7 / D-3 / D-1 reminders.",
    ],
  },

  '/client/mra-roc': {
    title: 'ROC Annual Return',
    audience: 'all',
    intro:
      "Mandatory annual return with the Registrar of Companies. To be filed within 28 days following the AGM.",
    steps: [
      { title: "Hold your AGM", body: "Annual General Meeting within 15 months of incorporation, then annually. Minutes to be drafted." },
      { title: "Prepare the financial statements", body: "Balance sheet plus income statement, audited if required. Lexora generates the statements." },
      { title: "File the Annual Return", body: "On eROC, or via a company secretary. Fee: about MUR 2,000." },
      { title: "Watch the deadline", body: "28 days after the AGM. Beyond that: penalties and risk of strike-off." },
    ],
    externalLinks: [
      { label: "Mauritius eROC portal", url: "https://onlinebrd.govmu.org/" },
    ],
  },

  '/client/mra-sft': {
    title: 'SFT — Statement of Financial Transactions',
    audience: 'comptable',
    intro:
      "Mandatory AML/CFT return to the FIU/MRA for unusual financial transactions (thresholds: MUR 500k cash, USD 100k wire transfer).",
    steps: [
      { title: "Identify", body: "Cash over MUR 500k, international wires over USD 100k, or an unusual pattern (structuring, suspicious counterparty)." },
      { title: "Document", body: "For each transaction: amount, parties, stated reason, supporting documents. Retain for 7 years." },
      { title: "Report to the FIU", body: "Click <b>Submit SFT</b>. STR/CTR format. 5 working days after detection." },
    ],
    pitfalls: [
      "Failure to report: penalty up to MUR 100k plus imprisonment for the officer.",
      "Tipping off (informing the client): serious offence.",
    ],
    externalLinks: [
      { label: "Mauritius FIU", url: "https://www.fiumauritius.org" },
    ],
  },

  '/client/echeances': {
    title: 'Tax deadlines',
    audience: 'all',
    intro:
      "Calendar of every tax and social obligation: VAT (20th of the month), PAYE/CSG/NSF (20th), quarterly CIT, annual ROC, FSC GBC, etc.",
    steps: [
      { title: "Chronological view", body: "Deadlines sorted by the closest first. Within 7 days = amber, under 3 days = red." },
      { title: "Mark as filed / paid", body: "Once submitted and paid, mark it so it disappears." },
      { title: "Filter by type", body: "Show only VAT, or payroll, or everything." },
    ],
    tips: [
      "The Telegram bot sends you D-7 / D-3 / D-1 reminders.",
    ],
  },

  '/client/declarations-sociales': {
    title: 'Social contributions returns (CSG, NSF, PRGF)',
    audience: 'all',
    intro:
      "Monthly social contributions: CSG, NSF, PRGF. Deadline: 20th of the following month.",
    steps: [
      { title: "Calculate payroll", body: "HR then Payroll. CSG / NSF / PRGF calculated automatically on each payslip." },
      { title: "Generate the MRA files", body: "HR then Payroll then MRA exports. CSV for CSG/NSF and PRGF." },
      { title: "Submit to the MRA", body: "On eservices.mra.mu, upload the files, validate, pay the balance before the 20th." },
    ],
    pitfalls: [
      "Error on the base (basic + allowances + bonuses): every contribution is wrong.",
      "Late after the 20th: 5% penalty plus interest.",
    ],
  },

  // ========================================================================
  // GBC
  // ========================================================================
  '/client/gbc-dashboard': {
    title: 'GBC — Global Business dashboard',
    audience: 'all',
    intro:
      "Overview of GBC obligations: substance, Transfer Pricing, CRS/FATCA, Pillar Two, UBO.",
    steps: [
      { title: "Company status", body: "GBC1 (Partial Exemption 80% then 3% effective) or Authorised Company (15% but exempt if non-resident)." },
      { title: "Key deadlines", body: "FSC Annual Return (6 months after year end, USD 1,750 GBC1 / USD 350 AC), audit, Country-by-Country if MNE turnover > EUR 750M." },
      { title: "Substance & CIGA", body: "To retain the 3%, document the Core Income-Generating Activities (qualified Mauritius employees, operating expenditure, board of directors)." },
    ],
    externalLinks: [
      { label: "Mauritius FSC", url: "https://www.fscmauritius.org" },
    ],
  },

  // ========================================================================
  // HR — LEAVERS, SEVERANCE, EOY, PROVISIONS
  // ========================================================================
  '/rh/depart': {
    title: 'Employee departure',
    audience: 'all',
    intro:
      "Leaver process: resignation, dismissal, end of fixed-term contract, retirement. Calculates severance, final pay, certificate and filings.",
    steps: [
      { title: "Enter the leave date", body: "Employee record then date_depart. Triggers the automatic calculations." },
      { title: "Notice observed", body: "WRA 2019: minimum 30 days if 1 year or more of service. Notice given and paid if not served." },
      { title: "Severance calculation", body: "S.70 WRA: 3 months x years of service (except retirement at 60 or over: 1 month x years). Lexora calculates automatically." },
      { title: "Final pay", body: "Pro-rated salary + paid leave + pro-rated 13th month + severance. Final payslip." },
      { title: "Certificate & filings", body: "Generate the certificate of employment. Declare the departure to the MRA via the PAYE Exit Statement." },
    ],
    pitfalls: [
      "Forgetting notice: dispute before the Mauritian industrial court.",
      "Wrong severance calculation: costly dispute. Check the WRA.",
    ],
    externalLinks: [
      { label: "WRA 2019 — Severance", url: "https://labour.govmu.org/Pages/Workers-Rights-Act-2019.aspx" },
    ],
  },

  '/rh/severance': {
    title: 'Severance calculation',
    audience: 'comptable',
    intro:
      "Detailed calculation of end-of-contract compensation (WRA S.70). A simulation tool.",
    steps: [
      { title: "Parameters", body: "Employee, start date, anticipated departure date, reason (resignation / dismissal / retirement)." },
      { title: "Detailed calculation", body: "Months x average salary x years of service. WRA S.70 formula applied." },
      { title: "Provision", body: "If you anticipate a departure: Provisions then Severance." },
    ],
    tips: [
      "Retirement at 60 or over: 1 month x years instead of 3. Major difference.",
    ],
  },

  '/rh/eoy-bonus': {
    title: 'End-of-Year Bonus (13th month)',
    audience: 'comptable',
    intro:
      "Mandatory end-of-year bonus under WRA 2019: 1/12 of annual salary per month worked. Paid in December.",
    steps: [
      { title: "Eligibility", body: "Every employee who has worked at least 1 month in the year. Seasonal / part-time included." },
      { title: "Run the calculation", body: "Click <b>Calculate EOY {year}</b>. (average salary x months worked) / 12." },
      { title: "Validate and pay", body: "EOY payslip separate from the regular monthly payslip." },
    ],
    pitfalls: [
      "Forgetting seasonal workers: dispute.",
      "Calculating on basic salary only: wrong. WRA says 'remuneration' including allowances.",
    ],
  },

  '/rh/declarations-mra': {
    title: 'Payroll MRA returns',
    audience: 'comptable',
    intro:
      "Monthly payroll returns to the MRA: PAYE, CSG/NSF, PRGF. Deadline: 20th of the following month.",
    steps: [
      { title: "Lock payroll", body: "Before filing, lock the period. Payslips validated and posted." },
      { title: "Generate the files", body: "Tabs PAYE-MRA, CSG/NSF-MRA, PRGF-MRA. PDF summary plus CSV detail for each." },
      { title: "Submit via eservices.mra.mu", body: "Log in, upload the CSV files. Note the submission reference." },
      { title: "Pay", body: "Balance to pay before the 20th of the following month." },
    ],
    externalLinks: [
      { label: "MRA portal — eServices", url: "https://eservices.mra.mu" },
    ],
    tips: [
      "Configure MRA credentials under Management then MRA Access for automatic submission via Telegram.",
    ],
  },

  '/rh/provisions/conges': {
    title: 'Paid leave provision (IAS 19)',
    audience: 'comptable',
    intro:
      "Accounting provision for accrued unused leave. IAS 19 requirement. Lexora calculates it automatically every month.",
    steps: [
      { title: "Automatic monthly calculation", body: "End of month: accrued leave days x daily rate per employee. Total = provision to post." },
      { title: "Automatic entry", body: "Debit 6411 Salaries (expense), Credit 4282 Leave provision. Reversed when leave is taken." },
      { title: "Tracking", body: "Provision at start of month, movements (accrual, leave taken), provision at end." },
    ],
  },

  // ========================================================================
  // PRACTICE
  // ========================================================================
  '/comptable/clients': {
    title: 'Practice client portfolio',
    audience: 'comptable',
    intro:
      "Every client your practice looks after. Companies, work in progress, status, assigned collaborators.",
    steps: [
      { title: "Filter and search", body: "By name, sector, tag (urgent, VIP), assigned collaborator." },
      { title: "Open a client", body: "Detail: client's companies, tasks for the month, last interactions, contact." },
      { title: "Acting as", body: "Switch to client mode: Lexora as if you were the director. Useful for entry/checking." },
    ],
    tips: [
      "Assign collaborators to each client to scope who sees/edits what.",
    ],
  },

  '/comptable/equipe': {
    title: 'Practice team',
    audience: 'comptable',
    intro:
      "Management of the practice's collaborators: who does what, on which clients, with what rights.",
    steps: [
      { title: "Add a collaborator", body: "Click <b>Invite</b>. Email, role, client assignments." },
      { title: "Assign clients", body: "Each collaborator only sees their assigned clients (except admin)." },
      { title: "Time tracking", body: "Optional: time capture per client/task. Useful for billing the practice." },
    ],
  },

  // ========================================================================
  // ALERTS + SETTINGS + COMPANIES
  // ========================================================================
  '/client/alertes': {
    title: 'Alerts and notifications',
    audience: 'all',
    intro:
      "Alerts centre: tax deadlines, overdue invoices, missing documents, banking anomalies.",
    steps: [
      { title: "Filter by severity", body: "Critical (immediate), Important (within the week), Info (to monitor)." },
      { title: "Resolve an alert", body: "Click to navigate to the relevant page and deal with it. The alert disappears once resolved." },
      { title: "Enable Telegram", body: "Configure in Bot Permissions. Critical alerts pushed live." },
    ],
    tips: [
      "The bot delivers a morning briefing at 09:00 every day.",
    ],
  },

  '/client/facturation-settings': {
    title: 'Invoicing settings',
    audience: 'client',
    intro:
      "Configure everything related to invoices: numbering, logo, terms, reminders, IBAN, legal mentions.",
    steps: [
      { title: "Numbering", body: "Format: prefix + YYYY + sequential number. Customise the prefix." },
      { title: "Logo and details", body: "Upload the logo. Check the address, BRN, VAT number and IBAN displayed on the PDF." },
      { title: "Payment terms", body: "Default delay, method (transfer, cheque), text on the invoice." },
      { title: "Reminder cadence", body: "1st D+7, 2nd D+15, formal notice D+30. Customise the templates." },
    ],
  },

  '/client/parametres-rh': {
    title: 'HR settings',
    audience: 'all',
    intro:
      "HR rules: leave, working hours, payroll, public holidays.",
    steps: [
      { title: "Leave rules", body: "Initial balance, accrual (1.83d/month for AL), carry-over, period of use." },
      { title: "Working hours", body: "45h/week WRA, 8h/day, breaks. Used in overtime calculation." },
      { title: "Payroll settings", body: "Pay day, method (transfer, cheque), default accounts." },
    ],
  },

  '/client/societes': {
    title: 'My companies',
    audience: 'client',
    intro:
      "List of the companies you manage. Quick switch between them, plus the ability to add a new one.",
    steps: [
      { title: "Switch", body: "Selector at the top. The whole app filters on the active company." },
      { title: "Create a company", body: "Click <b>New</b>. Name, BRN, MRA TAN, sector, incorporation date." },
      { title: "Edit", body: "Details, logo, tax settings, addresses, bank accounts." },
    ],
    pitfalls: [
      "Do not delete a company that has journal entries. Archive it instead.",
    ],
  },

  '/client/utilisateurs': {
    title: 'Company users',
    audience: 'client',
    intro:
      "Who can access this company in Lexora: directors, accountants, employees.",
    steps: [
      { title: "Invite", body: "Click <b>Invite</b>. Email, role. An email is sent so they can create their account." },
      { title: "Change a role", body: "Edit the row. The role determines the rights (matrix)." },
      { title: "Deactivate an account", body: "When a collaborator leaves. History preserved." },
    ],
    tips: [
      "For the Telegram bot, also go to Bot Permissions for fine-grained capabilities.",
    ],
  },

  // ========================================================================
  // LEX AI + OCR + FX RATES
  // ========================================================================
  '/client/lex-factures': {
    title: 'Lex — AI invoices',
    audience: 'client',
    intro:
      "AI module to create invoices quickly and detect anomalies.",
    steps: [
      { title: "Create in natural language", body: "\"invoice acme 50k consulting september\": the AI extracts everything and proposes a draft." },
      { title: "Anomaly detection", body: "The AI scans for suspicious amounts (duplicates, VAT errors, abnormal customer pricing)." },
      { title: "Smart reminders", body: "The AI analyses payment history and proposes personalised messages." },
    ],
  },

  '/client/lex-ocr': {
    title: 'Lex OCR — Document recognition',
    audience: 'client',
    intro:
      "Drop a PDF / photo: Claude AI reads the content and extracts the supplier, amounts, dates and VAT.",
    steps: [
      { title: "Drop a document", body: "PDF, JPG, PNG, XLSX. Max 20 MB." },
      { title: "The AI analyses it", body: "Claude Vision identifies the type and extracts the structured fields." },
      { title: "Validate or correct", body: "Summary proposed. 1 click to create the entry/invoice." },
    ],
    tips: [
      "Send it to the Telegram bot too: same result.",
    ],
  },

  '/client/taux-change': {
    title: 'Exchange rates',
    audience: 'comptable',
    intro:
      "History of MUR/EUR/USD/GBP rates. Updated daily and automatically.",
    steps: [
      { title: "Today's rate", body: "Official MRA rates for the major currencies." },
      { title: "History", body: "Rates of the last few months. Essential for backdated entries (IAS 21)." },
      { title: "Manual refresh", body: "If needed (otherwise auto at 05:30 every day)." },
    ],
    externalLinks: [
      { label: "Official MRA rates", url: "https://www.mra.mu/index.php/exchange-rates" },
    ],
  },
}
