# FYNX API terms — DRAFT FOR REVIEW

**Not published terms. Not effective.** Version: 2026-09-22. Complete bracketed fields and obtain legal/owner review before presenting these terms for acceptance. This draft covers the API service; it does not replace a FYNX Funded challenge agreement.

## 1. Parties and service

These terms would govern the API service provided by **FYNX LLC — Boise, Idaho, USA; [business mailing address to confirm]** (“FYNX”) to the person or business accepting them (“Customer”), effective **[date]**. The accepting person must have authority to bind Customer and meet applicable legal capacity requirements. Service and privacy contact: fynxteam5@gmail.com, confirmed by the owner for API support and privacy requests.

FYNX API provides Risk calculations and a Prop Firm Rules service that evaluates submitted events against a selected rule set. The current service is a developer beta. It does not supply live market data, execute trades, hold trading funds, guarantee a broker's specifications, grant funded accounts or authorize payouts. Customer must independently verify inputs and suitability for its use. Outputs are calculations and rule evaluations, not personalized investment advice.

## 2. Access and credentials

Customer is responsible for its workspace, authorized users, data submissions and use of API keys. Keep keys confidential, store them on secure servers where appropriate, and promptly revoke exposed keys. Test and live environments are separate. Do not share keys publicly, bypass limits or use another customer's account or data. Customer should report suspected unauthorized access through support.

FYNX may suspend affected access where reasonably necessary to address credential compromise, abuse, unlawful use or a material breach. FYNX will provide notice where practical and legally permitted, and a route to resolve the issue. The account termination, export and deletion process is **[insert reviewed process and notice periods]**.

## 3. Customer data and output limitations

Customer retains its rights in submitted data and grants FYNX permission to process it to provide, secure and support the service. Customer must have the rights and lawful basis to submit the data, provide required notices to its users and minimize personal information in account names, event identifiers and support messages. Do not submit passwords, API secrets, payment-card details, identity documents or unnecessary sensitive personal data through calculation/event fields.

Rule results depend on complete, correctly ordered events, costs, equity marks and reset snapshots. Missing data may hide breaches. An `eligible` result is not a guarantee of compliance with a broker or challenge agreement. Customer must validate the applicable rule version and independently review decisions that affect traders. Corrections and disputes must preserve a reviewable audit trail.

Customer may use permitted outputs in its own applications subject to these terms. FYNX retains rights in its software, documentation and branding; no ownership of Customer data is transferred.

## 4. Usage and proposed billing schedule

The current free allowance is 1,000 successful operations per environment per UTC calendar month, combined across both APIs, with a 10-request-per-second limit. Failed authentication/validation, throttled requests and duplicate idempotent replays do not consume billable operations. Lower customer-set caps may apply. Calls stop at the applicable cap; there are no automatic paid overages.

Pro remains a waitlist. Joining does not subscribe Customer or authorize a charge. Proposed Pro terms are $49 USD per month, 50,000 live operations per UTC calendar month and 30 requests per second; test usage retains its separate free allowance. Subscription renewal dates and UTC usage reset dates may differ. Before paid activation, checkout must disclose the recurring amount, applicable taxes, billing interval, cancellation procedure and **[approved refund policy]**, and record the required consent. No paid service begins merely because this draft exists.

Proposed cancellation is at the end of the current paid period through the billing portal, with access continuing through that period unless suspension is otherwise justified. **[Confirm cancellation availability, notice, refunds, statutory withdrawal rights, failed-payment handling, tax treatment and price-change notice with counsel.]** Mandatory consumer rights are not excluded by this draft.

## 5. Service changes and support

The beta has no contractual uptime SLA. Support is through the workspace and the confirmed support address; response times are not guaranteed unless separately agreed. Customer should handle timeouts, errors and quotas, use idempotent retries where documented, and retain its own source records. FYNX will identify API/rule versions; **[approve change/deprecation notice policy]** before promising a notice period. Existing accepted account rules must not be silently overwritten by a new proposal.

## 6. Liability and dispute provisions to review

Except for rights that cannot lawfully be excluded, the beta would be supplied without a guarantee that it is uninterrupted or suitable for every trading workflow. Any limitation of liability, consequential-loss exclusion, indemnity, warranty exclusions, dispute process or governing-law clause must be drafted for the confirmed operator and customer markets. **[Insert counsel-approved clauses, liability cap and exceptions; governing law; courts; complaint process.]** No arbitration or class-action waiver is assumed.

## 7. Privacy and acceptance

The reviewed API Privacy Notice and, where applicable, a signed data-processing addendum form part of the service documentation. **[Insert final document URLs and version IDs.]** Before launch, implement a clear terms acceptance action and retain the accepted version and timestamp. A website visit or API key creation alone is not represented here as verified acceptance of these draft terms.
