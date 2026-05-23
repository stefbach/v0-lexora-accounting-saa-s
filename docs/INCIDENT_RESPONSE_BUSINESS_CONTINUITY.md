# Incident Response & Business Continuity Plan
## Lexora Accounting SaaS Platform

**Document Version**: 1.0  
**Effective Date**: May 22, 2026  
**Last Updated**: May 22, 2026  
**Classification**: CONFIDENTIAL (Internal Use)  
**Prepared for**: Big 4 Audit Compliance  

---

## TABLE OF CONTENTS

1. [Executive Summary](#executive-summary)
2. [Critical Systems & RTO/RPO Targets](#critical-systems--rtorpo-targets)
3. [Incident Response Organization](#incident-response-organization)
4. [Incident Classification & Severity](#incident-classification--severity)
5. [Response Procedures](#response-procedures)
6. [Business Continuity & Disaster Recovery](#business-continuity--disaster-recovery)
7. [Testing & Drills](#testing--drills)
8. [Communication Plan](#communication-plan)
9. [Recovery Procedures](#recovery-procedures)

---

## 1. EXECUTIVE SUMMARY

### 1.1 Purpose

This plan ensures Lexora can:
- ✅ Detect and respond to incidents within minutes
- ✅ Restore critical GL data within 4 hours (RTO)
- ✅ Minimize data loss to <1 hour (RPO)
- ✅ Communicate transparently with customers
- ✅ Maintain regulatory compliance during incidents

### 1.2 Key Targets

| System | RTO (Recovery Time) | RPO (Recovery Point) | SLA |
|---|---|---|---|
| **General Ledger** | 4 hours | 1 hour | 99.5% uptime |
| **Invoicing System** | 4 hours | 1 hour | 99.5% uptime |
| **Bank Reconciliation** | 6 hours | 4 hours | 99.0% uptime |
| **Payroll Module** | 8 hours | 4 hours | 99.0% uptime |
| **Reporting** | 12 hours | 1 day | 95% uptime |
| **Email & Support** | 24 hours | N/A | Best effort |

---

## 2. CRITICAL SYSTEMS & RTO/RPO TARGETS

### 2.1 System Criticality Assessment

**Tier 1: CRITICAL (Must restore first)**

```
General Ledger (GL) Module
├─ Database: ecritures_comptables_v2
├─ Impact of outage: Cannot post transactions, no audit trail
├─ Business impact: SEVERE (company cannot operate)
├─ Dependency: Foundation for all accounting
├─ RTO: 4 hours maximum
├─ RPO: 1 hour maximum
└─ Recovery priority: #1 (restore first)

Invoice Processing Module
├─ Database: factures, factures_lignes
├─ Impact of outage: Cannot issue invoices or record payments
├─ Business impact: SEVERE (revenue recognition stops)
├─ Dependency: Feeds GL, required for AR tracking
├─ RTO: 4 hours maximum
├─ RPO: 1 hour maximum
└─ Recovery priority: #2 (restore simultaneously with GL)
```

**Tier 2: HIGH (Restore within same day)**

```
Bank Reconciliation Module
├─ Database: transactions_bancaires, lettrage
├─ Impact of outage: Cannot match bank transactions to GL
├─ Business impact: HIGH (month-end close delayed)
├─ Dependency: Depends on GL & invoices
├─ RTO: 6 hours maximum
├─ RPO: 4 hours maximum
└─ Recovery priority: #3

Payroll Module
├─ Database: employes, bulletins_paie
├─ Impact of outage: Cannot calculate/process salaries
├─ Business impact: HIGH (employees not paid on time)
├─ Dependency: Feeds GL, MRA reporting
├─ RTO: 8 hours maximum
├─ RPO: 4 hours maximum
└─ Recovery priority: #4
```

**Tier 3: MEDIUM (Best effort)**

```
Reporting & Analytics
├─ Database: Views & aggregations (derived from GL)
├─ Impact of outage: Cannot view dashboards/reports
├─ Business impact: MEDIUM (data still accessible via export)
├─ Dependency: Depends on GL restoration
├─ RTO: 12 hours maximum
├─ RPO: 1 day
└─ Recovery priority: #5 (after GL, invoices, bank)

Email & Support
├─ Service: Transactional emails, support portal
├─ Impact of outage: Support delayed, no email confirmations
├─ Business impact: LOW (system still functional)
├─ Dependency: Optional, not critical
├─ RTO: 24 hours (next business day acceptable)
├─ RPO: N/A (not data-dependent)
└─ Recovery priority: #6 (last)
```

### 2.2 Dependencies & Recovery Order

**Recovery Sequence (Critical Path):**

```
START
  ↓
[1] Restore GL Database (Tier 1)
    ├─ Time: 0-2 hours (from backup)
    ├─ Verify: Trial balance, all accounts present
    └─ Status: Posted GL entries restored
  ↓
[2] Restore Invoicing Module (Tier 1)
    ├─ Time: 2-4 hours (parallel with GL)
    ├─ Verify: All invoice IDs present, GL links valid
    └─ Status: Invoices accessible, AR reconcilable
  ↓
[3] Restore Bank Module (Tier 2)
    ├─ Time: 4-6 hours (depends on GL ready)
    ├─ Verify: Bank transactions matched to GL
    └─ Status: Reconciliation can proceed
  ↓
[4] Restore Payroll Module (Tier 2)
    ├─ Time: 6-8 hours (depends on GL ready)
    ├─ Verify: Employee salary GL postings valid
    └─ Status: Salary processing can resume
  ↓
[5] Restore Reporting (Tier 3)
    ├─ Time: 8-12 hours (depends on GL)
    ├─ Verify: Dashboards, P&L, Balance Sheet correct
    └─ Status: Reports available for auditors
  ↓
[6] Email & Support (Tier 3)
    ├─ Time: 12-24 hours (lowest priority)
    ├─ Verify: Transactional emails flowing
    └─ Status: Support tickets responding
  ↓
COMPLETE (Full system restored)
```

---

## 3. INCIDENT RESPONSE ORGANIZATION

### 3.1 Incident Response Team

**5-Member Team:**

```
Incident Commander (IC)
├─ Role: Overall coordination & decision-making
├─ Responsibility: Direct all response activities, escalate to CEO
├─ Authority: Make emergency decisions (restart servers, rotate keys)
├─ Typical person: Chief Technology Officer (CTO)
└─ Backup: VP of Engineering

Database Administrator (DBA)
├─ Role: Database recovery & restoration
├─ Responsibility: Restore from backups, verify data integrity
├─ Authority: Make DB restoration decisions
├─ Typical person: Senior DBA
└─ Backup: Junior DBA (on-call 24/7)

Security Officer
├─ Role: Investigation & forensics
├─ Responsibility: Determine root cause, identify breach (if any)
├─ Authority: Approve security fixes, breach notification
├─ Typical person: Chief Security Officer (CSO)
└─ Backup: Head of Security Engineering

Communications Manager
├─ Role: Customer & stakeholder communication
├─ Responsibility: Prepare updates, send notifications
├─ Authority: Approve customer messages (with IC approval)
├─ Typical person: VP of Customer Success
└─ Backup: Marketing Manager

Finance & Legal Officer
├─ Role: Regulatory & contractual implications
├─ Responsibility: Assess SLA impact, breach notification requirements
├─ Authority: Approve financial commitments (credits, compensation)
├─ Typical person: Chief Financial Officer (CFO)
└─ Backup: General Counsel
```

### 3.2 On-Call Rotations

**24/7 Coverage:**

```
Primary On-Call:
├─ Weekdays (Mon-Fri, 8am-6pm): IC always available
├─ Evenings (Mon-Fri, 6pm-8am): Rotation among senior engineers
├─ Weekends & holidays: Rotation among all team members
└─ Response time: 15 minutes from alert

Backup On-Call:
├─ If primary unavailable: Backup activates within 15 minutes
├─ If primary + backup unavailable: Escalate to CEO directly
└─ Minimum: 2 people on-call at all times

Escalation Path:
├─ T+15min: Primary on-call activated
├─ T+30min: Backup on-call activated (if needed)
├─ T+1hour: Director-level escalation
├─ T+2hours: C-level (CEO/CFO) escalation
└─ T+4hours: Board notification (if customer-impacting)
```

### 3.3 Contact Information

**Critical Contacts:**

| Role | Primary | Backup | Escalation |
|---|---|---|---|
| **Incident Commander** | [On-call rotation] | [Backup name] | CEO: [phone] |
| **Database Admin** | [On-call rotation] | [Backup name] | CTO: [phone] |
| **Security Officer** | [On-call rotation] | [Backup name] | CSO: [phone] |
| **Communications** | [On-call rotation] | [Backup name] | VP Customer Success: [phone] |
| **Finance/Legal** | [On-call rotation] | [Backup name] | CFO: [phone] |

**To be updated with actual names/numbers before deployment**

---

## 4. INCIDENT CLASSIFICATION & SEVERITY

### 4.1 Incident Severity Levels

**SEVERITY 1: CRITICAL (Red)**
```
Criteria:
├─ GL module completely unavailable
├─ Multiple customers affected (>50% of base)
├─ Revenue-impacting (invoices cannot be issued)
├─ Data loss risk OR security breach confirmed
└─ RTO exceeded (>4 hours since outage)

Response:
├─ Full team activated immediately
├─ CEO notified within 15 minutes
├─ Customers notified within 30 minutes
├─ Hourly updates to stakeholders
└─ Media/press monitoring
```

**SEVERITY 2: HIGH (Orange)**
```
Criteria:
├─ One critical system down (GL, Invoicing, or Bank)
├─ Single customer or <25% of customer base affected
├─ Business process delayed but not halted
├─ Estimated RTO: 2-4 hours
└─ Data integrity threatened but not compromised

Response:
├─ IC + DBA + Security Officer activated
├─ CEO notified within 30 minutes
├─ Affected customers notified within 1 hour
├─ Updates every 2 hours
└─ Root cause analysis initiated
```

**SEVERITY 3: MEDIUM (Yellow)**
```
Criteria:
├─ Non-critical system down (Reporting, Email, Support)
├─ Single customer affected
├─ Workaround available (manual process)
├─ Estimated RTO: 4-24 hours
└─ No data loss risk

Response:
├─ IC + relevant technical lead activated
├─ Manager notification (not CEO)
├─ Affected customer notified within 2 hours
├─ Updates every 4 hours
└─ Standard troubleshooting procedures
```

**SEVERITY 4: LOW (Green)**
```
Criteria:
├─ Minor service degradation (slow performance)
├─ Isolated to single user or feature
├─ No business impact (informational)
├─ RTO: >24 hours or user has workaround
└─ No data/security risk

Response:
├─ Technical lead handles, no full team
├─ Manager notified (log in system)
├─ No customer notification required
├─ Standard support process
└─ Ticket opened for future fix
```

### 4.2 Incident Examples

**Example 1: Severity 1 (Critical)**
```
Incident: Supabase database connectivity lost
├─ Time: 2026-05-22 10:00 UTC
├─ Detection: Monitoring alert (all API requests failing)
├─ Scope: ALL customers unable to access GL, invoices, bank
├─ Estimated impact: 100+ customers
├─ Potential cause: Supabase region outage or network failure
├─ RTO exceeded?: Likely if outage >4 hours
└─ Classification: SEVERITY 1
```

**Example 2: Severity 2 (High)**
```
Incident: Invoice printing feature broken
├─ Time: 2026-05-22 14:30 UTC
├─ Detection: Customer support ticket (cannot print invoice)
├─ Scope: ALL invoices cannot be printed (search result)
├─ Estimated impact: 10% of customers (print invoices regularly)
├─ Potential cause: PDF generation service failing
├─ Workaround: Export to PDF, manually edit
├─ RTO: 2-3 hours
└─ Classification: SEVERITY 2
```

**Example 3: Severity 3 (Medium)**
```
Incident: Dashboard slow loading
├─ Time: 2026-05-22 16:00 UTC
├─ Detection: Customer complaint (dashboard takes 30 seconds to load)
├─ Scope: Reporting dashboard only
├─ Estimated impact: 5% of customers use dashboard
├─ Potential cause: Database query timeout
├─ Workaround: Use export functionality instead
├─ RTO: 4-8 hours
└─ Classification: SEVERITY 3
```

---

## 5. RESPONSE PROCEDURES

### 5.1 Detection & Alerting

**How incidents are detected:**

```
Automated Monitoring:
├─ API response time: Alert if >5 seconds (99th percentile)
├─ Database CPU: Alert if >80% for >5 minutes
├─ Disk space: Alert if <10% free
├─ Failed requests: Alert if error rate >1%
├─ SSL certificate: Alert if <30 days to expiry
└─ Backup status: Alert if backup fails or is overdue

Manual Detection:
├─ Customer support tickets (complaints)
├─ Audit trail logs (unusual activity)
├─ Performance dashboards (visual inspection)
└─ Third-party status services (Supabase, Vercel)

Alert Routing:
├─ Automated: PagerDuty → On-call engineer
├─ Manual: Support ticket → Queue for IC review
└─ Escalation: No response in 15 min → Escalate to backup
```

### 5.2 Initial Response (First 30 Minutes)

**Immediate Actions:**

```
T+0min (Detection)
├─ [ ] Monitoring alert received (automated)
├─ [ ] On-call engineer checks alert dashboard
├─ [ ] Determine incident severity
└─ [ ] Decision: Page full team (if Severity 1) or handle individually

T+5min (Assessment)
├─ [ ] Ping production environment (verify outage)
├─ [ ] Check service status dashboards
├─ [ ] Review error logs for root cause hints
├─ [ ] Determine: Customer-facing or internal?
└─ [ ] Activate full team if Severity 1

T+10min (Initial Triage)
├─ [ ] Open incident in issue tracker
├─ [ ] Assign incident number (e.g., INC-2026-0512-001)
├─ [ ] Create Slack channel: #incident-2026-0512-001
├─ [ ] Post initial assessment: "GL database unreachable, investigating"
├─ [ ] Set SLA timer (based on severity level)
└─ [ ] Notify IC: "Incident #X, estimated Severity #Y"

T+15min (IC Assessment)
├─ [ ] IC takes command: "I am incident commander"
├─ [ ] Assess situation: What's broken? How many users affected?
├─ [ ] Determine initial cause: Infrastructure, code, or external?
├─ [ ] Classify severity: Is this Severity 1 or 2?
├─ [ ] Activate team members:
│  ├─ [ ] Severity 1: Activate all 5 team members
│  └─ [ ] Severity 2: Activate IC + 2-3 relevant members
├─ [ ] Notify Communications Manager: "Prepare customer notification"
└─ [ ] Set recovery target: GL restored in X hours

T+30min (Status Report)
├─ [ ] First status update at T+30min:
│  ├─ What happened: "Supabase region experienced network failure"
│  ├─ Who's affected: "100% of customers, GL module completely down"
│  ├─ What we're doing: "Failing over to backup region"
│  ├─ What's the timeline: "Full restoration expected in 2 hours"
│  └─ Next update: "Status update every 30 minutes"
├─ [ ] Post to Slack channel
├─ [ ] Communications: Send initial notice to customers (if applicable)
└─ [ ] Document timeline (for post-incident report)
```

### 5.3 Ongoing Response (30 Minutes - 4 Hours)

**Sustained Response Procedures:**

```
Every 30 minutes (or at key milestones):
├─ [ ] Status meeting (Slack #incident channel)
├─ [ ] Update: What's been done? What's next?
├─ [ ] Obstacles: What's blocking progress?
├─ [ ] Revised ETA: When will we be back up?
├─ [ ] Customer communications: What should we tell them?
└─ [ ] Post status update (Slack + customer-facing)

Parallel tracks:

RESTORATION TRACK (DBA + Tech Lead):
├─ [ ] Diagnose root cause
├─ [ ] Determine recovery strategy:
│  ├─ Option 1: Restart service (fastest, if reboot will fix)
│  ├─ Option 2: Fail over to backup (if primary broken)
│  └─ Option 3: Restore from backup (if data corruption)
├─ [ ] Validate approach with IC
├─ [ ] Execute recovery steps
├─ [ ] Test: GL database accessible? Data intact?
├─ [ ] Restore dependent systems (invoices, then bank)
└─ [ ] Final verification: Production ready?

INVESTIGATION TRACK (Security Officer):
├─ [ ] Collect evidence (logs, configs, access history)
├─ [ ] Determine root cause: Was this a failure or attack?
├─ [ ] Timeline: When did it start? When first noticed?
├─ [ ] Scope: How much data affected? Any security breach?
├─ [ ] Preliminary findings: What went wrong?
└─ [ ] Recommendations: How to prevent recurrence?

COMMUNICATION TRACK (Comms Manager):
├─ [ ] Draft customer notification
├─ [ ] Prepare status page updates
├─ [ ] Monitor social media (no panic, misinformation)
├─ [ ] Prepare for media inquiry (if major incident)
├─ [ ] Create talking points for support team
├─ [ ] Prepare post-incident communication plan
└─ [ ] Schedule customer webinar (if incident is significant)
```

### 5.4 Resolution & Closure (4+ Hours)

**Final Steps:**

```
RESOLUTION (When service restored)
├─ [ ] Full system back online: GL, Invoices, Bank accessible
├─ [ ] Verify all customer data intact
├─ [ ] Final status update: "System restored, monitoring closely"
├─ [ ] Transition to "post-incident" mode
└─ [ ] Thank team members publicly

POST-INCIDENT (Within 24 hours)
├─ [ ] Incident report drafted:
│  ├─ Timeline of events
│  ├─ Root cause analysis
│  ├─ Impact summary (duration, customers affected)
│  └─ Preventive measures taken
├─ [ ] Post-incident review meeting (team + leadership)
├─ [ ] Customer communication: Post-mortem + apology (if applicable)
├─ [ ] Close incident ticket
└─ [ ] Schedule follow-up: "Implementation of preventive measures"

ACTION ITEMS (Within 1-7 days)
├─ [ ] Implement quick fixes (temporary mitigations)
├─ [ ] Schedule engineering work (permanent fixes)
├─ [ ] Process improvements (how to prevent next time)
├─ [ ] Update runbooks (how to handle this incident faster)
└─ [ ] Communication: Final update to customers
```

---

## 6. BUSINESS CONTINUITY & DISASTER RECOVERY

### 6.1 Disaster Recovery Architecture

**Redundancy & Failover:**

```
PRODUCTION (Primary)
├─ Database: Supabase (Ireland region)
├─ App servers: Vercel (global CDN)
├─ Monitoring: Datadog (US region)
└─ Health: OPERATIONAL (99.5% uptime target)

BACKUP #1 (Synchronous Replication)
├─ Database: Supabase (Paris region)
├─ Replication: Real-time (within 1 second)
├─ Failover: Automatic (if Ireland fails)
├─ RTO: <5 minutes (DNS failover)
└─ Status: PASSIVE (standby, ready to activate)

BACKUP #2 (Daily Snapshot)
├─ Database: Backup copy (Frankfurt)
├─ Replication: Daily (24-hour lag)
├─ Restore: Manual restore operation
├─ RTO: 4 hours (from backup)
└─ Status: ARCHIVAL (long-term retention)

FAILOVER DECISION TREE:
└─ Is primary region unavailable?
   ├─ YES → Automatic failover to Paris (Backup #1)
   │  ├─ Database DNS redirected (automated)
   │  └─ Expected RTO: <5 minutes
   │
   └─ Is both primary + Backup #1 down?
      ├─ YES → Manual restore from Frankfurt (Backup #2)
      │  ├─ Restore from daily snapshot
      │  ├─ RTO: 4 hours
      │  └─ RPO: <24 hours data loss
      │
      └─ Is all regions down?
         ├─ YES → MAJOR DISASTER (activate crisis plan)
         │  ├─ Unlikely (would require AWS global failure)
         │  └─ RTO: 12+ hours (notify customers immediately)
```

### 6.2 Data Backup & Recovery

**Backup Strategy:**

```
Continuous Backups (Every 15 minutes)
├─ Technology: Supabase automated snapshots
├─ Retention: 90 days rolling
├─ Location: EU region (Ireland + Paris)
├─ Encryption: AES-256 (same as production)
├─ RPO: 15 minutes (max data loss)
├─ RTO: 4 hours (restore from snapshot)
└─ Use case: Daily operational backups

Weekly Backups (Every Sunday at 02:00 UTC)
├─ Technology: Full database export (compressed)
├─ Retention: 12 weeks rolling
├─ Location: EU region + cloud storage backup
├─ Size: ~500 MB (compressed)
├─ RPO: 7 days (max data loss if using)
├─ RTO: 6 hours (restore from export)
└─ Use case: Longer-term retention, compliance

Monthly Backups (1st of each month at 03:00 UTC)
├─ Technology: Full export + archival to cold storage
├─ Retention: 7 years (per MRA requirements)
├─ Location: Secure external storage
├─ Verification: Monthly restore test
├─ RPO: 30 days (max data loss)
├─ RTO: 12 hours (restore from archive)
└─ Use case: Long-term retention, audit requirements

Test Restores:
├─ Monthly: Restore latest backup to test environment
├─ Verify: All GL entries present & correct
├─ Verify: Invoices, bank, payroll data intact
├─ Document: Test results & any issues
├─ Fix: Any issues preventing successful restore
└─ Certificate: Signed by DBA + IC
```

### 6.3 Geographic Redundancy

**Multi-Region Deployment:**

```
Ireland (Primary)
├─ Database: Supabase PostgreSQL
├─ App server: Vercel (EU region)
├─ Data center: AWS eu-west-1
├─ Latency: Optimal for Mauritius (test: <100ms)
└─ Status: ACTIVE (serving customers)

Paris (Backup Database)
├─ Database: Supabase failover replica
├─ Replication: Real-time synchronous
├─ Data center: AWS eu-west-1 (different AZ)
├─ Failover: Automatic if Ireland fails
└─ Status: WARM STANDBY (ready to activate)

Frankfurt (Archive Backup)
├─ Database: Daily backup snapshot
├─ Storage: AWS S3 (versioned, immutable)
├─ Retention: 7 years (MRA requirement)
├─ Access: Manual restore only
└─ Status: COLD ARCHIVE (long-term)

Why Geo-Redundancy?
├─ Natural disaster: Earthquake in Ireland doesn't affect Paris
├─ Regional failure: AWS eu-west-1 failure, Paris stays active
├─ Network issues: Mauritius→Paris latency tested
├─ Compliance: Data stays in EU (GDPR requirement)
└─ Regulatory: Multi-region satisfies audit requirements
```

---

## 7. TESTING & DRILLS

### 7.1 Quarterly Disaster Recovery Tests

**Mandatory Testing:**

```
Q1 (January) - Database Restore Test
├─ Objective: Verify we can restore from backup in 4 hours
├─ Procedure:
│  ├─ Spin up test environment
│  ├─ Restore from latest backup
│  ├─ Verify all GL entries present
│  ├─ Verify referential integrity
│  ├─ Verify audit trail completeness
│  └─ Document time required
├─ Success criteria: Full restore within 4 hours
├─ Owner: DBA + DevOps
└─ Evidence: Test report + signed-off

Q2 (April) - Failover Test
├─ Objective: Verify automatic failover to Paris works
├─ Procedure:
│  ├─ Simulate Ireland region failure
│  ├─ Verify automatic failover triggers
│  ├─ Verify DNS redirects to Paris
│  ├─ Verify customer requests succeed (no errors)
│  ├─ Measure RTO (time to failover)
│  └─ Verify data integrity post-failover
├─ Success criteria: Automatic failover within 5 minutes
├─ Owner: DevOps + Infrastructure
└─ Evidence: Test results + monitoring logs

Q3 (July) - Incident Response Drill
├─ Objective: Verify incident response team can mobilize & respond
├─ Procedure:
│  ├─ Simulate unscheduled GL outage
│  ├─ Activate incident response team (unannounced)
│  ├─ Measure response time (T+15 min IC activated?)
│  ├─ Test communication procedures (Slack, customer notification)
│  ├─ Verify status updates sent on schedule
│  ├─ Test escalation path (if primary unavailable)
│  └─ Conduct post-drill retrospective
├─ Success criteria: Full team activated within 30 minutes
├─ Owner: Incident Commander + Communications
└─ Evidence: Drill report + timeline documentation

Q4 (October) - Full System Recovery Test
├─ Objective: End-to-end recovery from complete outage
├─ Procedure:
│  ├─ Simulate total production failure
│  ├─ Recover from monthly archive backup (oldest)
│  ├─ Restore to test environment
│  ├─ Verify GL, invoices, bank, payroll all restored
│  ├─ Test customer login & data access
│  ├─ Verify audit trail complete & immutable
│  └─ Document full timeline
├─ Success criteria: Full recovery within 12 hours
├─ Owner: All team members (cross-training)
└─ Evidence: Comprehensive test report
```

### 7.2 Annual Tabletop Exercise

**Comprehensive Scenario:**

```
Tabletop Exercise (Q4, December)
├─ Scenario: Ransomware attack on production database
│  ├─ Attack type: Encryption + extortion demand
│  ├─ Scope: All GL entries encrypted, system down
│  ├─ Data: Attacker demands 1 BTC ransom
│  └─ Timeline: Discovered at 14:00 UTC on Friday
│
├─ Participants:
│  ├─ Incident Commander (leads discussion)
│  ├─ Security Officer (response decisions)
│  ├─ DBA (recovery decisions)
│  ├─ Finance (SLA impact, ransom decision)
│  ├─ Legal (breach notification, law enforcement)
│  ├─ Communications (customer notification)
│  └─ Board representative (strategic decisions)
│
├─ Discussion points:
│  ├─ "Do we pay the ransom?" (Legal, Finance decide)
│  ├─ "What's our recovery timeline?" (DBA estimates)
│  ├─ "Who do we notify?" (Legal, Communications plan)
│  ├─ "Is this a reportable breach?" (Security, Legal assess)
│  ├─ "What's the customer impact?" (Sales + Support impact)
│  ├─ "How long can we operate without GL?" (Operations assess)
│  └─ "What changes do we make?" (Process improvements)
│
├─ Learning objectives:
│  ├─ Identify decision points (when do we act?)
│  ├─ Clarify decision authority (who decides?)
│  ├─ Test team communication (is everyone aligned?)
│  ├─ Find gaps (what procedures are missing?)
│  └─ Improve processes (based on findings)
│
├─ Post-exercise:
│  ├─ Prepare action items (fix identified gaps)
│  ├─ Update procedures (based on discussions)
│  ├─ Schedule follow-up review (3 months)
│  └─ Report to Board (lessons learned)
└─ Next exercise: December 2027 (annual)
```

---

## 8. COMMUNICATION PLAN

### 8.1 Incident Communication Steps

**Tiered Communication Approach:**

```
TIER 1: Internal Team (Immediately)
├─ Channel: Slack #incident-[ID]
├─ Message: "Incident detected, cause investigating"
├─ Audience: All technical staff
├─ Update frequency: Every 15-30 minutes
└─ Tone: Professional, matter-of-fact

TIER 2: Leadership (Within 15 minutes)
├─ Channel: Email + phone call
├─ Message: "Severity 1 incident: GL unavailable. Activating team."
├─ Audience: CEO, CFO, Board (if Severity 1)
├─ Update frequency: Hourly
└─ Tone: Urgent, status-focused

TIER 3: Affected Customers (Within 30 minutes)
├─ Channel: Email + Dashboard banner
├─ Message: "We're experiencing technical issues. We're working to restore service."
├─ Audience: All customers (if Severity 1) or affected customers
├─ Update frequency: Every 30-60 minutes
└─ Tone: Reassuring, transparent, professional

TIER 4: Public Communication (Within 1 hour)
├─ Channel: Status page (status.lexora.mu)
├─ Message: Detailed technical status & timeline
├─ Audience: General public + customers
├─ Update frequency: Every 30-60 minutes
└─ Tone: Transparent, technical

TIER 5: Media (If major incident)
├─ Channel: Press release (if incident is newsworthy)
├─ Message: Honest statement + remediation plan
├─ Audience: Press, industry analysts
├─ Timing: 24-48 hours after resolution
└─ Tone: Accountable, forward-focused
```

### 8.2 Customer Notification Templates

**Template 1: Initial Notification (Severity 1)**

```
Subject: URGENT: Lexora Service Disruption

Dear [Customer Name],

We're writing to inform you that Lexora experienced an unexpected service disruption at approximately [time] UTC.

WHAT HAPPENED:
[Brief description: "Our database provider experienced a regional outage"]

IMPACT:
[Clear statement of impact: "You are unable to access GL entries, invoices, and bank reconciliation"]

WHAT WE'RE DOING:
[Specific actions: "We are failing over to our backup database in Paris region, estimated to take 2 hours"]

TIMELINE:
[Realistic estimate: "We expect to restore service by [time]. We'll provide hourly updates."]

NEXT STEPS:
[How to stay informed: "Check our status page at status.lexora.mu for real-time updates"]

APOLOGY:
[We understand the urgency of your accounting operations and sincerely apologize for this disruption]

[Incident Reference: #INC-2026-0522-001]

Best regards,
Lexora Team
```

**Template 2: Hourly Update**

```
Subject: UPDATE: Lexora Incident #[ID] - [Time Since Outage]

STATUS: ONGOING RESTORATION
├─ Root cause: Paris database connectivity restored, restoring from backup
├─ Progress: 45% complete (restoring GL entries)
├─ Estimated completion: 45 minutes
└─ Next update: In 30 minutes

CUSTOMER IMPACT:
├─ GL entries: Restoring now
├─ Invoices: Expected within 30 minutes
├─ Bank: Expected within 45 minutes
└─ Payroll: Will be available after GL restored

ACTION REQUIRED: None. We'll notify you when service is restored.

[Incident Reference: #INC-2026-0522-001]
```

**Template 3: Resolution Notification**

```
Subject: RESOLVED: Lexora Incident #[ID]

INCIDENT RESOLVED
├─ Service: Fully restored as of [time]
├─ Duration: 2 hours 15 minutes
├─ Root cause: Supabase Ireland region network failure
└─ Data integrity: All GL entries verified & intact

POST-INCIDENT NOTES:
├─ We have enabled our backup failover (Paris region now primary)
├─ We will conduct full forensics & provide detailed root cause analysis
├─ We will schedule a call with you to discuss the incident

APOLOGY & COMPENSATION:
[Concrete offer: "We are crediting 1 month of service fees to your account as a gesture of good faith"]

NEXT STEPS:
├─ Full forensic report: Within 48 hours
├─ Post-incident webinar: Invitation coming tomorrow
├─ Follow-up call: Your account manager will schedule

Thank you for your patience during this incident.

[Incident Reference: #INC-2026-0522-001]
```

---

## 9. RECOVERY PROCEDURES

### 9.1 Step-by-Step GL Recovery

**Detailed GL Restoration Process:**

```
STEP 1: VERIFY BACKUP INTEGRITY (Time: 0-15 min)
├─ [ ] Identify latest clean backup point (before corruption)
├─ [ ] Verify backup file is not corrupted (checksum test)
├─ [ ] Verify backup can be read (test decompress)
├─ [ ] Verify backup contains GL data (sample queries)
├─ [ ] Document backup details:
│  ├─ Date/time of backup
│  ├─ Number of GL entries
│  ├─ Latest entry timestamp
│  └─ Any known issues from that time?
└─ Decision: Safe to restore this backup?

STEP 2: PREPARE TEST ENVIRONMENT (Time: 15-45 min)
├─ [ ] Spin up new test database instance (separate from production)
├─ [ ] Restore backup to test environment
├─ [ ] Verify database is accessible
├─ [ ] Run basic GL queries:
│  ├─ SELECT COUNT(*) FROM ecritures_comptables_v2; (should match count)
│  ├─ SELECT SUM(montant_debit), SUM(montant_credit); (must be equal)
│  ├─ SELECT MAX(created_at) FROM ecritures_comptables_v2; (latest entry time)
│  └─ Check for any errors or warnings
├─ [ ] Verify referential integrity:
│  ├─ All GL entries have valid customer (societe_id)?
│  ├─ All GL entries linked to valid journals?
│  ├─ All GL entries have valid accounts (chart of accounts)?
│  └─ Any orphaned records?
├─ [ ] Spot-check sample GL entries:
│  ├─ Pick 10 random GL entries
│  ├─ Verify debit/credit balance for each
│  ├─ Verify amounts are reasonable (no obvious corruptions)
│  └─ Document findings
└─ Result: Is test environment safe to use?

STEP 3: VALIDATE DATA COMPLETENESS (Time: 45-90 min)
├─ [ ] Compare test environment to customer records:
│  ├─ "How many GL entries as of [date]?" (verify count matches)
│  ├─ "What's the latest GL entry?" (verify timestamp matches)
│  ├─ "What's the highest GL amount?" (verify no corruptions)
│  └─ "Run trial balance in test environment" (must equal customer records)
├─ [ ] Validate invoice-to-GL mapping:
│  ├─ Sample 5 invoices, verify corresponding GL entries exist
│  ├─ Verify amounts match
│  └─ Verify GL posting dates are consistent
├─ [ ] Validate payroll GL posting:
│  ├─ Sample latest 2 months of salary
│  ├─ Verify GL entries for 6200 (salaries), 4420 (PAYE), etc.
│  └─ Verify amounts match payroll records
├─ [ ] Audit trail check:
│  ├─ Verify created_by, created_at filled for all entries
│  ├─ Verify updated_at filled for modified entries
│  └─ Verify audit_logs table is complete (if exists)
└─ Decision: Is data complete & accurate?

STEP 4: FAILOVER TO RESTORED DATABASE (Time: 90-120 min)
├─ [ ] Pre-failover checks:
│  ├─ [ ] Notify customers: "Switching to restored database in 5 minutes"
│  ├─ [ ] Stop all API requests (briefly)
│  ├─ [ ] Verify no pending transactions
│  └─ [ ] Take final snapshot of corrupted DB (for forensics)
├─ [ ] Perform failover:
│  ├─ [ ] Update database connection string (point to restored DB)
│  ├─ [ ] Update backup routing (in case of cascade failure)
│  ├─ [ ] Restart API servers (to pick up new connection)
│  ├─ [ ] Verify connectivity (test API calls)
│  └─ [ ] Monitor for errors (first 5 minutes)
├─ [ ] Post-failover validation:
│  ├─ [ ] API responding with 200 OK?
│  ├─ [ ] GL queries returning data?
│  ├─ [ ] Customers reporting successful logins?
│  └─ [ ] Monitor error logs (for new issues)
└─ Result: Is restored database in production?

STEP 5: RESTORE DEPENDENT SYSTEMS (Time: 120-240 min)
├─ [ ] Restore Invoicing Module:
│  ├─ Verify invoice GL links are correct
│  ├─ Verify invoice amounts match GL entries
│  └─ Re-enable invoicing features
├─ [ ] Restore Bank Module:
│  ├─ Re-import latest bank statements
│  ├─ Re-match transactions to GL (automatic)
│  └─ Re-enable bank reconciliation features
├─ [ ] Restore Payroll Module:
│  ├─ Verify employee GL postings
│  ├─ Re-enable payroll processing
│  └─ Verify MRA filings still valid
├─ [ ] Restore Reporting:
│  ├─ Regenerate all dashboard views
│  ├─ Verify P&L, Balance Sheet, Cash Flow reports
│  └─ Re-enable report exports
└─ Completion: All systems restored?

STEP 6: FINAL VERIFICATION (Time: 240-300 min)
├─ [ ] Customer testing:
│  ├─ Invite 2-3 customers to test system
│  ├─ Have them perform routine tasks (GL entry, invoice)
│  ├─ Verify no errors or data inconsistencies
│  └─ Get sign-off: "System looks good"
├─ [ ] Auditor verification:
│  ├─ Notify auditors of restoration
│  ├─ Provide pre-incident state (what was working)
│  ├─ Provide post-incident state (what was restored)
│  ├─ Provide forensic details (root cause analysis)
│  └─ Offer access to test environment (for detailed verification)
├─ [ ] Final documentation:
│  ├─ Record total recovery time: __ hours __ minutes
│  ├─ Document data loss (if any): __ minutes of lost data
│  ├─ Document any unresolved issues
│  └─ Create detailed recovery report
└─ Sign-off: Incident recovery complete?
```

---

## DOCUMENT CONTROL

**Version History:**

| Version | Date | Changes | Approver |
|---|---|---|---|
| 1.0 | 2026-05-22 | Initial document | Chief Technology Officer |

**Approval:**

- [ ] Lexora Board
- [ ] Chief Information Security Officer
- [ ] Big 4 Audit Firm

**Next Review**: May 22, 2027 (or upon major system changes)

**Testing Schedule:**
- Q1 2026: Database Restore Test (January 15)
- Q2 2026: Failover Test (April 15)
- Q3 2026: Incident Response Drill (July 15)
- Q4 2026: Full Recovery Test (October 15)
- Annual: Tabletop Exercise (December)

---

**END OF INCIDENT RESPONSE & BUSINESS CONTINUITY PLAN**

*For emergencies, contact: [On-call number to be established]*  
*For compliance questions: compliance@lexora.mu*
