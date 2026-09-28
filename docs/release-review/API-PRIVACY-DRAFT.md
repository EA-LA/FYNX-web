# FYNX API privacy notice — DRAFT FOR REVIEW

**Not published. Not effective.** Prepared 2026-09-22 from API source and the existing operations record. Bracketed facts and legal grounds require confirmation. Do not copy this into the public privacy page until the processing inventory and retention procedures are approved.

## Operator and scope

**[Legal entity and address]** is responsible for the FYNX API workspace account and service-administration data described here. Privacy contact: **[confirm support@fynxfunded.com or designate a privacy contact]**. **[Identify representative/data protection officer if required.]**

For trader/account data submitted by a business customer, roles depend on the agreement and actual use: Customer may be the controller and FYNX a processor. A separate data-processing agreement is required where applicable. This API notice does not describe every activity of FYNX Funded, its challenge purchases or identity-verification vendors.

## Data and purposes

| Category | Observed API processing | Purpose |
| --- | --- | --- |
| Account | Firebase user ID, email, verification status and workspace/display name | Authentication, workspace administration and support |
| API credentials | Key digest, label, environment, creation/revocation metadata; raw new key returned at creation | Authenticate and manage access |
| Calculations and rule accounts | Submitted calculation data, rule configuration, account labels, event IDs/timestamps/P&L/exposure, result state and event audit chain | Perform calculations and maintain submitted-event rule histories |
| Usage and security | Request route, status, time, error details, usage totals, limits, key/settings audit and operational telemetry | Enforce limits, investigate failures and protect the service |
| Support | Email, subject, message and ticket status | Respond to requests and investigate issues |
| Billing | Waitlist status/date; when used, Stripe customer/subscription references, plan state and invoice information | Manage waitlist and subscriptions; payment details are handled through Stripe |

Rule event history retains submitted event payloads and results. Error messages and customer-entered labels may also contain personal data. Avoid unnecessary personal identifiers and secrets in these fields. Hosting/authentication/payment providers may process network and device information under their own service arrangements; **[verify provider logs, analytics/cookies and exact data categories before publication]**.

## Legal basis and recipients

**[Confirm applicable law and the basis for each purpose.]** Where the GDPR applies, assess contract necessity for individual account/service delivery, documented legitimate interests for proportionate security and business contacts, legal obligations for required records, and consent where required for optional marketing or tracking. This is a proposed basis assessment, not a claim that consent has been collected. The API does not need blanket marketing consent to calculate a result.

Observed service providers include Google/Firebase for authentication and backend storage, Stripe for billing, and the website hosting/delivery providers identified in the deployment inventory (GitHub Pages/Cloudflare for Finance World and Vercel where used). **[Confirm contracting entities, subprocessor scope, support/email providers, locations and current agreements.]** Share data only as needed for service delivery, authorized support, valid legal requirements or a reviewed business transfer. **[Confirm any advertising, sale/sharing or secondary-use practices across the whole site before making a categorical statement.]**

## Storage, retention and international transfers

A complete implemented deletion schedule has not been verified. Before publication, approve retention periods or clear criteria for account records, events, request logs, support, security and billing records. Do not promise automatic deletion after a number of days without implementing and testing it.

The existing operations record describes seven-day point-in-time recovery, 28-day daily backups, 84-day weekly backups and a separately retained export. Backup expiration does not delete active primary data. Deletion requests need primary-data handling, backup expiry handling and a process to prevent restored data from reappearing after deletion. **[Verify current schedules and any legal holds before publishing exact periods.]**

**[Identify storage/processing regions and destinations, and applicable transfer mechanism such as an adequacy decision or contractual safeguards.]** Using the service is not treated in this draft as blanket consent to all international transfers.

## Choices, rights and security

Depending on applicable law, individuals may have rights to access, correct, delete or receive their data, object to or restrict certain processing, withdraw consent where used, and complain to the relevant supervisory authority. Send requests to the confirmed privacy contact; identity and authority must be verified proportionately. If Customer controls the submitted trader data, requests may need to be coordinated with Customer. **[Specify applicable regulator, response procedure, exceptions and deadlines after jurisdiction review.]**

The API uses authenticated access, workspace/environment isolation and key revocation. These controls do not guarantee absolute security. **[Approve incident assessment, customer notification and regulatory reporting procedures.]** This draft does not promise a specific notification time unsupported by the operational process.

**[Confirm age eligibility, automated decision disclosures, required/optional fields, marketing preferences, notice update procedure and effective date.]** The API calculates statuses from submitted data; production consequences and human review must be described by the actual operator/customer deploying that workflow.

## Review reference

For GDPR-covered processing, check notice content, retention principles, processor terms, security and transfers against [Regulation (EU) 2016/679](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng), particularly Articles 5, 13–14, 28, 32–34 and Chapter V. Applicability has not been determined for the unidentified operator and customer markets.
